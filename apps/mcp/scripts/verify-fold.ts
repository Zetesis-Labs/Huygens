import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StringRecordId, Surreal } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'
import { buildReplayTx } from '../src/tools/proposal/commit'

/**
 * ACCEPTANCE TEST for the event-sourcing invariant: "the live graph is a
 * deterministic fold of the log". Replays the committed proposals (creates) AND
 * the retraction events (deletes) into a SHADOW database, then structurally
 * diffs the shadow projection against the live graph. A zero diff proves the
 * invariant. Non-destructive: only writes to a throwaway DB (`main_shadow`).
 *
 * Invariant scope (the honest contract): entities (by id) + topology (kind,in,out)
 * + provenance (via_proposal) + content. EXCLUDED as derived cache: timestamps and
 * embeddings. Descriptive blocks are compared by id (now stable post-backfill) and
 * cross-checked by (note, content).
 *
 * Run with root creds: `bun run scripts/verify-fold.ts`
 */

const SHADOW = 'main_shadow'
const EDGE_TABLES = ['part_of', 'blocked_by', 'mentions', 'about', 'affects', 'derived_from'] as const
const PROJECTION = ['part_of', 'blocked_by', 'mentions', 'about', 'affects', 'derived_from', 'block', 'note'] as const

const main = await getDb()

// ── read the log + the live state from main ───────────────────────────────
const [proposals] = await main.query<[Array<{ id: unknown; payload: any; _ca: unknown }>]>(
  "SELECT id, payload, result.committed_at AS _ca FROM proposal WHERE status = 'committed' ORDER BY _ca ASC"
)
const [retractions] = await main.query<[Array<{ payload: any; created_at: unknown }>]>(
  "SELECT payload, created_at FROM agent_event WHERE kind = 'retracted' ORDER BY created_at ASC"
)

// ── set up the shadow DB: schema + seed, then wipe the projection ──────────
const shadow = new Surreal()
await shadow.connect(process.env.SURREAL_URL ?? 'ws://surrealdb:8000/rpc')
await shadow.signin({ username: process.env.SURREAL_USER ?? 'root', password: process.env.SURREAL_PASS ?? 'root' })
await shadow.use({ namespace: process.env.SURREAL_NS ?? 'huygens', database: SHADOW })

const surrealDir = join(import.meta.dir, '..', 'surreal')
await shadow.query(readFileSync(join(surrealDir, 'schema.surql'), 'utf8'))
await shadow.query(readFileSync(join(surrealDir, 'seed.surql'), 'utf8'))
for (const t of PROJECTION) await shadow.query(`DELETE ${t}`)

// ── replay: creates (committed proposals) then deletes (retractions) ───────
for (const p of proposals ?? []) {
  const { query, params } = buildReplayTx(p.payload, String(p.id))
  await shadow.query(query, params)
}
for (const r of retractions ?? []) {
  const notes: string[] = r.payload?.notes ?? []
  const blocks: string[] = r.payload?.blocks ?? []
  const removed = [...notes, ...blocks]
  if (notes.length > 0) {
    const [owned] = await shadow.query<[Array<{ id: unknown }>]>('SELECT id FROM block WHERE note IN $n', {
      n: notes.map(id => new StringRecordId(id))
    })
    for (const o of owned ?? []) removed.push(String(o.id))
  }
  const refs = removed.map(id => new StringRecordId(id))
  for (const t of EDGE_TABLES) await shadow.query(`DELETE ${t} WHERE in IN $r OR out IN $r`, { r: refs })
  await shadow.query('DELETE $r', { r: refs })
}

