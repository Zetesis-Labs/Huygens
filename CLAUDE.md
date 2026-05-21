# CLAUDE.md

> **Lectura obligatoria al inicio de sesión** — única:
> [`docs/MODEL.md`](./docs/MODEL.md) — modelo canónico del sistema. Reemplaza todos los docs conceptuales anteriores.
>
> Este fichero (`CLAUDE.md`) contiene **convenciones del repo + comandos**. El modelo de dominio vive en `docs/MODEL.md`.

## Proyecto

Monorepo TypeScript con **Bun** + **SurrealDB** + **MCP** en `apps/mcp`. Workspaces (`apps/*`) y backend (`backend/huygens-worker`) en Python.

Filosofía: el sistema gira en torno al **informe** como artefacto central. Tú conversas con un agente, el agente genera informes a partir de las conversaciones usando informes previos como contexto, y un worker pequeño aplica lo que dice cada informe al grafo de tasks/projects/objetivos/ideas/references.

El detalle completo está en [`docs/MODEL.md`](./docs/MODEL.md). Aquí solo lo esencial para operar.

## Las tres fases del flujo

1. **Captura** — agente vuelca conversación → `raw_capture` inmutable
2. **Síntesis** — agente llama `generate_report` → nuevo `note(type=report)` con `derived_from` al raw y `based_on` a informes cercanos
3. **Topologización** — worker detecta informe sin topologizar → traduce su narrativa a mutaciones del grafo (crea/actualiza tasks, projects, ideas, etc.) → emite `affects` edges

Detalle: [`docs/MODEL.md`](./docs/MODEL.md).

## Lo que está fuera del scope este ciclo

- Estados ≠ CLARIFIED, `mit_for`, transiciones explícitas — schema lo acepta, no se driven
- Routines con RRULE engine — `routine` es solo clasificación
- Reviews-as-entity, dashboard — no implementados

## Convenciones

- **ESM only** — `"type": "module"` en todos los `package.json`
- **Biome** para lint/format (no ESLint, no Prettier)
- **Bun** como runtime y package manager (no Node, no pnpm)
- **TypeScript estricto** — `as any` prohibido
- **Conventional commits** en inglés
- **Sin git sin instrucción explícita** — no commits, push, branch, tag a menos que el usuario lo pida

## Release pipeline

Conventional commits → release-please abre/actualiza un PR de release agregando los bumps. Merge del PR = tags + GH Releases + build de imágenes Docker (Harbor) + publicación del Helm chart como OCI artifact.

### Componentes versionables

| Scope        | Path                       | Tag             | Artefacto |
|--------------|----------------------------|-----------------|-----------|
| `mcp`        | `apps/mcp`                 | `mcp-v*`        | `gauss.nexolabs.dev/huygens/mcp:v*` |
| `worker`     | `backend/huygens-worker`   | `worker-v*`     | `gauss.nexolabs.dev/huygens/worker:v*` |
| `helm`       | `helm/huygens`             | `helm-v*`       | `oci://gauss.nexolabs.dev/huygens/huygens:*` |

### Reglas de bump

- `feat(scope): ...` → minor
- `fix(scope): ...` → patch
- `feat(scope)!: ...` o footer `BREAKING CHANGE:` → major
- `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `ci:` (sin scope o con scope no versionable) → sin bump

Commits sin scope o con scope desconocido NO disparan release de ningún componente.

### Cambios multi-componente

Commits separados (uno por scope) O un commit con bullets en el body que release-please parsea:

```
feat: add lens cognition

