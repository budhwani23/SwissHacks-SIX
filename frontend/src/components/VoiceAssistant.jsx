import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { createRecorder, blobToBase64 } from '../utils/recorder'
import { speak, stopSpeaking } from '../utils/voice'
import { computeTrustScore } from '../constants'

const EXAMPLES = [
  'Open the highest priority client',
  'Give me a briefing',
  'Read the alerts',
  'Draft an advisory note',
  'Download the PDF report',
]

export default function VoiceAssistant({ controller }) {
  const [status, setStatus]       = useState('idle')   // idle | listening | thinking | speaking | error
  const [open, setOpen]           = useState(false)
  const [transcript, setTranscript] = useState('')
  const [reply, setReply]         = useState('')
  const [configured, setConfigured] = useState(true)

  const recRef = useRef(null)
  const controllerRef = useRef(controller)
  useEffect(() => { controllerRef.current = controller })

  useEffect(() => {
    api.voiceStatus().then(s => setConfigured(!!s.configured)).catch(() => {})
  }, [])

  // ── Recording ──────────────────────────────────────────────────────
  async function toggle() {
    if (status === 'listening') return finishRecording()
    if (status === 'thinking' || status === 'speaking') { stopSpeaking(); setStatus('idle'); return }
    try {
      stopSpeaking()
      setOpen(true); setReply(''); setTranscript('')
      recRef.current = createRecorder()
      await recRef.current.start()
      setStatus('listening')
    } catch {
      setStatus('error'); setReply('Microphone access was blocked. Allow mic access and try again.')
    }
  }

  async function finishRecording() {
    setStatus('thinking')
    let wav
    try { wav = await recRef.current.stop() } catch { setStatus('error'); setReply('Could not capture audio.'); return }
    try {
      const b64 = await blobToBase64(wav)
      const { text } = await api.transcribe(b64, 'audio/wav')
      setTranscript(text || '')
      if (!text) { setStatus('idle'); setReply("I didn't catch anything — try again."); return }

      const c = controllerRef.current
      const intent = await api.interpret({
        transcript: text,
        clients: c.getClients().map(x => ({
          id: x.id, name: x.name,
          open_alerts: x.open_alerts, high_severity_alerts: x.high_severity_alerts,
        })),
        current_client_id: c.getSelectedId(),
        current_tab: c.getCurrentTab(),
      })
      await runCommand(intent)
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setReply(/GEMINI_API_KEY/i.test(e.message) ? 'Add GEMINI_API_KEY to backend/.env to enable voice.' : (e.message || 'Voice request failed.'))
    }
  }

  // ── Speaking helper ────────────────────────────────────────────────
  // action (optional) fires the moment TTS audio is ready — so the user
  // hears the voice as the screen changes, not 3 s after it.
  async function say(text, action) {
    setReply(text)
    setStatus('speaking')
    try { await speak(text, action) } catch { action?.() }
  }

  // ── Command dispatch ───────────────────────────────────────────────
  async function runCommand(intent) {
    const c = controllerRef.current
    const clients = c.getClients()
    const cur = c.getSelectedId()
    const resolveId = () => {
      const t = intent.target_client_id
      if (t && clients.some(x => x.id === t)) return t
      return clients[0]?.id
    }
    const nameOf = (id) => clients.find(x => x.id === id)?.name || 'the client'

    switch (intent.action) {
      case 'open_client': {
        const id = resolveId()
        await say(intent.speak || `Opening ${nameOf(id)}.`, () => c.openClient(id)); break
      }
      case 'next_client': {
        await say(intent.speak || 'Here is the next client.', () => c.nextClient()); break
      }
      case 'prev_client': {
        await say(intent.speak || 'Going to the previous client.', () => c.prevClient()); break
      }
      case 'show_tab': {
        const tab = intent.tab || 'alerts'
        await say(intent.speak || `Showing ${tab}.`, () => c.showTab(tab)); break
      }

      case 'read_summary': {
        const id = cur || resolveId()
        // Fetch data and TTS ack in parallel — action fires when ack audio is ready
        const [d] = await Promise.all([
          c.fetchDetail(id),
          say(intent.speak || `Opening ${nameOf(id)}'s summary.`, () => c.openClient(id)),
        ])
        await say(narrateSummary(clients.find(x => x.id === id), d))
        break
      }
      case 'read_alerts': {
        const id = cur || resolveId()
        const [d] = await Promise.all([
          c.fetchDetail(id),
          say(intent.speak || `Checking alerts for ${nameOf(id)}.`, () => { c.openClient(id); c.showTab('alerts') }),
        ])
        await say(narrateAlerts(d, nameOf(id)))
        break
      }
      case 'read_portfolio': {
        const id = cur || resolveId()
        const [d] = await Promise.all([
          c.fetchDetail(id),
          say(intent.speak || `Loading portfolio for ${nameOf(id)}.`, () => { c.openClient(id); c.showTab('portfolio') }),
        ])
        await say(narratePortfolio(d, nameOf(id)))
        break
      }
      case 'read_dna': {
        const id = cur || resolveId()
        const [d] = await Promise.all([
          c.fetchDetail(id),
          say(intent.speak || `Opening client DNA for ${nameOf(id)}.`, () => { c.openClient(id); c.showTab('dna') }),
        ])
        await say(narrateDna(d, nameOf(id)))
        break
      }

      case 'start_briefing': {
        const id = resolveId()
        const client = clients.find(x => x.id === id)
        // Fetch data and ack in parallel — by the time ack finishes playing, data is ready
        const [d] = await Promise.all([
          c.fetchDetail(id),
          say(intent.speak || `Starting briefing for ${nameOf(id)}.`, () => c.openClient(id)),
        ])
        await say(narrateSummary(client, d))
        c.showTab('alerts');    await say(narrateAlerts(d, client?.name))
        c.showTab('portfolio'); await say(narratePortfolio(d, client?.name))
        c.showTab('dna');       await say(narrateDna(d, client?.name))
        await say('That completes the briefing.')
        break
      }

      case 'open_constellation': {
        await say(intent.speak || 'Opening the trust constellation.', () => c.openConstellation()); break
      }
      case 'run_analysis': {
        await say(intent.speak || 'Running analysis across all clients.', () => c.runAnalysis()); break
      }
      case 'go_home': {
        await say(intent.speak || 'Back to the home screen.', () => c.goHome()); break
      }

      case 'download_pdf': {
        const ok = c.downloadPdf()
        await say(ok
          ? `Opening the PDF report for ${nameOf(c.getSelectedId())}. Use your browser's print dialog to save it.`
          : 'Please select a client first before downloading the report.')
        break
      }

      case 'generate_note': {
        const clientName = nameOf(c.getSelectedId())
        // Acknowledge first, then generate (LLM call takes a few seconds)
        await say(intent.speak || `Drafting your advisory note for ${clientName}.`)
        const ok = await c.generateNote()
        await say(ok
          ? `Your advisory note for ${clientName} is ready. Please review it in the draft panel.`
          : 'I could not generate a note. Please select a client with an open alert first.')
        break
      }

      default:
        await say(intent.speak || "I didn't catch a command I can run. Try: open the highest priority client.")
    }
  }

  const busy = status === 'listening' || status === 'thinking' || status === 'speaking'
  const statusText = {
    idle: configured ? 'Tap to speak a command' : 'Voice needs a Gemini key (see backend/.env)',
    listening: 'Listening… tap to stop',
    thinking: 'Thinking…',
    speaking: 'Speaking…',
    error: reply,
  }[status]

  return (
    <div className="voice-wrap">
      {open && (
        <div className="voice-panel">
          <div className="voice-panel-head">
            <span className="voice-title">Voice Assistant</span>
            <button className="voice-x" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className={`voice-status v-${status}`}>{statusText}</div>

          {transcript && <div className="voice-heard">“{transcript}”</div>}
          {reply && status !== 'error' && <div className="voice-reply">{reply}</div>}

          {status === 'idle' && (
            <div className="voice-examples">
              {EXAMPLES.map(ex => <span key={ex} className="voice-chip">{ex}</span>)}
            </div>
          )}
        </div>
      )}

      <button
        className={`voice-fab${busy ? ' active' : ''} v-${status}`}
        onClick={toggle}
        title="Voice command"
        aria-label="Voice command"
      >
        {status === 'thinking'
          ? <span className="voice-spinner" />
          : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <line x1="12" y1="18" x2="12" y2="22" />
            </svg>
          )}
      </button>
    </div>
  )
}

