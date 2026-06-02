import { foldTopology, mergeExistingEdges, proposalToFlow } from './graph'
import { type LaidOutGraph, layoutGraph } from './layout'
import { existingEdgesAmong, getProposal, listCommittedProposalsBefore, resolveLabels } from './surreal'
import { commitTime } from './temporal'

export type ProposalView = {
  proposal: Awaited<ReturnType<typeof getProposal>>
  laidOut: LaidOutGraph
  historical: boolean
  narratives: string[]
  counts: { creates: number; updates: number; edges: number; raws: number } | null
}

// Builds the full graph view for a single proposal. The proposal's own graph
// comes from its payload (real ids). For a committed proposal, the pre-existing
// topology is reconstructed *as of the commit* by **folding the SSOT** — the
// payloads of every proposal committed before it (foldTopology) — with no
// changefeed/VERSION dependency, so it's permanent and coherent with the Diario.
// `mergeExistingEdges` then keeps only the edges among this proposal's nodes.
// Labels use the current/live titles (resolveLabels): titles rarely change, and
// dropping VERSION removes the last volatile dependency. Drafts render live.
export async function buildProposalView(id: string): Promise<ProposalView> {
  const proposal = await getProposal(id)
  if (!proposal) {
    return { proposal: null, laidOut: { nodes: [], edges: [] }, historical: false, narratives: [], counts: null }
  }

  const committedAt = commitTime(proposal)
  const historical = committedAt != null
  const labels = await resolveLabels(proposal)
  const flow = proposalToFlow(proposal.payload, labels)
  const realIds = flow.nodes.map(n => n.id).filter(nid => nid.includes(':'))
  const existing = committedAt
    ? foldTopology(await listCommittedProposalsBefore(committedAt))
    : await existingEdgesAmong(realIds)
  const laidOut = await layoutGraph(mergeExistingEdges(flow, existing))

  const narratives = proposal.payload.narrative_blocks.map(b => b.content)
  const counts = {
    creates: proposal.payload.note_creates.length,
    updates: proposal.payload.note_updates.length,
    edges: proposal.payload.edges.length,
    raws: proposal.payload.raw_ids.length
  }

  return { proposal, laidOut, historical, narratives, counts }
}
