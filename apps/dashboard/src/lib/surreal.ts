import type { ExistingEdge } from '@huygens/graph'
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

async function connect(): Promise<Surreal> {
  const db = new Surreal()
  await db.connect(URL)
  if (READER_PASS) {
    await db.signin({ username: READER_USER, password: READER_PASS, namespace: NS, database: DB })
  } else {
    await db.signin({ username: process.env.SURREAL_USER ?? 'root', password: process.env.SURREAL_PASS ?? 'root' })
  }
  await db.use({ namespace: NS, database: DB })
  return db
}

/** The SDK's WS session can silently lose auth or drop after an internal
 * reconnect (this dashboard runs for days as an SSR server, so it happens). */
function isRecoverable(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /Anonymous access|Not enough permissions|connection|socket|closed|reset|websocket/i.test(m)
}

/** Wrap `query` so the first recoverable failure reconnects a fresh client and
 * retries once, then becomes the new singleton. Other members pass through. */
function resilient(db: Surreal): Surreal {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== 'query') {
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      }
      const original = target.query.bind(target)
      return async (...args: Parameters<Surreal['query']>) => {
        try {
          return await original(...args)
        } catch (err) {
          if (!isRecoverable(err)) throw err
          const fresh = await connect()
          singleton = resilient(fresh)
          return await fresh.query(...args)
        }
      }
    }
  }) as Surreal
}

async function getDb(): Promise<Surreal> {
  if (singleton) return singleton
  singleton = resilient(await connect())
  return singleton
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
  // Strip markdown so the nav clamp reads as clean text (no `##`, `**`, `` ` ``).
  const s = text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*[-*+]\s+/gm, '') // bullet markers
    .replace(/^\s*\d+\.\s+/gm, '') // ordered markers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/__([^_]+)__/g, '$1') // bold (alt)
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/\s+/g, ' ')
    .trim()
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
    narrative_blocks: { id: string; content: string; raw_ids: string[] }[]
    note_creates: {
      id: string
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
    edges_remove?: { kind: string; from: string; to: string }[]
  }
  /** Materialized commit result (committed proposals only). `committed_at` is the
   * time anchor for historical reconstruction (the SSOT fold); `versionstamp` is
   * legacy — no longer written or read, kept only for old results. */
  result?: {
    versionstamp?: string | null
    committed_at?: unknown
  } | null
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const db = await getDb()
  const [rows] = await db.query<
    [Array<{ id: unknown; status: string; payload: Proposal['payload']; result?: Proposal['result'] }>]
  >(`SELECT meta::id(id) AS id, status, payload, result FROM proposal WHERE meta::id(id) = $id`, { id })
  const row = rows?.[0]
  return row ? { id: String(row.id), status: row.status, payload: row.payload, result: row.result ?? null } : null
}

/** A committed proposal as the diary needs it: its payload, the instant it
 * landed (`committed_at`, or `updated_at` for pre-result commits that lack a
 * materialized result), and the temp_id → real note-id map from the commit — so
 * several proposals committed the same day fuse into one graph without
 * duplicating the notes they share. */
export type CommittedProposal = {
  id: string
  committedAt: string
  payload: Proposal['payload']
  tempMap: Record<string, string>
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v)
}

// Commits are bucketed by the *local* Madrid day they landed. SurrealDB 3.0.5
// has no IANA timezones, only fixed offsets, so we shift the instant by +2h
// (CEST) before taking the date. Correct for the summer half-year; a winter
// 00:00–01:00 UTC commit would bucket one day early. `committed_at` is absent on
// pre-result commits, so we coalesce to `updated_at` (≈ the same instant).
const MADRID_DAY = "time::format((result.committed_at ?? updated_at) + 2h, '%Y-%m-%d')"

export type DiaryDayCount = { day: string; count: number }

/** Per-day commit counts for the diary list — aggregated in SurrealDB, so no
 * payloads cross the wire just to be counted. Newest day first. Read-only. */
export async function diaryDayCounts(): Promise<DiaryDayCount[]> {
  const db = await getDb()
  const [rows] = await db.query<[DiaryDayCount[]]>(
    `SELECT ${MADRID_DAY} AS day, count() AS count
     FROM proposal WHERE status = 'committed'
     GROUP BY day ORDER BY day DESC`
  )
  return rows ?? []
}

export type CommittedProposalRow = { id: string; day: string; status: string; title: string; kind: string | null }

type ExistingKindedBlock = { blockId: string; kind?: string | null; content?: string }

