const severityValue = { high: 34, medium: 20, low: 9 }
const clamp = value => Math.max(0, Math.min(100, Math.round(value)))

export function rankNews(news, alerts) {
  return news.map(item => {
    const linked = alerts.filter(alert => alert.news_id === item.id || alert.news_headline === item.headline)
    const severity = severityValue[String(item.severity).toLowerCase()] || 10
    const clientImpact = Math.min(32, new Set(linked.map(a => a.client_id)).size * 11)
    const openImpact = Math.min(18, linked.filter(a => a.status === 'open').length * 3)
    const sentimentImpact = item.sentiment === 'negative' ? 12 : item.sentiment === 'positive' ? 8 : 4
    const score = clamp(severity + clientImpact + openImpact + sentimentImpact)
    const direction = item.sentiment === 'negative' ? 'Downside risk' : item.sentiment === 'positive' ? 'Positive catalyst' : 'Monitor'
    const prediction = item.sentiment === 'negative'
      ? `Likely to increase client concern and trigger a portfolio-alignment review in ${item.theme || 'the affected sector'}.`
      : item.sentiment === 'positive'
        ? `May create a timely outreach opportunity and support increased conviction in aligned holdings.`
        : `Material impact is uncertain; monitor for confirmation before contacting clients.`
    return {...item, score, linkedClients:new Set(linked.map(a=>a.client_id)).size, direction, prediction, confidence:clamp(52+severity*.8+clientImpact*.5)}
  }).sort((a,b)=>b.score-a.score)
}

export function prioritizeClients(clients, alerts) {
  return clients.map(client => {
    const related = alerts.filter(a => a.client_id === client.id && a.status === 'open')
    const high = related.filter(a => String(a.severity).toLowerCase() === 'high').length
    const conflicts = related.filter(a => String(a.alert_type).toLowerCase().includes('conflict')).length
    const newsRelevance = Math.min(30, related.length * 3)
    const portfolioExposure = Math.min(25, new Set(related.map(a=>a.holding)).size * 4)
    const dnaConflict = Math.min(20, conflicts * 5)
    const relationshipRisk = Math.min(15, Math.log2((client.open_alerts || 0) + 1) * 3)
    const urgency = Math.min(10, high * 3)
    const priority = clamp(newsRelevance + portfolioExposure + dnaConflict + relationshipRisk + urgency)
    let mood = 'Reassured', moodTone = 'positive'
    if (high >= 2 || priority >= 75) { mood='Concerned';moodTone='negative' }
    else if (conflicts >= 2 || priority >= 50) { mood='Cautious';moodTone='warning' }
    else if (related.some(a=>a.alert_type==='Positive opportunity')) { mood='Interested';moodTone='positive' }
    return {...client, priority, mood, moodTone, relatedAlerts:related.length, highAlerts:high,
      reason:high?`${high} high-severity signal${high===1?'':'s'} require attention`:related.length?`${related.length} open signals need review`:'No urgent signals',
      action:priority>=70?'Contact today':priority>=40?'Review this week':'Monitor'}
  }).sort((a,b)=>b.priority-a.priority)
}
