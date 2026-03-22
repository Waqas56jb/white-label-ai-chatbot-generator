const MAX_SCRAPE_IN_PROMPT = 72_000

/** Visitor-selectable reply styles (test chat). Invalid IDs fall back to `professional`. */
export const CHAT_TONE_IDS = Object.freeze([
  'friendly',
  'witty',
  'concise',
  'professional',
  'casual',
  'expert',
  'empathetic',
])

const TONE_INSTRUCTIONS = {
  friendly:
    'Write like a warm, approachable human who is glad they stopped by. Use welcoming phrasing (“happy to help”, “great question”), mild enthusiasm where natural, and short friendly openers. Stay factual—never cheesy or fake.',
  witty:
    'Sprinkle in light, good-natured humor or a clever turn of phrase when it fits—never mean, never at the visitor’s expense. The joke should feel incidental; the help is the point.',
  concise:
    'Be ruthlessly brief: answer first in one or two sentences, then at most a tiny bullet list if needed. No throat-clearing (“Sure!”, “I’d be happy to…”), no recap of their question unless necessary.',
  professional:
    'Sound like a capable front-desk or office manager: clear, respectful, efficient. Confident but not stiff; no slang.',
  casual:
    'Sound like a relaxed teammate at the business: contractions OK, plain words, short paragraphs. Still accurate—no lazy guessing.',
  expert:
    'Sound like a senior pro: precise terms, crisp structure, calm confidence. Define jargon only when the visitor seems non-technical.',
  empathetic:
    'Lead with acknowledgment if they sound stressed or confused (“Totally get that…”, “That makes sense.”). Then give clear, grounded facts from the knowledge base—warm, not vague.',
}

/** Slightly higher temperature helps expressive tones; concise/expert stay lower. */
export function temperatureForChatTone(toneId) {
  const t = normalizeChatToneId(toneId)
  const map = {
    concise: 0.32,
    professional: 0.42,
    expert: 0.38,
    friendly: 0.58,
    casual: 0.62,
    witty: 0.68,
    empathetic: 0.55,
  }
  return map[t] ?? 0.42
}

export function normalizeChatToneId(raw) {
  const id = typeof raw === 'string' ? raw.trim() : ''
  return CHAT_TONE_IDS.includes(id) ? id : 'professional'
}

