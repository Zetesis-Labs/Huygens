import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { NoteTypeSlug } from '../src/domain'
import { captureImpl } from '../src/tools/capture'
import { commitClarifyImpl } from '../src/tools/commit-clarify'
import { listByTypeImpl } from '../src/tools/list-by-type'
import { updateNoteStateImpl } from '../src/tools/update-note-state'
import { type TestDb, withFreshDb } from './_fixtures'

async function makeNote(title: string, type_slug: NoteTypeSlug): Promise<string> {
  const { raw_id } = await captureImpl({ content: title, source_kind: 'manual' })
  const r = await commitClarifyImpl({
    raw_id,
    decomposition: {
      notes: [
        {
          title,
          type_slug,
          state: 'CLARIFIED',
          blocks: [{ content: title }],
          transformation: 'extracted',
          internal_refs: []
        }
      ],
      external_refs: []
    }
  })
  const id = r.notes_created[0]
  if (!id) throw new Error('expected a note to be created')
  return id
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
    await makeNote('build feature', 'task')
    await makeNote('Govoy roadmap', 'project')
    await makeNote('apply functors', 'idea')

    const tasks = await listByTypeImpl({ type_slug: 'task' })
    expect(tasks.map(t => t.title)).toEqual(['build feature'])

    const projects = await listByTypeImpl({ type_slug: 'project' })
    expect(projects.map(p => p.title)).toEqual(['Govoy roadmap'])
  })

  test('default state filter excludes DONE', async () => {
    const a = await makeNote('open task', 'task')
    const b = await makeNote('finished task', 'task')
    await updateNoteStateImpl({ note_id: b, state: 'DONE' })

    const rows = await listByTypeImpl({ type_slug: 'task' })
    expect(rows.map(r => r.id)).toEqual([a])
  })

  test('state_in override includes DONE', async () => {
    const a = await makeNote('open', 'task')
    const b = await makeNote('done', 'task')
    await updateNoteStateImpl({ note_id: b, state: 'DONE' })

    const rows = await listByTypeImpl({ type_slug: 'task', state_in: ['CLARIFIED', 'ACTIVE', 'DONE'] })
    expect(new Set(rows.map(r => r.id))).toEqual(new Set([a, b]))
  })

  test('respects the limit', async () => {
    for (let i = 0; i < 6; i++) await makeNote(`task ${i}`, 'task')
    const rows = await listByTypeImpl({ type_slug: 'task', limit: 3 })
    expect(rows).toHaveLength(3)
  })
})
