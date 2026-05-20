# ADR-0008: Topología como primaria

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

## Context

Al diseñar la capa de persistencia de Huygens — una memoria GTD + grafo de conocimiento personal — surgió la pregunta de cómo ordenar conceptualmente el modelo. Las opciones clásicas (documental, relacional, ORM-céntrico) tratan los documentos como ciudadanos de primera clase y las relaciones como campos secundarios (foreign keys, refs, arrays de IDs).

Durante una sesión de diseño, Rubén formuló el reframing: _"Esto que tenemos es una topología, claramente, no es simplemente una BBDD. Quizá definir una topología inicial y luego ir definiendo las relaciones que autorizamos hacia los markdowns sea una aproximación con más futuro."_

Este insight detonó el pivote de MongoDB a SurrealDB (ADR-0005). Las relaciones entre notas (`BLOCKED_BY`, `SUPPORTS`, `PART_OF`, ...) no son metadatos; son la sustancia que permite informes narrativos que cruzan pilares, proyectos y temporalidad.

## Decision

El modelo de datos se diseña con la **topología (entidades + edges tipados) como ciudadano de primera clase**. El markdown content vive como payload sobre los nodos. El schema se piensa primero por qué edges están autorizados y entre qué tipos, después por qué properties cuelgan de cada nodo.

Consecuencia técnica inmediata: SurrealDB sustituye a MongoDB (ADR-0005), porque su modelo `TYPE RELATION FROM X TO Y` enforza la topología en el motor — no en código aplicación.

## Consequences

- **Positivas**:
  - La semántica del dominio (qué puede relacionarse con qué) deja de ser comentarios en código y pasa a ser propiedad del motor.
  - Informes narrativos multi-hop son queries declarativas, no código ad-hoc.
  - El schema se documenta a sí mismo: un agente nuevo reconstruye la ontología leyendo los `DEFINE TABLE`.
  - Edges con properties tipadas (`since`, `reason`) cargan información temporal y causal nativa.
- **Negativas**:
  - Curva de aprendizaje de SurrealQL frente a Mongo (ADR-0005).
  - Schema migrations explícitas cuando cambia la ontología (no es "tira un campo nuevo en el JSON").
- **Neutrales**:
  - El schema **es** ontología formal del dominio: lo que autoriza determina qué puede pensarse en el sistema. Esto es deseable pero implica disciplina al ampliar tipos de edge.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Documental (MongoDB), edges como arrays de IDs | Familiar, esquema flexible | Pierde semántica de tipo/dirección/properties de relación; validación en código | El reframing topológico exigía edges reificados |
| Relacional clásico (Postgres), edges como junction tables | Maduro, integridad referencial | Verboso para grafos; sin traversal multi-hop barato; sin properties tipadas en aristas | Demasiada fricción para queries de grafo cotidianas |
| Grafo (Neo4j), edges sin schema rich | Modelo grafo nativo | Edges sin tipado fuerte de FROM/TO en el motor; otro paradigma de query | SurrealDB ofrece edges schemafull + SQL-like + multi-modelo |

## Related

- ADRs: `ADR-0005` (SurrealDB), `ADR-0009` (block-composed notes), `ADR-0011` (edges schemafull)
- Research: [docs/research/03-data-model/topology-as-primary.md](../research/03-data-model/topology-as-primary.md), [docs/research/06-theory/declarative-db-as-ontology.md](../research/06-theory/declarative-db-as-ontology.md)
- Código: `apps/mcp/surreal/schema.surql`

## Notes

El reframing es la decisión más fundamental del modelo de datos: precede y condiciona a todas las demás (notes, blocks, pillars, edges). Las decisiones específicas se desarrollan en ADRs posteriores; este ADR documenta el principio que las gobierna.
