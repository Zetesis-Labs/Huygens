# Pilares y Estados: los dos enums fundamentales

Este documento cubre los dos enums que clasifican toda Note en Huygens: `Pillar` (qué dimensión estratégica toca) y `NoteState` (en qué fase del ciclo GTD vive). Son las dos clasificaciones que **NO** son editables en runtime — a diferencia de `NoteType`, que es un árbol modificable. Son enums por una razón, y aquí se documenta cuál.

## `Pillar` — los 4 ejes ortogonales

```prisma
enum Pillar {
  PATHOS_SOMA
  ETHOS
  TELOS
  SOPHIA
}
```

Los 4 valores son **conceptos griegos** elegidos deliberadamente. El contenido filosófico de cada uno está en [../01-vision/strategic-pillars.md](../01-vision/strategic-pillars.md). Aquí lo que importa es **la implicación técnica**.

### Por qué enum y no model

Los pilares son **fundacionales y estables**. Son cuatro porque corresponden a una lectura particular del campo de la experiencia humana: cuerpo y emoción (Pathos-Soma), hábito y disciplina (Ethos), propósito y dirección (Telos), conocimiento y razón (Sophia). No están aquí para "categorizar tareas" — están aquí porque son las cuatro dimensiones bajo las que Rubén quiere que el agente lea su vida.

Una migración solo se justifica si se descubre un 5º pilar. Eso es improbable: **los conceptos griegos no se inventan**. Si en algún momento se ve que falta una dimensión, es señal de que se está mirando otra cosa, no de que falten enums.

**Comparativa Pilares (enum) vs NoteType (model)**:

| Aspecto | `Pillar` (enum) | `NoteType` (model) |
|---|---|---|
| Editable runtime | No | Sí |
| Migración para añadir uno | Sí (cambio de schema) | No (insert) |
| Tiene `description` field | No | Sí |
| Estable a lo largo del tiempo | Muy estable | Muy variable |
| Ámbito | Filosófico-fundacional | Operativo-pragmático |
| El agente los conoce | Por prompt | Vía query a la tabla |

**Trade-off honesto**: al ser enum, los pilares **no tienen un campo `description`** en la BBDD. Es decir, no puedes hacer `prisma.pillar.findUnique({ where: { slug: 'ETHOS' } }).description`. El significado de cada pilar lo conoce el agente por **prompt** (en el system prompt o en context). Esto se acepta a cambio de no añadir una tabla más para algo que no va a cambiar.

### Por qué Array (multiple per Note)

`pillars Pillar[]` — array. Una nota puede tocar **varios pilares simultáneamente**.

Esto es deliberado y la decisión cuesta defenderla solo si se entiende mal qué son los pilares. Si fueran categorías excluyentes (como `state`, que tiene exactamente un valor), un single pillar tendría sentido. Pero **son ejes**, no categorías. Tres ejemplos:

- **"Programación funcional aplicada a meditación"**: una nota que explora cómo el pattern matching de Haskell se parece a una cierta postura mental. Toca `SOPHIA` (es teoría) y `PATHOS_SOMA` (es meditación). Forzarla a una sola categoría sería falsificarla.

- **"Plan de entrenamiento de fuerza para el Q3 2026 con OKRs medibles"**: toca `PATHOS_SOMA` (es cuerpo), `ETHOS` (es disciplina/hábito) y `TELOS` (tiene OKRs, dirección a largo). Tres ejes simultáneamente.

- **"Tarea: comprar pilas"**: no toca ningún pilar. Es operativa pura. **Array vacío permitido** — no toda nota tiene que encajar en una dimensión filosófica.

La decisión fue del usuario, deliberada, en contra del default "una nota = un pilar" que sería más simple de implementar y más limpio en queries. La complejidad extra de manejar un array se paga gustosamente porque **el modelo refleja mejor el dominio**.

### Limitación honesta: ¿y la lista de la compra?

Una nota podría intuitivamente **NO encajar bien en ninguno de los 4 pilares**. La lista de la compra no es Pathos, no es Ethos, no es Telos, no es Sophia. Es solo... una lista.

La solución es **permitir array vacío**. El schema no fuerza al menos un pilar. Las queries que filtran por pilar (`WHERE 'TELOS' IN pillars`) simplemente no incluirán esas notas, lo cual es semánticamente correcto: no aparecen en reports filtrados por dimensión filosófica porque no pertenecen a ninguna.

Honestidad: a veces el agente, al clarificar, intentará forzar un pilar porque "todo debe tener uno". Hay que entrenarlo (o instruirlo en prompt) para que reconozca que la lista vacía es legítima.

### Por qué NO un weight / score por pilar

Otra alternativa rechazada: `pillars: { name: Pillar, weight: Float }[]` — para decir "esta nota es 70% Sophia, 30% Pathos". Se descartó por dos razones:

