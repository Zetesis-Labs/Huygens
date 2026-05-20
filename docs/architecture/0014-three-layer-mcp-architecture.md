# ADR-0014: Arquitectura MCP de tres capas

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: architecture

## Context

El agente IA necesita operar sobre la BBDD: capturar notas, clasificarlas, relacionarlas con edges, vectorizar, buscar semánticamente, generar reportes. Tres caminos posibles para repartir la lógica:

- **Path A**: solo `surrealmcp` oficial. El agente escribe SurrealQL directo.
- **Path B**: un Huygens MCP custom completo que envuelve todo.
- **Path C**: híbrido — dominio en el prompt, `surrealmcp` para CRUD/RELATE, Huygens MCP **pequeño** solo para lo que requiere código.

El proyecto está en fase exploratoria: el modelo evoluciona y el coste de mantener un MCP grande antes de validar es alto.

## Decision

**Path C — tres capas hermanas**:

- **Agente**: carga la semántica del dominio en su prompt (Pilares, NoteTypes, edges autorizados, ciclo GTD). Razona, decide pilares, escribe SurrealQL para CRUD/RELATE cotidiano.
- **`surrealmcp` (oficial)**: expone operaciones genéricas (`query`, `select`, `create`, `relate`).
- **Huygens MCP (custom, ~200 líneas TS planeadas)**: solo lo que **requiere código** — `embed_text` (HTTP a DeepInfra), `chunk_markdown` (algoritmo), `index_block` (embed + persist), `vector_search` (HNSW estructurada), `generate_report` (composición).

Los dos MCPs son **hermanos**. Huygens MCP **no** llama a `surrealmcp` por dentro — habla directo al driver `surrealdb` JS. Una capa intermedia añadiría latencia y fragilidad sin valor.

Con la introducción del worker autónomo (ADR-0018), el sistema pasa a tener **cuatro componentes** principales: agent + los dos MCPs + el worker. El worker es un proceso Python independiente que reacciona a inserciones en `raw_capture` vía LIVE query y commitea de vuelta a SurrealDB sin pasar por ningún MCP. Es hermano de los MCPs, no hijo: comparte solo la BBDD.

```
                ┌──────────────────────────────┐
                │           Agent              │
                │  (prompt = dominio GTD,      │
                │   pilares, edges, etc.)      │
                └───┬──────────────────────┬───┘
                    │ CRUD/grafo           │ infraestructura
                    ▼                      ▼
            ┌───────────────┐       ┌──────────────────┐
            │  surrealmcp   │       │   Huygens MCP    │
            │  (oficial)    │       │   (TS, pequeño)  │
            └───────┬───────┘       └────────┬─────────┘
                    │                        │
                    └────────┬───────────────┘
                             │
                             ▼
                      ┌──────────────┐  ←── LIVE query   ┌─────────────────────┐
                      │  SurrealDB   │ ────────────────→ │ huygens-worker      │
                      │              │                   │ (Python + Agno)     │
                      │              │ ←─── commit ──────│ procesa raws        │
                      └──────────────┘                   └─────────────────────┘
```

## Consequences

- **Positivas**:
  - Mínimo código antes de validar: el dominio vive en prompt
  - Cada capa optimiza por algo distinto — tokens, latencia, determinismo
  - `enforcement` último en SurrealDB (edges schemafull) protege errores del prompt
- **Negativas**:
  - El cliente (Claude Code / Cursor) debe configurarse para **dos** MCPs
  - Coste de tokens: el schema de dominio viaja en el prompt cada sesión
  - Decidir tool-vs-prompt requiere criterio (regla: tool solo si esconde >1 hop o lógica TS no trivial)
- **Neutrales**:
  - Huygens MCP queda pequeño por diseño — la tentación de tools "convenience" se resiste
  - El sistema termina con **cuatro componentes** principales (agent + `surrealmcp` + Huygens MCP + worker autónomo, ver ADR-0018). Los cuatro son hermanos compartiendo SurrealDB como única dependencia común — no hay jerarquía operativa entre ellos

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Path A — solo `surrealmcp` | Cero código en Huygens | Ops de infraestructura imposibles sin código; tokens altos por operación | Embed/chunk/vector_search no caben en SurrealQL |
| Path B — Huygens MCP completo | Ergonomía máxima; tokens mínimos | Semanas de código antes de validar; cada cambio del modelo cambia el MCP | Sobreingeniería prematura |
| Path C — híbrido (elegido) | Dominio barato en prompt + código solo donde aporta | Configurar dos MCPs; criterio tool-vs-prompt | Balance correcto para fase actual |
| Huygens MCP envuelve `surrealmcp` | Composición elegante en papel | Hop extra innecesario, dependencia frágil | Son hermanos, no padre-hijo |

## Related

- ADRs: `ADR-0004` (Streamable HTTP), `ADR-0015` (BGE-M3 vía DeepInfra), `ADR-0016` (conocimiento del agente en `docs/agents/`), `ADR-0018` (worker autónomo — el cuarto componente)
- Research: [docs/research/02-architecture/mcp-three-layer-architecture.md](../research/02-architecture/mcp-three-layer-architecture.md)
- Código afectado: `apps/mcp/src/server.ts`, configuración del cliente para registrar ambos MCPs

## Notes

Heurística para mover una operación a tool: **si se repite muchas veces con la misma secuencia y esconde >1 round-trip a DeepInfra o SurrealDB, candidata**. Si es un `CREATE`/`RELATE`/`UPDATE` que el agente puede escribir, queda en prompt + `surrealmcp`.

El worker autónomo (ADR-0018) **no va por ningún MCP**. Habla directo a SurrealDB con el driver Python (`surrealdb-py`) y reacciona a inserciones en `raw_capture` vía LIVE query. Los MCPs sirven al agente interactivo (que vive en Claude Code / Cursor); el worker es un proceso autónomo separado. Son tres canales hermanos hacia la misma BBDD — no se llaman entre ellos, y el contrato compartido es el schema de SurrealDB.
