# ADR-0010: Pillars y NoteState como enums validados

**Status**: Superseded in part by ADR-0021 (Pilares dropped; NoteState enum still valid)
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

> **Update 2026-05-20**: la decisión sobre Pilares está **superseded by ADR-0021** (adopción de ZTD, drop de Pilares). La parte de NoteState (enum validado con ASSERT) sigue vigente. Ver ADR-0021 para el contexto del pivote y la "Opción C" como futura reintroducción posible.

## Context

Al modelar la clasificación ortogonal de cada nota (qué pilares estratégicos toca + en qué estado GTD está), había que decidir si estos catálogos son **tablas editables** (como `note_type`) o **enums fijos validados en el motor**.

Dos conjuntos a decidir:

- **Pillars** (Pilares Estratégicos): `PATHOS_SOMA`, `ETHOS`, `TELOS`, `SOPHIA`. Conceptos griegos fundacionales de la visión de Huygens (cuerpo-emoción, valores-comunidad, propósito-misión, sabiduría-conocimiento).
- **NoteState**: `INBOX`, `CLARIFIED`, `ACTIVE`, `WAITING`, `SOMEDAY`, `DONE`, `ARCHIVED`. El ciclo GTD canónico.

Ambos son **estables por diseño**: los Pilares son filosóficamente fundacionales y los Estados son el workflow GTD probado durante décadas. Editabilidad a runtime aporta poco y añade complejidad (joins, validación de transiciones, UI de gestión).

## Decision

`Pillars` y `NoteState` se modelan como **strings con validación `ASSERT` en el motor**, no como tablas:

```surql
DEFINE FIELD pillars ON note TYPE array<string>
  DEFAULT []
  ASSERT $value ALLINSIDE ['PATHOS_SOMA', 'ETHOS', 'TELOS', 'SOPHIA'];

DEFINE FIELD state ON note TYPE string
  DEFAULT 'CLARIFIED'
  ASSERT $value INSIDE ['CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'];
```

`pillars` es array (una nota puede tocar varios pilares; son ortogonales, no excluyentes). `state` es escalar con default `'CLARIFIED'`.

**Nota — INBOX removido del enum**: cuando se introdujo `raw_capture` como tabla separada (ADR-0017), el "estar pendiente de procesar" pasó a vivir en `raw_capture.processed_at IS NONE`, no como un valor de `note.state`. Una `note` existe porque ya fue procesada desde un raw; nace por defecto en `CLARIFIED`.

## Consequences

- **Positivas**:
  - Validación nativa: insertar un pillar inválido falla en el motor, no en código.
  - Queries directas e indexadas: `WHERE state = 'INBOX'`, `WHERE 'TELOS' IN pillars`.
  - Sin joins ni tablas auxiliares.
  - Default sano (`INBOX`) reduce fricción de captura (ADR-0012).
- **Negativas**:
  - Pierdes campo `description` por pilar/estado en la BBDD. El significado vive en el prompt del agente (`docs/agents/huygens-domain.md`) y en research docs.
  - Añadir un 5º pilar requiere migración de schema explícita (un día). No es edit-via-UI.
- **Neutrales**:
  - La estabilidad es feature, no bug: los pilares son conceptos griegos formales; cambiarlos casualmente erosionaría la coherencia de la memoria.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Tabla `pillar` editable (record refs) | Permite description, edit en UI, edges `TOUCHES_PILLAR` reificados | Joins en cada query, complejidad sin valor (los pilares no cambian) | Sobreingeniería para 4 valores estables |
| Tabla `note_state` editable | Lo mismo + permitiría máquina de estados configurable | El ciclo GTD es canónico; configurabilidad no aporta | Sobreingeniería para 7 valores estables |
| Sin validación (`type string`) | Máxima flexibilidad | Frágil; tipos inválidos contaminan la BBDD | El motor debe enforzar el catálogo |

## Related

- ADRs: `ADR-0008` (topología), `ADR-0011` (edges schemafull), `ADR-0012` (capture es uncategorized)
- Research: [docs/research/03-data-model/pillars-and-states.md](../research/03-data-model/pillars-and-states.md), [docs/research/01-vision/strategic-pillars.md](../research/01-vision/strategic-pillars.md)
- Código: `apps/mcp/surreal/schema.surql` (campos `pillars`, `state`)

## Notes

`note_type` SÍ es tabla editable (ADR-0013): a diferencia de pilares y estados, los tipos pueden crecer orgánicamente cuando el usuario descubre nuevas categorías. La distinción es: ejes ortogonales fundacionales (enums) vs. catálogos descubribles (tablas).