1. **Falsa precisión**: ¿el agente realmente puede asignar un 70% vs un 73% de forma reproducible? Probablemente no. Es ruido pseudo-cuantitativo.
2. **Complica queries sin aportar**: las queries útiles son "qué notas tocan Sophia" — la presencia/ausencia es suficiente.

Si en algún momento se quiere ranking por relevancia dentro de un pilar, se hace por otras señales (recencia, `lastReviewedAt`, número de edges, etc.), no por un weight inventado.

## `NoteState` — el ciclo GTD

```prisma
enum NoteState {
  INBOX
  CLARIFIED
  ACTIVE
  WAITING
  SOMEDAY
  DONE
  ARCHIVED
}
```

Siete valores. Inspirado en GTD canónico, no inventado.

### Significado de cada estado

- **`INBOX`** — capturada, sin procesar. Por defecto, toda Note nueva empieza aquí (`@default(INBOX)` en el schema). En este estado, típicamente `typeId=null`.

- **`CLARIFIED`** — procesada. Sabemos qué es (asignado un `typeId`) y qué hacer con ello. Una nota `CLARIFIED` puede quedarse así si no requiere acción inmediata (e.g., una reference, una persona), o transitar a `ACTIVE` si es algo que se está haciendo.

- **`ACTIVE`** — en marcha. Tasks que están siendo trabajadas. Projects con actividad reciente. Es el estado de "foco actual".

- **`WAITING`** — bloqueada por algo externo. La acción no la tiene el usuario; depende de un tercero, una entrega, una decisión externa. Se acompaña típicamente de un edge `BLOCKED_BY`.

- **`SOMEDAY`** — no ahora, quizá luego. Capturada y clarificada, pero archivada deliberadamente para revisar en el futuro. No se ignora — se relee periódicamente en el someday/maybe review.

- **`DONE`** — completada. Mantiene su lugar en el grafo (los edges siguen existiendo). No se borra.

- **`ARCHIVED`** — fuera de circulación. Notas que ya no están en el foco activo. La diferencia con `DONE` es de uso, no de completitud: una decisión tomada hace 2 años puede archivarse sin haber estado "done", una task done de hace 18 meses puede archivarse simplemente para sacarla de los listados activos.

### Diagrama de transiciones

```
                    ┌──→ DONE ────┐
                    │             ↓
INBOX ──→ CLARIFIED ─→ ACTIVE ─→ WAITING ─→ ACTIVE
            │            ↑          │
            ├──→ SOMEDAY ┴──────────┘
            │
            └──→ ARCHIVED  (cuando no aplica acción)

   ARCHIVED  ←──── DONE (con el paso del tiempo)
```

### Transiciones típicas explicadas

- **`INBOX → CLARIFIED`**: el agente o el usuario decide qué es y qué hacer. Asigna `typeId`, posiblemente `pillars[]`, y mueve el estado.

- **`CLARIFIED → ACTIVE`**: se empieza a trabajar. Una task se pone "en marcha". Un project se considera en curso.

- **`ACTIVE → WAITING`**: bloqueada por terceros. Se crea típicamente un edge `BLOCKED_BY` para registrar el bloqueador concreto. Si el bloqueador es una persona, puede ir como property del edge (`blocker: record<person>`) o como sub-Note tipo `waiting-on`.

