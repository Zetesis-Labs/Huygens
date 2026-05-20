# ADR-0007: HNSW con parámetros explícitos + UNIQUE en edges

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: database

## Context

Dos micro-decisiones del schema en SurrealDB con un mismo origen: la librería experimental **kaig** (https://github.com/surrealdb/kaig) de surrealdb-folk para graph RAG, que cristaliza buenas prácticas no obvias.

**HNSW**: SurrealDB acepta `DEFINE INDEX ... HNSW DIMENSION N DIST COSINE` sin más params y aplica defaults conservadores. Para la búsqueda vectorial sobre `block` (1024 dims, BGE-M3) queríamos mejor recall sin esperar a perfilarlo en producción.

**Edges**: por defecto, un `RELATE A->mentions->B` ejecutado N veces crea N edges distintos. Un agente que llama `tools/mentions.create` dos veces con los mismos extremos no debería ensuciar el grafo con duplicados.

## Decision

**1. Parámetros HNSW explícitos** en el índice vectorial sobre `block.embedding`:

```surql
DEFINE INDEX block_embedding ON block
  FIELDS embedding
  HNSW DIMENSION 1024 DIST COSINE
  TYPE F32 EFC 150 M 12 M0 24;
```

- `EFC 150` (efConstruction): exploración más amplia en build time → mejor calidad del grafo HNSW
- `M 12`: conexiones máx. por nodo en capas superiores — balance memoria/calidad
- `M0 24`: capa base, recomendación clásica `M0 = 2·M`
- `TYPE F32`: precisión completa; `I8` queda como camino futuro de quantization

**2. UNIQUE en `(in, out)` en cada edge table** (los 7: `part_of`, `blocked_by`, `mentions`, `supports`, `refutes`, `about`, `authored_by`):

```surql
DEFINE INDEX mentions_unique ON mentions FIELDS in, out UNIQUE;
```

El segundo `RELATE` con los mismos extremos falla por unicidad. El agente captura y descarta → idempotencia natural sin lógica adicional.

## Consequences

- **Positivas**:
  - Recall razonable desde el día uno, sin calibrar en producción con usuarios
  - Grafo limpio: imposible ensuciarlo con duplicados desde el cliente
  - Idempotencia trivial en tools que crean edges — el "doble click" del agente no rompe nada
- **Negativas**:
  - Build del índice HNSW algo más lento (`EFC` más alto = más trabajo en build time)
  - Si en algún momento queremos *dos* `mentions` entre los mismos extremos con metadatos distintos, el UNIQUE bloquea — habría que modelarlo en el extremo, no en una segunda relación
- **Neutrales**: memoria por nodo algo mayor por `M0=24` (irrelevante a los volúmenes esperados)

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Defaults HNSW de SurrealDB | Cero decisiones | Recall más bajo a coste similar de memoria | Explicitar hoy << re-indexar después |
| `TYPE I8` desde el inicio | Storage 4x menor | Pérdida de precisión sin haber medido si sobra | Premature optimization; F32 hasta que memoria sea cuello |
| Sin UNIQUE en edges, validar en código | Flexibilidad teórica | Frágil; cada caller debe chequear; race conditions | El motor es el único sitio donde la invariante no filtra |
| UNIQUE sólo en edges semánticos | "Quizá `part_of` quiere duplicados" | YAGNI; Area→Project→Task no tiene caso | Consistencia: misma regla en los 7 edges |

## Related

- ADRs: `ADR-0005` (SurrealDB sobre MongoDB), `ADR-0011` (edges schemafull con `note | block`), `ADR-0015` (BGE-M3 produce 1024-dim y motiva esa dimensión específica)
- Research: [docs/research/04-database/surrealdb-innovations.md](../research/04-database/surrealdb-innovations.md), [docs/research/04-database/surrealdb-deep-dive.md](../research/04-database/surrealdb-deep-dive.md)
- Código afectado: `apps/mcp/surreal/schema.surql`

## Notes

Parámetros HNSW revisables sin migración destructiva — `DEFINE INDEX OVERWRITE` reconstruye. Pasar a `I8` en el futuro: re-`DEFINE INDEX OVERWRITE` con `TYPE I8` y medir recall sobre un set de regresión.
