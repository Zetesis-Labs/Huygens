import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { SourceKindSchema } from '../domain'
import { getDb } from '../surreal'

export const listInboxShape = {
  limit: z.number().int().positive().max(100).default(20).describe('Maximum raws to return'),
  source_kind: SourceKindSchema.optional().describe('Optional filter by source kind')
}

const listInboxSchema = z.object(listInboxShape)
export type ListInboxInput = z.infer<typeof listInboxSchema>

export type InboxRow = {
  id: string
  content: string
  source_kind: string
  source_ref: string | null
  created_at: string
}

export async function listInboxImpl(input: ListInboxInput): Promise<InboxRow[]> {
  const db = await getDb()
  const filter = input.source_kind ? 'AND source_kind = $source_kind' : ''
  const [rows] = await db.query<
    [
      {
        id: RecordId
        content: string
        source_kind: string
        source_ref: string | null
        created_at: Date
      }[]
    ]
  >(
    `SELECT id, content, source_kind, source_ref, created_at
     FROM raw_capture
     WHERE processed_at IS NONE ${filter}
     ORDER BY created_at ASC
     LIMIT $limit`,
    { limit: input.limit, source_kind: input.source_kind }
  )

  return rows.map(r => ({
    id: String(r.id),
    content: r.content,
    source_kind: r.source_kind,
    source_ref: r.source_ref,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
  }))
}

export function registerListInbox(server: McpServer): void {
  server.tool(
    'list_inbox',
    'List raw_captures pending to be processed (processed_at IS NONE). The real GTD/ZTD inbox.',
    listInboxShape,
    async args => {
      const rows = await listInboxImpl(args)
      const summary =
        rows.length === 0
          ? 'Inbox empty.'
          : rows
              .map(
                r =>
                  `- ${r.id} (${r.source_kind}, ${r.created_at}): ${r.content.slice(0, 80)}${r.content.length > 80 ? '...' : ''}`
              )
              .join('\n')
      return {
        content: [
          { type: 'text', text: summary },
          { type: 'text', text: `\n[raw JSON for programmatic use]\n${JSON.stringify(rows, null, 2)}` }
        ]
      }
    }
  )
}
