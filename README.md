# Huygens

Monorepo TypeScript con Bun. Contiene un servidor MCP que se conecta a MongoDB (con búsqueda vectorial) a través de Prisma.

## Stack

- **Bun** 1.x — runtime y package manager
- **TypeScript** estricto, ESM
- **MCP** (`@modelcontextprotocol/sdk`) con transporte Streamable HTTP
- **Prisma** con `provider = "mongodb"`
- **MongoDB Atlas Local** (`mongodb/mongodb-atlas-local`) — replica set de un nodo con Atlas Search + Vector Search
- **Biome** para lint y format

## Estructura

```
.
├── .devcontainer/        # Devcontainer: app (Bun) + mongo (Atlas Local)
├── apps/
│   └── mcp/              # Servidor MCP
│       ├── prisma/       # schema.prisma
│       └── src/          # entrypoint + tools (vacío al inicio)
├── biome.json
├── tsconfig.base.json
└── package.json          # workspaces: ["apps/*"]
```

## Cómo empezar

Todo se ejecuta **dentro del devcontainer**. Desde Cursor / VS Code:

1. Abrir la carpeta `Huygens/`.
2. _"Reopen in Container"_.
3. El `postCreateCommand` corre `bun install && bunx prisma generate`.

Una vez dentro:

```bash
# Arrancar el MCP en modo watch
bun dev

# Aplicar el schema de Prisma contra el MongoDB del compose
cd apps/mcp && bunx prisma db push

# Lint / typecheck
bun lint
bun typecheck
```

El MCP escucha en `http://localhost:3030/mcp`.

## MongoDB con vector search

El servicio `mongo` del compose usa `mongodb/mongodb-atlas-local`, que arranca:
- Mongo como replica set `rs0` de un nodo (necesario para transacciones de Prisma)
- `mongot`, el motor de búsqueda de Atlas, expone `$vectorSearch` y `$search`

Los índices vectoriales **no los gestiona Prisma** — se crean con un comando contra `mongot` (ver docs de [Atlas Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/)). En código se invocan vía:

```ts
await prisma.$runCommandRaw({
  aggregate: 'Item',
  pipeline: [{ $vectorSearch: { /* ... */ } }],
  cursor: {}
})
```
