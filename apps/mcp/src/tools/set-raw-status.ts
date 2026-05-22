import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type RecordId, StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { RAW_CAPTURE_ID_RE, RawStatusSchema } from '../domain'
import { emitEvent, newSessionId } from '../events'
import { getDb } from '../surreal'

export const setRawStatusShape = {
  raw_ids: z
    .array(z.string().regex(RAW_CAPTURE_ID_RE, 'Must be a record id like "raw_capture:abc123"'))
    .min(1)
    .max(100)
    .describe('raw_capture ids to update'),
  status: RawStatusSchema.describe('New explicit inbox status')
}

const setRawStatusSchema = z.object(setRawStatusShape)
export type SetRawStatusInput = z.infer<typeof setRawStatusSchema>

export type RawStatusRow = {
  id: string
  status: string
  processed_at: string | null
}

type DbRawStatusRow = {
  id: RecordId
  status: string
  processed_at: Date | null
}

function toRawRef(rawId: string): StringRecordId {
  return new StringRecordId(rawId)
}

function asIso(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString()
  return value == null ? null : String(value)
}

export async function setRawStatusImpl(input: SetRawStatusInput): Promise<RawStatusRow[]> {
  const db = await getDb()
  const refs = input.raw_ids.map(toRawRef)

  const [existing] = await db.query<[{ id: RecordId }[]]>('SELECT id FROM raw_capture WHERE id IN $ids', {
    ids: refs
  })
  const existingIds = new Set(existing.map(row => String(row.id)))
  const missing = input.raw_ids.filter(id => !existingIds.has(id))
  if (missing.length > 0) {
    throw new Error(`raw_capture not found: ${missing.join(', ')}`)
  }

  const setProcessedAt =
    input.status === 'processed'
      ? ', processed_at = time::now()'
      : input.status === 'pending'
        ? ', processed_at = NONE'
        : ''

  const [rows] = await db.query<[DbRawStatusRow[]]>(
    `UPDATE raw_capture SET status = $status${setProcessedAt} WHERE id IN $ids RETURN AFTER`,
    { ids: refs, status: input.status }
  )

  await emitEvent({
    kind: 'raw_status_changed',
    actor: 'conversational',
    session_id: newSessionId(),
    payload: { raw_ids: input.raw_ids, status: input.status }
  })

  return rows.map(row => ({
    id: String(row.id),
    status: row.status,
    processed_at: asIso(row.processed_at)
  }))
}

export function registerSetRawStatus(server: McpServer): void {
  server.tool(
    'set_raw_status',
    'Change explicit inbox status for one or more raw_capture records. Does not create notes, blocks, or graph edges.',
    setRawStatusShape,
    async args => {
      const rows = await setRawStatusImpl(args)
      return {
        content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }]
      }
    }
  )
}
