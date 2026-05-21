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
2. **Síntesis** — agente llama `synthesize` → N **blocks narrativos atómicos** (`block_kind='narrative'`) con `derived_from` al raw, `about` a sujetos mencionados, `based_on` a blocks cercanos
3. **Topologización** — worker detecta blocks narrativos no topologizados → traduce cada uno a mutaciones del grafo (crea/actualiza tasks, projects, ideas, etc.) → emite `affects` edges

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

Tablas principales (objetivo per `docs/MODEL.md`, schema actual puede no reflejar todavía):

| Tabla | Rol |
|---|---|
| `raw_capture` | Evidencia cruda inmutable. `content`, `source_kind`, `source_ref`, `created_at` |
| `note` | Entidad topológica tipada. `title`, `type`, `state` (CLARIFIED única usada), `block_order`, `metadata` |
| `block` | Átomo direccionable. `content`, `embedding`, `block_kind` ('descriptive'\|'narrative'), `note` opcional, + fields narrativos (`about`, `based_on`, `derived_from`, `topologized_at`) |
| `note_type` | Taxonomía (8 seedeados). Slug único |
| `agent_event` | Trazabilidad de decisiones del agente (ver ADR-0019) |

Edges schemafull (`TYPE RELATION FROM X TO Y`). Semánticos:

- `part_of` — jerarquía (Objetivo→Project→Task). `note → note`
- `blocked_by` — dependencia. `note → note | block`
- `mentions`, `supports`, `refutes` — `note | block → note | block`
- `authored_by` — `note | block → note` (Persons son notes con type=person)
- `about` — `block(narrative) → note` (multi, los sujetos que cubre un informe-block)
- `based_on` — `block(narrative) → block(narrative)` (cadena narrativa)
- `affects` — `block(narrative) → note` (mutaciones del worker, con `action`, `summary`)
- `derived_from` — `block | note → raw_capture` (provenance, con `transformation`)

Validaciones del motor:
- `state: string` con `ASSERT $value INSIDE ['CLARIFIED','ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED']` (solo CLARIFIED driven)
- `source_kind` en `raw_capture` con `ASSERT $value INSIDE ['chat','voice','manual','import','agent-self']`
- `block_kind` con `ASSERT $value INSIDE ['descriptive','narrative']`
- Todos los edges con `FROM/TO` y `UNIQUE(in, out)` enforced

**NoteTypes seedeados** (8): `task`, `project`, `area`, `routine`, `person`, `reference`, `objetivo`, `idea`. Eliminados respecto a versiones previas: `report` (los informes son blocks narrativos) y `note` (genérico, solapaba con block narrativo). Detalle: [`docs/MODEL.md`](./docs/MODEL.md).

**Captura ≠ Note.** Una captura cruda crea un `raw_capture`, no una `note`. Las notes se crean (o actualizan) cuando el worker topologiza un block narrativo, no antes.

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

