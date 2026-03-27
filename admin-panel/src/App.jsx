import { useCallback, useEffect, useMemo, useState } from 'react'
import { ADMIN_API } from './api.js'

function formatIso(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function trialTimeLeft(iso) {
  const end = new Date(iso).getTime()
  if (!Number.isFinite(end)) return '—'
  const diff = end - Date.now()
  if (diff <= 0) return 'Expired'
  const totalHours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return `${days}d ${hours}h ${minutes}m left`
}

function msgPreview(text, max = 130) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function fmtNumber(n) {
  const x = Number(n || 0)
  if (!Number.isFinite(x)) return '0'
  return x.toLocaleString()
}

function fmtPercent(value, digits = 1) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0%'
  return `${n.toFixed(digits)}%`
}

function formatRelativeFromIso(iso) {
  const ms = Date.now() - Date.parse(String(iso || ''))
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

function pillClass(status) {
  if (status === 'active') return 'pill pill--active'
  if (status === 'ended') return 'pill pill--ended'
  return 'pill'
}

function Sidebar({ active, onChange }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'chatbots', label: 'Chatbots' },
    { id: 'leads', label: 'Leads' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand__badge-img" src="/api/logo/admin.svg" alt="Admin logo" />
        <div>
          <p className="brand__eyebrow">White Label AI</p>
          <h1 className="brand__title">Admin Panel</h1>
        </div>
      </div>

      <nav className="menu" aria-label="Admin sections">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`menu__item${active === it.id ? ' is-active' : ''}`}
            onClick={() => onChange(it.id)}
          >
            {it.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__card">
        <p className="sidebar__label">Database</p>
        <p className="sidebar__value">Connected</p>
        <p className="sidebar__hint">Live metrics from backend API</p>
      </div>
    </aside>
  )
}

function KpiCard({ label, value, meta, metaClass = '' }) {
  return (
    <article className="kpi">
      <p className="kpi__label">{label}</p>
      <p className="kpi__value">{value}</p>
      {meta ? <p className={`kpi__meta ${metaClass}`}>{meta}</p> : <p className="kpi__meta" />}
    </article>
  )
}

function Table({ children }) {
  return (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  )
}

function Panel({ title, right, children }) {
  return (
    <article className="panel">
      <div className="panel__head">
        <h3>{title}</h3>
        {right ? right : null}
      </div>
      <div className="panel__body">{children}</div>
    </article>
  )
}

function normalizeHexColor(input, fallback) {
  const raw = String(input || '').trim()
  if (!raw) return fallback
  const v = raw.startsWith('#') ? raw : `#${raw}`
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback
}

