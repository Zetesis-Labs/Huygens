# surrealmcp: el MCP server oficial de SurrealDB

> Documento de referencia sobre `surrealmcp` — el servidor MCP oficial del equipo de SurrealDB. Cubre qué expone, cómo se configura, sus trade-offs, y cuándo NO usarlo en favor de un MCP propio. Es una pieza central de la arquitectura de tres capas de Huygens (ver [`../02-architecture/mcp-three-layer-architecture.md`](../02-architecture/mcp-three-layer-architecture.md)).

## Identificación del proyecto

- **Repo**: https://github.com/surrealdb/surrealmcp
- **Status**: **preview** (badge explícito en el README — el equipo no lo declara estable todavía)
- **Stars**: ~94 al momento de evaluación (proyecto joven pero con tracción)
- **Last updated**: actively maintained, commits frecuentes
- **Lenguaje**: Rust (single binary, sin runtime adicional)
- **Licencia**: **BSL 1.1 (Business Source License)** — **no es OSS pura**, hay cláusula sobre uso comercial que conviene leer antes de uso comercial. Para uso personal/research como Huygens, sin issues
- **Imagen Docker oficial**: `surrealdb/surrealmcp:latest`

## Qué expone

Las tools del MCP server son **CRUD genérico sobre el motor SurrealDB**, no operaciones de dominio. El catálogo se agrupa en tres bloques:

### Database Operations

| Tool | Función |
|---|---|
| `query` | Ejecuta SurrealQL crudo con params. La escape hatch para todo lo que las otras tools no cubren |
| `select` | SELECT parametrizado sobre una table con filtros básicos |
| `insert` | INSERT batch |
| `create` | CREATE de un único record |
| `upsert` | UPSERT (create or update) |
| `update` | UPDATE con `SET` o `CONTENT` |
| `delete` | DELETE por filtro |
| `relate` | RELATE para crear edges entre records |

### Connection Management

| Tool | Función |
|---|---|
| `connect_endpoint` | Conectar a un endpoint Surreal (URL) en runtime |
| `disconnect_endpoint` | Cerrar conexión |
| `use_namespace` | Cambiar namespace activo |
| `use_database` | Cambiar database activa |
| `list_namespaces` | Listar namespaces disponibles |
| `list_databases` | Listar databases dentro del namespace activo |

### SurrealDB Cloud (gestión de la versión hosted)

| Tool | Función |
|---|---|
| `list_cloud_organizations` | Listar organizaciones de SurrealDB Cloud |
| `list_cloud_instances` | Listar instancias provisionadas |
| `create_cloud_instance` | Provisionar nueva instancia hosted |
| `pause_cloud_instance` | Pausar (sin destruir) |
| `resume_cloud_instance` | Reanudar |

**Para Huygens estas son irrelevantes** — corremos Surreal local en el devcontainer. Pero las menciono porque están ahí: el MCP también es una **management console** para la nube de Surreal si te suscribes.

## Transport modes

`surrealmcp` soporta los tres transports del protocolo MCP:

- **stdio**: el caso clásico — el cliente lanza el proceso y se comunica vía stdin/stdout. Default para Claude Desktop y Cursor
- **HTTP / Streamable HTTP**: para deployments donde el MCP corre como servicio separado y el agente le pega vía HTTP
- **Unix socket**: para casos donde quieres aislamiento de proceso pero sin red, dentro del mismo host

Para Huygens en devcontainer, el modo natural es **Docker container + stdio** (lanzado por Claude Desktop / Cursor) o **HTTP** dentro del devcontainer si compartimos el container del agente.

## Características operativas

Cosas que `surrealmcp` hace bien que vale la pena saber:

- **Auth**: Bearer token con SurrealDB Cloud. Para local con `--user root --pass root` o variables de entorno
- **Rate limiting**: configurable. Útil cuando el agente entra en bucle y satura
- **Health checks**: endpoint `/health` built-in
- **OpenTelemetry**: emite spans estructurados. Si en futuro Huygens añade observabilidad, hooks decentes
- **Structured logging**: JSON logs por defecto, parsables

Todo esto suena banal pero distingue un MCP "preview con cuidado" de uno "código hobby de fin de semana". El equipo de Surreal claramente ha pensado el deployment.

## Genericidad: feature o bug

Punto clave a entender: **las tools son CRUD genérico, no de dominio**.

Eso significa:

