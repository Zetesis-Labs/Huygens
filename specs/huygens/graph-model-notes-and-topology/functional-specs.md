# Huygens — Functional Spec — `graph-model-notes-and-topology`

> Spec de una sola app (`huygens`) y una sola iniciativa (`graph-model-notes-and-topology`).
> Describe el **plano de Interpretación** de Huygens como **conceptos de producto que el
> usuario percibe**, no como un esquema de base de datos. Reconstruida por ingeniería inversa
> sobre el código implementado (`apps/mcp/src/domain.ts`, `apps/mcp/surreal/schema.surql`,
> `apps/mcp/surreal/seed.surql`, `apps/mcp/src/tools/proposal/commit.ts`,
> `.../validation.ts`, `apps/mcp/src/tools/views.ts`, `apps/mcp/src/tools/retract.ts`) y la
> SSOT de comportamiento (`operating-doctrine.md`, `data-model.md`, `docs/MODEL.md`, ADRs).
> Los identificadores, enums y nombres de campo se citan **verbatim**.

## 1. Summary

Huygens es una memoria estructurada personal. Esta iniciativa cubre **el plano de
Interpretación**: el vocabulario con el que se modela lo que el usuario hace, persigue,
mantiene, piensa o referencia, una vez que la evidencia literal del inbox se ha procesado.
Tres piezas componen ese plano y son lo que el usuario realmente percibe:

- **Notas** (`note`) — las "cosas con identidad" tipadas: tareas, proyectos, áreas, rutinas,
  ideas, referencias, personas y objetivos. Cada nota tiene un **tipo** (de un catálogo de
  ocho), un **estado** de un ciclo de vida ZTD, y hasta tres **ejes temporales** ortogonales.
- **Bloques** (`block`) — las unidades de contenido direccionables. Un bloque o bien es
  **cuerpo de una nota** (`descriptive`) o bien es un **informe-block** (`narrative`): la
  interpretación aprobada que tiende el puente entre la evidencia literal y la topología.
- **Relaciones (edges)** — las frases navegables entre cosas: jerarquía (`part_of`),
  bloqueo (`blocked_by`), mención débil (`mentions`), y la traza de procedencia
  (`about`, `affects`, `derived_from`).

El principio organizador es **"topología como primario"** (ADR-0008): el valor de Huygens no
está en almacenar texto sino en la **forma del grafo** —qué cuelga de qué, qué bloquea a qué,
de qué evidencia sale cada interpretación— y en que esa forma sea **auditable y citable**.

**Frontera de esta spec.** Aquí se describe **qué son** las notas, los bloques, los estados,
los ejes y los edges, y **qué reglas** los gobiernan. *No* se describe:

- el mecanismo de propuesta/commit ni la forma del payload → `processing-proposals-and-commit`.
- las herramientas de búsqueda/lectura sobre el grafo (vector / lexical / hybrid /
  `expand_context` / `neighborhood` / `daily_radar` / etc.) → `retrieval-and-grounding`.
- la auditoría, el changefeed, el fold y el campo `via_proposal` → `audit-provenance-and-trust`.
- el `kind` ritual de los informe-blocks y el coaching de hábitos → `rituals-and-coaching`.

## 2. Actors & Roles

| Actor | Relación con el plano de Interpretación |
|---|---|
| **Usuario (Rubén)** | Único decisor del dominio. Decide qué nota se crea, de qué tipo, en qué estado, qué cuelga de qué, qué bloquea a qué, y qué se retracta. Su orden o aprobación explícita es lo único que autoriza una mutación. |
| **Agente conversacional** (Claude Code, Codex, el worker del dashboard, cualquier cliente MCP) | Propone notas, estados, ejes temporales y edges; redacta los informe-blocks; pero **nunca introduce tipos, estados o edges nuevos por iniciativa**, ni ancla un padre, ni marca un MIT, ni decide un eje temporal sin que el usuario lo haya dicho. |
| **MCP Huygens** | Frontera de persistencia y validación. Hace cumplir como **muro** los enums, el padre único, la aciclicidad y el `anchored`; el resto son **barandillas** que solo el agente respeta. |
| **SurrealDB** | Motor multi-modelo (documento + grafo + vector). Es quien rechaza un estado inválido, un segundo padre o un edge duplicado. No interpreta. |

> El usuario nunca piensa en SurrealQL ni mantiene el grafo a mano (`docs/MODEL.md`, Roles).
> El plano de Interpretación es el lenguaje con el que el agente le devuelve estructura.

## 3. Goals & User Jobs

