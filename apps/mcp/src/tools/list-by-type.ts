import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { NoteStateSchema, NoteTypeSlugSchema } from '../domain'
import { HuygensError, huygensErrorToToolResult, toMcpError } from '../errors'
import { getDb } from '../surreal'
import { idStr, isoString, isoStringOrNull } from './graph-records'

export const listByTypeShape = {
  type_slug: NoteTypeSlugSchema.describe('Note type to filter by (task / project / objetivo / …)'),
  state_in: z
    .array(NoteStateSchema)
    .default(['CLARIFIED', 'ACTIVE'])
    .describe('States to include. Default = currently-actionable.'),
  limit: z.number().int().positive().max(200).default(50).describe('Max results')
}

const listByTypeSchema = z.object(listByTypeShape)
export type ListByTypeInput = z.infer<typeof listByTypeSchema>

export type NoteRow = {
  id: string
  title: string
  state: string
  mit_for: string | null
  updated_at: string
}

export async function listByTypeImpl(input: ListByTypeInput): Promise<NoteRow[]> {
  const db = await getDb()
  const limit = input.limit ?? 50
  const states = input.state_in ?? ['CLARIFIED', 'ACTIVE']

  type Row = {
    id: RecordId
    title: string
    state: string
    mit_for: Date | string | null
    updated_at: Date | string
  }
  const [rows] = await db.query<[Row[]]>(
    `SELECT id, title, state, mit_for, updated_at
     FROM note
     WHERE type.slug = $type_slug AND state IN $states
     ORDER BY updated_at DESC
     LIMIT $limit`,
    { type_slug: input.type_slug, states, limit }
  )

  return rows.map(r => ({
    id: idStr(r.id),
    title: r.title,
    state: r.state,
    mit_for: isoStringOrNull(r.mit_for),
    updated_at: isoString(r.updated_at)
  }))
}

function summarize(notes: NoteRow[], typeSlug: string): string {
  if (notes.length === 0) return `No ${typeSlug} notes match.`
  return notes
    .map(n => `- [${n.state}] ${n.id} — ${n.title}${n.mit_for ? ` (MIT ${n.mit_for.slice(0, 10)})` : ''}`)
    .join('\n')
}

export function registerListByType(server: McpServer): void {
  server.tool(
    'list_notes_by_type',
    'List notes filtered by type (task / project / objetivo / idea / …) and state. Defaults to currently-actionable. Ordered by most recently updated.',
    listByTypeShape,
    async args => {
      try {
        const notes = await listByTypeImpl(args)
        return {
          content: [
            { type: 'text', text: summarize(notes, args.type_slug) },
            { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(notes, null, 2)}` }
          ]
        }
      } catch (err) {
        if (err instanceof HuygensError) return huygensErrorToToolResult(err)
        throw toMcpError(err)
      }
    }
  )
}
