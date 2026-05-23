# Plan de implementación: SurrealMCP Proxy

## Resumen ejecutivo

- Añadir un usuario `huygens_reader` con `ROLES VIEWER` en SurrealDB (scope `ON DATABASE`) inyectando el password vía env, sin commitear secretos.
- Levantar un nuevo servicio `surrealmcp` (`surrealdb/surrealmcp:v0.4.0`) en `.devcontainer/docker-compose.yml`, en la misma `default_network` que `surrealdb` y `huygens-mcp`, configurado para hablar con SurrealDB usando ese reader.
- Implementar `apps/mcp/src/proxies/surrealmcp.ts` como **singleton a nivel proceso**: un único `Client` y una caché filtrada de tools compartida. `initSurrealmcpProxy()` se llama una sola vez al arranque del proceso (hace `connect` + `listTools` + allowlist read-only) y `registerSurrealmcpProxy(server)` se llama por cada `createServer` (lookup en memoria, sin tocar el upstream).
- Cablear `initSurrealmcpProxy()` en `apps/mcp/src/index.ts` antes de `httpServer.listen` y `registerSurrealmcpProxy(server)` dentro de `createServer` en `apps/mcp/src/server.ts:17`.
- Modo degradado tolerante a fallos: si el upstream no responde al arranque, el MCP propio sigue arrancando con sus tools curadas; un loop de reconexión periódico re-intenta, refresca la caché singleton y los siguientes `createServer` ya ven las `query_*`.

## Pre-requisitos

- Acceso al devcontainer (`huygens_devcontainer-app-1`) y a `docker compose`.
- Verificar que la imagen baja:
  ```bash
  docker pull surrealdb/surrealmcp:v0.4.0
  ```
- Working tree limpio antes de empezar para poder hacer snapshots intermedios con `git stash`/diff (sin commits hasta que el usuario los pida).
- SurrealDB ya corriendo y healthy (`docker compose ps surrealdb`).

## Paso 1 — Crear usuario read-only en SurrealDB

### 1.1 Añadir DEFINE USER al schema

Fichero: `apps/mcp/surreal/schema.surql`.

Añadir al final del fichero (después del bloque de comentario `CHANGEFEED`):

```surql
-- ─────────────────────────────────────────────────────────────────────────
-- USERS: read-only user for the SurrealMCP proxy.
-- Scope ON DATABASE — limited to huygens/main.
-- Password is NOT in this file. It is set via a dedicated script that reads
-- SURREAL_READER_PASS from the environment. See scripts/define-reader.ts.
-- ─────────────────────────────────────────────────────────────────────────
-- DEFINE USER huygens_reader ON DATABASE PASSWORD '<set via scripts/define-reader.ts>' ROLES VIEWER;
```

El `DEFINE USER` real se aplica desde un script separado para mantener el
secreto fuera del fichero versionado.

### 1.2 Crear `apps/mcp/scripts/define-reader.ts`

Estructura mínima (sigue el patrón de `scripts/apply-schema.ts`):

```ts
import { closeDb, getDb } from '../src/surreal'

const password = process.env.SURREAL_READER_PASS
if (!password) {
  console.error('SURREAL_READER_PASS or SURREALDB_PASS is required')
  process.exit(1)
}

function surrealStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

const db = await getDb()
await db.query(
  `DEFINE USER IF NOT EXISTS huygens_reader ON DATABASE
     PASSWORD ${surrealStringLiteral(password)}
     ROLES VIEWER`
)
console.log('[define-reader] huygens_reader ensured (VIEWER on DATABASE)')

await closeDb()
```

Añadir el script a `apps/mcp/package.json` → `scripts`:

```json
"db:define-reader": "bun run scripts/define-reader.ts"
```

### 1.3 Generar password y guardarlo en `.env`

```bash
openssl rand -base64 24
```

Guardar el resultado en `apps/mcp/.env` (ya está referenciado por `env_file`
en `docker-compose.yml:72`). Confirmar que `.env` está en `.gitignore`.

```bash
SURREAL_READER_PASS=<paste-here>
```

### 1.4 Aplicar

Desde el host:

```bash
docker exec huygens_devcontainer-app-1 \
  bash -lc 'cd apps/mcp && SURREAL_READER_PASS=$SURREAL_READER_PASS bun run db:define-reader'
```

O dentro del devcontainer:

```bash
cd apps/mcp && bun run db:define-reader
```

### 1.5 Smoke test del reader

Login y verificar permisos:

```bash
docker exec huygens_devcontainer-surrealdb-1 /surreal sql \
  --endpoint http://localhost:8000 \
  --user huygens_reader --pass "$SURREAL_READER_PASS" \
  --ns huygens --db main \
  --pretty
```

En el REPL:

