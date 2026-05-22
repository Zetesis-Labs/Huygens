import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { listMitsImpl } from '../src/tools/list-mits'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

describe('listMitsImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('returns nothing for a day with no MITs', async () => {
    expect(await listMitsImpl({ date: '2026-05-21' })).toEqual([])
  })

  test('returns notes whose mit_for falls on the given UTC day', async () => {
    await insertNote(ctx.db, { title: 'dentist', type_slug: 'task', mit_for: '2026-05-21T10:00:00Z' })
    await insertNote(ctx.db, { title: 'other day', type_slug: 'task', mit_for: '2026-05-22T09:00:00Z' })

    const rows = await listMitsImpl({ date: '2026-05-21' })
    expect(rows.map(r => r.title)).toEqual(['dentist'])
  })

  test('accepts both YYYY-MM-DD and full ISO datetime as `date`', async () => {
    await insertNote(ctx.db, { title: 'dentist', type_slug: 'task', mit_for: '2026-05-21T10:00:00Z' })
    const a = await listMitsImpl({ date: '2026-05-21' })
    const b = await listMitsImpl({ date: '2026-05-21T18:00:00Z' })
    expect(a.map(r => r.id)).toEqual(b.map(r => r.id))
  })

  test('excludes notes in states outside the filter', async () => {
    await insertNote(ctx.db, { title: 'done task', type_slug: 'task', state: 'DONE', mit_for: '2026-05-21T10:00:00Z' })
    const rows = await listMitsImpl({ date: '2026-05-21' })
    expect(rows).toEqual([])
  })

  test('orders by mit_for ascending', async () => {
    await insertNote(ctx.db, { title: 'afternoon', type_slug: 'task', mit_for: '2026-05-21T15:00:00Z' })
    await insertNote(ctx.db, { title: 'morning', type_slug: 'task', mit_for: '2026-05-21T08:00:00Z' })
    const rows = await listMitsImpl({ date: '2026-05-21' })
    expect(rows.map(r => r.title)).toEqual(['morning', 'afternoon'])
  })
})
