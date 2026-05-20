# CLAUDE.md

## Proyecto

Monorepo TypeScript con **Bun** + **Prisma** + **MongoDB** (Atlas Local con vector search) + **MCP** en `apps/mcp`. Una sola app por ahora, pero la raíz declara workspaces (`apps/*`) para crecer.

## Convenciones

- **ESM only** — `"type": "module"` en todos los `package.json`
- **Biome** para lint/format (no ESLint, no Prettier)
- **Bun** como runtime y package manager (no Node, no pnpm)
- **TypeScript estricto** — `as any` prohibido
- **Conventional commits** en inglés
- **Sin git sin instrucción explícita** — no commits, push, branch, tag a menos que el usuario lo pida

## Devcontainer

Todo se ejecuta dentro del devcontainer (`docker-compose` con servicios `app` + `mongo`).

```bash
# Desde fuera del devcontainer (host):
docker exec huygens_devcontainer-app-1 bun install
docker exec huygens_devcontainer-app-1 bun --filter '@huygens/mcp' typecheck
docker exec huygens_devcontainer-app-1 bun lint

# Conectividad a Mongo desde dentro:
DATABASE_URL=mongodb://mongo:27017/huygens?replicaSet=rs0&directConnection=true
```

## Comandos

```bash
bun install            # raíz: instala todas las workspaces
bun dev                # raíz: arranca todas las apps en modo watch
bun lint               # raíz: biome check .
bun typecheck          # raíz: tsc --noEmit en cada workspace

cd apps/mcp
bun dev                # MCP en :3030
bunx prisma generate   # regenera el cliente
bunx prisma db push    # aplica schema.prisma a MongoDB
```

## MCP

- Transporte: **Streamable HTTP** del SDK oficial (`@modelcontextprotocol/sdk`)
- Endpoint: `POST /mcp` en el puerto `MCP_PORT` (default `3030`)
- Stateless por defecto (`sessionIdGenerator: undefined`) — cada request crea su transport efímero

## Modelo de datos

Una única colección central, `Note`. Cada documento es markdown + clasificación + estado GTD + relaciones + bag tipo-específico (`metadata Json`).

| Modelo | Rol |
|---|---|
| `Note` | Entidad central. `title`, `content` (markdown), `typeId` (opcional), `pillars` (`Pillar[]`), `state` (`NoteState`), `parentNoteId`, `relatedNoteIds[]`, `metadata`, `sourceKind` + `sourceRef`, timestamps. |
| `NoteType` | Árbol editable de tipos (slug único + parentId). Una Note tiene cero o un Type. |
| `NoteChunk` | Chunks de la Note con embedding por chunk. La búsqueda vectorial se hace aquí. |

Enums:
- `Pillar`: `PATHOS_SOMA`, `ETHOS`, `TELOS`, `SOPHIA` — dimensiones ortogonales (una nota puede tocar varios).
- `NoteState`: `INBOX`, `CLARIFIED`, `ACTIVE`, `WAITING`, `SOMEDAY`, `DONE`, `ARCHIVED`.

**Capture = nota sin tipo.** Cuando entra algo al inbox, se crea con `typeId=null` + `state=INBOX`. "Inbox" es un estado del workflow, no un tipo de cosa. El agente clarifica asignando un `typeId` y moviendo el estado a `CLARIFIED`.

Seed inicial (`bun run db:seed` desde `apps/mcp`): 8 NoteType genéricos — `task`, `project`, `area`, `routine`, `note`, `report`, `person`, `reference`. Editables después.

**Embeddings**: DeepInfra hospeda `BAAI/bge-m3` (1024 dims, contexto 8192 tokens, multilingüe). API key via `DEEPINFRA_API_KEY`. El campo `NoteChunk.embeddingModel` guarda `'BAAI/bge-m3'`; `NoteChunk.dimensions` guarda `1024`.

## Búsqueda vectorial

Mongo arranca como `mongodb/mongodb-atlas-local`, así que `$vectorSearch` y `$search` están disponibles. La búsqueda vectorial se hace contra la colección **`NoteChunk`** (no contra `Note`), porque las notas largas se chunkean.

Prisma no expone `$vectorSearch` nativamente — usar:

```ts
await prisma.$runCommandRaw({
  aggregate: 'NoteChunk',
  pipeline: [
    {
      $vectorSearch: {
        index: 'note_chunk_vector',
        path: 'embedding',
        queryVector: /* embedding del query */,
        numCandidates: 100,
        limit: 10
      }
    }
  ],
  cursor: {}
})
```

El índice vectorial se crea una vez con `db.NoteChunk.createSearchIndex({...})` (o vía `$runCommandRaw createSearchIndexes`); **no** lo gestiona Prisma. Las dimensiones del índice deben coincidir con `NoteChunk.dimensions` del modelo de embeddings que se elija.
