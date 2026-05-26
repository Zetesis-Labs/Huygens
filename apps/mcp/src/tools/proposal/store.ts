import { StringRecordId } from 'surrealdb'
import { getDb } from '../../surreal'
import type { ProposalDetail, ProposalRow } from './schemas'

export function toRawRef(rawId: string): StringRecordId {
  return new StringRecordId(rawId)
}

export function toProposalRef(proposalId: string): StringRecordId {
  return new StringRecordId(proposalId)
}

export function toNoteRef(noteId: string): StringRecordId {
  return new StringRecordId(noteId)
}

export function toBlockRef(blockId: string): StringRecordId {
  return new StringRecordId(blockId)
}

function stringifyDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

export function toProposalDetail(row: ProposalRow): ProposalDetail {
  return {
    id: String(row.id),
    status: row.status,
    raw_captures: row.raw_captures.map(String),
    payload: row.payload,
    result: row.result ?? null,
    created_at: stringifyDate(row.created_at),
    updated_at: stringifyDate(row.updated_at)
  }
}

export async function fetchProposal(proposalId: string): Promise<ProposalRow | null> {
  const db = await getDb()
  const [rows] = await db.query<[ProposalRow[]]>('SELECT * FROM proposal WHERE id = $id', {
    id: toProposalRef(proposalId)
  })
  return rows[0] ?? null
}

export async function requireDraftProposal(proposalId: string): Promise<ProposalRow> {
  const proposal = await fetchProposal(proposalId)
  if (!proposal) throw new Error(`proposal not found: ${proposalId}`)
  if (proposal.status !== 'draft') throw new Error(`proposal is not draft: ${proposal.status}`)
  return proposal
}
