import { emitEvent, newSessionId } from '../../events'
import { getDb } from '../../surreal'
import {
  type CreateProposalInput,
  type DiscardProposalInput,
  type GetProposalInput,
  type ProposalDetail,
  type ProposalRow,
  type UpdateProposalInput,
  proposalPayloadSchema
} from './schemas'
import { fetchProposal, requireDraftProposal, toProposalDetail, toProposalRef, toRawRef } from './store'
import { assertRawCapturesExist, validatePayload } from './validation'

export async function createProposalImpl(input: CreateProposalInput): Promise<ProposalDetail> {
  const db = await getDb()
  const payload = validatePayload(input.raw_ids, proposalPayloadSchema.parse(input.payload))
  await assertRawCapturesExist(payload.raw_ids)

  const data = {
    status: 'draft',
    raw_captures: payload.raw_ids.map(toRawRef),
    payload
  }
  const [rows] = await db.query<[ProposalRow[]]>('CREATE proposal CONTENT $data RETURN AFTER', { data })
  const proposal = rows[0]
  if (!proposal) throw new Error('create_proposal: insert returned no record')

  await emitEvent({
    kind: 'proposal_created',
    actor: 'conversational',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: payload.raw_ids }
  })

  return toProposalDetail(proposal)
}

export async function updateProposalImpl(input: UpdateProposalInput): Promise<ProposalDetail> {
  const db = await getDb()
  const payload = proposalPayloadSchema.parse(input.payload)
  validatePayload(payload.raw_ids, payload)
  await assertRawCapturesExist(payload.raw_ids)
  await requireDraftProposal(input.proposal_id)

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

  await emitEvent({
    kind: 'proposal_updated',
    actor: 'conversational',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: payload.raw_ids }
  })

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

  await emitEvent({
    kind: 'proposal_discarded',
    actor: 'conversational',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: proposal.payload.raw_ids }
  })

  return toProposalDetail(proposal)
}
