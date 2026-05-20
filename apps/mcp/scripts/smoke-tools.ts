import { StringRecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'
import { captureImpl } from '../src/tools/capture'
import { commitClarifyImpl } from '../src/tools/commit-clarify'
import { getRawImpl } from '../src/tools/get-raw'
import { listInboxImpl } from '../src/tools/list-inbox'

const db = await getDb()

const RAW_TEXT = `Mañana cita con el dentista a las 10. También quiero leer
ese paper de category theory que me pasó David. Y revisar la propuesta de
arquitectura para Govoy antes del viernes.`

const { raw_id } = await captureImpl({
  content: RAW_TEXT,
  source_kind: 'manual',
  source_ref: 'smoke-tools'
})

const inboxBefore = await listInboxImpl({ limit: 20 })

const detailBefore = await getRawImpl({ raw_id })

const tomorrow = new Date()
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
tomorrow.setUTCHours(10, 0, 0, 0)

const friday = new Date()
const daysUntilFriday = (5 - friday.getUTCDay() + 7) % 7 || 7
friday.setUTCDate(friday.getUTCDate() + daysUntilFriday)
friday.setUTCHours(0, 0, 0, 0)

const commit = await commitClarifyImpl({
  raw_id,
  decomposition: {
    notes: [
      {
        title: 'Cita dentista mañana 10:00',
        type_slug: 'task',
        state: 'CLARIFIED',
        mit_for: tomorrow.toISOString(),
        blocks: [{ content: '## Cita dentista\n\nMañana a las 10:00.' }],
        transformation: 'extracted',
        internal_refs: []
      },
      {
        title: 'Leer paper category theory de David',
        type_slug: 'task',
        state: 'CLARIFIED',
        blocks: [{ content: '## Paper category theory\n\nPasado por David, pendiente de leer.' }],
        transformation: 'extracted',
        internal_refs: []
      },
      {
        title: 'Revisar propuesta arquitectura Govoy',
        type_slug: 'task',
        state: 'CLARIFIED',
        mit_for: friday.toISOString(),
        blocks: [{ content: '## Revisión arquitectura Govoy\n\nAntes del viernes.' }],
        transformation: 'extracted',
        internal_refs: []
      }
    ],
    external_refs: []
  },
  reasoning_summary: 'Smoke test: split raw into 3 tasks',
  confidence: 0.95,
  model: 'smoke-fake'
})

const inboxAfter = await listInboxImpl({ limit: 20 })
const detailAfter = await getRawImpl({ raw_id })

console.log(
  JSON.stringify(
    {
      captured: raw_id,
      inbox_before: { count: inboxBefore.length, contains_raw: inboxBefore.some(r => r.id === raw_id) },
      detail_before: {
        processed_at: detailBefore?.processed_at,
        derived_notes_count: detailBefore?.derived_notes.length ?? 0
      },
      commit_result: commit,
      inbox_after: { count: inboxAfter.length, still_contains_raw: inboxAfter.some(r => r.id === raw_id) },
      detail_after: {
        processed_at: detailAfter?.processed_at,
        derived_notes_count: detailAfter?.derived_notes.length ?? 0
      }
    },
    null,
    2
  )
)

for (const id of commit.notes_created) await db.query('DELETE $id', { id: new StringRecordId(id) })
for (const id of commit.blocks_created) await db.query('DELETE $id', { id: new StringRecordId(id) })
await db.query('DELETE $id', { id: new StringRecordId(raw_id) })
await db.query('DELETE agent_event WHERE session_id = $sid', { sid: commit.session_id })

await closeDb()
