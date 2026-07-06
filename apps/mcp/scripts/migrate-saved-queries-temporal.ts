import { StringRecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'

// One-off migration: bring the pinned operational saved_query records onto the
// new temporal model. They predate due_at/defer_until and still read deadlines
// from `metadata.deadline`/`metadata.due_before` and never exclude dormant
// (deferred) tasks — so the daily radar would lie the moment real deadlines /
// ticklers land. Deterministic string transforms:
//   1. metadata.deadline   → due_at        (real top-level field)
//   2. metadata.due_before → due_at
//   3. the live-task filter gains the dormant exclusion
//   4. surface defer_until next to mit_for in projections
// Dry-run by default; pass --apply to write. Idempotent (re-running is a no-op).
const IDS = [
  'saved_query:ebrk9y01h58jicz7svhv', // Informe diario → radar operativo completo
  'saved_query:1ik8bjetg5nm1yond1kq', // Tareas → deadlines próximos
  'saved_query:gysnjflby2omsk3flbsb' // Tareas pendientes → mapa por proyecto/área
]
const LIVE_FILTER = "state IN ['ACTIVE', 'WAITING']"
const DORMANT = `${LIVE_FILTER} AND (defer_until IS NONE OR defer_until <= time::now())`

function migrate(q: string): string {
  return q
    .replaceAll('metadata.deadline', 'due_at')
    .replaceAll('metadata.due_before', 'due_at')
    .replaceAll(LIVE_FILTER, DORMANT)
    .replaceAll('mit_for,', 'mit_for, defer_until,')
}

const apply = process.argv.includes('--apply')
const db = await getDb()

let changed = 0
for (const id of IDS) {
  const [rows] = await db.query<[Array<{ query: string }>]>('SELECT query FROM $id', { id: new StringRecordId(id) })
  const cur = rows?.[0]?.query
  if (!cur) {
    console.log(`  · ${id}: NOT FOUND`)
    continue
  }
  const next = migrate(cur)
  if (next === cur) {
    console.log(`  · ${id}: already migrated`)
    continue
  }
  changed++
  console.log(`  ✎ ${id}: migrated (${cur.length} → ${next.length} chars)`)
  if (apply) await db.query('UPDATE $id SET query = $q', { id: new StringRecordId(id), q: next })
}

console.log(
  apply
    ? `[migrate-saved-queries] APPLIED ✅ (${changed} changed)`
    : `[migrate-saved-queries] DRY-RUN (${changed} would change; pass --apply)`
)
await closeDb()
