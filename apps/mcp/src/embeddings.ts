import { ConfigMissingError, EmbeddingDimensionMismatchError, EmbeddingProviderError } from './errors'

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

export type Embedder = (inputs: string[], opts?: { signal?: AbortSignal }) => Promise<EmbedResult>

type DeepInfraResponse = {
  embeddings?: number[][]
  input_tokens?: number
  inference_status?: { status?: string; runtime_ms?: number; cost?: number; tokens_input?: number }
  detail?: { error?: string } | string
}

let embedderOverride: Embedder | null = null

/**
 * Test seam: replace the real embedder (DeepInfra) with a stand-in, mirroring
 * `setDbOverride`. Pass `null` to restore. Lets the suite run hermetically and
 * deterministically without the provider or an API key.
 */
export function setEmbedderOverride(embedder: Embedder | null): void {
  embedderOverride = embedder
}

/** Embed texts via the configured embedder (DeepInfra by default). */
export async function embedTexts(inputs: string[], opts: { signal?: AbortSignal } = {}): Promise<EmbedResult> {
  if (embedderOverride) return embedderOverride(inputs, opts)
  return embedViaDeepInfra(inputs, opts)
}

async function embedViaDeepInfra(inputs: string[], opts: { signal?: AbortSignal } = {}): Promise<EmbedResult> {
  const apiKey = process.env.DEEPINFRA_API_KEY
  if (!apiKey) throw new ConfigMissingError('DEEPINFRA_API_KEY')
  if (inputs.length === 0) {
    return { embeddings: [], model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input_tokens: 0 }
  }
  if (inputs.length > MAX_BATCH) {
    throw new EmbeddingProviderError('deepinfra', 400, `batch size ${inputs.length} exceeds max ${MAX_BATCH}`)
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs, normalize: true }),
    signal: opts.signal
  })

  if (!res.ok) {
    const body = await res.text()
    throw new EmbeddingProviderError('deepinfra', res.status, body)
  }

  return parseDeepInfraResponse((await res.json()) as DeepInfraResponse, inputs.length)
}

/** Pure validation of a DeepInfra payload: shape + dimension guards, derives input_tokens. */
function parseDeepInfraResponse(data: DeepInfraResponse, expectedCount: number): EmbedResult {
  if (!data.embeddings || data.embeddings.length !== expectedCount) {
    throw new EmbeddingProviderError('deepinfra', 200, `malformed response (expected ${expectedCount} embeddings)`)
  }

  const first = data.embeddings[0]
  if (!first || first.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingDimensionMismatchError(first?.length, EMBEDDING_DIMENSIONS)
  }

  return {
    embeddings: data.embeddings,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input_tokens: data.input_tokens ?? data.inference_status?.tokens_input ?? 0
  }
}