```surql
SELECT * FROM note LIMIT 1;
-- → debe devolver datos (o array vacío si no hay)
CREATE note CONTENT { title: 'forbidden' };
-- → debe fallar con "Not enough permissions"
```

Si el `CREATE` no falla, el rol está mal asignado: revisar el `DEFINE USER`.

## Paso 2 — Levantar contenedor surrealmcp

### 2.1 Editar `.devcontainer/docker-compose.yml`

Añadir el servicio tras `huygens-mcp` (línea 92), antes de `huygens-worker`:

```yaml
  surrealmcp:
    image: surrealdb/surrealmcp:v0.4.0
    restart: unless-stopped
    command:
      - start
      - --bind-address
      - 0.0.0.0:8080
      - --auth-disabled
    environment:
      SURREALDB_URL: ws://surrealdb:8000
      SURREALDB_NS: huygens
      SURREALDB_DB: main
      SURREALDB_USER: huygens_reader
      SURREAL_MCP_SERVER_URL: http://surrealmcp:8080
      SURREALDB_PASS: ${SURREAL_READER_PASS}
    depends_on:
      surrealdb:
        condition: service_healthy
    networks:
      - default_network
```

Notas:

- No exponer el puerto al host por defecto (solo tráfico intra-red). Si hace
  falta debugging desde el host, mapear temporalmente `"8081:8080"`.
- Confirmar los nombres exactos de las flags y env vars contra `02-surrealmcp-upstream.md` antes de aplicar; si v0.4.0 usa otros nombres (`SURREAL_URL` vs `SURREALDB_URL`), ajustar aquí.

### 2.2 Añadir `SURREALMCP_URL` a `huygens-mcp`

En el bloque `huygens-mcp` (alrededor de `docker-compose.yml:73`), dentro de
`environment`:

```yaml
      SURREALMCP_URL: http://surrealmcp:8080/mcp
```

Añadir también `depends_on` blando para que `surrealmcp` arranque, pero sin
`condition: service_healthy` (queremos que el degraded mode tolere el fallo):

```yaml
    depends_on:
      surrealdb:
        condition: service_healthy
      surrealmcp:
        condition: service_started
```

### 2.3 Verificación manual

```bash
docker compose -f .devcontainer/docker-compose.yml up -d surrealmcp
docker logs huygens_devcontainer-surrealmcp-1 --tail 50
```

Buscar en logs señal de "listening" o equivalente. Probar `tools/list` desde
el `app`:

```bash
docker exec huygens_devcontainer-app-1 \
  curl -sS http://surrealmcp:8080/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Anotar la lista exacta de tools devueltas — se usa como referencia para
documentar el prefijo y para el smoke E2E del paso 4.

## Paso 3 — Implementar el módulo proxy

El módulo debe ser **singleton a nivel proceso**: una única conexión MCP
upstream y una caché de tools compartida. Esto es prerequisito MVP, no una
mejora opcional — sin caché, cada request HTTP pagaría `connect` +
`listTools` al upstream (`index.ts:31` crea `createServer` por request).

### 3.1 Crear `apps/mcp/src/proxies/surrealmcp.ts`

Esqueleto (~150 LOC):

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface SurrealMcpProxyOptions {
  url: string
  prefix?: string
  connectTimeoutMs?: number
  retryIntervalMs?: number
}

interface ProxyState {
  client: Client
  tools: Tool[]
  prefix: string
  degraded: boolean
}

let state: ProxyState | null = null
const READ_ONLY_UPSTREAM_TOOLS = new Set(['query', 'select', 'info'])

export async function initSurrealmcpProxy(
  opts: SurrealMcpProxyOptions
): Promise<{ degraded: boolean; toolsRegistered: number }> {
  const prefix = opts.prefix ?? 'query_'
  const connectTimeoutMs = opts.connectTimeoutMs ?? 5000
  const retryIntervalMs = opts.retryIntervalMs ?? 30_000

  const client = new Client({ name: 'huygens-mcp/surrealmcp-proxy', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(opts.url))

  try {
    await withTimeout(client.connect(transport), connectTimeoutMs)
    const { tools } = await client.listTools()
    const visibleTools = tools.filter(tool => READ_ONLY_UPSTREAM_TOOLS.has(tool.name))
    state = { client, tools: visibleTools, prefix, degraded: false }
    return { degraded: false, toolsRegistered: visibleTools.length }
  } catch (err) {
    console.error('[surrealmcp-proxy] connect failed, entering degraded mode:', err)
    state = { client, tools: [], prefix, degraded: true }
    startReconnectLoop(opts, client, transport, retryIntervalMs)
    return { degraded: true, toolsRegistered: 0 }
  }
}

export function registerSurrealmcpProxy(server: McpServer): void {
  if (!state || state.tools.length === 0) return
  const { client, tools, prefix } = state
  for (const tool of tools) {
    server.registerTool(
      `${prefix}${tool.name}`,
      {
        description: tool.description,
        // Convert upstream JSON Schema properties to a permissive Zod raw shape.
        inputSchema: jsonSchemaToZodRawShape(tool.inputSchema)
      },
      async (args: unknown) => {
        try {
          return (await client.callTool({
            name: tool.name,
            arguments: args as Record<string, unknown>
          })) as never
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return {
            content: [{ type: 'text', text: `upstream error: ${msg}` }],
            isError: true
          }
        }
      }
    )
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    )
  ])
}
```

