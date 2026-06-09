import { type RecordId, StringRecordId } from 'surrealdb'
import { uuidv7 } from 'uuidv7'
import { QueryError } from '../../errors'
import { emitEvent, newSessionId } from '../../events'
import { getDb } from '../../surreal'
import { indexBlockImpl } from '../index-block'
import type { CommitProposalInput, CommitProposalResult, StoredNoteCreate, StoredProposalPayload } from './schemas'
import { requireDraftProposal } from './store'
import { assertProposalRefs, assertRawCapturesCommittable } from './validation'

/**
 * Normalize a day-granular field (mit_for / due_at / defer_until) to UTC midnight
 * of the date AS WRITTEN. These are day concepts, so a date-only input and a
 * TZ-laden datetime must land on the same instant — otherwise date-range queries
 * (overdue, today's MITs, dormant) drift (the stray `…T09:00:00+02:00` mit_for the
 * audit found). The YYYY-MM-DD prefix is validated upstream by DayDateSchema.
 */
function toDayUtcMidnight(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
}

/** Split items into fixed-size batches, preserving order. Pure. */
function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))
}

function buildNoteCreateData(note: StoredNoteCreate): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: note.title,
    type: new StringRecordId(`note_type:${note.type_slug}`),
    state: note.state
  }
  if (note.mit_for) data.mit_for = toDayUtcMidnight(note.mit_for)
  if (note.due_at) data.due_at = toDayUtcMidnight(note.due_at)
  if (note.defer_until) data.defer_until = toDayUtcMidnight(note.defer_until)
  if (note.metadata) data.metadata = note.metadata
  return data
}

/**
 * The versionstamp of the commit transaction, recovered from the proposal's own
 * changefeed entry. The proposal record is upserted inside the commit tx, so its
 * changefeed entry carries the transaction's (single, table-global) versionstamp —
 * the anchor for reading this commit's changeset (`SHOW CHANGES … SINCE <vs>`).
 *
 * Uses a DB-clock datetime captured before the commit and `SINCE d"<datetime>"`
 * (datetime SINCE works; `SINCE 0`/low-versionstamp and `LIMIT` are broken on
 * 3.0.5). Empirically reliable (verified 8/8). Returns the u64 as a string, or
 * null if nothing surfaced (then the changeset isn't changefeed-anchorable).
 */
type ChangefeedRow = { versionstamp: unknown; changes: Array<{ update?: { id?: unknown } }> }

/** Pure scan: the versionstamp of the changefeed row whose changes contain an
 * update of `id`, or null if none surfaced in this batch. */
function versionstampInRows(rows: ChangefeedRow[], id: string): string | null {
  const row = rows.find(
    r => r.versionstamp != null && (r.changes ?? []).some(change => change.update && String(change.update.id) === id)
  )
  return row ? String(row.versionstamp) : null
}

