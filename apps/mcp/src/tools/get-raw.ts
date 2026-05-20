import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type RecordId, StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { RAW_CAPTURE_ID_RE } from '../domain'
import { getDb } from '../surreal'

export const getRawShape = {
  raw_id: z
    .string()
    .regex(RAW_CAPTURE_ID_RE, 'Must be a record id like "raw_capture:abc123"')
    .describe('The raw_capture id (e.g. raw_capture:abc123)')
}

const getRawSchema = z.object(getRawShape)
export type GetRawInput = z.infer<typeof getRawSchema>

export type RawDetail = {
  id: string
  content: string
  source_kind: string
  source_ref: string | null
  created_at: string
  processed_at: string | null
  derived_notes: string[]
}

export async function getRawImpl(input: GetRawInput): Promise<RawDetail | null> {
  const db = await getDb()
  const [parts] = input.raw_id.split(':')
  if (parts !== 'raw_capture') {
    throw new Error(`invalid raw_id table prefix: ${parts}`)
  }
  const rawRef = new StringRecordId(input.raw_id)
  const [rows] = await db.query<
    [
      {
        id: RecordId
        content: string
        source_kind: string
        source_ref: string | null
        created_at: Date
        processed_at: Date | null
      }[]
    ]
  >(`SELECT * FROM raw_capture WHERE id = $id`, { id: rawRef })

  const raw = rows[0]
  if (!raw) return null

  const [derivedRows] = await db.query<[{ in: RecordId }[]]>('SELECT in FROM derived_from WHERE out = $id', {
    id: rawRef
  })

  return {
    id: String(raw.id),
    content: raw.content,
    source_kind: raw.source_kind,
    source_ref: raw.source_ref,
    created_at: raw.created_at instanceof Date ? raw.created_at.toISOString() : String(raw.created_at),
    processed_at:
      raw.processed_at instanceof Date
        ? raw.processed_at.toISOString()
        : raw.processed_at
          ? String(raw.processed_at)
          : null,
    derived_notes: derivedRows.map(d => String(d.in))
  }
}

export function registerGetRaw(server: McpServer): void {
  server.tool(
    'get_raw',
    'Fetch full detail of a single raw_capture by id, plus the notes/blocks derived from it (if any).',
    getRawShape,
    async args => {
      const raw = await getRawImpl(args)
      if (!raw) {
        return { content: [{ type: 'text', text: `Not found: ${args.raw_id}` }] }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(raw, null, 2) }]
      }
    }
  )
}
