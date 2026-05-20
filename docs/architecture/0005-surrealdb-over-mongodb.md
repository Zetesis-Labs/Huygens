# ADR-0005: SurrealDB sobre MongoDB+Prisma

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: database, stack

## Context

Huygens arrancó con **MongoDB Atlas Local** (que incluye `mongot` para `$vectorSearch`) + **Prisma** como ORM. La hipótesis inicial: dominio documental — notes con embeddings, búsqueda híbrida sobre Mongo.

Durante el diseño del modelo afloró un insight que cambió el planteamiento: **Huygens no es un store de documentos, es una topología**. Las relaciones (`mentions`, `supports`, `refutes`, `blocked_by`, `part_of`, `about`, `authored_by`) son edges tipados de primera clase, no metadatos del documento. Mongo modela edges sólo como arrays de refs sin schema; perdíamos validación en el motor, queries de grafo idiomáticas, y la posibilidad de usar bloques como extremos. Pivote en el commit 1, sin datos productivos que migrar (ver ADR-0008).

## Decision

Usar **SurrealDB v3** como BBDD primaria. Reemplaza por completo a MongoDB + Prisma; este último deja de aparecer en el stack. Driver JS: `surrealdb@^2.0.3` (compatible con el server 3.x).

Consecuencias inmediatas: schema único multi-modelo (graph + document + vector) en `apps/mcp/surreal/schema.surql`, queries en SurrealQL desde tools MCP, sin ORM intermedio.

## Consequences

- **Positivas**:
  - Edges schemafull (`TYPE RELATION FROM X TO Y`) enforced por el motor
  - Vector HNSW nativo en el mismo schema; sin sidecar tipo `mongot`
  - `CHANGEFEED` para time-travel queries, live queries vía WebSocket
  - Multi-deployment: server / embedded / browser-WASM con el mismo motor
- **Negativas**:
  - Madurez menor; ecosistema joven
  - SurrealQL es nicho — LLMs lo conocen menos que SQL/Cypher (mitigado encapsulando en tools MCP)
  - Lock-in: portar a otro motor no es trivial
  - Driver JS en v2.x con cambios entre v1 y v2 al actualizar
- **Neutrales**: cambio de paradigma — RELATE + edges en vez de joins

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| MongoDB + Prisma (inicial) | Familiar, `$vectorSearch` vía `mongot` | Graph débil (refs en arrays), edges no tipados | El dominio es topológico; sostener invariantes en código era frágil |
| Neo4j | Graph DB canónico, Cypher maduro | Pre-IA: vector bolt-on; multi-modelo limitado; AGPL | Vector como ciudadano de segunda |
| FalkorDB | Cypher + Redis, foco GenAI | Sin schemafull edges | El motor no enforza tipos de relación |
| Memgraph | Cypher + in-memory | Enterprise-oriented, licencia pesada | Overkill para single-user en early stage |
| SurrealDB v3 | Multi-modelo nativo (graph+doc+vector), edges schemafull, HNSW integrado | Madurez menor, SurrealQL nicho | ✅ Elegido |

## Related

- ADRs: `ADR-0008` (topología como primaria), `ADR-0011` (edges schemafull con `note | block`), `ADR-0007` (HNSW params), `ADR-0006` (rootless en devcontainer)
- Research: [docs/research/04-database/mongodb-pivot.md](../research/04-database/mongodb-pivot.md), [docs/research/04-database/graph-db-comparison.md](../research/04-database/graph-db-comparison.md), [docs/research/04-database/surrealdb-innovations.md](../research/04-database/surrealdb-innovations.md), [docs/research/04-database/surrealdb-deep-dive.md](../research/04-database/surrealdb-deep-dive.md)
- Código afectado: `apps/mcp/surreal/schema.surql`, `apps/mcp/src/db/`, `.devcontainer/docker-compose.yml`

## Notes

Heurística que quedó del pivote: **si el modelo tiene más relaciones tipadas que campos planos, no es un documental — es un grafo**. Aplicable a futuras decisiones de almacenamiento.