async function existingBlockIds(db: Surreal, fullIds: string[]): Promise<Set<string>> {
  if (fullIds.length === 0) return new Set()
  const [rows] = await db.query<[Array<{ id: unknown }>]>('SELECT id FROM block WHERE id IN $ids', {
    ids: fullIds.map(s => new StringRecordId(s))
  })
  return new Set((rows ?? []).map(r => String(r.id)))
}

function firstExistingKindedBlock(
  blocks: ExistingKindedBlock[] | undefined,
  existing: Set<string>
): ExistingKindedBlock | null {
  return blocks?.find(b => b.kind && existing.has(String(b.blockId))) ?? null
}

/** Every committed proposal with its Madrid day + a light title (no payloads
 * cross the wire), newest first — for nesting proposals under their day in the
 * diary nav. Title = the informe-block (first narrative) or first created note.
 * `kind` is the planning/review tag (plan_day / review_day / …) when the informe
 * is a ritual output, else null — drives the diary badge.
 *
 * Important: proposals keep an immutable payload snapshot. Retractions delete the
 * materialized block record, not the historical proposal payload, so only treat a
 * kinded narrative as live if its payload block id still exists in `block`. */
export async function listCommittedProposalRows(): Promise<CommittedProposalRow[]> {
  const db = await getDb()
  const [rows] = await db.query<
    [
      Array<{
        id: unknown
        day: string
        status: string
        narrative?: string
        first_note?: string
        kinded?: ExistingKindedBlock[]
      }>
    ]
  >(
    `SELECT meta::id(id) AS id, ${MADRID_DAY} AS day, status, created_at,
            payload.narrative_blocks[0].content AS narrative,
            payload.note_creates[0].title AS first_note,
            payload.narrative_blocks[WHERE kind IS NOT NONE].{ blockId: id, kind, content } AS kinded
     FROM proposal WHERE status = 'committed'
     ORDER BY day DESC, created_at DESC`
  )
  const existing = await existingBlockIds(
    db,
    (rows ?? []).flatMap(r => (r.kinded ?? []).map(b => String(b.blockId)).filter(Boolean))
  )
  return (rows ?? []).map(r => {
    const kinded = firstExistingKindedBlock(r.kinded, existing)
    return {
      id: String(r.id),
      day: r.day,
      status: r.status,
      kind: kinded?.kind ?? null,
      // Generous single-line clamp: the nav truncates it visually with CSS, but the
      // full string rides on the link's `title` so a hover shows it complete.
      title: oneLine(r.narrative, 240) || oneLine(r.first_note, 240) || String(r.id)
    }
  })
}

export type InformeRow = { id: string; day: string; kind: string; content: string; created_at: string }

/** Planning/review informes (committed proposals whose narrative block carries a
 * `kind` tag), newest first, with their Madrid day and full markdown content —
 * the Bitácora feed. Read-only.
 *
 * Like the proposal nav, this filters out kinded payload blocks whose materialized
 * `block` record was retracted; otherwise a reverted `review_day` can keep
 * appearing as “Cierre del día” from the immutable proposal payload. */
export async function listInformes(): Promise<InformeRow[]> {
  const db = await getDb()
  const [rows] = await db.query<
    [Array<{ id: unknown; day: string; kinded?: ExistingKindedBlock[]; created_at: unknown }>]
  >(
    `SELECT meta::id(id) AS id, ${MADRID_DAY} AS day,
            payload.narrative_blocks[WHERE kind IS NOT NONE].{ blockId: id, kind, content } AS kinded,
            (result.committed_at ?? updated_at) AS created_at
     FROM proposal
     WHERE status = 'committed' AND count(payload.narrative_blocks[WHERE kind IS NOT NONE]) > 0
     ORDER BY day DESC, created_at DESC`
  )
  const existing = await existingBlockIds(
    db,
    (rows ?? []).flatMap(r => (r.kinded ?? []).map(b => String(b.blockId)).filter(Boolean))
  )
  return (rows ?? []).flatMap(r => {
    const kinded = firstExistingKindedBlock(r.kinded, existing)
    if (!kinded?.kind || !kinded.content) return []
    return [
      {
        id: String(r.id),
        day: r.day,
        kind: kinded.kind,
        content: kinded.content,
        created_at: String(r.created_at)
      }
    ]
  })
}

export type MitRow = {
  id: string
  title: string
  state: string
  type: string
  day: string
  parent: string | null
  /** Madrid-day (YYYY-MM-DD) of the hard deadline, if any. */
  dueDay: string | null
  /** Madrid-day a deferred task resurfaces, if any. */
  deferDay: string | null
}

