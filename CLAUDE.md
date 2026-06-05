# CLAUDE.md

> Lectura obligatoria al inicio de sesión:
>
> 1. [`docs/MODEL.md`](./docs/MODEL.md) — el *porqué* conceptual (modelo v2.1-lite).
> 2. [`apps/mcp/src/lore/operating-doctrine.md`](./apps/mcp/src/lore/operating-doctrine.md) — **cómo debe comportarse el agente** (SSOT del comportamiento; recurso `huygens://lore/operating-doctrine`).
> 3. [`apps/mcp/src/lore/data-model.md`](./apps/mcp/src/lore/data-model.md) — el contrato físico (entidades, edges, ciclo de proposal, tools).
>
> Este fichero contiene convenciones del repo y comandos. (`docs/CONVENTIONS.md`
> quedó como stub: sus reglas se consolidaron en la doctrina operativa.)

## Proyecto

Huygens es una memoria estructurada personal para Rubén. El usuario habla con
un agente conversacional; el agente usa el MCP; el MCP persiste en SurrealDB.

Dirección objetivo:

```text
captura durante el dia
  -> inbox de raw_capture
  -> sesion deliberada de procesamiento
  -> uno o varios informe-blocks aprobados
  -> propuesta visible de mutaciones
  -> commit al grafo
```

La pieza central es el **informe-block**: un `block` narrativo
(`block_kind='narrative'`) que documenta la interpretacion entre la evidencia
literal y la topologia. No reintroducir reports como entidad persistida en el
modelo objetivo.

Tools MCP objetivo:

```text
capture
list_inbox
set_raw_status
create_proposal / update_proposal / get_proposal / discard_proposal
commit_proposal
get_proposal_changes
```

Tools auxiliares ya implementadas (lectura y búsqueda):

```text
find_related / vector_search / index_block / embed_text / chunk_markdown
query_query
```

## Reglas para Claude Code

- Habla con el usuario en español.
- Código y commits en inglés.
- No hagas commits, branches, push ni PRs sin petición explícita.
- No cambies schema, tipos, edges ni flujo de topologización por iniciativa
  propia.
- Usa `docs/MODEL.md` como fuente de verdad conceptual.
- Usa `apps/mcp/src/lore/operating-doctrine.md` para decidir cuándo capturar, proponer o mutar.
- No reintroduzcas el flujo antiguo `raw -> clarify -> notes`.

## Limpieza legacy

El código legacy del modelo anterior fue retirado:

```text
commit_clarify   eliminado
generate_report  eliminado
note_type:report eliminado del seed
note_type:note   eliminado del seed
processed_at     compatibilidad; raw_capture.status es la fuente de verdad
```

No uses documentos históricos de `docs/research` o `docs/architecture` para
reintroducir esas piezas sin decisión explícita del usuario.

## Convenciones técnicas

- **Bun** como runtime y package manager.
- **TypeScript estricto** y ESM.
- **Biome** para lint/format.
- **SurrealDB** como BBDD multi-modelo: documento + grafo + vector.
- **Python** para el worker (agente Agno del dashboard) y futuros workers que usen MCP.
- **Devcontainer obligatorio** para comandos.

## Devcontainer

Servicios principales:

| Servicio | Rol |
|---|---|
| `app` | entorno de desarrollo Bun/TS |
| `surrealdb` | BBDD principal |
| `surrealdb-init` | one-shot para preparar volumen |
| `huygens-mcp` | MCP server TS en `:3030` |
| `huygens-worker` | agente conversacional del dashboard (Agno + OpenAI, AG-UI en `:7777`); arranca por defecto (`WORKER_ENABLED:-true`). **Excluye `commit_proposal`**: el commit es siempre humano. Ojo: Agno descarta el `instructions` del MCP, así que su doctrina vive en su system-prompt (`agent.py`), no en `instructions` |

Los nombres de contenedor dependen del project name de Docker Compose. En esta
máquina pueden ser `huygens_devcontainer-app-1`; en otros entornos pueden ser
`devcontainer-app-1`. Comprueba con `docker ps` si hace falta.

## Comandos

Dentro del devcontainer:

```bash
bun install
bun lint
bun typecheck

cd apps/mcp
bun run db:apply
bun run db:smoke
bun dev
```

Desde el host, respetando el devcontainer:

```bash
docker exec <container-app> bun lint
docker exec <container-app> bun typecheck
docker exec <container-app> bun --filter '@huygens/mcp' test
```

Variables de entorno:

```bash
SURREAL_URL=ws://surrealdb:8000/rpc
SURREAL_NS=huygens
SURREAL_DB=main
SURREAL_USER=root
SURREAL_PASS=root
```

## Modelo de datos objetivo

Resumen mínimo; detalle en `docs/MODEL.md`.

Nodos:

```text
raw_capture
note
block
```

Tipos objetivo de `note`:

```text
task
project
area
routine
idea
reference
person
objetivo
```

No migres el slug `objetivo` sin una decisión explícita del usuario.

Estados ZTD como field:

```text
CLARIFIED
ACTIVE
WAITING
SOMEDAY
DONE
ARCHIVED
```

Edges objetivo:

```text
derived_from: block -> raw_capture
about:        block -> note
affects:      block -> note
part_of:      note -> note
blocked_by:   note -> note
mentions:     note|block -> note|block
```

## Release pipeline

Conventional commits -> release-please abre/actualiza PR de release. Merge del
PR = tags + GitHub Releases + build de imágenes Docker + publicación del Helm
chart como OCI artifact.

Scopes versionables:

| Scope | Path | Tag |
|---|---|---|
| `mcp` | `apps/mcp` | `mcp-v*` |
| `worker` | `backend/huygens-worker` | `worker-v*` |
| `helm` | `helm/huygens` | `helm-v*` |

Reglas:

- `feat(scope): ...` -> minor
- `fix(scope): ...` -> patch
- `feat(scope)!: ...` o `BREAKING CHANGE:` -> major
- `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `ci:` sin scope
  versionable -> sin bump
