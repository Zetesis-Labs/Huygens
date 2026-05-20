# Vector search strategy — chunking, indexing, hybrid retrieval

> Documento completo sobre cómo Huygens convierte una nota en algo buscable vectorialmente, cómo se indexa, cómo se consulta y cómo se mantiene en el tiempo. Cubre desde la decisión de chunkear hasta el patrón de hybrid search en SurrealDB.

## Estructura del problema

Las notas del usuario no son uniformes:

- **Chats cortos**: 50-300 tokens. Un embedding global es suficiente y preciso
- **Notas de voz transcritas**: 200-1500 tokens. Embedding global es viable, chunking opcional
- **Tochos**: 2000-10000+ tokens. **Aquí está el problema**

El problema con tochos largos: un único embedding promediado sobre 8000 tokens condensa demasiados conceptos heterogéneos en un solo vector de 1024 dims. Una nota que cubre "fisioterapia rodilla + propósito vital + lectura Coecke" colapsa en un vector que no se parece especialmente a ninguna query sobre los tres temas por separado.

La solución estándar: **chunking + embedding por chunk**, con la nota como contenedor lógico y los chunks como unidades buscables.

## Chunking strategy

### Reglas iniciales (revisar tras uso real)

- **Tamaño objetivo**: ~500-800 tokens por chunk
- **Overlap**: ~100 tokens entre chunks consecutivos (para no romper contexto en las fronteras)
- **Frontera preferente**: respetar `## headings`, después párrafos, después oraciones

El razonamiento:

- **500-800 tokens** es el sweet spot empírico para retrieval. Demasiado pequeño (< 200) pierde contexto local. Demasiado grande (> 1500) revierte al problema del promediado.
- **Overlap del 15-20%** asegura que conceptos que caen en la frontera entre chunks aparezcan completos en al menos uno.
- **Frontera markdown** es gratis y mantiene cohesión semántica. Una sección bajo `## Plan de entrenamiento` debe quedar entera (o partida limpiamente) — no a mitad de frase.

### Implementación

```ts
function chunkMarkdown(content: string, targetSize = 600, overlap = 100): string[] {
  // 1. Split por headings (`#`, `##`, `###`) primero — preserva contexto semántico
  // 2. Cada sección si > targetSize: re-split por párrafos (\n\n)
  // 3. Si aún > targetSize: split por oraciones (regex `[.!?]\s+`)
  // 4. Reagrupar con overlap a la salida
  // 5. Devolver array de strings
}
```

Librerías candidatas:
- `@langchain/text-splitter` (port TS) — `RecursiveCharacterTextSplitter` cubre el patrón directamente
- `llamaindex` `MarkdownNodeParser` — más opinionado pero específico a markdown
- **Implementación propia ligera** — 50-100 líneas, sin dependencia. Probablemente la opción correcta dado que el Huygens MCP debe ser delgado (~200 líneas TS)

Decisión actual: implementación propia. Trivial de testear, cero dependencia, y el algoritmo es estable.

### Cuántos tokens son "X tokens"

Estimación grosera, suficiente para chunking:

```ts
function approxTokens(text: string): number {
  // Heurística: ~4 chars por token en español/inglés mezclado
  return Math.ceil(text.length / 4)
}
```

Si en el futuro la heurística falla (chunks muy desviados del target), introducir `tiktoken` o el tokenizer real de BGE-M3. No vale la pena hasta entonces.

## Índice vectorial en SurrealDB

SurrealDB ofrece índices vectoriales nativos con HNSW. La definición es declarativa, sin trámites tipo `createSearchIndex` de Mongo Atlas:

```surql
DEFINE INDEX note_chunk_embedding ON note_chunk
  FIELDS embedding HNSW DIMENSION 1024 DIST COSINE;
```

### Parámetros HNSW por defecto (ajustables)

| Param | Default | Significado |
|---|---|---|
| `M` | 16 | Conexiones por nodo en el grafo HNSW |
| `EFC` (efConstruction) | 200 | Calidad del grafo al construirlo. Más = mejor recall, más lento de insertar |
| `EF` (efSearch) | 100 | Candidatos visitados por query. Más = mejor recall, más lento de buscar |

Defaults son razonables para corpus < 1M vectores. Para Huygens (volumen personal, miles de chunks máximo), los defaults sobran. Tuning solo si recall empieza a caer en evaluación.

Sintaxis para overridear:

```surql
DEFINE INDEX note_chunk_embedding ON note_chunk
  FIELDS embedding HNSW DIMENSION 1024 DIST COSINE
  M 16 EFC 200;
