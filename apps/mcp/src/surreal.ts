import { Surreal } from 'surrealdb'

let cached: Surreal | null = null
let override: Surreal | null = null

function config() {
  return {
    url: process.env.SURREAL_URL ?? 'ws://surrealdb:8000/rpc',
    namespace: process.env.SURREAL_NS ?? 'huygens',
    database: process.env.SURREAL_DB ?? 'main',
    username: process.env.SURREAL_USER ?? 'root',
    password: process.env.SURREAL_PASS ?? 'root'
  }
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('Anonymous access') || msg.includes('Not enough permissions')
}

async function reauth(db: Surreal): Promise<void> {
  const { url, namespace, database, username, password } = config()
  try {
    await db.signin({ username, password })
    await db.use({ namespace, database })
    return
  } catch {
    // Sesion irrecuperable: cierra y reconecta de cero.
  }
  await db.close().catch(() => {})
  await db.connect(url)
  await db.signin({ username, password })
  await db.use({ namespace, database })
}

// The SurrealDB SDK's RPC session can silently lose auth after an internal
// reconnect (no re-signin is emitted). We wrap `query` so that on the first
// auth error we reauthenticate and retry once.
function makeResilient(db: Surreal): Surreal {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== 'query') return Reflect.get(target, prop, receiver)
      const original = target.query.bind(target) as Surreal['query']
      return async (...args: Parameters<Surreal['query']>) => {
        try {
          return await original(...args)
        } catch (err) {
          if (!isAuthError(err)) throw err
          console.error('[huygens-mcp] surreal RPC lost auth, reauthenticating')
          await reauth(target)
          return await original(...args)
        }
      }
    }
  }) as Surreal
}

export async function getDb(): Promise<Surreal> {
  if (override) return override
  if (cached) return cached

  const { url, namespace, database, username, password } = config()

  const db = new Surreal()
  await db.connect(url)
  await db.signin({ username, password })
  await db.use({ namespace, database })

  cached = makeResilient(db)
  return cached
}

export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.close()
    cached = null
  }
}

/**
 * Test seam: replace the singleton with a caller-provided client (e.g. one
 * scoped to a per-test namespace). Pass `null` to clear the override.
 *
 * Only used from tests. The override takes precedence over the cached
 * connection so production code that calls `getDb()` doesn't need to know.
 */
export function setDbOverride(db: Surreal | null): void {
  override = db
}
