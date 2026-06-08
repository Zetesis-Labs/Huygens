import { StringRecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'

/**
 * ONE-SHOT migration: stamp the real live `id` onto every descriptive block in
 * the committed proposals' payloads. Before this, descriptive blocks were created
 * with a fresh uuidv7 at COMMIT (not pre-assigned in the payload), so a replay
 * regenerated their ids. We match each payload descriptive block to its live
 * block by (note, content) and write the live id back into the payload, so a
 * future rebuild reproduces descriptive blocks id-identical.
 *
 * Robust to retracts: a descriptive block that was deleted (note retracted, or
 * the block itself) has no live match -> left without id (commit's fallback will
 * generate one on replay; it gets cascade-deleted by the retraction anyway).
 * Idempotent: skips entries that already carry an id. A global `assigned` set
 * prevents giving the same live id to two payload entries (duplicate content).
 * Admin op (writes the log): run with root creds — `bun run scripts/backfill-descriptive-ids.ts`.
 */

const db = await getDb()

const [proposals] = await db.query<[Array<{ id: unknown; payload: Record<string, any> }>]>(
  "SELECT id, payload FROM proposal WHERE status = 'committed'"
)

const assigned = new Set<string>()

async function findId(noteId: string, content: string): Promise<string | null> {
  const [rows] = await db.query<[Array<{ id: unknown }>]>(
    "SELECT id FROM block WHERE block_kind = 'descriptive' AND note = $n AND content = $c",
    { n: new StringRecordId(noteId), c: content }
  )
  for (const r of rows ?? []) {
    const s = String(r.id)
    if (!assigned.has(s)) {
      assigned.add(s)
      return s
    }
  }
  return null
}

let proposalsPatched = 0
let idsSet = 0
let unmatched = 0

for (const p of proposals ?? []) {
  const pl = p.payload ?? {}
  let changed = false

  for (const n of pl.note_creates ?? []) {
    for (const b of n.descriptive_blocks ?? []) {
      if (b.id) continue
      const id = await findId(String(n.id), b.content)
      if (id) {
        b.id = id
        idsSet++
        changed = true
      } else {
        unmatched++
      }
    }
  }
  for (const u of pl.note_updates ?? []) {
    for (const b of u.descriptive_blocks_append ?? []) {
      if (b.id) continue
      const id = await findId(String(u.id), b.content)
      if (id) {
        b.id = id
        idsSet++
        changed = true
      } else {
        unmatched++
      }
    }
  }

  if (changed) {
    await db.query('UPDATE $id SET payload = $payload', {
      id: new StringRecordId(String(p.id)),
      payload: pl
    })
    proposalsPatched++
  }
}

console.log(
  `[backfill-desc-ids] proposals patched=${proposalsPatched}, descriptive ids set=${idsSet}, unmatched(retracted/gone)=${unmatched}`
)
await closeDb()