- **Clasificar sin fricción.** Que cada cosa que el usuario nombra encuentre un **tipo** del
  catálogo (tarea, proyecto, área, rutina, idea, referencia, persona, objetivo) sin tener que
  inventar taxonomía.
- **Saber en qué punto está cada cosa.** Que el **estado** ZTD diga de un vistazo si algo está
  activo, esperando algo externo, aparcado, hecho o archivado.
- **Distinguir prioridad, compromiso y visibilidad.** Que "es mi foco hoy" (`mit_for`),
  "tiene fecha límite dura" (`due_at`) y "no me lo enseñes hasta tal día" (`defer_until`) sean
  **tres cosas distintas** y no se confundan.
- **Navegar relaciones reales.** Que el usuario pueda preguntar "¿qué cuelga de Govoy?",
  "¿qué bloquea esta tarea?", "¿de qué conversación salió esta interpretación?" y obtener
  respuestas trazadas, no impresiones.
- **Conservar la cadena evidencia → interpretación → topología.** Que toda nota o estado
  pueda citar el **informe-block** que lo justificó y, a través de él, los raws literales.
- **Corregir con auditoría.** Que borrar o reparentar algo deje rastro y nunca sea silencioso.

## 4. Entry Points

El plano de Interpretación no tiene UI propia de escritura: todo entra por **herramientas
MCP** invocadas por un agente, y casi todo a través del ciclo de propuesta. Los puntos de
entrada que tocan este plano:

- **`commit_proposal`** — la **única** puerta de creación/mutación estructural de notas,
  bloques y edges. (Su mecánica vive en `processing-proposals-and-commit`; aquí importa que
  *todo* lo de este plano nace o cambia ahí.)
- **`retract`** — la **única** puerta de borrado de notas, bloques y raws (y sus edges
  incidentes). Por defecto previsualiza (`dry_run: true`).
- **Lectura del modelo** (solo lectura, no mutan el plano): `get_hierarchy` (la jerarquía
  `part_of`), `daily_radar` (la superficie activa), `count_notes`, `mit_history`,
  `neighborhood`, `trace_provenance`. Su detalle pertenece a `retrieval-and-grounding` y
  `audit-provenance-and-trust`; se nombran aquí porque son las ventanas por las que el usuario
  ve la topología.
- **Recursos de runtime** que exponen el modelo: `huygens://lore/schema` (el esquema vivo:
  tipos, campos, enums, índices) y `huygens://lore/data-model`.

No hay job programado ni importación masiva que cree notas por su cuenta: el plano de
Interpretación solo crece por commits aprobados.

## 5. Workflows

Los flujos de *cómo* se prepara y aprueba una propuesta viven en
`processing-proposals-and-commit`. Aquí se documentan los flujos **propios del modelo**: qué
le pasa a una nota, un bloque o un edge cuando esas operaciones se aplican.

### WF-1 — Nacimiento de una nota tipada

- **Disparador.** Una propuesta aprobada declara crear una nota (un `note_create`).
- **Pasos.**
  1. La nota se crea con un **tipo** de los ocho slugs válidos
     (`task | project | area | routine | idea | reference | person | objetivo`) y un `title`.
  2. Si la propuesta no especifica estado, la nota nace en **`CLARIFIED`** (el default).
  3. Si trae ejes temporales (`mit_for`, `due_at`, `defer_until`), cada fecha se **normaliza a
     medianoche UTC del día escrito** (una fecha-sola `YYYY-MM-DD` y un ISO con hora aterrizan
     ambas en el mismo día).
  4. Si trae bloques descriptivos, se crean y se enlazan al cuerpo de la nota (ver WF-3).
- **Fin.** Existe una nota tipada, en un estado válido, con sus ejes y su cuerpo.
- **Camino de error.** Un tipo o estado fuera del enum es **rechazado por el motor** (ASSERT).

### WF-2 — Transición de estado (corrección normal)

- **Disparador.** Una orden explícita del usuario sobre una nota existente: "eso ya está
  hecho" → `DONE`; "X pasa a WAITING" → `WAITING`; "retoma Y" → `ACTIVE`.
- **Pasos.** Se prepara una propuesta **mínima y fiel** que cambia `state` (y normalmente
  acompaña un informe-block sin `kind` que registra el porqué vía `affects` con
  `action: state_changed`). El nuevo estado debe pertenecer al enum.
- **Fin.** La nota queda en el nuevo estado; el `affects` deja la traza de por qué cambió.
- **Nota.** Una corrección de estado a media tarde **no es un ritual**: no lleva `kind` y no
  re-pregunta (doctrina, "Árbol de decisión").

### WF-3 — Composición del cuerpo de una nota con bloques descriptivos

