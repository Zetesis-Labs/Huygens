import type { RecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'

type RawCapture = {
  id: RecordId
  content: string
  source_kind: string
  source_ref: string | null
  status: 'pending' | 'processed' | 'ignored' | 'deferred'
  created_at: Date
  processed_at: Date | null
}

type Block = {
  id: RecordId
  note?: RecordId | null
  block_kind: 'descriptive' | 'narrative'
  content: string
}

type Note = {
  id: RecordId
  title: string
  type: RecordId | null
  state: string
  block_order: RecordId[]
  source_kind: string | null
  mit_for: Date | null
}

const db = await getDb()

const RAW_TEXT = `Ana me dijo ayer que su fisio de Bilbao es muy bueno para
cervicales, deberia probarlo. Me recordo que tengo que renovar el carnet en
agosto. Y por cierto, anoche leyendo Milewski me di cuenta de que los
applicative functors son justo lo que necesito para componer las queries del
agente; explorar manana.`

const createdNotes: RecordId[] = []
const createdBlocks: RecordId[] = []
let raw: RawCapture | undefined

try {
  const [createRawResult] = await db.query<[RawCapture[]]>(
    `CREATE raw_capture CONTENT {
      content: $content,
      source_kind: 'voice',
      source_ref: $session_ref,
      status: 'pending'
    } RETURN AFTER`,
    { content: RAW_TEXT, session_ref: 'voice-session-smoke' }
  )
  raw = createRawResult[0]
  if (!raw) throw new Error('smoke: raw_capture create failed')

  const [pendingBefore] = await db.query<[RawCapture[]]>(
    "SELECT id, source_kind, status, created_at FROM raw_capture WHERE status = 'pending'"
  )

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [notes] = await db.query<[Note[]]>(
    `INSERT INTO note [
      {
        title: 'Sistema personal',
        type: note_type:project,
        state: 'ACTIVE'
      },
      {
        title: 'Probar fisio recomendado por Ana en Bilbao',
        type: note_type:task,
        state: 'ACTIVE',
        mit_for: $today
      },
      {
        title: 'Applicative functors para composicion de queries del agente',
        type: note_type:idea,
        state: 'ACTIVE'
      }
    ]`,
    { today }
  )

  const [project, task, idea] = notes
  if (!project || !task || !idea) throw new Error('smoke: failed to create notes')
  createdNotes.push(project.id, task.id, idea.id)

  for (const note of notes) {
    const [blocks] = await db.query<[Block[]]>(
      `INSERT INTO block {
        note: $note,
        block_kind: 'descriptive',
        content: $content
      }`,
      {
        note: note.id,
        content: `## ${note.title}\n\nDescripcion aprobada durante smoke test v2.1-lite.`
      }
    )
    const block = blocks[0]
    if (!block) throw new Error(`smoke: failed to create descriptive block for ${note.id}`)
    createdBlocks.push(block.id)
    await db.query('UPDATE $note SET block_order = [$block]', {
      note: note.id,
      block: block.id
    })
  }

  const [narrativeRows] = await db.query<[Block[]]>(
    `CREATE block CONTENT {
      block_kind: 'narrative',
      content: $content,
      topologized_at: time::now()
    } RETURN AFTER`,
    {
      content:
        'Ana recomendo un fisio para cervicales, aparece una tarea de renovar carnet y se registra una idea tecnica sobre applicative functors.'
    }
  )
  const narrativeBlock = narrativeRows[0]
  if (!narrativeBlock) throw new Error('smoke: failed to create narrative block')
  createdBlocks.push(narrativeBlock.id)

  await db.query('RELATE $block->derived_from->$raw CONTENT { transformation: "summarized" }', {
    block: narrativeBlock.id,
    raw: raw.id
  })

  for (const note of notes) {
    await db.query('RELATE $block->about->$note', {
      block: narrativeBlock.id,
      note: note.id
    })
  }

  await db.query('RELATE $block->affects->$note CONTENT { action: "created", summary: $summary }', {
    block: narrativeBlock.id,
    note: task.id,
    summary: 'Crea la tarea de probar el fisio recomendado por Ana.'
  })
  await db.query('RELATE $block->affects->$note CONTENT { action: "created", summary: $summary }', {
    block: narrativeBlock.id,
    note: idea.id,
    summary: 'Crea la idea tecnica sobre composicion de queries.'
  })

  await db.query('RELATE $task->part_of->$project', {
    task: task.id,
    project: project.id
  })
  await db.query('RELATE $idea->relates_to->$project', {
    idea: idea.id,
    project: project.id
  })

  await db.query("UPDATE $raw SET status = 'processed', processed_at = time::now()", { raw: raw.id })

  const [rawAfter] = await db.query<[RawCapture[]]>('SELECT * FROM raw_capture WHERE id = $id', {
    id: raw.id
  })
  const [pendingAfter] = await db.query<[RawCapture[]]>("SELECT id FROM raw_capture WHERE status = 'pending'")
  const [derivedRecords] = await db.query<[{ in: RecordId; transformation: string | null }[]]>(
    'SELECT in, transformation FROM derived_from WHERE out = $raw',
    { raw: raw.id }
  )
  const [aboutRows] = await db.query<[{ out: RecordId }[]]>('SELECT out FROM about WHERE in = $block', {
    block: narrativeBlock.id
  })
  const [affectsRows] = await db.query<[{ out: RecordId; action: string; summary: string | null }[]]>(
    'SELECT out, action, summary FROM affects WHERE in = $block',
    { block: narrativeBlock.id }
  )
  const [mitsToday] = await db.query<[{ id: RecordId; title: string; mit_for: Date }[]]>(
    `SELECT id, title, mit_for FROM note
     WHERE mit_for >= $today AND mit_for < $tomorrow`,
    {
      today,
      tomorrow: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    }
  )

  console.log(
    JSON.stringify(
      {
        raw_capture_created: String(raw.id),
        raw_capture_status: rawAfter[0]?.status ?? null,
        inbox_before_processing: pendingBefore.length,
        inbox_after_processing: pendingAfter.length,
        narrative_block: String(narrativeBlock.id),
        notes_produced: createdNotes.map(String),
        derived_from_records: derivedRecords.map(edge => ({
          block: String(edge.in),
          transformation: edge.transformation
        })),
        about_edges: aboutRows.map(edge => String(edge.out)),
        affects_edges: affectsRows.map(edge => ({
          note: String(edge.out),
          action: edge.action,
          summary: edge.summary
        })),
        mits_today: mitsToday.map(note => ({ id: String(note.id), title: note.title }))
      },
      null,
      2
    )
  )
} finally {
  if (raw) {
    await db.query('DELETE derived_from WHERE out = $raw', { raw: raw.id })
  }
  for (const block of createdBlocks) {
    await db.query('DELETE about WHERE in = $block', { block })
    await db.query('DELETE affects WHERE in = $block', { block })
    await db.query('DELETE mentions WHERE in = $block OR out = $block', { block })
    await db.query('DELETE blocked_by WHERE in = $block OR out = $block', { block })
  }
  for (const note of createdNotes) {
    for (const edge of ['part_of', 'blocked_by', 'depends_on', 'owned_by', 'relates_to', 'duplicates']) {
      await db.query(`DELETE ${edge} WHERE in = $note OR out = $note`, { note })
    }
  }
  for (const block of createdBlocks) await db.query('DELETE $block', { block })
  for (const note of createdNotes) await db.query('DELETE $note', { note })
  if (raw) await db.query('DELETE $raw', { raw: raw.id })
  await closeDb()
}
