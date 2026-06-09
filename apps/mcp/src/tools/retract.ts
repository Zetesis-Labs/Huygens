import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { ALL_EDGE_TABLES, SourceKindSchema } from '../domain'
import { QueryError } from '../errors'
import { emitEvent, newSessionId } from '../events'
import { getDb } from '../surreal'
import { defineTool } from './define-tool'

/**
 * Auditable retraction. Huygens has no other delete path: this is how a
 * mistaken ingest, a correction, or a "forget this" lands in the graph. It is
 * NOT a raw delete — every retraction runs in one atomic transaction and emits
 * a `retracted` agent_event (intent), while the CHANGEFEED keeps the exact diff
 * (state). That satisfies the system-wide audit guarantee: nothing mutates
 * silently.
 *
 * Targets are selected by explicit ids and/or by raw_capture source. Cascade is
 * deliberate and minimal:
 *   - deleting a NOTE also deletes the descriptive blocks it owns (they cannot
 *     outlive their note); narrative blocks (note = NONE) are never cascaded.
 *   - deleting a BLOCK prunes it from its owner note's block_order.
 *   - deleting a RAW_CAPTURE does NOT cascade to derived blocks (a block may
 *     derive from several raws); only the raw and its incident edges go.
 * Every deleted record drops all of its incident graph edges, in all six edge
 * tables, in the same transaction — no dangling edges are left behind.
 *
 * `dry_run` defaults to true: the first call always previews, never deletes.
 */
export const retractShape = {
  ids: z
    .array(z.string())
    .optional()
    .describe('Explicit record ids to retract: raw_capture / note / block. Other tables are rejected.'),
  source_kind: SourceKindSchema.optional().describe('Also select raw_captures whose source_kind matches.'),
  source_ref: z.string().min(1).optional().describe('Also select raw_captures whose source_ref matches.'),
  dry_run: z
    .boolean()
    .default(true)
    .describe('Preview only (default true). Pass false to actually delete. Destructive when false.')
}

const retractSchema = z.object(retractShape)
export type RetractInput = z.infer<typeof retractSchema>

const RETRACTABLE = ['raw_capture', 'note', 'block'] as const

export type RetractResult = {
  dry_run: boolean
  raw_captures: string[]
  notes: string[]
  /** Blocks to delete, including descriptive blocks cascaded from deleted notes. */
  blocks: string[]
  /** Surviving notes whose block_order was pruned of a deleted block. */
  block_order_cleaned: string[]
  /** Incident edges removed, per edge table. */
  edges_removed: Record<string, number>
}

const rid = (id: string): StringRecordId => new StringRecordId(id)

type IdRow = { id: { toString(): string } }

type Db = Awaited<ReturnType<typeof getDb>>

type RetractableTable = (typeof RETRACTABLE)[number]

/** Pure validation: returns the retractable table of an id, or throws if it is not retractable. */
function assertRetractable(id: string): RetractableTable {
  const table = id.split(':')[0]
  if (table === 'raw_capture' || table === 'note' || table === 'block') return table
  throw new QueryError(`cannot retract "${id}": only ${RETRACTABLE.join(' / ')} are retractable`, { id })
}

/** Bucket explicit ids by table, rejecting anything that is not retractable. */
function partitionIds(ids: string[]): { raws: Set<string>; notes: Set<string>; blocks: Set<string> } {
  const classified = ids.map(id => [assertRetractable(id), id] as const)
  const idsOfTable = (table: RetractableTable): Set<string> =>
    new Set(classified.filter(([t]) => t === table).map(([, id]) => id))
  return { raws: idsOfTable('raw_capture'), notes: idsOfTable('note'), blocks: idsOfTable('block') }
}

/** raw_capture ids matching the source_kind / source_ref selectors (empty if none given). */
async function rawsBySource(db: Db, input: RetractInput): Promise<string[]> {
  if (!input.source_kind && !input.source_ref) return []
  const clauses: string[] = []
  const bind: Record<string, unknown> = {}
  if (input.source_kind) {
    clauses.push('source_kind = $sk')
    bind.sk = input.source_kind
  }
  if (input.source_ref) {
    clauses.push('source_ref = $sr')
    bind.sr = input.source_ref
  }
  const [rows] = await db.query<[IdRow[]]>(`SELECT id FROM raw_capture WHERE ${clauses.join(' AND ')}`, bind)
  return rows.map(r => r.id.toString())
}

/** Count incident edges per edge table for the full target set. */
async function countIncidentEdges(db: Db, all: StringRecordId[]): Promise<Record<string, number>> {
  const edges_removed: Record<string, number> = {}
  for (const table of ALL_EDGE_TABLES) {
    const [rows] = await db.query<[{ count: number }[]]>(
      `SELECT count() AS count FROM ${table} WHERE in IN $all OR out IN $all GROUP ALL`,
      { all }
    )
    edges_removed[table] = rows[0]?.count ?? 0
  }
  return edges_removed
}

