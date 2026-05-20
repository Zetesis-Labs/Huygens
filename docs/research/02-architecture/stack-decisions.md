# Decisiones de stack

> Por qué cada pieza del stack es la que es. Documento de referencia para entender qué se eligió, qué se descartó, y qué se dejó deliberadamente sin hacer.

Huygens es un proyecto pequeño que aspira a ser denso. El stack reflejo esa tensión: minimalismo en superficie, sofisticación en los puntos donde sí importa. Lo que sigue es la racionalización pieza a pieza.

## Layout del repo: monorepo mínimo, escalable

```
Huygens/
├── apps/
│   └── mcp/              ← la única app por ahora
├── docs/research/
├── package.json          ← workspaces: ["apps/*"]
├── tsconfig.base.json
├── biome.json
├── .bun-version
└── .devcontainer/
```

Solo `apps/mcp/` existe. `packages/` no se crea hasta que haga falta — añadir directorios vacíos "por si acaso" introduce ruido y sesga decisiones futuras (un `packages/` vacío invita a partir cosas que no necesitan partirse todavía).

Pese a tener una sola app, `package.json` declara workspaces desde el primer commit:

```json
{
  "workspaces": ["apps/*"]
}
```

La razón es operativa: cuando aparezca el segundo workspace (un `apps/cli`, un `packages/shared-types`, etc.), no quiero reconfigurar nada — solo añadir el directorio. Y entretanto, Bun ya entiende el repo como monorepo, lo que habilita `bun --filter '@huygens/mcp' …` de forma uniforme con cómo se llamará a las cosas en el futuro.

**Patrón**: declarar la forma de crecimiento desde el inicio, sin pre-crear los slots vacíos.

## Bun como runtime y package manager

Bun 1.x, versión pineada en `.bun-version`. Esta decisión va contracorriente del ecosistema del usuario — ZetesisPortal (el proyecto hermano) usa pnpm + Node + Corepack y funciona bien. Huygens prueba Bun deliberadamente.

Razones concretas:

| Aspecto | Bun | pnpm + Node |
|---|---|---|
| Ejecutar `.ts` directamente | Nativo | Necesita `tsx`, `ts-node` o build |
| Watch mode | `bun --watch` integrado | `tsx watch` o nodemon |
| Package manager | Integrado | Separado |
| Corepack / pin de version | `.bun-version` plain | `packageManager` en `package.json` + Corepack |
| Velocidad de `install` en frío | ~2-3× más rápido | Aceptable |
| Madurez del ecosistema | Subiendo | Maduro |

Los puntos relevantes para Huygens son **TS nativo** y **watch mode integrado**. El MCP server hace `bun --watch src/index.ts` y reinicia en cada cambio sin transpilar a `dist/` ni mantener un build paralelo. Para un proyecto en exploración intensa, esa fricción menor compone.

El riesgo (Bun aún tiene esquinas inmaduras — algunos paquetes nativos pueden fallar, semántica de algunos APIs Node difiere) se mitiga por el devcontainer Debian: si algo se rompe, se rompe igual en CI y en el container local, no hay drift host/contenedor.

Imagen base del devcontainer: `oven/bun:1-debian`. Debian, no Alpine: `apt` disponible, glibc completo, sin sorpresas con bindings nativos.

## TypeScript estricto + ESM

