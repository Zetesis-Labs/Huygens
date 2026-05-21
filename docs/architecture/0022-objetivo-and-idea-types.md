# ADR-0022: Añadir Objetivo e Idea como NoteTypes del seed

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

## Context

Al adoptar ZTD (ADR-0021), dos conceptos del marco merecen ser ciudadanos de primera clase del modelo en lugar de improvisarse vía `metadata` o tags. El seed de 8 NoteTypes (ADR-0013) cubría GTD + Zettelkasten + narrativa, pero quedaba corto en dos frentes:

**Objetivos** — la visión a largo plazo. La función estratégica recaía parcialmente en los Pilares y parcialmente en Projects con horizonte multi-año (forzados, antinaturales). ZTD pide un nivel explícito sobre Project: algo que pueda no tener pasos concretos definidos ni fecha, pero que oriente el resto. Los Objetivos agrupan Projects vía `part_of` y pueden ser jerárquicos entre sí.

**Ideas** — el usuario lo verbalizó así: _"las ideas pueden nutrir de conceptos todo el sistema porque todo es susceptible de tener una idea asociada"_. Una Idea es markdown libre conectable a cualquier entidad vía `mentions` o `supports`. Funcionalmente reemplaza el "Algún día / Tal vez" de GTD/ZTD, con un giro: las ideas no están aparcadas, están **vivas** y pueden activarse al alimentar Tasks, Projects u Objetivos.

La pregunta que cerró la decisión: ¿qué distingue Idea de Note? Una **Note** es libre (reflexión, observación, registro). Una **Idea** es específicamente un **concepto generativo** — algo que potencialmente alimenta otras notas. Distinción semántica, no estructural, pero suficiente para que el agente la respete al taggear.

## Decision

Añadir dos nuevos NoteTypes al seed (`apps/mcp/surreal/seed.surql`), pasando de 8 a 10:

```surql
UPSERT note_type:objetivo SET
  slug = 'objetivo',
  name = 'Objetivo',
  description = 'Meta estratégica a largo plazo. Puede tener target_date o target_range opcional. Agrupa Projects.';

UPSERT note_type:idea SET
  slug = 'idea',
  name = 'Idea',
  description = 'Concepto generativo que puede nutrir Tasks/Projects/Objetivos vía edges mentions/supports.';
```

**Metadata convencional para Objetivos** — `note.metadata: option<object>` es un saco flexible. Convención (no enforced por schema):

```ts
metadata: {
  target_date?: datetime,        // fecha objetivo concreta
  target_range?: { start: datetime, end: datetime },
  // Futuro v2:
  progress?: float,              // 0-1
  completed_at?: datetime
}
```

`target_date` y `target_range` son mutuamente exclusivos: uno, el otro, o ninguno. Validación en código de aplicación (tools del MCP), no en motor.

**Jerarquía vía `part_of`**: Objetivo `part_of` Objetivo (sub-Objetivos), Project `part_of` Objetivo, Project `part_of` Project, Task `part_of` Project.

**Convención — Objetivo vs Project**: Objetivo es aspiracional, puede no tener pasos ni fecha (e.g. _"aprender programación funcional en profundidad"_). Project es outcome multi-paso concreto (e.g. _"montar el devcontainer del proyecto X"_). En duda, el agente pregunta; no promociona Projects a Objetivos automáticamente.

**Convención — Idea vs Note**: Idea tiene cualidad generativa (insight, hipótesis, conceptualización que alimenta otras notas). Note es registro u observación que no genera nada (e.g. _"leí el libro X y me gustó"_). En duda, el agente prefiere `note`; el usuario puede promocionar después.

## Consequences

- **Positivas**:
  - Modelo más expresivo: captura natural del "qué" estratégico (Objetivos) y del "qué" generativo (Ideas).
  - Jerarquía clara Objetivo → Project → Task, con Objetivos también encadenables entre sí.
  - Ideas enriquecen el grafo de conocimiento conectando a cualquier nodo vía `mentions`/`supports`.
  - Análisis útiles desbloqueados: "Objetivos sin Projects activos" = aspiraciones desatendidas; "Projects sin Objetivo" = trabajo huérfano.
- **Negativas**:
  - Dos tipos más para el agente que recordar y clasificar (10 en total).
  - Posible solapamiento Note↔Idea — mitigado por la convención documentada.
- **Neutrales**:
  - `metadata` para Objetivos es convención no enforced — riesgo de drift si el agente no respeta el shape. Mitigable con validación TypeScript en las tools del MCP cuando aterricen.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Solo `task`/`project` (sin Objetivo distinto) | Más simple | Pierdes el nivel estratégico; Projects con horizonte multi-año son antinaturales | Necesitamos un nivel sobre Project |
| Tabla `objetivo` separada de `note` | Schema más estricto | Rompe la uniformidad "todo es Note" (ADR-0008) | Coherencia con modelo existente |
| `idea` se queda fuera, solo `note` | Menos tipos | Pierde la distinción semántica entre registro y generativo | El usuario lo pidió explícitamente |
| Mantener `note_type:note` y añadir `note_type:idea` (lo elegido) | Distinción clara | Posible solapamiento "¿es note o idea?" | Convención documentada resuelve la ambigüedad |

## Related

- `ADR-0021` (adopt ZTD, drop Pilares — esto es parte del mismo paquete)
- `ADR-0013` (eight-seed-notetypes — superseded por este ADR)
- `ADR-0023` (MIT field — otra pieza del paquete ZTD)
- `ADR-0008` (topology primary — Objetivos y Projects se conectan vía edges)
- Código: `apps/mcp/surreal/seed.surql` (añadir UPSERTs)

## Notes

En el futuro v3+ se podría considerar campos dedicados (`target_date`, `target_range`) en `note` con `option<datetime>` y validación de motor, en lugar de `metadata`. Solo merece la pena si el uso se estabiliza y la cardinalidad es alta.

Idea es estructuralmente equivalente a Note pero **semánticamente distinta**. Si una nota empieza como `note` y con el tiempo se ve que alimenta otras (vía edges `mentions`/`supports` salientes), promocionarla a `idea` es una operación válida y barata.