- **`WAITING → ACTIVE`**: se desbloquea. El edge `BLOCKED_BY` o bien se borra, o queda como histórico (depende de la política de audit; ver [self-critique.md](./self-critique.md#6-sin-noterevision-audit-trail)).

- **`ACTIVE → DONE`**: completada. El agente marca, el usuario marca, o el sistema infiere por evidencia (e.g., la task tenía una sub-task `MENTIONS` un commit, y el commit aparece).

- **`CLARIFIED → SOMEDAY`**: clarificada como algo deseable pero no urgente. Se archiva al cajón de "quizá".

- **`SOMEDAY → ACTIVE`**: se recupera. El weekly o monthly review devuelve algo del cajón a foco activo.

- **`DONE → ARCHIVED`**: con el paso del tiempo. Política sugerida: tasks done > 6 meses pasan a ARCHIVED automáticamente.

- **`CLARIFIED → ARCHIVED`** (directo): a veces al clarificar uno se da cuenta de que "esto no aplica" — un proyecto que ya no tiene sentido, una idea que se descarta. Se archiva sin pasar por ACTIVE.

### Por qué enum (y no model como NoteType)

Los estados, igual que los pilares, son **fundacionales y estables**.

- Es el **ciclo GTD canónico**, conocido y documentado en la literatura. No es algo que Rubén invente.
- Permite **queries indexadas** baratísimas: `WHERE state = 'INBOX'` con `@@index([state])` devuelve el inbox instantáneo.
- Añadir un estado es una decisión grande: implica reescribir las transiciones, los workflows del agente, los reports. Forzar una migración para esto es **correcto**, no fricción.

### Implicaciones para queries

Algunas queries canónicas que el modelo soporta:

```ts
// Inbox processing — todo lo capturado sin clarificar
prisma.note.findMany({ where: { state: 'INBOX' } })

// Foco activo
prisma.note.findMany({ where: { state: { in: ['ACTIVE', 'WAITING'] } } })

// Weekly review — notas activas no revisadas en > 7 días
prisma.note.findMany({
  where: {
    state: { in: ['ACTIVE', 'WAITING'] },
    OR: [
      { lastReviewedAt: { lt: weekAgo } },
      { lastReviewedAt: null }
    ]
  }
})

// Waiting check — chasing de bloqueos viejos
prisma.note.findMany({
  where: {
    state: 'WAITING',
    updatedAt: { lt: twoWeeksAgo }
  }
})

// Someday review
prisma.note.findMany({ where: { state: 'SOMEDAY' } })
```

Todas estas son queries indexadas. Sin enum + index, el motor tendría que escanear toda la colección.

### Lo que NO se incluyó (y por qué)

GTD-puristas y otros sistemas (e.g., OmniFocus, Things, TickTick) tienen más estados o conceptos relacionados. Aquí va lo que **NO** se incluyó, con la razón:

- **`NEXT_ACTION`**: en GTD canónico, "next action" es la siguiente acción concreta sobre un proyecto. Algunos sistemas lo modelan como estado. Aquí se modela mejor como **edge específico** (futuro) entre Tasks de un Project: `next:` apunta a la siguiente. No es estado de la Task.

- **`CALENDARED` / `SCHEDULED`**: una task con fecha específica. Esto se modela como **field datetime opcional** en `metadata.scheduledFor`, no como estado. Una task puede estar `ACTIVE` y además calendarizada — son ortogonales.

- **`DELEGATED`**: en GTD se delega a alguien. Esto se modela como `WAITING` + edge `BLOCKED_BY` apuntando a la persona o a la sub-task de espera.

- **`COMPLETED_PARTIALLY`**: nope. Algo está done o no. Si una task es "medio hecha", el modelo correcto es: **descomponerla** en sub-tasks (children o `PART_OF`), y marcar las hechas como done.

- **`FROZEN` / `BLOCKED_BY_DESIGN`**: una task que no se hace por decisión consciente. Se modela como `SOMEDAY` con razón en `metadata.reason`, o como `ARCHIVED` con `metadata.archivedReason`.

**Principio rector**: mantener el enum **mínimo**. Si hace falta más expresividad, añadir vía:
- Edges tipados (para relaciones de orden, dependencia)
- Fields opcionales en `metadata` (para atributos no estructurales)
- Migración explícita (si realmente falta un estado, asumimos el coste)

### Sobre `lastReviewedAt` y los reviews periódicos

Vale la pena reiterar (lo dice también [note-model.md](./note-model.md#timestamps)): `lastReviewedAt` **no es lo mismo** que `updatedAt`. Una nota se puede modificar (regeneración de chunks, retag) sin que nadie la haya "mirado" conscientemente. `lastReviewedAt` solo lo escribe el agente o el usuario cuando hace **review intencional**.

Esto permite separar:

- **"Notas activas que necesitan atención"** = `state in (ACTIVE, WAITING) AND (lastReviewedAt < hace 7d OR lastReviewedAt is null)`
- **"Notas que cambiaron esta semana"** = `updatedAt > hace 7d` (incluye cambios mecánicos)

Son dos preguntas distintas. Confundir ambos timestamps sería confundir "yo he prestado atención" con "el sistema ha tocado la fila".

## Resumen

1. **`Pillar` es enum** porque los pilares son **filosóficamente fundacionales y estables**. Cuatro valores griegos: Pathos-Soma, Ethos, Telos, Sophia. Una migración solo se justifica si Rubén descubre un quinto, lo cual es improbable.

2. **Pilar es array** porque son **ejes ortogonales**, no categorías excluyentes. Array vacío permitido (no toda nota tiene que ser filosóficamente cargada).

3. **`NoteState` es enum** porque es el **ciclo GTD canónico**, estable, y los índices baratos por estado son fundamentales para todas las queries operativas.

4. **Siete estados**: `INBOX, CLARIFIED, ACTIVE, WAITING, SOMEDAY, DONE, ARCHIVED`. Las transiciones tienen forma de grafo dirigido con ciclos limitados (ACTIVE ↔ WAITING, SOMEDAY ↔ ACTIVE).

5. **Lo que no se incluyó** (NEXT_ACTION, CALENDARED, DELEGATED, ...) se modela vía edges, fields opcionales, o sub-Notes. Mantener el enum mínimo es deliberado.

6. **`lastReviewedAt` ≠ `updatedAt`**: review consciente vs mutación del sistema. Distinción crítica para queries de review periódico.
