/**
 * Admin API origin — same rules as `frontend/src/api.js`.
 *
 * - Local dev: leave `API_BASE_URL` empty so requests use `/api/*` and Vite proxies to `vite.config.js` target.
 * - Production: set `VITE_API_BASE` at build time to your real backend (e.g. https://api.example.com).
 * - Dev but hit remote: set `VITE_FORCE_ENV_API=true` and `VITE_API_BASE=https://...`.
 */
export const API_BASE_URL = ''

const fromFile = String(API_BASE_URL || '').trim().replace(/\/$/, '')
const fromEnv = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '')
const forceEnvInDev = String(import.meta.env.VITE_FORCE_ENV_API || '').toLowerCase() === 'true'
const fromEnvAllowed = !import.meta.env.DEV || forceEnvInDev ? fromEnv : ''

/** Empty → same-origin `/api/*` (Vite dev proxy to backend). */
export const API_ROOT = fromFile || fromEnvAllowed || ''

export function api(path) {
  const p = path.startsWith('/') ? path.slice(1) : path
  return `${API_ROOT}/api/${p}`
}

export const ADMIN_API = {
  login: api('admin/login'),
  metrics: api('admin/metrics'),
  analytics: (days = 14) => api(`admin/analytics?days=${encodeURIComponent(String(days))}`),
  chatbots: (limit = 25) => api(`admin/chatbots?limit=${encodeURIComponent(String(limit))}`),
  trials: (status = 'active', limit = 25) =>
    api(`admin/trials?status=${encodeURIComponent(String(status))}&limit=${encodeURIComponent(String(limit))}`),
  leads: ({ source = '', limit = 100 } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (String(source).trim()) params.set('source', String(source).trim())
    return api(`admin/leads?${params.toString()}`)
  },
  conversations: ({ chatbotId = '', limit = 50 } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (String(chatbotId).trim()) params.set('chatbotId', String(chatbotId).trim())
    return api(`admin/conversations?${params.toString()}`)
  },
  messages: ({ chatbotId = '', threadId = '', limit = 200 } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (String(chatbotId).trim()) params.set('chatbotId', String(chatbotId).trim())
    if (String(threadId).trim()) params.set('threadId', String(threadId).trim())
    return api(`admin/messages?${params.toString()}`)
  },
  settings: api('admin/settings'),
  deleteChatbot: (chatbotId) => api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}`),
  integration: (chatbotId) =>
    api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}/integration`),
  integrationBootstrap: (chatbotId) =>
    api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}/integration-bootstrap`),
  updateChatbotConfig: (chatbotId) =>
    api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}/config`),
}
