import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { api } from '../services/api'

export default function SignalsPage({ clientId, clients = [], notify, refreshClients }) {
  const [alerts,setAlerts]=useState([])
  const [scope,setScope]=useState('all')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [page,setPage]=useState(1)
  const [selected,setSelected]=useState(null)
  const [tone,setTone]=useState('values-led')
  const [draft,setDraft]=useState(null)
  const pageSize=20

  const load=async()=>{setLoading(true);setError('');try{const data=await api.allAlerts();if(!Array.isArray(data))throw new Error('Alerts API returned an invalid response');setAlerts(data)}catch(e){setAlerts([]);setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  const visible=useMemo(()=>scope==='all'?alerts:alerts.filter(a=>a.client_id===clientId),[alerts,scope,clientId])
  const pageCount=Math.max(1,Math.ceil(visible.length/pageSize))
  const paged=visible.slice((page-1)*pageSize,page*pageSize)
  const clientName=id=>clients.find(c=>c.id===id)?.name||id||'Unknown client'
  const analyse=async()=>{setBusy(true);try{const r=scope==='all'?await api.runAllAnalysis():await api.runAnalysis(clientId);await load();await refreshClients();notify(scope==='all'?`${r.total_alerts_created} alerts created`:`${r.alerts_created} alerts created`)}catch(e){notify(e.message)}finally{setBusy(false)}}
  const update=async(id,status)=>{try{await api.updateAlert(id,status);await load();await refreshClients();notify(`Signal marked ${status}`)}catch(e){notify(e.message)}}
  const replace=async alert=>{try{const r=await api.replacement(alert.client_id,alert.holding);notify(r.buy?`${alert.holding} → ${r.buy}`:r.message)}catch(e){notify(e.message)}}
  const generate=async()=>{setBusy(true);try{setDraft(await api.generateMessage(selected.client_id,selected.id,tone))}catch(e){notify(e.message)}finally{setBusy(false)}}
  const approve=async()=>{try{await api.approveMessage(draft.id);setDraft({...draft,approved:true});notify('Message approved')}catch(e){notify(e.message)}}

  return <div className="page-wrap">
    <div className="page-intro"><div><span className="eyebrow">GLOBAL RELATIONSHIP INBOX</span><h2>Alerts and actions</h2><p>Review every client or focus analysis on the selected relationship.</p></div><div className="inbox-controls"><div className="scope-toggle"><button className={scope==='all'?'active':''} onClick={()=>{setScope('all');setPage(1)}}>All clients</button><button className={scope==='client'?'active':''} onClick={()=>{setScope('client');setPage(1)}}>Selected client</button></div><button className="primary-button" disabled={busy} onClick={analyse}><Icon name="spark"/>{busy?'Working…':scope==='all'?'Run full analysis':'Run client analysis'}</button></div></div>
    {loading&&<div className="loading-state">Loading relationship signals…</div>}
    {error&&<div className="inline-error"><Icon name="alert"/><div><strong>Signals could not be loaded</strong><span>{error}</span></div><button onClick={load}>Retry</button></div>}
    {!loading&&!error&&<><div className="inbox-summary"><span><b>{visible.length}</b> alerts in this view</span><small>Showing {visible.length?((page-1)*pageSize+1):0}–{Math.min(page*pageSize,visible.length)}</small></div><div className="signal-feed">{paged.map(a=><article className="alert-card" key={a.id}><span className={`alert-mark ${String(a.severity||'low').toLowerCase()}`}><Icon name="alert"/></span><div className="alert-copy"><div><b className={`severity ${String(a.severity||'low').toLowerCase()}`}>{a.severity||'Low'}</b><small>{clientName(a.client_id)} · {a.alert_type||'Signal'} · {a.holding||'Portfolio'}</small></div><h3>{a.news_headline||a.reason||'Relationship signal'}</h3><p>{a.reason||'No explanation supplied.'}</p><strong>Recommended: {a.recommended_action||'Review with the client'}</strong></div><div className="alert-actions vertical"><button onClick={()=>{setSelected(a);setDraft(null)}}>Generate draft</button><button onClick={()=>replace(a)}>Suggest replacement</button><button onClick={()=>update(a.id,'escalated')}>Escalate</button><button onClick={()=>update(a.id,'actioned')}>Actioned</button><button onClick={()=>update(a.id,'dismissed')}>Dismiss</button></div></article>)}{!visible.length&&<div className="empty-state"><Icon name="bell" size={28}/><h3>No alerts in this view</h3><p>Run analysis to scan current news against client portfolios.</p></div>}</div>{pageCount>1&&<div className="pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {pageCount}</span><button disabled={page===pageCount} onClick={()=>setPage(p=>p+1)}>Next</button></div>}</>}
    {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="message-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelected(null)}>×</button><span className="eyebrow">GENERATE CLIENT MESSAGE</span><h2>{clientName(selected.client_id)}</h2><p className="modal-context">{selected.holding} · {selected.news_headline||selected.alert_type}</p><label>Tone<select value={tone} onChange={e=>setTone(e.target.value)}><option value="values-led">Values-led</option><option value="analytical">Analytical</option><option value="concise">Concise</option><option value="detailed">Detailed</option></select></label>{!draft?<button className="primary-button modal-primary" disabled={busy} onClick={generate}><Icon name="spark"/>{busy?'Generating…':'Generate draft'}</button>:<><div className="draft-preview"><pre>{draft.content}</pre></div><div className="modal-actions"><span>Compliance footer included</span><button className="primary-button" disabled={draft.approved} onClick={approve}>{draft.approved?'Approved':'Approve message'}</button></div></>}</section></div>}
  </div>
}
