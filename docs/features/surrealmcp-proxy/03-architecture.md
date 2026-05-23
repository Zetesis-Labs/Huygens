# Arquitectura del proxy SurrealMCP

Este documento describe la arquitectura del proxy SurrealMCP dentro del MCP de
Huygens: qué piezas intervienen, cómo se conectan, qué pasa al arrancar y qué
pasa cuando una `query_*` tool es invocada. La motivación y el contexto previo
viven en `01-context-and-motivation.md`. El plan de implementación detallado
vive en `04-implementation-plan.md`.

## 1. Diagrama de alto nivel

```text
                          ┌────────────────────────────────────────────┐
                          │             huygens-mcp (Bun/TS)           │
                          │                                            │
  Cliente MCP ─[HTTP /mcp]┼──► McpServer                               │
  (Claude Code, etc.)     │       │                                    │
                          │       ├── tools propias (capture,          │
                          │       │   list_inbox, create_proposal,     │
                          │       │   commit_proposal, ...)            │
                          │       │                                    │
                          │       └── [proxy SurrealMCP]                │
                          │              │                             │
                          └──────────────┼─────────────────────────────┘
                                         │
                                  [HTTP /mcp, stateless]
                                         │
                          ┌──────────────▼─────────────────────────────┐
                          │      surrealmcp (contenedor upstream)      │
                          │   tools: select, query, info, ...          │
                          └──────────────┬─────────────────────────────┘
                                         │
                                  [WS /rpc, VIEWER role]
                                         │
                          ┌──────────────▼─────────────────────────────┐
                          │             surrealdb                      │
                          │  ns=huygens, db=main                       │
                          │  user: huygens_reader (VIEWER)             │
                          └────────────────────────────────────────────┘
```

Resumen:

- El cliente sigue hablando sólo con `huygens-mcp`. No conoce ni necesita
  conocer la existencia del upstream.
- `huygens-mcp` registra dos familias de tools en el mismo `tools/list`:
  - Las **curadas** (`capture`, `list_inbox`, `create_proposal`, ...).
  - Las **proxied** (`query_select`, `query_query`, ...) con prefijo `query_`.
- Las proxied delegan en `surrealmcp`, que a su vez golpea SurrealDB con un
  usuario VIEWER y por tanto no puede mutar el grafo aunque la tool técnica
  lo permita.

## 2. Componentes

### 2.1 huygens-mcp

Sin cambios en su rol externo: sigue siendo el único servidor MCP visible para
el cliente, expuesto en `:3030/mcp` con transporte `StreamableHTTP` stateless
(`sessionIdGenerator=undefined`).

Cambios internos:

- `createServer` se mantiene síncrono. Solo añade una llamada a
  `registerSurrealmcpProxy(server)` que lee la caché de tools del singleton.
- `index.ts` lee `process.env.SURREALMCP_URL` y, antes de `httpServer.listen`,
  hace `await initSurrealmcpProxy({ url })` (top-level await, módulo ESM).
- Se añade un módulo nuevo `apps/mcp/src/proxies/surrealmcp.ts` que encapsula
  el cliente MCP upstream singleton, el `init` único y el registro síncrono
  por `McpServer`.

### 2.2 Módulo proxy (`apps/mcp/src/proxies/surrealmcp.ts`)

Único punto de contacto con el upstream. **Singleton a nivel proceso** —
mantiene un `Client` y una caché de tools compartidos por todas las
instancias de `McpServer` que el handler HTTP crea por request.

Responsabilidades:

1. Mantener un `Client` del SDK conectado por `StreamableHTTPClientTransport`,
   compartido a nivel módulo.
2. Hacer `listTools()` contra el upstream **una vez** al arranque del proceso
   y guardar el resultado en una caché de nivel módulo.
3. Exportar `registerSurrealmcpProxy(server)` que, dado un `McpServer`,
   registra desde la caché las tools con prefijo `query_` y un handler que
   delega vía `client.callTool` reutilizando el client singleton.
4. Reintentar conexión en background si el primer intento falla; al
   recuperarse, refresca la caché para que los siguientes `McpServer` la
   vean.
5. Exportar un objeto de estado consultable (`{ connected, lastError, tools }`)
   utilizable por un endpoint de diagnóstico futuro.

El módulo es opcional en el sentido de que el server arranca igual si no se
configura `SURREALMCP_URL` o si la discovery falla.

**Por qué singleton**: el transporte stateless de `huygens-mcp`
(`index.ts:31`) construye un `McpServer` nuevo por cada request HTTP. Sin
estado compartido, cada request pagaría un `connect` + `listTools` upstream
(y en modo degradado, el timeout completo). El singleton paga ese coste una
sola vez por arranque de proceso; el registro por request es lookup en
memoria.

### 2.3 surrealmcp (contenedor backend)

Imagen oficial de SurrealMCP corriendo en un contenedor del compose, expuesto
sólo dentro de `default_network` (no se publican puertos al host). Habla con
SurrealDB por WS usando credenciales fijas de un usuario VIEWER.