function ThemeColorField({ label, value, fallback, onChange }) {
  const safe = normalizeHexColor(value, fallback)
  return (
    <div className="color-field">
      <div className="color-field__label">{label}</div>
      <div className="color-field__row">
        <input
          className="color-field__picker"
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} color picker`}
        />
        <input
          className="input"
          type="text"
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          inputMode="text"
          aria-label={`${label} hex`}
        />
      </div>
      <div className="color-field__meta">
        <span className="color-field__swatch" style={{ background: safe }} aria-hidden="true" />
        <span className="color-field__hex">{safe.toUpperCase()}</span>
      </div>
    </div>
  )
}

export default function App() {
  const TOKEN_KEY = 'wlai_admin_token'
  const [active, setActive] = useState('dashboard')
  const [authToken, setAuthToken] = useState(() => {
    try {
      return String(window.localStorage.getItem(TOKEN_KEY) || '')
    } catch {
      return ''
    }
  })
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  const [metrics, setMetrics] = useState(null)
  const [chatbots, setChatbots] = useState([])
  const [threads, setThreads] = useState([])
  const [messages, setMessages] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [leads, setLeads] = useState([])
  const [leadSource, setLeadSource] = useState('')
  const [leadQuery, setLeadQuery] = useState('')
  const [expandedLead, setExpandedLead] = useState(null)
  const [leadToast, setLeadToast] = useState('')
  const [chatbotConfigModal, setChatbotConfigModal] = useState(null)
  const [settings, setSettings] = useState({
    theme: { red: '#dc2626', green: '#15803d', black: '#000000', white: '#ffffff' },
    pricing: { starter: 299, growth: 499, pro: 799, currency: 'USD' },
  })

  const [chatbotId, setChatbotId] = useState('')
  const [threadId, setThreadId] = useState('')
  const [expandedMessage, setExpandedMessage] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  /** While non-null, that chatbot row is fetching bootstrap + integration (can take 1–2 min on first SDK enable). */
  const [integrationBusyId, setIntegrationBusyId] = useState('')

  const canLoad = useMemo(() => true, [])

  const dashboardInsights = useMemo(() => {
    const rows = Array.isArray(analytics) ? analytics : []
    const totalMessages14d = rows.reduce((sum, d) => sum + Number(d.messages || 0), 0)
    const totalChatbots14d = rows.reduce((sum, d) => sum + Number(d.chatbots || 0), 0)
    const totalLeads14d = rows.reduce((sum, d) => sum + Number(d.trial_leads || 0), 0)

    const last7 = rows.slice(-7)
    const prev7 = rows.slice(-14, -7)
    const sumLast7 = last7.reduce((sum, d) => sum + Number(d.messages || 0), 0)
    const sumPrev7 = prev7.reduce((sum, d) => sum + Number(d.messages || 0), 0)
    const wowMessagesPct = sumPrev7 > 0 ? ((sumLast7 - sumPrev7) / sumPrev7) * 100 : sumLast7 > 0 ? 100 : 0

    const active = Number(metrics?.active_trials || 0)
    const ended = Number(metrics?.ended_trials || 0)
    const totalKnown = Math.max(active + ended, 0)
    const trialWinPct = totalKnown > 0 ? (active / totalKnown) * 100 : 0

    const msgToday = Number(metrics?.messages_today || 0)
    const avgPerDay14d = totalMessages14d / Math.max(rows.length || 1, 1)
    const loadVsAvgPct = avgPerDay14d > 0 ? (msgToday / avgPerDay14d) * 100 : 0

    const hotDay = rows.reduce(
      (best, d) => (Number(d.messages || 0) > Number(best.messages || 0) ? d : best),
      rows[0] || { day: '—', messages: 0 },
    )

    const leadToBotPct = totalLeads14d > 0 ? (totalChatbots14d / totalLeads14d) * 100 : 0
    const messagesPerBot14d = totalChatbots14d > 0 ? totalMessages14d / totalChatbots14d : 0

    return {
      totalMessages14d,
      totalChatbots14d,
      totalLeads14d,
      wowMessagesPct,
      trialWinPct,
      loadVsAvgPct,
      hotDay,
      leadToBotPct,
      messagesPerBot14d,
      sumLast7,
      sumPrev7,
    }
  }, [analytics, metrics])

  const conversationInsights = useMemo(() => {
    const threadRows = Array.isArray(threads) ? threads : []
    const msgRows = Array.isArray(messages) ? messages : []
    const totalMessagesInLoadedThreads = threadRows.reduce((sum, t) => sum + Number(t.message_count || 0), 0)
    const avgPerThread =
      threadRows.length > 0 ? totalMessagesInLoadedThreads / Math.max(threadRows.length, 1) : 0
    const userCount = msgRows.filter((m) => m.role === 'user').length
    const botCount = msgRows.filter((m) => m.role !== 'user').length
    return {
      totalThreads: threadRows.length,
      totalMessagesInLoadedThreads,
      avgPerThread,
      userCount,
      botCount,
    }
  }, [threads, messages])

  const sortedThreads = useMemo(() => {
    const rows = Array.isArray(threads) ? threads.slice() : []
    // Chronological order (oldest → newest) as requested.
    rows.sort((a, b) => String(a.first_message_at || '').localeCompare(String(b.first_message_at || '')))
    return rows
  }, [threads])

  const filteredLeads = useMemo(() => {
    const rows = Array.isArray(leads) ? leads : []
    const q = String(leadQuery || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter((l) => {
      const website = String(l.website_url || l.chatbot_website_url || '').trim()
      const hay = [
        l.source,
        l.business_name,
        l.name,
        l.email,
        l.phone,
        website,
        l.chatbot_id,
        l.chatbot_title,
        l.message,
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [leads, leadQuery])

  const authedFetch = useCallback(
    async (url, init = {}) => {
      const headers = new Headers(init.headers || {})
      if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
      const res = await fetch(url, { ...init, headers })
      if (res.status === 401) {
        try {
          window.localStorage.removeItem(TOKEN_KEY)
        } catch {
          /* ignore */
        }
        setAuthToken('')
        throw new Error('Session expired. Please login again.')
      }
      return res
    },
    [authToken],
  )

  async function copyLeadText(label, value) {
    const text = String(value || '').trim()
    if (!text) return
    try {
      await window.navigator.clipboard.writeText(text)
      setLeadToast(`${label} copied`)
      window.setTimeout(() => setLeadToast(''), 1600)
    } catch {
      // clipboard may be blocked; fall back to a simple prompt
      window.prompt(`Copy ${label}`, text)
    }
  }

  async function loginAdmin(e) {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    try {
      const res = await fetch(ADMIN_API.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.token) {
        throw new Error(data?.error || 'Login failed')
      }
      const token = String(data.token || '')
      if (!token) throw new Error('Login failed')
      try {
        window.localStorage.setItem(TOKEN_KEY, token)
      } catch {
        /* ignore */
      }
      setAuthToken(token)
      setAuthPassword('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not login')
    } finally {
      setAuthLoading(false)
    }
  }

  function logoutAdmin() {
    try {
      window.localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
    setAuthToken('')
    setAuthPassword('')
  }

  async function loadMetrics() {
    setError('')
    setLoading(true)
    try {
      const res = await authedFetch(ADMIN_API.metrics)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load metrics')
      setMetrics(data)
    } catch (e) {
      setMetrics(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadChatbots() {
    setError('')
    setLoading(true)
    try {
      const res = await authedFetch(ADMIN_API.chatbots(25))
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load chatbots')
      const next = Array.isArray(data.chatbots) ? data.chatbots : []
      setChatbots(next)
      setChatbotId((prev) => (prev && prev.trim() ? prev : next[0]?.chatbot_id || ''))
    } catch (e) {
      setChatbots([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadAnalytics() {
    try {
      const res = await authedFetch(ADMIN_API.analytics(14))
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load analytics')
      setAnalytics(Array.isArray(data.series) ? data.series : [])
    } catch {
      setAnalytics([])
      setError('Could not load analytics')
    }
  }

  async function loadSettings() {
    try {
      const res = await authedFetch(ADMIN_API.settings)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load settings')
      if (data.settings && typeof data.settings === 'object') setSettings(data.settings)
    } catch {
      // keep defaults
    }
  }

  async function loadLeads({ source = leadSource } = {}) {
    setError('')
    setLoading(true)
    try {
      const res = await authedFetch(ADMIN_API.leads({ source, limit: 250 }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load leads')
      setLeads(Array.isArray(data.leads) ? data.leads : [])
    } catch (e) {
      setLeads([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    setError('')
    setLoading(true)
    try {
      const res = await authedFetch(ADMIN_API.settings, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to save settings')
      setSettings(data.settings || settings)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const TONE_OPTIONS = useMemo(
    () => [
      { id: 'friendly', label: 'Friendly' },
      { id: 'witty', label: 'Witty' },
      { id: 'concise', label: 'Concise' },
      { id: 'professional', label: 'Professional' },
      { id: 'casual', label: 'Casual' },
      { id: 'expert', label: 'Expert' },
      { id: 'empathetic', label: 'Empathetic' },
    ],
    [],
  )

  async function saveChatbotConfig() {
    if (!chatbotConfigModal?.chatbot_id) return
    setError('')
    setLoading(true)
    try {
      const payload = {
        toneId: String(chatbotConfigModal.toneId || 'professional'),
        masterColor: String(chatbotConfigModal.masterColor || ''),
        active: !!chatbotConfigModal.active,
        questions: String(chatbotConfigModal.questionsRaw || '')
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
      }
      const res = await authedFetch(ADMIN_API.updateChatbotConfig(chatbotConfigModal.chatbot_id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to save chatbot settings')
      setChatbotConfigModal(null)
      await loadChatbots()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function deleteChatbot(chatbotIdToDelete) {
    if (!chatbotIdToDelete) return
    if (!window.confirm(`Delete chatbot ${chatbotIdToDelete}? This will remove context, trial rows, and chat history.`)) return
    setError('')
    setLoading(true)
    try {
      const res = await authedFetch(ADMIN_API.deleteChatbot(chatbotIdToDelete), { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Delete failed')
      setChatbots((prev) => prev.filter((c) => c.chatbot_id !== chatbotIdToDelete))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function triggerTextFileDownload(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /** Hostname slug for download filename (from client website column). */
  function slugForIntegrationFilename(websiteUrl) {
    const raw = String(websiteUrl || '').trim()
    if (!raw) return 'client-site'
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      return String(u.hostname || '')
        .replace(/^www\./i, '')
        .replace(/[^a-z0-9.-]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'client-site'
    } catch {
      return 'client-site'
    }
  }

  /**
   * @param {object} data — JSON from GET /api/admin/chatbot/:id/integration
   * @param {string} chatbotIdFallback
   */
  function buildIntegrationPackDoc(data, chatbotIdFallback) {
    const embedCode = typeof data.embedCode === 'string' ? data.embedCode : ''
    if (!embedCode.trim()) throw new Error('No embed code returned by backend')

    const cid = String(data.chatbotId || chatbotIdFallback)
    const secret = String(data.integrationSecret || '')
    const apiBase = typeof data.apiBase === 'string' ? data.apiBase : ''
    const widgetUrl = typeof data.widgetScriptUrl === 'string' ? data.widgetScriptUrl : ''
    const ep = data.endpoints && typeof data.endpoints === 'object' ? data.endpoints : {}
    const openUrl = String(ep.widgetOpen || '')
    const msgUrl = String(ep.chatMessage || '')
    const histUrl = String(ep.chatHistory || '')
    const clearUrl = String(ep.chatClear || '')
    const defaultVercelOrigin = 'https://white-label-ai-chatbot-generator-ty.vercel.app'
    const envApiBase = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '')
    const configuredBase = envApiBase || defaultVercelOrigin
    const configuredOrigin = configuredBase.replace(/\/api$/i, '')
    const enforceVercel = /(^|\.)localhost$|127\.0\.0\.1/i
    const finalApiBase = enforceVercel.test(apiBase) || !apiBase ? `${configuredOrigin}/api` : apiBase
    const finalWidgetUrl = enforceVercel.test(widgetUrl) || !widgetUrl ? `${configuredOrigin}/widget.js` : widgetUrl
    const finalOpenUrl = enforceVercel.test(openUrl) || !openUrl ? `${configuredOrigin}/api/widget/open` : openUrl
    const finalMsgUrl =
      enforceVercel.test(msgUrl) || !msgUrl ? `${configuredOrigin}/api/chatbot-test/message` : msgUrl
    const finalHistUrl =
      enforceVercel.test(histUrl) || !histUrl ? `${configuredOrigin}/api/chatbot-test/history` : histUrl
    const finalClearUrl =
      enforceVercel.test(clearUrl) || !clearUrl ? `${configuredOrigin}/api/chatbot-test/clear` : clearUrl
    const finalEmbedCode = `<script src="${finalWidgetUrl}" data-wl-chatbot-id="${cid}" data-wl-integration-secret="${secret}" defer></script>`
    const openPayload = data.payload?.open && typeof data.payload.open === 'object' ? data.payload.open : {}
    const messagePayload =
      data.payload?.message && typeof data.payload.message === 'object' ? data.payload.message : {}
    const historyPayload =
      data.payload?.history && typeof data.payload.history === 'object' ? data.payload.history : {}
    const clearPayload =
      data.payload?.clear && typeof data.payload.clear === 'object' ? data.payload.clear : {}
    const tones = Array.isArray(data.toneIds) ? data.toneIds : []
    const notes = Array.isArray(data.notes) ? data.notes : []
    const shapes = data.responseShape && typeof data.responseShape === 'object' ? data.responseShape : {}

    const openJson = JSON.stringify(openPayload, null, 2)
    const msgJson = JSON.stringify(messagePayload, null, 2)
    const histJson = JSON.stringify(historyPayload, null, 2)
    const clearJson = JSON.stringify(clearPayload, null, 2)

    const curlOpen =
      finalOpenUrl &&
      `curl -X POST "${finalOpenUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '${openJson.replace(/'/g, "'\\''")}'`
    const curlMsg =
      finalMsgUrl &&
      `curl -X POST "${finalMsgUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '${msgJson.replace(/'/g, "'\\''")}'`

    return [
      `=== WHITE LABEL AI — CLIENT INTEGRATION PACK (SaaS) ===`,
      ``,
      `Chatbot ID: ${cid}`,
      `Use this pack on the client's website. Their visitors do not enter a password; integrationSecret unlocks the widget/API.`,
      `Context is the website stored for this bot at signup — same answers as your hosted flow.`,
      ``,
      `integrationSecret (private API key — do not commit to public repos):`,
      secret,
      ``,
      `--- API base ---`,
      finalApiBase || '(set from your deployed backend origin)',
      `--- Hosted widget script ---`,
      finalWidgetUrl,
      ``,
      `--- 1) EMBED ON CLIENT HTML (before </body>) ---`,
      finalEmbedCode,
      ``,
      `--- 2) POST open session (then use sessionId for chat) ---`,
      `POST ${finalOpenUrl}`,
      `Content-Type: application/json`,
      ``,
      openJson,
      ``,
      `Response shape: ${String(shapes.open || '')}`,
      ``,
      curlOpen || '',
      ``,
      `--- 3) POST chat message ---`,
      `POST ${finalMsgUrl}`,
      `Content-Type: application/json`,
      ``,
      msgJson,
      ``,
      `Valid tone (string on "tone"): ${tones.length ? tones.join(', ') : 'friendly | witty | concise | professional | casual | expert | empathetic'}`,
      ``,
      `Response shape: ${String(shapes.message || '')}`,
      ``,
      curlMsg || '',
      ``,
      `--- 4) Optional: history ---`,
      `POST ${finalHistUrl}`,
      `Content-Type: application/json`,
      ``,
      histJson,
      ``,
      `Response shape: ${String(shapes.history || '')}`,
      ``,
      `--- 5) Optional: clear thread ---`,
      `POST ${finalClearUrl}`,
      `Content-Type: application/json`,
      ``,
      clearJson,
      ``,
      `Response shape: ${String(shapes.clear || '')}`,
      ``,
      `--- NOTES ---`,
      ...notes.map((n) => `- ${n}`),
      ``,
      `CORS: your backend must allow the client's origin (already open in dev).`,
      `Trial: if trialExpired is true on open, chat is blocked until the subscription is renewed.`,
    ].join('\n')
  }

  async function loadIntegrationPayload(chatbotIdToCopy, { allowPromptBootstrap } = { allowPromptBootstrap: true }) {
    const res = await authedFetch(ADMIN_API.integration(chatbotIdToCopy))
    const raw = await res.text()
    let data = {}
    try {
      data = raw ? JSON.parse(raw) : {}
    } catch {
      data = {}
    }

    if (res.ok && data.ok) return data

    const errText = typeof data.error === 'string' ? data.error : ''
    if (allowPromptBootstrap && res.status === 403 && /integration not configured/i.test(errText)) {
      let bootRes = await authedFetch(ADMIN_API.integrationBootstrap(chatbotIdToCopy), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      let bootRaw = await bootRes.text()
      let bootData = {}
      try {
        bootData = bootRaw ? JSON.parse(bootRaw) : {}
      } catch {
        bootData = {}
      }

      if (!bootRes.ok || !bootData.ok) {
        const bh =
          typeof bootData.error === 'string' && bootData.error.trim()
            ? bootData.error.trim()
            : bootRaw.trim().slice(0, 200) || '(empty response)'
        throw new Error(`Could not enable integration (HTTP ${bootRes.status}). ${bh}`)
      }
      return loadIntegrationPayload(chatbotIdToCopy, { allowPromptBootstrap: false })
    }

    const hint =
      typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : raw.trim().slice(0, 240) || '(empty response)'
    const extra =
      res.status === 404
        ? ' Deploy the latest backend, or run admin via `npm run dev` with API proxy to localhost:3000.'
        : ''
    throw new Error(`Could not load integration snippet (HTTP ${res.status}). ${hint}${extra}`)
  }

  /** Primary SaaS action: save full client SDK + API doc without relying on clipboard. */
  async function downloadClientIntegrationPack(chatbotIdToDownload, websiteUrlForName) {
    if (!chatbotIdToDownload) return
    setError('')
    setIntegrationBusyId(chatbotIdToDownload)
    try {
      const data = await loadIntegrationPayload(chatbotIdToDownload)
      const doc = buildIntegrationPackDoc(data, chatbotIdToDownload)
      const slug = slugForIntegrationFilename(websiteUrlForName)
      triggerTextFileDownload(doc, `wlai-client-${chatbotIdToDownload}-${slug}.txt`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationBusyId('')
    }
  }

  async function loadConversations() {
    setError('')
    setLoading(true)
    try {
      const res = await authedFetch(ADMIN_API.conversations({ chatbotId, limit: 100 }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load conversations')
      const nextThreads = Array.isArray(data.threads) ? data.threads : []
      setThreads(nextThreads)
      setMessages([])
      // Do not auto-open chat; user must click a thread/bot row first.
      setThreadId('')
    } catch (e) {
      setThreads([])
      setMessages([])
      setThreadId('')
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadMessagesForThread(tid, forceChatbotId = '') {
    if (!tid) return
    setError('')
    setLoading(true)
    try {
      const selectedChatbotId = String(forceChatbotId || chatbotId || '').trim()
      const res = await authedFetch(ADMIN_API.messages({ chatbotId: selectedChatbotId, threadId: tid, limit: 300 }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load messages')
      setMessages(Array.isArray(data.messages) ? data.messages : [])
    } catch (e) {
      setMessages([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function exportConversationToPdf() {
    if (!threadId) return
    const rows = Array.isArray(messages) ? messages : []
    const title = `Conversation Report — Bot ${chatbotId || '—'} — Thread ${String(threadId).slice(0, 8)}`
    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    const body = rows
      .map((m) => {
        const role = String(m.role || 'assistant')
        const when = formatIso(m.created_at)
        const content = esc(m.content || '')
        return `<div class="msg ${role === 'user' ? 'user' : 'assistant'}">
  <div class="meta"><span class="role">${esc(role)}</span><span class="dot">•</span><span class="time">${esc(when)}</span></div>
  <pre class="content">${content}</pre>
</div>`
      })
      .join('\n')

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${esc(title)}</title>
    <style>
      :root { --red: ${settings.theme?.red || '#dc2626'}; --black: #111; --border: rgba(0,0,0,.12); }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 32px; color: #111; }
      h1 { margin: 0 0 6px; font-size: 18px; }
      .sub { color: rgba(0,0,0,.6); font-weight: 700; margin-bottom: 18px; }
      .wrap { display: grid; gap: 10px; }
      .msg { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; }
      .msg.user { border-left: 4px solid var(--red); background: rgba(220,38,38,.05); }
      .msg.assistant { border-left: 4px solid rgba(0,0,0,.22); background: rgba(0,0,0,.02); }
      .meta { display:flex; gap: 8px; align-items:center; color: rgba(0,0,0,.65); font-size: 12px; font-weight: 800; }
      .role { text-transform: uppercase; letter-spacing: .08em; }
      .content { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12.5px; }
      @media print { body { margin: 16px; } }
    </style>
  </head>
  <body>
    <h1>${esc(title)}</h1>
    <div class="sub">Exported ${esc(new Date().toLocaleString())}</div>
    <div class="wrap">${body || '<div class="sub">No messages.</div>'}</div>
    <script>window.focus(); setTimeout(() => window.print(), 300);</script>
  </body>
</html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  useEffect(() => {
    if (!canLoad || !authToken) return
    loadMetrics()
    loadChatbots()
    loadAnalytics()
    loadSettings()
    loadConversations()
    loadLeads()
  }, [canLoad, authToken])

  if (!authToken) {
    return (
      <div className="admin-login-shell">
        <form className="admin-login-card" onSubmit={loginAdmin}>
          <p className="admin-login-eyebrow">White Label AI</p>
          <h1 className="admin-login-title">Admin Login</h1>
          <p className="admin-login-subtitle">Login with your admin email and password.</p>

          <label className="admin-login-field">
            Email
            <input
              className="input"
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />
          </label>
          <label className="admin-login-field">
            Password
            <input
              className="input"
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {authError ? <div className="alert">{authError}</div> : null}

          <button type="submit" className="btn-primary admin-login-btn" disabled={authLoading}>
            {authLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div
      className="admin"
      style={{
        '--red': settings.theme?.red || '#dc2626',
        '--green': settings.theme?.green || '#15803d',
        '--black': settings.theme?.black || '#000000',
        '--white': settings.theme?.white || '#ffffff',
      }}
    >
      <Sidebar active={active} onChange={setActive} />

      <main className="content">
        <header className="topbar">
          <div>
            <p className="topbar__eyebrow">Overview</p>
            <h2 className="topbar__title">
              {active === 'dashboard'
                ? 'Dashboard'
                : active === 'chatbots'
                  ? 'Chatbots'
                  : active === 'leads'
                    ? 'Leads'
                  : active === 'conversations'
                    ? 'Conversations'
                    : 'Settings'}
            </h2>
          </div>
          <div className="topbar__actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                loadMetrics()
                loadChatbots()
                loadAnalytics()
                loadSettings()
                loadConversations()
                loadLeads()
              }}
              disabled={loading}
            >
              Refresh
            </button>
            <button type="button" className="btn-ghost" onClick={logoutAdmin}>
              Logout
            </button>
          </div>
        </header>

        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        {active === 'dashboard' ? (
          <section className="kpis">
            <KpiCard label="Total Chatbots" value={metrics?.total_chatbots ?? '—'} meta={metrics?.active_trials ? '' : ''} />
            <KpiCard
              label="Active Trials"
              value={metrics?.active_trials ?? '—'}
              meta={metrics?.active_trials ? `Active` : ''}
              metaClass="up"
            />
            <KpiCard
              label="Ended Trials"
              value={metrics?.ended_trials ?? '—'}
              meta={metrics?.ended_trials ? 'Need follow-up' : ''}
            />
            <KpiCard label="Messages Today" value={metrics?.messages_today ?? '—'} meta={metrics?.messages_today ? '' : ''} />
          </section>
        ) : null}

        {active === 'dashboard' ? (
          <section className="panels">
            <Panel title="Executive Snapshot">
              <div className="insight-grid">
                <article className="insight-card">
                  <p className="insight-card__label">14-day message volume</p>
                  <p className="insight-card__value">{fmtNumber(dashboardInsights.totalMessages14d)}</p>
                  <p className={`insight-card__meta ${dashboardInsights.wowMessagesPct >= 0 ? 'up' : 'down'}`}>
                    {dashboardInsights.wowMessagesPct >= 0 ? 'Up' : 'Down'} {fmtPercent(Math.abs(dashboardInsights.wowMessagesPct))} vs prior week
                  </p>
                </article>
                <article className="insight-card">
                  <p className="insight-card__label">Trial health (active share)</p>
                  <p className="insight-card__value">{fmtPercent(dashboardInsights.trialWinPct)}</p>
                  <p className="insight-card__meta">
                    Active {fmtNumber(metrics?.active_trials || 0)} / Ended {fmtNumber(metrics?.ended_trials || 0)}
                  </p>
                </article>
                <article className="insight-card">
                  <p className="insight-card__label">Lead → chatbot conversion (14d)</p>
                  <p className="insight-card__value">{fmtPercent(dashboardInsights.leadToBotPct)}</p>
                  <p className="insight-card__meta">
                    {fmtNumber(dashboardInsights.totalChatbots14d)} chatbots from {fmtNumber(dashboardInsights.totalLeads14d)} leads
                  </p>
                </article>
                <article className="insight-card">
                  <p className="insight-card__label">Engagement per new bot (14d)</p>
                  <p className="insight-card__value">{dashboardInsights.messagesPerBot14d.toFixed(1)}</p>
                  <p className="insight-card__meta">Avg messages per created chatbot</p>
                </article>
              </div>
            </Panel>

            <Panel
              title="Recent Chatbots"
              right={
                <button type="button" className="btn-ghost" onClick={loadChatbots} disabled={loading}>
                  View all
                </button>
              }
            >
              <Table>
                <thead>
                  <tr>
                    <th>Chatbot ID</th>
                    <th>Trial Ends</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {chatbots.length ? (
                    chatbots.map((c) => {
                      const status = c.trial_ends_at && c.trial_ends_at > new Date().toISOString() ? 'active' : 'ended'
                      return (
                        <tr key={c.chatbot_id}>
                          <td>{c.chatbot_id}</td>
                          <td>{formatIso(c.trial_ends_at)}</td>
                          <td>
                            <span className={pillClass(status)}>{status}</span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="3" className="table-empty">
                        No data loaded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Panel>

            <Panel title="Analytics (14 days)">
              <div className="analytics-topline">
                <div className="analytics-chip">
                  <span className="analytics-chip__k">Today vs avg</span>
                  <span className={`analytics-chip__v ${dashboardInsights.loadVsAvgPct >= 100 ? 'up' : 'down'}`}>
                    {fmtPercent(dashboardInsights.loadVsAvgPct, 0)}
                  </span>
                </div>
                <div className="analytics-chip">
                  <span className="analytics-chip__k">Best day</span>
                  <span className="analytics-chip__v">
                    {dashboardInsights.hotDay?.day ? String(dashboardInsights.hotDay.day).slice(5) : '—'} ·{' '}
                    {fmtNumber(dashboardInsights.hotDay?.messages || 0)}
                  </span>
                </div>
                <div className="analytics-chip">
                  <span className="analytics-chip__k">Last 7 vs prev 7</span>
                  <span className={`analytics-chip__v ${dashboardInsights.sumLast7 >= dashboardInsights.sumPrev7 ? 'up' : 'down'}`}>
                    {fmtNumber(dashboardInsights.sumLast7)} / {fmtNumber(dashboardInsights.sumPrev7)}
                  </span>
                </div>
              </div>
              <div className="chart">
                {analytics.length ? (
                  analytics.map((d) => {
                    const max = Math.max(...analytics.map((x) => Number(x.messages || 0)), 1)
                    const h = Math.max(6, Math.round((Number(d.messages || 0) / max) * 80))
                    return (
                      <div key={d.day} className="chart__item" title={`${d.day}: ${d.messages} messages`}>
                        <div className="chart__bar" style={{ height: `${h}px` }} />
                        <div className="chart__label">{String(d.day).slice(5)}</div>
                      </div>
                    )
                  })
                ) : (
                  <div className="empty-box">No analytics data.</div>
                )}
              </div>
            </Panel>
          </section>
        ) : null}

        {active === 'chatbots' ? (
          <section className="panels panels--single">
            <Panel
              title="Chatbots"
              right={
                <button type="button" className="btn-ghost" onClick={loadChatbots} disabled={loading}>
                  Reload
                </button>
              }
            >
              <p className="panel__hint">
                <strong>Client pack:</strong> use <strong>Download</strong> for embed script + API payloads (same behavior as your hosted chatbot for that website context). URLs are forced to your Vercel deployment, never localhost.
              </p>
              <Table>
                <thead>
                  <tr>
                    <th>Chatbot ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Website</th>
                    <th>Created</th>
                    <th>Trial Ends</th>
                    <th>Status</th>
                    <th>Tone</th>
                    <th>Active</th>
                    <th>Expiry Live</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {chatbots.length ? (
                    chatbots.map((c) => {
                      const status = c.trial_ends_at && c.trial_ends_at > new Date().toISOString() ? 'active' : 'ended'
                      const rowBusy = integrationBusyId === c.chatbot_id
                      const toneLabel = String(c.tone_id || 'professional') || 'professional'
                      const activeFlag = String(c.active_flag || '').toLowerCase()
                      const isActive = activeFlag === '' ? true : activeFlag === 'true'
                      return (
                        <tr key={c.chatbot_id}>
                          <td>{c.chatbot_id}</td>
                          <td>{c.owner_name || '—'}</td>
                          <td>{c.owner_email || '—'}</td>
                          <td>{c.owner_phone || '—'}</td>
                          <td className="td-truncate" title={c.website_url || ''}>
                            {c.website_url || '—'}
                          </td>
                          <td>{formatIso(c.created_at)}</td>
                          <td>{formatIso(c.trial_ends_at)}</td>
                          <td>
                            <span className={pillClass(status)}>{status}</span>
                          </td>
                          <td>{toneLabel}</td>
                          <td>
                            <span className={isActive ? 'pill pill--active' : 'pill pill--ended'}>{isActive ? 'on' : 'off'}</span>
                          </td>
                          <td>{trialTimeLeft(c.trial_ends_at)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={() =>
                                  setChatbotConfigModal({
                                    chatbot_id: c.chatbot_id,
                                    toneId: toneLabel,
                                    masterColor: String(c.master_color || ''),
                                    active: isActive,
                                    questionsRaw: Array.isArray(c.questions) ? c.questions.join('\n') : '',
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                title="Download .txt with embed script + REST payloads for the client site"
                                onClick={() => downloadClientIntegrationPack(c.chatbot_id, c.website_url)}
                                disabled={loading || rowBusy}
                              >
                                {rowBusy ? 'Preparing…' : 'Download'}
                              </button>
                              <button type="button" className="btn-danger" onClick={() => deleteChatbot(c.chatbot_id)}>
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="12" className="table-empty">
                        No data loaded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Panel>
          </section>
        ) : null}

        {active === 'leads' ? (
          <section className="panels panels--single">
            <Panel
              title="Leads"
              right={
                <div className="lead-toolbar">
                  <input
                    className="input"
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search name, email, phone, website, bot…"
                    aria-label="Search leads"
                  />
                  <select
                    className="input"
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    aria-label="Lead source"
                  >
                    <option value="">All sources</option>
                    <option value="contact-demo">Request a demo</option>
                    <option value="trial-expired">Trial expired</option>
                  </select>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => loadLeads({ source: leadSource })}
                    disabled={loading}
                  >
                    Load
                  </button>
                </div>
              }
            >
              <div className="record-strip">
                <div className="record-strip__item">
                  <span className="record-strip__k">Leads loaded</span>
                  <span className="record-strip__v">{fmtNumber(filteredLeads.length)}</span>
                </div>
                <div className="record-strip__item">
                  <span className="record-strip__k">Request a demo</span>
                  <span className="record-strip__v">
                    {fmtNumber(filteredLeads.filter((l) => String(l.source || '') === 'contact-demo').length)}
                  </span>
                </div>
                <div className="record-strip__item">
                  <span className="record-strip__k">Trial expired</span>
                  <span className="record-strip__v">
                    {fmtNumber(filteredLeads.filter((l) => String(l.source || '') === 'trial-expired').length)}
                  </span>
                </div>
                <div className="record-strip__item">
                  <span className="record-strip__k">Last lead</span>
                  <span className="record-strip__v">
                    {filteredLeads[0]?.created_at ? formatRelativeFromIso(filteredLeads[0].created_at) : '—'}
                  </span>
                </div>
              </div>

              {leadToast ? <div className="toast">{leadToast}</div> : null}

              <div className="lead-grid" role="list">
                {filteredLeads.length ? (
                  filteredLeads.map((l) => {
                    const src = String(l.source || '')
                    const srcLabel =
                      src === 'contact-demo' ? 'Request a demo' : src === 'trial-expired' ? 'Trial expired' : src || 'Lead'
                    const website = String(l.website_url || l.chatbot_website_url || '').trim()
                    const businessOrName = String(l.business_name || l.name || '').trim() || '—'
                    const email = String(l.email || '').trim()
                    const phone = String(l.phone || '').trim()
                    const botId = String(l.chatbot_id || '').trim()
                    const botTitle = String(l.chatbot_title || '').trim()
                    const initials = businessOrName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((p) => p.slice(0, 1).toUpperCase())
                      .join('')

                    return (
                      <button
                        key={l.id}
                        type="button"
                        className="lead-card"
                        onClick={() => setExpandedLead(l)}
                        role="listitem"
                      >
                        <div className="lead-card__top">
                          <div className="lead-avatar" aria-hidden="true">
                            {initials || 'L'}
                          </div>
                          <div className="lead-title">
                            <div className="lead-title__row">
                              <span className="lead-title__name">{businessOrName}</span>
                              <span
                                className={`pill ${src === 'contact-demo' ? 'pill--active' : src === 'trial-expired' ? 'pill--ended' : ''}`}
                              >
                                {srcLabel}
                              </span>
                            </div>
                            <div className="lead-title__meta">
                              <span>{formatRelativeFromIso(l.created_at)}</span>
                              <span>·</span>
                              <span title={formatIso(l.created_at)}>{formatIso(l.created_at)}</span>
                              {botId ? (
                                <>
                                  <span>·</span>
                                  <span className="lead-chip" title={botTitle || ''}>
                                    Bot {botId}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="lead-card__msg">{msgPreview(l.message || '', 200) || '—'}</div>

                        <div className="lead-actions" onClick={(e) => e.stopPropagation()}>
                          {email ? (
                            <>
                              <a className="lead-action" href={`mailto:${email}`}>
                                Email
                              </a>
                              <button type="button" className="lead-action lead-action--ghost" onClick={() => copyLeadText('Email', email)}>
                                Copy
                              </button>
                            </>
                          ) : (
                            <span className="lead-action lead-action--disabled">No email</span>
                          )}
                          {phone ? (
                            <a className="lead-action lead-action--ghost" href={`tel:${phone}`}>
                              Call
                            </a>
                          ) : null}
                          {website ? (
                            <a className="lead-action lead-action--ghost" href={website} target="_blank" rel="noreferrer">
                              Website
                            </a>
                          ) : null}
                          <button type="button" className="lead-action lead-action--view" onClick={() => setExpandedLead(l)}>
                            View
                          </button>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="empty-box">
                    No leads found for this filter/search. New “Request a demo” and “Trial expired” submissions will appear here.
                  </div>
                )}
              </div>
            </Panel>
          </section>
        ) : null}

        {active === 'conversations' ? (
          <section className="panels panels--single">
            <Panel
              title="Conversations"
              right={
                <div className="search-row">
                  <input
                    className="input"
                    value={chatbotId}
                    onChange={(e) => setChatbotId(e.target.value)}
                    placeholder="Optional chatbot ID (8 digits)"
                    aria-label="Chatbot ID"
                  />
                  <button type="button" className="btn-primary" onClick={loadConversations} disabled={loading}>
                    Load
                  </button>
                </div>
              }
            >
              <div className="record-strip">
                <div className="record-strip__item">
                  <span className="record-strip__k">Threads loaded</span>
                  <span className="record-strip__v">{fmtNumber(conversationInsights.totalThreads)}</span>
                </div>
                <div className="record-strip__item">
                  <span className="record-strip__k">Messages in loaded threads</span>
                  <span className="record-strip__v">{fmtNumber(conversationInsights.totalMessagesInLoadedThreads)}</span>
                </div>
                <div className="record-strip__item">
                  <span className="record-strip__k">Avg per thread</span>
                  <span className="record-strip__v">{conversationInsights.avgPerThread.toFixed(1)}</span>
                </div>
                <div className="record-strip__item">
                  <span className="record-strip__k">Current thread split</span>
                  <span className="record-strip__v">
                    User {fmtNumber(conversationInsights.userCount)} · Bot {fmtNumber(conversationInsights.botCount)}
                  </span>
                </div>
              </div>
              <div className="split">
                <div className="split__left">
                  <p className="subhead">Threads</p>
                  <div className="list">
                    {sortedThreads.length ? (
                      sortedThreads.map((t) => (
                        <button
                          key={`${t.chatbot_id || 'x'}:${t.thread_id}`}
                          type="button"
                          className={`list__item${threadId === t.thread_id ? ' is-on' : ''}`}
                          onClick={() => {
                            setThreadId(t.thread_id)
                            setChatbotId(t.chatbot_id || '')
                            loadMessagesForThread(t.thread_id, t.chatbot_id || '')
                          }}
                        >
                          <div className="list__item-title">
                            <span className="list__user-icon" aria-hidden="true">
                              👤
                            </span>{' '}
                            Bot {t.chatbot_id || '—'} · {String(t.thread_id).slice(0, 8)}…
                          </div>
                          <div className="list__item-meta">
                            {t.message_count} messages • last {formatIso(t.last_message_at)}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="empty-box">No conversations found. Click Load to refresh.</div>
                    )}
                  </div>
                </div>

                <div className="split__right">
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <p className="subhead">Messages {threadId ? `· ${String(threadId).slice(0, 8)}…` : ''}</p>
                    <button type="button" className="btn-ghost" onClick={exportConversationToPdf} disabled={!threadId || loading}>
                      Export PDF
                    </button>
                  </div>
                  <div className="messages">
                    {!threadId ? (
                      <div className="empty-box">Click a bot/thread in the left list to view chat messages.</div>
                    ) : messages.length ? (
                      messages.map((m) => (
                        <div key={m.id} className={`msg msg--${m.role}`}>
                          <div className="msg__meta">
                            <span className="msg__chatbot">Bot {m.chatbot_id || chatbotId || '—'}</span>
                            <span className={`msg__role msg__role--${m.role === 'user' ? 'user' : 'assistant'}`}>{m.role}</span>
                            <span className="msg__time">{formatIso(m.created_at)}</span>
                          </div>
                          <pre className="msg__content">{msgPreview(m.content, 160)}</pre>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => setExpandedMessage({ ...m, chatbot_id: m.chatbot_id || chatbotId || '' })}
                          >
                            Read more
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="empty-box">No messages in this thread yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          </section>
        ) : null}

        {active === 'settings' ? (
          <section className="panels panels--single">
            <Panel title="Settings">
              <div className="settings">
                <div className="settings__card">
                  <p className="settings__title">Theme Colors (Frontend)</p>
                  <div className="settings__grid">
                    <ThemeColorField
                      label="Red"
                      value={settings.theme?.red || ''}
                      fallback="#dc2626"
                      onChange={(v) => setSettings((s) => ({ ...s, theme: { ...(s.theme || {}), red: v } }))}
                    />
                    <ThemeColorField
                      label="Green"
                      value={settings.theme?.green || ''}
                      fallback="#15803d"
                      onChange={(v) => setSettings((s) => ({ ...s, theme: { ...(s.theme || {}), green: v } }))}
                    />
                    <ThemeColorField
                      label="Black"
                      value={settings.theme?.black || ''}
                      fallback="#000000"
                      onChange={(v) => setSettings((s) => ({ ...s, theme: { ...(s.theme || {}), black: v } }))}
                    />
                    <ThemeColorField
                      label="White"
                      value={settings.theme?.white || ''}
                      fallback="#ffffff"
                      onChange={(v) => setSettings((s) => ({ ...s, theme: { ...(s.theme || {}), white: v } }))}
                    />
                  </div>
                </div>

                <div className="settings__card">
                  <p className="settings__title">Pricing</p>
                  <div className="settings__grid">
                    <label>
                      Starter
                      <input
                        className="input"
                        type="number"
                        value={settings.pricing?.starter ?? 0}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            pricing: { ...(s.pricing || {}), starter: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Growth
                      <input
                        className="input"
                        type="number"
                        value={settings.pricing?.growth ?? 0}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            pricing: { ...(s.pricing || {}), growth: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Pro
                      <input
                        className="input"
                        type="number"
                        value={settings.pricing?.pro ?? 0}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            pricing: { ...(s.pricing || {}), pro: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: '0.8rem' }}>
                    <button type="button" className="btn-primary" onClick={saveSettings} disabled={loading}>
                      Save Settings
                    </button>
                  </div>
                </div>
              </div>
            </Panel>
          </section>
        ) : null}
        {expandedMessage ? (
          <div className="modal-backdrop" onClick={() => setExpandedMessage(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Conversation message</h3>
                <button type="button" className="btn-ghost" onClick={() => setExpandedMessage(null)}>
                  Close
                </button>
              </div>
              <div className="modal-meta">
                <span>Bot {expandedMessage.chatbot_id || '—'}</span>
                <span>{expandedMessage.role}</span>
                <span>{formatIso(expandedMessage.created_at)}</span>
              </div>
              <pre className="modal-content">{expandedMessage.content}</pre>
            </div>
          </div>
        ) : null}
        {expandedLead ? (
          <div className="modal-backdrop" onClick={() => setExpandedLead(null)}>
            <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Lead details</h3>
                <button type="button" className="btn-ghost" onClick={() => setExpandedLead(null)}>
                  Close
                </button>
              </div>
              <div className="modal-meta">
                <span>{String(expandedLead.source || 'lead')}</span>
                <span>{formatIso(expandedLead.created_at)}</span>
                {expandedLead.chatbot_id ? <span>Bot {expandedLead.chatbot_id}</span> : <span>—</span>}
              </div>

              <div className="lead-detail">
                <div className="lead-detail__block">
                  <p className="lead-detail__k">Business / Name</p>
                  <p className="lead-detail__v">
                    {String(expandedLead.business_name || expandedLead.name || '—')}
                  </p>
                  {expandedLead.chatbot_title ? (
                    <p className="lead-detail__sub">{String(expandedLead.chatbot_title)}</p>
                  ) : null}
                </div>

                <div className="lead-detail__block">
                  <p className="lead-detail__k">Contact</p>
                  <div className="lead-detail__row">
                    <span className="lead-detail__v">{String(expandedLead.email || '—')}</span>
                    {expandedLead.email ? (
                      <button type="button" className="btn-ghost" onClick={() => copyLeadText('Email', expandedLead.email)}>
                        Copy
                      </button>
                    ) : null}
                  </div>
                  <div className="lead-detail__row">
                    <span className="lead-detail__sub">{String(expandedLead.phone || '—')}</span>
                    {expandedLead.phone ? (
                      <button type="button" className="btn-ghost" onClick={() => copyLeadText('Phone', expandedLead.phone)}>
                        Copy
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="lead-detail__block">
                  <p className="lead-detail__k">Website</p>
                  {String(expandedLead.website_url || expandedLead.chatbot_website_url || '').trim() ? (
                    <div className="lead-detail__row">
                      <a
                        className="table-link"
                        href={String(expandedLead.website_url || expandedLead.chatbot_website_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {String(expandedLead.website_url || expandedLead.chatbot_website_url)}
                      </a>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() =>
                          copyLeadText('Website', String(expandedLead.website_url || expandedLead.chatbot_website_url))
                        }
                      >
                        Copy
                      </button>
                    </div>
                  ) : (
                    <p className="lead-detail__sub">—</p>
                  )}
                  {expandedLead.trial_ends_at ? (
                    <p className="lead-detail__sub">Trial ends {formatIso(expandedLead.trial_ends_at)}</p>
                  ) : null}
                </div>

                <div className="lead-detail__block lead-detail__block--full">
                  <p className="lead-detail__k">Message</p>
                  <pre className="modal-content">{String(expandedLead.message || '').trim() || '—'}</pre>
                  {String(expandedLead.message || '').trim() ? (
                    <button type="button" className="btn-primary" onClick={() => copyLeadText('Message', expandedLead.message)}>
                      Copy message
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {chatbotConfigModal ? (
          <div className="modal-backdrop" onClick={() => setChatbotConfigModal(null)}>
            <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Edit chatbot</h3>
                <button type="button" className="btn-ghost" onClick={() => setChatbotConfigModal(null)}>
                  Close
                </button>
              </div>
              <div className="modal-meta">
                <span>Bot {chatbotConfigModal.chatbot_id}</span>
                <span>{String(chatbotConfigModal.active ? 'active' : 'inactive')}</span>
              </div>

              <div className="lead-detail">
                <div className="lead-detail__block">
                  <p className="lead-detail__k">Service</p>
                  <div className="lead-detail__row">
                    <span className="lead-detail__v">Enable chatbot</span>
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!chatbotConfigModal.active}
                        onChange={(e) => setChatbotConfigModal((m) => ({ ...m, active: e.target.checked }))}
                      />
                      <span className="lead-detail__sub">{chatbotConfigModal.active ? 'On' : 'Off'}</span>
                    </label>
                  </div>
                </div>

                <div className="lead-detail__block">
                  <p className="lead-detail__k">Reply tone (admin locked)</p>
                  <select
                    className="input"
                    value={String(chatbotConfigModal.toneId || 'professional')}
                    onChange={(e) => setChatbotConfigModal((m) => ({ ...m, toneId: e.target.value }))}
                    aria-label="Chatbot tone"
                  >
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className="lead-detail__sub">Widget + preview will always use this tone.</p>
                </div>

                <div className="lead-detail__block">
                  <p className="lead-detail__k">Primary color (optional)</p>
                  <div className="color-field__row">
                    <input
                      className="color-field__picker"
                      type="color"
                      value={String(chatbotConfigModal.masterColor || '#dc2626') || '#dc2626'}
                      onChange={(e) => setChatbotConfigModal((m) => ({ ...m, masterColor: e.target.value }))}
                    />
                    <input
                      className="input"
                      type="text"
                      placeholder="Auto (server)"
                      value={String(chatbotConfigModal.masterColor || '')}
                      onChange={(e) => setChatbotConfigModal((m) => ({ ...m, masterColor: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn-ghost" onClick={() => setChatbotConfigModal((m) => ({ ...m, masterColor: '' }))}>
                      Auto
                    </button>
                  </div>
                </div>

                <div className="lead-detail__block lead-detail__block--full">
                  <p className="lead-detail__k">Suggested questions (optional)</p>
                  <textarea
                    className="input"
                    style={{ minHeight: '120px', resize: 'vertical' }}
                    value={String(chatbotConfigModal.questionsRaw || '')}
                    onChange={(e) => setChatbotConfigModal((m) => ({ ...m, questionsRaw: e.target.value }))}
                    placeholder={'One question per line\nExample: What services do you offer?\nExample: Do you provide emergency support?'}
                  />
                </div>
              </div>

              <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-ghost" onClick={() => setChatbotConfigModal(null)} disabled={loading}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={saveChatbotConfig} disabled={loading}>
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

