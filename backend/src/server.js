import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { crawlWebsite } from './scrapeWithSelenium.js'
import { crawlWebsiteHttp } from './scrapeWithFetch.js'
import { structureWebsiteForChatbot } from './structureWithOpenAI.js'
import { encryptWithPassword, decryptWithPassword } from './encryptContextBundle.js'
import { encryptWithServerSecret, decryptWithServerSecret } from './encryptServerSecret.js'
import {
  allocateNewChatbotId,
  persistChatbotRecord,
  readChatbotRecord,
  deleteChatbotRecord,
  updateChatbotRecord,
  resolveChatbotIdByPasswordAsync,
  isDatabaseEnabled,
} from './chatbotPersistence.js'
import { usingDefaultPepper } from './passwordLookup.js'
import { dbHealthCheck, describeDatabaseUrlForLog, getPool } from './dbPool.js'
import { createTestSession, getTestSession, pushExchange, startNewChatThread } from './chatbotTestSession.js'
import { appendChatExchange, listChatMessages } from './chatbotChatHistory.js'
import {
  CHAT_TONE_IDS,
  deriveChatTheme,
  buildChatSystemPrompt,
  normalizeChatToneId,
  temperatureForChatTone,
} from './chatbotTestPrompt.js'
import { runChatCompletion } from './chatWithOpenAI.js'
import { saveTrialInquiry } from './trialInquiryStore.js'
import { isContactMailConfigured, sendContactDemoEmails } from './sendContactDemoEmails.js'
import { getDataRoot } from './dataPaths.js'

const PORT = Number(process.env.PORT) || 3000
/** 5-minute trial from first save (or from legacy record createdAt) */
const TRIAL_MS = 2 * 60 * 1000

function supportContactMeta() {
  const email = String(process.env.COMPANY_CONTACT_EMAIL || process.env.CONTACT_GMAIL_USER || '').trim()
  return {
    name: String(process.env.COMPANY_CONTACT_NAME || 'Admin Support').trim(),
    email,
    phone: String(process.env.COMPANY_CONTACT_PHONE || '').trim(),
    address: String(process.env.COMPANY_CONTACT_ADDRESS || '').trim(),
    hours: String(process.env.COMPANY_CONTACT_HOURS || '').trim(),
  }
}

/**
 * URLs embedded in the client integration pack (widget.js, /api/...).
 * Without this, `Host` is often 127.0.0.1 during local admin use — bad for SaaS handoff.
 *
 * Set on Vercel (or any host): PUBLIC_API_ORIGIN=https://your-app.vercel.app
 * Optional alias: API_PUBLIC_ORIGIN. Trailing slash stripped.
 * If unset, VERCEL_URL is used as https://… (Vercel sets it automatically).
 */
function resolvePublicApiOrigin(req) {
  const raw = String(process.env.PUBLIC_API_ORIGIN || process.env.API_PUBLIC_ORIGIN || '').trim()
  if (raw) {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
      const u = new URL(withProto.replace(/\/$/, ''))
      return `${u.protocol}//${u.host}`
    } catch {
      /* fall through */
    }
  }
  const vercel = String(process.env.VERCEL_URL || '').trim().replace(/\/$/, '')
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, '')
    return `https://${host}`
  }
  const proto =
    String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim() || (req.secure ? 'https' : 'http')
  const host = String(req.headers.host || '').trim()
  return host ? `${proto}://${host}` : ''
}

function trialEndsAtFromRecord(record) {
  if (record.trialEndsAt && typeof record.trialEndsAt === 'string') {
    const t = Date.parse(record.trialEndsAt)
    if (!Number.isNaN(t)) return new Date(t).toISOString()
  }
  const c = Date.parse(record.createdAt)
  if (!Number.isNaN(c)) return new Date(c + TRIAL_MS).toISOString()
  return new Date(Date.now() + TRIAL_MS).toISOString()
}

const app = express()

/** Public API: any browser origin may call this backend (reflect request Origin). */
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
)
app.use(express.json({ limit: '15mb' }))

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const ADMIN_TOKEN_SECRET = String(process.env.ADMIN_LOGIN_TOKEN_SECRET || 'change-this-admin-token-secret').trim()

