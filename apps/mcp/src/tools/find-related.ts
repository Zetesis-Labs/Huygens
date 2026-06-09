import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { embedTexts } from '../embeddings'
import { nodeLine } from '../serialize'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'
import { idStr } from './graph-records'
import { provenanceByBlock } from './trace-provenance'
import { attachProvenance } from './vector-search'

/**
 * LLM-friendly wrapper over vector_search. Returns a compact, deduped list
 * of existing notes the caller might want to reference in a proposal instead
 * of duplicating.
 *
 * The inner KNN over-fetches (K*3 blocks) so that after deduplicating by
 * parent note we still get up to K distinct notes. Each note is surfaced
 * with its best-scoring block as the snippet.
 */
export const findRelatedShape = {
  query: z.string().min(1).describe('Concept the agent is looking for. Free-form natural language.'),
  k: z.number().int().positive().max(10).default(5).describe('Max number of distinct notes to return'),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.45)
    .describe('Cosine-similarity floor. Default 0.45 filters loose matches.')
}

const findRelatedSchema = z.object(findRelatedShape)
export type FindRelatedInput = z.infer<typeof findRelatedSchema>

export type FindRelatedHit = {
  note_id: string
  block_id: string
  title: string
  type_slug: string | null
  state: string
  snippet: string
  score: number
  /** Provenance of the matched block: raw_capture count + a representative
   * transformation, so the agent can prefer backed hits over inferred ones. */
  derived_from: number
  transformation: string | null
}

type Row = {
  id: RecordId
  content: string
  distance: number
  note_id: RecordId
  note_title: string
  note_state: string
  note_type_slug: string | null
}

const SNIPPET_LEN = 180
const OVERSAMPLE = 3

/** Pure: keep only rows whose note_id resolves to a real id. idStr serializes
 * null/undefined record ids to the literal strings 'null'/'undefined', so those
 * sentinels mark rows whose parent note did not resolve and must be dropped. */
function hasValidNote(row: Pick<Row, 'note_id'>): boolean {
  const noteId = idStr(row.note_id)
  return noteId !== 'null' && noteId !== 'undefined'
}

export async function findRelatedImpl(input: FindRelatedInput): Promise<FindRelatedHit[]> {
  const db = await getDb()
  const k = input.k ?? 5
  const threshold = input.threshold ?? 0.45
  const innerK = k * OVERSAMPLE
  const ef = Math.max(40, innerK * 2)

  const { embeddings } = await embedTexts([input.query])
  const queryVec = embeddings[0]
  if (!queryVec) throw new Error('embed_text returned no vector')

  const sql = `SELECT * FROM (
    SELECT
      id,
      content,
      note.id          AS note_id,
      note.title       AS note_title,
      note.state       AS note_state,
      note.type.slug   AS note_type_slug,
      vector::distance::knn() AS distance
    FROM block
    WHERE embedding <|${innerK},${ef}|> $q
      AND note IS NOT NONE
      AND block_kind = 'descriptive'
  ) ORDER BY distance ASC`

  const [rows] = await db.query<[Row[]]>(sql, { q: queryVec })

  // A note with several matching blocks should appear once with its best
  // block as the snippet. Rows arrive in distance-ascending order, so the first
  // row seen per note is the best one.
  const bestByNote = rows
    .filter(hasValidNote)
    .reduce((acc, r) => {
      const noteId = idStr(r.note_id)
      return acc.has(noteId) ? acc : acc.set(noteId, r)
    }, new Map<string, Row>())

  const hits = Array.from(bestByNote.values())
    .map(r => ({
      note_id: idStr(r.note_id),
      block_id: idStr(r.id),
      title: r.note_title,
      type_slug: r.note_type_slug,
      state: r.note_state,
      snippet:
        r.content.length > SNIPPET_LEN
          ? `${r.content.slice(0, SNIPPET_LEN).replace(/\n/g, ' ')}…`
          : r.content.replace(/\n/g, ' '),
      score: 1 - r.distance
    }))
    .filter(h => h.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  const prov = await provenanceByBlock(hits.map(h => h.block_id))
  return attachProvenance(hits, prov)
}

function summarize(hits: FindRelatedHit[]): string {
  if (hits.length === 0) return 'No related notes above threshold.'
  return hits
    .map(
      (h, i) =>
        `${i + 1}. [${h.score.toFixed(3)}] ${nodeLine({ id: h.note_id, title: h.title, type: h.type_slug ?? undefined, state: h.state })}${h.derived_from > 0 ? `  ⟵ ${h.derived_from} raw${h.transformation ? ` (${h.transformation})` : ''}` : ''}\n   ${h.snippet}`
    )
    .join('\n')
}

export function registerFindRelated(server: McpServer): void {
  defineTool(
    server,
    'find_related',
    'Find existing notes related to a concept. Use BEFORE creating a new note about a topic — if the top hit has score >= ~0.65, reference that existing note in your proposal (link it via part_of / mentions) instead of duplicating. Returns up to K notes, deduped by parent, sorted by descending similarity.',
    findRelatedShape,
    async args => {
      const hits = await findRelatedImpl(args)
      return {
        content: [
          { type: 'text', text: summarize(hits) },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(hits, null, 2)}` }
        ]
      }
    }
  )
}
