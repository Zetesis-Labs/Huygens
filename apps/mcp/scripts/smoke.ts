import type { RecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'

type Block = {
  id: RecordId
  note: RecordId
  content: string
  pillars: string[]
}

type Note = {
  id: RecordId
  title: string
  type: RecordId | null
  pillars: string[]
  state: string
  block_order: RecordId[]
  source_kind: string | null
  created_at: Date
  updated_at: Date
}

const db = await getDb()

// 1. Capture sin tipo: nota recién creada, sin blocks aún.
const [createNoteResult] = await db.query<[Note[]]>(
  `CREATE note CONTENT {
    title: $title,
    pillars: $pillars,
    source_kind: $source_kind
  } RETURN AFTER`,
  {
    title: 'smoke test — tocho fragmentado',
    pillars: ['ETHOS', 'SOPHIA'],
    source_kind: 'manual'
  }
)
const note = createNoteResult[0]
if (!note) throw new Error('note create failed')

// 2. Crear 3 blocks asociados a la note (INSERT acepta array; CREATE no).
const [blocks] = await db.query<[Block[]]>(
  `INSERT INTO block [
    { note: $note, content: $b1, pillars: ['ETHOS'] },
    { note: $note, content: $b2, pillars: ['SOPHIA'] },
    { note: $note, content: $b3, pillars: ['ETHOS', 'SOPHIA'] }
  ]`,
  {
    note: note.id,
    b1: '## Captura inicial\n\nNotas sueltas que entran al inbox.',
    b2: '## Idea de fondo\n\nReflexión sobre programación funcional y meditación.',
    b3: '## Próxima acción\n\nLeer el capítulo 3 de Milewski.'
  }
)
if (blocks.length !== 3) throw new Error(`expected 3 blocks, got ${blocks.length}`)

// 3. Establecer el orden de blocks en la note.
await db.query<[Note]>('UPDATE $note SET block_order = $order', {
  note: note.id,
  order: blocks.map(b => b.id)
})

// 4. Crear un edge `mentions` de bloque a bloque (zettel-trail).
await db.query('RELATE $from->mentions->$to', {
  from: blocks[0].id,
  to: blocks[2].id
})

// 5. Releer la note con sus blocks ordenados.
const [rereadNote] = await db.query<[Note[]]>('SELECT * FROM note WHERE id = $id', { id: note.id })
const reread = rereadNote[0]
if (!reread) throw new Error('readback failed')

// 6. Recuperar el markdown completo respetando block_order.
//    Fetch + sort en TS (más fiable que array::find_index dentro de ORDER BY).
const [fetchedBlocks] = await db.query<[Block[]]>('SELECT id, content, pillars FROM block WHERE id IN $ids', {
  ids: reread.block_order
})
const blockById = new Map(fetchedBlocks.map(b => [String(b.id), b]))
const orderedBlocks = reread.block_order.map(id => blockById.get(String(id))).filter((b): b is Block => Boolean(b))

// 7. Verificar que el edge mentions existe.
const [mentionsResult] = await db.query<[{ id: RecordId; in: RecordId; out: RecordId }[]]>(
  'SELECT id, in, out FROM mentions WHERE in = $from',
  { from: blocks[0].id }
)

console.log(
  JSON.stringify(
    {
      note: {
        id: String(reread.id),
        title: reread.title,
        pillars: reread.pillars,
        state: reread.state,
        block_count: reread.block_order.length
      },
      rendered_markdown: orderedBlocks.map(b => b.content).join('\n\n---\n\n'),
      block_pillars: orderedBlocks.map(b => b.pillars),
      mentions_edges: mentionsResult.length
    },
    null,
    2
  )
)

// Cleanup: blocks primero (referencian a note), después la note.
for (const b of blocks) await db.query('DELETE $id', { id: b.id })
await db.query('DELETE $id', { id: note.id })
await closeDb()
