const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

export const api = {
  clients: () => request('/clients'),
  client: id => request(`/clients/${encodeURIComponent(id)}`),
  dna: id => request(`/clients/${encodeURIComponent(id)}/dna`),
  portfolio: id => request(`/clients/${encodeURIComponent(id)}/portfolio`),
  alerts: id => request(`/clients/${encodeURIComponent(id)}/alerts`),
  allAlerts: () => request('/alerts'),
  messages: id => request(`/clients/${encodeURIComponent(id)}/messages`),
  news: () => request('/news'),
  recommendations: (sector = '', mandate = '') => {
    const params = new URLSearchParams()
    if (sector) params.set('sector', sector)
    if (mandate) params.set('mandate', mandate)
    return request(`/cio-recommendations${params.size ? `?${params}` : ''}`)
  },
  runAnalysis: (id, minScore = 30) => request(`/clients/${encodeURIComponent(id)}/run-analysis?min_score=${minScore}`, { method: 'POST' }),
  runAllAnalysis: (minScore = 30) => request(`/alerts/run-analysis?min_score=${minScore}`, { method: 'POST' }),
  updateAlert: (id, status) => request(`/alerts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  generateMessage: (clientId, alertId, tone = 'values-led') => request(`/clients/${encodeURIComponent(clientId)}/generate-message`, { method: 'POST', body: JSON.stringify({ alert_id: alertId, tone }) }),
  approveMessage: messageId => request(`/messages/${messageId}/approve`, { method: 'POST' }),
  replacement: (clientId, issuer) => request(`/clients/${encodeURIComponent(clientId)}/replacement?issuer=${encodeURIComponent(issuer)}`),
  refreshNews: (companies, live = true) => request(`/news/refresh?live=${live}&companies=${encodeURIComponent(companies)}`, { method: 'POST' }),
  sqlQuery: (question, summarise = true) => request('/sql-agent/query', { method: 'POST', body: JSON.stringify({ question, summarise }) }),
}

export async function loadClientWorkspace(clientId) {
  const keys = ['client', 'portfolio', 'alerts', 'messages']
  const calls = [api.client(clientId), api.portfolio(clientId), api.alerts(clientId), api.messages(clientId)]
  const results = await Promise.allSettled(calls)
  return Object.fromEntries(results.map((result, i) => [keys[i], result.status === 'fulfilled' ? result.value : null]))
}