- **Disparador.** Una propuesta crea una nota con `descriptive_blocks`, o hace
  `descriptive_blocks_append` sobre una nota existente.
- **Pasos.** Cada bloque descriptivo se crea con `block_kind = 'descriptive'`, enlazado a su
  nota (`block.note`), y **añadido al `block_order`** de la nota — la lista ordenada que define
  cómo se renderiza el cuerpo. El orden de la lista es el orden de lectura.
- **Fin.** La nota tiene un cuerpo compuesto de bloques, cada uno con identidad propia y
  vectorizable por separado.

### WF-4 — Anclaje jerárquico (`part_of`, padre único, replace-on-write)

- **Disparador.** Una propuesta declara un edge `part_of` (p.ej. una tarea cuelga de un
  proyecto).
- **Pasos.**
  1. El edge **exige `anchored: true`** en el payload: el agente afirma con ello que *el
     usuario dijo explícitamente* ese padre. Sin `anchored`, el commit lo **rechaza**.
  2. Como una nota tiene **un solo padre**, si la nota ya colgaba de otro padre, el commit
     **retira el padre anterior en la misma transacción** antes de crear el nuevo
     (replace-on-write). El usuario no tiene que declarar la retirada a mano.
  3. El motor verifica que la cadena de `part_of` resultante **no forme ciclos** (sobre el
     grafo "tal y como quedará": existentes ± retiradas ± nuevos con replace aplicado).
- **Fin.** La nota cuelga de exactamente un padre; el reparent queda registrado.
- **Caminos de error.** `part_of` sin `anchored` → rechazo; un ciclo (p.ej. A→B→A) → rechazo;
  un segundo padre simultáneo es estructuralmente imposible (índice UNIQUE sobre el extremo
  hijo).

### WF-5 — Declarar un bloqueo o una mención

- **Disparador.** Una propuesta declara `blocked_by` (con `reason?` opcional) o `mentions`.
- **Pasos.** `blocked_by` enlaza una nota con aquello que la bloquea (otra nota **o** un
  bloque), y registra `since` (cuándo empezó el bloqueo) y opcionalmente `reason`. `mentions`
  enlaza débilmente cualquier par nota/bloque ↔ nota/bloque cuando la relación es **ambigua o
  no merece un edge más específico**.
- **Fin.** Existe la relación, navegable y única para ese par.
- **Regla.** No puede haber dos edges del mismo tipo entre la misma pareja (UNIQUE sobre el
  par): re-declararlo no duplica.

### WF-6 — El informe-block como interpretación trazable

- **Disparador.** Cualquier procesamiento de inbox o corrección produce **al menos un**
  informe-block (`block_kind = 'narrative'`).
- **Pasos.**
  1. El informe-block se redacta como narrativa breve que **documenta la interpretación**
     entre la evidencia y la topología.
  2. Se enlaza a las notas de las que **habla** con `about`, y a las notas que **afecta** con
     `affects` (cada `affects` lleva un `action`: `created | updated | state_changed | linked
     | archived`, y `summary?`).
  3. Se enlaza a los raws de los que **deriva** con `derived_from`, anotando la
     `transformation` (`verbatim | extracted | summarized | inferred`) — cómo de literal o
     inferida es la derivación.
- **Fin.** Queda una pieza interpretativa que cualquier consulta puede citar: separa *lo que
  el usuario dijo* de *lo que se infirió*, y conecta evidencia → interpretación → notas.

### WF-7 — Marcar/mover/soltar un MIT

- **Disparador.** El usuario decide su(s) foco(s) del día (1-3). **Nunca** lo decide el
  agente por iniciativa.
- **Pasos.** Marcar = `mit_for: '<día>'`. Mover a otro día = `mit_for: '<otro-día>'`. Soltar =
  `mit_for: null` (limpia el valor vivo). Todo vía propuesta aprobada; la fecha se normaliza a
  medianoche UTC del día.
- **Fin.** La nota es (o deja de ser) MIT de ese día. Soltar borra el valor *vivo* pero **no
  el histórico**: cada asignación/movimiento/limpieza queda en los payloads commiteados y
  `mit_history` reconstruye el timeline (assigned → moved → cleared).
- **Regla de visibilidad.** Un MIT vencido y no resuelto **no se borra automáticamente** al
  pasar el día: sigue visible (la UI lo muestra en ámbar) hasta que el usuario lo dispone.

### WF-8 — Aplazar (tickler) y resurgir

