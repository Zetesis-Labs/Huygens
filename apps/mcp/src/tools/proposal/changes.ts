import { BLOCK_ID_RE, NOTE_ID_RE, RAW_CAPTURE_ID_RE } from '../../domain'
import { getDb, selectByIds } from '../../surreal'
import { type GraphEdgeRecord, type GraphNodeRecord, idStr, tableOf } from '../graph-records'
import { contextEndpointIds, contextLabel, type MaterializedGraph, mutatedNodeIds } from './context-labels'
import type { GetProposalInput, ProposalPayload, ProposalResult } from './schemas'
import { fetchProposal } from './store'

export type ProposalChanges = {
  proposal_id: string
  status: string
  versionstamp: string | null
  committed_at: string | null
  materialized: MaterializedGraph | null
  changefeed: {
    available: boolean
    versionstamp: string | null
    tables: Record<string, unknown[]>
    note?: string
  }
}

/** Deep-normalize a value to JSON-safe form (changefeed versionstamps are BigInt,
 * which JSON.stringify cannot serialize). BigInt → string; record ids keep their
 * own JSON form. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)))
}

/** Changefeed changesets that belong to exactly this commit's versionstamp. */
async function changefeedAt(table: string, vs: bigint): Promise<unknown[]> {
  const db = await getDb()
  const [rows] = await db.query<[Array<{ versionstamp: bigint }>]>(
    `SHOW CHANGES FOR TABLE ${table} SINCE ${vs - 1n} LIMIT 200`
  )
  const matching = (rows ?? []).filter(change => String(change.versionstamp) === String(vs))
  return jsonSafe(matching)
}

function tablesFromResult(result: ProposalResult): string[] {
  const all = [
    ...result.notes_created,
    ...result.notes_updated,
    ...result.narrative_blocks_created,
    ...result.descriptive_blocks_created,
    ...result.derived_from,
    ...result.about,
    ...result.affects,
    ...result.semantic_edges
  ]
  const tables = new Set<string>(['raw_capture'])
  for (const id of all) {
    const table = tableOf(id)
    if (table) tables.add(table)
  }
  return [...tables]
}

async function materializeResult(result: ProposalResult): Promise<NonNullable<ProposalChanges['materialized']>> {
  return {
    notes_created: await selectByIds<GraphNodeRecord>(result.notes_created),
    notes_updated: await selectByIds<GraphNodeRecord>(result.notes_updated),
    narrative_blocks_created: await selectByIds<GraphNodeRecord>(result.narrative_blocks_created),
    descriptive_blocks_created: await selectByIds<GraphNodeRecord>(result.descriptive_blocks_created),
    derived_from: await selectByIds<GraphEdgeRecord>(result.derived_from),
    about: await selectByIds<GraphEdgeRecord>(result.about),
    affects: await selectByIds<GraphEdgeRecord>(result.affects),
    semantic_edges: await selectByIds<GraphEdgeRecord>(result.semantic_edges)
  }
}

/** Resolve human labels (id → text) for edge endpoints that are *context* —
 * i.e. records referenced by the commit's edges but not created/updated by it
 * (the source raw_capture, a pre-existing parent note). Thin I/O wrapper over
 * the pure helpers in ./context-labels; lets the D2 renderer label endpoints
 * with real text instead of the bare record id. Read-only. */
export async function resolveContextLabels(m: MaterializedGraph): Promise<Record<string, string>> {
  const endpoints = contextEndpointIds(m, mutatedNodeIds(m))
  const labels: Record<string, string> = {}
  for (const row of await selectByIds<GraphNodeRecord>(endpoints)) {
    const label = contextLabel(row)
    if (label) labels[idStr(row.id)] = label
  }
  return labels
}

const isRealRef = (ref: string): boolean => NOTE_ID_RE.test(ref) || BLOCK_ID_RE.test(ref) || RAW_CAPTURE_ID_RE.test(ref)

/** Resolve human labels (id → text) for the *existing* records a draft payload
 * references: the notes it updates, the source raws, and any pre-existing edge
 * endpoint given by real record id. Lets the draft D2 preview show real titles
 * instead of bare ids. Pure read; temp_ids are skipped (they have no record
 * yet — their label comes from the payload itself). */
export async function resolveDraftLabels(payload: ProposalPayload): Promise<Record<string, string>> {
  const ids = new Set<string>()
  for (const note of payload.note_updates) ids.add(note.id)
  for (const block of payload.narrative_blocks) for (const raw of block.raw_ids) ids.add(raw)
  for (const link of payload.about) if (isRealRef(link.note_ref)) ids.add(link.note_ref)
  for (const affect of payload.affects) if (isRealRef(affect.note_ref)) ids.add(affect.note_ref)
  for (const edge of payload.edges) {
    if (isRealRef(edge.from)) ids.add(edge.from)
    if (isRealRef(edge.to)) ids.add(edge.to)
  }
  const labels: Record<string, string> = {}
  for (const row of await selectByIds<GraphNodeRecord>([...ids])) {
    const label = contextLabel(row)
    if (label) labels[idStr(row.id)] = label
  }
  return labels
}

async function changefeedForResult(result: ProposalResult): Promise<ProposalChanges['changefeed']> {
  if (!result.versionstamp) {
    return {
      available: false,
      versionstamp: null,
      tables: {},
      note: 'No versionstamp captured (best-effort changefeed flush); use the materialized view.'
    }
  }
  const vs = BigInt(result.versionstamp)
  const tables: Record<string, unknown[]> = {}
  for (const table of tablesFromResult(result)) {
    const changes = await changefeedAt(table, vs)
    if (changes.length > 0) tables[table] = changes
  }
  return { available: true, versionstamp: result.versionstamp, tables }
}

/**
 * Recover the exact changes a committed proposal produced, two ways:
 * - materialized: the real record ids in proposal.result resolved to records.
 * - changefeed: the literal transaction delta at the commit versionstamp.
 */
export async function getProposalChangesImpl(input: GetProposalInput): Promise<ProposalChanges> {
  const proposal = await fetchProposal(input.proposal_id)
  if (!proposal) throw new Error(`proposal not found: ${input.proposal_id}`)
  const result = proposal.result ?? null
  const base = { proposal_id: idStr(proposal.id), status: proposal.status }
  if (!result) {
    return {
      ...base,
      versionstamp: null,
      committed_at: null,
      materialized: null,
      changefeed: {
        available: false,
        versionstamp: null,
        tables: {},
        note: 'No materialized result: the proposal is not committed, or was committed before this feature.'
      }
    }
  }
  return {
    ...base,
    versionstamp: result.versionstamp,
    committed_at: result.committed_at,
    materialized: await materializeResult(result),
    changefeed: await changefeedForResult(result)
  }
}