- `create` recibe `table` + `data`, no `create_note` o `create_task`
- `query` recibe SurrealQL crudo y params, no `get_inbox` o `search_active_notes`
- `relate` recibe `from`, `edge`, `to` — pero no sabe qué edges son legales en tu schema (lo sabe el motor, pero el MCP no precondiciona al agente)

El agente que las usa tiene dos modos:

1. **Llamar al CRUD parametrizado** (`create`, `update`, `select`) para operaciones canónicas
2. **Usar `query`** con SurrealQL crudo para todo lo que requiere expresividad real (joins, traversals, vector search, aggregates)

En la práctica, **`query` se acaba usando para casi todo lo interesante** porque el CRUD parametrizado es plano. Esto NO es un problema — es el contrato de diseño. Surreal expone el motor; el agente conoce SurrealQL.

## Implicaciones para la arquitectura de Huygens

Huygens adopta una **arquitectura de tres capas** (ver [`../02-architecture/mcp-three-layer-architecture.md`](../02-architecture/mcp-three-layer-architecture.md)):

```
┌─────────────────────────────────────────────────────────┐
│ Capa 1: Agente (Claude Sonnet 4.7 etc.)                 │
│  - Conoce el schema de Huygens (en prompt)              │
│  - Escribe SurrealQL para queries de dominio            │
└─────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│ Capa 2: surrealmcp   │   │ Capa 3: Huygens MCP custom   │
│  (oficial, CRUD      │   │  (~200 líneas TS,            │
│   genérico)          │   │   sólo infraestructura)      │
│                      │   │                              │
│  - query / create /  │   │  - embed (DeepInfra → BGE-M3)│
│    update / relate   │   │  - chunk (markdown → chunks) │
│  - INFO FOR DB       │   │  - vector_search (compose)   │
│                      │   │  - generate_report           │
└──────────────────────┘   └──────────────────────────────┘
              │                       │
              └───────────┬───────────┘
                          ▼
              ┌──────────────────────┐
              │   SurrealDB engine   │
              └──────────────────────┘
```

### Por qué dos MCPs y no uno solo

- `surrealmcp` es perfecto para **ops cotidianas** que son simplemente "habla con el motor": CREATE de notas, UPDATE de estados, RELATE de aristas, SELECT con filtros, `INFO FOR DB` para introspección. Hacer eso a mano en TS sería reinventar la rueda
- Pero `surrealmcp` **NO es suficiente** para ops que requieren lógica fuera del motor:
  - **Embedding generation**: llamar a DeepInfra/BGE-M3, recibir vector, guardarlo. Requiere HTTP cliente externo
  - **Chunking de markdown**: lógica de parsing + splitting que no pertenece al motor de BBDD
  - **Composición de vector search complejo**: orquestar embed → vector query → re-rank → enrich, varios pasos
  - **Report generation**: prompt al LLM con notas seleccionadas + contexto narrativo. No es query, es composición
- Esas ops viven en el **Huygens MCP custom** (~200 líneas TS), que es estrictamente **infraestructura** — no replica el CRUD de Surreal, lo **complementa**

Esto reparte el trabajo limpio:

- **Schema y CRUD** → motor + surrealmcp (cero código mantenido por nosotros)
- **Operaciones específicas del dominio que requieren lógica fuera del motor** → Huygens MCP (poco código, bien delimitado)
- **Orquestación, narrativa, contexto** → agente (prompt + razonamiento)

## Configuración para Cursor / Claude Desktop

Ejemplo de `mcpServers` config en Claude Desktop:

```json
{
  "mcpServers": {
    "SurrealDB": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--pull", "always",
        "--network", "huygens_default",
        "surrealdb/surrealmcp:latest",
        "start"
      ],
      "env": {
        "SURREALDB_URL": "ws://surrealdb:8000/rpc",
        "SURREALDB_NS": "huygens",
        "SURREALDB_DB": "main",
        "SURREALDB_USER": "root",
        "SURREALDB_PASS": "root"
      }
    }
  }
}
```

Notas:

- `--network huygens_default` para que el container del MCP pueda hablar con el container `surrealdb` por hostname dentro de la red Docker compartida
- `--rm -i` porque cada invocación es efímera (stdio mode)
- `--pull always` opcional pero recomendado en preview: tira la imagen más reciente cada vez
- Las vars `SURREALDB_*` configuran la conexión upstream

