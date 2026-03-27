import crypto from 'crypto'

const SESSION_TTL_MS = 3* 60 * 60 * 1000
const MAX_HISTORY_MESSAGES = 24

/** @type {Map<string, { inner: object, history: { role: string, content: string }[], expiresAt: number, trialEndsAt: string, chatbotId: string, threadId: string, trialBypass: boolean, noSessionExpiry: boolean, source: string, toneId: string }>} */
const sessions = new Map()

function cleanup() {
  const now = Date.now()
  for (const [id, s] of sessions) {
    if (s.noSessionExpiry) continue
    if (s.expiresAt < now) sessions.delete(id)
  }
}

/**
 * @param {object} inner Decrypted payload from stored bundle
 * @param {string} trialEndsAt ISO timestamp — chat blocked after this instant
 * @param {string} chatbotId 8-digit id
 * @param {{ trialBypass?: boolean, noSessionExpiry?: boolean, source?: string, toneId?: string }} [options]
 * @returns {{ sessionId: string, threadId: string }}
 */
export function createTestSession(inner, trialEndsAt, chatbotId, options = {}) {
  cleanup()
  const sessionId = crypto.randomBytes(32).toString('base64url')
  const threadId = crypto.randomUUID()
  const trialBypass = !!options?.trialBypass
  const noSessionExpiry = !!options?.noSessionExpiry
  const source = String(options?.source || '')
  const toneId = String(options?.toneId || '')
  sessions.set(sessionId, {
    inner,
    history: [],
    expiresAt: noSessionExpiry ? Number.MAX_SAFE_INTEGER : Date.now() + SESSION_TTL_MS,
    trialEndsAt: typeof trialEndsAt === 'string' ? trialEndsAt : new Date(trialEndsAt).toISOString(),
    chatbotId: String(chatbotId || ''),
    threadId,
    trialBypass,
    noSessionExpiry,
    source,
    toneId,
  })
  return { sessionId, threadId }
}

export function getTestSession(sessionId) {
  cleanup()
  const s = sessions.get(sessionId)
  if (!s || (!s.noSessionExpiry && s.expiresAt < Date.now())) {
    sessions.delete(sessionId)
    return null
  }
  if (!s.threadId) s.threadId = crypto.randomUUID()
  if (!s.noSessionExpiry) s.expiresAt = Date.now() + SESSION_TTL_MS
  return s
}

/**
 * @param {{ history: { role: string, content: string }[] }} s
 * @param {string} userContent
 * @param {string} assistantContent
 */
export function pushExchange(s, userContent, assistantContent) {
  s.history.push({ role: 'user', content: userContent })
  s.history.push({ role: 'assistant', content: assistantContent })
  while (s.history.length > MAX_HISTORY_MESSAGES) {
    s.history.shift()
  }
}

/**
 * New conversation thread: empty LLM history, new threadId for persisted messages.
 * @returns {string | null} new thread UUID
 */
export function startNewChatThread(sessionId) {
  cleanup()
  const s = sessions.get(sessionId)
  if (!s || (!s.noSessionExpiry && s.expiresAt < Date.now())) {
    sessions.delete(sessionId)
    return null
  }
  s.history = []
  s.threadId = crypto.randomUUID()
  if (!s.noSessionExpiry) s.expiresAt = Date.now() + SESSION_TTL_MS
  return s.threadId
}
