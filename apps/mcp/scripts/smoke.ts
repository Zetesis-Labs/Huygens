import type { RecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'

type RawCapture = {
  id: RecordId
  content: string
  source_kind: string
  source_ref: string | null
  created_at: Date
  processed_at: Date | null
}

type Block = {
  id: RecordId
  note: RecordId
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

// ─── Plano 1: captura cruda ─────────────────────────────────────────────
// Simula que el usuario dictó un tocho de voz que se transcribió.
const RAW_TEXT = `Ana me dijo ayer que su fisio de Bilbao es muy bueno para
cervicales, debería probarlo. Me recordó que tengo que renovar el carnet en
agosto. Y por cierto, anoche leyendo Milewski me di cuenta de que los
functores aplicativos son justo lo que necesito para componer las queries del
agente — explorar mañana.`

const [createRawResult] = await db.query<[RawCapture[]]>(
  `CREATE raw_capture CONTENT {
    content: $content,
    source_kind: 'voice',
    source_ref: $session_ref
  } RETURN AFTER`,
  { content: RAW_TEXT, session_ref: 'voice-session-abc' }
)
const raw = createRawResult[0]
if (!raw) throw new Error('raw_capture create failed')

// El inbox real: raw_captures sin procesar
const [unprocessed] = await db.query<[RawCapture[]]>(
  'SELECT id, source_kind, created_at FROM raw_capture WHERE processed_at IS NONE'
)

// ─── Plano 2: procesamiento (lo que en runtime hace el agente) ─────────
// El agente decide:
// - 1 Note "captura sesión voz" tipo=NONE (conserva sesión cruda como contexto)
// - 1 Note tipo=task "Probar fisio recomendado por Ana en Bilbao"
// - 1 Note tipo=task "Renovar carnet de conducir antes de agosto"
// - 1 Note tipo=note "Idea: applicative functors para composición de queries del agente"
// Cada una con su block markdown.

// 1. Note contenedora (sesión original como referencia)
const [container] = await db.query<[Note[]]>(
  `CREATE note CONTENT {
    title: 'Sesión de voz — fisio, DNI, applicative functors',
    state: 'CLARIFIED'
  } RETURN AFTER`
)
const containerNote = container[0]!
const [containerBlock] = await db.query<[Block[]]>('INSERT INTO block { note: $note, content: $content }', {
  note: containerNote.id,
  content: RAW_TEXT
})
await db.query('UPDATE $id SET block_order = $order', {
  id: containerNote.id,
  order: [containerBlock[0]!.id]
})

// 2. Tasks y note específicas extraídas.
//    La primera task se marca como MIT de hoy (ADR-0023) para demostrar el campo.
const today = new Date()
today.setUTCHours(0, 0, 0, 0)

const [extracted] = await db.query<[Note[]]>(
  `INSERT INTO note [
    {
      title: 'Probar fisio recomendado por Ana en Bilbao',
      type: note_type:task,
      state: 'CLARIFIED',
      mit_for: $today
    },
    {
      title: 'Renovar carnet de conducir antes de agosto',
      type: note_type:task,
      state: 'CLARIFIED'
    },
    {
      title: 'Applicative functors para composición de queries del agente',
      type: note_type:note,
      state: 'CLARIFIED'
    }
  ]`,
  { today }
)

// Crear blocks para cada nota extraída
for (const n of extracted) {
  await db.query<[Block[]]>('INSERT INTO block { note: $note, content: $content }', {
    note: n.id,
    content: `## ${n.title}\n\nExtraído de la sesión de voz.`
  })
}

// Edges `mentions` desde cada nota extraída hacia el container (procedencia)
for (const n of extracted) {
  await db.query('RELATE $from->mentions->$to', {
    from: n.id,
    to: containerNote.id
  })
}

// 3. Edges derived_from: procedencia de cada nota hacia el raw.
//    El container es verbatim (preserva el texto literal); las extraídas son 'extracted'.
await db.query('RELATE $from->derived_from->$raw CONTENT { transformation: "verbatim" }', {
  from: containerNote.id,
  raw: raw.id
})
for (const n of extracted) {
  await db.query('RELATE $from->derived_from->$raw CONTENT { transformation: "extracted" }', {
    from: n.id,
    raw: raw.id
  })
}

// 4. Cerrar el ciclo: marcar el raw_capture como procesado.
const allNotes = [containerNote.id, ...extracted.map(n => n.id)]
await db.query('UPDATE $raw SET processed_at = time::now()', { raw: raw.id })

// ─── Verificación ───────────────────────────────────────────────────────
const [rawAfter] = await db.query<[RawCapture[]]>('SELECT * FROM raw_capture WHERE id = $id', {
  id: raw.id
})
const [unprocessedAfter] = await db.query<[RawCapture[]]>('SELECT id FROM raw_capture WHERE processed_at IS NONE')
const [mentionsCount] = await db.query<[{ count: number }[]]>(
  'SELECT count() AS count FROM mentions WHERE out = $container GROUP ALL',
  { container: containerNote.id }
)

// Procedencia inversa: qué notes derivan de este raw
const [derivedNotes] = await db.query<[{ in: RecordId; transformation: string | null }[]]>(
  'SELECT in, transformation FROM derived_from WHERE out = $raw',
  { raw: raw.id }
)

// MITs de hoy: demuestra el índice mit_for (ADR-0023).
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
      inbox_before_processing: unprocessed.length,
      notes_produced: allNotes.map(String),
      mentions_to_container: mentionsCount[0]?.count ?? 0,
      raw_capture_processed_at: rawAfter[0]?.processed_at ?? null,
      derived_from_edges: derivedNotes.map(d => ({
        note: String(d.in),
        transformation: d.transformation
      })),
      mits_today: mitsToday.map(n => ({ id: String(n.id), title: n.title })),
      inbox_after_processing: unprocessedAfter.length
    },
    null,
    2
  )
)

// Cleanup
for (const n of extracted) await db.query('DELETE $id', { id: n.id })
await db.query('DELETE $id', { id: containerNote.id })
await db.query('DELETE $id', { id: raw.id })
await closeDb()
