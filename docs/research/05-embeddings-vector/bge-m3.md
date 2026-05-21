# BGE-M3 — el modelo de embeddings elegido

> Documento de referencia sobre el modelo de embeddings que Huygens usa para vectorizar el contenido de las notas. Centrado en **qué es**, **por qué encaja**, **alternativas descartadas** y **cómo se materializa en el schema**.

## Identidad

- **Nombre completo**: BGE-M3 (BAAI General Embedding M3)
- **Productor**: BAAI (Beijing Academy of Artificial Intelligence)
- **Repositorio HuggingFace**: [`BAAI/bge-m3`](https://huggingface.co/BAAI/bge-m3)
- **Licencia**: MIT
- **Paper**: *BGE M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation* (Chen et al., 2024)

## El "M3"

La tres "M" son las tres dimensiones en las que el modelo se diferencia de los embeddings clásicos:

1. **Multi-Functionality** — produce simultáneamente tres tipos de representación: embedding **dense** (un único vector de 1024 dims, el clásico), embedding **sparse** (estilo BM25 con pesos aprendidos por término) y **ColBERT-style multi-vector** (un vector por token para late interaction). Para Huygens **solo usamos dense** — los otros dos modos quedan como optionalities futuras si llegásemos a necesitar hybrid search más sofisticado.

2. **Multi-Linguality** — entrenado sobre 100+ idiomas. Fuerte en español, lo cual es relevante: el contenido del usuario es principalmente español con algo de inglés mezclado en términos técnicos. Modelos solo-inglés o con español débil penalizan exactamente este tipo de mezcla.

3. **Multi-Granularity** — soporta hasta **8192 tokens** de contexto, frente a los 512 típicos de modelos anteriores de la familia BGE y de buena parte de E5. Esto cambia las reglas del juego: una nota larga puede embedderse entera para una vista "global", o chunkearse para resolución fina, sin que el modelo te obligue a chunkear por límite de ventana.

## Specs técnicos

| Spec | Valor |
|---|---|
| Vector dense | **1024 dimensions** |
| Contexto máximo | 8192 tokens (≈ 24-30 KB de texto español) |
| Distancia recomendada | Cosine |
| Tamaño del modelo | ~2.3 GB |
| Velocidad de inferencia | ~50-100 docs/s en GPU dedicada |
| Benchmark MIRACL (multilingüe) | Top performer en su fecha de release |
| Benchmark MTEB | Competitivo, sin liderar; gana en multilingüe |

8192 tokens en español equivale aproximadamente a **24-30 KB de texto** en condiciones normales (tokens ≈ 3-4 bytes en BPE multilingüe). Suficiente para los "tochos" largos que el usuario genera sin chunking forzoso.

## Por qué encaja con Huygens

- **Multilingüe nativo**: las notas son principalmente en español, con términos técnicos en inglés (`hook`, `commit`, `embedding`...) y citas de literatura mixta. Modelos solo-inglés o con español secundario (`nomic-embed-text-v1.5`, variantes débiles de `multilingual-e5`) penalizan exactamente este perfil de mezcla. BGE-M3 está entrenado contra este caso desde el principio.

- **Contexto 8192**: maneja los tochos del usuario sin chunkeo agresivo. Para una nota de 5000 tokens, un único embedding global es viable. Permite estrategias mixtas: embedding global de la nota + embeddings por chunk, ambos consultables (ver `vector-search-strategy.md`).

- **Open source MIT**: cero dramas legales, lock-in cero. Si DeepInfra desaparece mañana, el modelo es self-hosteable (TEI, sentence-transformers, Ollama). Es portable.

- **Comunidad activa**: usado en proyectos de GraphRAG y memoria agéntica. Bien testeado en producción por terceros, lo cual reduce la sorpresa.

- **Tracking en benchmarks**: MIRACL leaderboard mantenido, lo cual da una baseline objetiva para comparar contra alternativas futuras.

## Alternativas consideradas y descartadas

| Modelo | Dims | Contexto | Veredicto |
|---|---|---|---|
| `intfloat/multilingual-e5-large` | 1024 | 512 (!) | Contexto demasiado corto para los tochos del usuario |
| `intfloat/multilingual-e5-large-instruct` | 1024 | 512 | Mismo problema de contexto |
| `jinaai/jina-embeddings-v3` | 1024 (Matryoshka) | 8192 | Apache 2.0, comparable. **Alternativa válida**. BGE-M3 gana por rodaje |
| `nomic-ai/nomic-embed-text-v1.5` | 768 | 8192 | Principalmente inglés, débil en español |
| `text-embedding-3-small` (OpenAI) | 1536 | 8192 | Caro, lock-in OpenAI, propietario |
| `text-embedding-3-large` (OpenAI) | 3072 | 8192 | Caro, mismo problema. Dims excesivas para el dominio |
| `cohere/embed-multilingual-v3.0` | 1024 | 512 | Contexto corto, propietario |

### El detalle Jina v3 vs BGE-M3

Es la alternativa real más cercana — ambos son MIT/Apache, ambos multilingües, ambos 8192 ctx, ambos 1024 dims. Diferencias:

- **Jina v3 tiene Matryoshka representation learning**: puedes truncar las 1024 dims a 512 o 256 sin reentrenar, ahorrando storage proporcional. Útil cuando creces y el índice empieza a doler.
- **BGE-M3 no tiene Matryoshka**, pero tiene más tracking en MIRACL benchmark y más rodaje en proyectos RAG.
- **Jina v3** ofrece "task-specific prompts" (separate retrieval/clustering/classification heads). BGE-M3 es generalista.

Para Huygens, BGE-M3 gana por rodaje y por confianza en multilingüe. Si más adelante el storage del índice empieza a importar de verdad, Jina con Matryoshka es el path natural de migración.

## Impacto en el schema

El modelo concreto se persiste por chunk, no se hardcodea en la lógica. Esto permite cohabitación de modelos durante migraciones (ver `vector-search-strategy.md`).

```ts
NoteChunk {
  embedding:      Float[]   // length 1024
  embeddingModel: 'BAAI/bge-m3'
  dimensions:     1024
}
```

Y el vector index en SurrealDB (siguiendo el pivote desde MongoDB):

```surql
DEFINE INDEX note_chunk_embedding ON note_chunk
  FIELDS embedding HNSW DIMENSION 1024 DIST COSINE;
```

Tres cosas a notar:

1. **DIMENSION 1024** debe coincidir exactamente con `NoteChunk.dimensions`. Mismatch = error en runtime.
2. **DIST COSINE** es lo recomendado por el productor del modelo. Otros como `L2` o `DOT` funcionan pero degradan calidad para BGE-M3.
3. **HNSW** es el algoritmo de indexación aproximada — graph-based, log(n) en lookup. Alternativa a IVF (centroides). HNSW es lo que SurrealDB ofrece y es el standard de facto para corpus < 10M vectores.

## Cambiar de modelo después

El diseño está pensado para que migrar de modelo de embeddings sea **caro pero no destructivo**:

- El campo `embeddingModel` por chunk permite mezclar embeddings de modelos distintos durante una migración progresiva. Búsquedas pueden filtrar por modelo (`WHERE embeddingModel = 'BAAI/bge-m3'`) hasta que la migración esté completa.
- Migración total a otro modelo es un **re-embed completo**: recorrer cada chunk, embedderlo de nuevo, sustituir el vector + actualizar `embeddingModel`. Coste-tiempo proporcional al volumen del corpus.
- Si las dimensiones cambian (e.g. migrar de 1024 a 768 o 1536), también hay que **dropear y recrear el índice HNSW** con la nueva dimensión.

Para Huygens, con volumen personal (~miles de notas/año, no millones), un re-embed total es horas, no días. Asumible.

## Notas operativas

- **Modo de inferencia**: usamos solo dense embedding. La librería oficial `FlagEmbedding` permite obtener los tres modos a la vez, pero DeepInfra solo expone el dense por defecto (que es lo que necesitamos).
- **Normalización**: los vectores que devuelve BGE-M3 vía la API de DeepInfra ya están L2-normalized. Esto significa que **cosine distance ≡ dot product** (módulo signo y rango). No hay que renormalizar antes de indexar.
- **Idempotencia**: el mismo input produce el mismo output (modelo determinista). Útil para detectar drift o tests.

## Para profundizar

- Paper: Chen et al., 2024 — *BGE M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation* — [arXiv:2402.03216](https://arxiv.org/abs/2402.03216)
- HuggingFace model card: [`BAAI/bge-m3`](https://huggingface.co/BAAI/bge-m3)
- Repo oficial BAAI: [FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding)
- MTEB leaderboard: <https://huggingface.co/spaces/mteb/leaderboard>
- MIRACL benchmark: <https://project-miracl.github.io/>

## Cross-references

- [`../04-database/surrealdb-deep-dive.md`](../04-database/surrealdb-deep-dive.md) — cómo SurrealDB materializa el índice HNSW
- [`./deepinfra-integration.md`](./deepinfra-integration.md) — cómo llamamos al modelo en runtime
- [`./vector-search-strategy.md`](./vector-search-strategy.md) — estrategia de chunking y búsqueda híbrida
