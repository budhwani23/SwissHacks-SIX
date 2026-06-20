/**
 * pdfReport.js
 * Generates a beautiful Swiss-banking-style PDF report by opening a styled
 * HTML page in a new window and triggering the browser's native Print → Save as PDF.
 * No external libraries needed — works in every modern browser.
 */

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('de-CH')
}

function tags(arr = [], color = '#2c5282', bg = '#ebf8ff') {
  if (!arr.length) return '<span style="color:#a0aec0">—</span>'
  return arr.map(t =>
    `<span style="display:inline-block;background:${bg};color:${color};
      border:1px solid ${color}22;border-radius:20px;
      padding:2px 10px;font-size:11px;font-weight:500;margin:2px 3px 2px 0">
      ${t}
    </span>`
  ).join('')
}

const SEVERITY_COLOR = {
  High:                   '#c53030',
  Medium:                 '#c05621',
  Low:                    '#b7791f',
  'Positive opportunity': '#276749',
  'CIO conflict':         '#553c9a',
  'ESG conflict':         '#c05621',
  'Personal conflict':    '#c53030',
  'Portfolio conflict':   '#2c5282',
}

function alertBlock(alert) {
  const color = SEVERITY_COLOR[alert.alert_type] || SEVERITY_COLOR[alert.severity] || '#2c5282'
  return `
    <div style="border-left:4px solid ${color};padding:12px 16px;margin-bottom:14px;
                background:${color}08;border-radius:0 8px 8px 0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:12px;font-weight:700;color:${color};text-transform:uppercase;
                     letter-spacing:.5px">
          ${alert.alert_type}
        </span>
        <span style="font-size:11px;color:#718096;margin-left:auto">
          ${alert.severity} · Confidence ${alert.confidence}%
        </span>
      </div>
      <div style="font-size:14px;font-weight:600;color:#1a202c;margin-bottom:4px">
        ${alert.holding}
      </div>
      ${alert.news_headline ? `
        <div style="font-size:12px;color:#718096;font-style:italic;margin-bottom:6px">
          "${alert.news_headline}"
        </div>` : ''}
      <div style="font-size:13px;color:#4a5568;line-height:1.6;margin-bottom:6px">
        ${alert.reason}
      </div>
      <div style="font-size:12px;color:${color};font-weight:500">
        → ${alert.recommended_action}
      </div>
    </div>`
}

