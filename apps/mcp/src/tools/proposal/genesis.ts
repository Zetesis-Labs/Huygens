import { StringRecordId } from 'surrealdb'
import { getDb } from '../../surreal'
import type {
  StoredAbout,
  StoredAffect,
  StoredEdge,
  StoredNarrativeBlock,
  StoredNoteCreate,
  StoredProposalPayload
} from './schemas'

/** Normalize a stored temporal value (Date or string) to ISO. Pure. */
function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

type NoteRow = {
  id: unknown
  type_slug: string
  title: string
  state: string
  mit_for: unknown
  due_at: unknown
  defer_until: unknown
  metadata: unknown
  block_order: unknown[]
}
type NarrativeRow = { id: unknown; content: string; kind: string | null; raws: unknown[] }
type AboutRow = { blk: unknown; nte: unknown }
type AffectRow = { blk: unknown; nte: unknown; action: string; summary: string | null }
type EdgeRow = { kind: string; src: unknown; dst: unknown }

/** The raw row arrays read from the live graph, before any domain transform. */
export type GenesisRows = {
  notes: NoteRow[]
  descContentByBlockId: Map<string, string>
  nblocks: NarrativeRow[]
  about: AboutRow[]
  affects: AffectRow[]
  edges: EdgeRow[]
}

function toNoteCreate(n: NoteRow, descContentByBlockId: Map<string, string>): StoredNoteCreate {
  const meta = n.metadata as Record<string, unknown> | null | undefined
  return {
    id: String(n.id),
    type_slug: n.type_slug,
    title: n.title,
    state: n.state,
    ...(n.mit_for != null ? { mit_for: toIso(n.mit_for) } : {}),
    ...(n.due_at != null ? { due_at: toIso(n.due_at) } : {}),
    ...(n.defer_until != null ? { defer_until: toIso(n.defer_until) } : {}),
    ...(meta != null && Object.keys(meta).length > 0 ? { metadata: meta } : {}),
    descriptive_blocks: (n.block_order ?? [])
      .map(b => ({ id: String(b), content: descContentByBlockId.get(String(b)) }))
      .filter((d): d is { id: string; content: string } => d.content != null)
  }
}

function toNarrativeBlock(b: NarrativeRow): StoredNarrativeBlock {
  return {
    id: String(b.id),
    content: b.content,
    raw_ids: (b.raws ?? []).map(r => String(r)),
    // Carry the ritual kind through the genesis snapshot so a replay preserves the
    // Bitácora (plan_day/review_day). Without this a rebuild would silently drop it.
    ...(b.kind != null ? { kind: b.kind } : {})
  }
}

function toAbout(a: AboutRow): StoredAbout {
  return { block_id: String(a.blk), note_id: String(a.nte) }
}

function toAffect(a: AffectRow): StoredAffect {
  return {
    block_id: String(a.blk),
    note_id: String(a.nte),
    action: a.action,
    ...(a.summary != null ? { summary: a.summary } : {})
  }
}

function toEdge(e: EdgeRow): StoredEdge {
  return { kind: e.kind, from: String(e.src), to: String(e.dst) }
}

/**
 * Assemble the genesis payload from the already-fetched raw row arrays. Pure: all
 * the non-obvious domain rules (date normalization, conditional optional fields,
 * ritual-kind carry-through, descriptive-block content join, raw_ids dedup) live
 * here and are testable without a live DB.
 */
export function assembleGenesisPayload(rows: GenesisRows): StoredProposalPayload {
  const narrative_blocks = rows.nblocks.map(toNarrativeBlock)
  return {
    raw_ids: [...new Set(narrative_blocks.flatMap(b => b.raw_ids))],
    narrative_blocks,
    note_creates: rows.notes.map(n => toNoteCreate(n, rows.descContentByBlockId)),
    note_updates: [],
    edges: rows.edges.map(toEdge),
    edges_remove: [],
    about: rows.about.map(toAbout),
    affects: rows.affects.map(toAffect)
  }
}

/**
 * Serialize the live graph into ONE máximo-limpio payload, using the real record
 * ids that already exist. Replaying this payload (buildReplayTx) recreates the
 * current graph faithfully. This is the "genesis" snapshot that flattens the old,
 * un-replayable history (legacy temp_id payloads, many without a temp→real map)
 * into a single committed proposal — the first event of the event-sourced log.
 *
 * Caveat (inherited from rebuild): descriptive-block ids regenerate on replay, so
 * NOTHING must reference a descriptive block (about/affects/mentions point at
 * narrative blocks and notes). assertGenesisSafe() checks this.
 */
export async function buildGenesisPayload(): Promise<StoredProposalPayload> {
  const db = await getDb()

  const [notes] = await db.query<[NoteRow[]]>(
    'SELECT id, type.slug AS type_slug, title, state, mit_for, due_at, defer_until, metadata, block_order FROM note'
  )

  const [descs] = await db.query<[Array<{ id: unknown; content: string }>]>(
    "SELECT id, content FROM block WHERE block_kind = 'descriptive'"
  )
  const descContentByBlockId = new Map<string, string>((descs ?? []).map(d => [String(d.id), d.content] as const))

  const [nblocks] = await db.query<[NarrativeRow[]]>(
    "SELECT id, content, kind, ->derived_from->raw_capture AS raws FROM block WHERE block_kind = 'narrative'"
  )

  const [about] = await db.query<[AboutRow[]]>('SELECT in AS blk, out AS nte FROM about')

  const [affects] = await db.query<[AffectRow[]]>('SELECT in AS blk, out AS nte, action, summary FROM affects')

  const [edges] = await db.query<[EdgeRow[]]>(
    'SELECT meta::tb(id) AS kind, in AS src, out AS dst FROM part_of, blocked_by, mentions'
  )

  return assembleGenesisPayload({
    notes: notes ?? [],
    descContentByBlockId,
    nblocks: nblocks ?? [],
    about: about ?? [],
    affects: affects ?? [],
    edges: edges ?? []
  })
}

