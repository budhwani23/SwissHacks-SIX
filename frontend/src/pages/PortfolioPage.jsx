import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { api } from '../services/api'

const money = value => new Intl.NumberFormat('en-CH',{style:'currency',currency:'CHF',maximumFractionDigits:0}).format(value||0)

export default function PortfolioPage({ clientId, notify }) {
  const [portfolio,setPortfolio]=useState(null)
  useEffect(()=>{if(clientId)api.portfolio(clientId).then(setPortfolio).catch(()=>setPortfolio(null))},[clientId])
  const replace=async issuer=>{try{const result=await api.replacement(clientId,issuer);notify(result.buy?`Suggested: ${result.buy}`:result.message)}catch(e){notify(e.message)}}
  if(!portfolio)return <div className="loading-state">Loading portfolio…</div>
  return <div className="page-wrap"><div className="page-intro"><div><span className="eyebrow">PORTFOLIO INTELLIGENCE</span><h2>{portfolio.client_name}</h2><p>{portfolio.strategy} mandate · {portfolio.holdings.length} holdings</p></div><div className="portfolio-total"><small>TOTAL VALUE</small><strong>{money(portfolio.total_value_chf)}</strong></div></div><article className="card portfolio-table"><div className="portfolio-row portfolio-head"><span>Holding</span><span>Sector</span><span>Current value</span><span>Drift</span><span>CIO alignment</span><span/></div>{portfolio.holdings.map(h=><div className="portfolio-row" key={h.id||h.issuer}><div><strong>{h.issuer}</strong><small>{h.mic} · {h.valor}</small></div><span>{h.sector}</span><b>{money(h.current_value_chf)}</b><span className={Math.abs(h.drift_pct)>10?'negative-text':''}>{h.drift_pct>0?'+':''}{h.drift_pct}%</span><b className={`alignment ${String(h.cio_alignment).toLowerCase()}`}>{h.cio_alignment}</b><button className="table-action" disabled={h.cio_alignment!=='Conflict'} onClick={()=>replace(h.issuer)}>{h.cio_alignment==='Conflict'?'Find replacement':'Aligned'}</button></div>)}</article></div>
}
