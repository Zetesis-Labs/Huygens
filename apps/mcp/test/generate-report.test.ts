import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ChatComplete, ChatMessage } from '../src/chat'
import type { NoteTypeSlug } from '../src/domain'
import { captureImpl } from '../src/tools/capture'
import { commitClarifyImpl } from '../src/tools/commit-clarify'
import { generateReportImpl } from '../src/tools/generate-report'
import { type TestDb, withFreshDb } from './_fixtures'

type Capture = {
  messages: ChatMessage[]
  model: string | undefined
  temperature: number | undefined
}

function makeFakeChat(text: string): { fn: ChatComplete; captured: Capture[] } {
  const captured: Capture[] = []
  const fn: ChatComplete = async (messages, opts) => {
    captured.push({ messages, model: opts?.model, temperature: opts?.temperature })
    return {
      text,
      model: opts?.model ?? 'fake',
      tokens_used: { input: 10, output: 20 }
    }
  }
  return { fn, captured }
}

async function seedNote(title: string, body: string, type_slug: NoteTypeSlug = 'note'): Promise<string> {
  const { raw_id } = await captureImpl({ content: title, source_kind: 'manual' })
  const r = await commitClarifyImpl({
    raw_id,
    decomposition: {
      notes: [
        {
          title,
          type_slug,
          state: 'CLARIFIED',
          blocks: [{ content: body }],
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

describe('generateReportImpl', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('empty period returns the empty-corpus marker without calling the LLM', async () => {
    const { fn, captured } = makeFakeChat('SHOULD NOT BE USED')
    const result = await generateReportImpl(
      {
        period_start: '2026-05-20T00:00:00Z',
        period_end: '2026-05-21T00:00:00Z',
        style: 'narrative'
      },
      fn
    )
    expect(result.notes_covered).toEqual([])
    expect(result.report_markdown).toMatch(/No notes/)
    expect(captured).toHaveLength(0)
  })

  test('passes the corpus into the user message and returns the LLM output verbatim', async () => {
    const id = await seedNote('applicative functors', 'Compose monoidal effects.')

    const { fn, captured } = makeFakeChat('# Functores aplicativos\n\nNarrativa fake.')
    const result = await generateReportImpl(
      {
        period_start: '1970-01-01T00:00:00Z',
        period_end: '2999-01-01T00:00:00Z',
        style: 'narrative'
      },
      fn
    )

    expect(result.report_markdown).toBe('# Functores aplicativos\n\nNarrativa fake.')
    expect(result.notes_covered).toEqual([id])

    expect(captured).toHaveLength(1)
    const userMsg = captured[0]?.messages.find(m => m.role === 'user')?.content ?? ''
    expect(userMsg).toContain('applicative functors')
    expect(userMsg).toContain('Compose monoidal effects.')
  })

  test('respects note_ids when provided', async () => {
    const a = await seedNote('keep me', 'A body')
    await seedNote('skip me', 'B body')

    const { fn, captured } = makeFakeChat('ok')
    const result = await generateReportImpl(
      {
        period_start: '1970-01-01T00:00:00Z',
        period_end: '2999-01-01T00:00:00Z',
        note_ids: [a],
        style: 'bullets'
      },
      fn
    )
    expect(result.notes_covered).toEqual([a])
    const userMsg = captured[0]?.messages.find(m => m.role === 'user')?.content ?? ''
    expect(userMsg).toContain('keep me')
    expect(userMsg).not.toContain('skip me')
  })

  test('reports tokens_used and duration_ms from the chat call', async () => {
    await seedNote('any', 'body')
    const { fn } = makeFakeChat('ok')
    const result = await generateReportImpl(
      {
        period_start: '1970-01-01T00:00:00Z',
        period_end: '2999-01-01T00:00:00Z',
        style: 'narrative'
      },
      fn
    )
    expect(result.tokens_used).toEqual({ input: 10, output: 20 })
    expect(result.duration_ms).toBeGreaterThanOrEqual(0)
  })
})
