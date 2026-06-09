import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type RecordId, StringRecordId, type Surreal } from 'surrealdb'
import { z } from 'zod'
import { RECORD_ID_RE } from '../domain'
import { edgeLabel, nodeLabel } from '../serialize'
import { getDb, selectByIds } from '../surreal'
import { defineTool, jsonBlock } from './define-tool'
import { type GraphNodeRecord, idStr, tableOf } from './graph-records'

export const traceProvenanceShape = {
  id: z
    .string()
    .regex(RECORD_ID_RE, 'Must be a record id like "note:abc" or "block:xyz"')
    .describe('A note or block id whose provenance to trace')
}

const traceProvenanceSchema = z.object(traceProvenanceShape)
export type TraceProvenanceInput = z.infer<typeof traceProvenanceSchema>

export type ProvenanceSource = { id: string; label: string; transformation: string; via?: string }
export type ProvenanceLink = {
  relation: 'about' | 'affects'
  id: string
  label: string
  action?: string
  summary?: string
}
export type ProvenanceTrace = {
  id: string
  label: string
  /** raw_captures this derives from — directly (block) or via interpreting blocks (note). */
  sources: ProvenanceSource[]
  /** notes the block is about/affects (block id), or blocks that interpret the note (note id). */
  links: ProvenanceLink[]
}

type DerivedRow = { in: RecordId; out: RecordId; transformation?: string }
type EdgeRow = { in: RecordId; out: RecordId; action?: string; summary?: string }

export type BlockProvenance = { derived_from: number; transformation: string | null }

/** Pure: aggregate derived_from rows into per-block provenance — count per block
 * and keep the first non-null transformation as the representative one. No
 * mutation of accumulators: each step spreads a fresh entry into a new Map. */
export function aggregateBlockProvenance(rows: { in: RecordId; transformation?: string }[]): Map<string, BlockProvenance> {
  return rows.reduce((map, r) => {
    const block = idStr(r.in)
    const cur = map.get(block) ?? { derived_from: 0, transformation: null }
    return map.set(block, {
      derived_from: cur.derived_from + 1,
      // Keep the first non-empty transformation seen (mirrors the original
      // `if (!cur.transformation)` guard — empty/null yields to the new row).
      transformation: cur.transformation || (r.transformation ?? null)
    })
  }, new Map<string, BlockProvenance>())
}

/**
 * Per-block provenance signal: how many raw_captures each block derives from and
 * a representative `transformation` (verbatim/extracted/summarized/inferred). Lets
 * search hits flag what's backed by evidence vs inferred, without a full trace.
 */
export async function provenanceByBlock(blockIds: string[]): Promise<Map<string, BlockProvenance>> {
  if (blockIds.length === 0) return new Map<string, BlockProvenance>()
  const db = await getDb()
  const refs = blockIds.map(id => new StringRecordId(id))
  const [rows] = await db.query<[{ in: RecordId; transformation?: string }[]]>(
    'SELECT in, transformation FROM derived_from WHERE in IN $ids',
    { ids: refs }
  )
  return aggregateBlockProvenance(rows ?? [])
}

type Gathered = { sources: ProvenanceSource[]; links: ProvenanceLink[]; needLabels: Set<string> }

/** Outgoing trace from a block: what it derives from + what it is about/affects. */
async function traceFromBlock(db: Surreal, ref: StringRecordId): Promise<Gathered> {
  const [derived] = await db.query<[DerivedRow[]]>('SELECT in, out, transformation FROM derived_from WHERE in = $id', {
    id: ref
  })
  const [about] = await db.query<[EdgeRow[]]>('SELECT in, out FROM about WHERE in = $id', { id: ref })
  const [affects] = await db.query<[EdgeRow[]]>('SELECT in, out, action, summary FROM affects WHERE in = $id', {
    id: ref
  })
  const sources: ProvenanceSource[] = (derived ?? []).map(r => {
    const id = idStr(r.out)
    return { id, label: id, transformation: r.transformation ?? 'inferred' }
  })
  const aboutLinks: ProvenanceLink[] = (about ?? []).map(r => {
    const id = idStr(r.out)
    return { relation: 'about', id, label: id }
  })
  const affectsLinks: ProvenanceLink[] = (affects ?? []).map(r => {
    const id = idStr(r.out)
    return { relation: 'affects', id, label: id, action: r.action, summary: r.summary }
  })
  const links = [...aboutLinks, ...affectsLinks]
  const needLabels = new Set([...sources, ...links].map(x => x.id))
  return { sources, links, needLabels }
}

