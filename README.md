# Huygens

Memoria estructurada personal para Rubén. Es un MCP server basado en
**SurrealDB** que sirve como capa de memoria para agentes conversacionales
como Claude Code, Codex o Hermes.

**¿Cómo se usa?** → [`docs/GUIDE.md`](./docs/GUIDE.md) — la guía del usuario:
cómo hablar con el agente (capturar, ordenar, preguntar), la jornada y la
semana, y la metodología organizativa (MITs, ejes temporales, estados,
jerarquía). Sin tecnicismos.

## Modelo

El modelo conceptual canónico vive en [`docs/MODEL.md`](./docs/MODEL.md).
La guía operativa para agentes vive en la **doctrina operativa**, servida por el
MCP como recurso `huygens://lore/operating-doctrine`
([`apps/mcp/src/lore/operating-doctrine.md`](./apps/mcp/src/lore/operating-doctrine.md)).
(`docs/CONVENTIONS.md` quedó como stub que redirige ahí.)

Dirección objetivo v2.1-lite:

```text
captura durante el dia
  -> inbox de raw_capture
  -> sesion deliberada de procesamiento
  -> uno o varios informe-blocks aprobados
  -> propuesta visible de mutaciones
  -> commit al grafo
```

El informe no es una `note(type=report)` en el modelo objetivo. Es un
`block` narrativo (`block_kind='narrative'`) que conserva el acto de
interpretacion entre la evidencia cruda y la topologia.

## Estado actual

El flujo v2.1-lite ya existe en schema/tools:

- `raw_capture.status`: `pending | processed | ignored | deferred`.
- `block.block_kind`: `descriptive | narrative`.
- `note.mit_for`: campo de primera clase (datetime indexado); una fecha
  `YYYY-MM-DD` cae a medianoche UTC.
- `proposal`: drafts visibles antes del commit. El payload almacenado ya habla en
  ids reales (notas/blocks se asignan al crear la proposal), así que es el SSOT de
  las mutaciones; tras el commit el `result` guarda solo el ancla (`versionstamp` +
  `committed_at`). La historia vive en el changefeed.
- `commit_proposal`: operación atómica (`BEGIN…COMMIT`); cualquier fallo revierte
  la transacción completa. Un informe de ritual (kind plan_day/review_day) exige
  `approved: true` y se rechaza si ya hay uno hoy.
- `get_proposal`: preview determinista y legible de lo que el commit
  creará/cambiará, seguido del JSON crudo.
- `get_proposal_changes`: el delta exacto de un commit, leído del `payload` de la
  proposal (SSOT, ids reales) — `source: 'payload'`, sin dependencia del
  changefeed. La visualización gráfica del cambio vive en el dashboard (React
  Flow), no en el MCP.

El flujo legacy `raw -> clarify -> notes` fue retirado. No hay
`commit_clarify`, no hay `generate_report` persistente y el seed ya no crea
`note_type:note` ni `note_type:report`.

### Superficie de tools MCP

```text
capture             persist a raw_capture
list_inbox          list raws by status (default: pending)
set_raw_status      mark raws ignored/deferred/processed
create_proposal     persist a visible draft (no graph mutation)
update_proposal     update a draft proposal
get_proposal        human-readable preview + raw JSON; result if committed
get_proposal_changes changes produced by a committed proposal (JSON, read from the proposal payload — SSOT)
discard_proposal    discard a draft
commit_proposal     atomic graph commit (BEGIN…COMMIT)
find_related        existing notes related to a concept (vector, deduped)
vector_search       KNN block search via HNSW (BGE-M3, cosine)
lexical_search      BM25 full-text over block content (exact terms/names/IDs)
hybrid_search       fuse vector_search + lexical_search via Reciprocal Rank Fusion
index_block         embed 1..64 blocks and persist in HNSW index
query_query         read-only SurrealQL (huygens_reader / VIEWER role)
retract             auditable delete of records + edges (atomic, dry_run default)
collection_stats    graph health: counts + embedding coverage (read-only)
chunk_markdown      split markdown into heading-aware chunks (pure)
embed_text          embed 1..64 strings with BGE-M3 (1024 dims)
```

## Stack

- **Bun** 1.x — runtime y package manager
- **TypeScript** estricto, ESM
- **SurrealDB** 3.x — grafo + documento + vector search
- **Driver JS** `surrealdb@2.x`
- **MCP** (`@modelcontextprotocol/sdk`) con transporte Streamable HTTP
- **Embeddings**: `BAAI/bge-m3` vía DeepInfra
- **Biome** para lint y format
- **Python** para futuros workers especializados conectados al MCP

## Estructura

```text
.
├── .devcontainer/         # Devcontainer: app + SurrealDB + servicios auxiliares
├── apps/mcp/              # MCP server Bun + TypeScript
│   ├── surreal/           # schema.surql + seed.surql
│   ├── scripts/           # apply-schema.ts, smoke.ts
│   └── src/               # entrypoint, cliente SurrealDB, tools MCP
├── backend/huygens-worker/# Shell Python MCP para futuros workers especializados
├── docs/
│   ├── MODEL.md           # Modelo canónico v2.1-lite
│   ├── CONVENTIONS.md     # Reglas operativas para agentes
│   └── research/          # Investigación y contexto profundo
├── AGENTS.md              # Entry point para agentes
├── CLAUDE.md              # Entry point específico para Claude Code
└── USING.md               # Uso operativo del stack actual
```

## Cómo empezar

Todo se ejecuta dentro del devcontainer.

```bash
cd apps/mcp
bun run db:apply
bun run db:smoke
bun dev
```

Comandos desde la raíz:

```bash
bun install
bun lint
bun typecheck
```

El MCP escucha en:

```text
http://localhost:3030/mcp
```

Variables de entorno principales:

```bash
SURREAL_URL=ws://surrealdb:8000/rpc
SURREAL_NS=huygens
SURREAL_DB=main
SURREAL_USER=root
SURREAL_PASS=root
```
