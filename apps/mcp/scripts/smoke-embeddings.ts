import { StringRecordId } from 'surrealdb'
import { captureImpl } from '../src/tools/capture'
import { chunkMarkdownImpl } from '../src/tools/chunk-markdown'
import { commitClarifyImpl } from '../src/tools/commit-clarify'
import { embedTextImpl } from '../src/tools/embed-text'
import { indexBlockImpl } from '../src/tools/index-block'
import { vectorSearchImpl } from '../src/tools/vector-search'
import { closeDb, getDb } from '../src/surreal'

const db = await getDb()

const chunks = chunkMarkdownImpl({
  text: `# Cabecera principal

Primer párrafo introduciendo el tema general del documento.

## Subsección A

Contenido específico de A. Esta sección habla de ciertos detalles.

## Subsección B

Contenido específico de B. Más detalles aquí, totalmente distintos.`,
  max_chars: 4000
})
const chunkProbe = { count: chunks.length, paths: chunks.map(c => c.heading_path) }

const embedProbe = await embedTextImpl({ texts: ['hola mundo desde Huygens'] })

const { raw_id } = await captureImpl({
  content: 'Quiero documentar el concepto de functores aplicativos y su relación con el patrón builder.',
  source_kind: 'manual',
  source_ref: 'smoke-embeddings'
})

const commit = await commitClarifyImpl({
  raw_id,
  decomposition: {
    notes: [
      {
        title: 'Functores aplicativos',
        type_slug: 'note',
        state: 'CLARIFIED',
        blocks: [
          { content: '## Functores aplicativos\n\nEstructura que permite aplicar funciones envueltas a valores envueltos. Generaliza el patrón builder.' },
          { content: '### Notación\n\n`pure :: a -> f a` y `<*> :: f (a -> b) -> f a -> f b`. El operador `<*>` es la clave.' }
        ],
        transformation: 'extracted',
        internal_refs: []
      },
      {
        title: 'Patrón builder en lenguajes mainstream',
        type_slug: 'note',
        state: 'CLARIFIED',
        blocks: [
          { content: '## Builder pattern\n\nEncadena llamadas que devuelven el receptor para configurar un objeto paso a paso. Misma idea que applicative pero sin types higher-kinded.' }
        ],
        transformation: 'extracted',
        internal_refs: [{ kind: 'mentions', to_note_index: 0 }]
      }
    ],
    external_refs: []
  },
  reasoning_summary: 'Smoke embeddings: split into two related notes',
  model: 'smoke-fake'
})

const indexed = await indexBlockImpl({ block_ids: commit.blocks_created })

const search1 = await vectorSearchImpl({ query: 'applicative functor patterns', k: 5 })
const search2 = await vectorSearchImpl({ query: 'builder pattern', k: 5, threshold: 0.3 })
const searchFiltered = await vectorSearchImpl({
  query: 'category theory composition',
  k: 5,
  state_in: ['CLARIFIED'],
  type_slugs: ['note']
})

console.log(
  JSON.stringify(
    {
      chunk_probe: chunkProbe,
      embed_probe: {
        model: embedProbe.model,
        dimensions: embedProbe.dimensions,
        first5: embedProbe.embeddings[0]?.slice(0, 5),
        input_tokens: embedProbe.input_tokens
      },
      raw_id,
      commit_blocks: commit.blocks_created,
      indexed: { count: indexed.indexed.length, model: indexed.model, tokens: indexed.input_tokens },
      search_applicative: search1.map(h => ({ title: h.note_title, score: +h.score.toFixed(3) })),
      search_builder: search2.map(h => ({ title: h.note_title, score: +h.score.toFixed(3) })),
      search_filtered: searchFiltered.map(h => ({ title: h.note_title, score: +h.score.toFixed(3) }))
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
