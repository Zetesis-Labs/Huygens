import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { captureImpl } from '../src/tools/capture'
import { setRawStatusImpl } from '../src/tools/set-raw-status'
import { type TestDb, withFreshDb } from './_fixtures'

describe('setRawStatusImpl', () => {
  let ctx: TestDb

  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('moves raws to ignored without creating graph records', async () => {
    const { raw_id } = await captureImpl({ content: 'noise', source_kind: 'manual' })
    const rows = await setRawStatusImpl({ raw_ids: [raw_id], status: 'ignored' })

    expect(rows).toEqual([{ id: raw_id, status: 'ignored', processed_at: null }])

    const [notes] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM note GROUP ALL')
    const [blocks] = await ctx.db.query<[{ count: number }[]]>('SELECT count() AS count FROM block GROUP ALL')
    expect(notes[0]?.count ?? 0).toBe(0)
    expect(blocks[0]?.count ?? 0).toBe(0)
  })

  test('sets processed_at only for processed status', async () => {
    const { raw_id } = await captureImpl({ content: 'done', source_kind: 'manual' })
    const rows = await setRawStatusImpl({ raw_ids: [raw_id], status: 'processed' })

    expect(rows[0]?.status).toBe('processed')
    expect(rows[0]?.processed_at).not.toBeNull()
  })

  test('rejects missing raw ids', async () => {
    await expect(setRawStatusImpl({ raw_ids: ['raw_capture:nope'], status: 'deferred' })).rejects.toThrow(
      'raw_capture not found'
    )
  })
})
