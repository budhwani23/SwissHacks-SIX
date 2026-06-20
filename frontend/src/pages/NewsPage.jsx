import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { api } from '../services/api'

export default function NewsPage({ notify }) {
  const [items,setItems]=useState([]);const [companies,setCompanies]=useState('Roche,Nestlé,NVIDIA');const [busy,setBusy]=useState(false)
  const load=()=>api.news().then(setItems).catch(()=>setItems([]));useEffect(()=>{load()},[])
  const refresh=async live=>{setBusy(true);try{const r=await api.refreshNews(companies,live);load();notify(`${r.inserted} news events loaded`)}catch(e){notify(e.message)}finally{setBusy(false)}}
  return <div className="page-wrap"><div className="page-intro"><div><span className="eyebrow">EVENT REGISTRY + DEMO FEED</span><h2>News intelligence</h2><p>Refresh the events scanned against client portfolios and personal values.</p></div><div className="news-controls"><input value={companies} onChange={e=>setCompanies(e.target.value)} placeholder="Roche,Nestlé,NVIDIA"/><button className="outline" disabled={busy} onClick={()=>refresh(false)}>Load mock</button><button className="primary-button" disabled={busy} onClick={()=>refresh(true)}><Icon name="news"/>{busy?'Refreshing…':'Refresh live news'}</button></div></div><div className="news-feed">{items.map(n=><article className="card news-item" key={n.id}><span className={`news-sentiment ${n.sentiment}`}/><div><div><b className={`severity ${String(n.severity).toLowerCase()}`}>{n.severity}</b><small>{n.company} · {n.source}</small></div><h3>{n.headline}</h3><p>{n.theme} · {n.sentiment} sentiment</p></div></article>)}</div></div>
}
