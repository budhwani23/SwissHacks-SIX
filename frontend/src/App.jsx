import { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import { CLIENT_META, computeTrustScore, TONE_OPTIONS } from './constants'
import LandingPage from './components/LandingPage'
import PriorityList from './components/PriorityList'
import ClientDetail from './components/ClientDetail'
import DraftNote from './components/DraftNote'
import TrustConstellation from './components/TrustConstellation'
import ThemeToggle from './components/ThemeToggle'

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('sixgnals-theme') || 'dark')
  const [clients, setClients]             = useState([])
  const [selectedId, setSelectedId]       = useState(null)
  const [detail, setDetail]               = useState(null)
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [tone, setTone]                   = useState('values-led')
  const [message, setMessage]             = useState(null)
  const [loading, setLoading]             = useState({ clients: true, analysis: false, detail: false, message: false })
  const [error, setError]                 = useState(null)

  // ── Landing page state ────────────────────────────────────────────
  const [showLanding, setShowLanding] = useState(true)
  const [isExiting, setIsExiting]     = useState(false)

  // ── Trust constellation overlay ───────────────────────────────────
  const [showConstellation, setShowConstellation] = useState(false)

  useEffect(() => {
    localStorage.setItem('sixgnals-theme', theme)
    document.documentElement.dataset.theme = theme
  }, [theme])

  // ── Landing → workspace transition ───────────────────────────────
  const handleLandingSelect = (clientId) => {
    setSelectedId(clientId)
    setIsExiting(true)
    setTimeout(() => {
      setShowLanding(false)
      setIsExiting(false)
    }, 450)
  }

  // ── Load all clients ──────────────────────────────────────────────
  const loadClients = useCallback(async (keepSelected = false) => {
    setLoading(l => ({ ...l, clients: true }))
    try {
      const data = await api.getClients()
      const sorted = [...data].sort((a, b) =>
        b.high_severity_alerts - a.high_severity_alerts ||
        b.open_alerts - a.open_alerts ||
        a.name.localeCompare(b.name)
      )
      setClients(sorted)
      if (!keepSelected && sorted.length > 0 && !showLanding) {
        setSelectedId(sorted[0].id)
      }
    } catch {
      setError('Cannot connect to backend. Make sure the FastAPI server is running on port 8000.')
    } finally {
      setLoading(l => ({ ...l, clients: false }))
    }
  }, [])

  useEffect(() => { loadClients() }, [loadClients])

  // ── Load client detail when selection changes ─────────────────────
  useEffect(() => {
    if (!selectedId) return
    setDetail(null)
    setSelectedAlert(null)
    setMessage(null)
    setLoading(l => ({ ...l, detail: true }))

    Promise.all([
      api.getDna(selectedId).catch(() => ({ dna: null, source_notes: [] })),
      api.getAlerts(selectedId).catch(() => []),
      api.getPortfolio(selectedId).catch(() => []),
    ]).then(([dnaRes, alerts, portfolio]) => {
      setDetail({
        dna:       dnaRes.dna,
        notes:     dnaRes.source_notes || [],
        alerts,
        portfolio: Array.isArray(portfolio) ? portfolio : (portfolio.holdings || []),
      })
      const best = alerts.find(a => a.status === 'open' && a.severity === 'High')
                || alerts.find(a => a.status === 'open')
      if (best) setSelectedAlert(best)
    }).finally(() => setLoading(l => ({ ...l, detail: false })))
  }, [selectedId])

  // ── Run portfolio analysis for all clients ────────────────────────
  const runAnalysis = async () => {
    setLoading(l => ({ ...l, analysis: true }))
    setError(null)
    try {
      await api.runAnalysis()
      await loadClients(true)
      if (selectedId) {
        const [dnaRes, alerts, portfolio] = await Promise.all([
          api.getDna(selectedId).catch(() => ({ dna: null, source_notes: [] })),
          api.getAlerts(selectedId).catch(() => []),
          api.getPortfolio(selectedId).catch(() => []),
        ])
        setDetail({
          dna:       dnaRes.dna,
          notes:     dnaRes.source_notes || [],
          alerts,
          portfolio: Array.isArray(portfolio) ? portfolio : (portfolio.holdings || []),
        })
        const best = alerts.find(a => a.status === 'open' && a.severity === 'High')
                  || alerts.find(a => a.status === 'open')
        if (best) setSelectedAlert(best)
        setMessage(null)
      }
    } catch (e) {
      setError('Analysis failed: ' + e.message)
    } finally {
      setLoading(l => ({ ...l, analysis: false }))
    }
  }

  // ── Generate advisory message ─────────────────────────────────────
  const generateMessage = async () => {
    if (!selectedId || !selectedAlert) return
    setLoading(l => ({ ...l, message: true }))
    setMessage(null)
    setError(null)
    try {
      const meta = CLIENT_META[selectedId]
      const richTone = meta ? `${tone}. ${meta.tone_context}` : tone
      const result = await api.generateMessage(selectedId, selectedAlert.id, richTone)
      setMessage(result)
    } catch (e) {
      setError('Message generation failed: ' + e.message)
    } finally {
      setLoading(l => ({ ...l, message: false }))
    }
  }

  // ── Dismiss an alert ─────────────────────────────────────────────
  const dismissAlert = async (alertId) => {
    try {
      await api.updateAlertStatus(alertId, 'dismissed')
      const alerts = await api.getAlerts(selectedId)
      setDetail(d => ({ ...d, alerts }))
      if (selectedAlert?.id === alertId) {
        const next = alerts.find(a => a.status === 'open' && a.id !== alertId)
        setSelectedAlert(next || null)
        setMessage(null)
      }
      loadClients(true)
    } catch (e) {
      setError(e.message)
    }
  }

  // ── Approve message ───────────────────────────────────────────────
  const approveMessage = async () => {
    if (!message?.id) return
    try {
      await api.approveMessage(message.id)
      setMessage(m => ({ ...m, approved: true }))
    } catch (e) {
      setError(e.message)
    }
  }

  // ── Computed values ───────────────────────────────────────────────
  const selectedClient = clients.find(c => c.id === selectedId) || null
  const meta           = selectedId ? CLIENT_META[selectedId] : null
  const trustScore     = selectedClient && detail
    ? computeTrustScore(selectedClient, detail.notes?.length || 0, !!detail.dna)
    : null

  const totalOpen   = clients.reduce((s, c) => s + c.open_alerts, 0)
  const hasNoAlerts = clients.length > 0 && totalOpen === 0

  return (
    <div className="app" data-theme={theme}>
      {/* ── Landing page ── */}
      {showLanding && (
        <LandingPage
          clients={clients}
          loading={loading.clients}
          onSelect={handleLandingSelect}
          isExiting={isExiting}
          theme={theme}
          onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        />
      )}

      {/* ── Workspace ── */}
      <div className={!showLanding ? 'workspace-enter' : ''} style={{ display: 'contents' }}>

        <header className="app-header">
          <div className="header-left">
            <span className="logo">
              <img src={theme === 'light' ? '/sixgnals-logo.svg' : '/sixgnals-logo-dark.svg'} alt="SIXgnals" />
            </span>
            <span className="header-sub">Bringing ease in Wealth Management</span>
          </div>
          <div className="header-right">
            <ThemeToggle
              theme={theme}
              onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            />
            <span className="live-badge">● LIVE</span>
            <span className="live-source">Bloomberg · Event Registry</span>
            <button
              className="btn-analysis"
              onClick={runAnalysis}
              disabled={loading.analysis}
            >
              {loading.analysis ? 'Analysing…' : 'Run analysis'}
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {hasNoAlerts && !loading.analysis && !loading.clients && (
          <div className="no-alerts-banner">
            <span>No portfolio alerts yet.</span>
            <button onClick={runAnalysis}>Run Analysis to detect conflicts →</button>
          </div>
        )}

        <div className="layout">
          <PriorityList
            clients={clients}
            selectedId={selectedId}
            onSelect={(id) => { setSelectedId(id); setMessage(null) }}
            onOpenConstellation={() => setShowConstellation(true)}
            loading={loading.clients}
          />

          <ClientDetail
            client={selectedClient}
            meta={meta}
            detail={detail}
            trustScore={trustScore}
            onOpenConstellation={() => setShowConstellation(true)}
            selectedAlert={selectedAlert}
            onSelectAlert={(a) => { setSelectedAlert(a); setMessage(null) }}
            onDismissAlert={dismissAlert}
            loading={loading.detail}
          />

          <DraftNote
            client={selectedClient}
            meta={meta}
            detail={detail}
            selectedAlert={selectedAlert}
            tone={tone}
            onToneChange={setTone}
            message={message}
            onGenerate={generateMessage}
            onApprove={approveMessage}
            loading={loading.message}
          />
        </div>

      </div>

      {/* ── Trust constellation overlay ── */}
      {showConstellation && (
        <TrustConstellation
          clients={clients}
          onClose={() => setShowConstellation(false)}
          onSelectClient={(id) => {
            setSelectedId(id)
            setMessage(null)
            setShowConstellation(false)
          }}
        />
      )}
    </div>
  )
}
