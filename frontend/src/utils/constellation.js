// ── Trust Constellation data ──────────────────────────────────────────────
// Builds the roster that powers the constellation view: the real clients from
// the API plus a deterministic set of demo clients so the chart looks populated
// like the design. Everything is seeded, so the layout is stable across renders.

import { CLIENT_META, computeTrustScore, TRUST_BANDS, trustBand } from '../constants'

// Small seeded PRNG (mulberry32) → stable pseudo-random numbers.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Anna', 'Lukas', 'Sophie', 'Marco', 'Lena', 'Felix', 'Nina', 'Jonas', 'Clara', 'David',
  'Mia', 'Elias', 'Sara', 'Noah', 'Lara', 'Tim', 'Eva', 'Paul', 'Ida', 'Leo',
  'Maya', 'Finn', 'Ruth', 'Jan', 'Vera', 'Max', 'Iris', 'Ben', 'Tina', 'Otto']

const LAST = ['Müller', 'Meier', 'Keller', 'Weber', 'Schmid', 'Fischer', 'Brunner', 'Baumann', 'Frei',
  'Gerber', 'Steiner', 'Graf', 'Roth', 'Moser', 'Widmer', 'Wyss', 'Suter', 'Marti', 'Bachmann',
  'Hofer', 'Berger', 'Kunz', 'Lang', 'Egli', 'Vogel', 'Bühler', 'Frey', 'Sommer', 'Zimmermann', 'Arnold',
  'Bianchi', 'Rossi', 'Favre', 'Blanc', 'Good', 'Lehmann', 'Haas', 'Koch', 'Stern', 'Imhof']

const AVATAR_COLORS = ['#4A90D9', '#38a169', '#E8A838', '#9B59B6', '#e07a5f', '#3d7a6b', '#5b6b8c', '#c25b6a']

// Wealth string from CLIENT_META is a portfolio figure; the constellation shows
// AUM in CHF millions, so we give the real clients a representative AUM.
const REAL_AUM = { schneider: 18.2, huber: 9.4, raeber: 24.1, ammann: 28.4 }

function initials(name) {
  const parts = name.replace('.', '').split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Pick a trust score inside a band's range using a seeded roll.
function scoreInBand(band, r) {
  const lo = Math.max(18, band.min)
  const hi = Math.min(99, band.max)
  return Math.round(lo + r * (hi - lo))
}

function aumForBand(bandKey, r) {
  // Higher-value clients cluster in growing/at-risk; attention skews smaller.
  switch (bandKey) {
    case 'growing':   return +(3 + r * 12).toFixed(1)
    case 'atrisk':    return +(8 + r * 22).toFixed(1)
    case 'attention': return +(1 + r * 8).toFixed(1)
    default:          return +(2 + r * 9).toFixed(1)   // stable
  }
}

// Target distribution mirrors the design (≈100 clients).
const TARGETS = { growing: 13, stable: 72, attention: 11, atrisk: 4 }

export function buildConstellation(liveClients = []) {
  const r = rng(20260620)

  // 1. Real clients → nodes, with trust from the app's own formula.
  const real = liveClients.map((c) => {
    const score = computeTrustScore(c, c.open_alerts > 0 ? 3 : 6, !!c.personal_theme)
    const meta = CLIENT_META[c.id]
    return {
      id: c.id,
      name: c.name,
      initials: meta?.avatar || initials(c.name),
      color: meta?.color || '#5b6b8c',
      photo: meta?.photo || null,
      aum: REAL_AUM[c.id] ?? +(2 + r() * 20).toFixed(1),
      trust: score,
      momentum: +((r() * 2 - 1).toFixed(2)),
      real: true,
      band: trustBand(score).key,
    }
  })

  // 2. Count reals per band, then fill remaining quota with demo clients.
  const counts = {}
  real.forEach(n => { counts[n.band] = (counts[n.band] || 0) + 1 })

  const demo = []
  let n = 0
  for (const band of TRUST_BANDS) {
    const need = Math.max(0, (TARGETS[band.key] || 0) - (counts[band.key] || 0))
    for (let i = 0; i < need; i++) {
      const fn = FIRST[Math.floor(r() * FIRST.length)]
      const ln = LAST[Math.floor(r() * LAST.length)]
      const name = `${fn} ${ln}`
      const trust = scoreInBand(band, r())
      demo.push({
        id: `demo-${n++}`,
        name,
        initials: initials(name),
        color: AVATAR_COLORS[Math.floor(r() * AVATAR_COLORS.length)],
        aum: aumForBand(band.key, r()),
        trust,
        momentum: +((r() * 2 - 1).toFixed(2)),
        real: false,
        band: band.key,
      })
    }
  }

  const all = [...real, ...demo]

  // 3. Group by band, richest first within each group.
  const groups = TRUST_BANDS.map(band => {
    const members = all
      .filter(c => c.band === band.key)
      .sort((a, b) => b.aum - a.aum)
    return {
      ...band,
      members,
      count: members.length,
      totalAum: +members.reduce((s, c) => s + c.aum, 0).toFixed(1),
    }
  })

  // 4. FOCUS TODAY = highest-value clients who need attention (at-risk + attention).
  const focus = all
    .filter(c => c.band === 'atrisk' || c.band === 'attention')
    .sort((a, b) => b.aum - a.aum)
    .slice(0, 4)

  return { all, groups, focus, total: all.length }
}
