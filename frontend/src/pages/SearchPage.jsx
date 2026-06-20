import { useState } from 'react'
import Icon from '../components/Icon'
import { api } from '../services/api'

export default function SearchPage() {
  const [question,setQuestion]=useState('Which clients hold SELL-rated stocks?');const [result,setResult]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const ask=async e=>{e.preventDefault();setBusy(true);setError('');try{setResult(await api.sqlQuery(question,true))}catch(err){setError(err.message)}finally{setBusy(false)}}
  const examples=['Which clients hold SELL-rated stocks?','Which clients have open alerts?','Show me all high severity alerts']
  return <div className="search-page"><div className="search-hero"><span className="spark"><Icon name="spark"/></span><span className="eyebrow">ASK YOUR CLIENT BOOK</span><h2>What would you like to know?</h2><p>Answers are generated from read-only queries against the CRM database.</p><form onSubmit={ask}><Icon name="search"/><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about clients, holdings or alerts…"/><button disabled={busy}>{busy?'Searching…':'Ask'}</button></form><div className="example-questions">{examples.map(x=><button key={x} onClick={()=>setQuestion(x)}>{x}</button>)}</div></div>{error&&<div className="search-error">{error}</div>}{result&&<div className="search-results"><article className="answer-card"><span className="eyebrow">ANSWER</span><p>{result.summary}</p><small>{result.row_count} rows returned</small></article><article className="card"><div className="sql-block"><span>Generated SQL</span><code>{result.sql}</code></div>{result.rows.length>0&&<div className="result-table"><table><thead><tr>{Object.keys(result.rows[0]).map(k=><th key={k}>{k.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{result.rows.map((row,i)=><tr key={i}>{Object.values(row).map((v,j)=><td key={j}>{String(v??'—')}</td>)}</tr>)}</tbody></table></div>}</article></div>}</div>
}
