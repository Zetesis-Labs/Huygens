import { ConfigMissingError, LlmProviderError } from './errors'

const DEFAULT_MODEL = 'gpt-4o-mini'
const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ChatResult = {
  text: string
  model: string
  tokens_used: { input: number; output: number }
}

export type ChatComplete = (messages: ChatMessage[], opts?: ChatOpts) => Promise<ChatResult>

export type ChatOpts = {
  model?: string
  signal?: AbortSignal
  temperature?: number
}

type OpenAIResponse = {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export const chatComplete: ChatComplete = async (messages, opts = {}) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new ConfigMissingError('OPENAI_API_KEY')
  const model = opts.model ?? DEFAULT_MODEL

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {})
    }),
    signal: opts.signal
  })

  if (!res.ok) {
    const body = await res.text()
    throw new LlmProviderError('openai', res.status, body)
  }

  const data = (await res.json()) as OpenAIResponse
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new LlmProviderError('openai', 200, 'no content in response')

  return {
    text,
    model,
    tokens_used: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0
    }
  }
}
