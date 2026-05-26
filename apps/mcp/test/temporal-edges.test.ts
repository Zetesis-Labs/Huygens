import { describe, expect, test } from 'bun:test'
import { StringRecordId, type Surreal } from 'surrealdb'
import { withFreshDb } from './_fixtures'

/**
 * Historical-topology reconstruction (see ADR-0025).
 *
 * SurrealDB VERSION time-travel cannot rebuild past topology: an unindexed scan
 * returns edges deleted since (false positives); an index-backed filter — what
 * `existingEdgesAmong` uses — misses edges deleted since, because the index only
 * holds current records (false negatives). So the dashboard reconstructs history
 * by replaying the changefeed up to the commit versionstamp instead.
 *
 * Test 1 pins that the replay is correct (it backs the shipped ReplayReader).
 * Test 2 is the TRIPWIRE: it asserts native VERSION still can't do it; when that
 * flips, the engine has gained real temporal scans → switch HUYGENS_TEMPORAL=native.
 */

type Change = { update?: { id?: unknown; in?: unknown; out?: unknown }; delete?: { id?: unknown } }
type Row = { versionstamp: bigint; changes: Change[] }

async function partOfChanges(db: Surreal): Promise<Row[]> {
  const [rows] = await db.query<[Row[]]>('SHOW CHANGES FOR TABLE part_of SINCE d"1970-01-01T00:00:00Z"')
  return rows ?? []
}
function maxVersionstamp(rows: Row[]): bigint {
  return rows.reduce((m, r) => (typeof r.versionstamp === 'bigint' && r.versionstamp > m ? r.versionstamp : m), 0n)
}
/** Replay edge changes up to `upTo` → the live edge set ("in->out") at that point. */
function replay(rows: Row[], upTo: bigint): string[] {
  const live = new Map<string, string>()
  for (const row of rows) {
    if (typeof row.versionstamp === 'bigint' && row.versionstamp > upTo) break
    for (const c of row.changes ?? []) {
      if (c.update?.in != null && c.update.out != null) live.set(String(c.update.id), `${c.update.in}->${c.update.out}`)
      else if (c.delete) live.delete(String(c.delete.id))
    }
  }
  return [...live.values()].sort()
}

describe('historical topology reconstruction (ADR-0025)', () => {
  test('changefeed replay rebuilds a re-parent (old parent then, new parent now)', async () => {
    const ctx = await withFreshDb()
    try {
      const { db } = ctx
      await db.query(`
        CREATE note:he_a SET title = 'a', state = 'ACTIVE';
        CREATE note:he_b SET title = 'b', state = 'ACTIVE';
        CREATE note:he_c SET title = 'c', state = 'ACTIVE';
        RELATE note:he_a->part_of->note:he_b;
      `)
      const vsOld = maxVersionstamp(await partOfChanges(db)) // anchor: while a's parent was b
      await db.query('DELETE part_of WHERE in = note:he_a AND out = note:he_b;')
      await db.query('RELATE note:he_a->part_of->note:he_c;')

      const rows = await partOfChanges(db)
      expect(replay(rows, vsOld)).toEqual(['note:he_a->note:he_b']) // historical: old parent
      expect(replay(rows, maxVersionstamp(rows))).toEqual(['note:he_a->note:he_c']) // current: new parent
    } finally {
      await ctx.cleanup()
    }
  })

  test('TRIPWIRE: native VERSION still cannot reconstruct it (index misses deleted-since edge)', async () => {
    const ctx = await withFreshDb()
    try {
      const { db } = ctx
      const ids = [new StringRecordId('note:tw_a'), new StringRecordId('note:tw_b'), new StringRecordId('note:tw_c')]
      await db.query(`
        CREATE note:tw_a SET title = 'a', state = 'ACTIVE';
        CREATE note:tw_b SET title = 'b', state = 'ACTIVE';
        CREATE note:tw_c SET title = 'c', state = 'ACTIVE';
        RELATE note:tw_a->part_of->note:tw_b;
      `)
      const [t1] = await db.query<[string]>('RETURN <string> time::now();')
      await db.query('DELETE part_of WHERE in = note:tw_a AND out = note:tw_b;')
      await db.query('RELATE note:tw_a->part_of->note:tw_c;')

      const [past] = await db.query<[Array<{ s: string; d: string }>]>(
        `SELECT meta::id(in) AS s, meta::id(out) AS d FROM part_of WHERE in IN $ids AND out IN $ids VERSION d"${t1}"`,
        { ids }
      )
      // Correct would be [tw_a->tw_b]. Native returns [] (the deleted edge left
      // the index). When this stops being empty, the engine can reconstruct
      // temporal table state → switch the dashboard to HUYGENS_TEMPORAL=native.
      expect(past.length).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  })
})
