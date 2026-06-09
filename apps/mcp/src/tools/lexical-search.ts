import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { NoteStateSchema } from '../domain'
import { nodeLine } from '../serialize'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'
import { idStr } from './graph-records'
import { provenanceByBlock } from './trace-provenance'
import type { SearchHit } from './vector-search'

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

type Row = {
  id: RecordId
  content: string
  block_kind: string
  score: number
  note_id: RecordId | null
  note_title: string | null
  note_state: string | null
}

/**
 * Build the outer WHERE that filters by parent-note attributes. Mirrors the
 * filter contract of `vectorSearchImpl` so both legs of `hybrid_search` accept
 * the same arguments and behave identically.
 */
export function noteFilters(input: { state_in?: string[]; type_slugs?: string[]; updated_since?: string }): {
  where: string
  bindings: Record<string, unknown>
} {
  const clauses: string[] = []
  const bindings: Record<string, unknown> = {}
  if (input.state_in?.length) {
    clauses.push('note_state IN $states')
    bindings.states = input.state_in
  } else {
    // Default: hide tombstones. ARCHIVED notes are dead weight that contaminate
    // retrieval (84 blocks at last count). A caller who truly wants them must
    // ask via explicit `state_in`. DONE stays searchable — it's legitimate history.
    clauses.push("note_state != 'ARCHIVED'")
  }
  if (input.type_slugs?.length) {
    clauses.push('note_type_slug IN $type_slugs')
    bindings.type_slugs = input.type_slugs
  }
  if (input.updated_since) {
    clauses.push('note_updated_at > $since')
    bindings.since = new Date(input.updated_since)
  }
  return { where: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '', bindings }
}

export async function lexicalSearchImpl(input: LexicalSearchInput): Promise<SearchHit[]> {
  const db = await getDb()
  const k = input.k ?? 10
  const { where, bindings } = noteFilters(input)
  bindings.k = k

  // OR-tokenise the query. The `@N@` FTS operator is AND over the whole string,
  // so a multi-word natural-language query (the norm coming from hybrid_search)
  // requires EVERY token in one block and matches almost nothing — the BM25 leg
  // dies and hybrid degenerates to vector-only. Instead, give each token its own
  // predicate `content @N@ $tN`, OR them (any token qualifies a block), and sum
  // their per-token `search::score(N)` (a non-matching predicate scores 0, so the
  // sum naturally rewards blocks hitting more terms — verified on live data).
  const terms = input.query.split(/\s+/).filter(Boolean).slice(0, 16)
  if (terms.length === 0) terms.push(input.query)
  terms.forEach((t, i) => {
    bindings[`t${i}`] = t
  })
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

  const hits: SearchHit[] = rows.map(r => ({
    block_id: idStr(r.id),
    block_kind: r.block_kind,
    note_id: r.note_id ? idStr(r.note_id) : null,
    note_title: r.note_title ?? null,
    note_state: r.note_state ?? null,
    content: r.content,
    score: r.score,
    derived_from: 0,
    transformation: null
  }))

  const prov = await provenanceByBlock(hits.map(h => h.block_id))
  for (const h of hits) {
    const p = prov.get(h.block_id)
    h.derived_from = p?.derived_from ?? 0
    h.transformation = p?.transformation ?? null
  }
  return hits
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
