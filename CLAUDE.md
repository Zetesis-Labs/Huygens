# CLAUDE.md

## Proyecto

Monorepo TypeScript con **Bun** + **SurrealDB** + **MCP** en `apps/mcp`. Una sola app por ahora, pero la raíz declara workspaces (`apps/*`) para crecer.

## Convenciones

- **ESM only** — `"type": "module"` en todos los `package.json`
- **Biome** para lint/format (no ESLint, no Prettier)
- **Bun** como runtime y package manager (no Node, no pnpm)
- **TypeScript estricto** — `as any` prohibido
- **Conventional commits** en inglés
- **Sin git sin instrucción explícita** — no commits, push, branch, tag a menos que el usuario lo pida

## Devcontainer

Tres servicios: `app` (Bun), `surrealdb` (BBDD principal), `surrealdb-init` (one-shot, chown del volumen para que SurrealDB corra rootless como uid 65532).

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

## Modelo de datos (SurrealDB)

Cada `note` es composición ordenada de `block`s (markdown auto-contenido). La topología (edges) puede apuntar a notes **o** blocks indistintamente — permite Zettelkasten-trails y referencias granulares sin pagar el coste de un block model atómico tipo Notion.

Tablas (`apps/mcp/surreal/schema.surql`):

| Tabla | Rol |
|---|---|
| `note` | Contenedor. `title`, `type` (opcional), `pillars`, `state`, `block_order` (array ordenado de records), `metadata`, `source_kind`+`source_ref`, timestamps |
| `block` | Unidad direccionable + vectorizable. `note` (ref), `content` (markdown), `pillars` propios, `embedding` (1024 dims), timestamps. Vector HNSW index aquí |
| `note_type` | Árbol editable de tipos. Slug único, `parent` opcional, `featured_fields` (UX hint). Una Note tiene cero o un Type |

Edges schemafull (`TYPE RELATION FROM X TO Y`). Los semánticos admiten `note | block` en ambas puntas:

- `part_of` — jerarquía macro (Area→Project→Task). Solo `note → note`
- `blocked_by` — `note → note | block` (con `since`, `reason`)
- `mentions` — `note | block → note | block`
- `supports` — `note | block → note | block` (Zettel-trail clásico)
- `refutes` — `note | block → note | block`
- `about` — `note → note | block` (Report cubre estos elementos)
- `authored_by` — `note | block → note` (Persons son notes con type=person)

Validaciones del motor:
- `pillars: array<string>` con `ASSERT $value ALLINSIDE ['PATHOS_SOMA','ETHOS','TELOS','SOPHIA']`
- `state: string` con `ASSERT $value INSIDE ['INBOX','CLARIFIED','ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED']`
- Todos los edges con `FROM/TO` enforced por SurrealDB

**Capture = nota sin tipo.** Una nota recién capturada se crea con `type = NONE` + `state = 'INBOX'`. El agente clarifica asignando un type y moviendo el estado a `CLARIFIED`.

Seed inicial (`bun run db:apply` desde `apps/mcp`): 8 NoteType genéricos con IDs legibles (`note_type:task`, `note_type:project`, ...). Editables después.

**Embeddings**: DeepInfra hospeda `BAAI/bge-m3` (1024 dims, contexto 8192 tokens, multilingüe). API key via `DEEPINFRA_API_KEY`. El campo `note_chunk.embedding_model` guarda `'BAAI/bge-m3'`; `note_chunk.dimensions` guarda `1024`.

## Búsqueda vectorial

Índice HNSW nativo directamente sobre `block` (1024 dims, BGE-M3, cosine). Sin tabla `note_chunk` separada — el block ES el chunk.

```surql
DEFINE INDEX block_embedding ON block
  FIELDS embedding HNSW DIMENSION 1024 DIST COSINE;
```

Query K-NN:

```surql
SELECT id, content, note,
       vector::distance::cosine(embedding, $query) AS score
FROM block
WHERE embedding <|10|> $query
ORDER BY score ASC;
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

`note` ya no tiene `content`. Para reconstruir el markdown completo de una nota:

```ts
const [rerread] = await db.query<[Note[]]>('SELECT * FROM note WHERE id = $id', { id })
const note = rerread[0]
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

## Arquitectura MCP (tres capas)

```
Agente (prompt = dominio GTD)
  │
  ├─ surrealmcp oficial  →  CRUD + RELATE + queries genéricas
  └─ Huygens MCP (pequeño, este repo)  →  embed, chunk, vector_search, generate_report
       │
       └─ driver surrealdb JS  →  SurrealDB
```

surrealmcp y Huygens MCP son **hermanos**, no padre-hijo. Detalle en `docs/research/02-architecture/mcp-three-layer-architecture.md`.
