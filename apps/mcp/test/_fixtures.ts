import { readFileSync } from 'node:fs'
import { Surreal } from 'surrealdb'
import { setDbOverride } from '../src/surreal'

const SCHEMA_SQL = readFileSync(new URL('../surreal/schema.surql', import.meta.url), 'utf8')
const SEED_SQL = readFileSync(new URL('../surreal/seed.surql', import.meta.url), 'utf8')

export type TestDb = {
  db: Surreal
  namespace: string
  database: string
  cleanup: () => Promise<void>
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
