import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { crawlWebsite } from './scrapeWithSelenium.js'
import { crawlWebsiteHttp } from './scrapeWithFetch.js'
import { structureWebsiteForChatbot } from './structureWithOpenAI.js'
import { encryptWithPassword, decryptWithPassword } from './encryptContextBundle.js'
import { allocateNewId, saveRecord, readRecord, deleteRecord } from './chatbotContextStore.js'
import { registerPasswordLookup, resolveChatbotIdByPassword, usingDefaultPepper } from './passwordLookup.js'
import { createTestSession, getTestSession, pushExchange } from './chatbotTestSession.js'
import {
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
/** 3-day trial from first save (or from legacy record createdAt) */
const TRIAL_MS = 3 * 24 * 60 * 60 * 1000

function trialEndsAtFromRecord(record) {
  if (record.trialEndsAt && typeof record.trialEndsAt === 'string') {
    const t = Date.parse(record.trialEndsAt)
    if (!Number.isNaN(t)) return new Date(t).toISOString()
  }
  const c = Date.parse(record.createdAt)
  if (!Number.isNaN(c)) return new Date(c + TRIAL_MS).toISOString()
  return new Date(Date.now() + TRIAL_MS).toISOString()
}

function companyContactMeta() {
  return {
    name: process.env.COMPANY_CONTACT_NAME?.trim() || 'HogayAI',
    email: process.env.COMPANY_CONTACT_EMAIL?.trim() || 'contacthogayai@gmail.com',
    phone: process.env.COMPANY_CONTACT_PHONE?.trim() || '+1 (647) 673-9123',
    address: process.env.COMPANY_CONTACT_ADDRESS?.trim() || 'Toronto, Canada',
    hours: process.env.COMPANY_CONTACT_HOURS?.trim() || 'Monday to Friday, 9 AM–6 PM EST',
  }
}
const app = express()

/** Public API: any browser origin may call this backend (reflect request Origin). */
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
)
app.use(express.json({ limit: '15mb' }))

/**
 * Try Selenium crawl first; fall back to HTTP + HTML parse when Chrome/Driver is missing (typical on PaaS).
 * Set SCRAPE_ENGINE=http to skip the browser entirely.
 */
async function crawlWebsiteWithFallback(seedUrl, crawlOpts) {
  const mode = String(process.env.SCRAPE_ENGINE || '').trim().toLowerCase()
  if (mode === 'http' || mode === 'fetch') {
    return crawlWebsiteHttp(seedUrl, crawlOpts)
  }
  try {
    return await crawlWebsite(seedUrl, crawlOpts)
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

function normalizeWebsiteOwnerContact(owner) {
  const name = typeof owner?.name === 'string' ? owner.name.trim() : ''
  const email = typeof owner?.email === 'string' ? owner.email.trim() : ''
  const phone = typeof owner?.phone === 'string' ? owner.phone.trim() : ''
  return {
    name: name || null,
    email: email || null,
    phone: phone || null,
  }
}

/** Ensures structured JSON always carries verified intake owner details for the chatbot. */
function attachWebsiteOwnerContact(structured, owner) {
  const woc = normalizeWebsiteOwnerContact(owner)
  const has = !!(woc.name || woc.email || woc.phone)
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    if (has) return { ...structured, websiteOwnerContact: woc }
    return structured
  }
  if (has) return { websiteOwnerContact: woc }
  return structured
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'scrape-api' })
})

const CHATBOT_ID_RE = /^\d{8}$/

app.get('/api/chatbot-context/new-id', (_req, res) => {
  try {
    const chatbotId = allocateNewId()
    res.json({ ok: true, chatbotId })
  } catch (e) {
    console.error('[chatbot-context/new-id]', e)
    res.status(500).json({ ok: false, error: 'Could not allocate chatbot ID' })
  }
})

