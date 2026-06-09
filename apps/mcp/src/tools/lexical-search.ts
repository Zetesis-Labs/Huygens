import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { NoteStateSchema } from '../domain'
import { nodeLine } from '../serialize'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'
import { provenanceByBlock } from './trace-provenance'
import { attachProvenance, type HitRow, rowToHit, type SearchHit } from './vector-search'

/**
 * Lexical (BM25) search over `block.content` via the `block_content_fts`
 * full-text index. The dense vector (BGE-M3) generalises by meaning but loses
 * the literal token — proper names, identifiers, acronyms, exact quotes. This
 * leg recovers exactly those. The returned `score` is BM25 relevance
 * (unbounded, higher = better), NOT a 0..1 cosine like `vector_search`.
 */
export const lexicalSearchShape = {
  query: z.string().min(1).describe('Terms to match literally (BM25). Good for names, IDs, acronyms, exact quotes.'),
  k: z.number().int().positive().max(50).default(10).describe('How many matching blocks to return'),
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

const lexicalSearchSchema = z.object(lexicalSearchShape)
export type LexicalSearchInput = z.infer<typeof lexicalSearchSchema>

type Row = HitRow & { score: number }

/**
 * Build the outer WHERE that filters by parent-note attributes. Mirrors the
 * filter contract of `vectorSearchImpl` so both legs of `hybrid_search` accept
 * the same arguments and behave identically.
 */
export function noteFilters(input: { state_in?: string[]; type_slugs?: string[]; updated_since?: string }): {
  where: string
  bindings: Record<string, unknown>
} {
  // Default: hide tombstones. ARCHIVED notes are dead weight that contaminate
  // retrieval (84 blocks at last count). A caller who truly wants them must
  // ask via explicit `state_in`. DONE stays searchable — it's legitimate history.
  const stateFilter = input.state_in?.length
    ? { clause: 'note_state IN $states', binding: { states: input.state_in } }
    : { clause: "note_state != 'ARCHIVED'", binding: {} }

  const candidates = [
    stateFilter,
    input.type_slugs?.length
      ? { clause: 'note_type_slug IN $type_slugs', binding: { type_slugs: input.type_slugs } }
      : null,
    input.updated_since
      ? { clause: 'note_updated_at > $since', binding: { since: new Date(input.updated_since) } }
      : null
  ].filter((c): c is { clause: string; binding: Record<string, unknown> } => c !== null)

  const clauses = candidates.map(c => c.clause)
  const bindings = Object.assign({}, ...candidates.map(c => c.binding)) as Record<string, unknown>
  return { where: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '', bindings }
}

export async function lexicalSearchImpl(input: LexicalSearchInput): Promise<SearchHit[]> {
  const db = await getDb()
  const k = input.k ?? 10
  const { where, bindings: filterBindings } = noteFilters(input)

  // OR-tokenise the query. The `@N@` FTS operator is AND over the whole string,
  // so a multi-word natural-language query (the norm coming from hybrid_search)
  // requires EVERY token in one block and matches almost nothing — the BM25 leg
  // dies and hybrid degenerates to vector-only. Instead, give each token its own
  // predicate `content @N@ $tN`, OR them (any token qualifies a block), and sum
  // their per-token `search::score(N)` (a non-matching predicate scores 0, so the
  // sum naturally rewards blocks hitting more terms — verified on live data).
  const rawTerms = input.query.split(/\s+/).filter(Boolean).slice(0, 16)
  const terms = rawTerms.length > 0 ? rawTerms : [input.query]
  const tokenBindings = Object.fromEntries(terms.map((t, i) => [`t${i}`, t]))
  const bindings = { ...filterBindings, k, ...tokenBindings }
  const predicates = terms.map((_, i) => `content @${i + 1}@ $t${i}`).join(' OR ')
  const scoreExpr = terms.map((_, i) => `search::score(${i + 1})`).join(' + ')

  // The KNN ordering analogue is score DESC.
  const sql = `SELECT * FROM (
    SELECT
      id,
      content,
      block_kind,
      note.id          AS note_id,
      note.title       AS note_title,
      note.state       AS note_state,
      note.type.slug   AS note_type_slug,
      note.updated_at  AS note_updated_at,
      ${scoreExpr} AS score
    FROM block
    WHERE ${predicates}
  )${where} ORDER BY score DESC LIMIT $k`

  const [rows] = await db.query<[Row[]]>(sql, bindings)

  const hits = rows.map(r => rowToHit(r, row => row.score))

  return attachProvenance(hits, await provenanceByBlock(hits.map(h => h.block_id)))
}

function summarize(hits: SearchHit[]): string {
  if (hits.length === 0) return 'No lexical matches.'
  return hits
    .map(h => {
      const head = h.note_id
        ? nodeLine({ id: h.note_id, title: h.note_title ?? h.note_id, state: h.note_state ?? undefined })
        : `${h.block_kind} — ${h.block_id}`
      const snippet = `${h.content.slice(0, 100).replace(/\n/g, ' ')}${h.content.length > 100 ? '…' : ''}`
      const prov =
        h.derived_from > 0 ? `  ⟵ ${h.derived_from} raw${h.transformation ? ` (${h.transformation})` : ''}` : ''
      return `- [bm25 ${h.score.toFixed(2)}] ${head} :: ${snippet}${prov}`
    })
    .join('\n')
}

export function registerLexicalSearch(server: McpServer): void {
  defineTool(
    server,
    'lexical_search',
    'Full-text (BM25) search over block content. Use when the literal term matters — names, identifiers, acronyms, exact quotes — that semantic search may miss. Score is BM25 relevance, not cosine. For best recall combine with vector_search via hybrid_search.',
    lexicalSearchShape,
    async args => {
      const hits = await lexicalSearchImpl(args)
      return {
        content: [
          { type: 'text', text: summarize(hits) },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(hits, null, 2)}` }
        ]
      }
    }
  )
}
