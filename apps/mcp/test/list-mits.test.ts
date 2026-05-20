import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { captureImpl } from '../src/tools/capture'
import { commitClarifyImpl } from '../src/tools/commit-clarify'
import { listMitsImpl } from '../src/tools/list-mits'
import { type TestDb, withFreshDb } from './_fixtures'

async function makeNoteWithMit(title: string, mit_for: string, state: 'CLARIFIED' | 'DONE' = 'CLARIFIED') {
  const { raw_id } = await captureImpl({ content: title, source_kind: 'manual' })
  await commitClarifyImpl({
    raw_id,
    decomposition: {
      notes: [
        {
          title,
          type_slug: 'task',
          state,
          mit_for,
          blocks: [{ content: title }],
          transformation: 'extracted',
          internal_refs: []
        }
      ],
      external_refs: []
    }
  })
}

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
    await makeNoteWithMit('dentist', '2026-05-21T10:00:00Z')
    await makeNoteWithMit('other day', '2026-05-22T09:00:00Z')

    const rows = await listMitsImpl({ date: '2026-05-21' })
    expect(rows.map(r => r.title)).toEqual(['dentist'])
  })

  test('accepts both YYYY-MM-DD and full ISO datetime as `date`', async () => {
    await makeNoteWithMit('dentist', '2026-05-21T10:00:00Z')
    const a = await listMitsImpl({ date: '2026-05-21' })
    const b = await listMitsImpl({ date: '2026-05-21T18:00:00Z' })
    expect(a.map(r => r.id)).toEqual(b.map(r => r.id))
  })

  test('excludes notes in states outside the filter', async () => {
    await makeNoteWithMit('done task', '2026-05-21T10:00:00Z', 'DONE')
    const rows = await listMitsImpl({ date: '2026-05-21' })
    expect(rows).toEqual([])
  })

  test('orders by mit_for ascending', async () => {
    await makeNoteWithMit('afternoon', '2026-05-21T15:00:00Z')
    await makeNoteWithMit('morning', '2026-05-21T08:00:00Z')
    const rows = await listMitsImpl({ date: '2026-05-21' })
    expect(rows.map(r => r.title)).toEqual(['morning', 'afternoon'])
  })
})
