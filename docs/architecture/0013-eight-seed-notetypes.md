# ADR-0013: 8 NoteType genéricos como seed inicial

**Status**: Superseded by ADR-0022 (now 10 seed types, adds objetivo + idea)
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

> **Update 2026-05-20**: este ADR está **superseded by ADR-0022**. El seed inicial pasó de 8 a 10 NoteTypes con la adición de `objetivo` e `idea` como parte del pivote a ZTD (ADR-0021).

## Context

Con `note_type` modelado como tabla editable (no enum), había que decidir qué tipos vienen en la primera instalación. El trade-off:

- **Seed demasiado amplio**: cargar el modelo con clasificaciones premature antes de saber qué tipos emergen del uso real (sesgo Notion-style con docenas de templates).
- **Seed demasiado escaso**: el agente no tiene catálogo mínimo para clasificar al empezar.

Adicionalmente, había que decidir la convención de IDs (hashes vs. slugs legibles) — afecta a cómo el agente referencia tipos en prompts y configuración.

## Decision

El seed inicial contiene **8 NoteType genéricos** con IDs legibles (`note_type:<slug>`):

| Slug | Rol |
|---|---|
| `task` | Acción concreta ejecutable |
| `project` | Outcome multi-paso que contiene tasks |
| `area` | Área de responsabilidad continua (no se termina) |
| `routine` | Algo recurrente (mecánica de recurrencia es futura; el tipo existe ya) |
| `note` | Nota libre, pensamiento u observación |
| `report` | Narrativa que alinea pilares con táctico/operativo |
| `person` | Una persona |
| `reference` | Material de consulta sin acción asociada (URL, libro, paper) |

El árbol `note_type` es **editable**: usuario o agente pueden crear tipos nuevos cuando surja necesidad (heurística: ≥3 notas que lo requieran y los existentes no encajan).

## Consequences

- **Positivas**:
  - Cobertura mínima para GTD (`task`, `project`, `area`) + Zettelkasten (`note`, `reference`) + narrativa (`report`) + relaciones sociales (`person`).
  - IDs legibles: el agente referencia `note_type:task` en prompts y queries sin lookups.
  - Editabilidad: el catálogo crece orgánicamente con el uso.
  - `routine` reservado: la mecánica de recurrencia es futura, pero el tipo no obliga a migrar.
- **Negativas**:
  - 8 tipos puede sentirse escaso al principio; aceptable mientras emerge el catálogo real.
  - Tipos custom requieren consistencia: si el agente crea `note_type:idea` y luego `note_type:thought`, fragmenta el catálogo. Mitigación: la heurística "≥3 notas" en convenciones.
- **Neutrales**:
  - Lo que NO está en el seed (y por qué):
    - `inbox`: es estado, no tipo (ADR-0012).
    - `idea`: solapamiento con `note`; no aporta distinción ontológica útil.
    - Tipos temáticos (`filosofia`, `productividad`, ...): eso se cubre con `pillars`, no con `type`.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Seed vacío (agente crea tipos según observa) | Sin sesgo previo | Frío inicio: el agente no tiene catálogo para clasificar primeras notas | Cuesta más que beneficia |
| Seed amplio (Notion-style: 20+ tipos) | Plantillas listas | Sesgo de categorías; muchas nunca se usan; ruido al clasificar | Contradice "captura sin fricción" (ADR-0012) |
| Tipos hard-coded (no editables) | Catálogo cerrado y consistente | Sin extensibilidad cuando emerjan necesidades reales | Limita aprendizaje a largo plazo del sistema |
| 8 tipos genéricos editables (elegido) | Cobertura mínima útil + extensibilidad | Requiere disciplina al crear nuevos | Mejor balance |

## Related

- ADRs: `ADR-0010` (Pillars enum), `ADR-0012` (capture es uncategorized)
- Research: [docs/research/03-data-model/self-critique.md](../research/03-data-model/self-critique.md)
- Código: `apps/mcp/surreal/seed.surql` (carga los 8 tipos), `apps/mcp/surreal/schema.surql` (tabla `note_type`)

## Notes

La convención de IDs `note_type:<slug>` es deliberada: SurrealDB permite IDs custom, y la legibilidad supera al ahorro marginal de hashes. Prompts del agente y configuraciones referencian tipos por slug directamente, sin capa de lookup.
