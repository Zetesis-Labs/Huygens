import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { RawStatusSchema, SourceKindSchema } from '../domain'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'
import { idStr, isoString, isoStringOrNull } from './graph-records'

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

type InboxDbRow = {
  id: RecordId
  content: string
  source_kind: string
  source_ref: string | null
  status: string
  created_at: Date
  processed_at: Date | null
}

function sourceKindFilter(sourceKind: string | undefined): string {
  return sourceKind ? 'AND source_kind = $source_kind' : ''
}

function toInboxRow(row: InboxDbRow): InboxRow {
  return {
    id: idStr(row.id),
    content: row.content,
    source_kind: row.source_kind,
    source_ref: row.source_ref,
    status: row.status,
    created_at: isoString(row.created_at),
    processed_at: isoStringOrNull(row.processed_at)
  }
}

export async function listInboxImpl(input: ListInboxInput): Promise<InboxRow[]> {
  const db = await getDb()
  const filter = sourceKindFilter(input.source_kind)
  const status = input.status ?? 'pending'
  const [rows] = await db.query<[InboxDbRow[]]>(
    `SELECT id, content, source_kind, source_ref, status, created_at, processed_at
     FROM raw_capture
     WHERE status = $status ${filter}
     ORDER BY created_at ASC
     LIMIT $limit`,
    { limit: input.limit, source_kind: input.source_kind, status }
  )

  return rows.map(toInboxRow)
}

function summarize(rows: InboxRow[], status: string): string {
  if (rows.length === 0) return `No raws with status=${status}.`
  return rows
    .map(
      r =>
        `- ${r.id} (${r.status}, ${r.source_kind}, ${r.created_at}): ${r.content.slice(0, 80)}${r.content.length > 80 ? '...' : ''}`
    )
    .join('\n')
}

export function registerListInbox(server: McpServer): void {
  defineTool(
    server,
    'list_inbox',
    'List raw_captures by explicit inbox status. Defaults to pending. The real GTD/ZTD inbox.',
    listInboxShape,
    async args => {
      const rows = await listInboxImpl(args)
      return {
        content: [
          { type: 'text', text: summarize(rows, args.status ?? 'pending') },
          { type: 'text', text: `\n[raw JSON for programmatic use]\n${JSON.stringify(rows, null, 2)}` }
        ]
      }
    }
  )
}
