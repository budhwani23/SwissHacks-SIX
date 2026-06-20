import { useState } from 'react'
import { CLIENT_META, computeTrustScore, priorityDot } from '../constants'
import ProfileAvatar from './ProfileAvatar'
import ThemeToggle from './ThemeToggle'

// Priority scale constrained to the SIXgnals palette: risk red → champagne → slate
const RANK_COLORS = ['#e43f47', '#ce414a', '#a84651', '#46536d', '#626d82', '#7f8999']

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function LandingPage({ clients, loading, onSelect, isExiting, theme, onThemeToggle }) {
  const [current, setCurrent] = useState(0)
  const VISIBLE = Math.min(clients.length, 6)
  const canPrev = current > 0
  const canNext = current + VISIBLE < clients.length

  const prev = () => setCurrent(c => Math.max(0, c - 1))
  const next = () => setCurrent(c => Math.min(clients.length - VISIBLE, c + 1))

  return (
    <div className={`landing${isExiting ? ' landing-exit' : ''}`}>
      {/* ── Logo ── */}
      <div className="landing-logo">
        <img src={theme === 'light' ? '/sixgnals-logo.svg' : '/sixgnals-logo-dark.svg'} alt="SIXgnals" />
      </div>
      <div className="landing-theme-toggle">
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
      </div>

      {/* ── Greeting ── */}
      <div className="landing-greeting">
        <h1>{getGreeting()}</h1>
        <p>Your highest-priority <span className="highlight">client risks</span> for today.</p>
      </div>

      {/* ── Carousel ── */}
      <div className="carousel-wrap">
        <button
          className="carousel-arrow left"
          onClick={prev}
          disabled={!canPrev}
          aria-label="Show previous client priority"
        >‹</button>

        {loading ? (
          <div className="landing-loading" role="status" aria-live="polite">
            <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <span>Loading client priorities…</span>
          </div>
        ) : (
          <div className="carousel-track">
            {clients.slice(current, current + VISIBLE).map((client, idx) => {
              const globalRank = current + idx          // rank in the full sorted list
              const color      = RANK_COLORS[Math.min(globalRank, RANK_COLORS.length - 1)]
              const meta       = CLIENT_META[client.id]
              const score      = computeTrustScore(client, client.open_alerts > 0 ? 3 : 6, !!client.personal_theme)
              const { dot, tone } = priorityDot(client)
              const isCenter   = idx === Math.floor(VISIBLE / 2) - (VISIBLE < 4 ? 0 : 1)

              return (
                <div
                  key={client.id}
                  className={`client-card-landing${isCenter ? ' center' : ''}`}
                  onClick={() => onSelect(client.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(client.id)}
                  role="button"
                  tabIndex="0"
                  aria-label={`Open ${client.name}, priority ${globalRank + 1}, ${client.open_alerts} open alerts`}
                  style={{ '--rank-color': color }}
                >
                  {/* Rank number */}
                  <div className="rank-number" style={{ color }}>
                    {String(globalRank + 1).padStart(2, '0')}
                  </div>
                  <div className="rank-underline" style={{ background: color }} />

                  {/* Avatar */}
                  <ProfileAvatar
                    className="landing-avatar"
                    meta={meta}
                    fallback={meta?.avatar || client.name[0]}
                  />

                  {/* Name */}
                  <div className="landing-client-name">{client.name}</div>

                  {/* Status dot */}
                  {client.open_alerts > 0 && (
                    <div className={`landing-alert-dot status-${tone}`}>
                      {dot} {client.open_alerts} alert{client.open_alerts > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button
          className="carousel-arrow right"
          onClick={next}
          disabled={!canNext}
          aria-label="Show next client priority"
        >›</button>
      </div>

      {/* ── Pagination dots ── */}
      {clients.length > VISIBLE && (
        <div className="carousel-dots">
          {Array.from({ length: clients.length - VISIBLE + 1 }).map((_, i) => (
            <button
              key={i}
              className={`dot${i === current ? ' active' : ''}`}
              onClick={() => setCurrent(i)}
              aria-label={`Show priority page ${i + 1}`}
              aria-current={i === current ? 'true' : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
