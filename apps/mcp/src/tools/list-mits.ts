import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RecordId } from 'surrealdb'
import { z } from 'zod'
import { NoteStateSchema } from '../domain'
import { HuygensError, huygensErrorToToolResult, toMcpError } from '../errors'
import { getDb } from '../surreal'

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

export const listMitsShape = {
  date: z.string().describe('Date in YYYY-MM-DD or full ISO datetime. The day is interpreted in UTC.'),
  state_in: z
    .array(NoteStateSchema)
    .default(['CLARIFIED', 'ACTIVE', 'WAITING'])
    .describe('Which states count as still-pending. Default excludes DONE/ARCHIVED/SOMEDAY.')
}

const listMitsSchema = z.object(listMitsShape)
export type ListMitsInput = z.infer<typeof listMitsSchema>

export type MitRow = {
  id: string
  title: string
  type_slug: string | null
  state: string
  mit_for: string
}

function dayBounds(input: string): { start: Date; end: Date } {
  if (DATE_ONLY_RE.test(input)) {
    const start = new Date(`${input}T00:00:00.000Z`)
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
  }
  const point = new Date(input)
  if (Number.isNaN(point.getTime())) throw new Error(`unparseable date: ${input}`)
  const start = new Date(Date.UTC(point.getUTCFullYear(), point.getUTCMonth(), point.getUTCDate()))
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

export async function listMitsImpl(input: ListMitsInput): Promise<MitRow[]> {
  const db = await getDb()
  const { start, end } = dayBounds(input.date)
  const states = input.state_in ?? ['CLARIFIED', 'ACTIVE', 'WAITING']

  type Row = {
    id: RecordId
    title: string
    state: string
    type_slug: string | null
    mit_for: Date | string
  }
  const [rows] = await db.query<[Row[]]>(
    `SELECT id, title, state, type.slug AS type_slug, mit_for
     FROM note
     WHERE mit_for >= $start AND mit_for < $end AND state IN $states
     ORDER BY mit_for ASC`,
    { start, end, states }
  )

  return rows.map(r => ({
    id: String(r.id),
    title: r.title,
    type_slug: r.type_slug,
    state: r.state,
    mit_for: r.mit_for instanceof Date ? r.mit_for.toISOString() : String(r.mit_for)
  }))
}

export function registerListMits(server: McpServer): void {
  server.tool(
    'list_mits_for_date',
    "What's my Most Important Task list for a given day? Returns notes with mit_for on that date, in active-ish states.",
    listMitsShape,
    async args => {
      try {
        const mits = await listMitsImpl(args)
        const summary =
          mits.length === 0
            ? `No MITs for ${args.date}.`
            : mits.map(m => `- [${m.state}] ${m.id} — ${m.title} (${m.type_slug ?? 'untyped'})`).join('\n')
        return {
          content: [
            { type: 'text', text: summary },
            { type: 'text', text: `\n[raw JSON]\n${JSON.stringify(mits, null, 2)}` }
          ]
        }
      } catch (err) {
        if (err instanceof HuygensError) return huygensErrorToToolResult(err)
        throw toMcpError(err)
      }
    }
  )
}