async function versionstampForProposal(proposalId: RecordId, since: string): Promise<string | null> {
  const db = await getDb()
  const id = String(proposalId)
  for (let attempt = 0; attempt < 5; attempt++) {
    const [rows] = await db.query<[ChangefeedRow[]]>(`SHOW CHANGES FOR TABLE proposal SINCE d"${since}"`)
    const versionstamp = versionstampInRows(rows ?? [], id)
    if (versionstamp != null) return versionstamp
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  return null
}

/**
 * Build the single SurrealQL transaction that materializes a committed proposal.
 * All mutations run in one BEGIN…COMMIT (atomic). The stored payload already
 * speaks real record ids (notes/blocks pre-assigned at create_proposal), so we
 * CREATE with explicit ids and RELATE directly — no temp→real bookkeeping. The
 * proposal is stamped with just `{versionstamp, committed_at}`: the changefeed is
 * the history, the payload (real ids) is the intent. No materialized id-lists.
 */
class CommitTx {
  readonly params: Record<string, unknown> = {}
  readonly lines: string[] = ['BEGIN;']
  private paramCount = 0
  /** True when this commit is a review_day ritual: its note_updates are the day's
   * dispositions, so we stamp last_reviewed_at on them (closing the day = reviewing
   * those notes). Set in build(); replay leaves it false. */
  private reviewRitual = false
  /** Ids of descriptive blocks created in this tx (generated here; nothing refs them). */
  readonly descriptiveIds: string[] = []
  /** The proposal whose commit/replay this tx materializes — stamped as
   * `via_proposal` on every edge it creates, so topology is auditable back to its
   * approved proposal. Set in build()/buildReplay(). */
  private proposalId = ''

  private addParam(value: unknown): string {
    const name = `v${this.paramCount++}`
    this.params[name] = value
    return `$${name}`
  }
  /** Param holding a real record id. */
  private addRecordIdParam(id: string): string {
    return this.addParam(new StringRecordId(id))
  }
  /** A CONTENT object param that always carries edge provenance (`via_proposal`),
   * merged with any edge-specific fields (reason, action, transformation, …). */
  private edgeContent(extra: Record<string, unknown> = {}): string {
    // M2a invariant lock: no edge may be created without provenance. edgeContent
    // is the single choke-point for every RELATE, so this guarantees via_proposal
    // is always stamped — a future code path that forgets to set proposalId fails
    // loudly here instead of silently writing a NONE-provenance edge.
    if (!this.proposalId) {
      throw new Error('commit invariant violated: every edge must carry via_proposal, but proposalId was not set')
    }
    return this.addParam({ ...extra, via_proposal: new StringRecordId(this.proposalId) })
  }

  private appendBlocks(noteId: string, blocks: { id?: string; content: string }[]): void {
    if (blocks.length === 0) return
    const ids: string[] = []
    for (const block of blocks) {
      // Use the id pre-assigned at create_proposal (stable across replay). Fall
      // back to a fresh id only for legacy payloads committed before descriptive
      // ids were stored (those still drift on replay; backfilled separately).
      const blockId = block.id ?? `block:${uuidv7().replace(/-/g, '')}`
      this.lines.push(
        `CREATE ${this.addRecordIdParam(blockId)} SET note = ${this.addRecordIdParam(noteId)}, block_kind = 'descriptive', content = ${this.addParam(block.content)} RETURN NONE;`
      )
      ids.push(blockId)
      this.descriptiveIds.push(blockId)
    }
    this.lines.push(
      `UPDATE ${this.addRecordIdParam(noteId)} SET block_order += ${this.addParam(ids.map(id => new StringRecordId(id)))};`
    )
  }

  private creates(payload: StoredProposalPayload): void {
    for (const note of payload.note_creates) {
      this.lines.push(
        `CREATE ${this.addRecordIdParam(note.id)} CONTENT ${this.addParam(buildNoteCreateData(note))} RETURN NONE;`
      )
      this.appendBlocks(note.id, note.descriptive_blocks)
    }
  }

  /** The SET clauses for one note_update, in stable order: title, state, the three
   * day-granular fields (null clears via NONE, a value sets UTC midnight, undefined
   * is skipped), the metadata merge, then the review-ritual stamp. Param-allocation
   * order matches this clause order. */
  private updateSetClauses(note: StoredProposalPayload['note_updates'][number]): string[] {
    const dayFields = ['mit_for', 'due_at', 'defer_until'] as const
    return [
      note.title != null && `title = ${this.addParam(note.title)}`,
      note.state != null && `state = ${this.addParam(note.state)}`,
      // Day-granular fields: null clears (SET NONE), a value sets UTC midnight.
      ...dayFields.map(field => {
        const value = note[field]
        if (value === null) return `${field} = NONE`
        if (value != null) return `${field} = ${this.addParam(toDayUtcMidnight(value))}`
        return false
      }),
      note.metadata_merge != null &&
        `metadata = object::extend(metadata ?? {}, ${this.addParam(note.metadata_merge)})`,
      // A review_day disposition reviews the note → stamp it (closes apuesta B,
      // makes the "never reviewed" radar actually work).
      this.reviewRitual && 'last_reviewed_at = time::now()'
    ].filter((clause): clause is string => Boolean(clause))
  }

  private updates(payload: StoredProposalPayload): void {
    for (const note of payload.note_updates) {
      const sets = this.updateSetClauses(note)
      if (sets.length > 0) {
        this.lines.push(`UPDATE ${this.addRecordIdParam(note.id)} SET ${sets.join(', ')} RETURN NONE;`)
      }
      this.appendBlocks(note.id, note.descriptive_blocks_append)
    }
  }

  private narratives(payload: StoredProposalPayload): void {
    for (const block of payload.narrative_blocks) {
      // Materialize the ritual `kind` on the block itself (plan_day/review_day…),
      // so the block is self-describing and replay/genesis preserve it. Absent for
      // a normal process informe.
      const kindSet = block.kind ? `, kind = ${this.addParam(block.kind)}` : ''
      this.lines.push(
        `CREATE ${this.addRecordIdParam(block.id)} SET block_kind = 'narrative', content = ${this.addParam(block.content)}, topologized_at = time::now()${kindSet} RETURN NONE;`
      )
      for (const rawId of block.raw_ids) {
        this.lines.push(
          `RELATE ${this.addRecordIdParam(block.id)}->derived_from->${this.addRecordIdParam(rawId)} CONTENT ${this.edgeContent({ transformation: 'summarized' })} RETURN NONE;`
        )
      }
    }
  }

  private topology(payload: StoredProposalPayload): void {
    for (const link of payload.about) {
      this.lines.push(
        `RELATE ${this.addRecordIdParam(link.block_id)}->about->${this.addRecordIdParam(link.note_id)} CONTENT ${this.edgeContent()} RETURN NONE;`
      )
    }
    for (const affect of payload.affects) {
      const content: Record<string, unknown> = { action: affect.action }
      if (affect.summary != null) content.summary = affect.summary
      this.lines.push(
        `RELATE ${this.addRecordIdParam(affect.block_id)}->affects->${this.addRecordIdParam(affect.note_id)} CONTENT ${this.edgeContent(content)} RETURN NONE;`
      )
    }
  }

  // Explicit retirada of semantic edges — the inverse of edges(). Removing a
  // non-existent edge is a no-op. Runs before additions (mirror of P1).
  private removeEdges(payload: StoredProposalPayload): void {
    for (const edge of payload.edges_remove) {
      this.lines.push(
        `DELETE ${edge.kind} WHERE in = ${this.addRecordIdParam(edge.from)} AND out = ${this.addRecordIdParam(edge.to)} RETURN NONE;`
      )
    }
  }

  private edges(payload: StoredProposalPayload): void {
    for (const edge of payload.edges) {
      const from = this.addRecordIdParam(edge.from)
      const to = this.addRecordIdParam(edge.to)
      // part_of is single-parent (UNIQUE in): reparenting is a replace — drop the
      // child's prior parent (if different) in the same tx so the RELATE below
      // doesn't collide with the index. Engine-verified safe on 3.0.5.
      if (edge.kind === 'part_of') {
        this.lines.push(`DELETE part_of WHERE in = ${from} AND out != ${to} RETURN NONE;`)
      }
      // Every edge carries `via_proposal` provenance; blocked_by additionally
      // carries an optional `reason` (a schema field) — persist it at commit
      // instead of dropping it. Other edge kinds have no reason field.
      const content = edge.kind === 'blocked_by' && edge.reason != null ? { reason: edge.reason } : {}
      this.lines.push(`RELATE ${from}->${edge.kind}->${to} CONTENT ${this.edgeContent(content)} RETURN NONE;`)
    }
  }

  private finalize(payload: StoredProposalPayload, proposalId: RecordId): void {
    this.lines.push(
      `UPDATE raw_capture SET status = 'processed', processed_at = time::now() WHERE id IN ${this.addParam(payload.raw_ids.map(id => new StringRecordId(id)))};`
    )
    // The anchor only: versionstamp (filled in afterwards) + committed_at.
    this.lines.push(
      `UPDATE ${this.addParam(proposalId)} SET status = 'committed', result = { versionstamp: NONE, committed_at: time::now() };`
    )
    this.lines.push('COMMIT;')
  }

  build(payload: StoredProposalPayload, proposalId: RecordId): { query: string; params: Record<string, unknown> } {
    this.proposalId = String(proposalId)
    this.reviewRitual = payload.narrative_blocks.some(b => b.kind === 'review_day')
    this.creates(payload)
    this.updates(payload)
    this.narratives(payload)
    this.topology(payload)
    this.removeEdges(payload)
    this.edges(payload)
    this.finalize(payload, proposalId)
    return { query: this.lines.join('\n'), params: this.params }
  }

  // Replay: only the graph mutations, atomically — NO finalize. Used by
  // rebuildGraph() to re-derive the projection from the log without touching the
  // log itself (the proposal's `result`/status and the raw_capture statuses stay
  // exactly as committed). The graph is a projection of the committed proposals.
  buildReplay(payload: StoredProposalPayload, proposalId: string): { query: string; params: Record<string, unknown> } {
    this.proposalId = proposalId
    this.creates(payload)
    this.updates(payload)
    this.narratives(payload)
    this.topology(payload)
    this.removeEdges(payload)
    this.edges(payload)
    this.lines.push('COMMIT;')
    return { query: this.lines.join('\n'), params: this.params }
  }
}

export function buildCommitTx(
  payload: StoredProposalPayload,
  proposalId: RecordId
): { query: string; params: Record<string, unknown>; descriptiveIds: string[] } {
  const tx = new CommitTx()
  const { query, params } = tx.build(payload, proposalId)
  return { query, params, descriptiveIds: tx.descriptiveIds }
}

/** Graph-mutations-only transaction for replay (rebuildGraph). No finalize: the
 * log (proposal.result/status, raw statuses) is left untouched. */
export function buildReplayTx(
  payload: StoredProposalPayload,
  proposalId: string
): { query: string; params: Record<string, unknown> } {
  return new CommitTx().buildReplay(payload, proposalId)
}

/**
 * Hard gate for daily-ritual commits (plan_day / review_day informes). The
 * doctrine says a plan/close must be (1) explicitly approved by the user and
 * (2) unique per Madrid-day. Plain process commits (no kind) are untouched.
 *
 * The uniqueness check counts only **live** ritual blocks: a kind lives in the
 * immutable proposal payload, so after a retract (block deleted) the payload
 * still carries it — we must cross-check the `block` table so a correction
 * (retract the wrong close, then re-commit) is allowed, while a genuine second
 * close of the day is rejected.
 */
async function assertRitualCommitAllowed(payload: StoredProposalPayload, input: CommitProposalInput): Promise<void> {
  const ritualKinds = [
    ...new Set(payload.narrative_blocks.map(block => block.kind).filter((kind): kind is string => Boolean(kind)))
  ]
  if (ritualKinds.length === 0) return // not a ritual commit — no gate

  // (1) explicit approval
  if (input.approved !== true) {
    throw new QueryError(
      `commit_proposal of a daily ritual (${ritualKinds.join(', ')}) requires the user's explicit approval: pass approved: true only after the user OK'd it. A plan/close must never be committed unasked (see huygens://lore/operating-doctrine).`
    )
  }

  // (2) one ritual of each kind per Madrid-day, counting only live blocks
  const db = await getDb()
  const [rows] = await db.query<[Array<{ kinded: Array<{ id: unknown; kind: string }> }>]>(
    `SELECT payload.narrative_blocks[WHERE kind IS NOT NONE].{ id, kind } AS kinded
     FROM proposal
     WHERE status = 'committed'
       AND time::format(created_at + 2h, '%Y-%m-%d') = time::format(time::now() + 2h, '%Y-%m-%d')
       AND count(payload.narrative_blocks[WHERE kind IS NOT NONE]) > 0`
  )
  const candidates = (rows ?? []).flatMap(row => row.kinded ?? [])
  if (candidates.length > 0) {
    const ids = candidates.map(candidate => new StringRecordId(String(candidate.id)))
    const [liveRows] = await db.query<[unknown[]]>('SELECT VALUE id FROM block WHERE id IN $ids', { ids })
    const live = new Set((liveRows ?? []).map(String))
    const liveKindsToday = new Set(
      candidates.filter(candidate => live.has(String(candidate.id))).map(candidate => candidate.kind)
    )
    const dup = ritualKinds.find(kind => liveKindsToday.has(kind))
    if (dup) {
      throw new QueryError(
        `a ${dup} informe already exists for today (Madrid) — only one per day. If you are correcting it, retract the previous ritual block first, then commit.`
      )
    }
  }
}

export async function commitProposalImpl(input: CommitProposalInput): Promise<CommitProposalResult> {
  const db = await getDb()
  const proposal = await requireDraftProposal(input.proposal_id)
  const payload = proposal.payload // stored: real ids everywhere
  await assertRawCapturesCommittable(payload.raw_ids)
  await assertProposalRefs(payload)
  await assertRitualCommitAllowed(payload, input)

  // DB-clock datetime before the commit → anchor for recovering the versionstamp.
  const [before] = await db.query<[string]>('RETURN <string> time::now();')

  const { query, params, descriptiveIds } = buildCommitTx(payload, proposal.id)
  await db.query(query, params) // atomic: any failure rolls the whole commit back

  // Stamp the proposal with the transaction's versionstamp (changefeed anchor).
  const versionstamp = await versionstampForProposal(proposal.id, before)
  if (versionstamp != null) {
    await db.query('UPDATE $proposal SET result.versionstamp = $vs', { proposal: proposal.id, vs: versionstamp })
  }

  await emitEvent({
    kind: 'proposal_committed',
    actor: 'user',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: payload.raw_ids, versionstamp }
  })

  // Best-effort: embed the blocks this commit created so vector search stays
  // complete (closes the P0 hygiene gap of un-indexed blocks). The graph is the
  // SSOT and is already committed; if embedding fails (no key / provider / network)
  // the block is simply left un-indexed and `db:reindex` backfills it later — it
  // must never fail or roll back the commit. Chunked to the embedder's 64 limit.
  const newBlockIds = [...payload.narrative_blocks.map(b => b.id), ...descriptiveIds]
  if (process.env.DEEPINFRA_API_KEY && newBlockIds.length > 0) {
    for (const batch of chunk(newBlockIds, 64)) {
      try {
        await indexBlockImpl({ block_ids: batch })
      } catch (err) {
        console.error(
          `[commit] post-commit embed failed; block(s) left un-indexed: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }

  // Counts/ids come straight from the stored payload (already real ids).
  return {
    proposal_id: input.proposal_id,
    raw_ids_processed: payload.raw_ids,
    narrative_blocks_created: payload.narrative_blocks.map(b => b.id),
    notes_created: payload.note_creates.map(n => n.id),
    notes_updated: payload.note_updates.map(u => u.id),
    descriptive_blocks_created: descriptiveIds,
    derived_from_created: payload.narrative_blocks.reduce((sum, b) => sum + b.raw_ids.length, 0),
    about_created: payload.about.length,
    affects_created: payload.affects.length,
    semantic_edges_created: payload.edges.length,
    semantic_edges_removed: payload.edges_remove.length
  }
}
