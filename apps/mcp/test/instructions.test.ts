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

  test('leads with the operating doctrine, then the cookbook', async () => {
    const text = await buildInstructions()
    // the doctrine (how to behave) is pushed in full, first, with its banner
    expect(text).toContain('LEE ESTO PRIMERO')
    expect(text).toContain('La frontera de aprobación')
    // the cookbook (how to read) follows
    expect(text).toContain('SurrealQL cookbook')
    expect(text).toContain('<-part_of<-note')
    expect(text).toContain('READ-ONLY')
    // doctrine before cookbook
    expect(text.indexOf('LEE ESTO PRIMERO')).toBeLessThan(text.indexOf('SurrealQL cookbook'))
  })

  test('appends the live schema after the cookbook', async () => {
    const text = await buildInstructions()
    expect(text).toContain('live database schema')
    expect(text).toContain('DEFINE TABLE note')
    // cookbook comes before the schema section
    expect(text.indexOf('SurrealQL cookbook')).toBeLessThan(text.indexOf('live database schema'))
  })
})
