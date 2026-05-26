import type { RecordId, StringRecordId } from 'surrealdb'

/** A record id may arrive from the driver as a RecordId/StringRecordId object
 * or, after a JSON round-trip, as a plain string. */
export type RecordIdish = RecordId | StringRecordId | string

/** Normalize any record-id shape to its canonical string form ("note:abc"). */
export function idStr(value: RecordIdish | null | undefined): string {
  return value == null ? '' : String(value)
}

/** The table prefix of a record id: "note:abc" → "note". */
export function tableOf(id: RecordIdish): string {
  return idStr(id).split(':')[0] ?? ''
}

/**
 * A graph node (note / block / raw_capture) as returned by `SELECT *`. Only the
 * fields the change views read are named; the record keeps any other fields at
 * runtime (they still serialize to JSON) — the type just doesn't enumerate them.
 */
export type GraphNodeRecord = {
  id: RecordIdish
  title?: string
  type?: RecordIdish
  content?: string
  block_kind?: string
}

/** A graph edge (derived_from / about / affects / part_of …) as returned by `SELECT *`. */
export type GraphEdgeRecord = {
  id: RecordIdish
  in: RecordIdish
  out: RecordIdish
  action?: string
}