```

### Por qué HNSW y no IVF

SurrealDB también soporta MTREE para vectores. HNSW es el standard de facto en RAG por:

- **log(n) en lookup** sin precomputar centroides
- **Inserts incrementales**: añadir un nuevo chunk no obliga a recomputar nada global. Crítico cuando el corpus crece organicamente día a día
- **Mejor recall** que IVF a igual presupuesto computacional para corpus pequeños/medianos

IVF brilla en corpus de > 10M vectores con re-balanceo periódico. No es el caso de Huygens.

## Query vectorial básica

Búsqueda directa, sin filtros:

```surql
SELECT 
  id,
  content,
  noteId,
  vector::distance::cosine(embedding, $query_vector) AS score
FROM note_chunk
WHERE embedding <|10|> $query_vector
ORDER BY score ASC
LIMIT 10;
```

Desglose:

- `embedding <|10|> $query_vector` — sintaxis nativa de SurrealDB para "top-K nearest neighbors". El `<|10|>` significa "K=10 candidatos del índice HNSW"
- `vector::distance::cosine(embedding, $query_vector) AS score` — calcula la distancia exacta (no la aproximada del índice) para los candidatos. Menor = más similar
- `ORDER BY score ASC` — porque es **distancia**, no similitud. Si quisiéramos similitud, sería `1 - score` y `ORDER BY ... DESC`

### Sobre el K y el LIMIT

`<|10|>` y `LIMIT 10` son redundantes para queries simples. La razón de tenerlos separados aparece en queries híbridas: pedir más candidatos del índice (`<|30|>`) y luego filtrar/reordenar (`LIMIT 10`).

## Hybrid search — la query realmente útil

Vector similarity sola es pobre. Para Huygens, los filtros narrativos (estado GTD, temporal, pilares) son **fundamentales**. SurrealDB permite combinarlos todos en una sola query, sin post-processing en código:

```surql
SELECT 
  c.id,
  c.content,
  c.note.title,
  c.note.->touches_pillar->pillar.slug AS pillars,
  vector::distance::cosine(c.embedding, $query) AS score
FROM note_chunk AS c
WHERE c.embedding <|20|> $query
  AND c.note.state IN ['ACTIVE', 'WAITING']
  AND c.note.updated_at > $since
ORDER BY score ASC
LIMIT 10;
```

Esto combina, en una sola query:

1. **Similitud vectorial** — top-20 candidatos del índice HNSW
2. **Filtro de estado GTD** — solo notas en estados "vivos"
3. **Filtro temporal** — solo cambios recientes
4. **Graph traversal** — sigue `->touches_pillar->pillar` para exponer los pilares de cada nota en el resultado

Esto es exactamente el tipo de query que un grafo schemafull hace bien y un Mongo con `$vectorSearch` hace de forma torpe (requiere `$lookup`, pipelines anidados, latencia agregada). Ver [`../04-database/surrealdb-innovations.md`](../04-database/surrealdb-innovations.md) para el detalle de por qué esto es relevante.

### Patrón general de hybrid search

```
1. Recall amplio: `<|30|>` o `<|50|>` desde el índice vectorial
2. Filtros estructurales: estado, fechas, pilares, tipo
3. Re-ranking opcional (cross-encoder)
4. Truncar a top-K final con LIMIT
```

Pedir más candidatos del índice (paso 1) de los que finalmente devuelves (paso 4) compensa el coste de los filtros: si pides `<|10|>` y todos están filtrados out por estado, te quedas con nada. Con `<|30|>` la probabilidad de tener supervivientes suficientes es alta.

## Re-ranking (opcional, futuro)

Vector similarity captura semántica gruesa. Para precisión fina, un **cross-encoder reranker** reordena los top-K candidatos comparando query↔documento directamente (en vez de comparar embeddings precalculados).

- DeepInfra hostea rerankers: `BAAI/bge-reranker-v2-m3` es el natural complemento a BGE-M3
- Patrón: vector search recupera top-30 → reranker reordena → devuelves top-10
- Coste: +200ms de latencia, +tokens facturados (cents)

**No es prioridad v1**. Introducir solo si en evaluación se observa que los top-3 son frecuentemente irrelevantes pero hay relevantes en el top-30.

## Pipeline de indexing

¿Cuándo se generan / regeneran los chunks de una nota? Esquema:

```
Note.content cambia
   ↓
DELETE chunks existentes de esa Note (CASCADE)
   ↓
chunk(content) → string[]
   ↓
embedBatch(chunks) → number[][]
   ↓
