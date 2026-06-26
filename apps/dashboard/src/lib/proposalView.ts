import { foldTopology, mergeExistingEdges, proposalToFlow } from './graph'
import { type LaidOutGraph, layoutGraph } from './layout'
import { withNodeChangeHistory } from './nodeHistory'
import { existingEdgesAmong, getProposal, listCommittedProposalsBefore, resolveLabels } from './surreal'
import { commitTime } from './temporal'

export type ProposalView = {
  proposal: Awaited<ReturnType<typeof getProposal>>
  laidOut: LaidOutGraph
  historical: boolean
  /** Legacy (pre-máximo-limpio) payload: temp_ids, no real ids. Flattened into the
   * genesis (status 'superseded'). We render the narrative but not the graph. */
  legacy: boolean
  narratives: string[]
  counts: { creates: number; updates: number; edges: number; raws: number } | null
}

// A legacy payload carries temp_ids, not the real ids the graph builders read via
// `.id` — drawing it would crash. Those proposals were flattened into the genesis.
function isLegacyPayload(payload: { narrative_blocks: { id?: string }[]; note_creates: { id?: string }[] }): boolean {
  return payload.narrative_blocks.some(b => b.id == null) || payload.note_creates.some(n => n.id == null)
}

// Builds the full graph view for a single proposal. The proposal's own graph
// comes from its payload (real ids). For a committed proposal, the pre-existing
// topology is reconstructed *as of the commit* by **folding the SSOT** — the
// payloads of every proposal committed before it (foldTopology) — with no
// changefeed/VERSION dependency, so it's permanent and coherent with the Diario.
// `mergeExistingEdges` then keeps only the edges among this proposal's nodes.
// Labels use the current/live titles (resolveLabels): titles rarely change, and
// dropping VERSION removes the last volatile dependency. Drafts render live.
// Legacy/superseded proposals (temp_id payloads) render narrative-only, no graph.
export async function buildProposalView(id: string): Promise<ProposalView> {
  const proposal = await getProposal(id)
  if (!proposal) {
    return {
      proposal: null,
      laidOut: { nodes: [], edges: [] },
      historical: false,
      legacy: false,
      narratives: [],
      counts: null
    }
  }

  const narratives = proposal.payload.narrative_blocks.map(b => b.content)
  const counts = {
    creates: proposal.payload.note_creates.length,
    updates: proposal.payload.note_updates.length,
    edges: proposal.payload.edges.length,
    raws: proposal.payload.raw_ids.length
  }

  // Legacy/superseded: no real ids → don't build the graph (proposalToFlow reads `.id`).
  if (proposal.status === 'superseded' || isLegacyPayload(proposal.payload)) {
    const historical = commitTime(proposal) != null
    return { proposal, laidOut: { nodes: [], edges: [] }, historical, legacy: true, narratives, counts }
  }

  const committedAt = commitTime(proposal)
  const historical = committedAt != null
  const labels = await resolveLabels(proposal)
  const flow = proposalToFlow(proposal.payload, labels)
  const realIds = flow.nodes.map(n => n.id).filter(nid => nid.includes(':'))
  const existing = committedAt
    ? foldTopology(await listCommittedProposalsBefore(committedAt))
    : await existingEdgesAmong(realIds)
  const laidOut = await withNodeChangeHistory(await layoutGraph(mergeExistingEdges(flow, existing)))

  return { proposal, laidOut, historical, legacy: false, narratives, counts }
}
