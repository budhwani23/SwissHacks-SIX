import { CLIENT_META, computeTrustScore, trustColor, priorityDot } from '../constants'
import ProfileAvatar from './ProfileAvatar'

export default function PriorityList({ clients, selectedId, onSelect, onOpenConstellation, loading }) {
  if (loading) {
    return (
      <aside className="left-panel panel">
        <div className="panel-title">CLIENT PRIORITIES</div>
        <div className="loading-state"><div className="spinner" /> Loading…</div>
      </aside>
    )
  }

  return (
    <aside className="left-panel panel" aria-label="Client priorities">
      <div className="panel-title">CLIENT PRIORITIES</div>
      {clients.map((client, idx) => {
        const meta   = CLIENT_META[client.id]
        // Estimate notes count from open_alerts proxy — real count loads with detail
        const score  = computeTrustScore(client, client.open_alerts > 0 ? 3 : 6, !!client.personal_theme)
        const color  = trustColor(score)
        const { dot, label, tone } = priorityDot(client)
        const isActive = client.id === selectedId

        return (
          <div
            key={client.id}
            className={`client-card${isActive ? ' active' : ''}`}
            onClick={() => onSelect(client.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(client.id)}
            role="button"
            tabIndex="0"
            aria-pressed={isActive}
            aria-label={`${client.name}, trust score ${score}, ${client.open_alerts} open alerts`}
          >
            <div className="client-card-top">
              <ProfileAvatar meta={meta} fallback={meta?.avatar || client.name[0]} />
              <div>
                <div className="client-name">
                  {idx + 1}. {client.name}
                </div>
                <div className="client-strategy">{client.strategy} · {meta?.wealth || '—'}</div>
              </div>
              <div className={`priority-dot status-${tone}`} title={label}>{dot}</div>
            </div>

            <div className="client-card-bottom">
              <div className="trust-row">
                <span className="trust-label">Trust</span>
                <div className="trust-bar-wrap">
                  <div className="trust-bar" style={{ width: `${score}%`, background: color }} />
                </div>
                <span
                  className="trust-score-num clickable"
                  style={{ color }}
                  title="View Trust Constellation"
                  onClick={(e) => { e.stopPropagation(); onOpenConstellation?.() }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      onOpenConstellation?.()
                    }
                  }}
                  role="button"
                  tabIndex="0"
                  aria-label={`Trust score ${score}. Open Trust Constellation`}
                >{score}</span>
              </div>
              <div className={`alert-count${client.open_alerts > 0 ? ' has-alerts' : ''}`}>
                {client.open_alerts > 0 ? `${client.open_alerts} alert${client.open_alerts > 1 ? 's' : ''}` : 'Clear'}
              </div>
            </div>
          </div>
        )
      })}
    </aside>
  )
}
