# Huygens

Monorepo TypeScript con Bun. Contiene un servidor MCP que sirve de memoria estructurada para un agente personal, persistida en **SurrealDB** (grafo + documento + vector search en un mismo motor).

## Modelo

El modelo conceptual canónico vive en [`docs/MODEL.md`](./docs/MODEL.md). En una frase: hablas con un agente, eso queda como `raw_capture`, lo sintetizas en un **informe** (`note(type=report)`), y un worker pequeño aplica lo que dice ese informe al grafo.

## Stack

- **Bun** 1.x — runtime y package manager
- **TypeScript** estricto, ESM
- **SurrealDB** 3.x — BBDD multi-modelo (grafo + documento + vector), schemafull edges, vector index HNSW nativo
- **Driver JS** `surrealdb@2.x` para conectar desde el app
- **MCP** (`@modelcontextprotocol/sdk`) con transporte Streamable HTTP
- **Embeddings**: `BAAI/bge-m3` vía DeepInfra (1024 dims, contexto 8192, multilingüe)
- **Biome** para lint y format

## Estructura

```
.
├── .devcontainer/         # Devcontainer: app (Bun) + surrealdb + surrealdb-init
├── apps/
│   └── mcp/
│       ├── surreal/       # schema.surql + seed.surql
│       ├── scripts/       # apply-schema.ts, smoke.ts
│       └── src/           # entrypoint + cliente SurrealDB + server MCP
├── backend/
│   └── huygens-worker/    # Worker Python (legacy clarify; objetivo: topologizador)
├── docs/
│   ├── MODEL.md           # Modelo canónico
│   └── research/          # Investigación y diseño
├── biome.json
├── tsconfig.base.json
└── package.json           # workspaces: ["apps/*"]
```

## Cómo empezar

Todo se ejecuta **dentro del devcontainer**. Desde Cursor / VS Code:

1. Abrir la carpeta `Huygens/`.
2. _"Reopen in Container"_.
3. Esperar a que se levanten los servicios (`surrealdb-init` chowna el volumen, `surrealdb` arranca, `app` queda listo).

Una vez dentro:

```bash
# Aplicar schema + seed contra SurrealDB
cd apps/mcp && bun run db:apply

# Verificar end-to-end con el smoke test
bun run db:smoke

# Arrancar el MCP en modo watch (puerto 3030)
bun dev

# Lint / typecheck
cd /workspace && bun lint && cd apps/mcp && bun run typecheck
```

El MCP escucha en `http://localhost:3030/mcp`.

## SurrealDB con vector search nativo

El servicio `surrealdb` arranca con backend **RocksDB** persistente y expone:
- Grafo: edges schemafull (`TYPE RELATION FROM X TO Y`), traversals `->edge->target` inline en SurrealQL
- Documento: `SCHEMAFULL` tables con campos tipados y `ASSERT`
- Vector: índice HNSW nativo (`DEFINE INDEX ... HNSW DIMENSION 1024 DIST COSINE`)
- Live queries: subscripciones reactivas vía WebSocket

Conexión desde el app: `ws://surrealdb:8000/rpc` (variables `SURREAL_URL`, `SURREAL_NS`, `SURREAL_DB`, `SURREAL_USER`, `SURREAL_PASS` ya configuradas en `docker-compose.yml`).
