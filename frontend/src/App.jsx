import { useEffect, useState } from 'react'
import Icon from './components/Icon'
import { api } from './services/api'
import OverviewPage from './pages/OverviewPage'
import ClientsPage from './pages/ClientsPage'
import TrustNavigatorPage from './pages/TrustNavigatorPage'
import SignalsPage from './pages/SignalsPage'
import ClientDnaPage from './pages/ClientDnaPage'
import PortfolioPage from './pages/PortfolioPage'
import ClientProfilePage from './pages/ClientProfilePage'
import NewsPage from './pages/NewsPage'
import CioUniversePage from './pages/CioUniversePage'
import SearchPage from './pages/SearchPage'
import CommandCenterPage from './pages/CommandCenterPage'
import PageErrorBoundary from './components/PageErrorBoundary'

const pages = {
  overview: ['Overview', 'WORKSPACE'], clients: ['Clients', 'CLIENT RELATIONSHIPS'],
  trust: ['Trust Navigator', 'RELATIONSHIP INTELLIGENCE'], signals: ['Signals', 'LIVE INTELLIGENCE'],
  dna: ['Client DNA', 'CLIENT INTELLIGENCE'],
  portfolio: ['Portfolio', 'CLIENT INVESTMENTS'],
  profile: ['Client Profile', 'RELATIONSHIP WORKSPACE'], news: ['News Feed', 'MARKET INTELLIGENCE'],
  cio: ['CIO Universe', 'INVESTMENT RESEARCH'], search: ['Ask Wealth Twin', 'NATURAL LANGUAGE SEARCH'],
  command: ['RM Command Center', 'LIVE DECISION INTELLIGENCE'],
}

export default function App() {
  const initialPage = new URLSearchParams(window.location.search).get('page')
  const [page, setPage] = useState(pages[initialPage] ? initialPage : 'overview')
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [status, setStatus] = useState('connecting')
  const [toast, setToast] = useState('')

  const refreshClients = () => api.clients().then(data => {
      setClients(data); setClientId(current => data.some(c => c.id === current) ? current : (data[0]?.id || '')); setStatus('live')
    }).catch(() => setStatus('offline'))
  useEffect(() => { refreshClients() }, [])

  const navigate = next => {
    setPage(next)
    window.history.replaceState({}, '', `${window.location.pathname}?page=${next}`)
  }
  const notify = message => { setToast(message); setTimeout(() => setToast(''), 2600) }
  const shared = { clients, clientId, setClientId, navigate, notify, refreshClients }

  return <div className="shell">
    <aside>
      <div className="brand" title="AURA // Next-Gen Wealth"><span className="brand-mark">A</span><div>AURA<small>NEXT-GEN WEALTH</small></div></div>
      <nav>
        <span>WORKSPACE</span>
        <a title="Overview" className={page === 'overview' ? 'active' : ''} onClick={() => navigate('overview')}><Icon name="grid"/>Overview</a>
        <a title="RM Command Center" className={page === 'command' ? 'active' : ''} onClick={() => navigate('command')}><Icon name="activity"/>Command Center</a>
        <a title="Clients" className={page === 'clients' ? 'active' : ''} onClick={() => navigate('clients')}><Icon name="users"/>Clients</a>
        <a title="Portfolio Analytics" className={page === 'portfolio' ? 'active' : ''} onClick={() => navigate('portfolio')}><Icon name="wallet"/>Portfolio</a>
        <a title="Trust Navigator" className={page === 'trust' ? 'active' : ''} onClick={() => navigate('trust')}><Icon name="compass"/>Trust Navigator</a>
        <a title="Signals" className={page === 'signals' ? 'active' : ''} onClick={() => navigate('signals')}><Icon name="bell"/>Signals</a>
        <span>INTELLIGENCE</span>
        <a title="Client DNA" className={page === 'dna' ? 'active' : ''} onClick={() => navigate('dna')}><Icon name="spark"/>Client DNA</a>
        <a title="News Matrix" className={page === 'news' ? 'active' : ''} onClick={() => navigate('news')}><Icon name="news"/>News Feed</a>
        <a title="CIO Universe" className={page === 'cio' ? 'active' : ''} onClick={() => navigate('cio')}><Icon name="wallet"/>CIO Universe</a>
        <a title="Ask AURA" className={page === 'search' ? 'active' : ''} onClick={() => navigate('search')}><Icon name="search"/>Ask AURA</a>
      </nav>
      <div className="advisor" title="Thomas Keller — Relationship Manager"><div className="avatar">TK</div><div><strong>Thomas Keller</strong><small>Relationship Manager</small></div><button>•••</button></div>
    </aside>
    <main>
      <header><div><p>{pages[page][1]}</p><h1>{pages[page][0]}</h1></div><div className="header-actions"><span className={`api-status ${status}`}><i/>{status === 'live' ? 'API connected' : status === 'offline' ? 'Backend offline' : 'Connecting'}</span><button className="icon-btn" onClick={() => navigate('signals')}><Icon name="bell"/><b/></button>{['clients','profile','portfolio','trust','signals','dna'].includes(page) && clients.length > 0 && <select value={clientId} onChange={e => setClientId(e.target.value)}>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div></header>
      {status === 'offline' ? <div className="offline-banner"><Icon name="alert"/>Start the FastAPI backend on port 8000 to load CRM data.</div> : null}
      <PageErrorBoundary key={page}>
      {page === 'overview' && <OverviewPage {...shared}/>} 
      {page === 'clients' && <ClientsPage {...shared}/>} 
      {page === 'trust' && <TrustNavigatorPage {...shared}/>} 
      {page === 'signals' && <SignalsPage {...shared}/>} 
      {page === 'dna' && <ClientDnaPage {...shared}/>} 
      {page === 'portfolio' && <PortfolioPage {...shared}/>} 
      {page === 'profile' && <ClientProfilePage {...shared}/>} 
      {page === 'news' && <NewsPage {...shared}/>} 
      {page === 'cio' && <CioUniversePage {...shared}/>} 
      {page === 'search' && <SearchPage {...shared}/>} 
      {page === 'command' && <CommandCenterPage {...shared}/>} 
      </PageErrorBoundary>
    </main>
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>
}