- **Disparador.** El usuario dice "no me lo enseñes hasta X" sobre una nota activa.
- **Pasos.** Se pone `defer_until: '<X>'`. La nota **sigue en su estado** (típicamente
  `ACTIVE`): no cambia a WAITING ni a SOMEDAY. Solo **desaparece del radar activo** mientras
  `defer_until` esté en el futuro.
- **Fin.** La nota está dormida. Al llegar el día, **resurge** automáticamente en el radar
  (la condición del radar la vuelve a incluir). Soltar el aplazamiento = `defer_until: null`
  (resurge ya).

### WF-9 — Retractación auditada (el único borrado)

- **Disparador.** Un ingest equivocado, una corrección, o un "olvida esto" del usuario.
- **Pasos.**
  1. Se invoca `retract` con ids explícitos (`raw_capture` / `note` / `block`) y/o por origen
     de raw (`source_kind` / `source_ref`). Otras tablas se rechazan.
  2. Por defecto (`dry_run: true`) **previsualiza** qué se borraría sin tocar nada.
  3. Con `dry_run: false`, en **una transacción atómica**: borra los registros; **cascada
     acotada** — borrar una nota borra los bloques **descriptivos** que posee (no pueden
     sobrevivir a su nota) y los quita de su `block_order`; borrar un bloque lo poda del
     `block_order` de su nota; borrar un raw **no** cascadea a los bloques derivados (un bloque
     puede derivar de varios raws). Todo registro borrado arrastra **todos sus edges
     incidentes**, en las seis tablas de edges, sin dejar edges colgantes.
  4. Emite un `agent_event` de tipo `retracted` (intención) mientras el changefeed guarda el
     diff exacto (estado).
- **Fin.** El registro y sus relaciones desaparecen del grafo vivo, con rastro auditable.
- **Camino de error / seguridad.** La primera llamada nunca borra (preview obligatorio);
  borrar un narrativo (`note = NONE`) nunca se cascadea desde una nota.

## 6. Functional Rules & Constraints

### 6.1 La máquina de estados ZTD

`note.state` solo puede tomar uno de **seis** valores; el motor rechaza cualquier otro
(ASSERT). El default al crear es **`CLARIFIED`**.

| Estado | Significado para el usuario |
|---|---|
| `CLARIFIED` | Procesada y entendida, pero aún no en marcha. Es el estado por defecto y el de reposo de v2.1-lite (casi todo puede vivir aquí). |
| `ACTIVE` | En marcha ahora. Es trabajo vivo. |
| `WAITING` | Bloqueada por algo **externo** (espera respuesta, depende de otro). Distinto de "aplazada": aquí hay un bloqueo, no un snooze. |
| `SOMEDAY` | Algún día / quizá. Sin fecha, sin compromiso. |
| `DONE` | Terminada. |
| `ARCHIVED` | Retirada de la operación sin borrarla (queda como memoria). |

**Transiciones.** El esquema **no codifica un grafo de transiciones permitidas**: cualquier
estado válido puede pasar a cualquier otro estado válido mediante una propuesta aprobada (el
único muro es el enum). Las transiciones *naturales* que el producto espera, en prosa:

```text
            (alta)
              │
              ▼
   ┌──────► CLARIFIED ──────────────┐
   │          │   ▲                 │
   │   (ponerse a ello)             │ (aparcar)
   │          ▼   │                 ▼
   │        ACTIVE ◄───────────► SOMEDAY
   │        │  │ ▲                  │
   │  (bloqueo   │ (se desbloquea)  │ (rescatar)
   │   externo)  │                  │
   │        ▼  │ │                  │
   │      WAITING ──────────────────┘
   │          │
   │     (completar)
   │          ▼
   └──────►  DONE ───────► ARCHIVED
                (retirar de operación)
```

> Esta es la lectura de producto de los estados; el código no la fuerza arista a arista. La
> condición real que filtra "lo vivo" es la del radar (6.2), no una tabla de transiciones.

**Ortogonalidad clave.** El estado y los ejes temporales son **planos distintos**:
`defer_until` (aplazamiento de visibilidad) **no** es un estado y no cambia el estado; una
tarea aplazada sigue `ACTIVE`. `WAITING` (bloqueo externo) y `SOMEDAY` (sin fecha) son estados;
`defer_until` es un snooze. No confundirlos (doctrina, "Tres ejes temporales").

### 6.2 El radar activo y la exclusión de notas dormidas

La superficie operativa viva (`daily_radar`) muestra exactamente las notas que cumplen:

```text
state ∈ {ACTIVE, WAITING, CLARIFIED}   AND   (defer_until IS NONE OR defer_until <= hoy)
```

Consecuencias para el usuario:

