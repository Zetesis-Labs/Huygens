import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { NoteStateSchema } from '../domain'
import { embedTexts } from '../embeddings'
import { nodeLine } from '../serialize'
import { getDb } from '../surreal'
import type { BlockProvenance } from './trace-provenance'
import { defineTool } from './define-tool'
import { idStr } from './graph-records'
import { noteFilters } from './lexical-search'
import { provenanceByBlock } from './trace-provenance'

export const vectorSearchShape = {
  query: z.string().min(1).describe('Natural-language query to embed and search'),
  k: z.number().int().positive().max(50).default(10).describe('How many nearest blocks to return (HNSW K)'),
  ef: z
    .number()
    .int()
    .positive()
    .max(500)
    .default(40)
    .describe('HNSW efSearch — candidate list size during search (40 = good default for K<=20)'),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Optional cosine-similarity floor (0..1). Higher = stricter.'),
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

const vectorSearchSchema = z.object(vectorSearchShape)
export type VectorSearchInput = z.infer<typeof vectorSearchSchema>

export type SearchHit = {
  block_id: string
  block_kind: string
  note_id: string | null
  note_title: string | null
  note_state: string | null
  content: string
  score: number
  /** Provenance signal: how many raw_captures this block derives from, and a
   * representative transformation — so the agent can prefer backed over inferred. */
  derived_from: number
  transformation: string | null
}

type Row = HitRow & { distance: number }

/** A SurrealDB row carrying the columns shared by the vector and lexical legs. */
export type HitRow = {
  id: RecordId
  content: string
  block_kind: string
  note_id: RecordId | null
  note_title: string | null
  note_state: string | null
}

/** Pure: project a SurrealDB row to a SearchHit. `scoreOf` adapts the per-leg
 * score column (1 - distance for vector, raw score for lexical). Provenance
 * fields are placeholders here and get filled in by `attachProvenance`. */
export function rowToHit<R extends HitRow>(row: R, scoreOf: (row: R) => number): SearchHit {
  return {
    block_id: idStr(row.id),
    block_kind: row.block_kind,
    note_id: row.note_id ? idStr(row.note_id) : null,
    note_title: row.note_title ?? null,
    note_state: row.note_state ?? null,
    content: row.content,
    score: scoreOf(row),
    derived_from: 0,
    transformation: null
  }
}

/** Pure: take an embedTexts result and return its first vector, or throw. */
export function firstVectorOrThrow(result: { embeddings: number[][] }): number[] {
  const [queryVec] = result.embeddings
  if (!queryVec) throw new Error('embed_text returned no vector')
  return queryVec
}

/** Pure: build the HNSW KNN SQL for the vector leg. `where` is the outer
 * parent-note filter (from noteFilters); `$q` is bound separately. */
export function buildVectorSql(k: number, ef: number, where: string): string {
  return `SELECT * FROM (
    SELECT
      id,
      content,
      block_kind,
      note.id          AS note_id,
      note.title       AS note_title,
      note.state       AS note_state,
      note.type.slug   AS note_type_slug,
      note.updated_at  AS note_updated_at,
      vector::distance::knn() AS distance
    FROM block
    WHERE embedding <|${k},${ef}|> $q
  )${where} ORDER BY distance ASC`
}

/** Pure: attach per-block provenance signals onto search hits, without mutation. */
export function attachProvenance<T extends { block_id: string }>(
  hits: T[],
  prov: Map<string, BlockProvenance>
): (T & { derived_from: number; transformation: string | null })[] {
  return hits.map(h => ({
    ...h,
    derived_from: prov.get(h.block_id)?.derived_from ?? 0,
    transformation: prov.get(h.block_id)?.transformation ?? null
  }))
}

export async function vectorSearchImpl(input: VectorSearchInput): Promise<SearchHit[]> {
  const db = await getDb()
  const k = input.k ?? 10
  const ef = input.ef ?? 40
  const queryVec = firstVectorOrThrow(await embedTexts([input.query]))

  const { where, bindings: filterBindings } = noteFilters(input)
  const sql = buildVectorSql(k, ef, where)
  const [rows] = await db.query<[Row[]]>(sql, { ...filterBindings, q: queryVec })

  const hits = rows.map(r => rowToHit(r, row => 1 - row.distance))
  const filtered = input.threshold != null ? hits.filter(h => h.score >= (input.threshold ?? 0)) : hits
  const prov = await provenanceByBlock(filtered.map(h => h.block_id))
  return attachProvenance(filtered, prov)
}

/** Pure: the head of a hit line — the note line if backed by a note, else the
 * bare block kind/id. */
export function hitHead(hit: SearchHit): string {
  return hit.note_id
    ? nodeLine({ id: hit.note_id, title: hit.note_title ?? hit.note_id, state: hit.note_state ?? undefined })
    : `${hit.block_kind} — ${hit.block_id}`
}

/** Pure: the content snippet, truncated to 100 chars with newlines flattened. */
export function hitSnippet(hit: SearchHit): string {
  return `${hit.content.slice(0, 100).replace(/\n/g, ' ')}${hit.content.length > 100 ? '…' : ''}`
}

/** Pure: the provenance suffix (⟵ N raw …) when the hit derives from captures. */
export function hitProv(hit: SearchHit): string {
  return hit.derived_from > 0
    ? `  ⟵ ${hit.derived_from} raw${hit.transformation ? ` (${hit.transformation})` : ''}`
    : ''
}

/** Pure: one summary line for a hit, prefixed by a leg-specific score tag. */
export function formatHitLine(hit: SearchHit, scoreTag: string): string {
  return `- ${scoreTag} ${hitHead(hit)} :: ${hitSnippet(hit)}${hitProv(hit)}`
}

function summarize(hits: SearchHit[]): string {
  if (hits.length === 0) return 'No matches.'
  return hits.map(h => formatHitLine(h, `[${h.score.toFixed(3)}]`)).join('\n')
}

export function registerVectorSearch(server: McpServer): void {
  defineTool(
    server,
    'vector_search',
    'Embed the query with BGE-M3 and find the K nearest blocks via HNSW (cosine). Optional filters by note state, type slug, and updated-since.',
    vectorSearchShape,
    async args => {
      const hits = await vectorSearchImpl(args)
      return {
        content: [
          { type: 'text', text: summarize(hits) },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(hits, null, 2)}` }
        ]
      }
    }
  )
}
