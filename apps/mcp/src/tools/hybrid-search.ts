import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { NoteStateSchema } from '../domain'
import { nodeLine } from '../serialize'
import { defineTool } from './define-tool'
import { lexicalSearchImpl } from './lexical-search'
import { type SearchHit, vectorSearchImpl } from './vector-search'

/**
 * Hybrid retrieval: fuse the semantic leg (dense HNSW over BGE-M3) with the
 * lexical leg (BM25 full-text) via Reciprocal Rank Fusion. RRF needs no score
 * calibration between the two — it ranks by position, so a 0..1 cosine and an
 * unbounded BM25 score combine cleanly. This is the single biggest retrieval
 * quality upgrade over plain `vector_search`: the dense leg generalises by
 * meaning, the lexical leg pins exact tokens (names, IDs, acronyms) the dense
 * vector blurs away.
 */
export const hybridSearchShape = {
  query: z.string().min(1).describe('Natural-language query. Runs against both the semantic and lexical legs.'),
  k: z.number().int().positive().max(50).default(10).describe('How many fused results to return'),
  state_in: z
    .array(NoteStateSchema)
    .optional()
    .describe('Filter by parent note state. Omit to search all non-archived states (ARCHIVED is hidden by default).'),
  type_slugs: z.array(z.string()).optional().describe('Filter by parent note type slug (e.g. ["task","project"])'),
  updated_since: z
    .string()
    .datetime()
    .optional()
    .describe('ISO datetime; only blocks whose parent note was updated after this point')
}

const hybridSearchSchema = z.object(hybridSearchShape)
export type HybridSearchInput = z.infer<typeof hybridSearchSchema>

export type HybridHit = SearchHit & {
  /** 1-based rank in the semantic leg, or null if the lexical leg surfaced it alone. */
  dense_rank: number | null
  /** 1-based rank in the lexical leg, or null if the semantic leg surfaced it alone. */
  lexical_rank: number | null
}

/** RRF constant: dampens the contribution of low ranks. 60 is the canonical default. */
const RRF_K = 60
/** Over-fetch from each leg so the fusion has enough overlap to work with. */
const POOL_MULTIPLIER = 4
const MIN_POOL = 20
const MAX_POOL = 100

/**
 * Reciprocal Rank Fusion. Each ranking is a list of ids in descending
 * relevance; an id's fused score is the sum over rankings of 1/(k + rank),
 * rank being 1-based. Pure and deterministic — unit-tested without a DB.
 */
export function rrfFuse(rankings: string[][], k = RRF_K): Map<string, number> {
  const scores = new Map<string, number>()
  for (const ranking of rankings) {
    ranking.forEach((id, idx) => {
      const rank = idx + 1
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank))
    })
  }
  return scores
}

export async function hybridSearchImpl(input: HybridSearchInput): Promise<HybridHit[]> {
  const k = input.k ?? 10
  const pool = Math.min(MAX_POOL, Math.max(MIN_POOL, k * POOL_MULTIPLIER))
  const filters = { state_in: input.state_in, type_slugs: input.type_slugs, updated_since: input.updated_since }

  // The legs are independent — fire them in parallel. No dense threshold: the
  // fusion decides relevance, an early floor would starve it of candidates.
  const [dense, lexical] = await Promise.all([
    vectorSearchImpl({ query: input.query, k: pool, ef: Math.max(40, pool * 2), ...filters }),
    lexicalSearchImpl({ query: input.query, k: pool, ...filters })
  ])

  const denseRank = new Map(dense.map((h, i) => [h.block_id, i + 1]))
  const lexicalRank = new Map(lexical.map((h, i) => [h.block_id, i + 1]))
  // Prefer the dense hit object when a block appears in both — content and
  // provenance are identical, and both legs already attached provenance.
  const byId = new Map<string, SearchHit>()
  for (const h of lexical) byId.set(h.block_id, h)
  for (const h of dense) byId.set(h.block_id, h)

  const fused = rrfFuse([dense.map(h => h.block_id), lexical.map(h => h.block_id)])

  return Array.from(fused.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([blockId, score]) => {
      const base = byId.get(blockId)
      if (!base) throw new Error(`fused id ${blockId} missing from both legs`)
      return {
        ...base,
        score,
        dense_rank: denseRank.get(blockId) ?? null,
        lexical_rank: lexicalRank.get(blockId) ?? null
      }
    })
}

function legTag(h: HybridHit): string {
  if (h.dense_rank != null && h.lexical_rank != null) return `d${h.dense_rank}+l${h.lexical_rank}`
  if (h.dense_rank != null) return `d${h.dense_rank}`
  return `l${h.lexical_rank}`
}

function summarize(hits: HybridHit[]): string {
  if (hits.length === 0) return 'No matches.'
  return hits
    .map(h => {
      const head = h.note_id
        ? nodeLine({ id: h.note_id, title: h.note_title ?? h.note_id, state: h.note_state ?? undefined })
        : `${h.block_kind} — ${h.block_id}`
      const snippet = `${h.content.slice(0, 100).replace(/\n/g, ' ')}${h.content.length > 100 ? '…' : ''}`
      const prov =
        h.derived_from > 0 ? `  ⟵ ${h.derived_from} raw${h.transformation ? ` (${h.transformation})` : ''}` : ''
      return `- [rrf ${h.score.toFixed(4)} ${legTag(h)}] ${head} :: ${snippet}${prov}`
    })
    .join('\n')
}

export function registerHybridSearch(server: McpServer): void {
  defineTool(
    server,
    'hybrid_search',
    'Hybrid search: fuse semantic (HNSW/BGE-M3) and lexical (BM25) retrieval via Reciprocal Rank Fusion. The default, highest-recall search — prefer it over vector_search when the query may hinge on exact terms (names, IDs, acronyms) as well as meaning. Same parent-note filters as vector_search. Score is the fused RRF value; dense_rank/lexical_rank show which leg surfaced each hit.',
    hybridSearchShape,
    async args => {
      const hits = await hybridSearchImpl(args)
      return {
        content: [
          { type: 'text', text: summarize(hits) },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(hits, null, 2)}` }
        ]
      }
    }
  )
}