- `DONE`, `SOMEDAY` y `ARCHIVED` **nunca** aparecen en el radar (no son "lo vivo").
- Una nota con `defer_until` en el **futuro** está **dormida**: invisible en el radar hasta que
  llega su fecha, momento en que **resurge** sin intervención.
- Las vencidas por deadline (`due_at < hoy` y estado no `DONE`/`ARCHIVED`) y los MITs vencidos
  siguen visibles hasta que el usuario los dispone (no hay borrado automático).

### 6.3 Los tres ejes temporales (ortogonales)

`note` tiene tres campos fecha **top-level, indexados, día-granulares**, todos normalizados a
**medianoche UTC del día escrito**. **Ninguno** va dentro de `metadata`.

| Campo | Eje | Significado | Qué dispara |
|---|---|---|---|
| `mit_for` | prioridad | "el foco de *este* día" (1-3/día) | la vista de MITs |
| `due_at` | compromiso | vencimiento **duro**: "tiene que estar para X" | *vencida por deadline* |
| `defer_until` | tickler | "no me lo enseñes hasta X" | oculta del radar hasta el día; luego resurge |

Son independientes: una tarea puede ser MIT hoy, vencer el viernes y no tener defer; o estar
aplazada a la semana que viene (invisible hasta entonces). Poner `null` en cualquiera lo
**limpia** (el commit lo traduce a `SET NONE`); omitirlo lo deja intacto.

### 6.4 MITs (Most Important Tasks)

- **Los decide el usuario, nunca el agente por iniciativa.** El servidor acepta cualquier
  `mit_for` (es **barandilla**, no muro): el agente propone candidatas con contexto, pero no
  marca MITs solo.
- **Convención 1-3/día** (ZTD: "si todo es importante, nada lo es"). Es **barandilla
  deliberada**, no recuento enforced: si el usuario quiere 5, se le recuerda una vez y se
  respeta.
- `mit_for` es **top-level indexado**, **nunca dentro de `metadata`**.
- Mover = nuevo `mit_for`; soltar = `mit_for: null`; siempre vía propuesta aprobada.
- No se borra automáticamente al pasar el día: un MIT vencido sigue visible (ámbar) hasta
  disposición consciente.
- El histórico **no se pierde** al soltar: vive en los payloads commiteados y se reconstruye
  con `mit_history` (fuente de verdad de rachas). No se consulta `mit_for` para historia.

> El *coaching* de los MITs (cuándo invitarlos, la pedagogía 1-3) pertenece a
> `rituals-and-coaching`. Aquí solo el eje/campo/regla.

### 6.5 Edges: reglas estructurales

- **Padre único en `part_of`** *(muro)* — una nota cuelga de **una sola**. Garantizado por un
  índice UNIQUE sobre el extremo hijo; declarar un nuevo padre **reemplaza** el anterior en la
  misma transacción.
- **`part_of` exige `anchored: true`** *(muro de servidor)* — un `part_of` sin `anchored` se
  **rechaza**. Encarna la prohibición de "no asumir el padre por el contexto reciente": el
  agente solo lo ancla cuando el usuario lo dijo explícitamente (que de verdad lo dijera es,
  además, una **barandilla**: el `anchored` lo escribe el agente).
- **`part_of` acíclico** *(muro de servidor)* — el commit verifica que la jerarquía no forme
  ciclos.
- **Un edge por par `(in, out)`** *(muro)* — UNIQUE en cada tabla de edge; re-declarar no
  duplica.
- **Tipos de extremos autorizados** *(muro)* — `part_of`: nota→nota. `blocked_by`:
  nota→(nota|bloque). `mentions`: (nota|bloque)→(nota|bloque). `about`: bloque→nota.
  `affects`: bloque→nota. `derived_from`: bloque→raw.
- **Enums de los edges con datos** *(muro)* — `affects.action` ∈ `{created, updated,
  state_changed, linked, archived}`; `derived_from.transformation` ∈ `{verbatim, extracted,
  summarized, inferred}` (o vacío).
- **Trace-edges append-only** — `derived_from`, `about`, `affects` no se retiran (son
  procedencia). `part_of` se reemplaza por replace-on-write; `blocked_by` y `mentions` se
  retiran explícitamente vía el inverso de la lista de edges. (Mecánica → `processing-...`.)
- **`mentions` es el fallback deliberado** — ante una relación ambigua, se usa `mentions`
  antes de inventar un edge nuevo.

### 6.6 Field vs edge (cuándo cada uno)

```text
Si quieres navegarlo            → edge.
Si solo lo lees o filtras       → field.
Si explica causalidad           → edge con metadata.
Si no sabes para qué query sirve → no lo metas todavía.
```

