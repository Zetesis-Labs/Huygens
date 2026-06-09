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

  const [notes] = await db.query<
    [
      Array<{
        id: unknown
        type_slug: string
        title: string
        state: string
        mit_for: unknown
        due_at: unknown
        defer_until: unknown
        metadata: unknown
        block_order: unknown[]
      }>
    ]
  >('SELECT id, type.slug AS type_slug, title, state, mit_for, due_at, defer_until, metadata, block_order FROM note')

  const [descs] = await db.query<[Array<{ id: unknown; content: string }>]>(
    "SELECT id, content FROM block WHERE block_kind = 'descriptive'"
  )
  const descContent = new Map<string, string>((descs ?? []).map(d => [String(d.id), d.content] as const))

  const note_creates: StoredNoteCreate[] = (notes ?? []).map(n => {
    const meta = n.metadata as Record<string, unknown> | null | undefined
    return {
      id: String(n.id),
      type_slug: n.type_slug,
      title: n.title,
      state: n.state,
      ...(n.mit_for != null
        ? { mit_for: n.mit_for instanceof Date ? n.mit_for.toISOString() : String(n.mit_for) }
        : {}),
      ...(n.due_at != null ? { due_at: n.due_at instanceof Date ? n.due_at.toISOString() : String(n.due_at) } : {}),
      ...(n.defer_until != null
        ? { defer_until: n.defer_until instanceof Date ? n.defer_until.toISOString() : String(n.defer_until) }
        : {}),
      ...(meta != null && Object.keys(meta).length > 0 ? { metadata: meta } : {}),
      descriptive_blocks: (n.block_order ?? [])
        .map(b => ({ id: String(b), content: descContent.get(String(b)) }))
        .filter((d): d is { id: string; content: string } => d.content != null)
    }
  })

  const [nblocks] = await db.query<[Array<{ id: unknown; content: string; kind: string | null; raws: unknown[] }>]>(
    "SELECT id, content, kind, ->derived_from->raw_capture AS raws FROM block WHERE block_kind = 'narrative'"
  )
  const narrative_blocks: StoredNarrativeBlock[] = (nblocks ?? []).map(b => ({
    id: String(b.id),
    content: b.content,
    raw_ids: (b.raws ?? []).map(r => String(r)),
    // Carry the ritual kind through the genesis snapshot so a replay preserves the
    // Bitácora (plan_day/review_day). Without this a rebuild would silently drop it.
    ...(b.kind != null ? { kind: b.kind } : {})
  }))

  const [about] = await db.query<[Array<{ blk: unknown; nte: unknown }>]>('SELECT in AS blk, out AS nte FROM about')
  const aboutArr: StoredAbout[] = (about ?? []).map(a => ({ block_id: String(a.blk), note_id: String(a.nte) }))

  const [affects] = await db.query<[Array<{ blk: unknown; nte: unknown; action: string; summary: string | null }>]>(
    'SELECT in AS blk, out AS nte, action, summary FROM affects'
  )
  const affectsArr: StoredAffect[] = (affects ?? []).map(a => ({
    block_id: String(a.blk),
    note_id: String(a.nte),
    action: a.action,
    ...(a.summary != null ? { summary: a.summary } : {})
  }))

  const [edges] = await db.query<[Array<{ kind: string; src: unknown; dst: unknown }>]>(
    'SELECT meta::tb(id) AS kind, in AS src, out AS dst FROM part_of, blocked_by, mentions'
  )
  const edgesArr: StoredEdge[] = (edges ?? []).map(e => ({ kind: e.kind, from: String(e.src), to: String(e.dst) }))

  const raw_ids = [...new Set(narrative_blocks.flatMap(b => b.raw_ids))]

  return {
    raw_ids,
    narrative_blocks,
    note_creates,
    note_updates: [],
    edges: edgesArr,
    edges_remove: [],
    about: aboutArr,
    affects: affectsArr
  }
}

/** No edge/topology ref may point at a record that the payload doesn't recreate
 * with a stable id. Descriptive blocks regenerate on replay, so they must not be
 * referenced; every edge/about/affects endpoint must be a note or narrative block
 * the payload itself creates. Throws with the offending refs otherwise. */
export function assertGenesisSafe(p: StoredProposalPayload): void {
  const noteIds = new Set(p.note_creates.map(n => n.id))
  const narrativeIds = new Set(p.narrative_blocks.map(b => b.id))
  const known = (id: string): boolean => noteIds.has(id) || narrativeIds.has(id)
  const bad: string[] = []
  for (const e of p.edges) {
    if (!known(e.from)) bad.push(`edge.from ${e.from}`)
    if (!known(e.to)) bad.push(`edge.to ${e.to}`)
  }
  for (const a of p.about) {
    if (!narrativeIds.has(a.block_id)) bad.push(`about.block ${a.block_id}`)
    if (!noteIds.has(a.note_id)) bad.push(`about.note ${a.note_id}`)
  }
  for (const a of p.affects) {
    if (!narrativeIds.has(a.block_id)) bad.push(`affects.block ${a.block_id}`)
    if (!noteIds.has(a.note_id)) bad.push(`affects.note ${a.note_id}`)
  }
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
  const earliest = minRows?.[0]?.ca
  const committedAt = earliest instanceof Date ? earliest : earliest != null ? new Date(String(earliest)) : new Date(0)

  const report: GenesisReport = {
    notes: payload.note_creates.length,
    narrative_blocks: payload.narrative_blocks.length,
    descriptive_blocks: payload.note_creates.reduce((n, c) => n + c.descriptive_blocks.length, 0),
    edges: payload.edges.length,
    about: payload.about.length,
    affects: payload.affects.length,
    raws: payload.raw_ids.length,
    superseded: 0,
    committed_at: committedAt.toISOString()
  }

  if (!opts.apply) return { report, payload }

  // 1. widen the enum (idempotent OVERWRITE)
  await db.query(
    "DEFINE FIELD OVERWRITE status ON proposal TYPE string DEFAULT 'draft' ASSERT $value INSIDE ['draft', 'committed', 'discarded', 'superseded'];"
  )
  // 2. supersede the legacy committed proposals
  const [sup] = await db.query<[Array<unknown>]>(
    "UPDATE proposal SET status = 'superseded' WHERE status = 'committed' RETURN BEFORE"
  )
  report.superseded = (sup ?? []).length
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
