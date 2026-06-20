const clamp = value => Math.max(0, Math.min(100, Math.round(value)))

function stageFor(score) {
  if (score >= 90) return ['Expand relationship', '90–100']
  if (score >= 75) return ['Deepen relationship', '75–89']
  if (score >= 60) return ['Reconnect', '60–74']
  if (score >= 40) return ['Recover relationship', '40–59']
  return ['Retention crisis', '0–39']
}

function actionsFor(score) {
  const sets = score >= 90
    ? [['Open a family wealth conversation','Introduce succession and next-generation planning.'],['Share new investment ideas','Explore alternatives aligned with their values.'],['Broaden the relationship','Discuss family governance and education.']]
    : score >= 75
      ? [['Schedule a strategic review','Use current momentum to explore emerging goals.'],['Refresh Client DNA','Reconfirm preferences and life changes.'],['Review portfolio fit','Connect holdings to stated priorities.']]
      : score >= 60
        ? [['Schedule a listening-first call','Understand what changed before proposing solutions.'],['Send a personal check-in','Use the preferred communication style.'],['Refresh Client DNA','Reconfirm goals and priorities.']]
        : [['Arrange an urgent review','Address unresolved signals and concerns.'],['Involve a senior RM','Add senior coverage to the recovery plan.'],['Complete a portfolio review','Resolve alignment and suitability issues.']]
  return sets.map(([title,text], i) => ({ title, text, tag: i ? 'Next' : 'Recommended', type: i ? '' : 'primary' }))
}

export function buildRelationshipProfile(summary, workspace = {}) {
  const portfolio = workspace.portfolio || { holdings: [], total_value_chf: 0 }
  const alerts = workspace.alerts || []
  const messages = workspace.messages || []
  const holdings = portfolio.holdings || []
  const open = alerts.filter(a => a.status === 'open')
  const high = open.filter(a => String(a.severity).toLowerCase() === 'high')
  const engagement = clamp(58 + Math.min(messages.length, 4) * 7 + Math.min(alerts.filter(a => a.status === 'actioned').length, 3) * 5)
  const activity = clamp(72 - open.length * 4 + messages.length * 4)
  const total = holdings.reduce((sum, h) => sum + (h.current_value_chf || 0), 0)
  const alignment = total ? clamp(holdings.reduce((sum, h) => {
    const base = { Aligned: 94, Neutral: 76, Conflict: 28 }[h.cio_alignment] || 60
    return sum + base * (h.current_value_chf || 0)
  }, 0) / total) : 50
  const responsiveness = 50
  const sentiment = clamp(80 - high.length * 18 - (open.length - high.length) * 7)
  const score = clamp(engagement*.30 + activity*.25 + alignment*.20 + responsiveness*.15 + sentiment*.10)
  const [status, scoreRange] = stageFor(score)
  const positive = []
  if (alignment >= 75) positive.push(['Portfolio is well aligned', `${alignment}% CIO and mandate alignment`, '+'])
  if (messages.length) positive.push(['Proactive advisor outreach', `${messages.length} generated communication${messages.length === 1 ? '' : 's'}`, '+'])
  if (!positive.length) positive.push(['Client context connected', 'CRM and portfolio data are available', '+'])
  const risks = []
  if (high.length) risks.push(['High-priority signals', `${high.length} high-severity alert${high.length === 1 ? '' : 's'} open`, 'High'])
  if (holdings.some(h => h.cio_alignment === 'Conflict')) risks.push(['Portfolio conflict', 'A holding conflicts with CIO guidance', 'High'])
  risks.push(['Response telemetry unavailable', 'Email reply timing is not in the current API', 'Data'])
  const name = summary?.name || workspace.client?.name || 'Client'
  return {
    id: summary?.id, name, initials: name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase(),
    segment: `${workspace.client?.strategy || summary?.strategy || 'Wealth'} strategy`,
    aum: new Intl.NumberFormat('en-CH',{style:'currency',currency:'CHF',notation:'compact',maximumFractionDigits:1}).format(portfolio.total_value_chf || 0),
    lastContact: 'Not provided by API', score, previousScore: score, status, scoreRange, momentum: 'Baseline established', historyAvailable: false,
    summary: 'This frontend baseline combines the existing portfolio, alert and messaging APIs. Momentum activates when historical interaction data becomes available.',
    dimensions: [
      {label:'Engagement',value:engagement,weight:30,detail:`${messages.length} messages and ${alerts.length} tracked signals`},
      {label:'Relationship activity',value:activity,weight:25,detail:'Estimated from actions available in the current API'},
      {label:'Portfolio alignment',value:alignment,weight:20,detail:`CIO alignment across ${holdings.length} holdings`},
      {label:'Responsiveness',value:responsiveness,weight:15,detail:'Neutral baseline — response timestamps are unavailable'},
      {label:'Sentiment & signals',value:sentiment,weight:10,detail:`Based on ${open.length} open signals`},
    ],
    trend:Array(10).fill(score), positive, risks, actions:actionsFor(score),
  }
}
