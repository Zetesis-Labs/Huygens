import { mergeExistingEdges, proposalToFlow } from './graph'
import { type LaidOutGraph, layoutGraph } from './layout'
import { existingEdgesAmong, getProposal, labelsAtVersion, resolveLabels } from './surreal'
import { commitAnchor, edgeReader } from './temporal'

export type ProposalView = {
  proposal: Awaited<ReturnType<typeof getProposal>>
  laidOut: LaidOutGraph
  historical: boolean
  narratives: string[]
  counts: { creates: number; updates: number; edges: number; raws: number } | null
}

// Builds the full graph view for a single proposal. A committed proposal with a
// commit anchor is rendered in its *exact historical context*: labels via
// VERSION-by-id and pre-existing topology via changefeed replay, both as of the
// commit (the changefeed is the history — see ADR-0028). Drafts (and commits with
// no versionstamp anchor) fall back to the live graph.
export async function buildProposalView(id: string): Promise<ProposalView> {
  const proposal = await getProposal(id)
  if (!proposal) {
    return { proposal: null, laidOut: { nodes: [], edges: [] }, historical: false, narratives: [], counts: null }
  }

  const anchor = commitAnchor(proposal)
  const historical = anchor != null
  const labels = anchor ? await labelsAtVersion(proposal, anchor.committedAt) : await resolveLabels(proposal)
  const flow = proposalToFlow(proposal.payload, labels)
  const realIds = flow.nodes.map(n => n.id).filter(nid => nid.includes(':'))
  const existing = anchor ? await edgeReader().edgesAmongAt(realIds, anchor) : await existingEdgesAmong(realIds)
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