Variables esperadas (nombres del upstream `surrealmcp:v0.4.0`, ver
`02-surrealmcp-upstream.md` § Configuración):

```bash
SURREALDB_URL=ws://surrealdb:8000/rpc
SURREALDB_NS=huygens
SURREALDB_DB=main
SURREALDB_USER=huygens_reader
SURREALDB_PASS=<secret>
```

Estos nombres son distintos de los `SURREAL_*` que usan `app` y `huygens-mcp`
en el mismo compose — cada proceso tiene su propio convenio.

### 2.4 surrealdb

Ya existente. Único cambio: añadir un usuario `huygens_reader` con rol
`VIEWER` en `ns=huygens, db=main`. El root user (`root`/`root`) que usa
`huygens-mcp` sigue intacto y es lo que protege la escritura en los flujos
curados.

## 3. Flujo de boot

```text
1. docker-compose up
   ├── surrealdb-init  (chown del volumen)
   ├── surrealdb       (healthy)
   ├── surrealmcp      (depende de surrealdb, healthy)
   └── huygens-mcp     (depende de surrealdb + surrealmcp)

2. huygens-mcp arranca (index.ts):
   - lee SURREALMCP_URL del env
   - llama await initSurrealmcpProxy({ url: SURREALMCP_URL })
       singleton: connect + listTools una sola vez por proceso
   - arranca el httpServer

3. Por cada request HTTP /mcp (createServer):
   - registra tools curadas (síncrono)
   - llama registerSurrealmcpProxy(server)
       lee la caché en memoria (sin tocar el upstream)
       registra `query_*` en el McpServer recién creado

4. initSurrealmcpProxy (una sola vez al boot del proceso):
   a) new Client(...) + new StreamableHTTPClientTransport(URL)
   b) await client.connect(transport)        # timeout ~5s
   c) const { tools } = await client.listTools()
   d) guarda { client, tools } en estado de módulo
   e) lanza task background de health check / reconnect

5. Si (b) o (c) fallan:
   - log warning con causa
   - el estado de módulo queda degraded (sin tools cacheadas)
   - el server arranca igualmente; los siguientes createServer no
     registran `query_*` mientras dure el degraded
   - background retry cada 30s reintenta connect+listTools y refresca
     la caché si lo logra
```

El retraso añadido al boot es como mucho el timeout configurado del primer
`connect` (en el plan de implementación se fija un budget de ~5s).

## 4. Flujo de invocación de una `query_*` tool

```text
Cliente                        huygens-mcp                  surrealmcp        surrealdb
   │                                │                            │                │
   │── tools/call query_select ────►│                            │                │
   │   { from: 'note', limit: 5 }   │                            │                │
   │                                │── client.callTool ────────►│                │
   │                                │   { name: 'select',        │                │
   │                                │     arguments: { ... } }   │                │
   │                                │                            │── SELECT ─────►│
   │                                │                            │◄── rows ───────│
   │                                │◄── tool result ────────────│                │
   │◄── tool result ────────────────│                            │                │
```

Detalles:

1. El cliente invoca `tools/call` con `name = "query_select"` y los argumentos
   del schema descubierto.
2. `huygens-mcp` reconoce la tool porque está registrada localmente: su
   handler es el cierre creado durante `registerSurrealmcpProxy`.
3. El handler hace `client.callTool({ name: 'select', arguments: args })` al
   upstream, eliminando el prefijo `query_`.
4. `surrealmcp` ejecuta la query contra SurrealDB con las credenciales
   `VIEWER` que tiene configuradas. Cualquier intento de mutación falla en la
   capa de roles, no en el proxy.
5. La respuesta del upstream (`CallToolResult`) se devuelve **tal cual** al
   cliente. No se reformatea, no se filtra y no se enriquece.

Ejemplo manual con `curl` (omitiendo headers MCP por brevedad):

```bash
curl -s http://localhost:3030/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "query_select",
      "arguments": { "from": "note", "limit": 3 }
    }
  }'
```

## 5. Naming y namespacing

Las tools proxied se registran con prefijo `query_`:

| Upstream  | Expuesta como    |
|-----------|------------------|
| `select`  | `query_select`   |
| `query`   | `query_query`    |
| `info`    | `query_info`     |
| ...       | `query_*`        |

Razón del prefijo:

- Comunica **intent** al modelo: "esto es una lectura libre del grafo, no una
  acción semántica del dominio".
- Evita colisiones con tools curadas presentes o futuras (p. ej. nunca
  tendremos un `select` curado).
- Permite reconocer en logs y observabilidad qué llamadas son pass-through.

Alternativas descartadas: `surreal_` (filtra implementación), `db_` (genérico,
puede chocar con tools de otros backends), `raw_` (ya se usa para
`raw_capture`).

## 6. Modos degradados

