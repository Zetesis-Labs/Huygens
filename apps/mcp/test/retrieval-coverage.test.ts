import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { type Embedder, type EmbedResult, setEmbedderOverride } from '../src/embeddings'
import { expandContextImpl } from '../src/tools/expand-context'
import { indexBlockImpl } from '../src/tools/index-block'
import { neighborhoodImpl } from '../src/tools/neighborhood'
import { fakeEmbedder } from './_embedder'
import { insertNote, type TestDb, withFreshDb } from './_fixtures'

// Hermetic: the deterministic bag-of-words fake embedder, never DeepInfra.
// These cover the contextual-embedding header (A2), neighborhood BFS edge cases,
// and expand_context's hybrid composition. "Related" == lexical overlap.

/** Wrap fakeEmbedder and record every batch of inputs it sees, so a test can
 * assert WHAT text was embedded (the context header), not just the vector. */
function spyEmbedder(): { embedder: Embedder; inputs: string[] } {
  const inputs: string[] = []
  const embedder: Embedder = texts => {
    inputs.push(...texts)
    return fakeEmbedder(texts) as Promise<EmbedResult>
  }
  return { embedder, inputs }
}

describe('index_block contextual embeddings (A2)', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
    setEmbedderOverride(null)
  })

  test('descriptive block embeds owner-note context header before the content', async () => {
    const note = await insertNote(ctx.db, {
      title: 'Escribir a Stripe',
      type_slug: 'task',
      state: 'WAITING',
      blocks: ['Hay que mandar el correo de soporte.']
    })
    const spy = spyEmbedder()
    setEmbedderOverride(spy.embedder)

    await indexBlockImpl({ block_ids: note.block_ids })

    expect(spy.inputs).toHaveLength(1)
    const embedded = spy.inputs[0] ?? ''
    // The header carries the note's identity, then the bare content after a blank line.
    expect(embedded).toBe('task · Escribir a Stripe (WAITING)\n\nHay que mandar el correo de soporte.')
  })

  test('descriptive block header includes the part_of parent breadcrumb', async () => {
    const parent = await insertNote(ctx.db, { title: 'Cobros', type_slug: 'project', blocks: ['Proyecto cobros.'] })
    const child = await insertNote(ctx.db, {
      title: 'Escribir a Stripe',
      type_slug: 'task',
      state: 'WAITING',
      blocks: ['Mandar el correo.']
    })
    await ctx.db.query(`RELATE ${child.note_id}->part_of->${parent.note_id}`)

    const spy = spyEmbedder()
    setEmbedderOverride(spy.embedder)
    await indexBlockImpl({ block_ids: child.block_ids })

    const embedded = spy.inputs[0] ?? ''
    expect(embedded).toContain('task · Escribir a Stripe (WAITING)')
    expect(embedded).toContain('parte de: project · Cobros')
    expect(embedded.endsWith('\n\nMandar el correo.')).toBe(true)
  })

  test('narrative block embeds the context of the notes it is about', async () => {
    const about = await insertNote(ctx.db, {
      title: 'Relación con Stripe',
      type_slug: 'agent',
      state: 'ACTIVE',
      blocks: ['placeholder']
    })
    const [blocks] = await ctx.db.query<[{ id: { toString(): string } }[]]>(
      "CREATE block CONTENT { block_kind: 'narrative', content: 'Interpretación del intercambio.' } RETURN AFTER"
    )
    const narrativeId = String(blocks[0]?.id)
    await ctx.db.query(`RELATE ${narrativeId}->about->${about.note_id}`)

    const spy = spyEmbedder()
    setEmbedderOverride(spy.embedder)
    await indexBlockImpl({ block_ids: [narrativeId] })

    const embedded = spy.inputs[0] ?? ''
    expect(embedded).toBe('agent · Relación con Stripe (ACTIVE)\n\nInterpretación del intercambio.')
  })

  test('a block with no owner/about embeds bare content (no header)', async () => {
    const [blocks] = await ctx.db.query<[{ id: { toString(): string } }[]]>(
      "CREATE block CONTENT { block_kind: 'narrative', content: 'Bloque huérfano sin about.' } RETURN AFTER"
    )
    const orphanId = String(blocks[0]?.id)

    const spy = spyEmbedder()
    setEmbedderOverride(spy.embedder)
    await indexBlockImpl({ block_ids: [orphanId] })

    expect(spy.inputs[0]).toBe('Bloque huérfano sin about.')
  })
})