`tsconfig.base.json` con:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ESNext",
    "paths": {}
  }
}
```

Notas:

- **`strict: true`** es obvio. `as any` está prohibido (ver `CLAUDE.md`).
- **`noUncheckedIndexedAccess`** convierte `arr[i]` en `T | undefined`. Es ruidoso al principio pero pilla decenas de bugs invisibles. Especialmente útil al trabajar con resultados de queries grafo, donde un edge puede no existir.
- **`noImplicitOverride`** evita los bugs sutiles cuando una clase derivada renombra accidentalmente un método del padre.
- **`isolatedModules: true`** garantiza que cada fichero se puede transpilar en aislamiento (cosa que ya hace Bun por dentro). Disciplina los imports.
- **`paths: {}` vacío** es intencional. ZetesisPortal mantiene este patrón: los workspaces se referencian por nombre de paquete (`@huygens/mcp`), no por aliases TS. Mantiene tooling (Biome, tsc, bun) y editores en la misma página, y evita esa clase de bugs donde "funciona en VS Code pero no en build".
- **ESM only** — `"type": "module"` en todos los `package.json`. Sin CJS interop salvo donde un paquete legacy lo requiera (y ahí, `import x from 'pkg'` + interop default).

## Biome: lint + format unificado

Biome reemplaza ESLint + Prettier. Un solo binario, una sola config, una sola pasada. La configuración es **espejo de ZetesisPortal**:

```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120
  },
  "javascript": {
    "formatter": {
      "semicolons": "asNeeded",
      "quoteStyle": "single",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "rules": {
      "style": {
        "noVar": "error"
      },
      "suspicious": {
        "noDoubleEquals": "error",
        "noExplicitAny": "warn"
      },
      "correctness": {
        "noUnusedImports": "error"
      }
    }
  }
}
```

Características visibles:

- 2 espacios, 120 columnas
- Sin punto y coma (`asNeeded`)
- Comillas simples
- Trailing commas en todo

Las decisiones de estilo no son ideológicas — son las de ZP. Coherencia entre repos del usuario. Cualquier cosa que sea conocida no requiere energía mental. La diferencia visible en el código ya tiene que ganarse el peaje.

Reglas funcionales:

- `noVar` error: solo `let` y `const`
- `noDoubleEquals` error: solo `===` y `!==`
- `noExplicitAny` warn: el _escape hatch_ se permite pero queda señalizado (no se usa con `as any`, que está prohibido por convención)
- `noUnusedImports` error: la importación muerta se elimina automáticamente con `bun lint:fix`

## Devcontainer-first development

Todo el ciclo de desarrollo (install, build, lint, typecheck, dev server) se ejecuta dentro del devcontainer. Nunca en el host.

```bash
docker exec huygens_devcontainer-app-1 bun install
docker exec huygens_devcontainer-app-1 bun --filter '@huygens/mcp' typecheck
docker exec huygens_devcontainer-app-1 bun lint
```

Razones:

1. **Aislamiento de runtime**: la versión de Bun la define el container, no el sistema. Cambiar de host (Mac a Linux) no afecta nada.
2. **Bindings nativos**: paquetes con módulos compilados (RocksDB, sharp, sqlite-vec, etc.) pueden fallar en macOS de formas creativas. Linux dentro del container las hace robustas.
3. **Paridad con CI futura**: cuando llegue GitHub Actions, ejecutará la misma imagen. El "funciona en mi máquina" deja de tener sentido.
4. **Patrón consagrado**: ZetesisPortal trabaja así desde hace meses. Replicarlo en Huygens reduce carga cognitiva.

Detalle desarrollado en [./devcontainer-and-services.md](./devcontainer-and-services.md).

## MCP transport: Streamable HTTP

El MCP server se sirve con el SDK oficial `@modelcontextprotocol/sdk` usando el transport **Streamable HTTP**.

- Endpoint: `POST /mcp` en el puerto `MCP_PORT` (default `3030`)
- **Stateless** por defecto: `sessionIdGenerator: undefined`. Cada request crea un transport efímero y se descarta.

```ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
})
```

¿Por qué no stdio (más común para MCPs locales)?

| Aspecto | Streamable HTTP | stdio |
|---|---|---|
| Detrás de proxies / k8s | Sí | No |
| Debuggeable con `curl` | Sí | No directamente |
| Multi-cliente concurrente | Trivial | Un cliente por proceso |
| Sesiones largas (SSE) | Soportado | Soportado |
| Overhead local | Bajo (loopback) | Mínimo |

Huygens es local hoy, pero potencialmente remoto mañana (acceso desde múltiples agentes, despliegue en homelab/k8s, etc.). HTTP no impone coste relevante en local y deja la puerta abierta. Es lo que usan los MCPs de ZP, así que la familiaridad de operación se aprovecha.

Stateless por defecto: no necesitamos pegar contexto entre llamadas porque el estado vive en SurrealDB. Esto simplifica testing, escalado y observabilidad. Si más adelante hace falta sesión (streaming progresivo de respuestas, paginación, etc.), el SDK permite cambiarlo sin reescribir.

## BBDD: SurrealDB (pivote desde MongoDB)

El stack inicial era Mongo Atlas Local + Prisma. Tras unas semanas se reconoció que el modelo de datos no son documentos con campos de referencia: es **una topología** — grafo dirigido con edges tipados. Forzar esa forma sobre Mongo era posible pero antinatural.

Detalle completo: [../04-database/mongodb-pivot.md](../04-database/mongodb-pivot.md) y [../04-database/surrealdb-deep-dive.md](../04-database/surrealdb-deep-dive.md).

Razón corta:

- **Las relaciones tienen tipo, dirección y a veces metadatos** (`BLOCKED_BY`, `REFERENCES`, `PART_OF`, `DERIVED_FROM`). Modelar esto como arrays de IDs en documentos pierde semántica.
- **Las queries son recorridos** ("dame todo lo que depende de este proyecto, dos saltos"). Esto en Mongo son aggregations anidadas; en una grafo nativa es una sola query.
- **SurrealDB hace schemafull con FROM/TO en edges** — las relaciones autorizadas las enforza el motor de la BBDD, no validación en código. Eso es lo que hizo girar la decisión.

Conceptualmente: la BBDD es la ontología. Detalle teórico en [../06-theory/declarative-db-as-ontology.md](../06-theory/declarative-db-as-ontology.md).

## Embeddings: BGE-M3 vía DeepInfra

- Modelo: `BAAI/bge-m3` (1024 dimensiones, 8192 tokens de contexto, multilingüe)
- Hosting: DeepInfra (HTTP API, pay-per-token)
- API key: `DEEPINFRA_API_KEY` en variables de entorno

Detalle en [../05-embeddings-vector/bge-m3.md](../05-embeddings-vector/bge-m3.md) y [../05-embeddings-vector/deepinfra-integration.md](../05-embeddings-vector/deepinfra-integration.md).

Razones cortas:

- 1024 dims es un sweet spot calidad/tamaño (vs 768 de e5-base, vs 3072 de OpenAI large)
- 8192 ctx permite chunks generosos sin romper conceptos
- Multilingüe importa porque el usuario escribe en español y consume papers en inglés
- DeepInfra evita ejecutar embedding localmente (sin GPU, sin RAM dedicada, sin cold start)

## Lo que NO se ha hecho (deliberadamente)

Lista de ausencias que merecen ser explícitas:

- **No CI/CD**. No hay GitHub Actions. La razón: hasta no tener el pivote a Surreal estabilizado, la CI sería una mezcla de "build con Prisma" y "build sin Prisma" y daría falsos positivos. Llegará cuando el stack esté firme.
- **No Helm chart**. Despliegue local en devcontainer basta. Cuando llegue homelab, se diseñará para eso (probablemente con [helm/zetesis-portal](../../../../ZetesisPortal/helm/) como referencia).
- **No release-please**. Un solo workspace, un solo usuario. No hay aún razones reales para versionar paquetes. Conventional commits sí (disciplina barata, futura inversión).
- **No auth multi-usuario**. Single-tenant por diseño. Huygens es la memoria de Rubén, no un SaaS. Cuando llegue acceso remoto desde móvil, será auth de un solo principal (probablemente API key + mTLS por VPN), no OAuth multi-tenant.
- **No observabilidad formal** (Sentry, OpenTelemetry). Logs estructurados, suficiente. Se añade cuando duela.

El principio: **no añadir antes de necesitar**. Cada pieza nueva del stack es un mantenimiento futuro. La curva de "esto está roto" se evita siendo conservador en la superficie y agresivo en la profundidad.

## Resumen tabular

| Capa | Decisión | Razón principal |
|---|---|---|
| Repo layout | Monorepo declarado, una sola app | Crecimiento sin reorganizar |
| Runtime | Bun 1.x | TS nativo + watch + integración pkg manager |
| Image base | `oven/bun:1-debian` | apt + glibc, sin sorpresas |
| Lenguaje | TS strict + ESM | Disciplina + futuro |
| Lint/format | Biome (mirror ZP) | Coherencia entre repos |
| Devcontainer | Obligatorio | Aislamiento + paridad CI |
| MCP transport | Streamable HTTP stateless | Proxies + curl + multi-cliente |
| BBDD | SurrealDB | Topología, no documentos |
| Embeddings | BGE-M3 @ DeepInfra | Calidad/tamaño + multilingüe + sin infra local |
| CI/CD | No (todavía) | Esperar a estabilización |
| Auth | No | Single-tenant por diseño |

## Para profundizar

- [Topología como modelo primario](../03-data-model/topology-as-primary.md)
- [El pivote Mongo → Surreal](../04-database/mongodb-pivot.md)
- [Arquitectura MCP en tres capas](./mcp-three-layer-architecture.md)
- [Composición MCP y A2A](./mcp-composition-patterns.md)
- [Devcontainer y servicios](./devcontainer-and-services.md)
