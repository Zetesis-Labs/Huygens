import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { captureImpl } from '../src/tools/capture'
import { listInboxImpl } from '../src/tools/list-inbox'
import { setRawStatusImpl, setRawStatusShape } from '../src/tools/set-raw-status'
import { type TestDb, withFreshDb } from './_fixtures'

// Coverage-gap suite for the read tools that remain after pruning the trivial
// ones (get_raw / list_mits_for_date / list_notes_by_type, now covered by the
// SurrealQL cookbook). Only behaviours NOT exercised by the per-tool files.

describe('set_raw_status — coverage gaps', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('pending → deferred keeps processed_at null', async () => {
    const { raw_id } = await captureImpl({ content: 'later', source_kind: 'manual' })
    const rows = await setRawStatusImpl({ raw_ids: [raw_id], status: 'deferred' })
    expect(rows).toEqual([{ id: raw_id, status: 'deferred', processed_at: null }])
  })

  test('moving back to pending clears a previously-set processed_at', async () => {
    const { raw_id } = await captureImpl({ content: 'reopen', source_kind: 'manual' })
    await setRawStatusImpl({ raw_ids: [raw_id], status: 'processed' })

    const reopened = await setRawStatusImpl({ raw_ids: [raw_id], status: 'pending' })
    expect(reopened[0]?.status).toBe('pending')
    expect(reopened[0]?.processed_at).toBeNull()
  })

  test('updates several raws in a single call', async () => {
    const a = await captureImpl({ content: 'a', source_kind: 'manual' })
    const b = await captureImpl({ content: 'b', source_kind: 'manual' })
    const rows = await setRawStatusImpl({ raw_ids: [a.raw_id, b.raw_id], status: 'deferred' })
    expect(new Set(rows.map(r => r.id))).toEqual(new Set([a.raw_id, b.raw_id]))
    expect(rows.every(r => r.status === 'deferred')).toBe(true)
  })

  test('rejects partial batch when one raw id is missing (atomic existence check)', async () => {
    const { raw_id } = await captureImpl({ content: 'real', source_kind: 'manual' })
    await expect(setRawStatusImpl({ raw_ids: [raw_id, 'raw_capture:ghost'], status: 'processed' })).rejects.toThrow(
      'raw_capture not found'
    )

    // the real raw must be left untouched
    const [rows] = await ctx.db.query<[{ status: string; processed_at: unknown }[]]>(
      'SELECT status, processed_at FROM raw_capture WHERE id = $id',
      { id: new StringRecordId(raw_id) }
    )
    expect(rows[0]?.status).toBe('pending')
    expect(rows[0]?.processed_at ?? null).toBeNull()
  })

  test('schema rejects a status outside the enum', () => {
    const schema = z.object(setRawStatusShape)
    expect(() => schema.parse({ raw_ids: ['raw_capture:abc'], status: 'archived' })).toThrow()
  })

  test('schema rejects a malformed raw id', () => {
    const schema = z.object(setRawStatusShape)
    expect(() => schema.parse({ raw_ids: ['note:abc'], status: 'processed' })).toThrow()
  })
})

describe('list_inbox — coverage gaps', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('default status (pending) excludes deferred raws', async () => {
    const keep = await captureImpl({ content: 'still pending', source_kind: 'manual' })
    const later = await captureImpl({ content: 'deferred one', source_kind: 'manual' })
    await setRawStatusImpl({ raw_ids: [later.raw_id], status: 'deferred' })

    const rows = await listInboxImpl({ limit: 20 })
    expect(rows.map(r => r.id)).toEqual([keep.raw_id])
  })

  test('listing one status never leaks rows in another status', async () => {
    const pending = await captureImpl({ content: 'p', source_kind: 'manual' })
    const deferred = await captureImpl({ content: 'd', source_kind: 'manual' })
    const processed = await captureImpl({ content: 'x', source_kind: 'manual' })
    await setRawStatusImpl({ raw_ids: [deferred.raw_id], status: 'deferred' })
    await setRawStatusImpl({ raw_ids: [processed.raw_id], status: 'processed' })

    const pendingRows = await listInboxImpl({ limit: 20, status: 'pending' })
    const processedRows = await listInboxImpl({ limit: 20, status: 'processed' })

    expect(pendingRows.map(r => r.id)).toEqual([pending.raw_id])
    expect(processedRows.map(r => r.id)).toEqual([processed.raw_id])
  })
})
