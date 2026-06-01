import type { Proposal } from './surreal'

/**
 * How a proposal's graph is contextualised, and why. The anchor is `committed_at`
 * (always present on a materialized commit) — not the changefeed versionstamp,
 * which was unreliable on SurrealDB 3.0.5 (see ADR-0025). The historical topology
 * is rebuilt from the SSOT (`proposal.result`) by folding earlier proposals'
 * payloads; see `buildProposalView` + `foldTopology`.
 *
 *  - `historical`: committed, with a materialized result → exact context at the
 *    commit (labels via VERSION-by-id, topology via the SSOT fold).
 *  - `degraded`:   committed but pre-materialization (no result/committed_at) →
 *    the fold can't remap its temp ids, so we fall back to the live graph and say so.
 *  - `live`:       a draft → the live graph *is* its context.
 */
export type TemporalState = 'historical' | 'degraded' | 'live'

/** Commit instant (ISO) of a committed, materialized proposal, else null. */
export function commitTime(p: Proposal): string | null {
  if (p.status !== 'committed') return null
  const ca = p.result?.committed_at
  if (ca == null) return null
  return ca instanceof Date ? ca.toISOString() : String(ca)
}

export function temporalState(p: Proposal): TemporalState {
  if (p.status !== 'committed') return 'live'
  return commitTime(p) != null ? 'historical' : 'degraded'
}