/** Madrid day of a day-granular datetime. The field is stored at UTC midnight of
 * its day, so the UTC date IS the Madrid day. Null-safe. */
function madridDay(v: unknown): string | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Notes flagged as a MIT (`mit_for` set), newest MIT-day first, with their type,
 * parent (project/area) title, and their other temporal axes (due_at / defer_until)
 * so the panel can flag a deadline or a deferred MIT. `mit_for + 2h` → Madrid day,
 * matching the diary's bucketing. Read-only. */
export async function listMits(): Promise<MitRow[]> {
  const db = await getDb()
  const [rows] = await db.query<
    [
      Array<{
        id: unknown
        title: string
        state: string
        type?: string
        mit_for: unknown
        day: string
        due_at: unknown
        defer_until: unknown
        parent?: string | null
      }>
    ]
  >(
    `SELECT meta::id(id) AS id, title, state, type.slug AS type, mit_for, due_at, defer_until,
            time::format(mit_for + 2h, '%Y-%m-%d') AS day,
            ->part_of->note[0].title AS parent
     FROM note WHERE mit_for IS NOT NONE
     ORDER BY mit_for DESC`
  )
  return (rows ?? []).map(r => ({
    id: String(r.id),
    title: r.title,
    state: r.state,
    type: r.type ?? '?',
    day: r.day,
    parent: r.parent ?? null,
    dueDay: madridDay(r.due_at),
    deferDay: madridDay(r.defer_until)
  }))
}

export type NoteCard = { type: string; title: string; state?: string }

/** Resolve full note record ids to graph cards (type/title/state). Used by the
 * MITs view to label the MITs + their context nodes. Read-only. */
export async function resolveNoteCards(fullIds: string[]): Promise<Record<string, NoteCard>> {
  if (fullIds.length === 0) return {}
  const db = await getDb()
  const [rows] = await db.query<[Array<{ id: unknown; title?: string; type?: string; state?: string }>]>(
    'SELECT id, title, type.slug AS type, state FROM note WHERE id IN $ids',
    { ids: fullIds.map(s => new StringRecordId(s)) }
  )
  const out: Record<string, NoteCard> = {}
  for (const r of rows ?? [])
    out[String(r.id)] = { type: r.type ?? '?', title: r.title ?? String(r.id), state: r.state }
  return out
}

/** The context around a set of MIT notes: their `part_of` ancestry (up to 4 hops:
 * project → area → objetivo) and their OPEN blockers (`blocked_by` to notes not
 * DONE/ARCHIVED). Returns full record ids (deduped). Read-only. */
export async function relatedNoteIds(fullMitIds: string[]): Promise<string[]> {
  if (fullMitIds.length === 0) return []
  const db = await getDb()
  const [rows] = await db.query<[Array<{ related: unknown[] }>]>(
    `SELECT array::distinct(array::flatten([
        ->part_of->note.id,
        ->part_of->note->part_of->note.id,
        ->part_of->note->part_of->note->part_of->note.id,
        ->part_of->note->part_of->note->part_of->note->part_of->note.id,
        ->blocked_by->note[WHERE state NOT IN ['DONE', 'ARCHIVED']].id
      ])) AS related
     FROM note WHERE id IN $ids`,
    { ids: fullMitIds.map(s => new StringRecordId(s)) }
  )
  const out = new Set<string>()
  for (const r of rows ?? []) for (const id of r.related ?? []) out.add(String(id))
  return [...out]
}

/** The committed proposals that landed on a given Madrid day (`YYYY-MM-DD`),
 * with the bits the diary fuses over. Filtered in SurrealDB. Read-only. */
export async function listCommittedProposalsForDay(day: string): Promise<CommittedProposal[]> {
  const db = await getDb()
  const [rows] = await db.query<
    [Array<{ id: unknown; payload: Proposal['payload']; landed: unknown; temp?: Record<string, string> | null }>]
  >(
    `SELECT meta::id(id) AS id, payload,
            (result.committed_at ?? updated_at) AS landed,
            result.temp_ids.notes AS temp
     FROM proposal
     WHERE status = 'committed' AND ${MADRID_DAY} = $day`,
    { day }
  )
  return (rows ?? []).map(r => ({
    id: String(r.id),
    committedAt: toIso(r.landed),
    payload: r.payload,
    // The driver hands back `temp_ids.notes` values as RecordId objects; the
    // graph keys everything by string id, so flatten them here.
    tempMap: r.temp ? Object.fromEntries(Object.entries(r.temp).map(([k, v]) => [k, String(v)])) : {}
  }))
}