function buildHTML({ client, meta, dna, openAlerts, notes, message }) {
  const now        = new Date()
  const dateStr    = now.toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })
  const refNum     = `ADV-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${client?.id?.toUpperCase()}`
  const clientName = client?.name || '—'
  const strategy   = client?.strategy || '—'
  const age        = meta?.age || '—'
  const wealth     = meta?.wealth || '—'
  const tier       = meta?.wealth_tier || '—'
  const initial    = clientName[0] || '?'
  const avatarBg   = { schneider:'#4A90D9', huber:'#38a169', raeber:'#E8A838', ammann:'#9B59B6' }[client?.id] || '#718096'

  // Trust score
  const totalAlerts = openAlerts.length
  const highAlerts  = openAlerts.filter(a => a.severity === 'High').length
  const trustScore  = Math.min(99, Math.max(18,
    50 + Math.min((notes?.length || 0) * 4, 20) + (dna ? 12 : 0) - highAlerts * 10 - totalAlerts * 3
  ))
  const trustColor  = trustScore >= 72 ? '#38a169' : trustScore >= 48 ? '#d69e2e' : '#e53e3e'
  const trustLabel  = trustScore >= 72 ? 'Strong' : trustScore >= 48 ? 'Moderate' : 'At Risk'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Advisory Report — ${clientName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    @page { size: A4; margin: 0; }
    @media print {
      body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page { box-shadow: none; margin: 0; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: #e8ecf0;
      color: #1a202c;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 20px auto;
      background: #fff;
      box-shadow: 0 8px 40px rgba(0,0,0,.18);
      position: relative;
      overflow: hidden;
    }

    /* ── Header ── */
    .header {
      background: #0f2744;
      padding: 28px 40px 22px;
      color: #fff;
      position: relative;
    }
    .header::after {
      content: '';
      position: absolute; bottom: 0; left: 0; right: 0;
      height: 3px; background: #e4161e;
    }
    .header-top { display: flex; align-items: flex-start; justify-content: space-between; }
    .logo-wrap { display: flex; align-items: center; gap: 4px; margin-bottom: 16px; }
    .logo-six   { font-size: 20px; font-weight: 800; color: #e4161e; letter-spacing: -.5px; }
    .logo-gnals { font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -.5px; }
    .logo-check { font-size: 13px; color: #e4161e; margin-left: 3px; }
    .header-meta { text-align: right; font-size: 11px; color: #94a3b8; line-height: 1.7; }
    .header-title { font-size: 22px; font-weight: 700; color: #fff; }
    .header-sub   { font-size: 12px; color: #94a3b8; margin-top: 3px; }

    /* ── Client band ── */
    .client-band {
      display: flex; align-items: center; gap: 24px;
      padding: 24px 40px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .client-avatar {
      width: 64px; height: 64px; border-radius: 50%;
      background: ${avatarBg};
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; font-weight: 700; color: #fff;
      flex-shrink: 0;
    }
    .client-info { flex: 1; }
    .client-info h2 { font-size: 22px; font-weight: 700; color: #0f2744; }
    .client-info p  { font-size: 13px; color: #718096; margin-top: 3px; }
    .trust-wrap { text-align: center; }
    .trust-circle {
      width: 68px; height: 68px; border-radius: 50%;
      border: 4px solid ${trustColor};
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      margin: 0 auto 4px;
    }
    .trust-num   { font-size: 20px; font-weight: 800; color: ${trustColor}; line-height: 1; }
    .trust-lbl   { font-size: 9px; color: #718096; letter-spacing: .5px; font-weight: 600; text-transform: uppercase; margin-top: 1px; }
    .trust-title { font-size: 10px; color: #a0aec0; letter-spacing: .5px; text-transform: uppercase; }

    /* ── Sections ── */
    .body { padding: 28px 40px; }
    .section { margin-bottom: 26px; }
    .section-title {
      font-size: 10px; font-weight: 700; letter-spacing: 1.2px;
      text-transform: uppercase; color: #718096;
      border-bottom: 1px solid #e2e8f0; padding-bottom: 7px;
      margin-bottom: 14px; display: flex; align-items: center; gap: 8px;
    }
    .section-title::before {
      content: ''; display: block; width: 14px; height: 3px;
      background: #c9a84c; border-radius: 2px;
    }

    /* DNA grid */
    .dna-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .dna-item label {
      font-size: 10px; font-weight: 700; color: #a0aec0;
      letter-spacing: .6px; text-transform: uppercase; display: block;
      margin-bottom: 5px;
    }
    .dna-item p { font-size: 12px; color: #4a5568; line-height: 1.5; }
    .dna-item.full { grid-column: 1 / -1; }

    /* Note box */
    .note-box {
      background: #f7fafc; border: 1px solid #e2e8f0;
      border-left: 4px solid #c9a84c;
      border-radius: 0 8px 8px 0;
      padding: 20px 22px; font-size: 13px;
      line-height: 1.8; color: #2d3748;
      white-space: pre-wrap;
    }

    /* ── Footer ── */
    .footer {
      background: #0f2744; color: #94a3b8;
      padding: 14px 40px; font-size: 10px; line-height: 1.6;
      border-top: 3px solid #c9a84c;
    }
    .footer-row { display: flex; justify-content: space-between; align-items: center; }
    .footer strong { color: #c9a84c; }
    .confidential {
      display: inline-block; border: 1px solid #c9a84c;
      color: #c9a84c; font-size: 9px; font-weight: 700;
      letter-spacing: 1px; padding: 2px 8px; border-radius: 3px;
    }

    /* Print button */
    .print-btn {
      position: fixed; bottom: 28px; right: 28px;
      background: #0f2744; color: #c9a84c;
      border: none; border-radius: 8px; padding: 12px 24px;
      font-size: 14px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.2);
      font-family: 'Inter', sans-serif;
      transition: background .15s;
    }
    .print-btn:hover { background: #162f52; }
  </style>
</head>
<body>

<div class="page">

  <!-- ── Header ── -->
  <div class="header">
    <div class="header-top">
      <div>
        <div class="logo-wrap">
          <span class="logo-six">SIX</span>
          <span class="logo-gnals">gnals</span>
          <span class="logo-check">●</span>
        </div>
        <div class="header-title">SIXgnals Relationship Manager Report</div>
        <div class="header-sub">AI-Assisted Client Intelligence · Strictly Confidential</div>
      </div>
      <div class="header-meta">
        <div><strong style="color:#fff">Date:</strong> ${dateStr}</div>
        <div><strong style="color:#fff">Ref:</strong> ${refNum}</div>
        <div><strong style="color:#fff">Prepared by:</strong> SIXgnal Relationship Manager</div>
        <div style="margin-top:6px">
          <span class="confidential">CONFIDENTIAL</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Client band ── -->
  <div class="client-band">
    <div class="client-avatar">${initial}</div>
    <div class="client-info">
      <h2>${clientName}</h2>
      <p>${strategy} Mandate &nbsp;·&nbsp; Age ${age} &nbsp;·&nbsp; ${tier} Client &nbsp;·&nbsp; ${wealth}</p>
      ${dna?.communication_style ? `<p style="margin-top:5px;font-size:12px;color:#4a5568">Communication: <em>${dna.communication_style}</em></p>` : ''}
    </div>
    <div class="trust-wrap">
      <div class="trust-circle">
        <div class="trust-num">${trustScore}</div>
        <div class="trust-lbl">${trustLabel}</div>
      </div>
      <div class="trust-title">Trust Index</div>
    </div>
  </div>

  <div class="body">

    <!-- ── Client DNA ── -->
    ${dna ? `
    <div class="section">
      <div class="section-title">Client DNA Profile</div>
      <div class="dna-grid">
        <div class="dna-item full">
          <label>Values &amp; Priorities</label>
          <div>${tags(dna.values, '#975a16', '#fffff0')}</div>
        </div>
        <div class="dna-item">
          <label>Risk Style</label>
          <p>${dna.risk_style || '—'}</p>
        </div>
        <div class="dna-item">
          <label>Family Context</label>
          <p>${dna.family_context || '—'}</p>
        </div>
        <div class="dna-item">
          <label>Topics to Avoid</label>
          <div>${tags(dna.avoid, '#c53030', '#fff5f5')}</div>
        </div>
        <div class="dna-item">
          <label>Red Flags</label>
          <div>${tags(dna.red_flags, '#c53030', '#fff5f5')}</div>
        </div>
        <div class="dna-item full">
          <label>Preferred Sectors</label>
          <div>${tags(dna.preferred_sectors, '#276749', '#f0fff4')}</div>
        </div>
      </div>
    </div>` : ''}

    <!-- ── Alerts ── -->
    ${openAlerts.length > 0 ? `
    <div class="section">
      <div class="section-title">Active Portfolio Alerts (${openAlerts.length})</div>
      ${openAlerts.map(alertBlock).join('')}
    </div>` : ''}

    <!-- ── Advisory Note ── -->
    ${message?.content ? `
    <div class="section">
      <div class="section-title">Advisory Note — Draft for RM Review</div>
      <div class="note-box">${message.content}</div>
      ${message.approved ? '<p style="margin-top:8px;font-size:11px;color:#38a169;font-weight:600">✓ Approved by RM</p>' : ''}
    </div>` : ''}

  </div>

  <!-- ── Footer ── -->
  <div class="footer">
    <div class="footer-row">
      <div>
        <strong>SIXgnals Relationship Manager</strong> — Trust for Wealth<br/>
        This report is AI-assisted. All recommendations require RM review and approval before any client communication.
        Past performance is not indicative of future results. This document does not constitute investment advice.
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:24px">
        <span class="confidential">CONFIDENTIAL</span><br/>
        <span style="font-size:9px;margin-top:4px;display:block">${dateStr}</span>
      </div>
    </div>
  </div>

</div>

<!-- Print button (hidden when printing) -->
<button class="print-btn no-print" onclick="window.print()">
  ↓ Save as PDF
</button>

<script>
  // Auto-focus so Cmd+P / Ctrl+P works immediately
  window.focus()
</script>
</body>
</html>`
}

/**
 * Opens a new window with the beautiful report and triggers the browser's
 * native "Print → Save as PDF" dialog.
 */
export function downloadPDF({ client, meta, dna, alerts, notes, message }) {
  const openAlerts = (alerts || []).filter(a => a.status === 'open')
  const html = buildHTML({ client, meta, dna, openAlerts, notes, message })

  const win = window.open('', '_blank', 'width=900,height=750')
  if (!win) {
    alert('Please allow popups for this site to generate the PDF report.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}
