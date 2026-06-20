import { useMemo, useState } from 'react'
import { buildConstellation } from '../utils/constellation'
import { trustColor } from '../constants'

// Deterministic scatter offsets around a cluster anchor.
function scatter(seed, n, spreadX, spreadY) {
  const pts = []
  let a = seed
  const rand = () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff
    return a / 0x7fffffff
  }
  for (let i = 0; i < n; i++) {
    const ang = rand() * Math.PI * 2
    const rad = 0.45 + rand() * 0.55
    pts.push({ dx: Math.cos(ang) * spreadX * rad, dy: Math.sin(ang) * spreadY * rad })
  }
  return pts
}

// Fixed quadrant anchors for each band (matches the design layout).
const ANCHORS = {
  atrisk:    { cx: 235, cy: 180, rx: 150, ry: 112 },
  growing:   { cx: 555, cy: 180, rx: 150, ry: 112 },
  stable:    { cx: 400, cy: 332, rx: 118, ry: 92 },
  attention: { cx: 235, cy: 410, rx: 150, ry: 108 },
}

function momentumTag(m) {
  if (m > 0.15) return { txt: 'Growing', cls: 'mom-up' }
  if (m < -0.15) return { txt: 'Declining', cls: 'mom-down' }
  return { txt: 'Stable', cls: 'mom-flat' }
}

export default function TrustConstellation({ clients, onClose, onSelectClient }) {
  const { groups, focus, total } = useMemo(() => buildConstellation(clients), [clients])
  const [activeBand, setActiveBand] = useState(null)

  const active = activeBand ? groups.find(g => g.key === activeBand) : null

  return (
    <div className="tc-overlay" onClick={onClose}>
      <div className="tc-panel" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="tc-header">
          <div>
            <h2>Trust Constellation</h2>
            <p>{total} clients · grouped by trust momentum. Click a cluster to see the profiles.</p>
          </div>
          <button className="tc-close" onClick={onClose}>×</button>
        </div>

        <div className="tc-body">
          {/* ── Chart ── */}
          <div className="tc-chart-wrap">
            <svg viewBox="0 0 720 540" className="tc-svg" preserveAspectRatio="xMidYMid meet">
              {/* axis labels */}
              <text x="22" y="58" className="tc-axis-cap">HIGH</text>
              <text x="22" y="498" className="tc-axis-cap">LOW</text>
              <text x="34" y="300" className="tc-axis-title" transform="rotate(-90 34 300)">Client Value (AUM)</text>

              <text x="70" y="528" className="tc-axis-cap">DECLINING</text>
              <text x="360" y="528" className="tc-axis-cap" textAnchor="middle">STABLE</text>
              <text x="700" y="528" className="tc-axis-cap" textAnchor="end">GROWING</text>
              <text x="385" y="540" className="tc-axis-title" textAnchor="middle" dy="-2">Trust Momentum</text>

              {/* frame + crosshair */}
              <line x1="62" y1="48" x2="62" y2="500" className="tc-axis" />
              <line x1="62" y1="500" x2="708" y2="500" className="tc-axis" />
              <line x1="385" y1="60" x2="385" y2="500" className="tc-grid" />
              <line x1="62" y1="278" x2="708" y2="278" className="tc-grid" />

              {/* clusters */}
              {groups.map((g) => {
                const a = ANCHORS[g.key]
                const dots = scatter(g.key.charCodeAt(0) * 97 + g.count, Math.min(g.count, 8), a.rx * 0.78, a.ry * 0.78)
                const isActive = activeBand === g.key
                return (
                  <g
                    key={g.key}
                    className={`tc-cluster${isActive ? ' active' : ''}`}
                    onClick={() => setActiveBand(g.key)}
                  >
                    <ellipse cx={a.cx} cy={a.cy} rx={a.rx} ry={a.ry} fill={g.soft}
                      stroke={g.color} strokeOpacity="0.25" />
                    {dots.map((d, i) => (
                      <circle key={i} cx={a.cx + d.dx} cy={a.cy + d.dy} r="4.5"
                        fill={g.color} fillOpacity="0.7" />
                    ))}
                    <circle cx={a.cx} cy={a.cy} r="40" fill={g.color} className="tc-count-circle" />
                    <text x={a.cx} y={a.cy + 9} textAnchor="middle" className="tc-count-num">{g.count}</text>
                    <text x={a.cx} y={a.cy + a.ry + 22} textAnchor="middle" className="tc-cluster-label"
                      fill={g.color}>{g.label}</text>
                    <text x={a.cx} y={a.cy + a.ry + 42} textAnchor="middle" className="tc-cluster-aum">
                      CHF {g.totalAum.toFixed(1)}M
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          {/* ── Sidebar ── */}
          <div className="tc-side">
            {!active ? (
              <>
                <div className="tc-side-title">FOCUS TODAY</div>
                <div className="tc-focus-list">
                  {focus.map((c, i) => (
                    <div
                      key={c.id}
                      className={`tc-focus-row${c.real ? ' clickable' : ''}`}
                      onClick={() => c.real && onSelectClient?.(c.id)}
                    >
                      <span className="tc-focus-rank">{i + 1}</span>
                      <span className="tc-avatar" style={{ background: c.color }}>{c.initials}</span>
                      <div className="tc-focus-meta">
                        <div className="tc-focus-name">{c.name}</div>
                        <div className="tc-focus-aum">CHF {c.aum.toFixed(1)}M</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="tc-hint">Tip: click any cluster bubble on the left to drill into that group.</div>
              </>
            ) : (
              <>
                <button className="tc-back" onClick={() => setActiveBand(null)}>‹ Back</button>
                <div className="tc-side-title" style={{ color: active.color }}>
                  {active.label} · {active.count}
                </div>
                <div className="tc-band-sub">Total AUM · CHF {active.totalAum.toFixed(1)}M</div>
                <div className="tc-card-list">
                  {active.members.map((c) => {
                    const mt = momentumTag(c.momentum)
                    return (
                      <div
                        key={c.id}
                        className={`tc-profile${c.real ? ' clickable' : ''}`}
                        onClick={() => c.real && onSelectClient?.(c.id)}
                      >
                        <span className="tc-avatar" style={{ background: c.color }}>{c.initials}</span>
                        <div className="tc-profile-meta">
                          <div className="tc-profile-name">
                            {c.name}{c.real && <span className="tc-real-badge">client</span>}
                          </div>
                          <div className="tc-profile-sub">
                            CHF {c.aum.toFixed(1)}M · <span className={mt.cls}>{mt.txt}</span>
                          </div>
                        </div>
                        <span className="tc-trust-pill" style={{ color: trustColor(c.trust), borderColor: trustColor(c.trust) }}>
                          {c.trust}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
