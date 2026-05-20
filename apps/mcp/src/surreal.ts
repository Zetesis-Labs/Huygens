import { Surreal } from 'surrealdb'

let cached: Surreal | null = null

export async function getDb(): Promise<Surreal> {
  if (cached) return cached

  const url = process.env.SURREAL_URL ?? 'ws://surrealdb:8000/rpc'
  const namespace = process.env.SURREAL_NS ?? 'huygens'
  const database = process.env.SURREAL_DB ?? 'main'
  const username = process.env.SURREAL_USER ?? 'root'
  const password = process.env.SURREAL_PASS ?? 'root'

  const db = new Surreal()
  await db.connect(url)
  await db.signin({ username, password })
  await db.use({ namespace, database })

  cached = db
  return db
}

export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.close()
    cached = null
  }
}