/** The committed proposals that landed within an inclusive Madrid-day range
 * [`from`, `to`] (`YYYY-MM-DD` strings; lexical compare = chronological), oldest
 * first — the input the diary fuses over for the Date-review range view. */
export async function listCommittedProposalsForRange(from: string, to: string): Promise<CommittedProposal[]> {
  const db = await getDb()
  const [rows] = await db.query<
    [Array<{ id: unknown; payload: Proposal['payload']; landed: unknown; temp?: Record<string, string> | null }>]
  >(
    `SELECT meta::id(id) AS id, payload,
            (result.committed_at ?? updated_at) AS landed,
            result.temp_ids.notes AS temp
     FROM proposal
     WHERE status = 'committed' AND ${MADRID_DAY} >= $from AND ${MADRID_DAY} <= $to
     ORDER BY landed ASC`,
    { from, to }
  )
  return (rows ?? []).map(r => ({
    id: String(r.id),
    committedAt: toIso(r.landed),
    payload: r.payload,
    tempMap: r.temp ? Object.fromEntries(Object.entries(r.temp).map(([k, v]) => [k, String(v)])) : {}
  }))
}

/** The committed proposals that landed strictly *before* `committedAt`, oldest
 * first — the input to `foldTopology` for reconstructing a proposal's historical
 * context from the SSOT (the payloads), no changefeed. Read-only. */
export async function listCommittedProposalsBefore(committedAt: string): Promise<CommittedProposal[]> {
  const db = await getDb()
  const [rows] = await db.query<
    [Array<{ id: unknown; payload: Proposal['payload']; landed: unknown; temp?: Record<string, string> | null }>]
  >(
    `SELECT meta::id(id) AS id, payload,
            (result.committed_at ?? updated_at) AS landed,
            result.temp_ids.notes AS temp
     FROM proposal
     WHERE status = 'committed'
       AND (result.committed_at ?? updated_at) < type::datetime($before)
     ORDER BY landed ASC`,
    { before: committedAt }
  )
  return (rows ?? []).map(r => ({
    id: String(r.id),
    committedAt: toIso(r.landed),
    payload: r.payload,
    tempMap: r.temp ? Object.fromEntries(Object.entries(r.temp).map(([k, v]) => [k, String(v)])) : {}
  }))
}

const REAL_ID = /^(note|block|raw_capture):/

/** Record ids of the existing records a proposal references (notes it updates,
 * source raws, pre-existing edge endpoints). temp_ids are skipped. */