* feat(mcp): expose lens_score tool
* feat(worker): persist lens predictions on commit
```

### Secrets requeridos en GitHub Actions

- `HARBOR_USERNAME`
- `HARBOR_PASSWORD`

Si la org `Zetesis-Labs` ya los tiene a nivel organization (vienen de ZetesisPortal), Huygens los hereda automáticamente.

## Devcontainer

Tres servicios: `app` (Bun), `surrealdb` (BBDD principal), `surrealdb-init` (one-shot, chown del volumen para que SurrealDB corra rootless como uid 65532). A futuro: `huygens-worker` (Python + Agno) para procesamiento autónomo del inbox (ver ADR-0018).

Nombres de contenedor (Docker Compose, project name `devcontainer`):

```bash
docker exec devcontainer-app-1 bun install
docker exec devcontainer-app-1 bun --filter '@huygens/mcp' typecheck
docker exec devcontainer-app-1 bun lint

# Conexión a SurrealDB desde dentro del app:
SURREAL_URL=ws://surrealdb:8000/rpc
SURREAL_NS=huygens
SURREAL_DB=main
SURREAL_USER=root
SURREAL_PASS=root
```

Si Cursor/Dev Containers usa otro project name (e.g. `huygens_devcontainer`), los nombres serán `huygens_devcontainer-*`. Ajustar comandos según `docker ps`.

## Comandos

```bash
bun install            # raíz: instala todas las workspaces
bun dev                # raíz: arranca todas las apps en modo watch
bun lint               # raíz: biome check .
bun typecheck          # raíz: tsc --noEmit en cada workspace

cd apps/mcp
bun dev                # MCP en :3030
bun run db:apply       # ejecuta surreal/schema.surql + surreal/seed.surql
bun run db:smoke       # smoke test contra SurrealDB
```

## MCP

- Transporte: **Streamable HTTP** del SDK oficial (`@modelcontextprotocol/sdk`)
- Endpoint: `POST /mcp` en el puerto `MCP_PORT` (default `3030`)
- Stateless por defecto (`sessionIdGenerator: undefined`) — cada request crea su transport efímero

## Modelo de datos (SurrealDB) — resumen

Modelo en dos planos (ver [`docs/MODEL.md`](./docs/MODEL.md) para el detalle):

1. **Plano 1 — `raw_capture`**: lo que el usuario dijo literalmente. Evidencia inmutable. El verdadero inbox.
2. **Plano 2 — `note` + `block` + edges**: interpretación del agente. Topología procesada.

Tablas principales (`apps/mcp/surreal/schema.surql`):

| Tabla | Rol |
|---|---|
| `raw_capture` | Evidencia cruda. `content`, `source_kind`, `source_ref`, `processed_at` (NONE = pendiente). El "inbox real" |
| `note` | Contenedor procesado. `title`, `type` opcional, `state` (ciclo ZTD), `block_order`, `metadata`, `mit_for` (Most Important Task) |
| `block` | Unidad direccionable + vectorizable. `note` (ref), `content` (markdown), `embedding` (1024 dims). Vector HNSW index aquí |
| `note_type` | Árbol editable de tipos (10 seedeados). Slug único, `parent` opcional, `featured_fields` |
| `agent_event` | Trazabilidad de decisiones del agente (ver ADR-0019) |

Edges schemafull (`TYPE RELATION FROM X TO Y`). Los semánticos admiten `note | block` en ambas puntas:

- `part_of` — jerarquía macro (Objetivo→Project→Task). Solo `note → note`
- `blocked_by` — `note → note | block` (con `since`, `reason`)
- `mentions`, `supports`, `refutes` — `note | block → note | block`
- `about` — `note → note | block` (Report cubre estos elementos)
- `authored_by` — `note | block → note` (Persons son notes con type=person)
- `derived_from` — `note | block → raw_capture` (con `transformation`: verbatim/extracted/summarized/inferred)

Validaciones del motor:
- `state: string` con `ASSERT $value INSIDE ['CLARIFIED','ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED']`
- `source_kind` en `raw_capture` con `ASSERT $value INSIDE ['chat','voice','manual','import','agent-self']`
- Todos los edges con `FROM/TO` y `UNIQUE(in, out)` enforced

**NoteTypes seedeados** (10): `task`, `project`, `area`, `routine`, `note`, `report`, `person`, `reference`, `objetivo`, `idea`. Detalle de cuándo usar cada uno: [`docs/MODEL.md`](./docs/MODEL.md).

**Captura ≠ Note.** Una captura cruda crea un `raw_capture`, no una `note`. Las notes existen porque el agente ya procesó (clarify) un raw — nacen con `state = 'CLARIFIED'` por defecto.

**Embeddings**: DeepInfra hospeda `BAAI/bge-m3` (1024 dims, contexto 8192 tokens, multilingüe). API key via `DEEPINFRA_API_KEY`. Los campos `block.embedding_model` guarda `'BAAI/bge-m3'`; `block.dimensions` guarda `1024`.

## Búsqueda vectorial

Índice HNSW nativo directamente sobre `block` (1024 dims, BGE-M3, cosine). El block ES el chunk.

```surql
DEFINE INDEX block_embedding ON block
  FIELDS embedding HNSW DIMENSION 1024 DIST COSINE
  TYPE F32 EFC 150 M 12 M0 24;
