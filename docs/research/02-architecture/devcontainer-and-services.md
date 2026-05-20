# Devcontainer y servicios locales

> La infraestructura local: cómo se compone el entorno de desarrollo, qué servicios corren, cómo se ejecuta cada comando. Documento operativo, complementa [stack-decisions.md](./stack-decisions.md).

## Por qué devcontainer obligatorio

Todo en Huygens se ejecuta dentro de un container. Nada en el host. Esta restricción es intencional y se aplica también para comandos triviales como `bun install`.

| Razón | Detalle |
|---|---|
| **Aislamiento de runtime** | Bun 1.x pineado en `.bun-version`. El host puede tener otra versión, o ninguna. El container es la fuente de verdad. |
| **Bindings nativos** | Paquetes con compilación nativa (RocksDB, sharp, bcrypt, ...) pueden fallar en macOS de formas raras. Linux dentro del container las hace robustas. |
| **Paridad con CI futura** | Cuando llegue GitHub Actions, ejecutará la misma imagen Debian. "Funciona en mi máquina" deja de existir. |
| **Patrón consagrado en ZetesisPortal** | ZP lleva meses operando así. Reducir la carga cognitiva del usuario entre proyectos. |
| **Reproducibilidad** | Cualquiera que clone el repo y abra el devcontainer obtiene el mismo entorno. |

Forma operativa: cualquier comando se invoca como

```bash
docker exec huygens_devcontainer-app-1 <comando>
```

Nunca

```bash
bun install   # ❌ ejecutado en host
```

## El compose actual (post-pivote)

El devcontainer compose tiene **dos servicios**:

```
host (mac)
  └─ docker compose (devcontainer)
      ├─ app container (bun, /workspace mounted)
      └─ db container (surrealdb / mongodb)
         data → named volume
```

### Servicio `app`

- **Imagen**: `oven/bun:1-debian`
- **Razón Debian, no Alpine**: `apt` disponible, glibc completo, paquetes nativos felices, mismo entorno que CI futura
- **Command**: `sleep infinity` — el container queda vivo y los comandos se ejecutan vía `docker exec`. No hay un proceso principal "la app" — la app es algo que invoca el desarrollador.
- **Volúmenes**:
  - `/workspace` ← el repo montado desde el host (cambios en código son inmediatos)
  - Volumen nombrado para `node_modules` (evita el conflicto de FS macOS↔Linux para bindings nativos)
  - `/home/bun/.claude` ← volumen nombrado para persistir memoria de Claude Code entre rebuilds
  - `/var/run/docker.sock` ← socket de docker del host (permite que el container hable con docker para sidecars o tooling)
- **Variables de entorno forwardeadas desde el host**:
  - `ANTHROPIC_API_KEY` (ya en place)
  - `DEEPINFRA_API_KEY` (se añadirá cuando se wired embeddings)
  - Cualquier otra `*_API_KEY` relevante para herramientas opcionales

### Servicio `surrealdb` (planeado, sustituye a `mongo`)

- **Imagen**: `surrealdb/surrealdb:latest`
- **Storage**: RocksDB persistente en volumen nombrado
- **Argumentos**: `start --bind 0.0.0.0:8000 --user root --pass root file://data/huygens.db` (en local, las credenciales son irrelevantes — el container no está expuesto fuera de la red docker)
- **DATABASE_URL** apuntará a: `surrealdb://surrealdb:8000/rpc?ns=huygens&db=main`

### Servicio `mongo` (actual, transitorio)

- **Imagen**: `mongodb/mongodb-atlas-local`
- **Storage**: volumen nombrado
- **Estado**: en proceso de ser retirado por el pivote a Surreal (ver [../04-database/mongodb-pivot.md](../04-database/mongodb-pivot.md))

## Lección aprendida: `mongodb-atlas-local` y el replica set

Episodio histórico, no diseño actual. Cuando se complete el pivote a Surreal, el problema desaparece.

`mongodb/mongodb-atlas-local` arranca como **replica set de un solo nodo** (necesario porque Prisma con MongoDB requiere transacciones y las transacciones requieren RS). El RS se auto-nombra con el hostname del container si no se fija. Como el hostname por defecto es aleatorio, `DATABASE_URL=mongodb://mongo:27017/huygens?replicaSet=rs0&directConnection=true` rompía: el RS real no se llamaba `rs0`.

**Solución temporal aplicada**: quitar `replicaSet` y dejar solo `directConnection=true`:

```
DATABASE_URL=mongodb://mongo:27017/huygens?directConnection=true
```

**Solución permanente (no aplicada porque pivotamos)**: fijar `hostname: mongo` en el compose y usar `replicaSet=mongo` en la URL — el RS toma el nombre del hostname, todo encaja.

Se preserva la lección porque el patrón se repite en otros DB containers (Cassandra, Kafka, Elasticsearch): comportamiento dependiente del hostname interno.

## Extensiones del devcontainer (VS Code / Cursor)

Lista en `.devcontainer/devcontainer.json` bajo `customizations.vscode.extensions`:

| Extensión | Razón | Estado |
|---|---|---|
| `biomejs.biome` | Lint/format en vivo | Estable |
| `ms-azuretools.vscode-docker` | Ver containers/volúmenes desde el editor | Estable |
| `Prisma.prisma` | Soporte de `.prisma` con autocomplete | **Residual, se retira tras pivote** |
| `mongodb.mongodb-vscode` | Cliente de Mongo integrado | **Residual, se retira tras pivote** |
| `surrealdb.surrealql` (cuando exista versión madura) | Soporte para SurrealQL | **Se añade tras pivote** |
| Otras (general) | Spell checker, GitLens, etc. | Opcionales |

