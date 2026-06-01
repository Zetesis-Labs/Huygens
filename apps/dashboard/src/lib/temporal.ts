import { type ExistingEdge, type Proposal, replayEdgesAmong, scanEdgesAmongAt } from './surreal'

/**
 * The point in history a committed proposal landed: its transaction versionstamp
 * (anchor for changefeed replay) + commit timestamp (anchor for VERSION-by-id).
 */
export type CommitAnchor = { versionstamp: string; committedAt: string }

/**
 * Extract the commit anchor from a proposal, or null when it can't be
 * time-travelled — a draft (not committed yet → live view is correct), or a
 * commit with no versionstamp captured (falls back to live).
 */
export function commitAnchor(p: Proposal): CommitAnchor | null {
  if (p.status !== 'committed') return null
  const vs = p.result?.versionstamp
  const ca = p.result?.committed_at
  if (vs == null || ca == null) return null
  const committedAt = ca instanceof Date ? ca.toISOString() : String(ca)
  return { versionstamp: String(vs), committedAt }
}

/**
 * Reads the pre-existing topology as of a commit. Two implementations behind one
 * seam: the day SurrealDB fixes VERSION-scan we flip a flag instead of rewriting
 * the viewer (see ADR-0025/0028). The label/node side always uses VERSION-by-id,
 * which already works, so only the edge side needs swapping.
 */
export interface TemporalEdgeReader {
  edgesAmongAt(ids: string[], anchor: CommitAnchor): Promise<ExistingEdge[]>
}

// Works on the current engine (v3.0.5): replay the changefeed up to the commit.
const replayReader: TemporalEdgeReader = {
  edgesAmongAt: (ids, anchor) => replayEdgesAmong(ids, anchor.versionstamp)
}

// Native VERSION-scan: correct only once the engine bug is fixed (#7245 family).
const nativeReader: TemporalEdgeReader = {
  edgesAmongAt: (ids, anchor) => scanEdgesAmongAt(ids, anchor.committedAt)
}

/**
 * The active topology reader. `replay` (default) is correct on the current
 * engine; set `HUYGENS_TEMPORAL=native` to switch to engine-native VERSION-scan
 * once the regression tripwire goes green (the engine fix has shipped).
 */
export function edgeReader(): TemporalEdgeReader {
  return process.env.HUYGENS_TEMPORAL === 'native' ? nativeReader : replayReader
}