app.post('/api/chatbot-context/save', (req, res) => {
  try {
    const { chatbotId, password, payload } = req.body || {}

    if (!CHATBOT_ID_RE.test(String(chatbotId || ''))) {
      return res.status(400).json({ ok: false, error: 'Invalid or missing 8-digit chatbot ID' })
    }
    const id = String(chatbotId)
    const pw = typeof password === 'string' ? password : ''
    if (pw.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' })
    }
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

    const plain = JSON.stringify(inner)
    const encrypted = encryptWithPassword(pw, plain)

    const trialEndsAt = new Date(Date.now() + TRIAL_MS).toISOString()

    const record = {
      v: 1,
      chatbotId: id,
      createdAt: inner.savedAt,
      trialEndsAt,
      encrypted,
      note: 'Decrypt only with your password using the same algorithm (AES-256-GCM + scrypt).',
    }

    saveRecord(id, record)
    try {
      registerPasswordLookup(pw, id)
    } catch (regErr) {
      deleteRecord(id)
      if (regErr && typeof regErr === 'object' && 'code' in regErr && regErr.code === 'PASSWORD_LOOKUP_TAKEN') {
        return res.status(409).json({
          ok: false,
          error:
            'This password is already linked to another saved website context. Use a unique password for each business.',
        })
      }
      throw regErr
    }

    res.json({
      ok: true,
      chatbotId: id,
      createdAt: record.createdAt,
      trialEndsAt: record.trialEndsAt,
      /** Portable encrypted backup for download (same as stored server-side) */
      securedExport: record,
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

app.post('/api/chatbot-test/open', (req, res) => {
  try {
    const { password } = req.body || {}
    const pw = typeof password === 'string' ? password : ''
    if (pw.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' })
    }

    const chatbotId = resolveChatbotIdByPassword(pw)
    if (!chatbotId) {
      return res.status(401).json({
        ok: false,
        error:
          'No knowledge base is registered for this password. Use the same password you chose when you clicked Submit (encrypt & save). If you saved before this feature, save your context again once.',
      })
    }

    const record = readRecord(chatbotId)
    if (!record || !record.encrypted) {
      return res.status(404).json({ ok: false, error: 'Saved context file is missing. Try saving your website context again.' })
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
    const sessionId = createTestSession(inner, trialEndsAt)

    res.json({
      ok: true,
      sessionId,
      theme,
      chatbotId,
      trialEndsAt,
      serverTime: new Date().toISOString(),
      trialExpired,
      companyContact: companyContactMeta(),
    })
  } catch (e) {
    console.error('[chatbot-test/open]', e)
    res.status(500).json({ ok: false, error: 'Could not open chat session' })
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

app.post('/api/trial-inquiry', (req, res) => {
  try {
    const { name, email, phone, message, chatbotId } = req.body || {}
    const em = typeof email === 'string' ? email.trim() : ''
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return res.status(400).json({ ok: false, error: 'Valid email is required' })
    }
    saveTrialInquiry({
      name: typeof name === 'string' ? name.trim() : '',
      email: em,
      phone: typeof phone === 'string' ? phone.trim() : '',
      message: typeof message === 'string' ? message.trim() : '',
      chatbotId: typeof chatbotId === 'string' ? chatbotId.trim() : '',
    })
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
    if (!Number.isNaN(trialEndMs) && Date.now() >= trialEndMs) {
      return res.status(403).json({
        ok: false,
        trialExpired: true,
        error: 'Your 3-day trial has ended. Contact us to continue using your chatbot.',
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
    const systemPrompt = buildChatSystemPrompt(s.inner, companyContactMeta(), toneId)
    const history = s.history.map((m) => ({ role: m.role, content: m.content }))

    const { content: reply, model } = await runChatCompletion({
      systemPrompt,
      history,
      userMessage: userMsg,
      temperature: temperatureForChatTone(toneId),
    })

    pushExchange(s, userMsg, reply)

    res.json({ ok: true, reply, model })
  } catch (e) {
    console.error('[chatbot-test/message]', e)
    const msg = e instanceof Error ? e.message : 'Chat failed'
    res.status(500).json({ ok: false, error: msg })
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

  const ownerContact = {
    name: typeof name === 'string' ? name.trim() : '',
    email: typeof email === 'string' ? email.trim() : '',
    phone: typeof phone === 'string' ? phone.trim() : '',
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

    structuredContext = attachWebsiteOwnerContact(structuredContext, ownerContact)

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

app.listen(PORT, () => {
  console.log('[cors] open — all origins allowed (origin: true)')
  console.log('[data]', getDataRoot(), '— secured contexts & inquiries')
  console.log(`Scrape API listening on http://127.0.0.1:${PORT}`)
  console.log('POST /api/scrape with JSON { website, name, email, phone }')
  console.log('GET /api/chatbot-context/new-id — allocate 8-digit context ID')
  console.log('POST /api/chatbot-context/save — password-encrypt & store scraped bundle')
  console.log('POST /api/chatbot-test/open (password only) | /api/chatbot-test/message — personal chat (3-day trial)')
  console.log('POST /api/trial-inquiry — contact form after trial')
  console.log('POST /api/contact-demo — Request a demo (Nodemailer → owner + submitter)')
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
