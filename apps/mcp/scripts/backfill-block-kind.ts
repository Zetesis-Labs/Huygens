import { StringRecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'

// One-off migration: materialize the ritual `kind` (plan_day/review_day/…) onto
// the narrative `block` records that already exist. The kind has so far lived only
// in the immutable `proposal.payload.narrative_blocks[].kind`; this backfills it to
// the block so the block is self-describing and a rebuild/genesis preserves it
// (closes the "rebuild silently drops the Bitácora" gap).
//
// Idempotent: only sets `kind` where the block exists and its kind IS NONE. Dry-run
// by default; pass --apply to write. Reads kind from ALL proposals (committed +
// superseded) so legacy blocks are covered.
const apply = process.argv.includes('--apply')
const db = await getDb()

const [rows] = await db.query<[Array<{ kinded: Array<{ id: unknown; kind: string }> }>]>(
  `SELECT payload.narrative_blocks[WHERE kind IS NOT NONE].{ id, kind } AS kinded
   FROM proposal
   WHERE count(payload.narrative_blocks[WHERE kind IS NOT NONE]) > 0`
)
const byId = new Map<string, string>()
for (const r of rows ?? []) for (const b of r.kinded ?? []) byId.set(String(b.id), b.kind)

let updated = 0
let alreadySet = 0
let missingBlock = 0
for (const [id, kind] of byId) {
  const rid = new StringRecordId(id)
  const [existing] = await db.query<[Array<{ kind: string | null }>]>('SELECT kind FROM block WHERE id = $id', {
    id: rid
  })
  const block = (existing ?? [])[0]
  if (!block) {
    missingBlock++
    continue
  }
  if (block.kind != null) {
    alreadySet++
    continue
  }
  if (apply) await db.query('UPDATE $id SET kind = $kind RETURN NONE', { id: rid, kind })
  updated++
}

console.log(apply ? '[backfill-block-kind] APPLIED ✅' : '[backfill-block-kind] DRY-RUN (pass --apply to write)')
console.log(
  JSON.stringify(
    { kinded_in_payloads: byId.size, would_update: updated, already_set: alreadySet, missing_block: missingBlock },
    null,
    2
  )
)
await closeDb()
