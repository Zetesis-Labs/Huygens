import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { RawStatusSchema, SourceKindSchema } from '../domain'
import { getDb } from '../surreal'

export const listInboxShape = {
  limit: z.number().int().positive().max(100).default(20).describe('Maximum raws to return'),
  source_kind: SourceKindSchema.optional().describe('Optional filter by source kind'),
  status: RawStatusSchema.default('pending').describe('Inbox status to list. Defaults to pending.')
}

const listInboxSchema = z.object(listInboxShape)
export type ListInboxInput = z.infer<typeof listInboxSchema>

export type InboxRow = {
  id: string
  content: string
  source_kind: string
  source_ref: string | null
  status: string
  created_at: string
  processed_at: string | null
}

export async function listInboxImpl(input: ListInboxInput): Promise<InboxRow[]> {
  const db = await getDb()
  const filter = input.source_kind ? 'AND source_kind = $source_kind' : ''
  const status = input.status ?? 'pending'
  const [rows] = await db.query<
    [
      {
        id: RecordId
        content: string
        source_kind: string
        source_ref: string | null
        status: string
        created_at: Date
        processed_at: Date | null
      }[]
    ]
  >(
    `SELECT id, content, source_kind, source_ref, status, created_at, processed_at
     FROM raw_capture
     WHERE status = $status ${filter}
     ORDER BY created_at ASC
     LIMIT $limit`,
    { limit: input.limit, source_kind: input.source_kind, status }
  )

  return rows.map(r => ({
    id: String(r.id),
    content: r.content,
    source_kind: r.source_kind,
    source_ref: r.source_ref,
    status: r.status,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    processed_at:
      r.processed_at instanceof Date ? r.processed_at.toISOString() : r.processed_at ? String(r.processed_at) : null
  }))
}

export function registerListInbox(server: McpServer): void {
  server.tool(
    'list_inbox',
    'List raw_captures by explicit inbox status. Defaults to pending. The real GTD/ZTD inbox.',
    listInboxShape,
    async args => {
      const rows = await listInboxImpl(args)
      const summary =
        rows.length === 0
          ? `No raws with status=${args.status ?? 'pending'}.`
          : rows
              .map(
                r =>
                  `- ${r.id} (${r.status}, ${r.source_kind}, ${r.created_at}): ${r.content.slice(0, 80)}${r.content.length > 80 ? '...' : ''}`
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