function adminCredentialConfig() {
  return {
    email: String(process.env.ADMIN_LOGIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
    password: String(process.env.ADMIN_LOGIN_PASSWORD || 'admin123').trim(),
  }
}

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeBase64UrlToString(value) {
  try {
    return Buffer.from(String(value || ''), 'base64url').toString('utf8')
  } catch {
    return ''
  }
}

function integrationSecretPepper() {
  // Server-only pepper so client can't guess token hash/validation data.
  const p = String(process.env.INTEGRATION_SECRET_PEPPER || ADMIN_TOKEN_SECRET || '').trim()
  return p || 'dev-insecure-integration-secret-pepper'
}

function hashIntegrationSecret(secret) {
  const s = typeof secret === 'string' ? secret : ''
  return crypto.createHmac('sha256', integrationSecretPepper()).update(String(s), 'utf8').digest('hex')
}

function timingSafeEqualHex(a, b) {
  const sa = String(a || '')
  const sb = String(b || '')
  if (!sa || !sb || sa.length !== sb.length) return false
  const ab = Buffer.from(sa, 'hex')
  const bb = Buffer.from(sb, 'hex')
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

function signAdminTokenPart(payloadB64) {
  return crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(String(payloadB64 || '')).digest('base64url')
}

function createAdminToken(email) {
  const payload = {
    email,
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
  }
  const payloadB64 = encodeBase64Url(JSON.stringify(payload))
  const sig = signAdminTokenPart(payloadB64)
  return `${payloadB64}.${sig}`
}

function verifyAdminToken(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expected = signAdminTokenPart(payloadB64)
  const a = Buffer.from(String(sig || ''), 'utf8')
  const b = Buffer.from(String(expected || ''), 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  const raw = decodeBase64UrlToString(payloadB64)
  if (!raw) return null
  let payload = null
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }
  const email = String(payload?.email || '').trim().toLowerCase()
  const exp = Number(payload?.exp || 0)
  if (!email || !Number.isFinite(exp) || exp <= Date.now()) return null
  return { email, expiresAt: exp }
}

function requireAdminAuth(req, res, next) {
  // Login endpoint is intentionally public.
  if (req.path === '/login') return next()
  const raw = String(req.headers.authorization || '')
  const m = /^Bearer\s+(.+)$/i.exec(raw)
  const token = m ? String(m[1] || '').trim() : ''
  if (!token) return res.status(401).json({ ok: false, error: 'Admin login required' })
  const session = verifyAdminToken(token)
  if (!session) return res.status(401).json({ ok: false, error: 'Session expired. Please login again.' })
  req.adminSession = session
  return next()
}

/**
 * Try Selenium crawl first; fall back to HTTP + HTML parse when Chrome/Driver is missing (typical on PaaS).
 * Set SCRAPE_ENGINE=http to skip the browser entirely.
 */
async function crawlWebsiteWithFallback(seedUrl, crawlOpts) {
  const mode = String(process.env.SCRAPE_ENGINE || '').trim().toLowerCase()
  if (mode === 'http' || mode === 'fetch') {
    return crawlWebsiteHttp(seedUrl, crawlOpts)
  }
  const score = (r) => {
    const pages = Number(r?.crawl?.pagesVisited || 0)
    const textLen = String(r?.text || '').length
    return pages * 5000 + textLen
  }
  try {
    const seleniumResult = await crawlWebsite(seedUrl, crawlOpts)
    const weak =
      Number(seleniumResult?.crawl?.pagesVisited || 0) < 3 || String(seleniumResult?.text || '').length < 6000
    if (!weak) return seleniumResult

    // Some sites block or thin out browser text. Run HTTP crawl too and keep the richer result.
    try {
      const httpResult = await crawlWebsiteHttp(seedUrl, crawlOpts)
      return score(httpResult) > score(seleniumResult) ? httpResult : seleniumResult
    } catch (e2) {
      console.warn('[scrape] HTTP enrichment failed after weak Selenium crawl:', e2 instanceof Error ? e2.message : e2)
      return seleniumResult
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[scrape] Selenium unavailable or failed, using HTTP crawl:', msg)
    return crawlWebsiteHttp(seedUrl, crawlOpts)
  }
}

function normalizeTargetUrl(input) {
  if (!input || typeof input !== 'string') return null
  let s = input.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  let u
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  return u.href
}

function canonicalWebsiteUrl(input) {
  const n = normalizeTargetUrl(input)
  if (!n) return null
  try {
    const u = new URL(n)
    u.hash = ''
    if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = ''
    u.pathname = u.pathname.replace(/\/+$/, '') || '/'
    return u.href.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Admin-only: rebuild the same JSON shape as /api/chatbot-context/save uses, by re-crawling `record.websiteUrl`.
 * Lets you issue SDK secrets without the customer’s “Test chatbot” password (context is re-fetched from the live site).
 * @param {object} record
 * @returns {Promise<string>} JSON string (inner payload)
 */
async function rebuildInnerJsonFromStoredWebsite(record) {
  const rawUrl = typeof record.websiteUrl === 'string' ? record.websiteUrl.trim() : ''
  const target = normalizeTargetUrl(rawUrl)
  if (!target) {
    const err = new Error('NO_WEBSITE_URL')
    /** @type {any} */ (err).code = 'NO_WEBSITE_URL'
    throw err
  }
    const ownerContact = {
      name: typeof record.owner?.name === 'string' ? record.owner.name.trim() : '',
      email: typeof record.owner?.email === 'string' ? record.owner.email.trim() : '',
      phone: typeof record.owner?.phone === 'string' ? record.owner.phone.trim() : '',
    }
    // Use crawler defaults (env-driven, broader site coverage) instead of a strict 25/4 cap.
    const crawlOpts = {}
  const result = await crawlWebsiteWithFallback(target, crawlOpts)

  let structuredContext = null
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const out = await structureWebsiteForChatbot({
        url: target,
        title: result.title,
        scrapedText: result.text,
        owner: ownerContact,
      })
      structuredContext = out.structured
    } catch (e) {
      console.warn('[admin/rebuild-inner] structure skipped:', e)
    }
  }

  const inner = {
    v: 1,
    savedAt: new Date().toISOString(),
    websiteUrl: target,
    pageTitle: typeof result.title === 'string' ? result.title : '',
    scrapedText: typeof result.text === 'string' ? result.text : '',
    structuredContext,
    confidentialPrompts: '',
    owner: {
      name: ownerContact.name,
      email: ownerContact.email,
      phone: ownerContact.phone,
    },
    crawl: result.crawl && typeof result.crawl === 'object' ? result.crawl : null,
  }
  return JSON.stringify(inner)
}

async function ensureAdminSettingsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.admin_settings (
      id TEXT PRIMARY KEY,
      settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

async function getAdminSettings(pool) {
  await ensureAdminSettingsSchema(pool)
  const r = await pool.query(`SELECT settings_json FROM public.admin_settings WHERE id = 'global' LIMIT 1`)
  const defaults = {
    theme: { red: '#dc2626', black: '#000000', white: '#ffffff' },
    // Match the landing page defaults ($299 / $499 / $799)
    pricing: { starter: 299, growth: 499, pro: 799, currency: 'USD' },
  }
  const saved = r.rowCount ? r.rows[0].settings_json : {}
  return { ...defaults, ...(saved || {}) }
}

app.get('/api/health', async (_req, res) => {
  const db = isDatabaseEnabled() ? await dbHealthCheck() : { ok: false, skipped: true }
  res.json({
    ok: true,
    service: 'scrape-api',
    chatbotStore: isDatabaseEnabled() ? 'postgres' : 'filesystem',
    database: db,
  })
})

const CHATBOT_ID_RE = /^\d{8}$/

app.get('/api/chatbot-context/new-id', async (_req, res) => {
  try {
    const chatbotId = await allocateNewChatbotId()
    res.json({ ok: true, chatbotId })
  } catch (e) {
    console.error('[chatbot-context/new-id]', e)
    res.status(500).json({ ok: false, error: 'Could not allocate chatbot ID' })
  }
})

app.post('/api/chatbot-context/save', async (req, res) => {
  try {
    const { chatbotId, payload } = req.body || {}

    if (!CHATBOT_ID_RE.test(String(chatbotId || ''))) {
      return res.status(400).json({ ok: false, error: 'Invalid or missing 8-digit chatbot ID' })
    }
    const id = String(chatbotId)
    // Auto-generate an internal lock key so visitors do not need any password for testing/widget.
    const pw = crypto.randomBytes(24).toString('base64url')
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ ok: false, error: 'Missing payload object' })
    }

    const inner = {
      v: 1,
      savedAt: new Date().toISOString(),
      websiteUrl: typeof payload.websiteUrl === 'string' ? payload.websiteUrl : '',
      pageTitle: typeof payload.pageTitle === 'string' ? payload.pageTitle : '',
      scrapedText: typeof payload.scrapedText === 'string' ? payload.scrapedText : '',
      structuredContext:
        payload.structuredContext !== undefined && payload.structuredContext !== null
          ? payload.structuredContext
          : null,
      confidentialPrompts:
        typeof payload.confidentialPrompts === 'string' ? payload.confidentialPrompts : '',
      owner:
        payload.owner && typeof payload.owner === 'object'
          ? {
              name: String(payload.owner.name || ''),
              email: String(payload.owner.email || ''),
              phone: String(payload.owner.phone || ''),
            }
          : { name: '', email: '', phone: '' },
      crawl: payload.crawl && typeof payload.crawl === 'object' ? payload.crawl : null,
    }

    // Enforce unique account and one-time website extraction at save boundary too.
    if (isDatabaseEnabled()) {
      const pool = getPool()
      if (pool) {
        const websiteKey = canonicalWebsiteUrl(inner.websiteUrl || '')
        if (websiteKey) {
          const sameWebsite = await pool.query(
            `SELECT chatbot_id FROM public.chatbot_contexts
             WHERE lower(regexp_replace(coalesce(record_json->>'websiteUrl', ''), '/+$', '')) = $1
               AND chatbot_id <> $2
             LIMIT 1`,
            [websiteKey.replace(/\/+$/, ''), id],
          )
          if (sameWebsite.rowCount) {
            return res.status(409).json({
              ok: false,
              error: 'This website has already been extracted once. Contact admin for paid renewal.',
            })
          }
        }
        const ownerEmail = String(inner.owner?.email || '').trim().toLowerCase()
        if (ownerEmail) {
          const sameEmail = await pool.query(
            `SELECT chatbot_id FROM public.chatbot_contexts
             WHERE lower(coalesce(record_json->'owner'->>'email', '')) = $1
               AND chatbot_id <> $2
             LIMIT 1`,
            [ownerEmail, id],
          )
          if (sameEmail.rowCount) {
            return res.status(409).json({
              ok: false,
              error: 'This email already has an existing chatbot account. Contact admin to upgrade.',
            })
          }
        }
      }
    }

    const plain = JSON.stringify(inner)
    const encrypted = encryptWithPassword(pw, plain)
    /** Server-sealed copy: allows widget/SDK to load context with integrationSecret only (no end-user password). */
    const serverSealed = encryptWithServerSecret(plain)

    // Per-chatbot integration secret for auto-unlock via widget.
    // Stored encrypted so the visitor never types the chatbot password.
    const integrationSecret = crypto.randomBytes(32).toString('base64url')
    const integrationSecretHash = hashIntegrationSecret(integrationSecret)
    const integrationSecretEnc = encryptWithServerSecret(integrationSecret)
    const previewSecret = crypto.randomBytes(24).toString('base64url')
    const previewSecretHash = hashIntegrationSecret(previewSecret)
    const passwordEnc = encryptWithServerSecret(pw)

    const trialEndsAt = new Date(Date.now() + TRIAL_MS).toISOString()

    const record = {
      v: 1,
      chatbotId: id,
      createdAt: inner.savedAt,
      trialEndsAt,
      websiteUrl: inner.websiteUrl || '',
      owner: {
        name: inner.owner?.name || '',
        email: inner.owner?.email || '',
        phone: inner.owner?.phone || '',
      },
      encrypted,
      serverSealed,
      // Needed for:
      // 1) auto-unlock widget (integrationSecret -> decrypt password -> decrypt context)
      // 2) admin later copying the integration snippet (secretEnc -> reveal integrationSecret)
      integration: {
        secretHash: integrationSecretHash,
        secretEnc: integrationSecretEnc,
        passwordEnc,
      },
      preview: {
        secretHash: previewSecretHash,
      },
      note: 'Decrypt only with your password using the same algorithm (AES-256-GCM + scrypt).',
    }

    try {
      await persistChatbotRecord(id, pw, record)
    } catch (regErr) {
      if (regErr && typeof regErr === 'object' && 'code' in regErr && regErr.code === 'PASSWORD_LOOKUP_TAKEN') {
        await deleteChatbotRecord(id)
        return res.status(409).json({
          ok: false,
          error:
            'This password is already linked to another saved website context. Use a unique password for each business.',
        })
      }
      throw regErr
    }

    const securedExportForClient = { ...record }
    delete securedExportForClient.serverSealed

    res.json({
      ok: true,
      chatbotId: id,
      createdAt: record.createdAt,
      trialEndsAt: record.trialEndsAt,
      // One-time immediate testing credentials for landing-page preview (no password prompt).
      widgetBootstrap: {
        chatbotId: id,
        integrationSecret,
      },
      // Landing preview only (trial/session restrictions still apply).
      previewBootstrap: {
        chatbotId: id,
        previewSecret,
      },
      /** Portable encrypted backup for download (server-sealed field omitted — for SDK use your embed/API only). */
      securedExport: securedExportForClient,
    })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'CHATBOT_ID_TAKEN') {
      return res.status(409).json({
        ok: false,
        error: 'This chatbot ID is already saved. Request a new ID and try again.',
      })
    }
    console.error('[chatbot-context/save]', e)
    res.status(500).json({ ok: false, error: 'Could not save secured context' })
  }
})