| Situación                             | Comportamiento                                                      |
|---------------------------------------|---------------------------------------------------------------------|
| `SURREALMCP_URL` no definida          | Proxy desactivado. Server arranca normal. Sin warning.              |
| Upstream caído al boot                | `initSurrealmcpProxy` loggea warning, marca state como degraded. Server arranca sin `query_*`. |
| Upstream cae mid-session              | `query_*` calls devuelven tool error con causa. Tools curadas siguen funcionando. |
| Upstream vuelve tras caer             | Background retry (cada 30s) reabre client, refresca lista de tools. |
| Tool nueva publicada en upstream      | Aparece tras el siguiente boot del huygens-mcp.                     |

Sobre `listChanged: false`: el server actual no notifica cambios de
capabilities (es transporte stateless). Una tool añadida en runtime tras un
reconnect **no** aparece retroactivamente a un cliente que ya hizo `tools/list`
en esa sesión. En la práctica, dado que cada request HTTP del transporte
stateless crea un `McpServer` nuevo (ver `index.ts`) y lee la caché singleton
ya refrescada, el siguiente request del cliente sí ve la lista actualizada.
Aceptable.

Errores de pass-through: si `client.callTool` lanza (timeout, transport
cerrado, error 5xx upstream), el handler captura la excepción y devuelve un
`CallToolResult` con `isError: true` y un mensaje legible. **No** se intenta
reconectar dentro de la call: eso es trabajo del retry background.

## 7. Decisiones arquitectónicas

### A1. Implementación custom vs librería externa

Decisión: **custom**, en torno a 100-150 LOC dentro de
`apps/mcp/src/proxies/surrealmcp.ts`.

Razones:

- El SDK oficial ya ofrece `Client`, `StreamableHTTPClientTransport`,
  `listTools` y `callTool`. El pegamento es trivial.
- Evitar una dependencia adicional (`mcp-proxy` comunitario u otras) reduce
  superficie de versiones a mantener.
- Control total sobre logging, naming, error handling y background retry.

### A2. Init del proxy al arranque del proceso + caché singleton

Decisión: **discovery una sola vez al arranque del proceso**, antes de
empezar a aceptar requests HTTP; cliente y catálogo viven a nivel módulo.
`createServer` (que se ejecuta por request) consume la caché sin tocar el
upstream.

El boot del proceso espera a la discovery (con timeout corto) antes de
abrir el puerto. Esto garantiza que el primer `tools/list` que vea el
cliente ya incluya las `query_*` y evita que cada request HTTP pague un
`connect` + `listTools` al upstream.

Coste: +~ <1s al boot del proceso en el camino feliz, +timeout (~5s) en el
camino de fallo. Aceptable. Las requests posteriores son lookup en memoria.

### A3. Filtrar write tools del upstream en el proxy

Decisión: **no filtrar**.

Aunque SurrealMCP exponga tools de escritura, el usuario VIEWER en SurrealDB
las rechazará. Razones para no añadir filtrado en huygens-mcp:

- Menos código y menos mantenimiento.
- Comportamiento transparente: si el upstream cambia su catálogo, el proxy se
  adapta sin parches.
- La fuente de verdad sobre qué tools existen vive en el upstream.
- La seguridad real vive en SurrealDB (roles), no en una allowlist en TS.

### A4. Topología de red

Decisión: SurrealMCP es **interno** al compose, sin puerto publicado.

- `huygens-mcp` → `surrealmcp`: HTTP `http://surrealmcp:8080/mcp`.
- `surrealmcp` → `surrealdb`: WS `ws://surrealdb:8000/rpc`.
- Cliente externo → `huygens-mcp`: HTTP `http://localhost:3030/mcp`.

Todo dentro del network `default_network` existente. No se publica el puerto
de SurrealMCP al host para evitar exponer un canal de lectura directo sin
auditar.

### A5. Prefijo `query_`

Ver sección 5.

## 8. Fuera de scope de esta versión

- **Tools de escritura via proxy**: requeriría un usuario distinto con permisos
  de mutación y un modelo claro de cuándo se permite esa escritura. No se
  aborda hasta que haya una decisión explícita sobre roles.
- **Multi-tenant**: Huygens es single-user; no hay separación de namespaces ni
  routing por usuario.
- **Auth pass-through al upstream**: las credenciales son fijas, configuradas
  por env vars en el contenedor `surrealmcp`. El cliente final no se autentica
  contra SurrealDB.
- **Cache del `tools/list` upstream**: re-discovery en cada boot del
  `huygens-mcp` es suficiente. No se persiste el catálogo entre arranques.
- **Métricas y trazas dedicadas**: por ahora basta con logs estructurados. La
  observabilidad fina se aborda como feature aparte si crece el uso.

## 9. Resumen de cambios en el repo

```text
apps/mcp/src/proxies/surrealmcp.ts   nuevo (~120-180 LOC; singleton + registro)
apps/mcp/src/server.ts               registerSurrealmcpProxy(server) en createServer
apps/mcp/src/index.ts                await initSurrealmcpProxy() antes del listen
.devcontainer/docker-compose.yml     añadir servicio surrealmcp + env en huygens-mcp
docs/features/surrealmcp-proxy/*     este documento + 04-implementation-plan
```

Detalle de implementación (firmas exactas, schema conversion, manejo del
timeout, esquema de tests) en `04-implementation-plan.md`.
