import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type RecordId, StringRecordId } from 'surrealdb'
import { z } from 'zod'
import { type ChatComplete, chatComplete } from '../chat'
import { chunkMarkdown } from '../chunk'
import { NOTE_ID_RE, NoteStateSchema, NoteTypeSlugSchema } from '../domain'
import { HuygensError, huygensErrorToToolResult, toMcpError } from '../errors'
import { getDb } from '../surreal'
import { indexBlockImpl } from './index-block'

const STYLES = ['brief', 'narrative', 'bullets'] as const
type Style = (typeof STYLES)[number]

export const generateReportShape = {
  period_start: z.string().datetime().describe('ISO start of the period (inclusive)'),
  period_end: z.string().datetime().describe('ISO end of the period (exclusive)'),
  note_ids: z
    .array(z.string().regex(NOTE_ID_RE))
    .optional()
    .describe('Explicit list of notes to cover. Overrides the period-based selection if set.'),
  type_slug: NoteTypeSlugSchema.optional().describe('Restrict to this note type'),
  state_in: z.array(NoteStateSchema).optional().describe('Restrict to these states'),
  style: z.enum(STYLES).default('narrative').describe('Output shape'),
  model: z.string().optional().describe('LLM model override (default gpt-4o-mini)'),
  persist: z
    .boolean()
    .default(true)
    .describe(
      'Persist the report as a note of type=report with blocks + about edges to the covered notes, and auto-embed. Default true.'
    ),
  title: z.string().optional().describe('Override the generated title. Default: "Report (style) start_date → end_date"')
}

const generateReportSchema = z.object(generateReportShape)
export type GenerateReportInput = z.infer<typeof generateReportSchema>

export type GenerateReportResult = {
  report_markdown: string
  notes_covered: string[]
  model: string
  tokens_used: { input: number; output: number }
  duration_ms: number
  /** Present when the report was persisted to the graph. */
  report_id?: string
  /** Block ids inserted under the report note, in order. */
  report_block_ids?: string[]
}

type NoteRow = {
  id: RecordId
  title: string
  state: string
  type_slug: string | null
  mit_for: Date | string | null
  updated_at: Date | string
  created_at: Date | string
}

type BlockRow = { id: RecordId; note: RecordId; content: string }

const STYLE_INSTRUCTIONS: Record<Style, string> = {
  brief:
    'Write a TIGHT 3-5 paragraph executive summary. Group by theme. Skip filler. End with one sentence on what stands out.',
  narrative:
    "Write a reflective narrative that groups notes by theme. Use H2 headings per theme. Each section: short paragraph linking the notes together, then a list of the notes covered. Match the user's language (Spanish or English) inferred from the note titles.",
  bullets:
    'Write a structured bullet report with H2 headings per theme and concise bullets per note. No prose paragraphs.'
}

const SYSTEM_PROMPT = `You are the report agent for Huygens — Rubén García's personal memory system.

Your job: write a markdown report over the user's own notes for a given period. The notes were captured by the user and decomposed by another agent; you only have their titles + block contents. You do NOT invent facts not present in the notes.

Style guidance:
- Match the language of the source notes (mostly Spanish, sometimes English).
- Be specific, not generic. Reference titles, surface tensions, group related items.
- Don't moralize, don't motivate. The user reads this to remember and decide, not to be coached.
- If notes contradict each other, surface that, don't paper over.
- If the corpus is sparse or repetitive, say so.

Output: markdown only. No preamble like "Here is your report:". Start straight in.`

export async function generateReportImpl(
  input: GenerateReportInput,
  chat: ChatComplete = chatComplete
): Promise<GenerateReportResult> {
  const db = await getDb()
  const t0 = Date.now()

  const notes = await fetchNotesForReport(input, db)
  const noteIds = notes.map(n => String(n.id))
  if (notes.length === 0) {
    return {
      report_markdown: '_No notes match the requested period and filters._',
      notes_covered: [],
      model: input.model ?? 'gpt-4o-mini',
      tokens_used: { input: 0, output: 0 },
      duration_ms: Date.now() - t0
    }
  }

  const corpus = await renderCorpus(notes, db)
  const userPrompt = `Period: ${input.period_start} → ${input.period_end}
Total notes: ${notes.length}
${input.type_slug ? `Type filter: ${input.type_slug}\n` : ''}${input.state_in?.length ? `State filter: ${input.state_in.join(', ')}\n` : ''}
Style instruction: ${STYLE_INSTRUCTIONS[input.style ?? 'narrative']}

---

${corpus}`

  const result = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { model: input.model, temperature: 0.6 }
  )

  const out: GenerateReportResult = {
    report_markdown: result.text,
    notes_covered: noteIds,
    model: result.model,
    tokens_used: result.tokens_used,
    duration_ms: Date.now() - t0
  }

  if (input.persist ?? true) {
    const { report_id, block_ids } = await persistReport(input, result.text, noteIds, db)
    out.report_id = report_id
    out.report_block_ids = block_ids
  }

  return out
}

