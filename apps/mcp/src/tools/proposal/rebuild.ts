import { getDb } from '../../surreal'
import { buildReplayTx } from './commit'
import type { ProposalRow } from './schemas'

// Tables that are a PROJECTION of the committed proposals — wiped and re-derived
// by rebuildGraph(). The log (proposal, raw_capture, agent_event) and the config
// (note_type) are NOT touched: they are the source of truth.
const PROJECTION_TABLES = [
  'part_of',
  'blocked_by',
  'depends_on',
  'owned_by',
  'relates_to',
  'duplicates',
  'mentions', // legacy replay compatibility only
  'about',
  'affects',
  'derived_from',
  'block',
  'note'
] as const

export type RebuildResult = { replayed: number; tablesWiped: readonly string[] }
export type RebuildOptions = {
  /** Acknowledge that this rebuild will FLATTEN edge provenance (see the guard in
   * rebuildGraphImpl). Required to run while the rebuild path is not yet
   * provenance-preserving. Default false → the rebuild refuses. */
  allowProvenanceFlattening?: boolean
}

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
export async function rebuildGraphImpl(opts: RebuildOptions = {}): Promise<RebuildResult> {
  const db = await getDb()

  // SAFETY GUARD (M1 — auditability). Replaying the log re-creates every edge with
  // `via_proposal` set to the proposal being replayed. But the genesis snapshot
  // (genesis.ts buildGenesisPayload) reads only `in`/`out` — it does NOT carry each
  // edge's original `via_proposal`. So a rebuild today re-stamps ALL pre-genesis
  // topology with `proposal:genesis`, collapsing real per-edge provenance into one
  // synthetic event — destroying the audit invariant the whole proposal machinery
  // exists to uphold. Until the rebuild path is provenance-preserving (carry
  // via_proposal through genesis + replay, and backfill legacy edges with an explicit
  // marker), refuse by default. The caller must deliberately accept the loss.
  if (!opts.allowProvenanceFlattening) {
    throw new Error(
      'rebuildGraph is blocked: replaying the current log would flatten every edge’s ' +
        'via_proposal onto the genesis proposal, destroying real per-edge provenance (the ' +
        'system’s core audit invariant). Make the rebuild path provenance-preserving first ' +
        '(carry via_proposal through genesis/replay + backfill legacy edges with an explicit ' +
        'marker), or pass { allowProvenanceFlattening: true } to override deliberately.'
    )
  }

  const [rows] = await db.query<[ProposalRow[]]>(
    "SELECT *, result.committed_at AS _ca FROM proposal WHERE status = 'committed' ORDER BY _ca ASC"
  )
  const committed = rows ?? []
  for (const table of PROJECTION_TABLES) await db.query(`DELETE ${table}`)
  for (const p of committed) {
    const { query, params } = buildReplayTx(p.payload, String(p.id))
    await db.query(query, params)
  }
  return { replayed: committed.length, tablesWiped: PROJECTION_TABLES }
}
