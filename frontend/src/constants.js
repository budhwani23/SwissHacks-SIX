// Per-client metadata — age, wealth, and tone guidance for message generation
// These are injected into the LLM tone prompt so notes adapt to the person
export const CLIENT_META = {
  schneider: {
    age: 58,
    wealth: 'CHF 1.8M',
    wealth_tier: 'HNW',
    tone_context: 'Client is 58 years old, HNW. Write warmly and with empathy. Reference their personal foundation and deep commitment to healthcare and Parkinson\'s research. Values-led tone.',
    avatar: 'S',
    color: '#4A90D9',
  },
  huber: {
    age: 52,
    wealth: 'CHF 2.1M',
    wealth_tier: 'HNW',
    tone_context: 'Client is 52 years old, HNW. Be factual, data-driven and brief. Reference ESG metrics and sustainability outcomes specifically. No fluff.',
    avatar: 'H',
    color: '#38a169',
  },
  raeber: {
    age: 68,
    wealth: 'CHF 2.4M',
    wealth_tier: 'UHNW',
    tone_context: 'Client is 68 years old, UHNW, retired CFO. Use a formal, precise and respectful tone. Capital preservation is the only priority. Never mention speculative assets or AI stocks.',
    avatar: 'R',
    color: '#E8A838',
  },
  ammann: {
    age: 34,
    wealth: 'CHF 1.1M',
    wealth_tier: 'HNW',
    tone_context: 'Client is 34 years old, HNW, tech entrepreneur. Be direct and punchy. Use concise bullet points. Growth-oriented framing. Tech-literate — no need to over-explain.',
    avatar: 'A',
    color: '#9B59B6',
  },
}

// Deterministic per-client variance (-18..+18) derived from the client id.
// Without this every client lands on the same base score before alerts exist,
// which made all trust scores identical. The hash keeps the value stable
// across renders while still differing from client to client.
export function clientVariance(id) {
  const s = String(id || '')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return (h % 37) - 18   // range: -18 .. +18
}

// Trust score: formula based on engagement + portfolio alignment signals
// plus a stable per-client offset so scores vary between clients.
// Frontend-only computation — no backend needed
export function computeTrustScore(client, notesCount, hasDna) {
  const base = 50
  const engagementBonus = Math.min(notesCount * 4, 20)  // more notes = more RM engagement
  const dnaBonus = hasDna ? 12 : 0                       // DNA extracted = RM knows the client
  const alertPenalty = (client.high_severity_alerts * 10) + (client.open_alerts * 3)
  const variance = clientVariance(client.id)            // stable per-client offset
  return Math.min(99, Math.max(18, base + engagementBonus + dnaBonus - alertPenalty + variance))
}

export function trustColor(score) {
  if (score >= 72) return '#38a169'
  if (score >= 48) return '#d69e2e'
  return '#e53e3e'
}

export function trustLabel(score) {
  if (score >= 72) return 'Strong'
  if (score >= 48) return 'Moderate'
  return 'At Risk'
}

// Trust bands used by the Trust Constellation view. Each band is a contiguous
// trust-score range, so "clicking the number" shows exactly the clients whose
// score falls in that band.
export const TRUST_BANDS = [
  { key: 'growing',   label: 'GROWING TRUST',    min: 72, max: 100, color: '#2f6b4f', soft: '#e7f0ea' },
  { key: 'stable',    label: 'STABLE',           min: 55, max: 71,  color: '#33415c', soft: '#eceef2' },
  { key: 'attention', label: 'ATTENTION NEEDED', min: 40, max: 54,  color: '#b08a32', soft: '#f3ecd6' },
  { key: 'atrisk',    label: 'AT RISK',          min: 0,  max: 39,  color: '#9c3b46', soft: '#f4e4e6' },
]

export function trustBand(score) {
  return TRUST_BANDS.find(b => score >= b.min && score <= b.max) || TRUST_BANDS[1]
}

export function priorityDot(client) {
  if (client.high_severity_alerts >= 2) return { dot: '🔴', label: 'Critical' }
  if (client.high_severity_alerts === 1) return { dot: '🔴', label: 'High' }
  if (client.open_alerts > 0) return { dot: '🟡', label: 'Medium' }
  return { dot: '🟢', label: 'Clear' }
}

export const TONE_OPTIONS = [
  { label: 'Warm & Personal', value: 'values-led' },
  { label: 'Analytical', value: 'analytical' },
  { label: 'Concise', value: 'concise' },
  { label: 'Detailed', value: 'detailed' },
]

export const SEVERITY_STYLE = {
  High:                  { color: '#c53030', bg: '#fff5f5', border: '#fc8181' },
  Medium:                { color: '#c05621', bg: '#fffaf0', border: '#f6ad55' },
  Low:                   { color: '#b7791f', bg: '#fffff0', border: '#faf089' },
  'Positive opportunity':{ color: '#276749', bg: '#f0fff4', border: '#9ae6b4' },
  'CIO conflict':        { color: '#553c9a', bg: '#faf5ff', border: '#d6bcfa' },
  'ESG conflict':        { color: '#c05621', bg: '#fffaf0', border: '#f6ad55' },
  'Personal conflict':   { color: '#c53030', bg: '#fff5f5', border: '#fc8181' },
  'Portfolio conflict':  { color: '#2c5282', bg: '#ebf8ff', border: '#90cdf4' },
}