Por eso prioridad/compromiso/visibilidad son **campos** (`mit_for`/`due_at`/`defer_until`: se
leen y filtran), mientras que jerarquía/bloqueo/procedencia son **edges** (se navegan). El
estado es campo; el "de qué deriva" es edge.

### 6.7 Asimetría de iniciativa (prohibiciones del modelo)

- **No se introducen tipos, estados ni edges nuevos por iniciativa del agente** —ni en
  conversación (barandilla) ni en runtime (muro: los enums los hace cumplir el esquema). El
  vocabulario es fijo: 8 tipos, 6 estados, 6 edges.
- **No se topologiza automáticamente sin revisión del usuario** (barandilla acotada por el
  preview obligatorio del commit).
- **No se reintroduce vocabulario legacy** (`note`/`report` como tipos, edges `supports` /
  `refutes` / `authored_by`): esas tablas y slugs ya **no existen** (muro de facto).

## 7. Data Concepts

El corazón de esta spec: el glosario de conceptos que el usuario percibe.

### 7.1 Nota (`note`)

Una **cosa con identidad** dentro del sistema del usuario. Atributos perceptibles:

- **Tipo** (`type`) — uno de ocho (§7.2). Dice *qué clase de cosa* es.
- **Título** (`title`) — su nombre.
- **Estado** (`state`) — su punto en el ciclo de vida ZTD (§6.1).
- **Cuerpo** — la secuencia ordenada de sus bloques descriptivos (`block_order`); la nota
  **no** tiene un campo de contenido monolítico, su texto vive en bloques (ADR-0009).
- **Ejes temporales** — `mit_for` (foco del día), `due_at` (deadline duro), `defer_until`
  (aplazamiento); los tres opcionales e independientes (§6.3).
- **`metadata`** — saco flexible para datos que solo se leen/filtran y no merecen campo propio
  ni edge (p.ej. `target_date`/`target_range` de un objetivo). **Nunca** alberga los ejes
  temporales.
- **`last_reviewed_at`** — cuándo se revisó por última vez (insumo del coaching y la semanal).
- **`source_kind` / `source_ref`** — origen, solo para notas que **no** vienen de un raw (p.ej.
  meta-memoria que crea el agente); para las derivadas de un raw, la procedencia vive en el
  edge `derived_from`, no aquí.

### 7.2 Los ocho tipos de nota (`note_type`)

El catálogo es fijo en v2.1-lite (sembrado en `seed.surql`; ADR-0013 + ADR-0022). Los slugs y
su significado para el usuario:

| Slug | Concepto | Qué es para el usuario |
|---|---|---|
| `task` | Tarea | Acción concreta y ejecutable. La unidad de "algo que hacer". |
| `project` | Proyecto | Outcome multi-paso; **contiene** tasks (vía `part_of`). |
| `area` | Área | Área de responsabilidad **continua** que no se termina (a diferencia de un proyecto). Raíz típica de la jerarquía. |
| `routine` | Rutina | Algo recurrente. La cadencia se gestiona fuera del esquema por ahora (sin motor RRULE). |
| `idea` | Idea | Concepto **generativo** que puede nutrir tasks/projects/objetivos sin exigir acción inmediata. (ADR-0022.) |
| `reference` | Referencia | Material de consulta **sin acción asociada** (URL, libro, paper). |
| `person` | Persona | Una persona. Las personas **atraviesan áreas**: por eso no se les asume padre por contexto. |
| `objetivo` | Objetivo | Meta **estratégica a largo plazo**; agrupa Projects vía `part_of`. Cubre la función estratégica que antes tenían los "Pilares" (ADR-0021/0022). |

> El slug es **`objetivo`** (español), deliberadamente. **No** se migra a `objective` sin
> decisión explícita del usuario (`docs/MODEL.md`; CLAUDE.md). El nombre visible es "Objetivo".
> Los tipos `note` y `report` del catálogo antiguo fueron **eliminados** del seed.

El catálogo es técnicamente un árbol editable (cada `note_type` admite `parent` y
`featured_fields`), pero en v2.1-lite se usa plano: ocho tipos hermanos.

### 7.3 Bloque (`block`)

La **unidad de contenido direccionable y vectorizable**. Markdown auto-contenido. Tiene dos
naturalezas según `block_kind`:

- **`descriptive`** — **pertenece a una nota** (`block.note`) y se renderiza como parte de su
  cuerpo a través del `block_order` de esa nota. Es el "párrafo con identidad" del cuerpo.
- **`narrative`** — el **informe-block** (§7.4). Puede **no** pertenecer a ninguna nota (vive
  por sí mismo) y se conecta al grafo por `about`/`affects` y a su evidencia por `derived_from`.