describe('neighborhood edge cases', () => {
  let ctx: TestDb
  beforeEach(async () => {
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('returns null for a seed that does not exist', async () => {
    expect(await neighborhoodImpl({ seed_id: 'note:does_not_exist', hops: 2, max_nodes: 30 })).toBeNull()
  })

  test('an isolated node (no edges) returns just itself with no triples', async () => {
    await ctx.db.query("CREATE note:nc_lonely SET title = 'Solo', type = note_type:idea, state = 'ACTIVE'")
    const r = await neighborhoodImpl({ seed_id: 'note:nc_lonely', hops: 2, max_nodes: 30 })
    expect(r?.node_count).toBe(1)
    expect(r?.triples).toBe('')
    expect(r?.nodes).toEqual([{ id: 'note:nc_lonely', label: 'idea · Solo (ACTIVE)' }])
  })

  test('a raw_capture seed does not expand through trace edges (derived_from is plumbing, not topology)', async () => {
    // Huygens 2: neighborhood traverses only operational edges. The derived_from
    // block-provenance link is technical plumbing, so a raw_capture whose only
    // relation is derived_from stays isolated.
    await ctx.db.query(`
      CREATE raw_capture:nc_raw SET content = 'captura cruda', source_kind = 'chat', status = 'processed';
      CREATE block:nc_blk SET block_kind = 'narrative', content = 'informe derivado';
      RELATE block:nc_blk->derived_from->raw_capture:nc_raw CONTENT { transformation: 'summarized' };
    `)
    const r = await neighborhoodImpl({ seed_id: 'raw_capture:nc_raw', hops: 1, max_nodes: 30 })
    expect(r?.seed).toBe('raw_capture:nc_raw')
    expect(r?.node_count).toBe(1)
    expect(r?.triples).toBe('')
  })

  test('mixes every operational edge kind', async () => {
    await ctx.db.query(`
      CREATE note:nc_task SET title = 'Tarea', type = note_type:task, state = 'ACTIVE';
      CREATE note:nc_proj SET title = 'Proyecto', type = note_type:project, state = 'ACTIVE';
      CREATE note:nc_block_src SET title = 'Bloqueante', type = note_type:task, state = 'WAITING';
      CREATE note:nc_dep SET title = 'Dependencia', type = note_type:task, state = 'ACTIVE';
      CREATE note:nc_agent SET title = 'Responsable', type = note_type:agent, state = 'ACTIVE';
      CREATE note:nc_rel SET title = 'Relacionada', type = note_type:idea, state = 'ACTIVE';
      CREATE note:nc_dup SET title = 'Duplicada', type = note_type:task, state = 'ACTIVE';
      RELATE note:nc_task->part_of->note:nc_proj;
      RELATE note:nc_task->blocked_by->note:nc_block_src;
      RELATE note:nc_task->depends_on->note:nc_dep;
      RELATE note:nc_task->owned_by->note:nc_agent;
      RELATE note:nc_task->relates_to->note:nc_rel;
      RELATE note:nc_task->duplicates->note:nc_dup;
    `)
    const r = await neighborhoodImpl({ seed_id: 'note:nc_task', hops: 2, max_nodes: 60 })
    const t = r?.triples ?? ''
    expect(t).toContain('—part_of→')
    expect(t).toContain('—blocked_by→')
    expect(t).toContain('—depends_on→')
    expect(t).toContain('—owned_by→')
    expect(t).toContain('—relates_to→')
    expect(t).toContain('—duplicates→')
    // 7 notes all reachable within 2 hops of the task.
    expect(r?.node_count).toBe(7)
  })

  test('a cycle terminates and is deduped (no infinite expansion)', async () => {
    await ctx.db.query(`
      CREATE note:nc_x SET title = 'X', type = note_type:task, state = 'ACTIVE';
      CREATE note:nc_y SET title = 'Y', type = note_type:task, state = 'ACTIVE';
      RELATE note:nc_x->blocked_by->note:nc_y;
      RELATE note:nc_y->blocked_by->note:nc_x;
    `)
    const r = await neighborhoodImpl({ seed_id: 'note:nc_x', hops: 3, max_nodes: 30 })
    expect(r?.node_count).toBe(2)
    // Both blocked_by edges land in the induced subgraph (both endpoints visited).
    const occurrences = (r?.triples.match(/—blocked_by→/g) ?? []).length
    expect(occurrences).toBe(2)
  })

  test('max_nodes truncates the frontier and drops edges to unvisited nodes', async () => {
    // A star: centre linked to 5 leaves. With a budget of 3, only the centre + 2
    // leaves are visited, so the induced subgraph keeps just those 2 edges.
    await ctx.db.query(`
      CREATE note:nc_hub SET title = 'Hub', type = note_type:project, state = 'ACTIVE';
      CREATE note:nc_l0 SET title = 'L0', type = note_type:task, state = 'ACTIVE';
      CREATE note:nc_l1 SET title = 'L1', type = note_type:task, state = 'ACTIVE';
      CREATE note:nc_l2 SET title = 'L2', type = note_type:task, state = 'ACTIVE';
      CREATE note:nc_l3 SET title = 'L3', type = note_type:task, state = 'ACTIVE';
      CREATE note:nc_l4 SET title = 'L4', type = note_type:task, state = 'ACTIVE';
      RELATE note:nc_l0->part_of->note:nc_hub;
      RELATE note:nc_l1->part_of->note:nc_hub;
      RELATE note:nc_l2->part_of->note:nc_hub;
      RELATE note:nc_l3->part_of->note:nc_hub;
      RELATE note:nc_l4->part_of->note:nc_hub;
    `)
    const r = await neighborhoodImpl({ seed_id: 'note:nc_hub', hops: 1, max_nodes: 3 })
    expect(r?.node_count).toBe(3)
    // Induced subgraph: only edges whose both endpoints are visited survive.
    const occurrences = (r?.triples.match(/—part_of→/g) ?? []).length
    expect(occurrences).toBe(2)
  })
})

describe('expand_context hybrid composition', () => {
  let ctx: TestDb
  beforeEach(async () => {
    setEmbedderOverride(fakeEmbedder)
    ctx = await withFreshDb()
  })
  afterEach(async () => {
    await ctx.cleanup()
    setEmbedderOverride(null)
  })

  test('no vector match → fully empty result', async () => {
    await insertNote(ctx.db, { title: 'Paella', type_slug: 'idea', blocks: ['Saffron bomba rice sofrito broth.'] })
    const r = await expandContextImpl({
      query: 'distributed consensus quorum protocols',
      seeds: 3,
      hops: 1,
      max_nodes: 30,
      threshold: 0.9
    })
    expect(r.seeds).toEqual([])
    expect(r.node_count).toBe(0)
    expect(r.nodes).toEqual([])
    expect(r.triples).toBe('')
  })

  test('two seeds sharing a neighbour fuse into one connected subgraph', async () => {
    // Two distinct notes that both match the query, both part_of the same parent.
    // Expanding from both seeds must merge into a single subgraph containing the
    // shared parent once, with both part_of edges.
    const parent = await insertNote(ctx.db, {
      title: 'Category theory',
      type_slug: 'project',
      blocks: ['Category theory umbrella.']
    })
    const a = await insertNote(ctx.db, {
      title: 'Applicative functor essentials',
      type_slug: 'idea',
      blocks: ['Applicative functor pattern wraps values in category theory.']
    })
    const b = await insertNote(ctx.db, {
      title: 'Monad functor laws',
      type_slug: 'idea',
      blocks: ['Monad and functor laws in category theory.']
    })
    await indexBlockImpl({ block_ids: [...a.block_ids, ...b.block_ids] })
    await ctx.db.query(`RELATE ${a.note_id}->part_of->${parent.note_id}`)
    await ctx.db.query(`RELATE ${b.note_id}->part_of->${parent.note_id}`)

    const r = await expandContextImpl({
      query: 'functor category theory',
      seeds: 3,
      hops: 1,
      max_nodes: 30,
      threshold: 0.3
    })
    const seedIds = r.seeds.map(s => s.id)
    expect(seedIds).toContain(a.note_id)
    expect(seedIds).toContain(b.note_id)
    // Shared parent appears exactly once (dedup by visited set).
    const parentNodes = r.nodes.filter(n => n.id === parent.note_id)
    expect(parentNodes).toHaveLength(1)
    expect(r.node_count).toBe(3)
    const partOfEdges = (r.triples.match(/—part_of→/g) ?? []).length
    expect(partOfEdges).toBe(2)
    expect(r.triples).toContain('Category theory')
  })
})
