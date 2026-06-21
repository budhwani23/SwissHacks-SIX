const BASE = 'http://localhost:8000'

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const api = {
  getClients:          ()              => req('/clients'),
  getClient:           (id)            => req(`/clients/${id}`),
  getDna:              (id)            => req(`/clients/${id}/dna`),
  getPortfolio:        (id)            => req(`/clients/${id}/portfolio`),
  getAlerts:           (id)            => req(`/clients/${id}/alerts`),
  getAllAlerts:         ()              => req('/alerts'),
  runAnalysis:         ()              => req('/alerts/run-analysis', { method: 'POST' }),
  runClientAnalysis:   (id)            => req(`/clients/${id}/run-analysis`, { method: 'POST' }),
  clearAlerts:         ()              => req('/alerts', { method: 'DELETE' }),
  updateAlertStatus:   (id, status)    => req(`/alerts/${id}/status`, {
                                            method: 'PATCH',
                                            body: JSON.stringify({ status }),
                                          }),
  generateMessage:     (id, alertId, tone) => req(`/clients/${id}/generate-message`, {
                                            method: 'POST',
                                            body: JSON.stringify({ alert_id: alertId, tone }),
                                          }),
  getMessages:         (id)            => req(`/clients/${id}/messages`),
  approveMessage:      (msgId)         => req(`/messages/${msgId}/approve`, { method: 'POST' }),
  getReplacement:      (id, issuer)    => req(`/clients/${id}/replacement?issuer=${encodeURIComponent(issuer)}`),
  getNews:             ()              => req('/news'),
  refreshNews:         (companies)     => req(`/news/refresh?live=true&companies=${encodeURIComponent(companies)}`, { method: 'POST' }),
  getCioRecs:          (sector, mandate) => req(`/cio-recommendations${sector ? `?sector=${sector}` : ''}${mandate ? `&mandate=${mandate}` : ''}`),

  // ── Voice assistant ──
  voiceStatus:         ()                  => req('/voice/status'),
  transcribe:          (audioBase64, mimeType = 'audio/wav') =>
                          req('/voice/transcribe', { method: 'POST', body: JSON.stringify({ audio_base64: audioBase64, mime_type: mimeType }) }),
  interpret:           (payload)           => req('/voice/interpret', { method: 'POST', body: JSON.stringify(payload) }),
  speak:               async (text, voice) => {
                          const res = await fetch(BASE + '/voice/speak', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text, voice }),
                          })
                          if (!res.ok) {
                            const err = await res.json().catch(() => ({ detail: res.statusText }))
                            throw new Error(err.detail || 'TTS failed')
                          }
                          return res.blob()
                        },
}
