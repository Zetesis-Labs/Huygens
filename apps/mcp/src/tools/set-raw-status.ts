import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type RecordId, StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { RAW_CAPTURE_ID_RE, RawStatusSchema } from '../domain'
import { RawNotFoundError } from '../errors'
import { emitEvent, newSessionId } from '../events'
import { getDb } from '../surreal'
import { defineTool, jsonBlock } from './define-tool'
import { idStr, isoStringOrNull } from './graph-records'

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

function toRawStatusRow(row: DbRawStatusRow): RawStatusRow {
  return {
    id: idStr(row.id),
    status: row.status,
    processed_at: isoStringOrNull(row.processed_at)
  }
}

function findMissingIds(requested: string[], existing: string[]): string[] {
  const existingIds = new Set(existing)
  return requested.filter(id => !existingIds.has(id))
}

// 'processed' sella processed_at; 'pending' lo suelta a NONE; los demás estados no lo tocan.
function processedAtClause(status: SetRawStatusInput['status']): string {
  return status === 'processed' ? ', processed_at = time::now()' : status === 'pending' ? ', processed_at = NONE' : ''
}

export async function setRawStatusImpl(input: SetRawStatusInput): Promise<RawStatusRow[]> {
  const db = await getDb()
  const refs = input.raw_ids.map(toRawRef)

  const [existing] = await db.query<[{ id: RecordId }[]]>('SELECT id FROM raw_capture WHERE id IN $ids', {
    ids: refs
  })
  const missing = findMissingIds(
    input.raw_ids,
    existing.map(row => idStr(row.id))
  )
  if (missing.length > 0) {
    throw new RawNotFoundError(missing.join(', '))
  }

  const setProcessedAt = processedAtClause(input.status)

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

  return rows.map(toRawStatusRow)
}

export function registerSetRawStatus(server: McpServer): void {
  defineTool(
    server,
    'set_raw_status',
    'Change explicit inbox status for one or more raw_capture records. Does not create notes, blocks, or graph edges.',
    setRawStatusShape,
    async args => {
      const rows = await setRawStatusImpl(args)
      return { content: [jsonBlock(rows)] }
    }
  )
}