app.post('/api/chatbot-test/open', async (req, res) => {
  try {
    const { password } = req.body || {}
    const pw = typeof password === 'string' ? password : ''
    if (pw.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' })
    }

    const chatbotId = await resolveChatbotIdByPasswordAsync(pw)
    if (!chatbotId) {
      return res.status(401).json({
        ok: false,
        error:
          'No knowledge base is registered for this password. Use the same password you chose when you clicked Submit (encrypt & save). If you saved before this feature, save your context again once.',
      })
    }

    const record = await readChatbotRecord(chatbotId)
    if (!record || !record.encrypted) {
      return res.status(404).json({
        ok: false,
        error: 'Saved context was not found. Try saving your website context again.',
      })
    }

    let inner
    try {
      const plain = decryptWithPassword(pw, record.encrypted)
      inner = JSON.parse(plain)
    } catch {
      return res.status(401).json({
        ok: false,
        error: 'Could not unlock your knowledge base. Check your password or save your context again.',
      })
    }

    if (!inner || typeof inner !== 'object') {
      return res.status(500).json({ ok: false, error: 'Invalid decrypted payload' })
    }

    const theme = deriveChatTheme(inner)
    const trialEndsAt = trialEndsAtFromRecord(record)
    const trialExpired = Date.now() >= Date.parse(trialEndsAt)
    const { sessionId, threadId } = createTestSession(inner, trialEndsAt, chatbotId)

    let chatHistory = []
    try {
      chatHistory = await listChatMessages(chatbotId)
    } catch (e) {
      console.warn('[chatbot-test/open] load chat history', e)
    }

    res.json({
      ok: true,
      sessionId,
      threadId,
      chatHistory,
      theme,
      chatbotId,
      trialEndsAt,
      serverTime: new Date().toISOString(),
      trialExpired,
      supportContact: supportContactMeta(),
    })
  } catch (e) {
    console.error('[chatbot-test/open]', e)
    res.status(500).json({ ok: false, error: 'Could not open chat session' })
  }
})

