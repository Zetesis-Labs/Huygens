import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { embedTexts } from '../embeddings'
import { getDb } from '../surreal'

const NoteState = z.enum(['CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'])

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
  state_in: z.array(NoteState).optional().describe('Filter by parent note state. Omit to search across all states.'),
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
  note_id: string
  note_title: string
  note_state: string
  content: string
  score: number
}

type Row = {
  id: RecordId
  content: string
  distance: number
  note_id: RecordId
  note_title: string
  note_state: string
}

export async function vectorSearchImpl(input: VectorSearchInput): Promise<SearchHit[]> {
  const db = await getDb()
  const k = input.k ?? 10
  const ef = input.ef ?? 40
  const { embeddings } = await embedTexts([input.query])
  const queryVec = embeddings[0]
  if (!queryVec) throw new Error('embed_text returned no vector')

  const filters: string[] = []
  const bindings: Record<string, unknown> = { q: queryVec }
  if (input.state_in?.length) {
    filters.push('note_state IN $states')
    bindings.states = input.state_in
  }
  if (input.type_slugs?.length) {
    filters.push('note_type_slug IN $type_slugs')
    bindings.type_slugs = input.type_slugs
  }
  if (input.updated_since) {
    filters.push('note_updated_at > $since')
    bindings.since = new Date(input.updated_since)
  }
  const outerWhere = filters.length > 0 ? ` WHERE ${filters.join(' AND ')}` : ''

  const sql = `SELECT * FROM (
    SELECT
      id,
      content,
      note.id          AS note_id,
      note.title       AS note_title,
      note.state       AS note_state,
      note.type.slug   AS note_type_slug,
      note.updated_at  AS note_updated_at,
      vector::distance::knn() AS distance
    FROM block
    WHERE embedding <|${k},${ef}|> $q
  )${outerWhere} ORDER BY distance ASC`

  const [rows] = await db.query<[Row[]]>(sql, bindings)

  const hits: SearchHit[] = rows.map(r => ({
    block_id: String(r.id),
    note_id: String(r.note_id),
    note_title: r.note_title,
    note_state: r.note_state,
    content: r.content,
    score: 1 - r.distance
  }))

  return input.threshold != null ? hits.filter(h => h.score >= (input.threshold ?? 0)) : hits
}

export function registerVectorSearch(server: McpServer): void {
  server.tool(
    'vector_search',
    'Embed the query with BGE-M3 and find the K nearest blocks via HNSW (cosine). Optional filters by note state, type slug, and updated-since.',
    vectorSearchShape,
    async args => {
      const hits = await vectorSearchImpl(args)
      const summary =
        hits.length === 0
          ? 'No matches.'
          : hits
              .map(
                h =>
                  `- [${h.score.toFixed(3)}] ${h.note_title} (${h.note_state}) :: ${h.content.slice(0, 100).replace(/\n/g, ' ')}${h.content.length > 100 ? '…' : ''}`
              )
              .join('\n')
      return {
        content: [
          { type: 'text', text: summary },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(hits, null, 2)}` }
        ]
      }
    }
  )
}
