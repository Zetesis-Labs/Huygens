import { type RecordId, StringRecordId } from 'surrealdb'
import { uuidv7 } from 'uuidv7'
import { emitEvent, newSessionId } from '../../events'
import { getDb } from '../../surreal'
import { indexBlockImpl } from '../index-block'
import type { CommitProposalInput, CommitProposalResult, StoredNoteCreate, StoredProposalPayload } from './schemas'
import { requireDraftProposal } from './store'
import { assertProposalRefs, assertRawCapturesCommittable } from './validation'

function buildNoteCreateData(note: StoredNoteCreate): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: note.title,
    type: new StringRecordId(`note_type:${note.type_slug}`),
    state: note.state
  }
  if (note.mit_for) data.mit_for = new Date(note.mit_for)
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
async function versionstampForProposal(proposalId: RecordId, since: string): Promise<string | null> {
  const db = await getDb()
  const id = String(proposalId)
  for (let attempt = 0; attempt < 5; attempt++) {
    const [rows] = await db.query<[Array<{ versionstamp: unknown; changes: Array<{ update?: { id?: unknown } }> }>]>(
      `SHOW CHANGES FOR TABLE proposal SINCE d"${since}"`
    )
    for (const row of rows ?? []) {
      if (row.versionstamp == null) continue
      for (const change of row.changes ?? []) {
        if (change.update && String(change.update.id) === id) return String(row.versionstamp)
      }
    }
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
  private pc = 0
  /** Ids of descriptive blocks created in this tx (generated here; nothing refs them). */
  readonly descriptiveIds: string[] = []

  private p(value: unknown): string {
    const name = `v${this.pc++}`
    this.params[name] = value
    return `$${name}`
  }
  /** Param holding a real record id. */
  private rid(id: string): string {
    return this.p(new StringRecordId(id))
  }

  private appendBlocks(noteId: string, blocks: { content: string }[]): void {
    if (blocks.length === 0) return
    const ids: string[] = []
    for (const block of blocks) {
      const bid = `block:${uuidv7().replace(/-/g, '')}`
      this.lines.push(
        `CREATE ${this.rid(bid)} SET note = ${this.rid(noteId)}, block_kind = 'descriptive', content = ${this.p(block.content)} RETURN NONE;`
      )
      ids.push(bid)
      this.descriptiveIds.push(bid)
    }
    this.lines.push(`UPDATE ${this.rid(noteId)} SET block_order += ${this.p(ids.map(id => new StringRecordId(id)))};`)
  }

  private creates(payload: StoredProposalPayload): void {
    for (const note of payload.note_creates) {
      this.lines.push(`CREATE ${this.rid(note.id)} CONTENT ${this.p(buildNoteCreateData(note))} RETURN NONE;`)
      this.appendBlocks(note.id, note.descriptive_blocks)
    }
  }

  private updates(payload: StoredProposalPayload): void {
    for (const note of payload.note_updates) {
      const sets: string[] = []
      if (note.title != null) sets.push(`title = ${this.p(note.title)}`)
      if (note.state != null) sets.push(`state = ${this.p(note.state)}`)
      if (note.mit_for === null) sets.push('mit_for = NONE')
      else if (note.mit_for != null) sets.push(`mit_for = ${this.p(new Date(note.mit_for))}`)
      if (note.metadata_merge != null)
        sets.push(`metadata = object::extend(metadata ?? {}, ${this.p(note.metadata_merge)})`)
      if (sets.length > 0) this.lines.push(`UPDATE ${this.rid(note.id)} SET ${sets.join(', ')} RETURN NONE;`)
      this.appendBlocks(note.id, note.descriptive_blocks_append)
    }
  }

  private narratives(payload: StoredProposalPayload): void {
    for (const block of payload.narrative_blocks) {
      this.lines.push(
        `CREATE ${this.rid(block.id)} SET block_kind = 'narrative', content = ${this.p(block.content)}, topologized_at = time::now() RETURN NONE;`
      )
      for (const rawId of block.raw_ids) {
        this.lines.push(
          `RELATE ${this.rid(block.id)}->derived_from->${this.rid(rawId)} CONTENT { transformation: 'summarized' } RETURN NONE;`
        )
      }
    }
  }

  private topology(payload: StoredProposalPayload): void {
    for (const link of payload.about) {
      this.lines.push(`RELATE ${this.rid(link.block_id)}->about->${this.rid(link.note_id)} RETURN NONE;`)
    }
    for (const affect of payload.affects) {
      const content: Record<string, unknown> = { action: affect.action }
      if (affect.summary != null) content.summary = affect.summary
      this.lines.push(
        `RELATE ${this.rid(affect.block_id)}->affects->${this.rid(affect.note_id)} CONTENT ${this.p(content)} RETURN NONE;`
      )
    }
  }

  // Explicit retirada of semantic edges — the inverse of edges(). Removing a
  // non-existent edge is a no-op. Runs before additions (mirror of P1).
  private removeEdges(payload: StoredProposalPayload): void {
    for (const edge of payload.edges_remove) {
      this.lines.push(
        `DELETE ${edge.kind} WHERE in = ${this.rid(edge.from)} AND out = ${this.rid(edge.to)} RETURN NONE;`
      )
    }
  }

  private edges(payload: StoredProposalPayload): void {
    for (const edge of payload.edges) {
      const from = this.rid(edge.from)
      const to = this.rid(edge.to)
      // part_of is single-parent (UNIQUE in): reparenting is a replace — drop the
      // child's prior parent (if different) in the same tx so the RELATE below
      // doesn't collide with the index. Engine-verified safe on 3.0.5.
      if (edge.kind === 'part_of') {
        this.lines.push(`DELETE part_of WHERE in = ${from} AND out != ${to} RETURN NONE;`)
      }
      // blocked_by carries an optional `reason` (a schema field) — persist it at
      // commit instead of dropping it. Other edge kinds have no reason field.
      if (edge.kind === 'blocked_by' && edge.reason != null) {
        this.lines.push(`RELATE ${from}->blocked_by->${to} CONTENT { reason: ${this.p(edge.reason)} } RETURN NONE;`)
      } else {
        this.lines.push(`RELATE ${from}->${edge.kind}->${to} RETURN NONE;`)
      }
    }
  }

  private finalize(payload: StoredProposalPayload, proposalId: RecordId): void {
    this.lines.push(
      `UPDATE raw_capture SET status = 'processed', processed_at = time::now() WHERE id IN ${this.p(payload.raw_ids.map(id => new StringRecordId(id)))};`
    )
    // The anchor only: versionstamp (filled in afterwards) + committed_at.
    this.lines.push(
      `UPDATE ${this.p(proposalId)} SET status = 'committed', result = { versionstamp: NONE, committed_at: time::now() };`
    )
    this.lines.push('COMMIT;')
  }

  build(payload: StoredProposalPayload, proposalId: RecordId): { query: string; params: Record<string, unknown> } {
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
  buildReplay(payload: StoredProposalPayload): { query: string; params: Record<string, unknown> } {
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
export function buildReplayTx(payload: StoredProposalPayload): { query: string; params: Record<string, unknown> } {
  return new CommitTx().buildReplay(payload)
}

export async function commitProposalImpl(input: CommitProposalInput): Promise<CommitProposalResult> {
  const db = await getDb()
  const proposal = await requireDraftProposal(input.proposal_id)
  const payload = proposal.payload // stored: real ids everywhere
  await assertRawCapturesCommittable(payload.raw_ids)
  await assertProposalRefs(payload)

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
    for (let i = 0; i < newBlockIds.length; i += 64) {
      try {
        await indexBlockImpl({ block_ids: newBlockIds.slice(i, i + 64) })
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