function hashString(s) {
  let h = 2166136261
  const str = String(s || '')
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Deterministic “brand” colors from site URL + name so each client’s widget feels unique.
 * @param {object} inner
 */
export function deriveChatTheme(inner) {
  const structured = inner.structuredContext && typeof inner.structuredContext === 'object' ? inner.structuredContext : null
  const nameRaw =
    (structured && structured.inferredBusinessName) ||
    inner.pageTitle ||
    (() => {
      try {
        return new URL(inner.websiteUrl || 'https://example.com').hostname.replace(/^www\./, '')
      } catch {
        return 'Assistant'
      }
    })()
  const chatbotName = String(nameRaw || 'Assistant').trim().slice(0, 72) || 'Assistant'

  const logoRaw = inner.crawl && typeof inner.crawl.logoUrl === 'string' ? inner.crawl.logoUrl.trim() : ''
  const logoUrl = logoRaw && /^https?:\/\//i.test(logoRaw) ? logoRaw : null

  const displayHost = inner.websiteUrl
    ? String(inner.websiteUrl).replace(/^https?:\/\//, '').split('/')[0].slice(0, 64)
    : ''

  const seed = hashString(`${inner.websiteUrl || ''}|${chatbotName}`)
  const h1 = seed % 360
  const h2 = (seed * 31 + 107) % 360

  return {
    chatbotName,
    logoUrl,
    displayHost: displayHost || null,
    colors: {
      headerBg: `hsl(${h1} 58% 38%)`,
      headerText: '#ffffff',
      accent: `hsl(${h2} 65% 48%)`,
      accentSoft: `hsl(${h2} 45% 94%)`,
      surface: `hsl(${h1} 28% 97%)`,
      surfaceBorder: `hsl(${h1} 18% 88%)`,
      userBubble: `hsl(${h2} 42% 92%)`,
      botBubble: '#ffffff',
      text: `hsl(${h1} 28% 16%)`,
      textMuted: `hsl(${h1} 14% 42%)`,
      inputBorder: `hsl(${h1} 20% 82%)`,
      sendBg: `hsl(${h2} 58% 44%)`,
      sendText: '#ffffff',
    },
  }
}

/**
 * @param {object} inner
 * @param {object | null} platformContact — support / provider contact when users ask about the chat platform
 */
const TONE_LABEL = {
  friendly: 'Friendly',
  witty: 'Witty',
  concise: 'Concise',
  professional: 'Professional',
  casual: 'Casual',
  expert: 'Expert',
  empathetic: 'Empathetic',
}

export function buildChatSystemPrompt(inner, platformContact = null, toneId = 'professional') {
  const tone = normalizeChatToneId(toneId)
  const parts = []
  parts.push(
    `You are the customer-facing chat assistant for this business. Answer clearly and helpfully using ONLY the knowledge below (structured summary, private operator notes if any, and website text).`,
  )
  parts.push(
    `**CRITICAL — selected reply tone: "${TONE_LABEL[tone]}"** The visitor chose this tone in the chat UI. Every assistant message you write MUST clearly sound like this tone (word choice, rhythm, warmth, humor, or brevity as specified). Do not sound generic or neutral.`,
  )
  parts.push(`**How to apply "${TONE_LABEL[tone]}":** ${TONE_INSTRUCTIONS[tone]}`)
  parts.push(
    `If something is not covered, say you are not sure and suggest how the customer can reach the business (use contact details from the knowledge when present). Do not invent prices, guarantees, or service areas.`,
  )
  parts.push(
    `When visitors ask who owns the business, how to contact the owner, or for the proprietor’s details, use the **Website owner / registered business contact** section below (if present). Share name, email, and/or phone as listed—still in the **"${TONE_LABEL[tone]}"** voice, not a different persona.`,
  )

  if (tone === 'concise') {
    parts.push(
      `**Length & format (Concise mode):** Default to 1–3 short sentences. Use bullets only when listing 3+ items. Skip intros and outros. Markdown **bold** is OK for labels; avoid long sections or ### headings unless the user asks for detail.`,
    )
  } else {
    parts.push(
      `**Length & format:** Give enough detail that a first-time visitor understands: a short opener in the selected tone, then **bold** labels and bullet or numbered lists when listing multiple services or facts. Use ### only when the answer is long. Separate ideas with blank lines. For simple yes/no, one sentence is fine. Normal Markdown only—no code fences around the whole reply.`,
    )
  }

  if (platformContact && typeof platformContact === 'object') {
    const pc = platformContact
    const bits = []
    if (pc.name) bits.push(`**Company:** ${pc.name}`)
    if (pc.phone) bits.push(`**Phone:** ${pc.phone}`)
    if (pc.email) bits.push(`**Email:** ${pc.email}`)
    if (pc.address) bits.push(`**Address:** ${pc.address}`)
    if (pc.hours) bits.push(`**Hours:** ${pc.hours}`)
    if (bits.length) {
      parts.push(
        `\n--- Platform / provider contact (when users ask who provides this chat, support, trials, or billing — answer with a tidy Markdown bullet list) ---\n${bits.join('\n')}`,
      )
    }
  }

  parts.push(`\n--- Website URL ---\n${inner.websiteUrl || '(unknown)'}`)
  parts.push(`\n--- Page title ---\n${inner.pageTitle || '(none)'}`)

  if (inner.confidentialPrompts && String(inner.confidentialPrompts).trim()) {
    parts.push(`\n--- Private operator instructions (follow these carefully) ---\n${String(inner.confidentialPrompts).trim()}`)
  }

  const ow = inner.owner && typeof inner.owner === 'object' ? inner.owner : {}
  const ownerName = String(ow.name || '').trim()
  const ownerEmail = String(ow.email || '').trim()
  const ownerPhone = String(ow.phone || '').trim()
  if (ownerName || ownerEmail || ownerPhone) {
    parts.push(
      `\n--- Website owner / registered business contact (verified at chatbot setup — not taken from the public website text) ---`,
    )
    parts.push(
      `The business owner provided these details when creating this chatbot. If a visitor asks who runs the business, how to reach the owner, or for direct contact, share the information below politely (e.g. “Here is the contact we have on file for the owner…”). Use only what is listed; do not invent extra channels.`,
    )
    if (ownerName) parts.push(`**Owner name:** ${ownerName}`)
    if (ownerEmail) parts.push(`**Owner email:** ${ownerEmail}`)
    if (ownerPhone) parts.push(`**Owner phone:** ${ownerPhone}`)
  }

  if (inner.structuredContext && typeof inner.structuredContext === 'object') {
    parts.push(
      `\n--- Structured business knowledge (JSON) ---\n${JSON.stringify(inner.structuredContext, null, 2)}`,
    )
  }

  const raw = String(inner.scrapedText || '')
  const clipped = raw.length > MAX_SCRAPE_IN_PROMPT ? raw.slice(0, MAX_SCRAPE_IN_PROMPT) + '\n\n[…website text truncated for model context…]' : raw
  parts.push(`\n--- Website visible text (reference) ---\n${clipped}`)

  parts.push(
    `\n--- Final check before you answer ---\nThe visitor’s chosen tone is **"${TONE_LABEL[tone]}"**. Your next reply must read unmistakably in that style. If your draft sounds flat or like a default chatbot, rewrite it until the tone is obvious.`,
  )

  return parts.join('\n')
}
