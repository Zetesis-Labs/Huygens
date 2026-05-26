import { getDb, selectByIds } from '../../surreal'
import { type GraphEdgeRecord, type GraphNodeRecord, idStr, tableOf } from '../graph-records'
import type { GetProposalInput, ProposalResult } from './schemas'
import { fetchProposal } from './store'

export type ProposalChanges = {
  proposal_id: string
  status: string
  versionstamp: string | null
  committed_at: string | null
  materialized: {
    notes_created: GraphNodeRecord[]
    notes_updated: GraphNodeRecord[]
    narrative_blocks_created: GraphNodeRecord[]
    descriptive_blocks_created: GraphNodeRecord[]
    derived_from: GraphEdgeRecord[]
    about: GraphEdgeRecord[]
    affects: GraphEdgeRecord[]
    semantic_edges: GraphEdgeRecord[]
  } | null
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
 * (the source raw_capture, a pre-existing parent note). Lets the D2 renderer
 * label them with real text instead of the bare record id. Read-only. */
export async function resolveContextLabels(
  m: NonNullable<ProposalChanges['materialized']>
): Promise<Record<string, string>> {
  const created = new Set<string>()
  for (const node of [...m.notes_created, ...m.notes_updated, ...m.narrative_blocks_created, ...m.descriptive_blocks_created]) {
    created.add(idStr(node.id))
  }
  const endpoints = new Set<string>()
  for (const edge of [...m.derived_from, ...m.about, ...m.affects, ...m.semantic_edges]) {
    for (const id of [idStr(edge.in), idStr(edge.out)]) {
      if (id && !created.has(id)) endpoints.add(id)
    }
  }
  const labels: Record<string, string> = {}
  for (const row of await selectByIds<GraphNodeRecord>([...endpoints])) {
    const id = idStr(row.id)
    if (tableOf(id) === 'raw_capture') {
      labels[id] = `raw · ${row.content ?? ''}`
    } else if (tableOf(id) === 'note') {
      const type = idStr(row.type).replace(/^note_type:/, '')
      const title = row.title ?? ''
      labels[id] = type ? `${type} · ${title}` : title || id
    } else if (tableOf(id) === 'block') {
      labels[id] = `block · ${row.content ?? ''}`
    }
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
