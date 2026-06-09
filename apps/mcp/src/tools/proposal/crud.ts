import type { RecordId, StringRecordId } from 'surrealdb'
import { uuidv7 } from 'uuidv7'
import { type EmitEventInput, emitEvent, newSessionId } from '../../events'
import type { EventKind } from '../../domain'
import { getDb } from '../../surreal'
import {
  type CreateProposalInput,
  type DiscardProposalInput,
  type GetProposalInput,
  type ProposalDetail,
  type ProposalPayload,
  type ProposalRow,
  proposalPayloadSchema,
  type StoredProposalPayload,
  type UpdateProposalInput
} from './schemas'
import { fetchProposal, requireDraftProposal, toProposalDetail, toProposalRef, toRawRef } from './store'
import { assertRawCapturesExist, validatePayload } from './validation'

/** A fresh record id for `table`, alphanumeric (uuidv7 hex, no dashes) so it
 * needs no escaping anywhere. */
function newId(table: 'note' | 'block'): string {
  return `${table}:${uuidv7().replace(/-/g, '')}`
}

/** The `CONTENT` for a freshly-created draft proposal. Pure. */
function buildProposalRecord(payload: StoredProposalPayload): {
  status: string
  raw_captures: StringRecordId[]
  payload: StoredProposalPayload
} {
  return {
    status: 'draft',
    raw_captures: payload.raw_ids.map(toRawRef),
    payload
  }
}

/** The lifecycle event for a proposal (created/updated/discarded), carrying its
 * raw_ids. Pure: the caller supplies the generated session_id and subject id. */
function buildProposalEvent(
  kind: EventKind,
  sessionId: string,
  subject: RecordId,
  rawIds: string[]
): EmitEventInput {
  return {
    kind,
    actor: 'conversational',
    session_id: sessionId,
    subject,
    payload: { raw_ids: rawIds }
  }
}

/**
 * Pure temp→real rewrite of a payload: given the already-built temp_id→real-id
 * `idMap` and an injected `nextBlockId` generator for descriptive blocks, produce
 * the stored payload. Every reference (edges / edges_remove / about / affects) is
 * rewritten via the map; refs that are already real ids pass through untouched.
 * No id generation for notes/narrative blocks here (those come from the map), so a
 * test can inject a deterministic counter and assert the rewrite exhaustively.
 */
export function rewriteReferences(
  input: ProposalPayload,
  idMap: Map<string, string>,
  nextBlockId: () => string
): StoredProposalPayload {
  const real = (ref: string): string => idMap.get(ref) ?? ref

  return {
    raw_ids: input.raw_ids,
    narrative_blocks: input.narrative_blocks.map(b => ({
      id: idMap.get(b.temp_id) as string,
      content: b.content,
      raw_ids: b.raw_ids,
      ...(b.kind ? { kind: b.kind } : {})
    })),
    note_creates: input.note_creates.map(n => ({
      id: idMap.get(n.temp_id) as string,
      type_slug: n.type_slug,
      title: n.title,
      state: n.state,
      ...(n.mit_for !== undefined ? { mit_for: n.mit_for } : {}),
      ...(n.due_at !== undefined ? { due_at: n.due_at } : {}),
      ...(n.defer_until !== undefined ? { defer_until: n.defer_until } : {}),
      ...(n.metadata !== undefined ? { metadata: n.metadata } : {}),
      // Pre-assign a stable real id to every descriptive block (like notes and
      // narrative blocks) so replay/rebuild reproduces them id-identical instead
      // of regenerating fresh ids each time.
      descriptive_blocks: n.descriptive_blocks.map(b => ({ id: nextBlockId(), content: b.content }))
    })),
    note_updates: input.note_updates.map(u => ({
      id: u.id,
      ...(u.title !== undefined ? { title: u.title } : {}),
      ...(u.state !== undefined ? { state: u.state } : {}),
      ...(u.mit_for !== undefined ? { mit_for: u.mit_for } : {}),
      ...(u.due_at !== undefined ? { due_at: u.due_at } : {}),
      ...(u.defer_until !== undefined ? { defer_until: u.defer_until } : {}),
      ...(u.metadata_merge !== undefined ? { metadata_merge: u.metadata_merge } : {}),
      descriptive_blocks_append: u.descriptive_blocks_append.map(b => ({ id: nextBlockId(), content: b.content }))
    })),
    edges: input.edges.map(e => ({
      kind: e.kind,
      from: real(e.from),
      to: real(e.to),
      ...(e.reason !== undefined ? { reason: e.reason } : {}),
      ...(e.anchored !== undefined ? { anchored: e.anchored } : {})
    })),
    edges_remove: input.edges_remove.map(e => ({ kind: e.kind, from: real(e.from), to: real(e.to) })),
    about: input.about.map(a => ({ block_id: real(a.block_temp_id), note_id: real(a.note_ref) })),
    affects: input.affects.map(a => ({
      block_id: real(a.block_temp_id),
      note_id: real(a.note_ref),
      action: a.action,
      ...(a.summary !== undefined ? { summary: a.summary } : {})
    }))
  }
}

