import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { NoteTypeSlug } from '../src/domain'
import { listByTypeImpl } from '../src/tools/list-by-type'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

async function makeNote(ctx: TestDb, title: string, type_slug: NoteTypeSlug): Promise<string> {
  const r = await insertNote(ctx.db, { title, type_slug })
  return r.note_id
}

describe('listByTypeImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('filters by type', async () => {
    await makeNote(ctx, 'build feature', 'task')
    await makeNote(ctx, 'Govoy roadmap', 'project')
    await makeNote(ctx, 'apply functors', 'idea')

    const tasks = await listByTypeImpl({ type_slug: 'task' })
    expect(tasks.map(t => t.title)).toEqual(['build feature'])

    const projects = await listByTypeImpl({ type_slug: 'project' })
    expect(projects.map(p => p.title)).toEqual(['Govoy roadmap'])
  })

  test('default state filter excludes DONE', async () => {
    const a = await makeNote(ctx, 'open task', 'task')
    await insertNote(ctx.db, { title: 'finished task', type_slug: 'task', state: 'DONE' })

    const rows = await listByTypeImpl({ type_slug: 'task' })
    expect(rows.map(r => r.id)).toEqual([a])
  })

  test('state_in override includes DONE', async () => {
    const a = await makeNote(ctx, 'open', 'task')
    const { note_id: b } = await insertNote(ctx.db, { title: 'done', type_slug: 'task', state: 'DONE' })

    const rows = await listByTypeImpl({ type_slug: 'task', state_in: ['CLARIFIED', 'ACTIVE', 'DONE'] })
    expect(new Set(rows.map(r => r.id))).toEqual(new Set([a, b]))
  })

  test('respects the limit', async () => {
    for (let i = 0; i < 6; i++) await makeNote(ctx, `task ${i}`, 'task')
    const rows = await listByTypeImpl({ type_slug: 'task', limit: 3 })
    expect(rows).toHaveLength(3)
  })
})
