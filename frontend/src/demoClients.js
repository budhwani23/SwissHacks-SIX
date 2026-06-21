// Demo clients shown alongside the 4 real clients on the landing carousel and
// the dashboard priority list. These are frontend-only (the backend is
// untouched); selecting one simply shows empty detail panels.
//
// Each carries varied alert counts / personal_theme so computeTrustScore
// produces a spread of trust scores across all bands instead of one value.

function label(high, open) {
  if (high >= 2) return 'Critical'
  if (high === 1) return 'High'
  if (open > 0) return 'Medium'
  return 'Clear'
}

function mk(id, name, strategy, theme, high, open) {
  return {
    id,
    name,
    strategy,
    personal_theme: theme || null,
    open_alerts: open,
    high_severity_alerts: high,
    alert_label: label(high, open),
    is_demo: true,
  }
}

export const DEMO_CLIENTS = [
  mk('brunner', 'Brunner', 'Growth',    'sustainability, growth', 0, 0),
  mk('widmer',  'Widmer',  'Defensive', 'capital preservation',   0, 1),
  mk('weber',   'Weber',   'Growth',    'tech, innovation',       0, 0),
  mk('baumann', 'Baumann', 'Balanced',  null,                     0, 0),
  mk('graf',    'Graf',    'Defensive', null,                     0, 1),
  mk('keller',  'Keller',  'Defensive', 'income, stability',      0, 1),
  mk('steiner', 'Steiner', 'Growth',    'ESG, equities',          1, 1),
  mk('vogel',   'Vogel',   'Defensive', null,                     1, 1),
  mk('fischer', 'Fischer', 'Growth',    null,                     1, 2),
  mk('frei',    'Frei',    'Balanced',  'healthcare',             1, 2),
  mk('moser',   'Moser',   'Balanced',  null,                     2, 2),
  mk('meier',   'Meier',   'Balanced',  null,                     2, 3),
]
