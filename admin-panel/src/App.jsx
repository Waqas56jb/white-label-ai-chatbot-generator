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

function pillClass(status) {
  if (status === 'active') return 'pill pill--active'
  if (status === 'ended') return 'pill pill--ended'
  return 'pill'
}

function Sidebar({ active, onChange }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'chatbots', label: 'Chatbots' },
    { id: 'trials', label: 'Free Trials' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__badge">WL</div>
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
  const [trialInquiries, setTrialInquiries] = useState([])
  const [threads, setThreads] = useState([])
  const [messages, setMessages] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [settings, setSettings] = useState({
    theme: { red: '#dc2626', black: '#000000', white: '#ffffff' },
    pricing: { starter: 299, growth: 499, pro: 799, currency: 'USD' },
  })

  const [chatbotId, setChatbotId] = useState('')
  const [threadId, setThreadId] = useState('')
  const [trialStatus, setTrialStatus] = useState('active')
  const [expandedMessage, setExpandedMessage] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  /** While non-null, that chatbot row is fetching bootstrap + integration (can take 1–2 min on first SDK enable). */
  const [integrationBusyId, setIntegrationBusyId] = useState('')

  const canLoad = useMemo(() => true, [])

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

  async function loadTrials(status = 'active') {
    setError('')
    setLoading(true)
    setTrialStatus(status)
    try {
      const res = await authedFetch(ADMIN_API.trials(status, 50))
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to load trials')
      setTrialInquiries(Array.isArray(data.trials) ? data.trials : [])
    } catch (e) {
      setTrialInquiries([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
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

  useEffect(() => {
    if (!canLoad || !authToken) return
    loadMetrics()
    loadChatbots()
    loadAnalytics()
    loadSettings()
    loadConversations()
    loadTrials('active')
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
                  : active === 'trials'
                    ? 'Free Trials'
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
                loadTrials(trialStatus)
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
                    <th>Expiry Live</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {chatbots.length ? (
                    chatbots.map((c) => {
                      const status = c.trial_ends_at && c.trial_ends_at > new Date().toISOString() ? 'active' : 'ended'
                      const rowBusy = integrationBusyId === c.chatbot_id
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
                          <td>{trialTimeLeft(c.trial_ends_at)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                      <td colSpan="10" className="table-empty">
                        No data loaded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Panel>
          </section>
        ) : null}

        {active === 'trials' ? (
          <section className="panels panels--single">
            <Panel
              title="Trial Leads"
              right={
                <div className="btn-group">
                  <button
                    type="button"
                    className={`btn-ghost ${trialStatus === 'active' ? 'is-on' : ''}`}
                    onClick={() => loadTrials('active')}
                    disabled={loading}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`btn-ghost ${trialStatus === 'ended' ? 'is-on' : ''}`}
                    onClick={() => loadTrials('ended')}
                    disabled={loading}
                  >
                    Ended
                  </button>
                </div>
              }
            >
              <Table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Chatbot ID</th>
                    <th>Website</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {trialInquiries.length ? (
                    trialInquiries.map((t) => (
                      <tr key={t.id}>
                        <td>{t.name || '—'}</td>
                        <td>{t.email || '—'}</td>
                        <td>{t.phone || '—'}</td>
                        <td>{t.chatbot_id || '—'}</td>
                        <td className="td-truncate" title={t.website_url || ''}>
                          {t.website_url || '—'}
                        </td>
                        <td>{formatIso(t.created_at)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="table-empty">
                        No leads loaded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
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
              <div className="split">
                <div className="split__left">
                  <p className="subhead">Threads</p>
                  <div className="list">
                    {threads.length ? (
                      threads.map((t) => (
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
                  <p className="subhead">Messages</p>
                  <div className="messages">
                    {!threadId ? (
                      <div className="empty-box">Click a bot/thread in the left list to view chat messages.</div>
                    ) : messages.length ? (
                      messages.map((m) => (
                        <div key={m.id} className={`msg msg--${m.role}`}>
                          <div className="msg__meta">
                            <span className="msg__chatbot">Bot {m.chatbot_id || chatbotId || '—'}</span>
                            <span className="msg__role">{m.role}</span>
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
                    <label>
                      Red
                      <input
                        className="input"
                        type="text"
                        value={settings.theme?.red || ''}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, theme: { ...(s.theme || {}), red: e.target.value } }))
                        }
                      />
                    </label>
                    <label>
                      Black
                      <input
                        className="input"
                        type="text"
                        value={settings.theme?.black || ''}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, theme: { ...(s.theme || {}), black: e.target.value } }))
                        }
                      />
                    </label>
                    <label>
                      White
                      <input
                        className="input"
                        type="text"
                        value={settings.theme?.white || ''}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, theme: { ...(s.theme || {}), white: e.target.value } }))
                        }
                      />
                    </label>
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
      </main>
    </div>
  )
}

