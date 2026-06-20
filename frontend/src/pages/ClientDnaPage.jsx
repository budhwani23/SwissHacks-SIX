import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { api } from '../services/api'

export default function ClientDnaPage({ clientId }) {
  const [data,setData]=useState(null);const [state,setState]=useState('idle')
  useEffect(()=>{if(!clientId)return;setState('loading');api.dna(clientId).then(d=>{setData(d);setState('ready')}).catch(()=>setState('error'))},[clientId])
  if(state==='loading')return <div className="loading-state">Extracting Client DNA…</div>
  if(state==='error')return <div className="empty-state page-empty"><Icon name="alert"/><h3>Client DNA unavailable</h3><p>The backend may require its configured LLM key to extract this profile.</p></div>
  const dna=data?.dna||{}
  const groups=[['Values',dna.values],['Investment preferences',dna.investment_preferences],['Avoid',dna.avoid],['Red flags',dna.red_flags],['Preferred sectors',dna.preferred_sectors],['Important life events',dna.important_life_events]]
  return <div className="page-wrap"><section className="dna-hero"><span className="spark"><Icon name="spark"/></span><div><span className="eyebrow">LIVING CLIENT PROFILE</span><h2>{dna.client_name || 'Client DNA'}</h2><p>{dna.communication_style || 'Communication preferences will appear here.'}</p></div><div className="dna-strategy"><small>RISK STYLE</small><strong>{dna.risk_style || '—'}</strong></div></section><div className="dna-grid">{groups.map(([label,items])=><article className="card dna-card" key={label}><span className="eyebrow">{label}</span><div className="chips">{(items||[]).map(item=><span key={item}>{item}</span>)}{!items?.length&&<p>No extracted data</p>}</div></article>)}</div><article className="card context-card"><div><span className="eyebrow">FAMILY CONTEXT</span><p>{dna.family_context||'No family context extracted.'}</p></div><div><span className="eyebrow">BUSINESS CONTEXT</span><p>{dna.business_context||'No business context extracted.'}</p></div></article></div>
}