## `postCreateCommand`

Comando que corre una vez al construir el devcontainer:

**Actual** (pre-pivote):

```bash
bun install && cd apps/mcp && bunx prisma generate
```

**Post-pivote** (sin Prisma):

```bash
bun install
```

El `bunx prisma generate` desaparece — SurrealDB no tiene cliente generado, el driver `surrealdb` es genérico y trabajamos con la BBDD directamente.

## Forwarded ports

Puertos expuestos al host (declarados en `devcontainer.json` y/o `compose`):

| Puerto | Servicio | Estado |
|---|---|---|
| 3030 | MCP server (HTTP) | Estable |
| 27017 | Mongo (actual) | **Transitorio** |
| 8000 | SurrealDB (HTTP RPC) | **Tras pivote** |

`MCP_PORT` se puede overridear vía variable de entorno; default 3030.

## Comandos cotidianos

### Sanity

```bash
# Containers vivos
docker ps | grep huygens

# Bun OK dentro del container
docker exec huygens_devcontainer-app-1 bun --version
```

### Build / install

```bash
docker exec huygens_devcontainer-app-1 bun install
```

### Lint

```bash
docker exec huygens_devcontainer-app-1 bun lint
docker exec huygens_devcontainer-app-1 bun lint:fix
```

### Typecheck

```bash
docker exec huygens_devcontainer-app-1 bun --filter '@huygens/mcp' typecheck
```

### Dev server (MCP)

```bash
docker exec huygens_devcontainer-app-1 bun dev
```

Esto arranca `bun --watch apps/mcp/src/index.ts` con auto-restart en cambios.

### DB (post-pivote)

```bash
docker exec huygens_devcontainer-app-1 bash -c 'surreal sql --endpoint $DATABASE_URL'
```

Esto abre el REPL de SurrealQL contra la instancia que corre en el container `surrealdb`. Útil para inspeccionar el grafo, lanzar queries ad-hoc, debugear schema.

### DB (actual, transitorio — mongo)

```bash
docker exec -it huygens_devcontainer-mongo-1 mongosh huygens
```

Cliente Mongo dentro del container de DB. Para inspección puntual.

### Reset completo

Cuando algo se rompe y vale más volver a empezar:

```bash
# Desde el host
docker compose -f .devcontainer/docker-compose.yml down -v
# Luego "Rebuild Container" en VS Code / Cursor
```

El `-v` borra los volúmenes nombrados (data de la DB se pierde). Aceptable en desarrollo local.

## Variables de entorno

El forwarding del host al container se hace en `devcontainer.json`:

```json
{
  "remoteEnv": {
    "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}",
    "DEEPINFRA_API_KEY": "${localEnv:DEEPINFRA_API_KEY}"
  }
}
```

El host debe tenerlas exportadas (en `~/.zshrc` o `~/.zprofile`). Si no existen en el host, el container las recibe vacías y los comandos que las necesiten fallan con error claro.

Variables que viven solo dentro del container (definidas en compose):

- `DATABASE_URL` — apunta al servicio interno por nombre (`mongo`, luego `surrealdb`)
- `MCP_PORT` — default 3030

Nunca commitear secretos al repo. El `.env` del repo (si existiera) tendría solo placeholders.

## Estructura ASCII del compose

```
host (mac)
  │
  │ docker compose -f .devcontainer/docker-compose.yml
  │
  ├─ red docker interna
  │   ├─ container "huygens_devcontainer-app-1"
  │   │   ├─ image: oven/bun:1-debian, command: sleep infinity
  │   │   ├─ /workspace ← bind mount del repo
  │   │   ├─ /workspace/node_modules, /home/bun/.claude ← volúmenes nombrados
  │   │   ├─ /var/run/docker.sock ← bind mount del socket
  │   │   └─ env: ANTHROPIC_API_KEY, DEEPINFRA_API_KEY, DATABASE_URL
  │   │
  │   └─ container "huygens_devcontainer-<db>-1"
  │       ├─ image: surrealdb/surrealdb:latest (planeado) | mongodb/mongodb-atlas-local (actual)
  │       ├─ /data ← volumen nombrado (persistencia)
  │       └─ hostname: <db>
  │
  ├─ puertos publicados: 3030 (MCP), 8000 surrealdb | 27017 mongo
  └─ volúmenes nombrados: node_modules, claude_memory, db_data
```

## Notas de operación

- **Cambios en `package.json`**: `docker exec … bun install`. Los volúmenes nombrados aceleran instalaciones repetidas.
- **Cambios en `compose.yml` o `devcontainer.json`**: requieren rebuild del container.
- **Cambios en código TS**: hot reload vía `bun --watch`.
- **Reset de datos**: `docker compose down -v` borra volúmenes; sin `-v` los preserva.

## Para profundizar

- [Decisiones de stack](./stack-decisions.md) — el porqué de cada pieza
- [Arquitectura MCP en tres capas](./mcp-three-layer-architecture.md) — qué corre en el servicio `app`
- [El pivote Mongo → Surreal](../04-database/mongodb-pivot.md) — historia completa del cambio de DB
- [SurrealDB deep dive](../04-database/surrealdb-deep-dive.md) — el motor que sustituye a Mongo
