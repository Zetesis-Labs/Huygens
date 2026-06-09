import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StringRecordId, type Surreal } from 'surrealdb'
import { z } from 'zod'
import { RECORD_ID_RE } from '../domain'
import { noteTypeSlug } from '../serialize'
import { getDb, selectByIds } from '../surreal'
import { defineTool, jsonBlock } from './define-tool'
import { type GraphNodeRecord, idStr, type RecordIdish, tableOf } from './graph-records'

const EDGE_PREDICATES = new Set(['part_of', 'blocked_by', 'mentions', 'about', 'affects', 'derived_from'])

export const checkClaimShape = {
  claims: z
    .array(
      z.object({
        subject: z
          .string()
          .regex(RECORD_ID_RE, 'Must be a record id')
          .describe('Subject record id (note:/block:/raw_capture:)'),
        predicate: z
          .enum(['part_of', 'blocked_by', 'mentions', 'about', 'affects', 'derived_from', 'state', 'type'])
          .describe('An edge kind, or a note attribute (state | type)'),
        object: z
          .string()
          .min(1)
          .describe('A record id for edge predicates; a value (e.g. ACTIVE, task) for state/type')
      })
    )
    .min(1)
    .max(20)
    .describe('A claim decomposed into triples to verify against the graph')
}

const checkClaimSchema = z.object(checkClaimShape)
export type CheckClaimInput = z.infer<typeof checkClaimSchema>

type Claim = { subject: string; predicate: string; object: string }
export type Verdict = 'supported' | 'contradicted' | 'unsupported'
export type ClaimResult = Claim & { verdict: Verdict; detail?: string }

type EdgeFacts = { hasEdge: boolean; actualParent: string | null }

/** Decide a relation verdict from the fetched edge facts. `contradicted` is
 * reserved for the single-parent part_of: claiming a parent when a *different*
 * one exists. Other (multi-valued) edges can only be supported or unsupported —
 * absence isn't a contradiction. */
function decideEdge(c: Claim, facts: EdgeFacts): ClaimResult {
  if (facts.hasEdge) return { ...c, verdict: 'supported' }
  if (c.predicate === 'part_of' && facts.actualParent && facts.actualParent !== c.object)
    return { ...c, verdict: 'contradicted', detail: `part_of real: ${facts.actualParent}` }
  return { ...c, verdict: 'unsupported' }
}

/** Fetch the edge facts for a relation claim, then decide the verdict purely. */
async function checkEdge(db: Surreal, c: Claim): Promise<ClaimResult> {
  const s = new StringRecordId(c.subject)
  const o = new StringRecordId(c.object)
  const [hit] = await db.query<[{ id: unknown }[]]>(
    `SELECT id FROM ${c.predicate} WHERE in = $s AND out = $o LIMIT 1`,
    {
      s,
      o
    }
  )
  const hasEdge = (hit ?? []).length > 0
  if (hasEdge || c.predicate !== 'part_of') return decideEdge(c, { hasEdge, actualParent: null })
  const [parents] = await db.query<[RecordIdish[]]>('SELECT VALUE out FROM part_of WHERE in = $s', { s })
  const actual = (parents ?? [])[0]
  return decideEdge(c, { hasEdge, actualParent: actual ? idStr(actual) : null })
}

/** Decide a note-attribute verdict from the fetched record (or null). */
function decideAttr(c: Claim, rec: GraphNodeRecord | undefined): ClaimResult {
  if (tableOf(c.subject) !== 'note') return { ...c, verdict: 'unsupported', detail: 'state/type solo aplican a note:' }
  if (!rec) return { ...c, verdict: 'unsupported', detail: 'el sujeto no existe' }
  const actual = c.predicate === 'state' ? (rec.state ?? '') : noteTypeSlug(rec.type)
  if (actual === c.object) return { ...c, verdict: 'supported' }
  return { ...c, verdict: 'contradicted', detail: `valor real: ${actual || '(ninguno)'}` }
}

/** Fetch the note record for an attribute claim (state | type), then decide. */
async function checkAttr(c: Claim): Promise<ClaimResult> {
  if (tableOf(c.subject) !== 'note') return decideAttr(c, undefined)
  const [rec] = await selectByIds<GraphNodeRecord>([c.subject])
  return decideAttr(c, rec)
}

/**
 * Faithfulness check: the agent decomposes a claim into triples (subject record
 * id, predicate from the graph vocabulary, object) and the graph returns per
 * triple `supported` / `contradicted` / `unsupported`. `contradicted` is the one
 * that matters — it catches an assertion that conflicts with the stored topology
 * or state (e.g. a wrong parent or a wrong status). Read-only.
 */
export async function checkClaimImpl(input: CheckClaimInput): Promise<ClaimResult[]> {
  const db = await getDb()
  const checkClaim = (c: Claim): Promise<ClaimResult> =>
    EDGE_PREDICATES.has(c.predicate) ? checkEdge(db, c) : checkAttr(c)
  // Chained reduce keeps the I/O strictly sequential (wave 4 owns parallelism).
  return input.claims.reduce<Promise<ClaimResult[]>>(
    (acc, c) => acc.then(async results => [...results, await checkClaim(c)]),
    Promise.resolve([])
  )
}

function verbalize(results: ClaimResult[]): string {
  const mark = { supported: '✓', contradicted: '✗', unsupported: '·' }
  const lines = results.map(
    r =>
      `${mark[r.verdict]} ${r.verdict.toUpperCase()}  ${r.subject} —${r.predicate}→ ${r.object}${r.detail ? `  (${r.detail})` : ''}`
  )
  const contradicted = results.filter(r => r.verdict === 'contradicted').length
  const header = contradicted > 0 ? `⚠ ${contradicted} afirmación(es) CONTRADICEN el grafo` : 'sin contradicciones'
  return `${header}\n${lines.join('\n')}`
}

export function registerCheckClaim(server: McpServer): void {
  defineTool(
    server,
    'check_claim',
    'Faithfulness check: decompose a claim into triples (subject id, predicate from the graph vocabulary part_of/blocked_by/mentions/about/affects/derived_from or attribute state/type, object) and get per triple supported/contradicted/unsupported against the graph. Use it before asserting topology or status to the user.',
    checkClaimShape,
    async args => {
      const results = await checkClaimImpl(args)
      return { content: [{ type: 'text', text: verbalize(results) }, jsonBlock(results)] }
    }
  )
}
