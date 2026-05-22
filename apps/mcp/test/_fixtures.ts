import { readFileSync } from 'node:fs'
import { type RecordId, StringRecordId, Surreal } from 'surrealdb'
import { setDbOverride } from '../src/surreal'

const SCHEMA_SQL = readFileSync(new URL('../surreal/schema.surql', import.meta.url), 'utf8')
const SEED_SQL = readFileSync(new URL('../surreal/seed.surql', import.meta.url), 'utf8')

export type TestDb = {
  db: Surreal
  namespace: string
  database: string
  cleanup: () => Promise<void>
}

export type InsertNoteInput = {
  title: string
  type_slug?: string
  state?: string
  blocks?: string[]
  mit_for?: string
  metadata?: Record<string, unknown>
}

export type InsertNoteResult = {
  note_id: string
  block_ids: string[]
}

/**
 * Create a fresh SurrealDB namespace + database for a single test, apply
 * schema + seed, install it as the override `getDb()` returns, and return
 * a cleanup function that drops the namespace at the end.
 *
 * Each call uses a random suffix so parallel tests don't collide on
 * schema migrations or seed inserts.
 */
export async function withFreshDb(): Promise<TestDb> {
  const suffix = Math.random().toString(36).slice(2, 10)
  const namespace = `huygens_test_${suffix}`
  const database = 'main'

  const url = process.env.SURREAL_URL ?? 'ws://surrealdb:8000/rpc'
  const username = process.env.SURREAL_USER ?? 'root'
  const password = process.env.SURREAL_PASS ?? 'root'

  const db = new Surreal()
  await db.connect(url)
  await db.signin({ username, password })
  await db.use({ namespace, database })

  await db.query(SCHEMA_SQL)
  await db.query(SEED_SQL)

  setDbOverride(db)

  return {
    db,
    namespace,
    database,
    async cleanup() {
      setDbOverride(null)
      try {
        await db.query(`REMOVE NAMESPACE \`${namespace}\``)
      } catch {
        // Best effort — surreal's REMOVE is idempotent in practice
      }
      await db.close()
    }
  }
}

export async function insertNote(db: Surreal, input: InsertNoteInput): Promise<InsertNoteResult> {
  const data: Record<string, unknown> = {
    title: input.title,
    state: input.state ?? 'CLARIFIED'
  }
  if (input.type_slug) data.type = new StringRecordId(`note_type:${input.type_slug}`)
  if (input.mit_for) data.mit_for = new Date(input.mit_for)
  if (input.metadata) data.metadata = input.metadata

  const [noteRows] = await db.query<[{ id: RecordId }[]]>('CREATE note CONTENT $data RETURN AFTER', { data })
  const note = noteRows[0]
  if (!note) throw new Error(`failed to insert note: ${input.title}`)

  const blockContents = input.blocks ?? [input.title]
  const blockRowsInput = blockContents.map(content => ({
    note: note.id,
    block_kind: 'descriptive',
    content
  }))
  const [blockRows] = await db.query<[{ id: RecordId }[]]>('INSERT INTO block $rows RETURN AFTER', {
    rows: blockRowsInput
  })
  const blockIds = blockRows.map(block => block.id)
  await db.query('UPDATE $note SET block_order = $order', { note: note.id, order: blockIds })

  return { note_id: String(note.id), block_ids: blockIds.map(String) }
}
