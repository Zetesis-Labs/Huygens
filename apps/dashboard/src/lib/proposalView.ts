import { foldTopology, mergeExistingEdges, proposalToFlow } from './graph'
import { type LaidOutGraph, layoutGraph } from './layout'
import {
  existingEdgesAmong,
  getProposal,
  labelsAtVersion,
  listCommittedProposalsBefore,
  resolveLabels
} from './surreal'
import { commitTime, type TemporalState, temporalState } from './temporal'

export type ProposalView = {
  proposal: Awaited<ReturnType<typeof getProposal>>
  laidOut: LaidOutGraph
  temporal: TemporalState
  narratives: string[]
  counts: { creates: number; updates: number; edges: number; raws: number } | null
}

// Builds the full graph view for a single proposal. A committed proposal is shown
// in its *exact historical context*: labels via VERSION-by-id, and pre-existing
// topology reconstructed from the SSOT — folding every proposal committed before
// it (foldTopology), with no changefeed dependency. Drafts (and pre-materialization
// commits that can't be folded) fall back to the live graph, flagged via `temporal`.
// Extracted from proposals/[id].astro so the unified home view can reuse it.
export async function buildProposalView(id: string): Promise<ProposalView> {
  const proposal = await getProposal(id)
  if (!proposal) {
    return { proposal: null, laidOut: { nodes: [], edges: [] }, temporal: 'live', narratives: [], counts: null }
  }

  const temporal = temporalState(proposal)
  const at = commitTime(proposal)
  const historical = temporal === 'historical' && at != null

  const labels = historical ? await labelsAtVersion(proposal, at) : await resolveLabels(proposal)
  const flow = proposalToFlow(proposal.payload, labels)
  const realIds = flow.nodes.map(n => n.id).filter(nid => nid.includes(':'))

  // Pre-existing topology: historical → fold the SSOT of every earlier commit
  // (mergeExistingEdges then keeps only the edges among this proposal's nodes);
  // live/degraded → the current edge set among those nodes.
  const existing = historical
    ? foldTopology(await listCommittedProposalsBefore(at, proposal.id))
    : await existingEdgesAmong(realIds)
  const laidOut = await layoutGraph(mergeExistingEdges(flow, existing))

  const narratives = proposal.payload.narrative_blocks.map(b => b.content)
  const counts = {
    creates: proposal.payload.note_creates.length,
    updates: proposal.payload.note_updates.length,
    edges: proposal.payload.edges.length,
    raws: proposal.payload.raw_ids.length
  }

  return { proposal, laidOut, temporal, narratives, counts }
}
