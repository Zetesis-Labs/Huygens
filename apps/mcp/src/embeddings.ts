const ENDPOINT = 'https://api.deepinfra.com/v1/inference/BAAI/bge-m3'
export const EMBEDDING_MODEL = 'BAAI/bge-m3'
export const EMBEDDING_DIMENSIONS = 1024
const MAX_BATCH = 64

export type EmbedResult = {
  embeddings: number[][]
  model: string
  dimensions: number
  input_tokens: number
}

type DeepInfraResponse = {
  embeddings?: number[][]
  input_tokens?: number
  inference_status?: { status?: string; runtime_ms?: number; cost?: number; tokens_input?: number }
  detail?: { error?: string } | string
}

export async function embedTexts(inputs: string[], opts: { signal?: AbortSignal } = {}): Promise<EmbedResult> {
  const apiKey = process.env.DEEPINFRA_API_KEY
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY env var not set')
  if (inputs.length === 0) {
    return { embeddings: [], model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input_tokens: 0 }
  }
  if (inputs.length > MAX_BATCH) {
    throw new Error(`embedTexts: batch size ${inputs.length} exceeds max ${MAX_BATCH}`)
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs, normalize: true }),
    signal: opts.signal
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DeepInfra ${res.status}: ${body.slice(0, 500)}`)
  }

  const data = (await res.json()) as DeepInfraResponse
  if (!data.embeddings || data.embeddings.length !== inputs.length) {
    throw new Error(`DeepInfra: malformed response (expected ${inputs.length} embeddings)`)
  }

  const first = data.embeddings[0]
  if (!first || first.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`DeepInfra: unexpected dimensions (got ${first?.length}, want ${EMBEDDING_DIMENSIONS})`)
  }

  return {
    embeddings: data.embeddings,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input_tokens: data.input_tokens ?? data.inference_status?.tokens_input ?? 0
  }
}
