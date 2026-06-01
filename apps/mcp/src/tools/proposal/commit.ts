import { type RecordId, StringRecordId } from 'surrealdb'
import { BLOCK_ID_RE, NOTE_ID_RE } from '../../domain'
import { emitEvent, newSessionId } from '../../events'
import { getDb } from '../../surreal'
import {
  type CommitProposalInput,
  type CommitProposalResult,
  type NoteCreate,
  type ProposalPayload,
  proposalPayloadSchema
} from './schemas'
import { fetchProposal, normalizeResult, requireDraftProposal } from './store'
import { assertProposalRefs, assertRawCapturesCommittable, validatePayload } from './validation'

function buildNoteCreateData(note: NoteCreate): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: note.title,
    type: new StringRecordId(`note_type:${note.type_slug}`),
    state: note.state
  }
  // mit_for is a top-level datetime field on note (indexed); a date-only
  // "YYYY-MM-DD" becomes that day's UTC midnight.
  if (note.mit_for) data.mit_for = new Date(note.mit_for)
  if (note.metadata) data.metadata = note.metadata
  return data
}

/**
 * Build the single SurrealQL transaction that materializes a committed proposal.
 * All mutations run inside one BEGIN…COMMIT (atomic: all-or-nothing). The
 * created/touched record ids are captured in LET vars and stored verbatim into
 * `proposal.result`, so "what did this proposal change" — and the graph's history —
 * is answerable directly from `result` (the SSOT, ADR-0024/0025), with no depend
 * on the changefeed (unreliable on 3.0.5). `committed_at` is the time anchor.
 */
class CommitTx {
  readonly params: Record<string, unknown> = {}
  readonly lines: string[] = ['BEGIN;']
  private pc = 0
  private lc = 0
  private readonly noteTok = new Map<string, string>()
  private readonly blockTok = new Map<string, string>()
  // temp_id -> LET var holding the real id, for created notes and narrative blocks.
  private readonly tempNotes: [string, string][] = []
  private readonly tempBlocks: [string, string][] = []
  readonly out = {
    notes_created: [] as string[],
    notes_updated: [] as string[],
    narrative_blocks_created: [] as string[],
    descriptive_blocks_created: [] as string[],
    derived_from: [] as string[],
    about: [] as string[],
    affects: [] as string[],
    semantic_edges: [] as string[],
    // Each entry is a LET var holding an ARRAY of removed edge ids (a DELETE may
    // hit 0..n rows), so finalize() flattens them. See removeEdges()/edges().
    edges_removed: [] as string[]
  }

