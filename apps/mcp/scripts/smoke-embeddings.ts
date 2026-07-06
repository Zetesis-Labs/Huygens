import { StringRecordId } from 'surrealdb'
import { closeDb, getDb } from '../src/surreal'
import { captureImpl } from '../src/tools/capture'
import { chunkMarkdownImpl } from '../src/tools/chunk-markdown'
import { embedTextImpl } from '../src/tools/embed-text'
import { indexBlockImpl } from '../src/tools/index-block'
import { commitProposalImpl, createProposalImpl, getProposalImpl } from '../src/tools/proposal'
import { vectorSearchImpl } from '../src/tools/vector-search'

const db = await getDb()

const chunks = chunkMarkdownImpl({
  text: `# Cabecera principal

Primer parrafo introduciendo el tema general del documento.

## Subseccion A

Contenido especifico de A. Esta seccion habla de ciertos detalles.

## Subseccion B

Contenido especifico de B. Mas detalles aqui, totalmente distintos.`,
  max_chars: 4000
})
const chunkProbe = { count: chunks.length, paths: chunks.map(chunk => chunk.heading_path) }

const embedProbe = await embedTextImpl({ texts: ['hola mundo desde Huygens'] })

const { raw_id } = await captureImpl({
  content: 'Quiero documentar el concepto de functores aplicativos y su relacion con el patron builder.',
  source_kind: 'manual',
  source_ref: 'smoke-embeddings'
})

let proposalId: string | null = null
let commit: Awaited<ReturnType<typeof commitProposalImpl>> | null = null

try {
  const proposal = await createProposalImpl({
    raw_ids: [raw_id],
    payload: {
      raw_ids: [raw_id],
      narrative_blocks: [
        {
          temp_id: 'narrative',
          content:
            'La captura compara functores aplicativos con el patron builder y conserva dos notas enlazadas para busqueda semantica.',
          raw_ids: [raw_id]
        }
      ],
      note_creates: [
        {
          temp_id: 'applicative',
          title: 'Functores aplicativos',
          type_slug: 'idea',
          state: 'ACTIVE',
          descriptive_blocks: [
            {
              content:
                '## Functores aplicativos\n\nEstructura que permite aplicar funciones envueltas a valores envueltos. Generaliza parte de la intuicion del patron builder.'
            },
            {
              content:
                '### Notacion\n\n`pure :: a -> f a` y `<*> :: f (a -> b) -> f a -> f b`. El operador `<*>` es la clave.'
            }
          ]
        },
        {
          temp_id: 'builder',
          title: 'Patron builder en lenguajes mainstream',
          type_slug: 'reference',
          state: 'ACTIVE',
          descriptive_blocks: [
            {
              content:
                '## Builder pattern\n\nEncadena llamadas que devuelven el receptor para configurar un objeto paso a paso. La comparacion con applicative es analogica, no una equivalencia formal.'
            }
          ]
        }
      ],
      edges: [{ kind: 'relates_to', from: 'builder', to: 'applicative' }],
      about: [
        { block_temp_id: 'narrative', note_ref: 'applicative' },
        { block_temp_id: 'narrative', note_ref: 'builder' }
      ],
      affects: [
        {
          block_temp_id: 'narrative',
          note_ref: 'applicative',
          action: 'created',
          summary: 'Crea la idea sobre functores aplicativos.'
        },
        {
          block_temp_id: 'narrative',
          note_ref: 'builder',
          action: 'created',
          summary: 'Crea la referencia comparativa sobre builder.'
        }
      ]
    }
  })
  proposalId = proposal.id
  await getProposalImpl({ proposal_id: proposal.id }) // preview muro: render before commit
  commit = await commitProposalImpl({ proposal_id: proposal.id })

  const blocksToIndex = [...commit.descriptive_blocks_created, ...commit.narrative_blocks_created]
  const indexed = await indexBlockImpl({ block_ids: blocksToIndex })

  const search1 = await vectorSearchImpl({ query: 'applicative functor patterns', k: 5 })
  const search2 = await vectorSearchImpl({ query: 'builder pattern', k: 5, threshold: 0.3 })
  const searchFiltered = await vectorSearchImpl({
    query: 'category theory composition',
    k: 5,
    state_in: ['ACTIVE'],
    type_slugs: ['idea']
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
        proposal_id: proposal.id,
        narrative_blocks: commit.narrative_blocks_created,
        notes_created: commit.notes_created,
        blocks_indexed: indexed.indexed.length,
        indexed: { model: indexed.model, tokens: indexed.input_tokens },
        search_applicative: search1.map(hit => ({ title: hit.note_title, score: +hit.score.toFixed(3) })),
        search_builder: search2.map(hit => ({ title: hit.note_title, score: +hit.score.toFixed(3) })),
        search_filtered: searchFiltered.map(hit => ({ title: hit.note_title, score: +hit.score.toFixed(3) }))
      },
      null,
      2
    )
  )
} finally {
  const rawRef = new StringRecordId(raw_id)
  const proposalRef = proposalId ? new StringRecordId(proposalId) : null

  if (commit) {
    for (const blockId of [...commit.descriptive_blocks_created, ...commit.narrative_blocks_created]) {
      const block = new StringRecordId(blockId)
      await db.query('DELETE derived_from WHERE in = $block OR out = $raw', { block, raw: rawRef })
      await db.query('DELETE about WHERE in = $block', { block })
      await db.query('DELETE affects WHERE in = $block', { block })
      await db.query('DELETE mentions WHERE in = $block OR out = $block', { block })
      await db.query('DELETE $block', { block })
    }
    for (const noteId of commit.notes_created) {
      const note = new StringRecordId(noteId)
      for (const edge of ['part_of', 'blocked_by', 'depends_on', 'owned_by', 'relates_to', 'duplicates']) {
        await db.query(`DELETE ${edge} WHERE in = $note OR out = $note`, { note })
      }
      await db.query('DELETE $note', { note })
    }
  }

  if (proposalRef) {
    await db.query('DELETE agent_event WHERE subject = $proposal', { proposal: proposalRef })
    await db.query('DELETE $proposal', { proposal: proposalRef })
  }
  await db.query('DELETE agent_event WHERE subject = $raw', { raw: rawRef })
  await db.query('DELETE $raw', { raw: rawRef })

  await closeDb()
}