async function resolve(input: RetractInput): Promise<RetractResult> {
  const db = await getDb()
  if (!input.ids?.length && !input.source_kind && !input.source_ref) {
    throw new QueryError('retract needs a selector: pass ids, source_kind, or source_ref')
  }

  const { raws: rawSet, notes: noteSet, blocks: blockSet } = partitionIds(input.ids ?? [])
  const allRaws = new Set([...rawSet, ...(await rawsBySource(db, input))])

  // Cascade: descriptive blocks owned by the targeted notes.
  const ownedBlockIds = await (async (): Promise<string[]> => {
    if (noteSet.size === 0) return []
    const [owned] = await db.query<[IdRow[]]>('SELECT id FROM block WHERE note IN $ids', {
      ids: [...noteSet].map(rid)
    })
    return owned.map(r => r.id.toString())
  })()
  const allBlocks = new Set([...blockSet, ...ownedBlockIds])

  // Keep only records that actually exist, so the preview is honest.
  const [existNotes] = await db.query<[IdRow[]]>('SELECT id FROM note WHERE id IN $ids', {
    ids: [...noteSet].map(rid)
  })
  const [existBlocks] = await db.query<[IdRow[]]>('SELECT id FROM block WHERE id IN $ids', {
    ids: [...allBlocks].map(rid)
  })
  const [existRaws] = await db.query<[IdRow[]]>('SELECT id FROM raw_capture WHERE id IN $ids', {
    ids: [...allRaws].map(rid)
  })
  const notes = existNotes.map(r => r.id.toString())
  const blocks = existBlocks.map(r => r.id.toString())
  const raws = existRaws.map(r => r.id.toString())

  const edges_removed = await countIncidentEdges(db, [...notes, ...blocks, ...raws].map(rid))
  const [cleanRows] = await db.query<[IdRow[]]>(
    'SELECT id FROM note WHERE block_order ANYINSIDE $blocks AND id NOT IN $notes',
    { blocks: blocks.map(rid), notes: notes.map(rid) }
  )
  const block_order_cleaned = cleanRows.map(r => r.id.toString())

  return { dry_run: input.dry_run ?? true, raw_captures: raws, notes, blocks, block_order_cleaned, edges_removed }
}

async function execute(plan: RetractResult): Promise<void> {
  const db = await getDb()
  const params = {
    all: [...plan.notes, ...plan.blocks, ...plan.raw_captures].map(rid),
    notes: plan.notes.map(rid),
    blocks: plan.blocks.map(rid),
    raws: plan.raw_captures.map(rid),
    cleanNotes: plan.block_order_cleaned.map(rid)
  }
  const lines = [
    'BEGIN;',
    'UPDATE note SET block_order = array::complement(block_order, $blocks) WHERE id IN $cleanNotes;',
    ...ALL_EDGE_TABLES.map(t => `DELETE ${t} WHERE in IN $all OR out IN $all;`),
    'DELETE block WHERE id IN $blocks;',
    'DELETE note WHERE id IN $notes;',
    'DELETE raw_capture WHERE id IN $raws;',
    'COMMIT;'
  ]
  await db.query(lines.join('\n'), params) // atomic: any failure rolls the whole retraction back

  await emitEvent({
    kind: 'retracted',
    actor: 'user',
    session_id: newSessionId(),
    payload: {
      raw_captures: plan.raw_captures,
      notes: plan.notes,
      blocks: plan.blocks,
      edges_removed: plan.edges_removed
    }
  })
}

export async function retractImpl(input: RetractInput): Promise<RetractResult> {
  // Safe by default: a missing dry_run means preview, never delete. The MCP
  // layer applies the zod default, but the impl must not depend on that — a
  // direct/library caller must opt in to deletion explicitly.
  const dryRun = input.dry_run ?? true
  const plan = await resolve(input)
  const empty = plan.notes.length + plan.blocks.length + plan.raw_captures.length === 0
  if (dryRun || empty) return plan
  await execute(plan)
  return { ...plan, dry_run: false }
}

function summarize(r: RetractResult): string {
  const edgeTotal = Object.values(r.edges_removed).reduce((a, b) => a + b, 0)
  const counts = `${r.notes.length} note(s), ${r.blocks.length} block(s), ${r.raw_captures.length} raw_capture(s), ${edgeTotal} edge(s)`
  if (r.notes.length + r.blocks.length + r.raw_captures.length === 0) return 'Nothing matched — nothing to retract.'
  if (r.dry_run) return `DRY RUN — would retract ${counts}. Re-run with dry_run:false to execute.`
  return `Retracted ${counts}.`
}

export function registerRetract(server: McpServer): void {
  defineTool(
    server,
    'retract',
    'Auditably delete records and their incident edges. The only delete path: use for a mistaken ingest, a correction, or "forget this". Select by ids (raw_capture/note/block) and/or raw_capture source. Deleting a note cascades its owned descriptive blocks; a block is pruned from its note\'s order; a raw_capture does not cascade to derived blocks. dry_run defaults to true — the first call previews; pass dry_run:false to actually delete. Atomic, and recorded as a retracted agent_event + changefeed diff.',
    retractShape,
    async args => {
      const result = await retractImpl(args)
      return {
        content: [
          { type: 'text', text: summarize(result) },
          { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(result, null, 2)}` }
        ]
      }
    }
  )
}