Otros atributos: `content` (el texto); `embedding`/`embedding_model`/`dimensions` (su vector
semántico, cuando está indexado — detalle de `retrieval-and-grounding`); `topologized_at`
(cuándo se topologizó un narrativo); y `kind` (la etiqueta ritual — pertenece a
`rituals-and-coaching`; aquí basta saber que un informe-block normal **no lleva `kind`**).

### 7.4 Informe-block (bloque narrativo) — la pieza central

Es **la interpretación aprobada**: el `block` con `block_kind = 'narrative'` que documenta el
puente entre la evidencia literal (los raws) y la topología (las notas y sus cambios). Su razón
de ser es que **entre el texto literal y el grafo debe existir una pieza interpretativa
auditable** (`docs/MODEL.md`). Cómo se relaciona, conceptualmente:

- **`about`** (bloque → nota) — sobre **qué sujetos** habla este informe.
- **`affects`** (bloque → nota) — qué notas **quedan afectadas y cómo**: cada `affects` lleva un
  `action` (`created | updated | state_changed | linked | archived`) y un `summary?`. Es el
  registro de "este informe justificó este cambio".
- **`derived_from`** (bloque → raw) — de qué **evidencia literal** sale, anotando la
  `transformation`: `verbatim` (literal), `extracted` (extraído), `summarized` (resumido),
  `inferred` (inferido). Permite separar siempre *lo que el usuario dijo* de *lo que se
  infirió*. Un informe puede derivar de **varios** raws si sintetiza un mismo asunto.

> Su **autoría/propuesta** (cómo se redacta y commitea dentro del payload) pertenece a
> `processing-proposals-and-commit`. Aquí se describe **qué es** y **cómo enlaza**.

### 7.5 Las relaciones (edges) como frases navegables

El usuario percibe los edges como **frases** entre cosas (`docs/MODEL.md`, "modelo mental"):

| Edge | Frase | Extremos | Datos que lleva |
|---|---|---|---|
| `part_of` | "X es parte de Y" | nota → nota | — (padre único; replace-on-write; exige `anchored`) |
| `blocked_by` | "X está bloqueada por Z" | nota → (nota \| bloque) | `since` (desde cuándo), `reason?` |
| `mentions` | "X menciona Z" | (nota\|bloque) → (nota\|bloque) | — (fallback deliberado ante ambigüedad) |
| `about` | "este informe trata sobre Y" | bloque → nota | — |
| `affects` | "este informe afecta a Y (cómo)" | bloque → nota | `action`, `summary?` |
| `derived_from` | "este informe deriva de este raw" | bloque → raw | `transformation?` |

Los tres primeros son la **topología de dominio** (jerarquía, dependencia, mención); los tres
últimos son la **traza de procedencia** del informe-block. La jerarquía `part_of` forma un
**bosque/árbol** (no un DAG): áreas → objetivos/proyectos → tareas.

### 7.6 Estado y ejes como conceptos distintos (recordatorio glosario)

- **Estado** = *en qué punto del ciclo está* la cosa (campo `state`, §6.1).
- **MIT** (`mit_for`) = *es mi foco de ese día* (prioridad).
- **Deadline** (`due_at`) = *tiene que estar para ese día* (compromiso; genera "vencida").
- **Aplazamiento** (`defer_until`) = *no me lo enseñes hasta ese día* (visibilidad; resurge).

Que algo sea MIT hoy ≠ que venza hoy ≠ que no quieras verlo hasta hoy. Y "aplazado" ≠ "WAITING"
≠ "SOMEDAY".

## 8. Graphical Representation

Iniciativa headless (el plano de Interpretación se mutíta vía MCP; su visualización pertenece
al `dashboard-ui` y `retrieval-and-grounding`). Dos diagramas mínimos como apoyo conceptual.

**Anatomía del plano de Interpretación:**

```text
        raw_capture (evidencia, Plano 1)
              ▲
              │ derived_from (transformation)
              │
        ┌─────┴──────────────────────────┐
        │  block (narrative) = INFORME    │
        └───┬───────────────────┬─────────┘
       about│              affects│ (action, summary)
            ▼                     ▼
        ┌───────┐  part_of   ┌───────┐  blocked_by  ┌───────┐
        │ note  │◄───────────│ note  │─────────────►│note/  │
        │(area) │ (1 padre)  │(proj) │ (since,reason)│block │
        └───────┘            └───┬───┘               └───────┘
                          block_order│
                                     ▼
                              block (descriptive)  ← cuerpo de la nota
```

