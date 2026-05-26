import { StringRecordId } from 'surrealdb'
import { getDb } from '../../surreal'
import { idStr, type RecordIdish } from '../graph-records'
import type { ProposalDetail, ProposalResult, ProposalRow, TempIdMap } from './schemas'

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

function idStrMap(obj: Record<string, RecordIdish> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj ?? {})) out[key] = idStr(value)
  return out
}

/**
 * Normalize a stored proposal `result` for transport: every id (arrays and the
 * temp_id maps) becomes a plain string, the versionstamp a string, committed_at
 * an ISO string. The field values are RecordId/Date at runtime even though the
 * type says string. Legacy results committed before temp_ids existed get empty
 * maps. Returns null when there is no result.
 */
export function normalizeResult(result: ProposalResult | null | undefined): ProposalResult | null {
  if (!result) return null
  const ids = (xs?: RecordIdish[]): string[] => (xs ?? []).map(idStr)
  return {
    notes_created: ids(result.notes_created),
    notes_updated: ids(result.notes_updated),
    narrative_blocks_created: ids(result.narrative_blocks_created),
    descriptive_blocks_created: ids(result.descriptive_blocks_created),
    derived_from: ids(result.derived_from),
    about: ids(result.about),
    affects: ids(result.affects),
    semantic_edges: ids(result.semantic_edges),
    temp_ids: {
      notes: idStrMap(result.temp_ids?.notes as Record<string, RecordIdish> | undefined),
      blocks: idStrMap(result.temp_ids?.blocks as Record<string, RecordIdish> | undefined)
    } satisfies TempIdMap,
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
