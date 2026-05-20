import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { captureImpl } from '../src/tools/capture'
import { type TestDb, withFreshDb } from './_fixtures'

describe('captureImpl', () => {
  let ctx: TestDb

  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('persists raw_capture and returns its id', async () => {
    const { raw_id } = await captureImpl({
      content: 'recordar comprar leche',
      source_kind: 'manual'
    })
    expect(raw_id).toMatch(/^raw_capture:[A-Za-z0-9]+$/)

    const [rows] = await ctx.db.query<[{ content: string; source_kind: string }[]]>(
      'SELECT content, source_kind FROM raw_capture'
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.content).toBe('recordar comprar leche')
    expect(rows[0]?.source_kind).toBe('manual')
  })

  test('source_ref absent stays NONE, not null', async () => {
    await captureImpl({ content: 'x', source_kind: 'manual' })
    const [rows] = await ctx.db.query<[{ source_ref: string | null | undefined }[]]>(
      'SELECT source_ref FROM raw_capture'
    )
    expect(rows[0]?.source_ref).toBeUndefined()
  })

  test('source_ref present persists', async () => {
    await captureImpl({ content: 'x', source_kind: 'chat', source_ref: 'session-abc' })
    const [rows] = await ctx.db.query<[{ source_ref: string | null }[]]>('SELECT source_ref FROM raw_capture')
    expect(rows[0]?.source_ref).toBe('session-abc')
  })

  test('emits a raw_received agent_event linked to the new raw', async () => {
    const { raw_id } = await captureImpl({ content: 'x', source_kind: 'voice' })
    const [events] = await ctx.db.query<
      [{ kind: string; actor: string; subject: string; payload: Record<string, unknown> }[]]
    >('SELECT kind, actor, type::string(subject) AS subject, payload FROM agent_event')
    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('raw_received')
    expect(events[0]?.actor).toBe('conversational')
    expect(events[0]?.subject).toBe(raw_id)
    expect(events[0]?.payload).toMatchObject({ source_kind: 'voice', content_length: 1 })
  })
})
