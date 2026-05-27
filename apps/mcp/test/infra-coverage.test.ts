import { afterEach, describe, expect, test } from 'bun:test'
import { Surreal } from 'surrealdb'
import { type Embedder, embedTexts, setEmbedderOverride } from '../src/embeddings'
import { ConfigMissingError } from '../src/errors'
import { assertSchemaReady, setDbOverride } from '../src/surreal'
import { withFreshDb } from './_fixtures'

const URL_ = process.env.SURREAL_URL ?? 'ws://surrealdb:8000/rpc'
const USER = process.env.SURREAL_USER ?? 'root'
const PASS = process.env.SURREAL_PASS ?? 'root'

/**
 * Spin up a throwaway namespace WITHOUT applying the schema, point the global
 * `getDb()` override at it, and hand the caller a cleanup that drops the
 * namespace and clears the override. `withFreshDb` always applies the schema,
 * so we cannot use it for the negative case.
 */
async function withEmptyNamespace(): Promise<{ db: Surreal; cleanup: () => Promise<void> }> {
  const namespace = `huygens_test_${Math.random().toString(36).slice(2, 10)}`
  const db = new Surreal()
  await db.connect(URL_)
  await db.signin({ username: USER, password: PASS })
  await db.use({ namespace, database: 'main' })
  setDbOverride(db)
  return {
    db,
    async cleanup() {
      setDbOverride(null)
      await db.query(`REMOVE NAMESPACE \`${namespace}\``).catch(() => {})
      await db.close().catch(() => {})
    }
  }
}

describe('assertSchemaReady', () => {
  test('throws a clear, actionable error naming the missing tables on an unprovisioned namespace', async () => {
    const ctx = await withEmptyNamespace()
    try {
      const err = await assertSchemaReady().then(
        () => null,
        (e: unknown) => e as Error
      )
      expect(err).toBeInstanceOf(Error)
      const msg = err?.message ?? ''
      expect(msg).toMatch(/schema not initialised/)
      // Names the tables it expected so the operator knows what is wrong, and
      // points at the fix.
      expect(msg).toContain('note')
      expect(msg).toContain('raw_capture')
      expect(msg).toContain('proposal')
      expect(msg).toContain('derived_from')
      expect(msg).toMatch(/db:apply/)
    } finally {
      await ctx.cleanup()
    }
  })

  test('partial schema still reports the remaining missing tables', async () => {
    const ctx = await withEmptyNamespace()
    try {
      // Provision only a couple of the expected tables.
      await ctx.db.query('DEFINE TABLE note SCHEMALESS; DEFINE TABLE block SCHEMALESS;')
      const err = await assertSchemaReady().then(
        () => null,
        (e: unknown) => e as Error
      )
      const msg = err?.message ?? ''
      expect(msg).toMatch(/schema not initialised/)
      // The two we created must NOT be listed; the rest must.
      expect(msg).toContain('raw_capture')
      expect(msg).toContain('agent_event')
      expect(msg).not.toMatch(/missing tables:[^.]*\bnote\b/)
    } finally {
      await ctx.cleanup()
    }
  })

  test('does not throw once the full schema is applied', async () => {
    // withFreshDb applies schema + seed and installs the override.
    const ctx = await withFreshDb()
    try {
      await expect(assertSchemaReady()).resolves.toBeUndefined()
    } finally {
      await ctx.cleanup()
    }
  })
})

describe('embedTexts seam (setEmbedderOverride)', () => {
  afterEach(() => {
    // Always restore the global singleton so this file can never leak an
    // override into another file running afterwards in the same process.
    setEmbedderOverride(null)
  })

  test('routes through the installed override instead of the network', async () => {
    const calls: string[][] = []
    const fake: Embedder = async inputs => {
      calls.push(inputs)
      return { embeddings: inputs.map(() => [0.1, 0.2, 0.3]), model: 'fake', dimensions: 3, input_tokens: 7 }
    }
    setEmbedderOverride(fake)
    const result = await embedTexts(['alpha', 'beta'])
    expect(calls).toEqual([['alpha', 'beta']])
    expect(result.model).toBe('fake')
    expect(result.embeddings).toHaveLength(2)
  })

  test('clearing the override falls back to DeepInfra, which needs the API key', async () => {
    setEmbedderOverride(null)
    const prev = process.env.DEEPINFRA_API_KEY
    delete process.env.DEEPINFRA_API_KEY
    try {
      await expect(embedTexts(['x'])).rejects.toBeInstanceOf(ConfigMissingError)
    } finally {
      if (prev !== undefined) process.env.DEEPINFRA_API_KEY = prev
    }
  })

  test('the override forwards the abort signal it is given', async () => {
    let seenSignal: AbortSignal | undefined
    setEmbedderOverride(async (inputs, opts) => {
      seenSignal = opts?.signal
      return { embeddings: inputs.map(() => [0]), model: 'fake', dimensions: 1, input_tokens: 0 }
    })
    const ac = new AbortController()
    await embedTexts(['x'], { signal: ac.signal })
    expect(seenSignal).toBe(ac.signal)
  })
})
