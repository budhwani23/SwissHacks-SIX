import { useState } from 'react'
import { CLIENT_META, computeTrustScore, trustColor, trustLabel, SEVERITY_STYLE } from '../constants'

export default function ClientDetail({
  client, meta, detail, trustScore, onOpenConstellation,
  selectedAlert, onSelectAlert, onDismissAlert, loading
}) {
  const [tab, setTab] = useState('alerts')

  if (!client) {
    return (
      <main className="mid-panel panel">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
          <p>Select a client from the priority list to begin.</p>
        </div>
      </main>
    )
  }

  const score = trustScore ?? 0
  const scoreColor = trustColor(score)

  return (
    <main className="mid-panel panel">
      {/* ── Client header ── */}
      <div className="client-header">
        <div className="client-header-top">
          <div className="avatar" style={{ background: meta?.color || '#718096', width: 44, height: 44, fontSize: 18 }}>
            {meta?.avatar || client.name[0]}
          </div>
          <div>
            <div className="client-header-name">{client.name}</div>
            <div className="client-header-meta">
              {client.strategy} Mandate · {meta?.age ? `Age ${meta.age}` : ''} · {meta?.wealth || ''}
            </div>
          </div>
          <div
            className="trust-badge clickable"
            style={{ borderColor: scoreColor }}
            onClick={onOpenConstellation}
            title="View Trust Constellation"
            role="button"
          >
            <div className="trust-badge-score" style={{ color: scoreColor }}>{score}</div>
            <div className="trust-badge-label">TRUST · {trustLabel(score)}</div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="tabs">
          {['alerts', 'portfolio', 'dna'].map(t => (
            <button
              key={t}
              className={`tab-btn${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'alerts'    ? `Alerts (${detail?.alerts?.filter(a => a.status === 'open').length || 0})` :
               t === 'portfolio' ? 'Portfolio' :
               'Client DNA'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="mid-content">
        {loading ? (
          <div className="loading-state"><div className="spinner" /> Loading client data…</div>
        ) : tab === 'alerts' ? (
          <AlertsTab
            alerts={detail?.alerts || []}
            selectedAlert={selectedAlert}
            onSelect={onSelectAlert}
            onDismiss={onDismissAlert}
          />
        ) : tab === 'portfolio' ? (
          <PortfolioTab holdings={detail?.portfolio || []} />
        ) : (
          <DnaTab dna={detail?.dna} notes={detail?.notes || []} />
        )}
      </div>
    </main>
  )
}

// ── Alerts tab ────────────────────────────────────────────────────────────────
function AlertsTab({ alerts, selectedAlert, onSelect, onDismiss }) {
  const open      = alerts.filter(a => a.status === 'open')
  const dismissed = alerts.filter(a => a.status !== 'open')

  if (open.length === 0 && dismissed.length === 0) {
    return <div className="empty-state">No alerts. Run Analysis to detect portfolio conflicts.</div>
  }

  return (
    <>
      {open.length === 0 && <div className="empty-state">All alerts resolved.</div>}
      {open.map(alert => <AlertCard key={alert.id} alert={alert} selected={selectedAlert?.id === alert.id} onSelect={onSelect} onDismiss={onDismiss} />)}

      {dismissed.length > 0 && (
        <>
          <hr className="divider" />
          <div className="section-label">Dismissed</div>
          {dismissed.map(alert => (
            <AlertCard key={alert.id} alert={alert} selected={false} onSelect={null} onDismiss={null} dimmed />
          ))}
        </>
      )}
    </>
  )
}

function AlertCard({ alert, selected, onSelect, onDismiss, dimmed }) {
  const style = SEVERITY_STYLE[alert.alert_type] || SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE['Portfolio conflict']

  return (
    <div
      className={`alert-card${selected ? ' selected' : ''}`}
      style={{
        background: style.bg,
        borderColor: selected ? 'var(--navy)' : style.border,
        opacity: dimmed ? 0.55 : 1,
      }}
      onClick={() => onSelect && onSelect(alert)}
    >
      <div className="alert-top">
        <span
          className="alert-type-badge"
          style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
        >
          {alert.alert_type}
        </span>
        <span className="alert-severity" style={{ color: style.color }}>
          {alert.severity} · {alert.confidence}%
        </span>
      </div>
      <div className="alert-holding">{alert.holding}</div>
      {alert.news_headline && (
        <div className="alert-headline">"{alert.news_headline}"</div>
      )}
      <div className="alert-reason">{alert.reason}</div>
      {alert.recommended_action && (
        <div style={{ fontSize: 12, color: '#2c5282', marginBottom: 8 }}>
          → {alert.recommended_action}
        </div>
      )}
      <div className="confidence-bar-wrap">
        <div className="confidence-bar" style={{ width: `${alert.confidence}%`, background: style.color }} />
      </div>
      {!dimmed && (
        <div className="alert-actions" style={{ marginTop: 10 }}>
          {onSelect && (
            <button className="btn-sm btn-select" onClick={(e) => { e.stopPropagation(); onSelect(alert) }}>
              Draft Note →
            </button>
          )}
          {onDismiss && (
            <button className="btn-sm btn-dismiss" onClick={(e) => { e.stopPropagation(); onDismiss(alert.id) }}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Portfolio tab ─────────────────────────────────────────────────────────────
function PortfolioTab({ holdings }) {
  if (!holdings.length) return <div className="empty-state">No holdings data available.</div>

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="portfolio-table">
        <thead>
          <tr>
            <th>Issuer</th>
            <th>Sector</th>
            <th>Current (CHF)</th>
            <th>Drift</th>
            <th>CIO</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => {
            const drift = h.drift_pct ?? (
              h.current_value_chf && h.target_value_chf
                ? (((h.current_value_chf - h.target_value_chf) / h.target_value_chf) * 100).toFixed(1)
                : null
            )
            const rating = (h.cio_rating || '').toUpperCase()
            return (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{h.issuer}</td>
                <td style={{ color: 'var(--muted)' }}>{h.sector || '—'}</td>
                <td>{h.current_value_chf ? `${(h.current_value_chf / 1000).toFixed(0)}k` : '—'}</td>
                <td>
                  {drift != null
                    ? <span className={parseFloat(drift) > 0 ? 'drift-pos' : 'drift-neg'}>{drift > 0 ? '+' : ''}{drift}%</span>
                    : '—'}
                </td>
                <td>
                  <span className={`rating-badge rating-${rating || 'HOLD'}`}>{rating || '—'}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── DNA tab ───────────────────────────────────────────────────────────────────
function DnaTab({ dna, notes }) {
  if (!dna) {
    return (
      <div className="empty-state">
        DNA not yet extracted. Call <code>GET /clients/&#123;id&#125;/dna</code> to generate it.
      </div>
    )
  }

  const TagList = ({ items, variant }) => (
    <div className="tag-list">
      {(items || []).map((t, i) => <span key={i} className={`tag ${variant || ''}`}>{t}</span>)}
    </div>
  )

  return (
    <>
      <div className="card">
        <div className="card-title">Investment DNA</div>
        <div className="dna-grid">
          <div className="dna-field" style={{ gridColumn: '1 / -1' }}>
            <label>Values & Priorities</label>
            <TagList items={dna.values} variant="gold" />
          </div>
          <div className="dna-field">
            <label>Risk Style</label>
            <p>{dna.risk_style || '—'}</p>
          </div>
          <div className="dna-field">
            <label>Communication</label>
            <p>{dna.communication_style || '—'}</p>
          </div>
          <div className="dna-field" style={{ gridColumn: '1 / -1' }}>
            <label>Avoid</label>
            <TagList items={dna.avoid} variant="red" />
          </div>
          <div className="dna-field" style={{ gridColumn: '1 / -1' }}>
            <label>Red Flags</label>
            <TagList items={dna.red_flags} variant="red" />
          </div>
          <div className="dna-field">
            <label>Preferred Sectors</label>
            <TagList items={dna.preferred_sectors} variant="green" />
          </div>
          <div className="dna-field">
            <label>Family Context</label>
            <p>{dna.family_context || '—'}</p>
          </div>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="card">
          <div className="card-title">CRM Notes ({notes.length})</div>
          {notes.slice(0, 5).map((n, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < notes.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{n.date || 'No date'}</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>{n.note}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
