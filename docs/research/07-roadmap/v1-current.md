# v1 — estado actual y cierre

> Lo que tenemos AHORA (commit `707fadb`) y lo que falta para considerar v1 cerrado.

## Estado actual del repo

Al momento de escribir esto, el repo está en su commit inicial:

- **Commit**: `707fadb` (20 ficheros)
- **Runtime**: Bun 1.x + TypeScript estricto + ESM
- **Lint/format**: Biome (config mirroring ZetesisPortal)
- **Devcontainer**: docker-compose (app + DB)
- **BBDD**: ~~MongoDB Atlas Local~~ → **SurrealDB** (pivote en curso, ver justificación en [../04-database/surrealdb-deep-dive.md](../04-database/surrealdb-deep-dive.md))
- **ORM**: ~~Prisma~~ (se elimina con el pivote)
- **MCP**: scaffold del transporte Streamable HTTP en `:3030`, sin tools registradas aún
- **Schema de datos**: definido en `prisma/schema.prisma` (a portar a SurrealQL):
  - `Note` (entidad central)
  - `NoteType` (árbol de tipos, 8 seeds)
  - `NoteChunk` (chunks con embedding)
  - Enum `Pillar` (4 valores)
  - Enum `NoteState` (7 valores)
- **Seed**: 8 `NoteType` iniciales — `task`, `project`, `area`, `routine`, `note`, `report`, `person`, `reference`
- **Smoke test**: pasa. `bun dev` levanta el server, `/health` responde

## Lo que queda para cerrar v1

Lista priorizada y accionable. Cada bloque es un PR o conjunto de PRs.

### 1. Pivote Mongo → SurrealDB

El pivote es el tope de la pila. Sin esto nada más avanza.

**Tareas**:

- [ ] Sustituir `mongodb/mongodb-atlas-local` por contenedor `surrealdb/surrealdb:latest` en `docker-compose.yml` del devcontainer
- [ ] Definir schema en SurrealQL bajo `apps/mcp/db/schema.surql`:
  - `DEFINE TABLE note SCHEMAFULL` con todos los campos
  - `DEFINE TABLE note_type SCHEMAFULL` con `slug UNIQUE`
  - `DEFINE TABLE note_chunk SCHEMAFULL` con `embedding ARRAY<FLOAT>`
  - `DEFINE TABLE related_to TYPE RELATION FROM note TO note` (edge schemafull)
  - `DEFINE TABLE parent_of TYPE RELATION FROM note TO note`
  - `DEFINE TABLE has_chunk TYPE RELATION FROM note TO note_chunk`
  - `DEFINE INDEX note_chunk_embedding ON note_chunk FIELDS embedding HNSW DIMENSION 1024 DIST COSINE`
- [ ] Eliminar `prisma/` completo del repo
- [ ] Eliminar la dependencia `@prisma/client` y `prisma` del `package.json`
- [ ] Añadir driver `surrealdb` (JS) a `apps/mcp`
- [ ] Re-seed los 8 `NoteType` vía script `apps/mcp/scripts/seed.ts` en SurrealQL
- [ ] Actualizar `DATABASE_URL` a formato Surreal: `ws://surreal:8000/rpc` + namespace + database
- [ ] Conectividad desde el devcontainer comprobada con un `SELECT * FROM note_type` que devuelva las 8 filas

**Criterio de hecho**: `bun dev` arranca, conecta a SurrealDB, y un test de smoke crea/lee una Note.

### 2. Configurar surrealmcp

`surrealmcp` es el MCP oficial de SurrealDB que da CRUD genérico. Lo usamos como capa intermedia para que el agente no escriba SurrealQL directamente todo el tiempo.

**Tareas**:

- [ ] Decidir si `surrealmcp` corre como contenedor extra en `docker-compose` o se configura como MCP cliente directo de Cursor/Claude
- [ ] Si contenedor: añadir `surrealdb/surrealmcp:latest` al compose, exponer puerto, apuntarlo a la instancia SurrealDB del compose
- [ ] Si cliente directo: configurar `.mcp.json` o equivalente en el host del usuario
- [ ] Configurar auth (root user / namespace user) según el modelo de aislamiento que se elija (probablemente un user por namespace en v1, simple)
- [ ] Validar con una llamada `mcp__surreal__query "SELECT * FROM note_type"` que devuelve las 8 filas

**Criterio de hecho**: el agente puede ejecutar `SELECT`/`CREATE`/`UPDATE`/`DELETE`/`RELATE` vía surrealmcp sin tocar código del MCP propio.

### 3. Huygens MCP — primeras tools

El MCP propio es **pequeño**. Solo lo que `surrealmcp` no puede hacer: embeddings, chunking, búsqueda vectorial específica, y eventualmente generación de reports.

**Tools mínimas para cerrar v1**:

- [ ] `embed_text(text: string) → vector[1024]`
  - Llama a DeepInfra `BAAI/bge-m3`
  - Devuelve el vector
  - Maneja rate limits y errores con reintento exponencial
