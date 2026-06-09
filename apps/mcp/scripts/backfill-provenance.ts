import { type RecordId, StringRecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'

/**
 * ONE-SHOT migration: stamp `via_proposal` on every legacy edge (created before
 * the field existed, hence via_proposal = NONE). Each edge is attributed to the
 * committed proposal whose payload actually declared it:
 *   - genesis-era edges  -> proposal:genesis (the accepted bootstrap snapshot)
 *   - post-genesis edges  -> their REAL committed proposal (recovered by matching
 *     (kind, in, out) against each committed proposal's payload)
 *   - anything unmatched  -> proposal:genesis as the bootstrap fallback (honest:
 *     "descends from the seed state; no finer origin recoverable")
 *
 * Idempotent: only touches edges with via_proposal IS NONE. New edges already
 * carry via_proposal at commit (see commit.ts edgeContent), so this runs ONCE.
 * Admin op (writes): run with root creds — `bun run scripts/backfill-provenance.ts`.
 */

const GENESIS = 'proposal:genesis'
const TABLES = ['part_of', 'mentions', 'blocked_by', 'about', 'affects', 'derived_from'] as const

const db = await getDb()

// Index (kind|in|out) -> originating proposal id, from every committed proposal's
// payload, in commit order (later committed wins, mirroring replay order).
const origin = new Map<string, string>()
const key = (kind: string, a: string, b: string): string => `${kind}|${a}|${b}`

// The slice of the stored payload this backfill reads. Looser than
// StoredProposalPayload on purpose: legacy payloads may miss fields. Stored
// payloads speak string record ids (ADR-0028); the row id is a live RecordId.
type ProvenancePayload = {
  edges?: Array<{ kind: string; from: string; to: string }>
  about?: Array<{ block_id: string; note_id: string }>
  affects?: Array<{ block_id: string; note_id: string }>
  narrative_blocks?: Array<{ id: string; raw_ids?: string[] }>
}

const [proposals] = await db.query<[Array<{ id: RecordId; payload: ProvenancePayload }>]>(
  "SELECT id, payload, result.committed_at AS _ca FROM proposal WHERE status = 'committed' ORDER BY _ca ASC"
)
for (const p of proposals ?? []) {
  const pid = String(p.id)
  const pl = p.payload ?? {}
  for (const e of pl.edges ?? []) origin.set(key(String(e.kind), String(e.from), String(e.to)), pid)
  for (const a of pl.about ?? []) origin.set(key('about', String(a.block_id), String(a.note_id)), pid)
  for (const a of pl.affects ?? []) origin.set(key('affects', String(a.block_id), String(a.note_id)), pid)
  for (const b of pl.narrative_blocks ?? [])
    for (const r of b.raw_ids ?? []) origin.set(key('derived_from', String(b.id), String(r)), pid)
}
console.log(`[backfill] indexed ${origin.size} edge origins from ${(proposals ?? []).length} committed proposals`)

let recovered = 0
let bootstrap = 0
for (const table of TABLES) {
  const [edges] = await db.query<[Array<{ id: unknown; in: unknown; out: unknown }>]>(
    `SELECT id, in, out FROM ${table} WHERE via_proposal IS NONE`
  )
  for (const e of edges ?? []) {
    const found = origin.get(key(table, String(e.in), String(e.out)))
    const pid = found ?? GENESIS
    found ? recovered++ : bootstrap++
    await db.query('UPDATE $id SET via_proposal = $p', {
      id: new StringRecordId(String(e.id)),
      p: new StringRecordId(pid)
    })
  }
  console.log(`[backfill] ${table}: ${(edges ?? []).length} legacy edges stamped`)
}

console.log(`[backfill] DONE — recovered=${recovered} (real proposal), bootstrap=${bootstrap} (genesis fallback)`)
await closeDb()
