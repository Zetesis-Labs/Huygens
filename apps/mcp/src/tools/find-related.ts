import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { embedTexts } from '../embeddings'
import { HuygensError, huygensErrorToToolResult, toMcpError } from '../errors'
import { getDb } from '../surreal'

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
  title: string
  type_slug: string | null
  state: string
  snippet: string
  score: number
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
  // block as the snippet. Iterate in distance-ascending order so the first
  // hit per note is the best one.
  const bestByNote = new Map<string, Row>()
  for (const r of rows) {
    const noteId = String(r.note_id)
    if (noteId === 'null' || noteId === 'undefined') continue
    if (!bestByNote.has(noteId)) bestByNote.set(noteId, r)
  }

  return Array.from(bestByNote.values())
    .map(r => ({
      note_id: String(r.note_id),
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
}

export function registerFindRelated(server: McpServer): void {
  server.tool(
    'find_related',
    'Find existing notes related to a concept. Use BEFORE creating a new note about a topic — if the top hit has score >= ~0.65, link to it via external_refs instead of duplicating. Returns up to K notes, deduped by parent, sorted by descending similarity.',
    findRelatedShape,
    async args => {
      try {
        const hits = await findRelatedImpl(args)
        const summary =
          hits.length === 0
            ? 'No related notes above threshold.'
            : hits
                .map(
                  (h, i) =>
                    `${i + 1}. [${h.score.toFixed(3)}] ${h.note_id} — ${h.title} (${h.type_slug ?? 'untyped'}, ${h.state})\n   ${h.snippet}`
                )
                .join('\n')
        return {
          content: [
            { type: 'text', text: summary },
            { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(hits, null, 2)}` }
          ]
        }
      } catch (err) {
        if (err instanceof HuygensError) return huygensErrorToToolResult(err)
        throw toMcpError(err)
      }
    }
  )
}
