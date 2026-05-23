# SurrealMCP Proxy

Estado: propuesto, en implementación. Última revisión: 2026-05-23.

## Resumen

- El MCP de Huygens (`apps/mcp`) monta el SurrealMCP oficial
  (`surrealdb/surrealmcp:v0.4.0`) como contenedor separado dentro del
  devcontainer.
- Al boot, `huygens-mcp` se conecta al SurrealMCP upstream, auto-descubre sus
  tools y las re-registra en el `McpServer` local con prefijo `query_*`.
- Los clientes (Claude Desktop, Hermes, Codex, etc.) ven en una sola lista las
  tools curadas de Huygens (`capture`, `create_proposal`, `commit_proposal`...)
  junto con las de exploración libre del grafo (`query_select`, `query_query`).
- El proxy es **read-only por credenciales**: el contenedor upstream se
  autentica como `huygens_reader` con rol `VIEWER` en SurrealDB. Las write
  tools del upstream existen pero fallan a nivel BBDD.
- Si el upstream no arranca, el MCP de Huygens sigue funcionando en modo
  degradado: solo las tools curadas, sin `query_*`.

## Por qué

El agente Hermes reportó fricción usando el MCP de Huygens para preguntas
exploratorias sobre el grafo: sin una tool de overview, no podía "mirar" libremente
qué hay dentro de SurrealDB. Las tools curadas (`list_inbox`, `list_notes_by_type`,
`vector_search`, `find_related`) cubren los flujos diseñados, pero son insuficientes
cuando el modelo necesita responder algo no previsto.

Decisión del usuario: dejar que el modelo explore en lectura libremente,
delegando la query al SurrealMCP oficial. Las tools curadas siguen siendo el
camino para mutar; la exploración deja de competir contra ellas.

## Restricciones

- **Solo lectura**. El upstream expone también `create`, `update`, `delete`,
  `relate`, etc. Se neutralizan a nivel SurrealDB: `huygens_reader` tiene
  `ROLES VIEWER`. Cualquier intento de mutación falla con permission denied,
  aunque el cliente la invoque.
- **Mutación sigue siendo de Huygens**. Todo cambio al grafo pasa por el flujo
  `create_proposal` → `commit_proposal`. El proxy no es un atajo para saltarse
  la propuesta visible.
- **License BSL 1.1**. SurrealMCP upstream está bajo Business Source License
  1.1. Uso personal single-user de Rubén está dentro de los términos. No
  redistribuible como servicio comercial sin revisar la licencia.
- **Single-user**. No se diseña para multi-tenant ni para exponer el MCP a
  terceros.

## Arquitectura en una imagen

```text
+----------------------+
| Cliente MCP          |
| (Claude / Hermes...) |
+----------+-----------+
           |
           v
+----------------------+       +----------------------+
| huygens-mcp (TS)     |       | surrealmcp (upstream)|
|                      |       |  surrealdb/          |
|  - tools curadas     |       |  surrealmcp:v0.4.0   |
|    capture           |       |                      |
|    list_inbox        |       |  tools:              |
|    create_proposal   |       |    query, select,    |
|    commit_proposal   |       |    (write tools      |
|    ...               |       |     bloqueadas por   |
|                      | --->  |     rol VIEWER)      |
|  - proxy             |       |                      |
|    discover & expose |       +----------+-----------+
|    como query_*      |                  |
+----------+-----------+                  |
           |                              |
           |  WS root                     |  WS huygens_reader (VIEWER)
           v                              v
+--------------------------------------------------+
|                   SurrealDB                      |
|              ns=huygens db=main                  |
+--------------------------------------------------+
```

## Índice de documentos

- [`01-context-and-motivation.md`](./01-context-and-motivation.md) — fricciones
  observadas con Hermes, alternativas descartadas y por qué se elige montar el
  upstream en vez de ampliar tools curadas.
- [`02-surrealmcp-upstream.md`](./02-surrealmcp-upstream.md) — detalles del
  SurrealMCP oficial: imagen, env vars, transport, catálogo de tools y notas de
  licencia.
- [`03-architecture.md`](./03-architecture.md) — diseño del proxy: componentes,
  flujo de boot, naming de tools, manejo de errores y modo degradado.
- [`04-implementation-plan.md`](./04-implementation-plan.md) — pasos concretos:
  schema del usuario `huygens_reader`, cambios en `docker-compose`, código TS
  del cliente MCP→MCP y registro dinámico.

## Próximos pasos

1. Definir y aplicar el `DEFINE USER huygens_reader ... ROLES VIEWER` en el
   schema de SurrealDB.
2. Añadir el servicio `surrealmcp` al `docker-compose` del devcontainer.
3. Implementar el cliente MCP→MCP en `apps/mcp` y el descubrimiento de tools al
   boot.
4. Registrar las tools descubiertas con prefijo `query_*` en el `McpServer`
   local; implementar modo degradado si el upstream no está disponible.
5. Probar desde Claude Desktop y Hermes que las tools `query_*` aparecen junto
   a las curadas y solo permiten lectura.
6. Documentar en `CLAUDE.md` la convención `query_*` para que los agentes la
   usen como camino de exploración.
