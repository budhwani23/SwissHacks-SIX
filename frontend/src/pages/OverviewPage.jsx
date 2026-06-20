import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { api } from '../services/api'

export default function OverviewPage({ clients, navigate, setClientId, notify, refreshClients }) {
  const [alerts, setAlerts] = useState([])
  const [news, setNews] = useState([])
  const [analysing, setAnalysing] = useState(false)
  useEffect(() => { api.allAlerts().then(setAlerts).catch(()=>{}); api.news().then(setNews).catch(()=>{}) }, [])
  const high = alerts.filter(a => String(a.severity).toLowerCase() === 'high' && a.status === 'open')
  const runAll = async () => { setAnalysing(true); try { const result=await api.runAllAnalysis(); await refreshClients(); setAlerts(await api.allAlerts()); notify(`${result.total_alerts_created} new alerts created`) } catch(e) { notify(e.message) } finally { setAnalysing(false) } }
  return <div className="page-wrap">
    <section className="welcome"><div><span className="eyebrow">GOOD MORNING, ELENA</span><h2>Your relationship intelligence workspace</h2><p>See what changed, which clients need attention, and the next best action.</p></div><div className="welcome-actions"><button className="secondary-light" onClick={() => navigate('signals')}>Review signals</button><button className="primary-button" disabled={analysing} onClick={runAll}><Icon name="spark"/>{analysing?'Running analysis…':'Run analysis'}</button></div></section>
    <section className="metric-grid">
      <article className="metric-card"><span><Icon name="users"/></span><div><small>CLIENTS</small><strong>{clients.length}</strong><p>Active relationships</p></div></article>
      <article className="metric-card"><span><Icon name="bell"/></span><div><small>OPEN SIGNALS</small><strong>{alerts.filter(a=>a.status==='open').length}</strong><p>{high.length} need priority attention</p></div></article>
      <article className="metric-card"><span><Icon name="news"/></span><div><small>MARKET EVENTS</small><strong>{news.length}</strong><p>Connected to portfolio context</p></div></article>
      <article className="metric-card"><span><Icon name="compass"/></span><div><small>RELATIONSHIP GPS</small><strong>Live</strong><p>Frontend-derived health baselines</p></div></article>
    </section>
    <section className="dashboard-grid"><article className="card table-card"><div className="section-head"><div><span className="eyebrow">CLIENT BOOK</span><h3>Relationships at a glance</h3></div><button className="text-btn" onClick={()=>navigate('clients')}>View all <Icon name="arrow"/></button></div><div className="client-list">{clients.slice(0,5).map(c=><button key={c.id} onClick={()=>{setClientId(c.id);navigate('profile')}}><span className="avatar small">{c.name.slice(0,2).toUpperCase()}</span><div><strong>{c.name}</strong><small>{c.strategy || 'Private wealth'} · {c.open_alerts || 0} open signals</small></div><b className={`severity ${String(c.alert_label).toLowerCase()}`}>{c.alert_label || 'Clear'}</b><Icon name="arrow"/></button>)}</div></article><article className="card news-card"><div className="section-head"><div><span className="eyebrow">MARKET CONTEXT</span><h3>Latest intelligence</h3></div><button className="text-btn" onClick={()=>navigate('news')}>Open feed <Icon name="arrow"/></button></div>{news.slice(0,4).map((item,i)=><div className="news-row" key={item.id || i}><span className={`news-dot ${item.sentiment}`}/><div><strong>{item.headline}</strong><small>{item.company} · {item.severity} priority</small></div></div>)}{!news.length && <p className="empty-copy">No news events loaded yet.</p>}</article></section>
  </div>
}