/**
 * Realize an input payload into the stored one (máximo-limpio): every new note
 * and narrative block gets a real record id up front, and EVERY reference
 * (edges / edges_remove / about / affects) is rewritten temp→real. The persisted
 * payload speaks only real ids — no temp_id, no bridge. Refs that are already
 * real ids pass through untouched.
 */
export function realizePayload(input: ProposalPayload): StoredProposalPayload {
  const map = new Map<string, string>([
    ...input.note_creates.map(n => [n.temp_id, newId('note')] as const),
    ...input.narrative_blocks.map(b => [b.temp_id, newId('block')] as const)
  ])
  return rewriteReferences(input, map, () => newId('block'))
}

export async function createProposalImpl(input: CreateProposalInput): Promise<ProposalDetail> {
  const db = await getDb()
  const input2 = validatePayload(input.raw_ids, proposalPayloadSchema.parse(input.payload))
  await assertRawCapturesExist(input2.raw_ids)
  const payload = realizePayload(input2)

  const data = buildProposalRecord(payload)
  const [rows] = await db.query<[ProposalRow[]]>('CREATE proposal CONTENT $data RETURN AFTER', { data })
  const proposal = rows[0]
  if (!proposal) throw new Error('create_proposal: insert returned no record')

  await emitEvent(buildProposalEvent('proposal_created', newSessionId(), proposal.id, payload.raw_ids))

  return toProposalDetail(proposal)
}

export async function updateProposalImpl(input: UpdateProposalInput): Promise<ProposalDetail> {
  const db = await getDb()
  const input2 = validatePayload(input.payload.raw_ids, proposalPayloadSchema.parse(input.payload))
  await assertRawCapturesExist(input2.raw_ids)
  await requireDraftProposal(input.proposal_id)
  const payload = realizePayload(input2)

  const [rows] = await db.query<[ProposalRow[]]>(
    'UPDATE $id SET raw_captures = $raw_captures, payload = $payload RETURN AFTER',
    {
      id: toProposalRef(input.proposal_id),
      raw_captures: payload.raw_ids.map(toRawRef),
      payload
    }
  )
  const proposal = rows[0]
  if (!proposal) throw new Error(`proposal not found: ${input.proposal_id}`)

  await emitEvent(buildProposalEvent('proposal_updated', newSessionId(), proposal.id, payload.raw_ids))

  return toProposalDetail(proposal)
}

export async function getProposalImpl(input: GetProposalInput): Promise<ProposalDetail | null> {
  const proposal = await fetchProposal(input.proposal_id)
  return proposal ? toProposalDetail(proposal) : null
}

export async function discardProposalImpl(input: DiscardProposalInput): Promise<ProposalDetail> {
  const db = await getDb()
  await requireDraftProposal(input.proposal_id)
  const [rows] = await db.query<[ProposalRow[]]>("UPDATE $id SET status = 'discarded' RETURN AFTER", {
    id: toProposalRef(input.proposal_id)
  })
  const proposal = rows[0]
  if (!proposal) throw new Error(`proposal not found: ${input.proposal_id}`)

  await emitEvent(buildProposalEvent('proposal_discarded', newSessionId(), proposal.id, proposal.payload.raw_ids))

  return toProposalDetail(proposal)
}
