import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, type EmbedResult } from '../src/embeddings'

/** Lowercase, split on letters, drop a trailing plural "s" so functor/functors
 * and pattern/patterns collide. Crude on purpose — it only needs to be stable. */
function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-záéíóúñ]+/g) ?? []).map(w => w.replace(/s$/, ''))
}

/** FNV-1a → a dimension index. */
function dimOf(token: string): number {
  let h = 2166136261
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % EMBEDDING_DIMENSIONS
}

/**
 * Deterministic, hermetic stand-in for BGE-M3: a unit-normalised binary
 * bag-of-words vector. Cosine similarity between two texts then equals their
 * shared distinct stems / sqrt(|A|·|B|) — enough to exercise the retrieval
 * pipeline (KNN, threshold, dedup, k-cap) without hitting DeepInfra. It does
 * NOT model semantics: tests must share words to be "related".
 */
export function fakeEmbedder(inputs: string[]): Promise<EmbedResult> {
  const embeddings = inputs.map(text => {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
    const distinct = new Set(tokens(text))
    for (const token of distinct) vector[dimOf(token)] = 1
    const norm = Math.sqrt(distinct.size) || 1
    return vector.map(x => x / norm)
  })
  return Promise.resolve({
    embeddings,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input_tokens: 0
  })
}