// Landing preview auto-open (no password UX), but keeps strict trial/session restrictions.
app.post('/api/chatbot-test/open-preview', async (req, res) => {
  try {
    const { chatbotId, previewSecret } = req.body || {}
    const id = typeof chatbotId === 'string' ? chatbotId.trim() : ''
    const sec = typeof previewSecret === 'string' ? previewSecret : ''
    if (!CHATBOT_ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Invalid chatbotId' })
    if (sec.length < 12) return res.status(400).json({ ok: false, error: 'Missing previewSecret' })

    const record = await readChatbotRecord(id)
    if (!record || !record.encrypted) {
      return res.status(404).json({ ok: false, error: 'Chatbot context not found' })
    }
    const preview = record.preview && typeof record.preview === 'object' ? record.preview : null
    if (!preview?.secretHash) {
      return res.status(403).json({ ok: false, error: 'Preview access is not configured for this chatbot' })
    }
    const expectedHash = hashIntegrationSecret(sec)
    if (!timingSafeEqualHex(expectedHash, preview.secretHash)) {
      return res.status(401).json({ ok: false, error: 'Invalid previewSecret' })
    }

    if (!(record.serverSealed && typeof record.serverSealed === 'object' && record.serverSealed.ciphertext)) {
      return res.status(403).json({ ok: false, error: 'Preview data unavailable. Re-save chatbot once.' })
    }
    let inner
    try {
      inner = JSON.parse(decryptWithServerSecret(record.serverSealed))
    } catch {
      return res.status(500).json({ ok: false, error: 'Could not open chatbot preview context' })
    }

    const theme = deriveChatTheme(inner)
    const trialEndsAt = trialEndsAtFromRecord(record)
    const trialExpired = Date.now() >= Date.parse(trialEndsAt)
    const { sessionId, threadId } = createTestSession(inner, trialEndsAt, id, { source: 'preview' })

    let chatHistory = []
    try {
      chatHistory = await listChatMessages(id)
    } catch (e) {
      console.warn('[chatbot-test/open-preview] load chat history', e)
    }

    res.json({
      ok: true,
      sessionId,
      threadId,
      chatHistory,
      theme,
      chatbotId: id,
      trialEndsAt,
      serverTime: new Date().toISOString(),
      trialExpired,
      supportContact: supportContactMeta(),
    })
  } catch (e) {
    console.error('[chatbot-test/open-preview]', e)
    res.status(500).json({ ok: false, error: 'Could not open chatbot preview' })
  }
})

// Widget auto-unlock:
// - Visitor NEVER types the chatbot password.
// - Widget sends { chatbotId, integrationSecret } (client SDK key).
// - Prefer serverSealed + integrationSecret; legacy rows use passwordEnc + customer password ciphertext.
app.post('/api/widget/open', async (req, res) => {
  try {
    const { chatbotId, integrationSecret } = req.body || {}
    const id = typeof chatbotId === 'string' ? chatbotId.trim() : ''
    const sec = typeof integrationSecret === 'string' ? integrationSecret : ''

    if (!CHATBOT_ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Invalid chatbotId' })
    if (sec.length < 16) return res.status(400).json({ ok: false, error: 'Missing integrationSecret' })

    const record = await readChatbotRecord(id)
    if (!record || !record.encrypted) {
      return res.status(404).json({ ok: false, error: 'Chatbot context not found' })
    }

    const integration = record.integration && typeof record.integration === 'object' ? record.integration : null
    const hasServerSealed =
      record.serverSealed && typeof record.serverSealed === 'object' && Boolean(record.serverSealed.ciphertext)
    const hasLegacyPasswordEnc =
      integration?.passwordEnc &&
      typeof integration.passwordEnc === 'object' &&
      Boolean(integration.passwordEnc.ciphertext)

    if (!integration?.secretHash || !integration?.secretEnc) {
      return res.status(403).json({
        ok: false,
        error: 'This chatbot does not have widget integration configured. Ask admin to re-save the context.',
      })
    }
    if (!hasServerSealed && !hasLegacyPasswordEnc) {
      return res.status(403).json({
        ok: false,
        error: 'This chatbot is missing server embed data. Open admin → Copy once (or re-save from the landing page).',
      })
    }

    const expectedHash = hashIntegrationSecret(sec)
    if (!timingSafeEqualHex(expectedHash, integration.secretHash)) {
      return res.status(401).json({ ok: false, error: 'Invalid integrationSecret' })
    }

    let inner
    if (hasServerSealed) {
      try {
        const plain = decryptWithServerSecret(record.serverSealed)
        inner = JSON.parse(plain)
      } catch {
        return res.status(500).json({ ok: false, error: 'Could not load context for this integration' })
      }
    } else {
      const pw = decryptWithServerSecret(/** @type {any} */ (integration).passwordEnc)
      if (typeof pw !== 'string' || pw.length < 8) {
        return res.status(500).json({ ok: false, error: 'Integration secret invalid on server' })
      }
      try {
        const plain = decryptWithPassword(pw, record.encrypted)
        inner = JSON.parse(plain)
      } catch {
        return res.status(401).json({ ok: false, error: 'Could not decrypt context for this integration' })
      }
    }

    const theme = deriveChatTheme(inner)
    const trialEndsAt = trialEndsAtFromRecord(record)
    const trialExpired = Date.now() >= Date.parse(trialEndsAt)
    const { sessionId, threadId } = createTestSession(inner, trialEndsAt, id, {
      trialBypass: true,
      noSessionExpiry: true,
      source: 'widget',
    })

    let chatHistory = []
    try {
      chatHistory = await listChatMessages(id)
    } catch (e) {
      console.warn('[widget/open] load chat history', e)
    }

    res.json({
      ok: true,
      sessionId,
      threadId,
      chatHistory,
      theme,
      chatbotId: id,
      trialEndsAt: '',
      serverTime: new Date().toISOString(),
      trialExpired: false,
      supportContact: supportContactMeta(),
    })
  } catch (e) {
    console.error('[widget/open]', e)
    res.status(500).json({ ok: false, error: 'Could not open widget chat session' })
  }
})

const MAX_CONTACT_FIELD = 4000

app.post('/api/contact-demo', async (req, res) => {
  try {
    if (!isContactMailConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Contact email is not configured on the server. Set CONTACT_GMAIL_USER and CONTACT_GMAIL_APP_PASSWORD.',
      })
    }

    const b = req.body || {}
    const businessName = typeof b.businessName === 'string' ? b.businessName.trim().slice(0, 200) : ''
    const yourName = typeof b.yourName === 'string' ? b.yourName.trim().slice(0, 200) : ''
    const email = typeof b.email === 'string' ? b.email.trim().slice(0, 320) : ''
    const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 80) : ''
    const websiteUrl = typeof b.websiteUrl === 'string' ? b.websiteUrl.trim().slice(0, 500) : ''
    const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, MAX_CONTACT_FIELD) : ''

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' })
    }

    await sendContactDemoEmails({ businessName, yourName, email, phone, websiteUrl, notes })
    res.json({ ok: true })
  } catch (e) {
    console.error('[contact-demo]', e)
    const msg = e instanceof Error ? e.message : 'Failed to send email'
    res.status(500).json({ ok: false, error: 'Could not send your request. Please try again later.' })
  }
})

app.post('/api/trial-inquiry', async (req, res) => {
  try {
    const { name, email, phone, message, chatbotId } = req.body || {}
    const em = typeof email === 'string' ? email.trim() : ''
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return res.status(400).json({ ok: false, error: 'Valid email is required' })
    }
    const safeName = typeof name === 'string' ? name.trim() : ''
    const safePhone = typeof phone === 'string' ? phone.trim() : ''
    const safeMsg = typeof message === 'string' ? message.trim() : ''
    const safeChatbotId = typeof chatbotId === 'string' ? chatbotId.trim() : ''

    await saveTrialInquiry({
      name: safeName,
      email: em,
      phone: safePhone,
      message: safeMsg,
      chatbotId: safeChatbotId,
    })

    // Same mailer flow as Request-a-demo: notify admin inbox + confirmation to visitor.
    // Keep this best-effort so lead capture still succeeds even if mail provider is temporarily down.
    if (isContactMailConfigured()) {
      try {
        let businessName = ''
        let websiteUrl = ''
        if (CHATBOT_ID_RE.test(safeChatbotId)) {
          const record = await readChatbotRecord(safeChatbotId)
          businessName =
            (typeof record?.structuredContext?.inferredBusinessName === 'string' &&
              record.structuredContext.inferredBusinessName.trim()) ||
            (typeof record?.pageTitle === 'string' && record.pageTitle.trim()) ||
            ''
          websiteUrl = typeof record?.websiteUrl === 'string' ? record.websiteUrl.trim() : ''
        }
        await sendContactDemoEmails({
          businessName: businessName || `Trial lead (${safeChatbotId || 'unknown bot'})`,
          yourName: safeName,
          email: em,
          phone: safePhone,
          websiteUrl,
          notes: safeMsg || `Lead captured from trial-expired chatbot form. Chatbot ID: ${safeChatbotId || 'n/a'}`,
        })
      } catch (mailErr) {
        console.error('[trial-inquiry] mail', mailErr)
      }
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('[trial-inquiry]', e)
    res.status(500).json({ ok: false, error: 'Could not save inquiry' })
  }
})

