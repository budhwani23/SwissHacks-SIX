import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'

export default function CioUniversePage() {
  const [items,setItems]=useState([]);const [sector,setSector]=useState('');const [mandate,setMandate]=useState('')
  useEffect(()=>{api.recommendations(sector,mandate).then(setItems).catch(()=>setItems([]))},[sector,mandate])
  const sectors=useMemo(()=>[...new Set(items.map(x=>x.sector).filter(Boolean))].sort(),[items])
  return <div className="page-wrap"><div className="page-intro"><div><span className="eyebrow">APPROVED INVESTMENT UNIVERSE</span><h2>CIO recommendations</h2><p>Reference only approved securities when reviewing replacements.</p></div><div className="filter-row"><select value={sector} onChange={e=>setSector(e.target.value)}><option value="">All sectors</option>{sectors.map(s=><option key={s}>{s}</option>)}</select><select value={mandate} onChange={e=>setMandate(e.target.value)}><option value="">All mandates</option><option>Defensive</option><option>Balanced</option><option>Growth</option></select></div></div><article className="card cio-table"><div className="cio-row cio-head"><span>Issuer</span><span>Sector</span><span>Rating</span><span>Mandate</span><span>CIO view</span></div>{items.map(x=><div className="cio-row" key={x.id}><strong>{x.issuer}</strong><span>{x.sector}</span><b className={`rating ${String(x.rating).toLowerCase()}`}>{x.rating}</b><span>{x.mandate}</span><p>{x.comment}</p></div>)}</article></div>
}
