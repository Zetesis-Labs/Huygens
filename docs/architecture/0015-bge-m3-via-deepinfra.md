# ADR-0015: BGE-M3 vía DeepInfra para embeddings

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: architecture

## Context

Huygens necesita vector search semántico sobre los `block`s. Dos decisiones acopladas: **qué modelo** y **dónde se ejecuta**. El contenido es principalmente español con términos técnicos en inglés mezclados, los tochos largos son habituales, y el volumen es personal — miles de notas/año. Sin lock-in a un proveedor cerrado, sin administrar un servicio de inferencia si no aporta.

## Decision

**Modelo**: **BGE-M3** (`BAAI/bge-m3`) en modo **dense** — 1024 dimensiones, cosine distance, contexto 8192 tokens, MIT license. El modelo soporta también `sparse` y `multi-vector`, pero **solo usamos dense**; los otros quedan como opcionalidad futura.

**Hosting**: **DeepInfra** vía API OpenAI-compatible (`POST /v1/openai/embeddings`). API key via env `DEEPINFRA_API_KEY` (pendiente añadir al `devcontainer.json`).

Razones BGE-M3:

- **Multilingüe nativo** (100+ idiomas; fuerte en español y mezclas ES/EN)
- **Contexto 8192 tokens** (≈ 24-30 KB en español) — maneja tochos sin chunking agresivo
- **MIT license** — sin lock-in legal; autohospedable (TEI, FlagEmbedding, Ollama) si DeepInfra cae
- **Top performer MIRACL** en multilingüe; bien rodado en GraphRAG/memoria agéntica

Razones DeepInfra:

- **Coste irrelevante** (~$0.01 / 1M tokens — fracciones de euro al año)
- **API OpenAI-compatible** — cliente trivial, portable
- **Hostea BGE-M3 directamente** — sin self-hosting ni descargar 2.3 GB
- **Cuenta ya existente** (compartida con el reranker de ZetesisPortal)
- **Sin lock-in** — cambiar provider es cambiar el endpoint HTTP

Consecuencias técnicas inmediatas en el schema:

- `block.embedding` es `array<float>` length **1024**
- `block.embedding_model` guarda `'BAAI/bge-m3'`; `block.dimensions` guarda `1024`
- HNSW: `DEFINE INDEX block_embedding ON block FIELDS embedding HNSW DIMENSION 1024 DIST COSINE ...` (params en ADR-0007)
- Los vectores que devuelve la API están ya **L2-normalized** — cosine ≡ dot product, sin renormalizar

## Consequences

- **Positivas**:
  - Multilingüe ES/EN cubierto desde el día uno
  - Contexto 8192 permite estrategias mixtas (embedding por block y/o global por nota)
  - Coste despreciable; portabilidad (modelo self-hosteable)
- **Negativas**:
  - Dependencia de red externa (DeepInfra) en cada `embed_text`
  - Si DeepInfra cae, no hay vector search hasta restaurar — fallback a TEI/Ollama queda como camino documentado
- **Neutrales**:
  - `embedding_model` por block permite migración progresiva (convivir dos modelos filtrando por `WHERE embedding_model = 'X'`)

## Alternatives considered

### Modelo

| Modelo | Dims | Contexto | Por qué se rechazó |
|---|---|---|---|
| `intfloat/multilingual-e5-large` | 1024 | 512 | Contexto demasiado corto para los tochos |
| `jinaai/jina-embeddings-v3` | 1024 (Matryoshka) | 8192 | Apache 2.0, comparable. Alternativa válida. BGE-M3 gana por rodaje y tracking MIRACL |
| `nomic-ai/nomic-embed-text-v1.5` | 768 | 8192 | Principalmente inglés; débil en español |
| `text-embedding-3-small` (OpenAI) | 1536 | 8192 | Lock-in, propietario, sin self-hosting |

### Hosting

| Hosting | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| HuggingFace TEI (self-hosted) | Control total | Operar otro servicio, mantenimiento, latencia variable | Sobreingeniería para volumen personal |
| Ollama (local) | Cero red, privacidad | Throughput pobre, 2.3 GB en local | Bueno experimentar, peor en uso real |
| DeepInfra (elegido) | Coste irrelevante, OpenAI-compatible, cero operación | Dependencia de red | Balance óptimo en esta fase |

## Related

- ADRs: `ADR-0007` (HNSW params; `DIMENSION 1024` viene de aquí), `ADR-0009` (blocks llevan embedding directo, sin tabla `note_chunk`), `ADR-0014` (Huygens MCP envuelve la llamada en la tool `embed_text`)
- Research: [docs/research/05-embeddings-vector/bge-m3.md](../research/05-embeddings-vector/bge-m3.md), [docs/research/05-embeddings-vector/deepinfra-integration.md](../research/05-embeddings-vector/deepinfra-integration.md)
- Código afectado: `apps/mcp/surreal/schema.surql`, tool `embed_text` en Huygens MCP

## Notes

Migrar de modelo en el futuro es caro pero no destructivo. Si las dimensiones cambian (e.g. 768 o 1536), hay que `DEFINE INDEX OVERWRITE` con la nueva dimensión. Para volumen personal, re-embed total son horas, no días.