app.post('/api/chatbot-test/message', async (req, res) => {
  req.setTimeout(120000)
  res.setTimeout(120000)

  try {
    const { sessionId, message, tone } = req.body || {}
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing session' })
    }

    const s = getTestSession(sessionId)
    if (!s) {
      return res.status(401).json({ ok: false, error: 'Session expired or invalid. Unlock again with your password.' })
    }

    const trialEndMs = Date.parse(s.trialEndsAt)
    const bypassTrial = !!s?.trialBypass && String(s?.source || '') === 'widget'
    if (!bypassTrial && !Number.isNaN(trialEndMs) && Date.now() >= trialEndMs) {
      return res.status(403).json({
        ok: false,
        trialExpired: true,
        error: 'Your 5-minute trial has ended. Contact us to continue using your chatbot.',
      })
    }

    const userMsg = typeof message === 'string' ? message.trim() : ''
    if (!userMsg) {
      return res.status(400).json({ ok: false, error: 'Message is required' })
    }
    if (userMsg.length > 6000) {
      return res.status(400).json({ ok: false, error: 'Message too long' })
    }

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return res.status(503).json({
        ok: false,
        error: 'Chat is disabled: set OPENAI_API_KEY on the server.',
      })
    }

    const toneId = normalizeChatToneId(tone)
    const systemPrompt = buildChatSystemPrompt(s.inner, toneId)
    const history = s.history.map((m) => ({ role: m.role, content: m.content }))

    const { content: reply, model } = await runChatCompletion({
      systemPrompt,
      history,
      userMessage: userMsg,
      temperature: temperatureForChatTone(toneId),
    })

    pushExchange(s, userMsg, reply)

    let saved = null
    if (s.chatbotId && s.threadId && /^\d{8}$/.test(String(s.chatbotId))) {
      try {
        saved = await appendChatExchange(s.chatbotId, s.threadId, userMsg, reply)
      } catch (err) {
        console.warn('[chatbot-test/message] chat history persist failed:', err)
      }
    }

    res.json({
      ok: true,
      reply,
      model,
      threadId: s.threadId,
      saved,
    })
  } catch (e) {
    console.error('[chatbot-test/message]', e)
    const msg = e instanceof Error ? e.message : 'Chat failed'
    res.status(500).json({ ok: false, error: msg })
  }
})

app.post('/api/chatbot-test/history', async (req, res) => {
  try {
    const { sessionId } = req.body || {}
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing session' })
    }
    const s = getTestSession(sessionId)
    if (!s || !s.chatbotId || !/^\d{8}$/.test(String(s.chatbotId))) {
      return res.status(401).json({ ok: false, error: 'Session expired or invalid. Unlock again with your password.' })
    }
    const messages = await listChatMessages(s.chatbotId)
    res.json({ ok: true, messages, threadId: s.threadId })
  } catch (e) {
    console.error('[chatbot-test/history]', e)
    res.status(500).json({ ok: false, error: 'Could not load history' })
  }
})

app.post('/api/chatbot-test/clear', async (req, res) => {
  try {
    const { sessionId } = req.body || {}
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing session' })
    }
    const newThreadId = startNewChatThread(sessionId)
    if (!newThreadId) {
      return res.status(401).json({ ok: false, error: 'Session expired or invalid. Unlock again with your password.' })
    }
    res.json({ ok: true, threadId: newThreadId })
  } catch (e) {
    console.error('[chatbot-test/clear]', e)
    res.status(500).json({ ok: false, error: 'Could not clear chat' })
  }
})

app.post('/api/scrape', async (req, res) => {
  req.setTimeout(300000)
  res.setTimeout(300000)

  const { url, name, email, phone, website } = req.body || {}
  const rawUrl = website || url
  const target = normalizeTargetUrl(rawUrl)

  if (!target) {
    return res.status(400).json({ ok: false, error: 'Invalid or missing website URL' })
  }
  const websiteKey = canonicalWebsiteUrl(target)

  // Rule: expired accounts cannot re-scrape the same website URL.
  if (websiteKey && isDatabaseEnabled()) {
    try {
      const pool = getPool()
      if (pool) {
        const hit = await pool.query(
          `SELECT chatbot_id, trial_ends_at
           FROM public.chatbot_contexts
           WHERE lower(regexp_replace(coalesce(record_json->>'websiteUrl', ''), '/+$', '')) = $1
             AND trial_ends_at <= now()
           ORDER BY trial_ends_at DESC
           LIMIT 1`,
          [websiteKey.replace(/\/+$/, '')],
        )
        if (hit.rowCount) {
          return res.status(403).json({
            ok: false,
            trialExpired: true,
            error:
              'This website already has an expired chatbot trial. Contact admin to renew before scraping again.',
          })
        }
      }
    } catch (e) {
      console.warn('[scrape] expired-site check failed, continuing:', e)
    }
  }

  const ownerContact = {
    name: typeof name === 'string' ? name.trim() : '',
    email: typeof email === 'string' ? email.trim() : '',
    phone: typeof phone === 'string' ? phone.trim() : '',
  }
  const ownerEmailNorm = ownerContact.email.toLowerCase()

  // SaaS policy:
  // 1) One website can only be extracted once (admin must renew/approve any further extraction).
  // 2) One email can own only one extracted website.
  if (isDatabaseEnabled()) {
    try {
      const pool = getPool()
      if (pool) {
        const websiteExisting = websiteKey
          ? await pool.query(
              `SELECT chatbot_id FROM public.chatbot_contexts
               WHERE lower(regexp_replace(coalesce(record_json->>'websiteUrl', ''), '/+$', '')) = $1
               LIMIT 1`,
              [websiteKey.replace(/\/+$/, '')],
            )
          : { rowCount: 0 }
        if (websiteExisting.rowCount) {
          return res.status(409).json({
            ok: false,
            error:
              'This website has already been extracted once. Contact admin to continue with paid subscription.',
          })
        }
        if (ownerEmailNorm) {
          const emailExisting = await pool.query(
            `SELECT chatbot_id FROM public.chatbot_contexts
             WHERE lower(coalesce(record_json->'owner'->>'email', '')) = $1
             LIMIT 1`,
            [ownerEmailNorm],
          )
          if (emailExisting.rowCount) {
            return res.status(409).json({
              ok: false,
              error:
                'This email already has a chatbot account. One unique account can extract one website only. Contact admin for upgrade.',
            })
          }
        }
      }
    } catch (e) {
      console.warn('[scrape] uniqueness policy check failed, continuing:', e)
    }
  }

  try {
    const crawlOpts = {}
    const mp = Number(req.body?.crawlMaxPages)
    if (!Number.isNaN(mp) && mp > 0) crawlOpts.maxPages = Math.min(mp, 200)
    const md = Number(req.body?.crawlMaxDepth)
    if (!Number.isNaN(md) && md >= 0) crawlOpts.maxDepth = Math.min(md, 12)

    const result = await crawlWebsiteWithFallback(target, crawlOpts)

    let structuredContext = null
    let structuredMeta = {
      attempted: false,
      ok: false,
      model: null,
      inputCharsUsed: null,
      error: /** @type {string | null} */ (null),
    }

    if (process.env.OPENAI_API_KEY?.trim()) {
      structuredMeta.attempted = true
      try {
        const out = await structureWebsiteForChatbot({
          url: target,
          title: result.title,
          scrapedText: result.text,
          owner: ownerContact,
        })
        structuredContext = out.structured
        structuredMeta.ok = true
        structuredMeta.model = out.model
        structuredMeta.inputCharsUsed = out.inputCharsUsed
      } catch (e) {
        structuredMeta.error = e instanceof Error ? e.message : String(e)
        console.error('[structure]', e)
      }
    }

    // Owner personal details must not be injected into the knowledge bundle.
    // Chat responses should be grounded ONLY in scraped website text.

    res.json({
      ok: true,
      url: target,
      title: result.title,
      text: result.text,
      structuredContext,
      meta: {
        cleanedLength: result.text.length,
        approximateRawLength: result.rawLength,
        contact: ownerContact,
        structured: structuredMeta,
        crawl: result.crawl,
      },
    })
  } catch (err) {
    console.error('[scrape]', err)
    const message =
      err && err.message
        ? err.message
        : 'Scraping failed. Is Chrome installed? Check backend logs.'
    res.status(500).json({ ok: false, error: message })
  }
})

