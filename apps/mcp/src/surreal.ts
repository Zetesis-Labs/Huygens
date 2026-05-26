import { StringRecordId, Surreal } from 'surrealdb'
import { ConfigMissingError } from './errors'

type SurrealConfig = {
  url: string
  namespace: string
  database: string
  username: string
  password: string
  /**
   * `root` users sign in without namespace/database; DB-scope users
   * (huygens_reader) must include both. Picking the wrong shape causes
   * SurrealDB to reject the credentials, so this is explicit per role.
   */
  scope: 'root' | 'database'
}

let cached: Surreal | null = null
let override: Surreal | null = null

let readerCached: Surreal | null = null
let readerOverride: Surreal | null = null

function rootConfig(): SurrealConfig {
  return {
    url: process.env.SURREAL_URL ?? 'ws://surrealdb:8000/rpc',
    namespace: process.env.SURREAL_NS ?? 'huygens',
    database: process.env.SURREAL_DB ?? 'main',
    username: process.env.SURREAL_USER ?? 'root',
    password: process.env.SURREAL_PASS ?? 'root',
    scope: 'root'
  }
}

function readerConfig(): SurrealConfig {
  const password = process.env.SURREAL_READER_PASS
  if (!password) throw new ConfigMissingError('SURREAL_READER_PASS')
  return {
    url: process.env.SURREAL_URL ?? 'ws://surrealdb:8000/rpc',
    namespace: process.env.SURREAL_NS ?? 'huygens',
    database: process.env.SURREAL_DB ?? 'main',
    username: process.env.SURREAL_READER_USER ?? 'huygens_reader',
    password,
    scope: 'database'
  }
}

function signinAuth(cfg: SurrealConfig): Parameters<Surreal['signin']>[0] {
  if (cfg.scope === 'database') {
    return {
      namespace: cfg.namespace,
      database: cfg.database,
      username: cfg.username,
      password: cfg.password
    }
  }
  return { username: cfg.username, password: cfg.password }
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('Anonymous access') || msg.includes('Not enough permissions')
}

async function reauthWith(db: Surreal, cfg: SurrealConfig): Promise<void> {
  const auth = signinAuth(cfg)
  try {
    await db.signin(auth)
    await db.use({ namespace: cfg.namespace, database: cfg.database })
    return
  } catch {
    // Sesion irrecuperable: cierra y reconecta de cero.
  }
  await db.close().catch(() => {})
  await db.connect(cfg.url)
  await db.signin(auth)
  await db.use({ namespace: cfg.namespace, database: cfg.database })
}

// The SurrealDB SDK's RPC session can silently lose auth after an internal
// reconnect (no re-signin is emitted). We wrap `query` so that on the first
// auth error we reauthenticate and retry once.
function makeResilient(db: Surreal, getConfig: () => SurrealConfig, label: string): Surreal {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== 'query') {
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      }
      const original = target.query.bind(target) as Surreal['query']
      return async (...args: Parameters<Surreal['query']>) => {
        try {
          return await original(...args)
        } catch (err) {
          if (!isAuthError(err)) throw err
          console.error(`[huygens-mcp] surreal RPC lost auth (${label}), reauthenticating`)
          await reauthWith(target, getConfig())
          return await original(...args)
        }
      }
    }
  }) as Surreal
}

async function connectClient(cfg: SurrealConfig): Promise<Surreal> {
  const db = new Surreal()
  await db.connect(cfg.url)
  await db.signin(signinAuth(cfg))
  await db.use({ namespace: cfg.namespace, database: cfg.database })
  return db
}

export async function getDb(): Promise<Surreal> {
  if (override) return override
  if (cached) return cached

  const cfg = rootConfig()
  const db = await connectClient(cfg)
  cached = makeResilient(db, rootConfig, 'root')
  return cached
}

/**
 * Read-only Surreal client. Signs in as `huygens_reader` (VIEWER role on
 * the database) so any write attempted through this connection — even via
 * raw SurrealQL — is rejected by SurrealDB itself. This is the security
 * boundary for the `query_*` tools; do not relax it to root.
 *
 * Requires `SURREAL_READER_PASS` in the environment. The user is created
 * once with `bun run db:define-reader`.
 */
export async function getReadOnlyDb(): Promise<Surreal> {
  if (readerOverride) return readerOverride
  if (readerCached) return readerCached

  const cfg = readerConfig()
  const db = await connectClient(cfg)
  readerCached = makeResilient(db, readerConfig, 'reader')
  return readerCached
}

/**
 * Fetch full records by id as a typed array. This is the single trust boundary
 * between SurrealDB's untyped rows and the rest of the code: the `<T>` cast lives
 * here and nowhere else.
 *
 * Uses `SELECT *` deliberately — a field projection over a bound record-id array
 * (`SELECT a,b FROM $ids`) makes SurrealDB reject the query with "Specify a
 * database to use". Callers pick the fields they need from the typed result.
 */
export async function selectByIds<T>(ids: string[]): Promise<T[]> {
  if (ids.length === 0) return []
  const db = await getDb()
  const refs = ids.map(id => new StringRecordId(id))
  const [rows] = await db.query<[T[]]>('SELECT * FROM $ids', { ids: refs })
  return rows ?? []
}

/** Tables the tools require. SCHEMALESS tables are created implicitly on first
 * write, so a missing schema doesn't fail at boot — it fails later, opaquely,
 * inside a tool. This list lets us fail fast and legibly instead. */
const EXPECTED_TABLES = [
  'note',
  'block',
  'raw_capture',
  'proposal',
  'note_type',
  'agent_event',
  'part_of',
  'blocked_by',
  'mentions',
  'about',
  'affects',
  'derived_from'
] as const

/**
 * Fail fast at startup if the schema hasn't been applied. Without this, a fresh
 * DB lets `capture` "work" (implicit tables) while `commit_proposal`/`find_related`
 * blow up later with an opaque error. Throws a clear, actionable message instead.
 */
export async function assertSchemaReady(): Promise<void> {
  const db = await getDb()
  const [info] = await db.query<[{ tables?: Record<string, unknown> }]>('INFO FOR DB')
  const present = new Set(Object.keys(info?.tables ?? {}))
  const missing = EXPECTED_TABLES.filter(t => !present.has(t))
  if (missing.length > 0) {
    throw new Error(`schema not initialised — missing tables: ${missing.join(', ')}. Run \`bun run db:apply\`.`)
  }
}

export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.close()
    cached = null
  }
  if (readerCached) {
    await readerCached.close()
    readerCached = null
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

/** Test seam for the read-only client. Mirrors `setDbOverride`. */
export function setReadOnlyDbOverride(db: Surreal | null): void {
  readerOverride = db
}
