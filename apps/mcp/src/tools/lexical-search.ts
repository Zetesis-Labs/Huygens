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
    .describe('Filter by parent note state. Omit to search across all states.'),
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
  bindings.terms = input.query
  bindings.k = k

  // `@1@` matches against the FTS index; `search::score(1)` reads the BM25
  // relevance of that same predicate. The KNN ordering analogue is score DESC.
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
      search::score(1) AS score
    FROM block
    WHERE content @1@ $terms
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