app.use('/api/admin', requireAdminAuth)

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    const inputEmail = String(email || '').trim().toLowerCase()
    const inputPassword = String(password || '').trim()
    if (!inputEmail || !inputPassword) {
      return res.status(400).json({ ok: false, error: 'Email and password are required' })
    }
    const cfg = adminCredentialConfig()
    if (inputEmail !== cfg.email || inputPassword !== cfg.password) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' })
    }
    const token = createAdminToken(inputEmail)
    return res.json({
      ok: true,
      token,
      admin: { email: inputEmail },
      expiresInMs: ADMIN_SESSION_TTL_MS,
    })
  } catch (e) {
    console.error('[admin/login]', e)
    return res.status(500).json({ ok: false, error: 'Could not login' })
  }
})

app.get('/api/admin/metrics', async (_req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for admin metrics' })
    const [chatbots, messages, inquiries] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_chatbots,
           COUNT(*) FILTER (WHERE trial_ends_at > now())::int AS active_trials,
           COUNT(*) FILTER (WHERE trial_ends_at <= now())::int AS ended_trials
         FROM public.chatbot_contexts`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS messages_today
         FROM public.chatbot_chat_messages
         WHERE created_at >= date_trunc('day', now())`,
      ),
      pool.query(`SELECT COUNT(*)::int AS total_trial_inquiries FROM public.trial_inquiries`),
    ])
    res.json({
      ok: true,
      ...chatbots.rows[0],
      ...(messages.rows[0] || { messages_today: 0 }),
      ...(inquiries.rows[0] || { total_trial_inquiries: 0 }),
    })
  } catch (e) {
    console.error('[admin/metrics]', e)
    res.status(500).json({ ok: false, error: 'Could not load admin metrics' })
  }
})

