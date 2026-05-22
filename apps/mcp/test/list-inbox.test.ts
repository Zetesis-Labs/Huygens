import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { StringRecordId } from 'surrealdb'
import { captureImpl } from '../src/tools/capture'
import { listInboxImpl } from '../src/tools/list-inbox'
import { setRawStatusImpl } from '../src/tools/set-raw-status'
import { type TestDb, withFreshDb } from './_fixtures'

describe('listInboxImpl', () => {
  let ctx: TestDb

  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('empty inbox returns empty list', async () => {
    const rows = await listInboxImpl({ limit: 20 })
    expect(rows).toEqual([])
  })

  test('returns pending raws ordered by created_at ASC', async () => {
    const a = await captureImpl({ content: 'first', source_kind: 'manual' })
    await new Promise(r => setTimeout(r, 10))
    const b = await captureImpl({ content: 'second', source_kind: 'manual' })

    const rows = await listInboxImpl({ limit: 20 })
    expect(rows.map(r => r.id)).toEqual([a.raw_id, b.raw_id])
  })

  test('excludes raws whose status is processed', async () => {
    const { raw_id } = await captureImpl({ content: 'done', source_kind: 'manual' })
    await ctx.db.query("UPDATE $id SET status = 'processed', processed_at = time::now()", {
      id: new StringRecordId(raw_id)
    })

    const rows = await listInboxImpl({ limit: 20 })
    expect(rows).toEqual([])
  })

  test('can list deferred and ignored raws explicitly', async () => {
    const deferred = await captureImpl({ content: 'later', source_kind: 'manual' })
    const ignored = await captureImpl({ content: 'noise', source_kind: 'manual' })
    await setRawStatusImpl({ raw_ids: [deferred.raw_id], status: 'deferred' })
    await setRawStatusImpl({ raw_ids: [ignored.raw_id], status: 'ignored' })

    const deferredRows = await listInboxImpl({ limit: 20, status: 'deferred' })
    const ignoredRows = await listInboxImpl({ limit: 20, status: 'ignored' })

    expect(deferredRows.map(r => r.id)).toEqual([deferred.raw_id])
    expect(ignoredRows.map(r => r.id)).toEqual([ignored.raw_id])
  })

  test('source_kind filter narrows the result', async () => {
    await captureImpl({ content: 'voice msg', source_kind: 'voice' })
    await captureImpl({ content: 'chat msg', source_kind: 'chat' })

    const voiceOnly = await listInboxImpl({ limit: 20, source_kind: 'voice' })
    expect(voiceOnly).toHaveLength(1)
    expect(voiceOnly[0]?.content).toBe('voice msg')
  })

  test('respects the limit', async () => {
    for (let i = 0; i < 5; i++) {
      await captureImpl({ content: `msg ${i}`, source_kind: 'manual' })
    }
    const rows = await listInboxImpl({ limit: 3 })
    expect(rows).toHaveLength(3)
  })
})
