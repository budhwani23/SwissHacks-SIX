import { useState } from 'react'
import { CLIENT_META, computeTrustScore, priorityDot } from '../constants'

// Rank colours matching the design: red → orange → amber → blue → grey
const RANK_COLORS = ['#e53e3e', '#dd6b20', '#d69e2e', '#3182ce', '#718096', '#a0aec0']

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function LandingPage({ clients, loading, onSelect, isExiting }) {
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
        <span className="logo-six">SIX</span>
        <span className="logo-gnals">gnals</span>
        <span className="logo-icon">✓</span>
      </div>

      {/* ── Greeting ── */}
      <div className="landing-greeting">
        <h1>{getGreeting()}, Alex 👋</h1>
        <p>Here are your top client <span className="highlight">risk priorities</span> for today.</p>
      </div>

      {/* ── Carousel ── */}
      <div className="carousel-wrap">
        <button
          className="carousel-arrow left"
          onClick={prev}
          disabled={!canPrev}
        >‹</button>

        {loading ? (
          <div className="landing-loading">
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
              const { dot }    = priorityDot(client)
              const isCenter   = idx === Math.floor(VISIBLE / 2) - (VISIBLE < 4 ? 0 : 1)

              return (
                <div
                  key={client.id}
                  className={`client-card-landing${isCenter ? ' center' : ''}`}
                  onClick={() => onSelect(client.id)}
                  style={{ '--rank-color': color }}
                >
                  {/* Rank number */}
                  <div className="rank-number" style={{ color }}>
                    {String(globalRank + 1).padStart(2, '0')}
                  </div>
                  <div className="rank-underline" style={{ background: color }} />

                  {/* Avatar */}
                  <div
                    className="landing-avatar"
                    style={{ background: meta?.color || '#718096' }}
                  >
                    {meta?.avatar || client.name[0]}
                  </div>

                  {/* Name */}
                  <div className="landing-client-name">{client.name}</div>

                  {/* Status dot */}
                  {client.open_alerts > 0 && (
                    <div className="landing-alert-dot" style={{ color }}>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
