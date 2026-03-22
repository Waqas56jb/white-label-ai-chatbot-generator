const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * @param {{ systemPrompt: string, history: { role: string, content: string }[], userMessage: string, model?: string, temperature?: number }} opts
 */
export async function runChatCompletion(opts) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !apiKey.trim()) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  const model = (opts.model || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
  const temperature =
    typeof opts.temperature === 'number' && Number.isFinite(opts.temperature)
      ? Math.min(1, Math.max(0, opts.temperature))
      : 0.4

  const messages = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.history,
    { role: 'user', content: opts.userMessage },
  ]

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 2200,
      messages,
    }),
  })

  const raw = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = raw?.error?.message || raw?.message || `OpenAI HTTP ${res.status}`
    throw new Error(msg)
  }

  const content = raw?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Empty assistant reply')
  }

  return { content: content.trim(), model }
}
