import { StringRecordId, Surreal } from 'surrealdb'

// Server-side only. Reads SurrealDB as the read-only `huygens_reader` (VIEWER)
// when SURREAL_READER_PASS is set; falls back to root for local dev. The
// credential never leaves the server (Astro SSR).
const URL = process.env.SURREAL_URL ?? 'ws://surrealdb:8000/rpc'
const NS = process.env.SURREAL_NS ?? 'huygens'
const DB = process.env.SURREAL_DB ?? 'main'
const READER_USER = process.env.SURREAL_READER_USER ?? 'huygens_reader'
const READER_PASS = process.env.SURREAL_READER_PASS

let singleton: Surreal | null = null

async function getDb(): Promise<Surreal> {
  if (singleton) return singleton
  const db = new Surreal()
  await db.connect(URL)
  if (READER_PASS) {
    await db.signin({ username: READER_USER, password: READER_PASS, namespace: NS, database: DB })
  } else {
    await db.signin({ username: process.env.SURREAL_USER ?? 'root', password: process.env.SURREAL_PASS ?? 'root' })
  }
  await db.use({ namespace: NS, database: DB })
  singleton = db
  return db
}

export type ProposalSummary = {
  id: string
  title: string
  status: string
  created_at: string
  updated_at: string
  raw_count: number
}

/** Collapse whitespace and clamp to a single short line. */
function oneLine(text: string | undefined, max = 90): string {
  if (!text) return ''
  const s = text.replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

export async function listProposals(): Promise<ProposalSummary[]> {
  const db = await getDb()
  // A proposal's human title is its informe-block: the first narrative block's
  // content (always present). Fall back to the first created note's title.
  const [rows] = await db.query<[Array<Omit<ProposalSummary, 'title'> & { narrative?: string; first_note?: string }>]>(
    `SELECT meta::id(id) AS id, status, created_at, updated_at,
            array::len(raw_captures) AS raw_count,
            payload.narrative_blocks[0].content AS narrative,
            payload.note_creates[0].title AS first_note
     FROM proposal ORDER BY created_at DESC`
  )
  return (rows ?? []).map(r => ({
    id: r.id,
    title: oneLine(r.narrative) || oneLine(r.first_note) || r.id,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    raw_count: r.raw_count
  }))
}

// The proposal payload shape we read (loose: only what the graph view needs).
export type Proposal = {
  id: string
  status: string
  payload: {
    raw_ids: string[]
    narrative_blocks: { temp_id: string; content: string; raw_ids: string[] }[]
    note_creates: {
      temp_id: string
      type_slug: string
      title: string
      state: string
      mit_for?: string
      metadata?: Record<string, unknown>
      descriptive_blocks: { content: string }[]
    }[]
    note_updates: {
      id: string
      title?: string
      state?: string
      mit_for?: string | null
      metadata_merge?: Record<string, unknown>
      descriptive_blocks_append: { content: string }[]
    }[]
    edges: { kind: string; from: string; to: string; reason?: string }[]
  }
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const db = await getDb()
  const [rows] = await db.query<[Array<{ id: unknown; status: string; payload: Proposal['payload'] }>]>(
    `SELECT meta::id(id) AS id, status, payload FROM proposal WHERE meta::id(id) = $id`,
    { id }
  )
  const row = rows?.[0]
  return row ? { id: String(row.id), status: row.status, payload: row.payload } : null
}

const REAL_ID = /^(note|block|raw_capture):/

/** Record ids of the existing records a proposal references (notes it updates,
 * source raws, pre-existing edge endpoints). temp_ids are skipped. */
function referencedRealIds(p: Proposal): string[] {
  const ids = new Set<string>()
  const narrativeIds = new Set(p.payload.narrative_blocks.map(b => b.temp_id))
  for (const u of p.payload.note_updates) ids.add(u.id)
  for (const e of p.payload.edges) {
    if (narrativeIds.has(e.from) || narrativeIds.has(e.to)) continue
    if (REAL_ID.test(e.from)) ids.add(e.from)
    if (REAL_ID.test(e.to)) ids.add(e.to)
  }
  return [...ids]
}

/** Type + human title of the existing records a proposal references, so the
 * graph can icon/colour them by type and show real titles instead of bare ids. */
export async function resolveLabels(p: Proposal): Promise<Record<string, { type: string; title: string }>> {
  const ids = referencedRealIds(p)
  if (ids.length === 0) return {}
  const db = await getDb()
  // The reader (VIEWER) can't `SELECT … FROM $ids` (record-id list select →
  // "Specify a database to use" on SurrealDB 3.0.5); table selects with
  // `WHERE id IN` work. So query each referenced table.
  const params = { ids: ids.map(s => new StringRecordId(s)) }
  const [notes, raws, blocks] = await db.query<
    [
      Array<{ id: unknown; title?: string; type?: unknown }>,
      Array<{ id: unknown; content?: string }>,
      Array<{ id: unknown; content?: string }>
    ]
  >(
    `SELECT id, title, type FROM note WHERE id IN $ids;
     SELECT id, content FROM raw_capture WHERE id IN $ids;
     SELECT id, content FROM block WHERE id IN $ids`,
    params
  )
  const labels: Record<string, { type: string; title: string }> = {}
  for (const r of notes ?? [])
    labels[String(r.id)] = {
      type: String(r.type ?? '').replace(/^note_type:/, '') || '?',
      title: r.title ?? String(r.id)
    }
  for (const r of raws ?? []) labels[String(r.id)] = { type: 'raw', title: (r.content ?? '').slice(0, 60) }
  for (const r of blocks ?? []) labels[String(r.id)] = { type: 'block', title: (r.content ?? '').slice(0, 60) }
  return labels
}

export type ExistingEdge = { source: string; target: string; kind: string }

/**
 * Relations that already exist in the KG between the given records — used to
 * hydrate the proposal graph with pre-existing edges (part_of / blocked_by /
 * mentions) that the proposal didn't create, so notes that are related in the
 * graph don't appear disconnected. Only edges with *both* endpoints in the set
 * are returned. Read-only.
 */
export async function existingEdgesAmong(ids: string[]): Promise<ExistingEdge[]> {
  if (ids.length < 2) return []
  const db = await getDb()
  const params = { ids: ids.map(s => new StringRecordId(s)) }
  const [rows] = await db.query<[Array<{ in: unknown; out: unknown; kind: string }>]>(
    `SELECT in, out, meta::tb(id) AS kind
     FROM part_of, blocked_by, mentions
     WHERE in IN $ids AND out IN $ids`,
    params
  )
  return (rows ?? []).map(r => ({ source: String(r.in), target: String(r.out), kind: r.kind }))
}
