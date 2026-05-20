# ADR-0012: Captura es no-categorizada (`note.type` opcional)

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

## Context

En la primera iteración del modelo, "inbox" se incluyó como un `NoteType` más, junto a `task`, `project`, etc. La intuición era forzar al agente a clasificar siempre.

Durante la sesión de diseño, Rubén apuntó: _"algo que capturas podríamos decir que es algo sin categorizar no te parece?"_ El insight: tener un type `inbox` mezcla dos ejes ortogonales — el **estado del workflow** (¿procesado o no?) y la **categorización ontológica** (¿qué es esta nota?). Una captura, por definición, todavía no sabe qué es. Forzar a etiquetarla como `inbox` añade una categoría artificial.

GTD distingue claramente: el Inbox es un **estado** (cosas pendientes de aclarar), no una **clase de cosa**. La aclaración (clarify) transforma el estado, no crea un type nuevo.

Reducir la fricción de captura es objetivo central del proyecto (capturar pensamientos rápido sin decidir taxonomía).

## Decision

`note.type` es **opcional**. Una nota recién capturada vive con:

```surql
{ type: NONE, state: 'INBOX' }
```

"Inbox" se modela exclusivamente como **estado** (`NoteState`, ADR-0010). NO existe un `note_type:inbox`.

Implementación:

```surql
DEFINE FIELD type ON note TYPE option<record<note_type>>;
DEFINE FIELD state ON note TYPE string DEFAULT 'INBOX' ASSERT ...;
```

Clarificar = transición de estado `INBOX → CLARIFIED` + asignación de `type`.

## Consequences

- **Positivas**:
  - Captura sin decidir taxonomía: el agente escribe `CREATE note SET title = "..."` y ya está.
  - Estado y type son ejes ortogonales limpios — el modelo refleja la ontología GTD correcta.
  - El agente puede capturar sin saber qué es la nota; lo descubre después al clarificar.
  - Queries del workflow Inbox son simples: `WHERE state = 'INBOX'`.
- **Negativas**:
  - Cualquier código que itere notas debe manejar `type` como `option<...>`.
  - Render de UI debe tolerar notas "sin tipo" (mostrar como "Captura" o similar).
- **Neutrales**:
  - Notas pueden quedarse en `INBOX` indefinidamente sin type. Es feature: refleja realidad (cosas que no se han clarificado todavía).

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Type obligatorio con `note_type:inbox` | Sin nulls en `type` | Mezcla estado y categorización; fricción al capturar (¿es task? ¿idea?) | Confunde dos ejes ortogonales |
| Type obligatorio con `note_type:uncategorized` | Sin nulls; explícito | Categoría artificial; cualquier query tiene que excluirla constantemente | "Sin tipo" es la verdad; no inventar etiqueta |
| Type opcional + estado `INBOX` (elegido) | Refleja GTD correcto; captura sin fricción | Manejar `option<...>` | Modela la realidad: captura ≠ clasificación |

## Related

- ADRs: `ADR-0010` (NoteState como enum), `ADR-0013` (seed de NoteTypes — sin "inbox")
- Research: [docs/research/03-data-model/self-critique.md](../research/03-data-model/self-critique.md)
- Código: `apps/mcp/surreal/schema.surql` (`type ON note TYPE option<record<note_type>>`)

## Notes

Esta decisión es coherente con la filosofía GTD: capturar todo sin friction, clarificar después en proceso aparte. El modelo de datos respeta la separación temporal de esas dos actividades.
