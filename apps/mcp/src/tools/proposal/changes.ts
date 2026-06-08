import { idStr } from '../graph-records'
import type { GetProposalInput, StoredProposalPayload } from './schemas'
import { fetchProposal } from './store'

export type ProposalChanges = {
  proposal_id: string
  status: string
  committed_at: string | null
  /** Where the delta comes from: the proposal payload (SSOT), not the changefeed. */
  source: 'payload'
  changes: {
    notes_created: {
      id: string
      type_slug: string
      title: string
      state: string
      mit_for?: string
      due_at?: string
      defer_until?: string
    }[]
    notes_updated: { id: string; fields: string[]; descriptive_blocks_appended: number }[]
    narrative_blocks: { id: string; raw_ids: string[] }[]
    descriptive_blocks_created: number
    edges_added: { kind: string; from: string; to: string }[]
    edges_removed: { kind: string; from: string; to: string }[]
    about: { block_id: string; note_id: string }[]
    affects: { block_id: string; note_id: string; action: string }[]
    raws_processed: string[]
  }
}

function updatedFields(u: StoredProposalPayload['note_updates'][number]): string[] {
  const f: string[] = []
  if (u.title != null) f.push('title')
  if (u.state != null) f.push('state')
  if (u.mit_for !== undefined) f.push('mit_for')
  if (u.due_at !== undefined) f.push('due_at')
  if (u.defer_until !== undefined) f.push('defer_until')
  if (u.metadata_merge != null) f.push('metadata')
  return f
}

function summarize(payload: StoredProposalPayload): ProposalChanges['changes'] {
  // Defensive: legacy / genesis-era payloads predate some of these arrays (notably
  // `edges_remove`), so the keys may be absent. Default every array to [] — a
  // missing key must yield "no changes of that kind", never a `.map of undefined`
  // crash. This is what made the tool unusable for the bulk of the history (the
  // superseded proposals whose payloads have no `edges_remove`).
  return {
    notes_created: (payload.note_creates ?? []).map(n => ({
      id: n.id,
      type_slug: n.type_slug,
      title: n.title,
      state: n.state,
      ...(n.mit_for !== undefined ? { mit_for: n.mit_for } : {}),
      ...(n.due_at !== undefined ? { due_at: n.due_at } : {}),
      ...(n.defer_until !== undefined ? { defer_until: n.defer_until } : {})
    })),
    notes_updated: (payload.note_updates ?? []).map(u => ({
      id: u.id,
      fields: updatedFields(u),
      descriptive_blocks_appended: u.descriptive_blocks_append?.length ?? 0
    })),
    narrative_blocks: (payload.narrative_blocks ?? []).map(b => ({ id: b.id, raw_ids: b.raw_ids ?? [] })),
    descriptive_blocks_created: (payload.note_creates ?? []).reduce(
      (n, c) => n + (c.descriptive_blocks?.length ?? 0),
      0
    ),
    edges_added: (payload.edges ?? []).map(e => ({ kind: e.kind, from: e.from, to: e.to })),
    edges_removed: (payload.edges_remove ?? []).map(e => ({ kind: e.kind, from: e.from, to: e.to })),
    about: (payload.about ?? []).map(a => ({ block_id: a.block_id, note_id: a.note_id })),
    affects: (payload.affects ?? []).map(a => ({ block_id: a.block_id, note_id: a.note_id, action: a.action })),
    raws_processed: payload.raw_ids ?? []
  }
}

/**
 * The delta a proposal applies, read straight from its payload — the SSOT. The
 * stored payload (real ids) IS the set of mutations: notes created/updated, blocks,
 * edges added/removed, topology. No changefeed dependency, so it's durable (survives
 * EXPORT/IMPORT and engine-format upgrades) and works identically for any proposal,
 * including the genesis. `committed_at` is the commit anchor (null if not committed).
 */
export async function getProposalChangesImpl(input: GetProposalInput): Promise<ProposalChanges> {
  const proposal = await fetchProposal(input.proposal_id)
  if (!proposal) throw new Error(`proposal not found: ${input.proposal_id}`)
  const ca: unknown = proposal.result?.committed_at
  return {
    proposal_id: idStr(proposal.id),
    status: proposal.status,
    committed_at: ca == null ? null : ca instanceof Date ? ca.toISOString() : String(ca),
    source: 'payload',
    changes: summarize(proposal.payload)
  }
}
