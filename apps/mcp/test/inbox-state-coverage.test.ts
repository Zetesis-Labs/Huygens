import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { captureImpl } from '../src/tools/capture'
import { getRawImpl, getRawShape } from '../src/tools/get-raw'
import { listByTypeImpl } from '../src/tools/list-by-type'
import { listInboxImpl } from '../src/tools/list-inbox'
import { listMitsImpl } from '../src/tools/list-mits'
import { setRawStatusImpl, setRawStatusShape } from '../src/tools/set-raw-status'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

// Coverage-gap suite. Only behaviours NOT already exercised by the
// per-tool test files live here; see the task brief for the inventory.

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
    const raw = await getRawImpl({ raw_id })
    expect(raw?.status).toBe('pending')
    expect(raw?.processed_at).toBeNull()
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

describe('list_mits_for_date — coverage gaps', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('UTC day boundaries: last instant in, first instant of next day out', async () => {
    await insertNote(ctx.db, { title: 'edge of day', type_slug: 'task', mit_for: '2026-05-21T23:59:59Z' })
    await insertNote(ctx.db, { title: 'next day midnight', type_slug: 'task', mit_for: '2026-05-22T00:00:00Z' })
    await insertNote(ctx.db, { title: 'this day midnight', type_slug: 'task', mit_for: '2026-05-21T00:00:00Z' })

    const rows = await listMitsImpl({ date: '2026-05-21' })
    expect(rows.map(r => r.title).sort()).toEqual(['edge of day', 'this day midnight'])
  })

  test('a custom state_in widens which MITs count as pending', async () => {
    await insertNote(ctx.db, {
      title: 'someday mit',
      type_slug: 'task',
      state: 'SOMEDAY',
      mit_for: '2026-05-21T10:00:00Z'
    })
    // default excludes SOMEDAY
    expect(await listMitsImpl({ date: '2026-05-21' })).toEqual([])
    const widened = await listMitsImpl({ date: '2026-05-21', state_in: ['SOMEDAY'] })
    expect(widened.map(r => r.title)).toEqual(['someday mit'])
  })
})

describe('list_notes_by_type — coverage gaps', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('orders by updated_at descending (most recently touched first)', async () => {
    const first = await insertNote(ctx.db, { title: 'first', type_slug: 'task' })
    await new Promise(r => setTimeout(r, 10))
    const second = await insertNote(ctx.db, { title: 'second', type_slug: 'task' })
    // touch the first note so its updated_at becomes the newest
    await new Promise(r => setTimeout(r, 10))
    await ctx.db.query('UPDATE $id SET updated_at = time::now()', {
      id: new StringRecordId(first.note_id)
    })

    const rows = await listByTypeImpl({ type_slug: 'task' })
    expect(rows.map(r => r.id)).toEqual([first.note_id, second.note_id])
  })

  test('mit_for is surfaced on the row (drives the MIT suffix) and null otherwise', async () => {
    const mit = await insertNote(ctx.db, {
      title: 'mit note',
      type_slug: 'task',
      mit_for: '2026-05-27T08:00:00Z'
    })
    const plain = await insertNote(ctx.db, { title: 'plain note', type_slug: 'task' })

    const rows = await listByTypeImpl({ type_slug: 'task', state_in: ['CLARIFIED', 'ACTIVE'] })
    const byId = new Map(rows.map(r => [r.id, r]))
    expect(byId.get(mit.note_id)?.mit_for).not.toBeNull()
    expect(byId.get(mit.note_id)?.mit_for?.slice(0, 10)).toBe('2026-05-27')
    expect(byId.get(plain.note_id)?.mit_for).toBeNull()
  })

  test('returns empty for a type with no matching notes', async () => {
    await insertNote(ctx.db, { title: 'a task', type_slug: 'task' })
    const rows = await listByTypeImpl({ type_slug: 'person' })
    expect(rows).toEqual([])
  })
})

describe('get_raw — coverage gaps', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('rejects an id whose table prefix is not raw_capture', async () => {
    await expect(getRawImpl({ raw_id: 'note:abc' })).rejects.toThrow('invalid raw_id table prefix')
  })

  test('schema rejects a malformed raw id', () => {
    const schema = z.object(getRawShape)
    expect(() => schema.parse({ raw_id: 'not-a-record-id' })).toThrow()
  })
})