- [ ] `chunk_markdown(text: string) → string[]`
  - Algoritmo simple: split por headers de markdown + split por párrafos si un chunk excede ~2000 chars
  - Mantiene contexto de header en cada chunk
  - Output: lista de strings listos para embedding
- [ ] `index_note(noteId: string) → { chunksCreated: number }`
  - Lee la Note de SurrealDB
  - Chunkea su `content` (markdown)
  - Embebe cada chunk
  - Escribe `note_chunk` records vía `RELATE note:X has_chunk note_chunk:Y`
  - Devuelve el número de chunks creados
- [ ] `vector_search(query: string, limit?: number) → { noteId, score, chunkText }[]`
  - Embebe el `query`
  - Ejecuta HNSW query contra `note_chunk`:
    ```surql
    SELECT note_id, vector::distance::cosine(embedding, $query_embedding) AS score
    FROM note_chunk
    ORDER BY score ASC
    LIMIT $limit
    ```
  - Devuelve top-k con `noteId`, `score`, y un snippet del chunk

**Criterio de hecho**: el flujo end-to-end `capturar nota → index_note → vector_search` funciona y devuelve la nota original cuando se busca por algo similar.

### 4. Wiring

Conectividad y secretos.

**Tareas**:

- [ ] `DEEPINFRA_API_KEY` declarado en `devcontainer.json` como `remoteEnv` forwarded desde el host
- [ ] Driver `surrealdb` JS instalado en `apps/mcp`
- [ ] Tests E2E del flujo completo en `apps/mcp/tests/e2e/` usando Bun test:
  - Test 1: captura una Note vía MCP tool
  - Test 2: persiste en SurrealDB
  - Test 3: `index_note` la chunkea y embebe
  - Test 4: `vector_search` la encuentra por similitud
- [ ] Variables de entorno documentadas en `apps/mcp/.env.example`

**Criterio de hecho**: `bun test` corre los E2E en CI local del devcontainer y pasa todo.

### 5. Documentación

Actualizar todo lo que asume Mongo/Prisma.

**Tareas**:

- [ ] Actualizar `CLAUDE.md` (raíz del repo) con la nueva BBDD y comandos
- [ ] Eliminar referencias a Prisma del README
- [ ] Documentar el flujo de devcontainer + SurrealDB + surrealmcp + Huygens MCP
- [ ] Diagrama mínimo de las tres capas (agente / surrealmcp / huygens-mcp) en `docs/architecture.md`

## Lo que NO se hace en v1

Decisiones deliberadas de no-scope para evitar feature creep. Cada uno tiene su sitio en v2 o v3, ver siguientes documentos:

- **CI/CD**: ni GitHub Actions, ni workflows automáticos. Tests corren local manualmente
- **Helm chart / despliegue**: nada de producción. v1 corre local en devcontainer
- **Release-please**: nada de releases automáticas. Cuando llegue, llegará
- **Suggestion-mode schema evolution**: el "living topology" es v2/v3. v1 tiene schema fijo declarado en SurrealQL
- **Generación automática de informes**: la tool `generate_report` queda fuera de v1. Los informes los pide el usuario al agente con prompt + búsqueda vectorial
- **Rutinas con recurrence**: el `NoteType.routine` existe como tipo seed, pero no hay lógica de recurrencia ni generación automática de instancias
- **Multi-usuario / auth**: single-user (Rubén) sin login. La auth es la del MCP transport, no del dominio
- **Web UI**: no hay interfaz visual. Todo es vía agente

## Cómo verificar que v1 está cerrado

Checklist final, ejecutable:

1. `docker compose up` en el devcontainer arranca `app` + `surreal`
2. `bun dev` en `apps/mcp` arranca el MCP server en `:3030`
3. `curl localhost:3030/health` responde `200 OK`
4. Desde un cliente MCP (Cursor/Claude), llamar a `mcp__surreal__create note { title, content, ... }` crea la nota
5. La nota se persiste en SurrealDB — verificable con `SELECT * FROM note`
6. `mcp__huygens__index_note { noteId: "note:abc" }` la chunkea y embebe
7. `mcp__huygens__vector_search { query: "algo semánticamente parecido" }` la encuentra
8. `bun test` pasa todos los E2E del flujo

Si los 8 puntos pasan, v1 está cerrado. Pasa a [v2-near-term.md](./v2-near-term.md).

## Estimación temporal

Sin compromiso, en horas de Rubén concentradas:

| Bloque | Horas estimadas |
|---|---|
| Pivote Mongo → Surreal | 4-6h |
| Configurar surrealmcp | 1-2h |
| Tools del Huygens MCP | 4-6h |
| Wiring + tests E2E | 2-3h |
| Documentación | 1-2h |
| **Total** | **12-19h** |

Realista: 2-3 weekends concentrados, o 2-3 semanas de tarde en tarde.