// ── structural snapshots of both graphs ───────────────────────────────────
/** Order-stable serialization so field comparison is exact (sorted object keys). */
function stable(v: unknown): string {
  if (v === null || v === undefined) return 'NONE'
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map(k => `${k}:${stable(o[k])}`).join(',')}}`
  }
  return String(v)
}

/**
 * A full structural snapshot. Compared fields (the invariant):
 *  - note:  title, type, state, mit_for, due_at, defer_until, metadata,
 *           block_order (the descriptive ordering), source_kind, source_ref
 *  - narrative block: content, kind (ritual tag)
 *  - descriptive block: by (note, content) — id is non-invariant but stable now
 *  - every edge: in, out, via_proposal + per-table metadata
 *      (blocked_by.reason, affects.action/summary, derived_from.transformation)
 * EXCLUDED as derived cache / non-deterministic: created_at, updated_at,
 *  topologized_at, since, last_reviewed_at (stamped time::now at commit), embeddings.
 */
async function snapshot(db: Surreal): Promise<{
  notes: Map<string, string>
  narr: Map<string, string>
  desc: Set<string>
  edges: Map<string, string>
}> {
  const [notes] = await db.query<[Array<Record<string, unknown>>]>(
    'SELECT id, title, type.slug AS type, state, mit_for, due_at, defer_until, metadata, block_order, source_kind, source_ref FROM note'
  )
  const [narr] = await db.query<[Array<Record<string, unknown>>]>(
    "SELECT id, content, kind FROM block WHERE block_kind = 'narrative'"
  )
  const [desc] = await db.query<[Array<{ note: unknown; content: string }>]>(
    "SELECT note, content FROM block WHERE block_kind = 'descriptive'"
  )

  const edgeMeta: Record<string, string> = {
    part_of: '',
    mentions: '',
    about: '',
    blocked_by: ', reason',
    affects: ', action, summary',
    derived_from: ', transformation'
  }
  const edges = new Map<string, string>()
  for (const t of EDGE_TABLES) {
    const [rows] = await db.query<[Array<Record<string, unknown>>]>(`SELECT in, out, via_proposal${edgeMeta[t]} FROM ${t}`)
    for (const e of rows ?? []) {
      const meta: Record<string, unknown> = { via: String(e.via_proposal) }
      for (const f of ['reason', 'action', 'summary', 'transformation']) if (f in e) meta[f] = e[f] ?? null
      edges.set(`${t}|${String(e.in)}|${String(e.out)}`, stable(meta))
    }
  }

  return {
    notes: new Map(
      (notes ?? []).map(n => [
        String(n.id),
        stable({
          title: n.title,
          type: n.type,
          state: n.state,
          mit_for: n.mit_for ?? null,
          due_at: n.due_at ?? null,
          defer_until: n.defer_until ?? null,
          metadata: n.metadata ?? null,
          block_order: ((n.block_order as unknown[]) ?? []).map(String),
          source_kind: n.source_kind ?? null,
          source_ref: n.source_ref ?? null
        })
      ])
    ),
    narr: new Map((narr ?? []).map(b => [String(b.id), stable({ content: b.content, kind: b.kind ?? null })])),
    desc: new Set((desc ?? []).map(d => `${String(d.note)}|${d.content}`)),
    edges
  }
}

const live = await snapshot(main)
const shad = await snapshot(shadow)

// ── diff ──────────────────────────────────────────────────────────────────
function diffMap(a: Map<string, string>, b: Map<string, string>, label: string): number {
  const onlyLive = [...a.keys()].filter(k => !b.has(k))
  const onlyShadow = [...b.keys()].filter(k => !a.has(k))
  const mismatch = [...a.keys()].filter(k => b.has(k) && a.get(k) !== b.get(k))
  const total = onlyLive.length + onlyShadow.length + mismatch.length
  console.log(
    `  ${label.padEnd(14)} live=${a.size} shadow=${b.size} | onlyLive=${onlyLive.length} onlyShadow=${onlyShadow.length} mismatch=${mismatch.length}`
  )
  if (onlyLive.length) console.log(`      onlyLive: ${onlyLive.slice(0, 5).join(', ')}${onlyLive.length > 5 ? ' …' : ''}`)
  if (onlyShadow.length) console.log(`      onlyShadow: ${onlyShadow.slice(0, 5).join(', ')}${onlyShadow.length > 5 ? ' …' : ''}`)
  return total
}
function diffSet(a: Set<string>, b: Set<string>, label: string): number {
  const onlyLive = [...a].filter(k => !b.has(k))
  const onlyShadow = [...b].filter(k => !a.has(k))
  console.log(`  ${label.padEnd(14)} live=${a.size} shadow=${b.size} | onlyLive=${onlyLive.length} onlyShadow=${onlyShadow.length}`)
  return onlyLive.length + onlyShadow.length
}

console.log(`\n[verify-fold] replayed ${(proposals ?? []).length} proposals + ${(retractions ?? []).length} retractions into ${SHADOW}\n`)
let diff = 0
diff += diffMap(live.notes, shad.notes, 'notes')
diff += diffMap(live.narr, shad.narr, 'narrative')
diff += diffSet(live.desc, shad.desc, 'descriptive')
diff += diffMap(live.edges, shad.edges, 'edges')
console.log(`\n[verify-fold] TOTAL STRUCTURAL DIFF = ${diff} ${diff === 0 ? '✅ (graph == fold(log))' : '❌'}\n`)

await shadow.close()
await closeDb()
