import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type RecordId, StringRecordId, type Surreal } from 'surrealdb'
import { z } from 'zod'
import {
  EdgeKindSchema,
  NoteStateSchema,
  NoteTypeSlugSchema,
  RAW_CAPTURE_ID_RE,
  RECORD_ID_RE,
  TransformationSchema
} from '../domain'
import {
  ExternalRefOutOfBoundsError,
  HuygensError,
  huygensErrorToToolResult,
  InternalRefOutOfBoundsError,
  RawAlreadyProcessedError,
  RawNotFoundError,
  toMcpError
} from '../errors'
import { emitEvent, newSessionId } from '../events'
import { getDb } from '../surreal'

const BlockProposal = z.object({
  content: z.string().min(1).describe('Markdown content of the block')
})

const NoteProposal = z.object({
  title: z.string().min(1).describe('Concise title of the note'),
  type_slug: NoteTypeSlugSchema.optional().describe('Slug of note_type. Omit for type=NONE.'),
  state: NoteStateSchema.default('CLARIFIED'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Type-specific metadata bag'),
  mit_for: z.string().datetime().optional().describe('ISO datetime; if set, this note is a MIT for that day'),
  blocks: z.array(BlockProposal).min(1).describe('Ordered markdown blocks that compose the note'),
  transformation: TransformationSchema.describe('How this note relates to the raw source'),
  internal_refs: z
    .array(
      z.object({
        kind: EdgeKindSchema,
        to_note_index: z.number().int().nonnegative().describe('Index of target in this `notes` array')
      })
    )
    .default([])
    .describe('Edges from this note to other newly created notes (by array index)')
})

const ExternalRef = z.object({
  from_note_index: z.number().int().nonnegative(),
  kind: EdgeKindSchema,
  to_external_id: z
    .string()
    .regex(RECORD_ID_RE, 'Record id format')
    .describe('Existing record id (e.g. "note:abc", "person:rubén")')
})

export const commitClarifyShape = {
  raw_id: z
    .string()
    .regex(RAW_CAPTURE_ID_RE, 'Must be a raw_capture record id')
    .describe('The raw_capture being clarified'),
  decomposition: z.object({
    notes: z.array(NoteProposal).min(1),
    external_refs: z.array(ExternalRef).default([])
  }),
  session_id: z.string().optional().describe('UUIDv7 session id (generated if omitted)'),
  reasoning_summary: z.string().optional().describe('Human-readable rationale of the decomposition'),
  confidence: z.number().min(0).max(1).optional(),
  model: z.string().optional(),
  tokens_used: z
    .object({
      input: z.number().int().nonnegative().optional(),
      output: z.number().int().nonnegative().optional(),
      cached: z.number().int().nonnegative().optional()
    })
    .optional(),
  duration_ms: z.number().int().nonnegative().optional()
}

const commitClarifySchema = z.object(commitClarifyShape)
export type CommitClarifyInput = z.infer<typeof commitClarifySchema>
type NoteProposalT = z.infer<typeof NoteProposal>
type ExternalRefT = z.infer<typeof ExternalRef>

export type CommitClarifyResult = {
  raw_id: string
  notes_created: string[]
  blocks_created: string[]
  edges_created: number
  session_id: string
}

async function assertRawNotProcessed(db: Surreal, raw_id: string): Promise<void> {
  const [rows] = await db.query<[{ processed_at: Date | null }[]]>(
    'SELECT processed_at FROM raw_capture WHERE id = $id',
    { id: new StringRecordId(raw_id) }
  )
  if (!rows[0]) throw new RawNotFoundError(raw_id)
  if (rows[0].processed_at) throw new RawAlreadyProcessedError(raw_id)
}

function buildNoteData(proposal: NoteProposalT): Record<string, unknown> {
  const data: Record<string, unknown> = { title: proposal.title, state: proposal.state }
  if (proposal.type_slug) data.type = new StringRecordId(`note_type:${proposal.type_slug}`)
  if (proposal.metadata) data.metadata = proposal.metadata
  if (proposal.mit_for) data.mit_for = new Date(proposal.mit_for)
  return data
}

async function createNoteRecord(db: Surreal, proposal: NoteProposalT): Promise<RecordId> {
  const [rows] = await db.query<[{ id: RecordId }[]]>('CREATE note CONTENT $data RETURN AFTER', {
    data: buildNoteData(proposal)
  })
  const created = rows[0]
  if (!created) throw new Error(`failed to create note: ${proposal.title}`)
  return created.id
}

async function createBlocksForNote(db: Surreal, noteId: RecordId, proposal: NoteProposalT): Promise<RecordId[]> {
  const rowsToInsert = proposal.blocks.map(b => ({ note: noteId, content: b.content }))
  const [blockRows] = await db.query<[{ id: RecordId }[]]>('INSERT INTO block $rows RETURN AFTER', {
    rows: rowsToInsert
  })
  await db.query('UPDATE $note SET block_order = $order', {
    note: noteId,
    order: blockRows.map(b => b.id)
  })
  return blockRows.map(b => b.id)
}

async function linkDerivedFrom(
  db: Surreal,
  noteId: RecordId,
  raw_id: string,
  transformation: NoteProposalT['transformation']
): Promise<void> {
  await db.query('RELATE $note->derived_from->$raw CONTENT { transformation: $transformation }', {
    note: noteId,
    raw: new StringRecordId(raw_id),
    transformation
  })
}

async function createInternalRefs(db: Surreal, proposals: NoteProposalT[], notesCreated: RecordId[]): Promise<number> {
  let edges = 0
  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i]
    const fromId = notesCreated[i]
    if (!proposal || !fromId) continue
    for (const ref of proposal.internal_refs) {
      const toId = notesCreated[ref.to_note_index]
      if (!toId) throw new InternalRefOutOfBoundsError(ref.to_note_index, notesCreated.length)
      await db.query(`RELATE $from->${ref.kind}->$to`, { from: fromId, to: toId })
      edges++
    }
  }
  return edges
}