Para producción local más estable, alternativa: correr `surrealmcp` como **servicio persistente** dentro del devcontainer y hablarle por HTTP. Trade-off: setup un poco más complejo, pero la imagen Docker no se pulla cada vez.

## Trade-offs honestos

| Pro | Contra |
|---|---|
| **Cero código nuestro** — el equipo de Surreal lo mantiene | **Tokens del agente**: cada llamada incluye schema + query + result. Para queries complejas, mucha verbosidad |
| Mantenido por el equipo upstream | **Preview status** — bugs posibles, breaking changes no descartados |
| Imagen Docker oficial lista para uso | **BSL license** — leer cláusula antes de uso comercial. Para personal/research, sin problema |
| Tres transports (stdio, HTTP, Unix socket) | **Genérico = más prompt necesario** para que el agente acierte la sintaxis |
| Health checks, OTel, logging estructurado | **Sin abstracción de dominio** — el agente tiene que conocer SurrealQL |
| Management de SurrealDB Cloud incluido | Las tools de Cloud son ruido si sólo corres local |

## Cuándo NO usar surrealmcp (y meter las cosas en Huygens MCP)

Tres criterios para "esta operación pertenece al Huygens MCP custom, no a surrealmcp":

### 1. La operación es muy frecuente y compleja

Si el agente la llama 30 veces al día con la misma estructura de SurrealQL elaborado, vale la pena envolverla en una tool propia con nombre de dominio (`get_active_notes_by_pillar` en vez de un `query` con 15 líneas de SurrealQL en el prompt). Menos tokens por llamada, menos margen de error.

### 2. La operación requiere lógica no expresable en SurrealQL

- **HTTP externo**: embedding de DeepInfra, llamadas a APIs externas → necesitan código TS, no SQL
- **Parsing de markdown**: chunking, extracción de frontmatter → librerías de TS
- **Composición multi-paso con lógica condicional**: "embed text, search top-20, re-rank con cross-encoder local, return top-5" → orquestación

### 3. El coste de tokens del round-trip es doloroso

Cuando una operación implica varios round-trips (query → process → query → process → response), agruparla en una sola tool del Huygens MCP reduce el ruido del agente. El agente llama una sola tool; el MCP hace los pasos internamente.

## Cuándo usar surrealmcp directo

Para todo lo demás — y "todo lo demás" cubre un buen porcentaje del trabajo cotidiano:

- CREATE / UPDATE / DELETE de notas, types, pillars
- SELECT con filtros simples
- RELATE entre records
- `INFO FOR DB` para introspección
- `query` con SurrealQL para traversals one-off o exploración

Si un humano (o el agente) puede expresar la operación naturalmente en una sola sentencia SurrealQL, **probablemente no merece tool propia**.

## Estado de madurez al momento de la decisión

Honestidad sobre lo que significa "preview":

- ✅ Funciona para casos canónicos (queries básicas, CRUD, RELATE)
- ✅ Imagen Docker estable, builds reproducibles
- ✅ Documentación decente en el README
- ⚠️ API de las tools puede cambiar entre versiones
- ⚠️ Algunos edge cases (live queries via MCP, p.ej.) todavía maduran
- ⚠️ La forma de pasar params complejos varía y conviene mirar el código fuente si algo se atasca

Para Huygens v1, **el riesgo es aceptable**: el blast radius de un breaking change es "ajustar el config del MCP server", no "reescribir lógica de dominio". Y el upside (cero código mantenido para CRUD) es muy alto.

## Cross-references

- [`mongodb-pivot.md`](./mongodb-pivot.md) — contexto histórico del pivote
- [`graph-db-comparison.md`](./graph-db-comparison.md) — comparativa que llevó a Surreal
- [`surrealdb-deep-dive.md`](./surrealdb-deep-dive.md) — el lenguaje que el MCP expone
- [`surrealdb-innovations.md`](./surrealdb-innovations.md) — innovaciones del motor que el MCP heredará
- [`../02-architecture/mcp-three-layer-architecture.md`](../02-architecture/mcp-three-layer-architecture.md) — **la arquitectura de tres capas** donde surrealmcp ocupa la capa 2
- [`../02-architecture/devcontainer-and-services.md`](../02-architecture/devcontainer-and-services.md) — devcontainer setup
- [`../03-data-model/topology-as-primary.md`](../03-data-model/topology-as-primary.md)
- [`../03-data-model/relations-and-edges.md`](../03-data-model/relations-and-edges.md)
