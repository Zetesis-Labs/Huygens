# Huygens

Memoria estructurada personal para Rubén. Es un MCP server basado en
**SurrealDB** que sirve como capa de memoria para agentes conversacionales
como Claude Code, Codex o Hermes.

## Modelo

El modelo conceptual canónico vive en [`docs/MODEL.md`](./docs/MODEL.md).
La guía operativa para agentes vive en
[`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md).

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
- `proposal`: drafts visibles antes del commit.
- `commit_proposal`: aprobacion del usuario y commit al grafo.

El flujo legacy `raw -> clarify -> notes` fue retirado. No hay
`commit_clarify`, no hay `generate_report` persistente y el seed ya no crea
`note_type:note` ni `note_type:report`.

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