async function createExternalRefs(db: Surreal, refs: ExternalRefT[], notesCreated: RecordId[]): Promise<number> {
  let edges = 0
  for (const ref of refs) {
    const fromId = notesCreated[ref.from_note_index]
    if (!fromId) throw new ExternalRefOutOfBoundsError(ref.from_note_index, notesCreated.length)
    await db.query(`RELATE $from->${ref.kind}->$to`, {
      from: fromId,
      to: new StringRecordId(ref.to_external_id)
    })
    edges++
  }
  return edges
}

async function markRawProcessed(db: Surreal, raw_id: string): Promise<void> {
  await db.query('UPDATE $id SET processed_at = time::now()', { id: new StringRecordId(raw_id) })
}

export async function commitClarifyImpl(input: CommitClarifyInput): Promise<CommitClarifyResult> {
  const db = await getDb()
  const session_id = input.session_id ?? newSessionId()
  const subject = new StringRecordId(input.raw_id)
  const t0 = Date.now()

  await emitEvent({
    kind: 'commit_attempted',
    actor: 'conversational',
    session_id,
    subject,
    payload: {
      notes_count: input.decomposition.notes.length,
      external_refs_count: input.decomposition.external_refs.length
    }
  })

  try {
    await assertRawNotProcessed(db, input.raw_id)

    const notesCreated: RecordId[] = []
    const blocksCreated: RecordId[] = []
    let edgesCreated = 0

    for (const proposal of input.decomposition.notes) {
      const noteId = await createNoteRecord(db, proposal)
      const blockIds = await createBlocksForNote(db, noteId, proposal)
      await linkDerivedFrom(db, noteId, input.raw_id, proposal.transformation)
      notesCreated.push(noteId)
      blocksCreated.push(...blockIds)
      edgesCreated++
    }

    edgesCreated += await createInternalRefs(db, input.decomposition.notes, notesCreated)
    edgesCreated += await createExternalRefs(db, input.decomposition.external_refs, notesCreated)
    await markRawProcessed(db, input.raw_id)

    await emitEvent({
      kind: 'commit_succeeded',
      actor: 'conversational',
      session_id,
      subject,
      payload: {
        notes_created: notesCreated.map(String),
        blocks_created: blocksCreated.map(String),
        edges_created: edgesCreated
      },
      confidence: input.confidence ?? null,
      reasoning_summary: input.reasoning_summary ?? null,
      model: input.model ?? null,
      tokens_used: input.tokens_used ?? null,
      duration_ms: Date.now() - t0
    })

    return {
      raw_id: input.raw_id,
      notes_created: notesCreated.map(String),
      blocks_created: blocksCreated.map(String),
      edges_created: edgesCreated,
      session_id
    }
  } catch (err) {
    await emitEvent({
      kind: 'commit_failed',
      actor: 'conversational',
      session_id,
      subject,
      payload: { error: err instanceof Error ? err.message : String(err) },
      duration_ms: Date.now() - t0
    })
    throw err
  }
}

export function registerCommitClarify(server: McpServer): void {
  server.tool(
    'commit_clarify',
    'Atomically commit a clarify decomposition: create notes + blocks + edges + derived_from links + mark raw_capture as processed. Emits agent_event for traceability.',
    commitClarifyShape,
    async args => {
      try {
        const result = await commitClarifyImpl(args)
        return {
          content: [
            {
              type: 'text',
              text: `Clarified ${args.raw_id} → ${result.notes_created.length} notes, ${result.blocks_created.length} blocks, ${result.edges_created} edges. session=${result.session_id}`
            },
            { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(result, null, 2)}` }
          ]
        }
      } catch (err) {
        if (err instanceof HuygensError) return huygensErrorToToolResult(err)
        throw toMcpError(err)
      }
    }
  )
}
