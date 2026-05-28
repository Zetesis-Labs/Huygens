import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { loadSchemaSnapshot } from '../src/schema-snapshot'
import { type TestDb, withFreshDb } from './_fixtures'

describe('loadSchemaSnapshot', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('includes core tables with their field types', async () => {
    const snap = await loadSchemaSnapshot()
    expect(snap).toContain('DEFINE TABLE note')
    expect(snap).toContain('DEFINE FIELD title ON note TYPE string')
  })

  test('surfaces the ZTD enum from the state ASSERT', async () => {
    const snap = await loadSchemaSnapshot()
    expect(snap).toContain("'CLARIFIED'")
    expect(snap).toContain("'ARCHIVED'")
  })

  test('describes edges as RELATION tables with in/out', async () => {
    const snap = await loadSchemaSnapshot()
    expect(snap).toMatch(/DEFINE TABLE about TYPE RELATION IN block OUT note/)
    expect(snap).toMatch(/DEFINE TABLE derived_from TYPE RELATION IN block OUT raw_capture/)
  })

  test('strips the noisy PERMISSIONS clause', async () => {
    const snap = await loadSchemaSnapshot()
    expect(snap).not.toContain('PERMISSIONS')
  })

  test('omits array-element sub-fields like block_order.*', async () => {
    const snap = await loadSchemaSnapshot()
    expect(snap).not.toContain('block_order.*')
  })
})
