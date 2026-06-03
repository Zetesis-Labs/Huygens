import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { retractImpl } from '../src/tools/retract'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

// DB-backed. Retraction is destructive, so these assert both the preview
// (dry_run) contract and the post-delete graph state, including cascade,
// block_order cleanup, incident-edge removal, and the audit event.

async function count(ctx: TestDb, table: string): Promise<number> {
  const [rows] = await ctx.db.query<[{ count: number }[]]>(`SELECT count() AS count FROM ${table} GROUP ALL`)
  return rows[0]?.count ?? 0
}

describe('retractImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('requires a selector', async () => {
    expect(retractImpl({ dry_run: true })).rejects.toThrow(/selector/)
  })

  test('rejects a non-retractable record id', async () => {
    expect(retractImpl({ ids: ['proposal:abc'], dry_run: true })).rejects.toThrow(/retractable/)
  })

  test('dry_run (default) previews the cascade but deletes nothing', async () => {
    const note = await insertNote(ctx.db, { title: 'Doomed', type_slug: 'idea', blocks: ['one', 'two'] })

    const plan = await retractImpl({ ids: [note.note_id] })

    expect(plan.dry_run).toBe(true)
    expect(plan.notes).toEqual([note.note_id])
    expect(plan.blocks.sort()).toEqual([...note.block_ids].sort()) // both owned blocks cascade
    expect(await count(ctx, 'note')).toBe(1) // nothing actually deleted
    expect(await count(ctx, 'block')).toBe(2)
  })

  test('retracting a note cascades its owned descriptive blocks', async () => {
    const note = await insertNote(ctx.db, { title: 'Doomed', type_slug: 'idea', blocks: ['one', 'two'] })

    const res = await retractImpl({ ids: [note.note_id], dry_run: false })

    expect(res.dry_run).toBe(false)
    expect(await count(ctx, 'note')).toBe(0)
    expect(await count(ctx, 'block')).toBe(0)
  })

  test('retracting a single block prunes block_order and drops its incident edges', async () => {
    const note = await insertNote(ctx.db, { title: 'Keeper', type_slug: 'idea', blocks: ['gone', 'stays'] })
    const [goneId, staysId] = note.block_ids
    // A narrative-style about edge pointing at the note from the doomed block.
    await ctx.db.query(`RELATE ${goneId}->about->${note.note_id}`)

    const res = await retractImpl({ ids: [goneId as string], dry_run: false })

    expect(res.edges_removed.about).toBe(1)
    expect(res.block_order_cleaned).toEqual([note.note_id])
    expect(await count(ctx, 'about')).toBe(0)
    expect(await count(ctx, 'block')).toBe(1) // 'stays' survives
    const [order] = await ctx.db.query<[{ block_order: { toString(): string }[] }[]]>(
      `SELECT block_order FROM ${note.note_id}`
    )
    expect(order[0]?.block_order.map(b => b.toString())).toEqual([staysId])
  })

  test('retracts raw_captures selected by source_ref', async () => {
    await ctx.db.query("CREATE raw_capture SET content='x', source_kind='import', source_ref='doc-7', status='pending'")
    await ctx.db.query("CREATE raw_capture SET content='y', source_kind='import', source_ref='other', status='pending'")

    const res = await retractImpl({ source_ref: 'doc-7', dry_run: false })

    expect(res.raw_captures.length).toBe(1)
    expect(await count(ctx, 'raw_capture')).toBe(1) // only 'other' survives
  })

  test('emits a retracted agent_event when it actually deletes', async () => {
    const note = await insertNote(ctx.db, { title: 'Audited', type_slug: 'idea', blocks: ['body'] })
    await retractImpl({ ids: [note.note_id], dry_run: false })
    expect(await count(ctx, "agent_event WHERE kind = 'retracted'")).toBe(1)
  })

  test('a no-op selection deletes nothing and emits nothing', async () => {
    const res = await retractImpl({ ids: ['note:does_not_exist'], dry_run: false })
    expect(res.notes).toEqual([])
    expect(await count(ctx, "agent_event WHERE kind = 'retracted'")).toBe(0)
  })
})