```

Query K-NN con threshold (patrón kaig-inspired):

```surql
SELECT *, score FROM (
  SELECT id, content, note, (1 - vector::distance::knn()) AS score
  FROM block
  WHERE embedding <|10|> $query_embedding
)
WHERE score >= $threshold
ORDER BY score DESC;
```

Hybrid (vector + filtro de note + temporal):

```surql
SELECT b.id, b.content, b.note.title,
       vector::distance::cosine(b.embedding, $query) AS score
FROM block AS b
WHERE b.embedding <|20|> $query
  AND b.note.state IN ['ACTIVE', 'WAITING']
  AND b.note.updated_at > $since
ORDER BY score ASC
LIMIT 10;
```

## Renderizado de una page completa

`note` no tiene `content`. Para reconstruir el markdown completo:

```ts
const [reread] = await db.query<[Note[]]>('SELECT * FROM note WHERE id = $id', { id })
const note = reread[0]
const [blocks] = await db.query<[Block[]]>(
  'SELECT id, content FROM block WHERE id IN $ids',
  { ids: note.block_order }
)
const byId = new Map(blocks.map(b => [String(b.id), b]))
const markdown = note.block_order
  .map(id => byId.get(String(id))?.content)
  .filter(Boolean)
  .join('\n\n---\n\n')
```

## Arquitectura MCP (cuatro componentes hermanos)

```
                      Agente (prompt = dominio ZTD)
                       │                         │
                       ├─ surrealmcp oficial     ├─ Huygens MCP (TS, pequeño)
                       │  CRUD + RELATE + query  │  embed, chunk, vector_search, report
                       │                         │
                       └────────────┬────────────┘
                                    ▼
                              SurrealDB ←── LIVE query ──→ huygens-worker
                                                          (Python + Agno, ver ADR-0018)
```

Cuatro componentes hermanos:
- **Agente principal** (Claude/Codex/Hermes) — interactúa con el usuario
- **surrealmcp** (oficial de SurrealDB) — CRUD + RELATE genérico vía MCP
- **Huygens MCP** (este repo) — tools de infraestructura específicas (embed, chunk, vector_search, etc.)
- **huygens-worker** (Python + Agno, planeado) — procesa el inbox autónomamente vía LIVE query

Detalle: `docs/research/02-architecture/mcp-three-layer-architecture.md` y ADR-0014/0018.

## Observabilidad

Dos capas complementarias (ver ADR-0019 y ADR-0020):

- **`agent_event`**: cada decisión del agente (worker o conversacional) emite un evento con `kind`, `actor`, `session_id` (UUIDv7), `confidence`, `reasoning_summary`, `tokens_used`, etc. Retention ilimitado.
- **CHANGEFEED 10y** sobre tablas críticas (raw_capture, note, block, edges): time-travel queries y reconstrucción histórica del estado.