**Estados ZTD (vista de producto):** ver el diagrama ASCII en §6.1.

## 9. Restrictions & Tradeoffs

- **Vocabulario congelado a propósito.** Ocho tipos, seis estados, seis edges. v2.1-lite
  recorta automatismo y vocabulario; ampliar exige decisión explícita del usuario y, antes,
  el "ejercicio de 10 conversaciones" (`docs/MODEL.md`).
- **Sin máquina de transiciones de estado.** El modelo no impide pasar de cualquier estado a
  cualquier otro; el único filtro de "lo vivo" es la condición del radar. Tradeoff:
  flexibilidad sobre garantía de flujo.
- **`mit_for` es una sola celda viva.** Soltar borra el valor presente; el histórico solo
  existe reconstruido desde el log (`mit_history`). Tensión abierta reconocida en
  `docs/MODEL.md`.
- **Cadencia de rutinas fuera del esquema.** `routine` existe como tipo, pero **no hay motor
  RRULE**: la recurrencia se gestiona conversacionalmente, no se modela.
- **Padre único y `anchored` son rígidos a propósito.** Una nota no puede colgar de dos
  padres, y nada cuelga de un padre que el usuario no haya nombrado explícitamente. Protege
  contra topología fabricada por contexto, a costa de exigir anclaje explícito.
- **`blocked_by` admite bloque como destino**, no solo nota: el esquema permite bloqueo por un
  bloque narrativo concreto, aunque el caso habitual es nota→nota.
- **Trace-edges irreversibles.** La procedencia (`derived_from`/`about`/`affects`) no se
  retira; corregir procedencia equivocada pasa por retractar el bloque, no por desenlazar.
- **Retractar es el único borrado** y tiene cascada acotada: borrar una nota se lleva sus
  bloques **descriptivos** (no los narrativos), y borrar un raw no se lleva los bloques que
  derivan de él. Esto puede dejar informe-blocks vivos cuya evidencia parcial se retiró
  (decisión deliberada: un informe puede derivar de varios raws).
- **Slug en español (`objetivo`).** Mezcla deliberada de idioma en los identificadores; no se
  normaliza sin migración explícita.

## 10. Open Questions & Assumptions

**Asunciones (etiquetadas):**

- **A1.** El diagrama de transiciones de estado de §6.1 es una **lectura de producto**, no un
  contrato: el código solo hace cumplir el enum, no las aristas. *(Evidenciado: el esquema no
  tiene tabla de transiciones; la única condición real es la del radar.)*
- **A2.** Se asume que el catálogo de tipos se usa **plano** (ocho hermanos) en v2.1-lite,
  pese a que `note_type` admite `parent`/`featured_fields`. *(Evidenciado por el seed; el árbol
  editable existe pero no se puebla con jerarquía.)*
- **A3.** Se toma `daily_radar` como **definición canónica** de "superficie activa" para la
  exclusión de notas dormidas. *(Evidenciado en `views.ts`: `state IN ['ACTIVE','WAITING',
  'CLARIFIED'] AND (defer_until IS NONE OR defer_until <= time::now())`.)*

**Preguntas abiertas / Not evidenced:**

- **Q1.** El esquema permite `kind` legacy (`plan_day`/`review_day`/`plan_week`/`review_week`)
  en bloques históricos, pero su semántica ritual pertenece a `rituals-and-coaching`. **Not
  evidenced aquí** cómo se renderizan esos kinds legacy en la UI.
- **Q2.** `note_type.featured_fields` existe (lista de campos destacados por tipo) pero **no se
  evidencia** consumo en este plano (¿qué los lee, qué hace la UI con ellos?). Posible gancho
  futuro sin uso actual.
- **Q3.** No hay validación de que un `objetivo` solo agrupe `project`s, ni de que un `project`
  solo contenga `task`s: la jerarquía `part_of` es **type-agnostic** (cualquier nota puede
  colgar de cualquier nota). La semántica "área → objetivo/proyecto → tarea" es **convención**,
  no enforced. *(Evidenciado: `part_of` es nota→nota sin restricción de tipo.)*
- **Q4.** El histórico de `due_at`/`defer_until` **no** tiene una herramienta equivalente a
  `mit_history`: soltar un deadline o un aplazamiento borra el valor vivo y solo queda en el
  log crudo. **Not evidenced** una reconstrucción dedicada para esos dos ejes.
- **Q5.** La tensión "soltar un MIT borra que *fue* MIT ese día" está reconocida como decisión
  de producto **pendiente** en `docs/MODEL.md` (ligada a due/defer dates); `mit_history`
  mitiga pero no la cierra formalmente.