// ── Narration builders ────────────────────────────────────────────────
function narrateSummary(client, detail) {
  if (!client) return 'No client selected.'
  const score = computeTrustScore(client, detail?.notes?.length || 0, !!detail?.dna)
  const open = client.open_alerts || 0
  const high = client.high_severity_alerts || 0
  const alertPart = open === 0 ? 'no open alerts'
    : `${open} open alert${open > 1 ? 's' : ''}${high ? `, ${high} high severity` : ''}`
  return `${client.name}, ${client.strategy || ''} mandate. Trust score ${score} out of 100, with ${alertPart}.`
}

function narrateAlerts(detail, name) {
  const open = (detail?.alerts || []).filter(a => a.status === 'open')
  if (!open.length) return `${name || 'This client'} has no open alerts right now.`
  const top = open.slice(0, 3).map(a =>
    `${a.severity || ''} alert on ${a.holding || 'a holding'}${a.reason ? `: ${a.reason}` : ''}`)
  const more = open.length > 3 ? ` And ${open.length - 3} more.` : ''
  return `${open.length} open alert${open.length > 1 ? 's' : ''}. ${top.join('. ')}.${more}`
}

function narratePortfolio(detail, name) {
  const h = detail?.portfolio || []
  if (!h.length) return `No portfolio data available for ${name || 'this client'}.`
  const withDrift = h.map(x => {
    const drift = x.drift_pct ?? (x.current_value_chf && x.target_value_chf
      ? ((x.current_value_chf - x.target_value_chf) / x.target_value_chf) * 100 : 0)
    return { issuer: x.issuer, drift: Number(drift) || 0, rating: (x.cio_rating || '').toUpperCase() }
  })
  const biggest = withDrift.slice().sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))[0]
  const sells = withDrift.filter(x => x.rating === 'SELL').map(x => x.issuer)
  let s = `${h.length} holding${h.length > 1 ? 's' : ''}.`
  if (biggest && Math.abs(biggest.drift) >= 0.1) s += ` Largest drift is ${biggest.issuer} at ${biggest.drift > 0 ? 'plus ' : 'minus '}${Math.abs(biggest.drift).toFixed(1)} percent.`
  if (sells.length) s += ` ${sells.length} holding${sells.length > 1 ? 's' : ''} rated sell: ${sells.join(', ')}.`
  return s
}

function narrateDna(detail, name) {
  const dna = detail?.dna
  if (!dna) return `No client DNA has been extracted for ${name || 'this client'} yet.`
  const parts = []
  if (dna.values?.length) parts.push(`values ${dna.values.slice(0, 3).join(', ')}`)
  if (dna.risk_style) parts.push(`risk style ${dna.risk_style}`)
  if (dna.avoid?.length) parts.push(`avoids ${dna.avoid.slice(0, 2).join(' and ')}`)
  return parts.length ? `Investment DNA: ${parts.join('; ')}.` : 'Investment DNA is available but sparse.'
}
