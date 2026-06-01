import { getDb } from '../../surreal'
import { idStr } from '../graph-records'
import type { GetProposalInput } from './schemas'
import { fetchProposal } from './store'

export type ProposalChanges = {
  proposal_id: string
  status: string
  versionstamp: string | null
  committed_at: string | null
  changefeed: {
    available: boolean
    versionstamp: string | null
    tables: Record<string, unknown[]>
    note?: string
  }
}

// Every table whose mutations a commit can produce — scanned for the commit's
// changeset. The proposal stores only the anchor, so the change detail (before→
// after) is read here from the changefeed.
const CRITICAL_TABLES = [
  'note',
  'block',
  'raw_capture',
  'part_of',
  'blocked_by',
  'mentions',
  'about',
  'affects',
  'derived_from'
] as const

/** Deep-normalize to JSON-safe form (changefeed versionstamps are BigInt). */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)))
}

/**
 * The changeset of one commit on `table`: `SHOW CHANGES … SINCE d"<datetime>"`
 * (datetime SINCE, **no LIMIT** — both `LIMIT` and low-versionstamp SINCE are
 * broken on 3.0.5), anchored a second before the commit, then filtered to the
 * commit's versionstamp.
 */
async function changefeedAt(table: string, vs: string, sinceIso: string): Promise<unknown[]> {
  const db = await getDb()
  const [rows] = await db.query<[Array<{ versionstamp: unknown; changes: unknown[] }>]>(
    `SHOW CHANGES FOR TABLE ${table} SINCE d"${sinceIso}"`
  )
  const matching = (rows ?? []).filter(row => row.versionstamp != null && String(row.versionstamp) === vs)
  return jsonSafe(matching.flatMap(row => row.changes ?? []))
}

/**
 * Recover the exact changes a committed proposal produced, from the changefeed
 * at the commit versionstamp (the proposal's `result` is only the anchor). The
 * payload (real ids) is the intent; this is the literal before→after delta.
 */
export async function getProposalChangesImpl(input: GetProposalInput): Promise<ProposalChanges> {
  const proposal = await fetchProposal(input.proposal_id)
  if (!proposal) throw new Error(`proposal not found: ${input.proposal_id}`)
  const result = proposal.result ?? null
  const base = { proposal_id: idStr(proposal.id), status: proposal.status }

  if (!result?.versionstamp || !result.committed_at) {
    return {
      ...base,
      versionstamp: result?.versionstamp ?? null,
      committed_at: result?.committed_at ?? null,
      changefeed: {
        available: false,
        versionstamp: null,
        tables: {},
        note: result
          ? 'No versionstamp anchor: committed before the changefeed refactor or the anchor was not captured.'
          : 'Not committed.'
      }
    }
  }

  // Anchor the SHOW CHANGES a second before the commit instant.
  const sinceIso = new Date(Date.parse(result.committed_at) - 1000).toISOString()
  const tables: Record<string, unknown[]> = {}
  for (const table of CRITICAL_TABLES) {
    const changes = await changefeedAt(table, result.versionstamp, sinceIso)
    if (changes.length > 0) tables[table] = changes
  }
  return {
    ...base,
    versionstamp: result.versionstamp,
    committed_at: result.committed_at,
    changefeed: { available: true, versionstamp: result.versionstamp, tables }
  }
}
