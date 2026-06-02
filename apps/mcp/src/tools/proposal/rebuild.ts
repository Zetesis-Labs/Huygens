import { getDb } from '../../surreal'
import { buildReplayTx } from './commit'
import type { ProposalRow } from './schemas'

// Tables that are a PROJECTION of the committed proposals — wiped and re-derived
// by rebuildGraph(). The log (proposal, raw_capture, agent_event) and the config
// (note_type) are NOT touched: they are the source of truth.
const PROJECTION_TABLES = [
  'part_of',
  'blocked_by',
  'mentions',
  'about',
  'affects',
  'derived_from',
  'block',
  'note'
] as const

export type RebuildResult = { replayed: number; tablesWiped: readonly string[] }

/**
 * Re-derive the live graph from the log: wipe the projection tables, then replay
 * every committed proposal's graph mutations in commit order. The graph is a pure
 * function of the committed proposals — so any out-of-band mutation is wiped here
 * by construction. Read-only against the log; destructive on the projection.
 *
 * Caveats (see ADR-0028 / Phase 2): descriptive-block ids are regenerated (they
 * aren't pre-assigned in the payload), and graph metadata timestamps
 * (updated_at/topologized_at) become rebuild-time — the graph is a cache. The
 * authoritative `committed_at` lives on the proposal, untouched. Embeddings are
 * NOT rebuilt (re-run index_block afterwards).
 */
export async function rebuildGraphImpl(): Promise<RebuildResult> {
  const db = await getDb()
  const [rows] = await db.query<[ProposalRow[]]>(
    "SELECT *, result.committed_at AS _ca FROM proposal WHERE status = 'committed' ORDER BY _ca ASC"
  )
  const committed = rows ?? []
  for (const table of PROJECTION_TABLES) await db.query(`DELETE ${table}`)
  for (const p of committed) {
    const { query, params } = buildReplayTx(p.payload)
    await db.query(query, params)
  }
  return { replayed: committed.length, tablesWiped: PROJECTION_TABLES }
}