/** No edge/topology ref may point at a record that the payload doesn't recreate
 * with a stable id. Descriptive blocks regenerate on replay, so they must not be
 * referenced; every edge/about/affects endpoint must be a note or narrative block
 * the payload itself creates. Throws with the offending refs otherwise. */
function badEdgeRefs(edges: StoredProposalPayload['edges'], known: (id: string) => boolean): string[] {
  return edges.flatMap(e => [
    ...(known(e.from) ? [] : [`edge.from ${e.from}`]),
    ...(known(e.to) ? [] : [`edge.to ${e.to}`])
  ])
}

function badAboutRefs(
  about: StoredProposalPayload['about'],
  noteIds: Set<string>,
  narrativeIds: Set<string>
): string[] {
  return about.flatMap(a => [
    ...(narrativeIds.has(a.block_id) ? [] : [`about.block ${a.block_id}`]),
    ...(noteIds.has(a.note_id) ? [] : [`about.note ${a.note_id}`])
  ])
}

function badAffectsRefs(
  affects: StoredProposalPayload['affects'],
  noteIds: Set<string>,
  narrativeIds: Set<string>
): string[] {
  return affects.flatMap(a => [
    ...(narrativeIds.has(a.block_id) ? [] : [`affects.block ${a.block_id}`]),
    ...(noteIds.has(a.note_id) ? [] : [`affects.note ${a.note_id}`])
  ])
}

export function assertGenesisSafe(p: StoredProposalPayload): void {
  const noteIds = new Set(p.note_creates.map(n => n.id))
  const narrativeIds = new Set(p.narrative_blocks.map(b => b.id))
  const known = (id: string): boolean => noteIds.has(id) || narrativeIds.has(id)
  const bad = [
    ...badEdgeRefs(p.edges, known),
    ...badAboutRefs(p.about, noteIds, narrativeIds),
    ...badAffectsRefs(p.affects, noteIds, narrativeIds)
  ]
  if (bad.length > 0) throw new Error(`genesis not safe — refs to non-recreated records:\n  ${bad.join('\n  ')}`)
}

export type GenesisReport = {
  notes: number
  narrative_blocks: number
  descriptive_blocks: number
  edges: number
  about: number
  affects: number
  raws: number
  superseded: number
  committed_at: string
}

const GENESIS_ID = 'proposal:genesis'

/** The genesis commit anchor from the earliest note's birth: a Date passes through,
 * a string is parsed, and a missing value falls back to epoch 0 so the genesis is
 * guaranteed to sort before every real commit. Pure. */
function deriveGenesisCommittedAt(earliest: unknown): Date {
  if (earliest instanceof Date) return earliest
  return earliest != null ? new Date(String(earliest)) : new Date(0)
}

/** The genesis report from the assembled payload + how many proposals were
 * superseded. Pure. */
function buildGenesisReport(
  payload: StoredProposalPayload,
  committedAt: Date,
  superseded: number
): GenesisReport {
  return {
    notes: payload.note_creates.length,
    narrative_blocks: payload.narrative_blocks.length,
    descriptive_blocks: payload.note_creates.reduce((n, c) => n + c.descriptive_blocks.length, 0),
    edges: payload.edges.length,
    about: payload.about.length,
    affects: payload.affects.length,
    raws: payload.raw_ids.length,
    superseded,
    committed_at: committedAt.toISOString()
  }
}

/**
 * Commit the genesis: (1) widen the status enum to allow 'superseded', (2) mark
 * every currently-committed (legacy) proposal as 'superseded' so it leaves the
 * fold/rebuild window, (3) insert the genesis proposal (committed). The live graph
 * is NOT touched — it already is what genesis describes. `committed_at` anchors
 * before all future commits (earliest note's birth).
 */
export async function commitGenesis(opts: {
  apply: boolean
}): Promise<{ report: GenesisReport; payload: StoredProposalPayload }> {
  const db = await getDb()
  const payload = await buildGenesisPayload()
  assertGenesisSafe(payload)

  const [minRows] = await db.query<[Array<{ ca: unknown }>]>(
    'SELECT created_at AS ca FROM note ORDER BY created_at ASC LIMIT 1'
  )
  const committedAt = deriveGenesisCommittedAt(minRows?.[0]?.ca)

  if (!opts.apply) return { report: buildGenesisReport(payload, committedAt, 0), payload }

  // 1. widen the enum (idempotent OVERWRITE)
  await db.query(
    "DEFINE FIELD OVERWRITE status ON proposal TYPE string DEFAULT 'draft' ASSERT $value INSIDE ['draft', 'committed', 'discarded', 'superseded'];"
  )
  // 2. supersede the legacy committed proposals
  const [sup] = await db.query<[Array<unknown>]>(
    "UPDATE proposal SET status = 'superseded' WHERE status = 'committed' RETURN BEFORE"
  )
  const report = buildGenesisReport(payload, committedAt, (sup ?? []).length)
  // 3. insert genesis (the graph itself is untouched)
  await db.query('CREATE $id CONTENT $data', {
    id: new StringRecordId(GENESIS_ID),
    data: {
      status: 'committed',
      raw_captures: payload.raw_ids.map(r => new StringRecordId(r)),
      payload,
      result: { versionstamp: null, committed_at: committedAt }
    }
  })
  return { report, payload }
}
