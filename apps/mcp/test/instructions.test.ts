import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { buildInstructions } from '../src/instructions'
import { type TestDb, withFreshDb } from './_fixtures'

describe('buildInstructions', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('leads with the SurrealQL cookbook', async () => {
    const text = await buildInstructions()
    expect(text).toContain('SurrealQL cookbook')
    // a verified recipe and the part_of direction rule must be present
    expect(text).toContain('<-part_of<-note')
    expect(text).toContain('READ-ONLY')
  })

  test('appends the live schema after the cookbook', async () => {
    const text = await buildInstructions()
    expect(text).toContain('live database schema')
    expect(text).toContain('DEFINE TABLE note')
    // cookbook comes before the schema section
    expect(text.indexOf('SurrealQL cookbook')).toBeLessThan(text.indexOf('live database schema'))
  })
})