app.get('/api/admin/chatbots', async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for admin chatbots' })
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200)
    const r = await pool.query(
      `SELECT
         chatbot_id,
         created_at,
         trial_ends_at,
         coalesce(record_json->>'websiteUrl', '') AS website_url,
         coalesce(record_json->'owner'->>'name', '') AS owner_name,
         coalesce(record_json->'owner'->>'email', '') AS owner_email,
         coalesce(record_json->'owner'->>'phone', '') AS owner_phone
       FROM public.chatbot_contexts
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    )
    res.json({ ok: true, chatbots: r.rows })
  } catch (e) {
    console.error('[admin/chatbots]', e)
    res.status(500).json({ ok: false, error: 'Could not load chatbots' })
  }
})

app.get('/api/admin/trials', async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for admin trials' })
    const status = String(req.query.status || 'active')
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500)
    const where = status === 'ended' ? 'cc.trial_ends_at <= now()' : 'cc.trial_ends_at > now()'
    const r = await pool.query(
      `SELECT
         ti.id,
         ti.name,
         ti.email,
         ti.phone,
         ti.message,
         ti.chatbot_id,
         ti.created_at,
         cc.trial_ends_at,
         coalesce(cc.record_json->>'websiteUrl', '') AS website_url
       FROM public.trial_inquiries ti
       LEFT JOIN public.chatbot_contexts cc ON cc.chatbot_id = ti.chatbot_id
       WHERE ${where}
       ORDER BY ti.created_at DESC
       LIMIT $1`,
      [limit],
    )
    res.json({ ok: true, trials: r.rows })
  } catch (e) {
    console.error('[admin/trials]', e)
    res.status(500).json({ ok: false, error: 'Could not load trial leads' })
  }
})

app.get('/api/admin/conversations', async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for conversations' })
    const chatbotId = String(req.query.chatbotId || '').trim()
    if (chatbotId && !CHATBOT_ID_RE.test(chatbotId)) return res.status(400).json({ ok: false, error: 'Invalid chatbotId' })
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500)
    const r = chatbotId
      ? await pool.query(
          `SELECT
             chatbot_id,
             thread_id,
             min(created_at) AS first_message_at,
             max(created_at) AS last_message_at,
             count(*)::int AS message_count
           FROM public.chatbot_chat_messages
           WHERE chatbot_id = $1
           GROUP BY chatbot_id, thread_id
           ORDER BY max(created_at) DESC
           LIMIT $2`,
          [chatbotId, limit],
        )
      : await pool.query(
          `SELECT
             chatbot_id,
             thread_id,
             min(created_at) AS first_message_at,
             max(created_at) AS last_message_at,
             count(*)::int AS message_count
           FROM public.chatbot_chat_messages
           GROUP BY chatbot_id, thread_id
           ORDER BY max(created_at) DESC
           LIMIT $1`,
          [limit],
        )
    res.json({ ok: true, threads: r.rows })
  } catch (e) {
    console.error('[admin/conversations]', e)
    res.status(500).json({ ok: false, error: 'Could not load conversations' })
  }
})

app.get('/api/admin/messages', async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for messages' })
    const chatbotId = String(req.query.chatbotId || '').trim()
    const threadId = String(req.query.threadId || '').trim()
    if (!threadId) return res.status(400).json({ ok: false, error: 'threadId is required' })
    if (chatbotId && !CHATBOT_ID_RE.test(chatbotId)) return res.status(400).json({ ok: false, error: 'Invalid chatbotId' })
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000)
    const r = chatbotId
      ? await pool.query(
          `SELECT id, chatbot_id, role, content, created_at
           FROM public.chatbot_chat_messages
           WHERE chatbot_id = $1 AND thread_id::text = $2
           ORDER BY created_at ASC, id ASC
           LIMIT $3`,
          [chatbotId, threadId, limit],
        )
      : await pool.query(
          `SELECT id, chatbot_id, role, content, created_at
           FROM public.chatbot_chat_messages
           WHERE thread_id::text = $1
           ORDER BY created_at ASC, id ASC
           LIMIT $2`,
          [threadId, limit],
        )
    res.json({ ok: true, messages: r.rows })
  } catch (e) {
    console.error('[admin/messages]', e)
    res.status(500).json({ ok: false, error: 'Could not load messages' })
  }
})

app.get('/api/admin/analytics', async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for analytics' })
    const days = Math.min(Math.max(Number(req.query.days) || 14, 3), 90)
    const r = await pool.query(
      `WITH d AS (
         SELECT generate_series((current_date - ($1::int - 1)), current_date, interval '1 day')::date AS day
       ),
       c AS (
         SELECT date(created_at) AS day, count(*)::int AS chatbots
         FROM public.chatbot_contexts
         WHERE created_at >= (current_date - ($1::int - 1))
         GROUP BY date(created_at)
       ),
       m AS (
         SELECT date(created_at) AS day, count(*)::int AS messages
         FROM public.chatbot_chat_messages
         WHERE created_at >= (current_date - ($1::int - 1))
         GROUP BY date(created_at)
       ),
       t AS (
         SELECT date(created_at) AS day, count(*)::int AS trial_leads
         FROM public.trial_inquiries
         WHERE created_at >= (current_date - ($1::int - 1))
         GROUP BY date(created_at)
       )
       SELECT
         d.day::text AS day,
         coalesce(c.chatbots, 0) AS chatbots,
         coalesce(m.messages, 0) AS messages,
         coalesce(t.trial_leads, 0) AS trial_leads
       FROM d
       LEFT JOIN c ON c.day = d.day
       LEFT JOIN m ON m.day = d.day
       LEFT JOIN t ON t.day = d.day
       ORDER BY d.day ASC`,
      [days],
    )
    res.json({ ok: true, series: r.rows })
  } catch (e) {
    console.error('[admin/analytics]', e)
    res.status(500).json({ ok: false, error: 'Could not load analytics' })
  }
})

app.get('/api/admin/settings', async (_req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for admin settings' })
    const settings = await getAdminSettings(pool)
    res.json({ ok: true, settings })
  } catch (e) {
    console.error('[admin/settings:get]', e)
    res.status(500).json({ ok: false, error: 'Could not load settings' })
  }
})

app.put('/api/admin/settings', async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for admin settings' })
    const current = await getAdminSettings(pool)
    const next = {
      ...current,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
    }
    await ensureAdminSettingsSchema(pool)
    await pool.query(
      `INSERT INTO public.admin_settings (id, settings_json, updated_at)
       VALUES ('global', $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at = now()`,
      [JSON.stringify(next)],
    )
    res.json({ ok: true, settings: next })
  } catch (e) {
    console.error('[admin/settings:put]', e)
    res.status(500).json({ ok: false, error: 'Could not save settings' })
  }
})

// Admin: attach / rotate widget integration (SDK secret). Never requires the customer password:
// - If serverSealed exists: rotate integration only.
// - Else: re-crawl `record.websiteUrl` and build serverSealed (admin trusts public URL on file).
// Optional body.password still works for rare manual decrypt migrations.
app.post('/api/admin/chatbot/:chatbotId/integration-bootstrap', async (req, res) => {
  req.setTimeout(300000)
  res.setTimeout(300000)
  try {
    const id = String(req.params.chatbotId || '').trim()
    if (!CHATBOT_ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Invalid chatbotId' })
    const { password } = req.body || {}
    const pw = typeof password === 'string' ? password : ''

    const record = await readChatbotRecord(id)
    if (!record?.encrypted) return res.status(404).json({ ok: false, error: 'Chatbot not found' })

    const hasServerSealed =
      record.serverSealed && typeof record.serverSealed === 'object' && Boolean(record.serverSealed.ciphertext)

    let plainForSeal = /** @type {string | null} */ (null)

    if (pw.length >= 8) {
      try {
        plainForSeal = decryptWithPassword(pw, record.encrypted)
        const inner = JSON.parse(plainForSeal)
        if (!inner || typeof inner !== 'object') throw new Error('Invalid decrypted payload')
      } catch {
        return res.status(401).json({ ok: false, error: 'Invalid password for this chatbot' })
      }
    } else if (hasServerSealed) {
      try {
        plainForSeal = decryptWithServerSecret(record.serverSealed)
        const inner = JSON.parse(plainForSeal)
        if (!inner || typeof inner !== 'object') throw new Error('Invalid sealed payload')
      } catch {
        return res.status(500).json({
          ok: false,
          error: 'Server-sealed context is unreadable. Use Copy again after fixing the record or re-save from the landing page.',
        })
      }
    } else {
      try {
        plainForSeal = await rebuildInnerJsonFromStoredWebsite(record)
        JSON.parse(plainForSeal)
      } catch (e) {
        const code = e && typeof e === 'object' && 'code' in e ? /** @type {any} */ (e).code : ''
        if (code === 'NO_WEBSITE_URL') {
          return res.status(400).json({
            ok: false,
            error: 'This chatbot has no website URL on file; cannot auto-build SDK context.',
          })
        }
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[admin/chatbot:integration-bootstrap] re-crawl', e)
        return res.status(502).json({
          ok: false,
          error: `Could not re-read the website to build SDK context: ${msg}`,
        })
      }
    }

    const integrationSecret = crypto.randomBytes(32).toString('base64url')
    const integrationSecretHash = hashIntegrationSecret(integrationSecret)
    const integrationSecretEnc = encryptWithServerSecret(integrationSecret)

    const next = {
      ...record,
      ...(plainForSeal && !hasServerSealed ? { serverSealed: encryptWithServerSecret(plainForSeal) } : {}),
      integration: {
        secretHash: integrationSecretHash,
        secretEnc: integrationSecretEnc,
        ...(pw.length >= 8 ? { passwordEnc: encryptWithServerSecret(pw) } : {}),
      },
    }

    await updateChatbotRecord(id, next)
    res.json({ ok: true })
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? /** @type {any} */ (e).code : ''
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'CHATBOT_NOT_FOUND' || code === 'CHATBOT_NOT_FOUND') {
      return res.status(404).json({ ok: false, error: 'Chatbot not found' })
    }
    console.error('[admin/chatbot:integration-bootstrap]', e)
    res.status(500).json({ ok: false, error: 'Could not enable widget integration' })
  }
})

// Admin: fetch integration snippet for a specific chatbot.
// Returns an embed code that auto-unlocks the bot via POST /api/widget/open.
app.get('/api/admin/chatbot/:chatbotId/integration', async (req, res) => {
  try {
    const id = String(req.params.chatbotId || '').trim()
    if (!CHATBOT_ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Invalid chatbotId' })

    const record = await readChatbotRecord(id)
    if (!record) return res.status(404).json({ ok: false, error: 'Chatbot not found' })

    const integration = record.integration && typeof record.integration === 'object' ? record.integration : null
    if (!integration?.secretEnc) {
      return res.status(403).json({
        ok: false,
        error:
          'Widget integration not configured. Use Download or Copy in admin (enables SDK keys automatically; first time may re-read the website, 1–2 min).',
      })
    }

    const integrationSecret = decryptWithServerSecret(integration.secretEnc)

    const origin = resolvePublicApiOrigin(req)

    const widgetScriptUrl = origin ? `${origin}/widget.js` : '/widget.js'
    const apiBase = origin ? `${origin}/api` : '/api'
    const embedCode = `<script src="${widgetScriptUrl}" data-wl-chatbot-id="${id}" data-wl-integration-secret="${integrationSecret}" defer></script>`

    const openBody = { chatbotId: id, integrationSecret }
    const messageExample = {
      sessionId: '<paste sessionId from open response>',
      message: 'What services do you offer?',
      tone: 'professional',
    }
    const historyExample = { sessionId: '<paste sessionId from open response>' }
    const clearExample = { sessionId: '<paste sessionId from open response>' }

    res.json({
      ok: true,
      chatbotId: id,
      integrationSecret,
      apiBase,
      widgetScriptUrl,
      embedCode,
      endpoints: {
        widgetOpen: `${apiBase}/widget/open`,
        chatMessage: `${apiBase}/chatbot-test/message`,
        chatHistory: `${apiBase}/chatbot-test/history`,
        chatClear: `${apiBase}/chatbot-test/clear`,
      },
      payload: {
        open: openBody,
        message: messageExample,
        history: historyExample,
        clear: clearExample,
      },
      responseShape: {
        open:
          '{ ok, sessionId, threadId, chatHistory?, theme?, chatbotId, trialEndsAt, serverTime, trialExpired, supportContact? }',
        message: '{ ok, reply, model?, threadId, saved? }',
        history: '{ ok, messages, threadId }',
        clear: '{ ok, threadId }',
      },
      toneIds: [...CHAT_TONE_IDS],
      notes: [
        'Knowledge is tied to this chatbotId: answers use only the scraped website context stored for that bot.',
        'Give your client chatbotId + integrationSecret only (SDK). They do not use the end-user “Test chatbot” password on their site.',
        'integrationSecret is like an API key: anyone with it can chat as this bot. Use admin Copy again to rotate.',
        'First Copy on an old row may re-crawl the stored website URL server-side (can take 1–2 minutes); keep the tab open.',
        'Flow: POST widget/open → use sessionId from JSON → POST chatbot-test/message for each user message.',
        'Sessions are server memory (~2h idle). Call widget/open again if you get session expired.',
        'Production: backend should set PUBLIC_API_ORIGIN=https://your-deployment.vercel.app (Vercel also sets VERCEL_URL) so this pack never lists 127.0.0.1 when you run admin locally.',
     ],
    })
  } catch (e) {
    console.error('[admin/chatbot:integration]', e)
    res.status(500).json({ ok: false, error: 'Could not build integration snippet' })
  }
})

app.delete('/api/admin/chatbot/:chatbotId', async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) return res.status(503).json({ ok: false, error: 'Database is required for delete' })
    const id = String(req.params.chatbotId || '').trim()
    if (!CHATBOT_ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Invalid chatbotId' })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM public.chatbot_chat_messages WHERE chatbot_id = $1', [id])
      await client.query('DELETE FROM public.trial_inquiries WHERE chatbot_id = $1', [id])
      await client.query('DELETE FROM public.chatbot_contexts WHERE chatbot_id = $1', [id])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('[admin/delete-chatbot]', e)
    res.status(500).json({ ok: false, error: 'Could not remove chatbot' })
  }
})

// Public widget script (auto-unlock UI).
app.get('/widget.js', async (_req, res) => {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const widgetFile = path.join(dir, 'widget.js')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.type('application/javascript')
    res.sendFile(widgetFile)
  } catch (e) {
    console.error('[widget.js]', e)
    res.status(500).type('text/plain').send('// widget.js failed to load')
  }
})

app.listen(PORT, async () => {
  console.log('[cors] open — all origins allowed (origin: true)')
  if (isDatabaseEnabled()) {
    const dbc = await dbHealthCheck()
    if (dbc.ok) {
      console.log('[db] Connected — PostgreSQL OK (chatbot_contexts use the database)')
    } else {
      console.warn(
        '[db] Not connected — DATABASE_URL is set but `SELECT 1` failed:',
        dbc.error || dbc.reason || 'check URI, password, and sslmode (try sslmode=no-verify with Node pg)',
      )
      const hint = describeDatabaseUrlForLog()
      if (hint.configured && !hint.parseError) {
        console.warn('[db] From DATABASE_URL (password hidden):', {
          host: hint.host,
          port: hint.port,
          user: hint.user,
          database: hint.database,
          sessionPoolerUserOk: hint.userLooksLikeSessionPooler,
        })
      }
      if (String(dbc.error || '').includes('Tenant or user not found')) {
        console.warn(
          '[db] "Tenant or user not found" → copy Session pooler URI from Supabase → Connect exactly (pooler host is often aws-0-… or aws-1-… per project). Reset database password if unsure; use ?sslmode=no-verify with Node pg.',
        )
      }
    }
  } else {
    console.log('[db] Skipped — no DATABASE_URL; chatbot contexts use the filesystem')
    console.log('[data]', getDataRoot(), '— secured contexts & inquiries')
  }
  console.log(`Scrape API listening on http://127.0.0.1:${PORT}`)
  {
    const explicit = String(process.env.PUBLIC_API_ORIGIN || process.env.API_PUBLIC_ORIGIN || '').trim()
    const vercel = String(process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '')
    if (explicit) {
      console.log('[integration] Client SDK packs use PUBLIC_API_ORIGIN →', explicit.replace(/\/$/, ''))
    } else if (vercel) {
      console.log('[integration] Client SDK packs use https://' + vercel + ' (VERCEL_URL)')
    } else {
      console.log(
        '[integration] Set PUBLIC_API_ORIGIN=https://your-app.vercel.app so client packs use your live API, not 127.0.0.1',
      )
    }
  }
  console.log('POST /api/scrape with JSON { website, name, email, phone }')
  console.log('GET /api/chatbot-context/new-id — allocate 8-digit context ID')
  console.log('POST /api/chatbot-context/save — secure store + issue auto widget integration')
  console.log(
    'POST /api/chatbot-test/open | /message | /history | /clear — personal chat (5-minute trial, persistent history)',
  )
  console.log('POST /api/trial-inquiry — contact form after trial')
  console.log('POST /api/contact-demo — Request a demo (Nodemailer → owner + submitter)')
  console.log('POST /api/admin/login — admin email/password login (no signup)')
  console.log('GET/PUT/DELETE /api/admin/* — requires Authorization: Bearer <token>')
  if (isContactMailConfigured()) {
    console.log(`Contact demo mail: leads → ${process.env.CONTACT_GMAIL_USER} (visitor email from form for confirmation)`)
  } else {
    console.log('Contact demo mail: disabled (set CONTACT_GMAIL_USER + CONTACT_GMAIL_APP_PASSWORD)')
  }
  if (usingDefaultPepper()) {
    console.warn(
      '[security] Set CONTEXT_PASSWORD_PEPPER in .env (long random string) so password→context lookup is unique to your server.',
    )
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    console.log(`OpenAI structuring enabled (model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'})`)
  } else {
    console.log('OpenAI structuring disabled — set OPENAI_API_KEY to return structuredContext JSON')
  }
})
