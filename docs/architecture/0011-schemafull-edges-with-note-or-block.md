# ADR-0011: Edges schemafull con `note | block`

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

## Context

Con la topología como primaria (ADR-0008) y notas compuestas de blocks (ADR-0009), la pregunta concreta era: ¿qué edges existen, qué tipos de nodo aceptan en cada punta, y cómo se enforza eso?

SurrealDB ofrece `DEFINE TABLE x TYPE RELATION FROM A TO B SCHEMAFULL`, lo que permite declarar edges tipados con FROM/TO validados por el motor. La granularidad block (ADR-0009) hace que ciertos edges semánticos (mentions, supports, refutes) deban poder conectar **notes o blocks** indistintamente, para soportar Zettel-trails granulares.

Se evaluó si el parser de SurrealQL acepta uniones en FROM/TO (`FROM note | block TO note | block`). Pruebas confirman que sí.

## Decision

Se definen **7 edge tables schemafull**, cada uno con FROM/TO específicos según semántica:

| Edge | FROM | TO | Uso |
|---|---|---|---|
| `part_of` | `note` | `note` | Jerarquía macro (Area→Project→Task) |
| `blocked_by` | `note` | `note \| block` | Lo bloqueado es nota; el bloqueador puede ser detalle |
| `mentions` | `note \| block` | `note \| block` | Referencia narrativa débil |
| `supports` | `note \| block` | `note \| block` | Zettel-trail argumentativo |
| `refutes` | `note \| block` | `note \| block` | Contradicción argumentativa |
| `about` | `note` | `note \| block` | Report cubre elementos citados |
| `authored_by` | `note \| block` | `note` | Atribución a Person (note con type=person) |

Cada edge table tiene además `UNIQUE INDEX (in, out)` para impedir duplicados (ADR-0007).

## Consequences

- **Positivas**:
  - El motor rechaza edges con tipos inválidos antes del disco.
  - Zettel-trails granulares: `block → supports → block` es nativo.
  - `part_of` queda restringido a `note → note` (la jerarquía es de notas, no de bloques) — refleja semántica correcta.
  - Edges con properties tipadas (`since`, `reason` en `blocked_by`) cargan información temporal.
  - UNIQUE previene `RELATE` duplicados al re-ejecutar scripts.
- **Negativas**:
  - Si SurrealDB nunca soportara `FROM A | B`, habría que multiplicar tablas (4× por edge para cubrir combinaciones). Hoy es non-issue.
  - Los edges semánticos no distinguen entre `note→note`, `note→block`, `block→note`, `block→block` con tablas separadas — el motor lo permite, el código aplicación interpreta el contexto.
- **Neutrales**:
  - Añadir un edge nuevo requiere migration explícita (`DEFINE TABLE ...`). Aceptable: cada edge nuevo es decisión de ontología.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Edges sin schema (Cypher/Neo4j style) | Máxima flexibilidad | Sin garantías del motor; tipo de FROM/TO solo en código | Contradice la topología como primaria (ADR-0008) |
| Edges solo `note → note` | Más simple | Pierde Zettel-trails granulares; `blocked_by` no puede apuntar a un detalle | El valor de los blocks (ADR-0009) se diluiría |
| Validación en código aplicación | No depende del parser de uniones | Frágil; cualquier import/script puede crear edges inválidos | El motor debe enforzar la ontología |
| 4 tablas separadas por edge × combinación | Sin depender de uniones | 28 tablas para 7 edges semánticos; verboso | El parser acepta uniones; no merece la pena |

## Related

- ADRs: `ADR-0008` (topología primaria), `ADR-0009` (blocks), `ADR-0007` (UNIQUE en edges + HNSW)
- Research: [docs/research/03-data-model/relations-and-edges.md](../research/03-data-model/relations-and-edges.md)
- Código: `apps/mcp/surreal/schema.surql` (edges `part_of`, `blocked_by`, `mentions`, `supports`, `refutes`, `about`, `authored_by`)

## Notes

`authored_by` cruza tipos semánticamente (`Note → Person`) pero estructuralmente vive entre dos rows del table `note` (Person es una nota con `type = note_type:person`). La distinción es del agente, no del motor. Aceptable: el coste de un table `person` separado superaría el beneficio.
