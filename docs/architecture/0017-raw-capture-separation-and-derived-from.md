# ADR-0017: Separación raw_capture / Notes + edge derived_from

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

## Context

Inicialmente el "inbox" del usuario vivía como una `note` con `state = 'INBOX'` + `type = NONE` (ver ADR-0012). Durante la discusión del flujo de captura quedó claro que esto **mezclaba dos ontologías distintas**:

- **Captura cruda** (lo que el usuario dijo literalmente): evidencia inmutable, sin clasificar, sin segmentar
- **Procesado** (la interpretación del agente en el grafo): estructurado, editable, con type/pillars/blocks/edges

Tener una `note` ya implicaba decisiones de interpretación (título, segmentación en blocks, type asignado), por tanto NO podía representar el plano de "input sin procesar". El inbox real es lo no-interpretado.

Además, queríamos **trazabilidad inversa**: dado un block o una nota, poder responder "¿de qué input crudo vino esta interpretación?". El campo `processed_into` que se introdujo en una iteración anterior (array sobre raw_capture) era torpe: relación expresada como campo, sin propiedades, sin granularidad por block.

## Decision

**Dos cambios coordinados** en el schema:

**1. Nueva tabla `raw_capture`** — el plano de evidencia:

```surql
DEFINE TABLE raw_capture SCHEMAFULL;
DEFINE FIELD content      ON raw_capture TYPE string;
DEFINE FIELD source_kind  ON raw_capture TYPE string
  ASSERT $value INSIDE ['chat', 'voice', 'manual', 'import', 'agent-self'];
DEFINE FIELD source_ref   ON raw_capture TYPE option<string>;
DEFINE FIELD created_at   ON raw_capture TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD processed_at ON raw_capture TYPE option<datetime>;
```

El "inbox real" es `WHERE processed_at IS NONE`. El raw nunca se borra.

**2. Edge `derived_from`** — trazabilidad estructurado → crudo:

```surql
DEFINE TABLE derived_from TYPE RELATION FROM note | block TO raw_capture SCHEMAFULL;
DEFINE FIELD transformation ON derived_from TYPE option<string>
  ASSERT $value IS NONE OR $value INSIDE ['verbatim', 'extracted', 'summarized', 'inferred'];
DEFINE INDEX derived_from_unique ON derived_from FIELDS in, out UNIQUE;
```

Soporta `note | block` como origen — permite granularidad fina ("este block específico es verbatim de aquel raw").

Como consecuencia, **`note.state` ya NO incluye `'INBOX'`** — el "estar pendiente" vive en `raw_capture.processed_at`, no en el state de la nota. Una `note` existe porque ya fue procesada (default state: `'CLARIFIED'`). Ver ADR-0010 actualizado.

## Consequences

**Positivas**:
- Separación ontológica limpia: evidencia vs interpretación
- Auditabilidad: agente puede re-procesar un raw sin destruir originales
- El campo `transformation` permite detectar si una nota es literal del usuario o inferida por el agente (importante contra alucinaciones)
- Granularidad de procedencia hasta block-level
- Trazabilidad bidireccional vía edge (queries naturales en ambas direcciones)
- Coherente con "topología es primaria" (ADR-0008): la relación cruda↔estructurada también es edge, no campo

**Negativas**:
- Una tabla más + un edge más (8 edges total: `part_of`, `blocked_by`, `mentions`, `supports`, `refutes`, `about`, `authored_by`, `derived_from`)
- El commit del clarify es ahora multi-step (INSERT notes + blocks, RELATE derived_from, UPDATE raw.processed_at) — merece transacción SurrealDB para garantizar atomicidad
- `note.state` perdió un valor (INBOX), requiere ajustar todas las queries que filtraban por él

**Neutrales**:
- Aplicar a una BBDD existente requiere migración de raws "fantasma" (notas con state=INBOX). En la fase actual (sin datos productivos) no aplica.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| `note` con `state=INBOX` (el approach anterior, ADR-0012) | Una sola tabla, simple | Mezcla evidencia con interpretación; el "inbox" exige decisiones de interpretación antes de existir | No respeta la naturaleza del input crudo |
| `raw_capture` + `processed_into: array<record<note>>` campo en raw_capture | Una tabla menos | Relación como campo (anti-topología, ADR-0008), sin granularidad block-level, sin metadata, sin UNIQUE | Modela mal la relación |
| `raw_capture` + edge `derived_from` (esta decisión) | Coherente con resto del schema, granular, auditable | Una tabla y un edge más | — |

## Related

- ADR-0008: Topology as primary (el principio que justifica edge vs campo)
- ADR-0010: Pillars y NoteState como enums (actualizado para sacar INBOX de los valores)
- ADR-0012: Capture is uncategorized (sigue válido en parte — typeId sigue siendo opcional para notas que el agente no clasifica)
- ADR-0011: Schemafull edges con note|block (este edge añade `raw_capture` como destino válido más)
- `apps/mcp/surreal/schema.surql`: la implementación

## Notes

El campo `transformation` (verbatim / extracted / summarized / inferred) es opcional pero el agente debería usarlo cuando aplique. Esto crea una **escala de confianza de procedencia**: si una nota tiene `transformation: 'verbatim'` y su contenido difiere del raw original, es bug detectable; si es `'inferred'`, se entiende que el agente reinterpretó (mayor riesgo de "alucinación" pero más útil para abstracciones).