  private p(value: unknown): string {
    const name = `v${this.pc++}`
    this.params[name] = value
    return `$${name}`
  }
  private letVar(): string {
    return `$L${this.lc++}`
  }
  private static arr(xs: string[]): string {
    return `[${xs.join(', ')}]`
  }
  private static obj(entries: [string, string][]): string {
    if (entries.length === 0) return '{}'
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(', ')} }`
  }

  private appendBlocks(target: string, blocks: { content: string }[]): void {
    const bvars: string[] = []
    for (const block of blocks) {
      const bv = this.letVar()
      this.lines.push(
        `LET ${bv} = (CREATE block SET note = ${target}, block_kind = 'descriptive', content = ${this.p(block.content)} RETURN AFTER)[0].id;`
      )
      bvars.push(bv)
      this.out.descriptive_blocks_created.push(bv)
    }
    if (bvars.length > 0) this.lines.push(`UPDATE ${target} SET block_order += ${CommitTx.arr(bvars)};`)
  }

  private creates(payload: ProposalPayload): void {
    for (const note of payload.note_creates) {
      const v = this.letVar()
      this.lines.push(`LET ${v} = (CREATE note CONTENT ${this.p(buildNoteCreateData(note))} RETURN AFTER)[0].id;`)
      this.noteTok.set(note.temp_id, v)
      this.tempNotes.push([note.temp_id, v])
      this.out.notes_created.push(v)
      this.appendBlocks(v, note.descriptive_blocks)
    }
  }

  private updates(payload: ProposalPayload): void {
    for (const note of payload.note_updates) {
      const target = this.p(new StringRecordId(note.id))
      this.noteTok.set(note.id, target)
      this.out.notes_updated.push(target)
      const sets: string[] = []
      if (note.title != null) sets.push(`title = ${this.p(note.title)}`)
      if (note.state != null) sets.push(`state = ${this.p(note.state)}`)
      if (note.mit_for === null) sets.push('mit_for = NONE')
      else if (note.mit_for != null) sets.push(`mit_for = ${this.p(new Date(note.mit_for))}`)
      if (note.metadata_merge != null)
        sets.push(`metadata = object::extend(metadata ?? {}, ${this.p(note.metadata_merge)})`)
      if (sets.length > 0) this.lines.push(`UPDATE ${target} SET ${sets.join(', ')};`)
      this.appendBlocks(target, note.descriptive_blocks_append)
    }
  }

  private narratives(payload: ProposalPayload): void {
    for (const block of payload.narrative_blocks) {
      const v = this.letVar()
      this.lines.push(
        `LET ${v} = (CREATE block SET block_kind = 'narrative', content = ${this.p(block.content)}, topologized_at = time::now() RETURN AFTER)[0].id;`
      )
      this.blockTok.set(block.temp_id, v)
      this.tempBlocks.push([block.temp_id, v])
      this.out.narrative_blocks_created.push(v)
      for (const rawId of block.raw_ids) {
        const ev = this.letVar()
        this.lines.push(
          `LET ${ev} = (RELATE ${v}->derived_from->${this.p(new StringRecordId(rawId))} CONTENT { transformation: 'summarized' } RETURN AFTER)[0].id;`
        )
        this.out.derived_from.push(ev)
      }
    }
  }

  private noteToken(ref: string): string {
    const found = this.noteTok.get(ref)
    if (found) return found
    if (NOTE_ID_RE.test(ref)) {
      const tok = this.p(new StringRecordId(ref))
      this.noteTok.set(ref, tok)
      return tok
    }
    throw new Error(`unknown note ref: ${ref}`)
  }
  private blockToken(ref: string): string {
    const found = this.blockTok.get(ref)
    if (found) return found
    if (BLOCK_ID_RE.test(ref)) {
      const tok = this.p(new StringRecordId(ref))
      this.blockTok.set(ref, tok)
      return tok
    }
    throw new Error(`unknown block ref: ${ref}`)
  }
  private nodeToken(ref: string): { tok: string; isNote: boolean } {
    const note = this.noteTok.get(ref)
    if (note) return { tok: note, isNote: true }
    const block = this.blockTok.get(ref)
    if (block) return { tok: block, isNote: false }
    if (NOTE_ID_RE.test(ref)) return { tok: this.p(new StringRecordId(ref)), isNote: true }
    if (BLOCK_ID_RE.test(ref)) return { tok: this.p(new StringRecordId(ref)), isNote: false }
    throw new Error(`unknown node ref: ${ref}`)
  }

  private topology(payload: ProposalPayload): void {
    for (const link of payload.about) {
      const ev = this.letVar()
      this.lines.push(
        `LET ${ev} = (RELATE ${this.blockToken(link.block_temp_id)}->about->${this.noteToken(link.note_ref)} RETURN AFTER)[0].id;`
      )
      this.out.about.push(ev)
    }
    for (const affect of payload.affects) {
      const content: Record<string, unknown> = { action: affect.action }
      if (affect.summary != null) content.summary = affect.summary
      const ev = this.letVar()
      this.lines.push(
        `LET ${ev} = (RELATE ${this.blockToken(affect.block_temp_id)}->affects->${this.noteToken(affect.note_ref)} CONTENT ${this.p(content)} RETURN AFTER)[0].id;`
      )
      this.out.affects.push(ev)
    }
  }

  // Explicit retirada of semantic edges (the inverse of edges()). DELETE …
  // RETURN BEFORE captures the real ids removed; `.id` projects the deleted rows
  // to their ids (an array, since a kind+from+to is at most one but we don't
  // assume). Removing a non-existent edge is a no-op, not an error.
  private removeEdges(payload: ProposalPayload): void {
    for (const edge of payload.edges_remove) {
      const from = this.nodeToken(edge.from)
      const to = this.nodeToken(edge.to)
      if (edge.kind === 'part_of' || edge.kind === 'blocked_by') {
        if (!from.isNote) throw new Error(`${edge.kind} requires a note ref: ${edge.from}`)
        if (!to.isNote) throw new Error(`${edge.kind} requires a note ref: ${edge.to}`)
      }
      const ev = this.letVar()
      this.lines.push(`LET ${ev} = (DELETE ${edge.kind} WHERE in = ${from.tok} AND out = ${to.tok} RETURN BEFORE).id;`)
      this.out.edges_removed.push(ev)
    }
  }

  private edges(payload: ProposalPayload): void {
    for (const edge of payload.edges) {
      const from = this.nodeToken(edge.from)
      const to = this.nodeToken(edge.to)
      if (edge.kind === 'part_of' || edge.kind === 'blocked_by') {
        if (!from.isNote) throw new Error(`${edge.kind} requires a note ref: ${edge.from}`)
        if (!to.isNote) throw new Error(`${edge.kind} requires a note ref: ${edge.to}`)
      }
      // part_of is single-parent (UNIQUE(in)). Reparenting is a replace: drop the
      // note's previous parent (if any, and only if it differs from the new one)
      // inside this same tx, so the RELATE below doesn't collide with the index.
      // The DELETE-then-RELATE in one transaction is engine-verified safe on 3.0.5.
      if (edge.kind === 'part_of') {
        const rv = this.letVar()
        this.lines.push(`LET ${rv} = (DELETE part_of WHERE in = ${from.tok} AND out != ${to.tok} RETURN BEFORE).id;`)
        this.out.edges_removed.push(rv)
      }
      const ev = this.letVar()
      this.lines.push(`LET ${ev} = (RELATE ${from.tok}->${edge.kind}->${to.tok} RETURN AFTER)[0].id;`)
      this.out.semantic_edges.push(ev)
    }
  }

  private finalize(payload: ProposalPayload, proposalId: RecordId): void {
    this.lines.push(
      `UPDATE raw_capture SET status = 'processed', processed_at = time::now() WHERE id IN ${this.p(payload.raw_ids.map(id => new StringRecordId(id)))};`
    )
    const o = this.out
    this.lines.push(
      `UPDATE ${this.p(proposalId)} SET status = 'committed', result = { ` +
        `notes_created: ${CommitTx.arr(o.notes_created)}, notes_updated: ${CommitTx.arr(o.notes_updated)}, ` +
        `narrative_blocks_created: ${CommitTx.arr(o.narrative_blocks_created)}, descriptive_blocks_created: ${CommitTx.arr(o.descriptive_blocks_created)}, ` +
        `derived_from: ${CommitTx.arr(o.derived_from)}, about: ${CommitTx.arr(o.about)}, affects: ${CommitTx.arr(o.affects)}, semantic_edges: ${CommitTx.arr(o.semantic_edges)}, ` +
        `edges_removed: array::flatten(${CommitTx.arr(o.edges_removed)}), ` +
        `temp_ids: { notes: ${CommitTx.obj(this.tempNotes)}, blocks: ${CommitTx.obj(this.tempBlocks)} }, ` +
        'versionstamp: NONE, committed_at: time::now() };'
    )
    this.lines.push('COMMIT;')
  }

  build(payload: ProposalPayload, proposalId: RecordId): { query: string; params: Record<string, unknown> } {
    this.creates(payload)
    this.updates(payload)
    this.narratives(payload)
    this.topology(payload)
    this.removeEdges(payload)
    this.edges(payload)
    this.finalize(payload, proposalId)
    return { query: this.lines.join('\n'), params: this.params }
  }
}

export function buildCommitTx(
  payload: ProposalPayload,
  proposalId: RecordId
): { query: string; params: Record<string, unknown> } {
  return new CommitTx().build(payload, proposalId)
}

export async function commitProposalImpl(input: CommitProposalInput): Promise<CommitProposalResult> {
  const db = await getDb()
  const proposal = await requireDraftProposal(input.proposal_id)
  const payload = proposalPayloadSchema.parse(proposal.payload)
  validatePayload(payload.raw_ids, payload)
  await assertRawCapturesCommittable(payload.raw_ids)
  await assertProposalRefs(payload)

  const { query, params } = buildCommitTx(payload, proposal.id)
  await db.query(query, params) // atomic: any failure rolls the whole commit back

  const committed = await fetchProposal(input.proposal_id)
  const result = normalizeResult(committed?.result)

  await emitEvent({
    kind: 'proposal_committed',
    actor: 'user',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: payload.raw_ids }
  })

  return {
    proposal_id: input.proposal_id,
    raw_ids_processed: payload.raw_ids,
    narrative_blocks_created: result?.narrative_blocks_created ?? [],
    notes_created: result?.notes_created ?? [],
    notes_updated: result?.notes_updated ?? [],
    descriptive_blocks_created: result?.descriptive_blocks_created ?? [],
    derived_from_created: result?.derived_from.length ?? 0,
    about_created: result?.about.length ?? 0,
    affects_created: result?.affects.length ?? 0,
    semantic_edges_created: result?.semantic_edges.length ?? 0,
    semantic_edges_removed: result?.edges_removed.length ?? 0,
    temp_ids: result?.temp_ids ?? { notes: {}, blocks: {} }
  }
}
