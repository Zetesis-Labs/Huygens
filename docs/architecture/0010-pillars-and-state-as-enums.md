# ADR-0010: Pillars y NoteState como enums validados

**Status**: Superseded in part by ADR-0021 (Pilares dropped; NoteState enum still defined; only `CLARIFIED` driven en la fase actual)
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

> **Update 2026-05-20**: la decisión sobre Pilares está **superseded by ADR-0021** (adopción de ZTD, drop de Pilares). El enum `NoteState` sigue definido en schema, pero el flujo actual (ver `docs/MODEL.md`) usa únicamente `CLARIFIED`; las transiciones a otros estados están permitidas pero no son driven por el sistema en esta fase.

## Context

Al modelar clasificaciones ortogonales en `note`, había que decidir si los catálogos asociados son **tablas editables** (como `note_type`) o **enums fijos validados en el motor**.

El conjunto que queda relevante en esta fase:

- **NoteState**: `CLARIFIED`, `ACTIVE`, `WAITING`, `SOMEDAY`, `DONE`, `ARCHIVED`. El ciclo GTD canónico. Estable por diseño — el workflow GTD está probado durante décadas; editabilidad a runtime aporta poco y añade complejidad (joins, validación de transiciones, UI de gestión).

(Existió también un eje **Pillars** con cuatro valores; ver ADR-0021 para por qué se dropeó.)

## Decision

`NoteState` (y en su momento `Pillars`) se modelan como **strings con validación `ASSERT` en el motor**, no como tablas:

```surql
DEFINE FIELD state ON note TYPE string
  DEFAULT 'CLARIFIED'
  ASSERT $value INSIDE ['CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'];
```

`state` es escalar con default `'CLARIFIED'`.

**Nota — INBOX removido del enum**: cuando se introdujo `raw_capture` como tabla separada (ADR-0017), el "estar pendiente de procesar" pasó a vivir en `raw_capture` (hoy, en el modelo de `docs/MODEL.md`, en `metadata.topologized_at` de los informes), no como un valor de `note.state`. Una `note` existe porque ya fue procesada; nace por defecto en `CLARIFIED`.

## Consequences

- **Positivas**:
  - Validación nativa: insertar un estado inválido falla en el motor, no en código.
  - Queries directas e indexadas: `WHERE state = 'CLARIFIED'`.
  - Sin joins ni tablas auxiliares.
- **Negativas**:
  - Pierdes campo `description` por estado en la BBDD. El significado vive en la documentación del modelo (`docs/MODEL.md`).
  - Añadir un estado requiere migración de schema explícita. No es edit-via-UI.
- **Neutrales**:
  - La estabilidad es feature, no bug: el ciclo GTD es canónico; cambiarlo casualmente erosionaría la coherencia de la memoria.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Tabla `note_state` editable | Permitiría máquina de estados configurable | El ciclo GTD es canónico; configurabilidad no aporta | Sobreingeniería para 6 valores estables |
| Sin validación (`type string`) | Máxima flexibilidad | Frágil; valores inválidos contaminan la BBDD | El motor debe enforzar el catálogo |

## Related

- ADRs: `ADR-0008` (topología), `ADR-0011` (edges schemafull), `ADR-0021` (drop de Pilares + adopción de ZTD)
- Código: `apps/mcp/surreal/schema.surql` (campo `state`)

## Notes

`note_type` SÍ es tabla editable (ADR-0013): a diferencia del estado GTD, los tipos pueden crecer orgánicamente cuando el usuario descubre nuevas categorías. La distinción es: ejes ortogonales fundacionales (enums) vs. catálogos descubribles (tablas).