Detalles a cubrir:

- **JSON Schema upstream**: el SDK server acepta Zod/raw shape en
  `registerTool(name, { inputSchema })`, no JSON Schema completo. Convertir
  `tool.inputSchema.properties` a un raw shape permisivo (`z.unknown()` por
  propiedad, opcional si no está en `required`) y delegar los argumentos al
  upstream.
- **Handler**: nunca lanzar; convertir errores a `{ isError: true,
  content: [{ type: 'text', text: ... }] }`. Esto deja el control de
  reconexión al loop background.
- **No reconectar dentro del handler**: si el upstream cae a mitad de
  sesión, el handler devuelve `isError`; el loop se encarga de re-conectar.
- **Sin estado mutable expuesto**: `registerSurrealmcpProxy` solo lee
  `state` — el refresh de la caché lo hace el reconnect loop.

### 3.2 Background reconnect

Función dentro del mismo fichero. Refresca la caché singleton; **no** toca
ningún `McpServer` directamente. Los `createServer` siguientes verán las
tools nuevas la próxima vez que se invoque `registerSurrealmcpProxy`.

```ts
function startReconnectLoop(
  opts: SurrealMcpProxyOptions,
  client: Client,
  transport: StreamableHTTPClientTransport,
  intervalMs: number
): void {
  const handle = setInterval(async () => {
    try {
      await client.connect(transport)
      const { tools } = await client.listTools()
      const visibleTools = tools.filter(tool => READ_ONLY_UPSTREAM_TOOLS.has(tool.name))
      if (state) {
        state.tools = visibleTools
        state.degraded = false
      }
      console.error(`[surrealmcp-proxy] recovered: ${visibleTools.length} read-only tools available`)
      clearInterval(handle)
    } catch (err) {
      console.error('[surrealmcp-proxy] reconnect attempt failed:', err)
    }
  }, intervalMs)
}
```

Una request en vuelo durante una caída del upstream verá `isError` desde
el handler; la siguiente request HTTP (nuevo `McpServer`) ya leerá la caché
refrescada cuando el loop recupere.

### 3.3 Wire-up en `apps/mcp/src/server.ts`

Cambios sobre `apps/mcp/src/server.ts:17` — `createServer` se mantiene
síncrono (no async):

- Importar `registerSurrealmcpProxy`.
- Tras los `registerXxx` curados y antes de `registerLoreAndPrompts` (o
  justo después), añadir una sola línea:
  ```ts
  registerSurrealmcpProxy(server)
  ```

Sin `await`, sin `opts`. La función es no-op si el singleton aún no se
inicializó o está degraded — esto preserva el orden de boot (el handler HTTP
no necesita esperar al proxy para responder).

### 3.4 Wire-up en `apps/mcp/src/index.ts`

Inicializar el singleton **antes** de `httpServer.listen` para que el primer
request ya encuentre la caché lista.

Cambios sobre `apps/mcp/src/index.ts`:

```ts
import { initSurrealmcpProxy } from './proxies/surrealmcp'

// ... (definición de PORT, readJsonBody, createHttpServer igual)

const surrealmcpUrl = process.env.SURREALMCP_URL
if (surrealmcpUrl) {
  const result = await initSurrealmcpProxy({ url: surrealmcpUrl })
  console.error(
    `[huygens-mcp] surrealmcp proxy: ${
      result.degraded ? 'degraded (will retry)' : `${result.toolsRegistered} tools registered`
    }`
  )
}

httpServer.listen(PORT, () => {
  console.error(`[huygens-mcp] listening on http://0.0.0.0:${PORT}/mcp`)
})
```

El top-level `await` requiere ESM (ya lo es: `"type": "module"` en
`package.json:5`). El handler HTTP no cambia; `createServer()` sigue siendo
síncrono.

## Paso 4 — Verificación end-to-end

### 4.1 Levantar todo

```bash
docker compose -f .devcontainer/docker-compose.yml up -d
docker logs huygens_devcontainer-huygens-mcp-1 --tail 30
```

Buscar la línea `[huygens-mcp] surrealmcp proxy: N tools registered`.

### 4.2 `tools/list` debe incluir `query_*`

```bash
curl -sS http://localhost:3030/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq '.result.tools[].name'
```

Debe listar las curadas (`capture`, `list_inbox`, `create_proposal`, etc.)
y solo las `query_*` allowlisted (p.ej. `query_select`, `query_query`, quizá
`query_info`). No debe listar `query_create`, `query_update`, `query_delete`
ni `query_relate`.

### 4.3 Llamada read-only OK

```bash
curl -sS http://localhost:3030/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"tools/call",
    "params":{"name":"query_select","arguments":{"from":"note","limit":1}}
  }'
