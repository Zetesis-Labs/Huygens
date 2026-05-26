import { type RecordId, StringRecordId } from 'surrealdb'
import { BLOCK_ID_RE, NOTE_ID_RE } from '../../domain'
import { emitEvent, newSessionId } from '../../events'
import { getDb } from '../../surreal'
import { idStr, type RecordIdish } from '../graph-records'
import {
  type CommitProposalInput,
  type CommitProposalResult,
  type NoteCreate,
  type ProposalPayload,
  proposalPayloadSchema
} from './schemas'
import { fetchProposal, requireDraftProposal } from './store'
import { assertProposalRefs, assertRawCapturesCommittable, validatePayload } from './validation'

function buildNoteCreateData(note: NoteCreate): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: note.title,
    type: new StringRecordId(`note_type:${note.type_slug}`),
    state: note.state
  }
  if (note.metadata) data.metadata = note.metadata
  return data
}

/** Highest versionstamp currently in a table's changefeed (0n if none). */
async function maxVersionstamp(table: string): Promise<bigint> {
  const db = await getDb()
  const [rows] = await db.query<[Array<{ versionstamp: bigint }>]>(`SHOW CHANGES FOR TABLE ${table} SINCE 0`)
  let max = 0n
  for (const r of rows ?? []) if (typeof r.versionstamp === 'bigint' && r.versionstamp > max) max = r.versionstamp
  return max
}

/**
 * The versionstamp of the changeset that landed after `since`. Best-effort:
 * the changefeed needs a moment to flush, so retry a few times. Returns the
 * versionstamp as a string (it is a u64 bigint, beyond Number precision), or
 * null if nothing surfaced.
 */
async function versionstampSince(table: string, since: bigint): Promise<string | null> {
  const db = await getDb()
  for (let attempt = 0; attempt < 5; attempt++) {
    const [rows] = await db.query<[Array<{ versionstamp: bigint }>]>(
      `SHOW CHANGES FOR TABLE ${table} SINCE ${since + 1n}`
    )
    let max = 0n
    for (const r of rows ?? []) if (typeof r.versionstamp === 'bigint' && r.versionstamp > max) max = r.versionstamp
    if (max > 0n) return String(max)
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  return null
}

/**
 * Build the single SurrealQL transaction that materializes a committed proposal.
 * All mutations run inside one BEGIN…COMMIT (atomic: all-or-nothing) and share a
 * single versionstamp. The created/touched record ids are captured in LET vars and
 * stored verbatim into `proposal.result`, so "what did this proposal change" is
 * answerable without the changefeed. The versionstamp is filled in afterwards.
 */
class CommitTx {
  readonly params: Record<string, unknown> = {}
  readonly lines: string[] = ['BEGIN;']
  private pc = 0
  private lc = 0
  private readonly noteTok = new Map<string, string>()
  private readonly blockTok = new Map<string, string>()
  readonly out = {
    notes_created: [] as string[],
    notes_updated: [] as string[],
    narrative_blocks_created: [] as string[],
    descriptive_blocks_created: [] as string[],
    derived_from: [] as string[],
    about: [] as string[],
    affects: [] as string[],
    semantic_edges: [] as string[]
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

  private edges(payload: ProposalPayload): void {
    for (const edge of payload.edges) {
      const from = this.nodeToken(edge.from)
      const to = this.nodeToken(edge.to)
      if (edge.kind === 'part_of' || edge.kind === 'blocked_by') {
        if (!from.isNote) throw new Error(`${edge.kind} requires a note ref: ${edge.from}`)
        if (!to.isNote) throw new Error(`${edge.kind} requires a note ref: ${edge.to}`)
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
        'versionstamp: NONE, committed_at: time::now() };'
    )
    this.lines.push('COMMIT;')
  }

  build(payload: ProposalPayload, proposalId: RecordId): { query: string; params: Record<string, unknown> } {
    this.creates(payload)
    this.updates(payload)
    this.narratives(payload)
    this.topology(payload)
    this.edges(payload)
    this.finalize(payload, proposalId)
    return { query: this.lines.join('\n'), params: this.params }
  }
}

function buildCommitTx(
  payload: ProposalPayload,
  proposalId: RecordId
): { query: string; params: Record<string, unknown> } {
  return new CommitTx().build(payload, proposalId)
}

/** Normalize a result field (RecordId[] at runtime) to plain id strings. */
const toIdStrings = (xs?: RecordIdish[]): string[] => (xs ?? []).map(idStr)

export async function commitProposalImpl(input: CommitProposalInput): Promise<CommitProposalResult> {
  const db = await getDb()
  const proposal = await requireDraftProposal(input.proposal_id)
  const payload = proposalPayloadSchema.parse(proposal.payload)
  validatePayload(payload.raw_ids, payload)
  await assertRawCapturesCommittable(payload.raw_ids)
  await assertProposalRefs(payload)

  // Narrative blocks (>= 1 always) guarantee the `block` table is written, so it
  // is a reliable witness for locating the commit's versionstamp.
  const vsBefore = await maxVersionstamp('block')

  const { query, params } = buildCommitTx(payload, proposal.id)
  await db.query(query, params) // atomic: any failure rolls the whole commit back

  // Best-effort: stamp the proposal with the transaction's versionstamp.
  const versionstamp = await versionstampSince('block', vsBefore)
  if (versionstamp != null) {
    await db.query('UPDATE $proposal SET result.versionstamp = $vs', { proposal: proposal.id, vs: versionstamp })
  }

  const committed = await fetchProposal(input.proposal_id)
  const result = committed?.result ?? null

  await emitEvent({
    kind: 'proposal_committed',
    actor: 'user',
    session_id: newSessionId(),
    subject: proposal.id,
    payload: { raw_ids: payload.raw_ids, versionstamp }
  })

  return {
    proposal_id: input.proposal_id,
    raw_ids_processed: payload.raw_ids,
    narrative_blocks_created: toIdStrings(result?.narrative_blocks_created),
    notes_created: toIdStrings(result?.notes_created),
    notes_updated: toIdStrings(result?.notes_updated),
    descriptive_blocks_created: toIdStrings(result?.descriptive_blocks_created),
    derived_from_created: toIdStrings(result?.derived_from).length,
    about_created: toIdStrings(result?.about).length,
    affects_created: toIdStrings(result?.affects).length,
    semantic_edges_created: toIdStrings(result?.semantic_edges).length
  }
}