async function persistReport(
  input: GenerateReportInput,
  markdown: string,
  notesCovered: string[],
  db: Awaited<ReturnType<typeof getDb>>
): Promise<{ report_id: string; block_ids: string[] }> {
  const title = input.title ?? defaultReportTitle(input)
  const reportData = {
    title,
    type: new StringRecordId('note_type:report'),
    state: 'CLARIFIED',
    metadata: {
      period_start: input.period_start,
      period_end: input.period_end,
      style: input.style ?? 'narrative',
      model: input.model ?? 'gpt-4o-mini',
      notes_covered_count: notesCovered.length
    }
  }
  const [reportRows] = await db.query<[{ id: RecordId }[]]>('CREATE note CONTENT $data RETURN AFTER', {
    data: reportData
  })
  const report = reportRows[0]
  if (!report) throw new Error('persistReport: insert returned no record')

  const chunks = chunkMarkdown(markdown)
  const blockRowsInput = chunks.map(c => ({ note: report.id, content: c.content }))
  const [blockRows] = await db.query<[{ id: RecordId }[]]>('INSERT INTO block $rows RETURN AFTER', {
    rows: blockRowsInput
  })
  const blockIds = blockRows.map(b => b.id)
  await db.query('UPDATE $note SET block_order = $order', { note: report.id, order: blockIds })

  for (const coveredNoteId of notesCovered) {
    await db.query('RELATE $report->about->$cov', {
      report: report.id,
      cov: new StringRecordId(coveredNoteId)
    })
  }

  const blockIdStrings = blockIds.map(String)
  if (blockIdStrings.length > 0) {
    await indexBlockImpl({ block_ids: blockIdStrings })
  }

  return { report_id: String(report.id), block_ids: blockIdStrings }
}

function defaultReportTitle(input: GenerateReportInput): string {
  const start = input.period_start.slice(0, 10)
  const end = input.period_end.slice(0, 10)
  const style = input.style ?? 'narrative'
  return `Report (${style}) ${start} → ${end}`
}

async function fetchNotesForReport(
  input: GenerateReportInput,
  db: Awaited<ReturnType<typeof getDb>>
): Promise<NoteRow[]> {
  const filters: string[] = []
  const bindings: Record<string, unknown> = {}

  if (input.note_ids?.length) {
    filters.push('id IN $note_ids')
    bindings.note_ids = input.note_ids.map(id => new StringRecordId(id))
  } else {
    filters.push('updated_at >= $start AND updated_at < $end')
    bindings.start = new Date(input.period_start)
    bindings.end = new Date(input.period_end)
  }
  if (input.type_slug) {
    filters.push('type.slug = $type_slug')
    bindings.type_slug = input.type_slug
  }
  if (input.state_in?.length) {
    filters.push('state IN $states')
    bindings.states = input.state_in
  }

  const sql = `SELECT id, title, state, type.slug AS type_slug, mit_for, updated_at, created_at
               FROM note
               WHERE ${filters.join(' AND ')}
               ORDER BY updated_at ASC`
  const [rows] = await db.query<[NoteRow[]]>(sql, bindings)
  return rows
}

async function renderCorpus(notes: NoteRow[], db: Awaited<ReturnType<typeof getDb>>): Promise<string> {
  const ids = notes.map(n => n.id)
  const [blocks] = await db.query<[BlockRow[]]>('SELECT id, note, content FROM block WHERE note IN $ids', { ids })
  const blocksByNote = new Map<string, string[]>()
  for (const b of blocks) {
    const key = String(b.note)
    const arr = blocksByNote.get(key) ?? []
    arr.push(b.content)
    blocksByNote.set(key, arr)
  }

  return notes
    .map(n => {
      const meta = [
        `state=${n.state}`,
        n.type_slug ? `type=${n.type_slug}` : 'type=untyped',
        n.mit_for ? `mit_for=${normaliseDate(n.mit_for)}` : null
      ]
        .filter(Boolean)
        .join(' ')
      const body = (blocksByNote.get(String(n.id)) ?? []).join('\n\n')
      return `## ${n.title}\n[${meta}]\n\n${body}`
    })
    .join('\n\n---\n\n')
}

function normaliseDate(v: Date | string): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)
}

export function registerGenerateReport(server: McpServer): void {
  server.tool(
    'generate_report',
    'Write a markdown report over the user’s own notes for a period. The MCP collects the corpus, an LLM (gpt-4o-mini by default) writes the narrative grounded only in those notes.',
    generateReportShape,
    async args => {
      try {
        const result = await generateReportImpl(args)
        const persistedNote = result.report_id
          ? ` Persisted as ${result.report_id} (${result.report_block_ids?.length ?? 0} blocks, ${result.notes_covered.length} about edges).`
          : ''
        return {
          content: [
            { type: 'text', text: result.report_markdown },
            {
              type: 'text',
              text: `\n---\n_Notes covered: ${result.notes_covered.length}. Model: ${result.model}. Tokens: ${result.tokens_used.input} in / ${result.tokens_used.output} out. ${result.duration_ms}ms.${persistedNote}_`
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