/** Pure: build an incoming ProvenanceLink from an edge row (block -> note). */
function toIncomingLink(relation: 'about' | 'affects', r: EdgeRow): ProvenanceLink {
  const id = idStr(r.in)
  return { relation, id, label: id, action: r.action, summary: r.summary }
}

/** Incoming trace for a note: the blocks that interpret it + their raw sources. */
async function traceFromNote(db: Surreal, ref: StringRecordId): Promise<Gathered> {
  const [about] = await db.query<[EdgeRow[]]>('SELECT in, out FROM about WHERE out = $id', { id: ref })
  const [affects] = await db.query<[EdgeRow[]]>('SELECT in, out, action, summary FROM affects WHERE out = $id', {
    id: ref
  })
  const links: ProvenanceLink[] = [
    ...(about ?? []).map(r => toIncomingLink('about', r)),
    ...(affects ?? []).map(r => toIncomingLink('affects', r))
  ]
  const blockIds = new Set(links.map(l => l.id))

  const sources = await traceNoteSources(db, blockIds)
  const needLabels = new Set<string>([...links.map(l => l.id), ...sources.map(s => s.id)])
  return { sources, links, needLabels }
}

/** Fetch the raw_captures behind a note's interpreting blocks. The size guard
 * keeps the second fetch off the wire when there are no blocks to chase. */
async function traceNoteSources(db: Surreal, blockIds: Set<string>): Promise<ProvenanceSource[]> {
  if (blockIds.size === 0) return []
  const refs = [...blockIds].map(b => new StringRecordId(b))
  const [derived] = await db.query<[DerivedRow[]]>('SELECT in, out, transformation FROM derived_from WHERE in IN $ids', {
    ids: refs
  })
  return (derived ?? []).map(r => ({
    id: idStr(r.out),
    label: idStr(r.out),
    transformation: r.transformation ?? 'inferred',
    via: idStr(r.in)
  }))
}

/**
 * Trace where a note or block comes from: the raw_captures it derives from (with
 * their `transformation` — verbatim vs inferred) and the about/affects links.
 * Lets the agent CITE provenance and tell "you said this" from "I inferred this".
 * Read-only.
 */
export async function traceProvenanceImpl(input: TraceProvenanceInput): Promise<ProvenanceTrace | null> {
  const db = await getDb()
  const ref = new StringRecordId(input.id)
  const table = tableOf(input.id)
  if (table !== 'note' && table !== 'block') {
    throw new Error(`trace_provenance accepts only note: or block: ids, got ${input.id}`)
  }

  const [self] = await selectByIds<GraphNodeRecord>([input.id])
  if (!self) return null

  const { sources, links, needLabels } =
    table === 'block' ? await traceFromBlock(db, ref) : await traceFromNote(db, ref)

  const labelRecords = await selectByIds<GraphNodeRecord>([...needLabels])
  const labels = new Map(labelRecords.map(r => [idStr(r.id), nodeLabel(r)]))
  const relabel = <T extends { id: string; label: string }>(x: T): T => ({ ...x, label: labels.get(x.id) ?? x.id })

  return {
    id: input.id,
    label: nodeLabel(self),
    sources: sources.map(relabel),
    links: links.map(relabel)
  }
}

function verbalize(t: ProvenanceTrace): string {
  const lines = [`${t.label}   ${t.id}`]
  if (t.sources.length > 0) {
    lines.push('deriva de:')
    for (const s of t.sources)
      lines.push(`  - ${s.label} (${s.transformation})${s.via ? ` [vía ${s.via}]` : ''}   ${s.id}`)
  }
  for (const kind of ['about', 'affects'] as const) {
    const group = t.links.filter(l => l.relation === kind)
    if (group.length === 0) continue
    lines.push(`${edgeLabel(kind)}:`)
    for (const l of group) {
      const meta = l.action ? ` (${l.action}${l.summary ? `: ${l.summary}` : ''})` : ''
      lines.push(`  - ${l.label}${meta}   ${l.id}`)
    }
  }
  if (t.sources.length === 0 && t.links.length === 0) lines.push('(sin procedencia registrada)')
  return lines.join('\n')
}

export function registerTraceProvenance(server: McpServer): void {
  defineTool(
    server,
    'trace_provenance',
    'Trace where a note or block comes from: the raw_captures it derives from (with their transformation — verbatim/extracted/summarized/inferred) and its about/affects links. Use it to cite sources and distinguish what the user said from what was inferred.',
    traceProvenanceShape,
    async args => {
      const trace = await traceProvenanceImpl(args)
      if (!trace) return { content: [{ type: 'text', text: `Not found: ${args.id}` }] }
      return { content: [{ type: 'text', text: verbalize(trace) }, jsonBlock(trace)] }
    }
  )
}
