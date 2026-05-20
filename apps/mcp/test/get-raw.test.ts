import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { captureImpl } from '../src/tools/capture'
import { commitClarifyImpl } from '../src/tools/commit-clarify'
import { getRawImpl } from '../src/tools/get-raw'
import { type TestDb, withFreshDb } from './_fixtures'

describe('getRawImpl', () => {
  let ctx: TestDb

  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('returns null for unknown raw_id', async () => {
    const raw = await getRawImpl({ raw_id: 'raw_capture:does-not-exist' })
    expect(raw).toBeNull()
  })

  test('returns the raw with no derived notes when fresh', async () => {
    const { raw_id } = await captureImpl({
      content: 'hola',
      source_kind: 'manual',
      source_ref: 'ref-x'
    })
    const raw = await getRawImpl({ raw_id })
    expect(raw).not.toBeNull()
    expect(raw?.id).toBe(raw_id)
    expect(raw?.content).toBe('hola')
    expect(raw?.source_kind).toBe('manual')
    expect(raw?.source_ref).toBe('ref-x')
    expect(raw?.processed_at).toBeNull()
    expect(raw?.derived_notes).toEqual([])
  })

  test('lists derived notes after clarify', async () => {
    const { raw_id } = await captureImpl({ content: 'multi-item raw', source_kind: 'manual' })
    const commit = await commitClarifyImpl({
      raw_id,
      decomposition: {
        notes: [
          {
            title: 'A',
            type_slug: 'task',
            state: 'CLARIFIED',
            blocks: [{ content: '# A' }],
            transformation: 'extracted',
            internal_refs: []
          },
          {
            title: 'B',
            type_slug: 'note',
            state: 'CLARIFIED',
            blocks: [{ content: '# B' }],
            transformation: 'extracted',
            internal_refs: []
          }
        ],
        external_refs: []
      }
    })

    const raw = await getRawImpl({ raw_id })
    expect(raw?.processed_at).not.toBeNull()
    expect(raw?.derived_notes.sort()).toEqual(commit.notes_created.sort())
  })
})
