# Huygens

Monorepo TypeScript con Bun. Contiene un servidor MCP que sirve de memoria estructurada para un agente personal, persistida en **SurrealDB** (grafo + documento + vector search en un mismo motor).

## Stack

- **Bun** 1.x — runtime y package manager
- **TypeScript** estricto, ESM
- **SurrealDB** 3.x — BBDD multi-modelo (grafo + documento + vector), schemafull edges, vector index HNSW nativo
- **Driver JS** `surrealdb@2.x` para conectar desde el app
- **MCP** (`@modelcontextprotocol/sdk`) con transporte Streamable HTTP
- **Embeddings**: `BAAI/bge-m3` vía DeepInfra (1024 dims, contexto 8192, multilingüe)
- **Biome** para lint y format

## Modelo de datos: Note + Block

Cada `note` es composición ordenada de `block`s (markdown auto-contenido). La topología puede apuntar a notes o a blocks indistintamente — permite Zettelkasten-trails y referencias granulares sin pagar la complejidad de un block model atómico (Notion/Anytype). Detalle en `CLAUDE.md`.

## Estructura

```
.
├── .devcontainer/         # Devcontainer: app (Bun) + surrealdb + surrealdb-init
├── apps/
│   └── mcp/
│       ├── surreal/       # schema.surql + seed.surql
│       ├── scripts/       # apply-schema.ts, smoke.ts
│       └── src/           # entrypoint + cliente SurrealDB + server MCP
├── docs/research/         # Investigación y diseño (40+ docs)
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

## Arquitectura MCP (resumen)

Tres capas, hermanas:

```
Agente (prompt = dominio GTD)
  ├─ surrealmcp oficial  →  CRUD + RELATE genérico
  └─ Huygens MCP (este repo)  →  embed, chunk, vector_search, generate_report
       └─ driver surrealdb JS  →  SurrealDB
```

Detalle: `docs/research/02-architecture/mcp-three-layer-architecture.md`.

## Estado

- Schema base + seed: ✅
- Edges schemafull autorizados: ✅
- Vector index HNSW preparado: ✅
- Tools del MCP (embed, chunk, vector_search, ...): pendientes (v2 del roadmap)

Roadmap detallado en `docs/research/07-roadmap/`.
