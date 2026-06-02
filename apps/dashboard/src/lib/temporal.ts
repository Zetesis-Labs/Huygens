import type { Proposal } from './surreal'

/**
 * Commit instant (ISO) of a committed proposal, else null. It's the time anchor
 * for reconstructing the proposal's historical context by **folding the SSOT**
 * (the payloads of earlier committed proposals) — no changefeed, no versionstamp.
 * See `buildProposalView` + `foldTopology`. A draft (null) renders against the
 * live graph, which is correct (nothing committed yet).
 */
export function commitTime(p: Proposal): string | null {
  if (p.status !== 'committed') return null
  const ca = p.result?.committed_at
  if (ca == null) return null
  return ca instanceof Date ? ca.toISOString() : String(ca)
}
