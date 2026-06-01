import { StringRecordId } from 'surrealdb'
import { getDb } from '../../surreal'
import { idStr } from '../graph-records'
import type { ProposalDetail, ProposalResult, ProposalRow } from './schemas'

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

/**
 * Normalize a stored proposal `result` for transport — just the anchor:
 * `versionstamp` (string) + `committed_at` (ISO). New commits store only this;
 * legacy id-lists/temp_ids (if present) are dropped. Returns null when no result.
 */
export function normalizeResult(result: ProposalResult | null | undefined): ProposalResult | null {
  if (!result) return null
  return {
    versionstamp: result.versionstamp != null ? String(result.versionstamp) : null,
    committed_at: stringifyDate(result.committed_at)
  }
}

export function toProposalDetail(row: ProposalRow): ProposalDetail {
  return {
    id: idStr(row.id),
    status: row.status,
    raw_captures: row.raw_captures.map(idStr),
    payload: row.payload,
    result: normalizeResult(row.result),
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