```

Resultado esperado: payload con (al menos) una fila o array vacío, sin
`isError`.

### 4.4 Write tool oculta

```bash
curl -sS http://localhost:3030/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{"name":"query_create","arguments":{"table":"note","content":{"title":"x"}}}
  }'
```

Resultado esperado: error de tool desconocida, porque `query_create` no está
registrada en Huygens MCP.

### 4.5 Write vía `query_query` FALLA por roles

```bash
curl -sS http://localhost:3030/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"tools/call",
    "params":{"name":"query_query","arguments":{"query":"CREATE note CONTENT { title: \"x\" }"}}
  }'
```

Resultado esperado: `isError: true` con mensaje `Not enough permissions` (o
equivalente) propagado desde SurrealDB.

### 4.6 Test de degraded mode

Apagar el upstream y reiniciar el MCP:

```bash
docker compose -f .devcontainer/docker-compose.yml stop surrealmcp
docker compose -f .devcontainer/docker-compose.yml restart huygens-mcp
docker logs huygens_devcontainer-huygens-mcp-1 --tail 20
```

Debe aparecer `degraded (will retry)`. `tools/list` sigue funcionando con
las tools propias.

Re-arrancar el upstream y esperar al ciclo de retry:

```bash
docker compose -f .devcontainer/docker-compose.yml start surrealmcp
sleep 35
docker logs huygens_devcontainer-huygens-mcp-1 --tail 20
```

Debe aparecer `recovered: N read-only tools available`.

## Paso 5 — Lint/typecheck

```bash
docker exec huygens_devcontainer-app-1 bun --filter '@huygens/mcp' lint
docker exec huygens_devcontainer-app-1 bun --filter '@huygens/mcp' typecheck
```

Ambos deben pasar sin warnings nuevos. Si el typecheck se queja del cast
`inputSchema as never`, considerar un `Tool` JSON Schema typed import
desde `@modelcontextprotocol/sdk/types.js`.

## Paso 6 — Commit (solo cuando el usuario lo pida)

Mensaje propuesto (Conventional Commits, scope `mcp` → minor bump por
`feat`):

- `feat(mcp): proxy SurrealMCP read-only tools under query_ namespace`

Cuerpo sugerido:

- Cambios en schema (`huygens_reader` user via script).
- Nuevo servicio en docker-compose.
- Nuevo módulo `proxies/surrealmcp.ts` y wire-up.

No ejecutar hasta orden explícita.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Upstream cambia tools entre versiones | Tests/agente roto | Pin `v0.4.0`; smoke `tools/list` al actualizar; documentar surface en `02-surrealmcp-upstream.md`. |
| Password del reader filtrado en logs | Leak credencial | Inyectar vía env, no loguear `args.environment` ni el password; rotar fácil regenerando con `openssl`. |
| Boot order race (`huygens-mcp` antes que `surrealmcp`) | Degraded transitorio | `depends_on: service_started` + reconnect loop cada 30 s. |
| JSON Schema upstream incompatible con `registerTool` | Tools no registrables | Fallback documentado: registrar manualmente vía `server.server.setRequestHandler('tools/list', …)` y `'tools/call'` con merge custom. Mantener prefijo `query_`. |
| Transporte stateless: `tools/list_changed` no se emite | Cliente con cache no ve tools nuevas al recuperar upstream | Aceptable; siguiente sesión las verá. Documentado en `server.ts:43-46`. |
| `huygens_reader` con permisos en exceso por error de rol | Escritura no deseada | Smoke test 1.5 obligatorio antes de exponer el proxy. |

## Open questions

- Confirmar `tools/list` exacto de `surrealmcp:v0.4.0` con el smoke 2.3
  antes de implementar el handler. Documentar la lista en
  `02-surrealmcp-upstream.md`.
- ¿Proxy también de `resources` y `prompts` del upstream, o solo `tools`?
  Esta versión: solo `tools`.
- ¿Existe `/healthz` (u otro endpoint health) en `surrealmcp`? Si sí,
  añadir `healthcheck` al servicio y promover `depends_on` a
  `service_healthy`. Investigar.
- ¿Conviene exponer un endpoint `/mcp/proxy-status` que reporte
  `{ connected, degraded, toolCount, lastError }` para diagnóstico desde
  Hermes u otros clientes? Decisión post-MVP.
