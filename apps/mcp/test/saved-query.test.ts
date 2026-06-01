import { describe, expect, test } from 'bun:test'
import { saveQueryImpl } from '../src/tools/saved-query'
import { withFreshDb } from './_fixtures'

// saveQueryImpl writes as root (getDb), so withFreshDb's override is enough.
describe('save_query', () => {
  test('creating with a caller-chosen id upserts (no "not found")', async () => {
    const ctx = await withFreshDb()
    try {
      const r = await saveQueryImpl({
        id: 'saved_query:pending_tasks',
        name: 'Tareas pendientes',
        query: 'SELECT id FROM note',
        pinned: true
      })
      expect(r.id).toBe('saved_query:pending_tasks')
      expect(r.updated).toBe(false)

      // Saving again with the same id updates in place.
      const r2 = await saveQueryImpl({
        id: 'saved_query:pending_tasks',
        name: 'Tareas pendientes (v2)',
        query: 'SELECT id, title FROM note',
        pinned: false
      })
      expect(r2.id).toBe('saved_query:pending_tasks')
      expect(r2.updated).toBe(true)

      const [rows] = await ctx.db.query<[{ name: string; pinned: boolean }[]]>(
        'SELECT name, pinned FROM saved_query:pending_tasks'
      )
      expect(rows?.[0]?.name).toBe('Tareas pendientes (v2)')
      expect(rows?.[0]?.pinned).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  })

  test('creating without id assigns a random id', async () => {
    const ctx = await withFreshDb()
    try {
      const r = await saveQueryImpl({ name: 'Sin id', query: 'SELECT 1', pinned: false })
      expect(r.id).toMatch(/^saved_query:/)
      expect(r.updated).toBe(false)
    } finally {
      await ctx.cleanup()
    }
  })
})