function referencedRealIds(p: Proposal): string[] {
  const ids = new Set<string>()
  const narrativeIds = new Set(p.payload.narrative_blocks.map(b => b.id))
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
export async function resolveLabels(
  p: Proposal
): Promise<Record<string, { type: string; title: string; state?: string }>> {
  const ids = referencedRealIds(p)
  if (ids.length === 0) return {}
  const db = await getDb()
  // The reader (VIEWER) can't `SELECT … FROM $ids` (record-id list select →
  // "Specify a database to use" on SurrealDB 3.0.5); table selects with
  // `WHERE id IN` work. So query each referenced table.
  const params = { ids: ids.map(s => new StringRecordId(s)) }
  const [notes, raws, blocks] = await db.query<
    [
      Array<{ id: unknown; title?: string; type?: unknown; state?: string }>,
      Array<{ id: unknown; content?: string }>,
      Array<{ id: unknown; content?: string }>
    ]
  >(
    `SELECT id, title, type, state FROM note WHERE id IN $ids;
     SELECT id, content FROM raw_capture WHERE id IN $ids;
     SELECT id, content FROM block WHERE id IN $ids`,
    params
  )
  const labels: Record<string, { type: string; title: string; state?: string }> = {}
  for (const r of notes ?? [])
    labels[String(r.id)] = {
      type: String(r.type ?? '').replace(/^note_type:/, '') || '?',
      title: r.title ?? String(r.id),
      state: r.state
    }
  for (const r of raws ?? []) labels[String(r.id)] = { type: 'raw', title: (r.content ?? '').slice(0, 60) }
  for (const r of blocks ?? []) labels[String(r.id)] = { type: 'block', title: (r.content ?? '').slice(0, 60) }
  return labels
}

export type { ExistingEdge } from '@huygens/graph'

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

// ── Time-travel reads (historical context for committed proposals) ───────────
// Reliable only two ways in SurrealDB 3.0.5 (see ADR-0025): VERSION *by record
// id*, and changefeed *replay*. Table scans with VERSION wrongly return deleted
// records, so topology must be replayed, never VERSION-scanned (until the engine
// fixes it — then `scanEdgesAmongAt` is the drop-in replacement).

const SAFE_RECORD_ID = /^(note|block|raw_capture):[A-Za-z0-9]+$/

/**
 * Labels (type + title) of a proposal's referenced records **as of** `committedAt`,
 * read with VERSION *by record id* (the only reliable time-travel read). One
 * statement per id; deleted-since records simply yield no row (fall back to id).
 */
export async function labelsAtVersion(
  p: Proposal,
  committedAt: string
): Promise<Record<string, { type: string; title: string }>> {
  const ids = referencedRealIds(p).filter(id => SAFE_RECORD_ID.test(id))
  if (ids.length === 0) return {}
  const db = await getDb()
  const stmts = ids.map(id =>
    id.startsWith('note:')
      ? `SELECT type, title FROM ${id} VERSION d"${committedAt}";`
      : `SELECT content FROM ${id} VERSION d"${committedAt}";`
  )
  const results = await db.query<Array<Array<{ type?: unknown; title?: string; content?: string }>>>(stmts.join('\n'))
  const labels: Record<string, { type: string; title: string }> = {}
  ids.forEach((id, i) => {
    const row = results[i]?.[0]
    if (!row) return
    if (id.startsWith('note:'))
      labels[id] = { type: String(row.type ?? '').replace(/^note_type:/, '') || '?', title: row.title ?? id }
    else if (id.startsWith('raw_capture:')) labels[id] = { type: 'raw', title: (row.content ?? '').slice(0, 60) }
    else labels[id] = { type: 'block', title: (row.content ?? '').slice(0, 60) }
  })
  return labels
}

type EdgeChange = { update?: { id?: unknown; in?: unknown; out?: unknown }; delete?: { id?: unknown } }
type EdgeRow = { versionstamp: bigint; changes: EdgeChange[] }

/** Replay an edge table's changefeed rows (versionstamp-ordered) up to and
 * including `target`, returning the live edge set at that point. */
function replayLiveEdges(rows: EdgeRow[], target: bigint): Map<string, { source: string; target: string }> {
  const live = new Map<string, { source: string; target: string }>()
  for (const row of rows) {
    if (typeof row.versionstamp === 'bigint' && row.versionstamp > target) break
    for (const c of row.changes ?? []) {
      if (c.update?.in != null && c.update.out != null)
        live.set(String(c.update.id), { source: String(c.update.in), target: String(c.update.out) })
      else if (c.delete) live.delete(String(c.delete.id))
    }
  }
  return live
}

/**
 * Pre-existing edges among `ids` **as of** the commit `versionstamp`, reconstructed
 * by replaying each edge table's changefeed from genesis up to that versionstamp.
 * This is the workaround for the VERSION-scan bug (deletes ignored); replay honours
 * them. `SINCE` a far-past datetime (no LIMIT — LIMIT is broken).
 */
export async function replayEdgesAmong(ids: string[], versionstamp: string): Promise<ExistingEdge[]> {
  if (ids.length < 2) return []
  const db = await getDb()
  const target = BigInt(versionstamp)
  const idset = new Set(ids)
  const out: ExistingEdge[] = []
  for (const kind of ['part_of', 'blocked_by', 'mentions'] as const) {
    const [rows] = await db.query<[EdgeRow[]]>(`SHOW CHANGES FOR TABLE ${kind} SINCE d"1970-01-01T00:00:00Z"`)
    for (const e of replayLiveEdges(rows ?? [], target).values())
      if (idset.has(e.source) && idset.has(e.target)) out.push({ ...e, kind })
  }
  return out
}

/**
 * Native time-travel topology via `VERSION`-scan. Currently WRONG in 3.0.5 (returns
 * deleted edges) — kept as the drop-in for `replayEdgesAmong` for when the engine
 * fix lands (the regression tripwire test signals when). See ADR-0025.
 */
export async function scanEdgesAmongAt(ids: string[], committedAt: string): Promise<ExistingEdge[]> {
  if (ids.length < 2) return []
  const db = await getDb()
  const params = { ids: ids.map(s => new StringRecordId(s)) }
  const [rows] = await db.query<[Array<{ in: unknown; out: unknown; kind: string }>]>(
    `SELECT in, out, meta::tb(id) AS kind FROM part_of, blocked_by, mentions
     WHERE in IN $ids AND out IN $ids VERSION d"${committedAt}"`,
    params
  )
  return (rows ?? []).map(r => ({ source: String(r.in), target: String(r.out), kind: r.kind }))
}