CREATE note_chunk × N
```

Implementación: tool del Huygens MCP llamado `reindex_note(noteId)`. Se llama:

- **No** al crear la nota inicialmente si está en `INBOX` (ver más abajo)
- Cuando una Note pasa de `INBOX` a `CLARIFIED` (primera indexación real)
- Cuando una Note ya clarificada modifica `content` significativamente
- En batch tras un re-embed total (cambio de modelo de embeddings)

### Por qué no indexar en INBOX

Durante captura, el contenido de una nota cambia mucho (el agente edita, el usuario añade). Reembeber cada cambio sería:

- **Ruido en el índice**: chunks zombi durante segundos/minutos
- **Coste innecesario**: por barato que sea, hacerlo bien es hacerlo una vez
- **Latencia percibida**: la captura debe ser instantánea, indexar no

Política: **`INBOX` no se indexa**. Indexación arranca al transicionar a `CLARIFIED` (cuando el contenido es "estable enough" para querer encontrarlo).

### Idempotencia

`reindex_note(noteId)` debe ser idempotente: llamarlo dos veces seguidas con el mismo contenido produce los mismos chunks + embeddings. El `DELETE → CREATE` lo garantiza, aunque pierde IDs estables de chunk entre runs (no es problema si los chunks son efímeros y no se referencian directamente desde fuera).

## Métricas a monitorizar

Lista de instrumentación sugerida — no obligatoria v1, pero buena de tener cuando el sistema crezca:

| Métrica | Por qué importa |
|---|---|
| **Recall@10** | ¿Cuántas notas relevantes aparecen en top-10? Necesita ground truth (queries + relevantes etiquetados manualmente). 30-50 queries marcadas es suficiente para detectar drift |
| **Latencia p50 / p99** | Vector search con HNSW es < 50ms p99 para corpus < 100K vectores. Si sube, algo va mal (índice corrupto, query mal formada, EFSearch demasiado alto) |
| **% de chunks "stale"** | Chunks cuyo embedding fue generado contra un `content` distinto al actual de la nota. Indicador de pipeline roto |
| **Coste mensual en DeepInfra** | Sanity check. Si pasa de céntimos a euros, hay un bug de reindexado loop |

## Mantenimiento (recurring jobs)

### Detección de stale chunks

Comparar `note.updated_at` con `note_chunk.created_at` (asumiendo `created_at` del chunk = momento de indexing). Si `note.updated_at > note_chunk.created_at`, el chunk está stale.

```surql
SELECT id, noteId, created_at
FROM note_chunk
WHERE created_at < note.updated_at;
```

Posible job nocturno: detectar stale + llamar a `reindex_note` para cada nota afectada.

### Limpieza de huérfanos

Chunks de notas eliminadas. Si el schema usa `CASCADE` en la relación `note_chunk → note`, SurrealDB lo gestiona automáticamente. Si no, job de limpieza:

```surql
DELETE note_chunk WHERE noteId NOT IN (SELECT id FROM note);
```

### Reembed completo

Para cambio de modelo o de parámetros HNSW. Procedimiento:

1. Drop del índice viejo: `REMOVE INDEX note_chunk_embedding ON note_chunk;`
2. Define del índice nuevo con la dimensión correcta
3. Re-batch `embedBatch` sobre todos los chunks existentes
4. Update del campo `embedding` + `embeddingModel`

Cuestión de horas para volumen personal. No requiere downtime real si se hace fuera de queries activas.

## Para profundizar

- **HNSW paper**: Malkov & Yashunin, 2016 — *Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs* — [arXiv:1603.09320](https://arxiv.org/abs/1603.09320)
- **MTEB benchmark**: <https://huggingface.co/spaces/mteb/leaderboard> — para comparar embedders en retrieval
- **ColBERT**: Khattab & Zaharia, 2020 — *Efficient and Effective Passage Search via Contextualized Late Interaction over BERT* — [arXiv:2004.12832](https://arxiv.org/abs/2004.12832) — relevante si exploramos multi-vector embeddings de BGE-M3 en el futuro
- **Hybrid retrieval**: Lin et al., *Aggretriever: A Simple Approach to Aggregate Textual Representations for Robust Dense Passage Retrieval*, y la literatura RAG general — fusion de BM25 + dense con RRF (Reciprocal Rank Fusion)
- **Reranking**: Nogueira & Cho, 2019 — *Passage Re-ranking with BERT* — fundamenta el patrón de bi-encoder + cross-encoder

## Cross-references

- [`./bge-m3.md`](./bge-m3.md) — qué produce el embedding que indexamos
- [`./deepinfra-integration.md`](./deepinfra-integration.md) — cómo se obtiene el embedding en runtime
- [`../03-data-model/note-model.md`](../03-data-model/note-model.md) — schema de Note y NoteChunk
- [`../04-database/surrealdb-deep-dive.md`](../04-database/surrealdb-deep-dive.md) — fundamentos de SurrealDB y su sintaxis
- [`../04-database/surrealdb-innovations.md`](../04-database/surrealdb-innovations.md) — por qué SurrealDB hace mejor el hybrid search que Mongo
- [`../02-architecture/mcp-three-layer-architecture.md`](../02-architecture/mcp-three-layer-architecture.md) — el Huygens MCP expone `vector_search` y `reindex_note` como tools
