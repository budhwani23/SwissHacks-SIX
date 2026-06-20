import { useEffect, useState } from 'react'
import { TONE_OPTIONS, SEVERITY_STYLE } from '../constants'
import { downloadPDF } from '../utils/pdfReport'

export default function DraftNote({
  client, meta, detail, selectedAlert,
  tone, onToneChange,
  message, onGenerate, onApprove,
  loading
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCopied(false)
  }, [message?.id])

  // ── Download as beautiful PDF (opens print dialog) ───────────────
  const downloadReport = () => {
    downloadPDF({
      client,
      meta,
      dna:     detail?.dna,
      alerts:  detail?.alerts || [],
      notes:   detail?.notes  || [],
      message,
    })
  }

  // ── Email via mailto ─────────────────────────────────────────────
  const emailNote = () => {
    const subject = `Portfolio Update — ${client?.name}`
    const body    = message?.content || ''
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  // ── Copy to clipboard ────────────────────────────────────────────
  const copyNote = () => {
    if (message?.content) {
      navigator.clipboard.writeText(message.content)
        .then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1800)
        })
        .catch(() => setCopied(false))
    }
  }

  const alertStyle = selectedAlert
    ? (SEVERITY_STYLE[selectedAlert.alert_type] || SEVERITY_STYLE[selectedAlert.severity] || SEVERITY_STYLE['Portfolio conflict'])
    : null

  return (
    <aside className="right-panel">
      <div className="right-header">
        <h2>Advisory Note</h2>
        <p>Prepared from client and portfolio data · RM review required</p>
      </div>

      <div className="right-body">
        {/* ── No client selected ── */}
        {!client && (
          <div className="select-alert-prompt">
            <div className="prompt-mark" aria-hidden="true" />
            <p>Select a client and an alert<br />to generate a personalised note.</p>
          </div>
        )}

        {/* ── Client selected but no alert ── */}
        {client && !selectedAlert && (
          <div className="select-alert-prompt">
            <div className="prompt-mark" aria-hidden="true" />
            <p>Select an alert from the middle panel<br />to generate a tailored advisory note.</p>
          </div>
        )}

        {/* ── Alert selected ── */}
        {client && selectedAlert && (
          <>
            {/* Selected alert summary */}
            <div
              className="selected-alert-summary"
              style={{ borderColor: alertStyle?.border, background: alertStyle?.bg }}
            >
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Drafting note for</div>
              <strong style={{ color: alertStyle?.color }}>{selectedAlert.holding}</strong>
              <span style={{ color: 'var(--muted)' }}> · {selectedAlert.alert_type}</span>
            </div>

            {/* Tone selector */}
            <div className="section-label">Tone</div>
            <div className="tone-row" role="group" aria-label="Advisory note tone">
              {TONE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`tone-btn${tone === opt.value ? ' active' : ''}`}
                  onClick={() => onToneChange(opt.value)}
                  aria-pressed={tone === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Client context pill */}
            {meta && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600 }}>Context:</span> Age {meta.age} · {meta.wealth_tier} · {meta.wealth}
              </div>
            )}

            {/* Generate button */}
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: 16 }}
              onClick={onGenerate}
              disabled={loading}
            >
              {loading ? 'Generating…' : 'Generate advisory note'}
            </button>

            {/* Loading state */}
            {loading && (
              <div className="message-loading" role="status" aria-live="polite">
                <div className="spinner" />
                Crafting personalised note for {client.name}…
              </div>
            )}

            {/* Message output */}
            {message && !loading && (
              <>
                <div className="section-label" style={{ marginBottom: 8 }}>
                  Draft note {message.approved ? '· Approved' : ''}
                </div>
                <div className="message-box" aria-live="polite">{message.content}</div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Footer actions ── */}
      {message && !loading && (
        <div className="right-footer">
          <div className="action-row">
            {!message.approved && (
              <button className="btn btn-gold" onClick={onApprove}>Approve</button>
            )}
            <button className="btn btn-secondary" onClick={copyNote} aria-live="polite">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn btn-secondary" onClick={emailNote}>Email</button>
            <button className="btn btn-secondary" onClick={downloadReport}>PDF report</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            This note is AI-assisted. RM review required before client communication.
          </div>
        </div>
      )}
    </aside>
  )
}
