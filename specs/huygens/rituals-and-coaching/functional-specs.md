# Huygens — Rituals & Coaching — Functional Specification

> Initiative: `rituals-and-coaching`. App: `huygens`.
> Documento funcional derivado de la implementación (ingeniería inversa). Describe el comportamiento real, no una versión idealizada.
> Cross-refs a iniciativas hermanas: `capture-and-inbox`, `processing-proposals-and-commit`, `graph-model-notes-and-topology`, `retrieval-and-grounding`, `conversational-agent-worker`, `dashboard-ui`, `audit-provenance-and-trust`.

## 1. Summary

Huygens es una memoria estructurada personal para Rubén. Esta iniciativa cubre dos piezas entrelazadas que viven sobre el resto del sistema: los **rituales** y la **capa de coaching**.

Hay **exactamente dos rituales**, y solo dos. **La jornada (`kind: 'day'`)** es el ritual diario único —normalmente al empezar el día— que *asienta lo que quedó colgado* (disponer de MITs vencidas y deadlines incumplidos: hecho / sigue / mover / soltar) y *orienta el día* (elegir MITs si el usuario quiere), cerrando y planificando sin distinguirlos. **La semana (`kind: 'week'`)** es la revisión semanal de mantenimiento que repasa lo que se acumula fuera del día: WAITING, notas dormidas que resurgen, deadlines entrantes, SOMEDAY, lo nunca revisado y el inbox diferido. Cada ritual es, físicamente, un **informe-block** narrativo etiquetado con `kind`; no introduce ninguna entidad nueva: comparte el mismo ciclo evidencia → propuesta → commit que cualquier otro informe. Lo único que añade el `kind` es que la **Bitácora** lo reconoce como ritual.

La **capa de coaching** define que el agente que conduce estos rituales no es una secretaria pasiva sino un *coach* que enseña el hábito ZTD (Zen To Done): invita a los rituales con iniciativa, externaliza el porqué de las buenas prácticas en el flujo (con micro-lecciones medidas), introduce un hábito a la vez (la rampa), y baja el volumen ante la indiferencia o la recaída — todo ello **sin fabricar ni mutar nunca un ritual por iniciativa**, y midiendo la madurez del usuario *leyendo el grafo*, nunca persistiendo un estado de coaching.

El límite de la iniciativa: aquí se especifican (a) el comportamiento conversacional y pedagógico de los dos rituales y (b) las **dos puertas de enforcement específicas del ritual** — que el commit exija aprobación explícita (`approved: true`) y que haya como máximo un ritual de cada tipo por período (un `day` por día natural de Madrid, una `week` por semana ISO de Madrid). El resto de la mecánica de propuesta/commit (preview obligatorio, payload, todo-o-nada) se da por hecho y vive en `processing-proposals-and-commit`.

## 2. Actors & Roles

- **Rubén (el usuario / aprendiz del hábito).** Único decisor. Aprueba los rituales, dispone de cada pendiente, elige sus MITs y define sus próximas acciones. Los "muros" del sistema son para el agente, no para él: el sistema es duro contra la mutación no autorizada y blando con cómo el usuario estructura su día.
- **El agente-coach.** Cualquier agente que use el MCP (Hermes/Claude Code en una sesión MCP completa, el worker del dashboard, etc.). Conduce el ritual siguiendo el *guion* del prompt correspondiente (`day` / `week` / `decompose_project`) bajo la doctrina operativa. Tiene **iniciativa alta para invitar y enseñar**, e **iniciativa nula para mutar/commitear** un ritual.
- **El servidor MCP (Huygens).** Hace cumplir las dos puertas duras del ritual (aprobación + unicidad por período) en `commit_proposal`. No ve la conversación: por eso la disciplina del `kind` y la asimetría de iniciativa son *barandillas* que solo el agente respeta.
- **El worker del dashboard (cliente sin commit).** Agente conversacional (Agno) que prepara propuestas pero **no tiene `commit_proposal`** en su toolset. Puede conducir e *invitar* a un ritual y dejar el draft listo, pero el commit lo hace el humano desde la UI. Detalle del worker → `conversational-agent-worker`.
- **La Bitácora (lector / superficie de reconocimiento).** Donde los informes con `kind` se reconocen como rituales y se leen cronológicamente. Su UI es hermana (`dashboard-ui`); aquí solo importa el *hecho funcional* de qué reconoce.

## 3. Goals & User Jobs

Objetivos de producto de esta iniciativa:

- **Que nada colgado se abandone en silencio.** Una MIT vencida o un deadline incumplido recibe una *disposición consciente* (hecho / sigue / mover / soltar) en la siguiente jornada, no se evapora.
- **Que el sistema no se pudra fuera del día.** La revisión semanal mantiene honestos los frentes que ninguna jornada mira (WAITING que ya no espera, SOMEDAY que merece promoción, dormidas que resurgen, inbox diferido).
- **Enseñar el hábito ZTD, no ejecutarlo por el usuario.** La disciplina diaria está *dormida, no rechazada*: el trabajo del coach es activarla enseñando, un hábito a la vez, sin crear dependencia.
- **Mantener la Bitácora limpia y auditable.** Un `kind` solo se pone dentro de su ritual; un `kind` mal puesto ensucia el registro, y por eso ante la duda no se pone ninguno.

Jobs-to-be-done por actor:

- **Rubén (jornada):** "al empezar el día, quiero cerrar lo de ayer que quedó suelto y decidir mi foco de hoy en una sola conversación."
- **Rubén (semana):** "una vez por semana, quiero un repaso de mantenimiento de todo lo que se acumula fuera del día."
- **Rubén (hábito):** "quiero que alguien me onboardee en el hábito; no quiero que me lo hagan, ni que me machaquen cuando lo ignoro."
- **El agente-coach:** "reconocer el momento de invitar un ritual; conducirlo fielmente; enseñar el porqué sin sustituir el juicio del usuario; medir su madurez leyendo el grafo."

## 4. Entry Points

- **Prompts-ritual servidos por el MCP** (el *guion* paso a paso de cada modo). Registrados como MCP prompts en `apps/mcp/src/lore-and-prompts.ts`:
  - `day` → `prompts/day.md` — la jornada.
  - `week` → `prompts/week.md` — la semana.
  - `decompose_project` → `prompts/decompose-project.md` — el gesto de coaching que desbloquea la jornada (descomponer un proyecto en su próxima acción accionable).
  - (`process_inbox` existe pero pertenece a `processing-proposals-and-commit`.)
- **La doctrina operativa**, servida como recurso `huygens://lore/operating-doctrine`. Gobierna por encima de los prompts: si un prompt y la doctrina se contradicen, **gana la doctrina**. Es la SSOT del comportamiento de coaching y de la disciplina de rituales.
- **`commit_proposal`** (tool del MCP) — la única puerta de mutación; es donde se hacen cumplir las dos puertas duras del ritual.
- **Invitación proactiva del agente** (asimetría de iniciativa): el agente *propone* el ritual en el momento correcto dentro de la conversación (no es un endpoint, es comportamiento).
- **Nudges de la Bitácora (dashboard)** — `ritualNudges(todayMadrid)` en `apps/dashboard/src/lib/bitacoraView.ts`. Como el agente no puede iniciar conversaciones, el dashboard surfacea la invitación: un *nudge* es una invitación, nunca un artefacto (no commitea nada). Es el sustituto runtime de la "invitación" de la doctrina.
- **Lecturas del grafo que miden madurez** (no mutan): `mit_history` (la racha de jornadas / timeline de MITs reconstruido desde el log de commits), `daily_radar` y el campo `last_reviewed_at`. Implementadas en `apps/mcp/src/tools/views.ts`.

## 5. Workflows

> Convención común a los dos rituales: **todas las partes son opcionales salvo el informe**; un frente vacío se salta sin ceremonia (no conviertas el ritual en interrogatorio). Toda mutación va siempre en **una sola propuesta**, repasada con `get_proposal` antes del commit, y commiteada solo con OK explícito.

### Workflow 1 — La jornada (`kind: 'day'`) — ritual diario único

**Trigger.** El usuario pide la jornada (asentar lo colgado + orientar el día), normalmente al empezar el día; *o* el agente la invita proactivamente al detectar que no hay jornada de hoy (ver Workflow 4). El árbol de decisión de la doctrina la clasifica explícitamente: "¿Pide la jornada…? → ritual day (`kind=day`, `approved:true`). Cierra y planifica sin distinguirlos."

**Pasos (guion de `prompts/day.md`):**

1. **Fija el día** (Madrid, `YYYY-MM-DD`). Comprueba que no haya ya una jornada (`kind: 'day'`) commiteada hoy; si la hay y es una corrección, retracta la anterior primero (ver alterno A).
2. **Asienta lo pendiente.** Trae el tablero con *tres ejes distintos* (todos con `state NOT IN ['DONE','ARCHIVED']`):
   - **MITs vencidas** (`mit_for` pasado): el foco de un día previo sin resolver.
   - **Deadlines vencidos** (`due_at` pasado): compromisos duros incumplidos — eje distinto del MIT, se nombra aparte.
   - **MITs de hoy** ya marcadas, si las hay.
   Cada pendiente recibe **la disposición del usuario, no la del agente**: hecho → `state:'DONE'` · sigue → `mit_for:'<hoy>'` · mover → `mit_for:'<fecha>'` · soltar → `mit_for: null`. Nada se abandona en silencio; tampoco se fuerza: si el usuario quiere dejar algo en ámbar, se queda en ámbar.
3. **Orienta el día.** Surfacea *candidatas* a MIT (no decide): tareas `ACTIVE` sin MIT (vía `get_hierarchy` o `daily_radar`), con su contexto, **excluyendo las dormidas** (`defer_until > hoy`). Señala las ligadas a un `objetivo` activo y los `due_at` cercanos. **El usuario elige; la convención es 1-3.** Si NO hay tareas accionables (solo proyectos), no fuerza: ofrece `decompose_project` primero (ver Workflow 3).
4. **Captura la voz del día.** Pide en una frase qué pasó / qué toca / cómo está y lo guarda con `capture` (`source_kind:'chat'`). Vale lo retrospectivo, lo prospectivo o ambos mezclados.
5. **Redacta la jornada** como block narrativo trazado a esa raw, etiquetado **`kind: 'day'`** (esto, y solo en este ritual). El texto refleja el caos del usuario con fidelidad (ayer, hoy, aprendizajes, energía — lo que haya).
6. **Propón** todo en *una sola propuesta* (informe + disposiciones + `mit_for`s — campos top-level, nunca en `metadata`) y **repásala con `get_proposal`** (el servidor exige el preview antes del commit).
7. **Commit solo con OK explícito** (`approved: true`). El servidor lo exige y rechaza una segunda jornada hoy. Las notas dispuestas quedan estampadas con `last_reviewed_at` automáticamente. Se audita con `get_proposal_changes`.

**Condición de fin.** Existe exactamente una jornada (`kind: 'day'`) commiteada para hoy; las notas dispuestas tienen su nuevo estado/`mit_for` y `last_reviewed_at`. La Bitácora la muestra como "Jornada".

**Alterno A — Corrección de una jornada ya commiteada.** Mientras la jornada errónea esté viva, un re-commit del mismo día se **rechaza** ("a day informe already exists for today"). La corrección documentada: `retract` del block-ritual anterior y luego re-commitear la corregida (la unicidad cuenta solo blocks *vivos*). Verificado en `test/ritual-commit.test.ts`.

**Alterno B — Sin tareas accionables.** Si al orientar el día solo hay proyectos sin próximas acciones, el agente NO inventa MITs: ofrece `decompose_project` ("antes de elegir foco, aterricemos un proyecto en una acción concreta") y luego retoma.

**Alterno C — El usuario no quiere MITs hoy.** No pasa nada: el paso 3 es opcional. La jornada puede consistir solo en asentar lo colgado + el informe.

**Error / abort.** Sin OK explícito (`approved` ausente o `false`) → `commit_proposal` lanza el error de aprobación y deja el draft intacto (re-commitable tras el OK). Sin preview previo → error de preview (ver `processing-proposals-and-commit`).

### Workflow 2 — La semana (`kind: 'week'`) — revisión semanal de mantenimiento

**Trigger.** El usuario pide la revisión semanal; *o* el agente la invita (domingo/lunes sin revisión — ver Workflow 4). Es mantenimiento del sistema, no planificación fina: las MITs se deciden cada día en la jornada, no aquí.

**Pasos (guion de `prompts/week.md`) — recorre los frentes; el usuario decide en cada uno:**

1. **Fija la semana** (Madrid, ISO lunes-domingo). Comprueba que no haya ya un `kind: 'week'` commiteado esta semana; corrección = retract + re-commit.
2. **WAITING** — ¿sigue esperando de verdad cada una? Las que ya no: ACTIVE, DONE o soltar.
3. **Dormidas** que resurgen esta semana (`defer_until` dentro de la semana entrante): recuérdaselas; ¿siguen teniendo sentido?
4. **Deadlines** de la semana entrante (`due_at`): ¿está encarrilado cada uno?
5. **SOMEDAY** — ¿alguna merece promoción a ACTIVE? ¿Alguna ACTIVE debería bajar a SOMEDAY o ARCHIVED? (Honestidad > optimismo.)
6. **Lo nunca revisado** — notas con `last_reviewed_at` viejo o ausente: un vistazo rápido por si algo se pudre en silencio.
7. **Inbox diferido** — raws en estado `deferred`: ¿procesar, ignorar, seguir esperando?
8. **Captura el pulso de la semana** (una o dos frases) con `capture`, redacta el informe **`kind: 'week'`** trazado a esa raw, **propón** todo en una sola propuesta, **repásala con `get_proposal`** y commitea **solo con `approved: true`**. Las notas dispuestas quedan con `last_reviewed_at` estampado.

**Condición de fin.** Existe exactamente una revisión (`kind: 'week'`) commiteada para esa semana ISO; los frentes revisados quedan dispuestos y con `last_reviewed_at`. La Bitácora la muestra como "Revisión de la semana".

**Alterno / error.** Idénticos a los de la jornada pero por semana ISO: corrección = retract + re-commit; segundo `week` la misma semana → rechazado ("a week informe already exists for this week"); sin `approved: true` → rechazado. Frentes vacíos se saltan sin ceremonia.

### Workflow 3 — Descomponer un proyecto en su próxima acción (gesto de coaching que desbloquea la jornada)

**Trigger.** En la jornada no hay tareas accionables de las que elegir foco (solo proyectos), o el usuario quiere aterrizar un proyecto. *No es un ritual diario* (no lleva `kind`).

**Pasos (guion de `prompts/decompose-project.md`):**

1. **Elige un proyecto vivo sin (o con pocas) tareas accionables** (`project` ACTIVE con 0 hijos `task` en ACTIVE/CLARIFIED), uno, con su contexto.
2. **Enseña el concepto en una frase** ("un proyecto no se 'hace'; se hace su próxima acción física") y **modela un ejemplo en voz alta**, pero deja que el usuario diga la suya.
3. **El usuario decide la próxima acción** (verbo + objeto concreto, no "avanzar X").
4. **Captura** su respuesta con `capture` (`source_kind:'chat'`).
5. **Propón** una `note_create` tipo `task` (`state:'ACTIVE'`) colgada del proyecto con un edge `part_of` **`anchored: true`** (el padre es inequívoco) + informe-block trazado a la raw. Repasa con `get_proposal`.
6. **Commit solo con su OK**; audita con `get_proposal_changes`.
7. **Cierra puente al hábito:** "ya tienes una acción concreta — mañana puede ser tu MIT." NO marca `mit_for` aquí (eso es la jornada); solo deja el terreno listo.

**Fin.** Existe una `task` ACTIVE colgada del proyecto. **Una acción por proyecto, un proyecto por vez** (no descomponer 19 de golpe — abruma).

### Workflow 4 — Invitación proactiva al ritual (asimetría de iniciativa)

**Trigger / regla.** Es la regla de coaching *que más importa*. El agente **invita** con iniciativa pero **nunca fabrica/muta/commitea** un ritual por iniciativa:

```text
INVITAR al ritual   → SÍ, con iniciativa. Eres un coach, no un secretario pasivo.
MUTAR / commitear   → NUNCA por iniciativa. Solo con OK explícito del usuario.
```

**Momentos de invitación:**

- **Empieza el día y no hay jornada de hoy** → propónla ("no hay jornada de hoy, ¿la hacemos?").
- **Domingo o lunes sin revisión semanal** → propónla.

**Sustituto runtime (dashboard).** Como el agente no inicia conversaciones, `ritualNudges(todayMadrid)` materializa la invitación:
- Nudge `day` si no hay informe de hoy con kind en `{day, plan_day, review_day}` (los legacy cuentan como jornada existente).
- Nudge `week` **solo** domingo (weekday 0) o lunes (weekday 1) y **solo** si no aterrizó ninguna revisión (`{week, plan_week, review_week}`) en los últimos 7 días (para que una revisión del domingo no re-nudgee el lunes).

**El error a evitar — la "jornada fantasma".** Redactar o commitear una jornada porque "parecía el momento", sin que el usuario la pidiera. El fallo típico es la **asimetría invertida**: el agente *no* invita (el usuario tiene que acordarse) pero *sí* commitea de más. Debe ser al revés.

**Fin.** El usuario decide si entra al ritual (→ Workflow 1/2) o lo ignora (→ Workflow 5).

### Workflow 5 — Andamia, no sustituyas (la rampa pedagógica y el anti-nagging)

**Trigger.** Cualquier interacción de ritual o coaching: el agente enseña el hábito en el flujo, sin tocar el grafo.

```text
ENSEÑAR (con palabras)  → SÍ, iniciativa ALTA. Nunca toca el grafo.
SUSTITUIR su juicio     → NO. Elegir/justificar sus MITs por él crea dependencia.
```

**Reglas de la capa:**

- **Externaliza el porqué EN EL FLUJO**, no como manual. Al surfacear MITs, di *por qué* 1-3 ("si todo es prioritario, nada lo es"); al asentar lo colgado, *por qué* la disposición consciente.
- **Máximo UNA micro-lección por interacción, y solo la primera vez que aparece cada concepto.** Después se asume aprendido; se re-enseña *solo tras una recaída*.
- **Un hábito a la vez (la rampa):** reconoce su victoria → descompón un proyecto en su próxima acción → **UN** MIT/día → la jornada completa → primer objetivo → ejes + semanal → destete. (En la jornada: si no hay racha en `mit_history`, guía a UNO solo; sube cuando se sostenga.)
- **Anti-nagging:** tras un par de invitaciones ignoradas, **baja el volumen, no lo subas.** En recaída, recupera con calidez y **baja el listón** (vuelve a 1 MIT).
- **Enseñar a reflexionar** (en la jornada): como mucho UNA pregunta de aprendizaje según el día ("¿qué te frenó?", "¿el foco era el correcto?", "¿qué repetirías?"), y solo la primera vez.

**Medición de madurez — leyendo el grafo, nunca persistiendo.** La madurez (racha de jornadas, hábito sostenido) se mide *leyendo* `mit_history` (racha/timeline de MITs reconstruido desde el log) y `last_reviewed_at`, no escribiendo un "estado de coaching". Persistir un coaching-state sería **telemetría que ensucia el dominio y mutaría sin mandato**. (Confirmado: no existe ninguna tabla/campo de coaching-state en el código.)

**Fin.** El usuario avanza un peldaño de la rampa, o el coach baja el volumen — sin ninguna mutación derivada de la enseñanza.

## 6. Functional Rules & Constraints

> Cada regla lleva su tipo de enforcement: **muro** (el sistema lo impide; si lo intentas, falla) vs **barandilla** (existe solo si el agente la respeta; la violación solo es detectable a posteriori en el audit trail). Ante un muro puedes apoyarte en el error; ante una barandilla el agente es el único enforcement.

**Puertas duras específicas del ritual (muro de servidor, en `commit_proposal`):**

- **Aprobación explícita.** Commitear un informe de ritual (`kind: 'day'`/`'week'`) **exige `approved: true`**. Sin él (ausente o `false`) `commit_proposal` lanza un error de aprobación y no consume el draft (re-commitable tras el OK). Un informe de proceso normal (sin kind) no necesita aprobación y ignora esta puerta. Enforced en `assertApprovalForRituals` / `assertRitualCommitAllowed` (`apps/mcp/src/tools/proposal/commit.ts`).
- **Uno por período.** Como máximo **una jornada (`day`) por día natural de Madrid** y **una revisión (`week`) por semana ISO de Madrid**. El servidor **rechaza** el duplicado ("a day informe already exists for today" / "a week informe already exists for this week").
  - Las fronteras son **DST-correctas**: se calculan con `Europe/Madrid` vía `Intl` (`apps/mcp/src/madrid-time.ts`), no con un `+ 2h` fijo (que en invierno, CET = UTC+1, desplazaba el límite una hora y hacía que una jornada de las 23:30 contara para el día siguiente). Verificado en `test/madrid-time.test.ts` (verano CEST, invierno CET, cambios de hora de primavera, domingo de noche en la semana que cierra).
  - La unicidad **cuenta solo blocks vivos**: el `kind` vive en el payload inmutable de la propuesta, así que tras un `retract` el payload aún lo lleva — el chequeo cruza con la tabla `block` para que la corrección (retract + re-commit) funcione mientras un genuino segundo ritual del período se rechaza. Verificado en `test/ritual-commit.test.ts`.
  - `day` y `week` **pueden coexistir** en el mismo período (kinds distintos).
- **Corrección = retract + re-commit.** No se acumulan jornadas: para corregir un ritual ya commiteado, primero `retract` de su block, luego re-commit del mismo kind.
- **Preview obligatorio antes del commit** (común a todo commit, no solo rituales): `get_proposal` estampa `previewed_at`; `update_proposal` lo invalida; `commit_proposal` lo exige. → detalle en `processing-proposals-and-commit`.

**Disciplina del `kind` (barandilla + muro de validación):**

- **Etiqueta un informe con `kind` solo dentro del ritual correspondiente, invocado explícitamente por el usuario.** El servidor no puede saber si *hubo* ritual; solo valida `approved` y la unicidad — por eso "kind solo dentro del ritual" es **barandilla** (el agente es el único enforcement; la Bitácora lo expone).
- **Ante la duda, NO pongas kind.** Un informe sin kind es un informe de proceso normal y **nunca es un error**. Un kind mal puesto **sí** lo es (ensucia la Bitácora). Asimetría de riesgo deliberada.
- **Solo `day` y `week` son válidos en propuestas nuevas (muro de validación).** `InformeKindSchema = z.enum(['day','week'])` valida `narrative_blocks[].kind`; los kinds legacy (`plan_day`/`review_day`/`plan_week`/`review_week`) se **rechazan en `create_proposal`** (`apps/mcp/src/domain.ts`, `apps/mcp/src/tools/proposal/schemas.ts`; verificado en `test/ritual-commit.test.ts`). Siguen siendo *legibles* en blocks/payloads históricos y en la Bitácora.

**Asimetría de iniciativa (barandilla pura, comportamiento):**

- **Invitar a un ritual: SÍ, con iniciativa.** Empieza el día sin jornada → propónla; domingo/lunes sin revisión semanal → propónla.
- **Fabricar / mutar / commitear un ritual: NUNCA por iniciativa.** Solo con OK explícito. La "jornada fantasma" (commiteada sin que el usuario la pidiera) es el error a evitar.

**Coaching (barandilla pura):**

- **No sustituir el juicio del usuario.** El agente surfacea candidatas a MIT y modela ejemplos, pero el usuario elige/decide. Elegir o justificar sus MITs por él crea dependencia.
- **Máximo UNA micro-lección por interacción**, solo la primera vez de cada concepto; re-enseñar solo tras recaída.
- **Un hábito a la vez** (la rampa).
- **Anti-nagging:** tras un par de invitaciones ignoradas, bajar el volumen; en recaída, calidez + bajar el listón (volver a 1 MIT).
- **Medir la madurez leyendo el grafo, nunca persistiendo un coaching-state** (sería mutación sin mandato + dominio sucio).

**MITs — solo el COACHING aquí** (la mecánica del campo/eje → `graph-model-notes-and-topology`):

- **Los decide el usuario; el agente nunca marca MITs por iniciativa.** El servidor acepta cualquier `mit_for`: es **barandilla**, el agente es el único enforcement.
- **Convención ZTD: 1-3 MITs por día.** Es **barandilla deliberada, no muro**: si el usuario quiere 5, son 5 — díselo una vez y respeta su decisión.
- **Al menos una debería colgar de un Objetivo activo** (convención, no enforced).
- Una MIT vencida no resuelta **no se borra automáticamente** al pasar el día: sigue visible (en ámbar) hasta que el usuario la dispone — el punto natural es la siguiente jornada, que empieza asentando lo colgado.

**Efecto secundario del commit de ritual:** las `note_updates` de un ritual (jornada/semana, y los legacy `review_*`) son *disposiciones*, así que el commit estampa `last_reviewed_at = time::now()` en ellas (asentar una nota = revisarla). Esto hace que el frente "lo nunca revisado" de la semana funcione de verdad. Implementado en `CommitTx` (`commit.ts`); verificado en `test/ritual-commit.test.ts`.

## 7. Data Concepts (glosario)

- **Ritual.** Uno de los dos momentos *especiales y deliberados* (jornada / semana). No es el modo por defecto: por defecto se captura o se procesa **sin ningún `kind`**. Físicamente es un informe-block con `kind`.
- **Informe-block.** Un `block` narrativo (`block_kind = 'narrative'`) que documenta la interpretación entre la evidencia literal y la topología, trazado a sus raws. Un ritual *es* un informe-block; lo único que añade es el `kind`. El texto puede ser tan caótico como el usuario quiera: la estructura vive en las mutaciones acompañantes (`mit_for`, estados, `affects`), no en la forma de la narrativa.
- **`kind`** (campo de `block`, opcional). La etiqueta de ritual: `'day'` (la jornada) o `'week'` (la revisión semanal). Valores legacy (`plan_day`, `review_day`, `plan_week`, `review_week`) solo en blocks/payloads históricos. Es lo único que hace que la Bitácora reconozca un informe como ritual.
- **La jornada (`kind: 'day'`).** El ritual diario único: asienta lo colgado (MITs vencidas + deadlines incumplidos) y orienta el día (MITs), cerrando y planificando **sin distinguirlos**. Sustituye al antiguo par `plan_day`/`review_day`.
- **La semana (`kind: 'week'`).** La revisión semanal de mantenimiento: WAITING, dormidas que resurgen, deadlines entrantes, SOMEDAY, lo nunca revisado, el inbox diferido. Sustituye al antiguo par `plan_week`/`review_week`.
- **MIT (Most Important Task).** El foco de *este* día; se materializa en el campo top-level `mit_for` (eje de prioridad). Convención 1-3/día. Aquí solo se especifica su *coaching*; el campo → `graph-model-notes-and-topology`.
- **Disposición.** La decisión consciente que recibe un pendiente al asentarlo: hecho (`state:'DONE'`) · sigue (`mit_for:'<hoy>'`) · mover (`mit_for:'<fecha>'`) · soltar (`mit_for: null`). Nada se abandona en silencio.
- **Micro-lección.** Una explicación breve del *porqué* de una buena práctica, dada en el flujo. Máximo una por interacción, solo la primera vez de cada concepto.
- **Rampa (de hábitos).** La secuencia de un-hábito-a-la-vez: victoria → descomponer proyecto → 1 MIT/día → jornada completa → primer objetivo → ejes + semanal → destete.
- **Racha / madurez.** Señal *leída* del grafo (no persistida): la racha de jornadas vía `mit_history`, lo revisado vía `last_reviewed_at`. Mide cuánto subir la rampa.
- **Nudge (de ritual).** Una invitación surfaceada por el dashboard (no por el agente, que no inicia conversaciones). Es invitación, nunca artefacto: no commitea nada.
- **Bitácora.** El lector cronológico de los informes con `kind`, agrupados semana → día (lo más nuevo primero); el contrapunto "a lo largo del tiempo" de la vista de MITs ("ahora"). Reconoce `day` ("Jornada", ☀️) y `week` ("Revisión de la semana", 🔁), y aún renderiza los kinds legacy. Su UI es hermana (`dashboard-ui`).
- **Período (de unicidad).** El día natural de Madrid (para `day`) o la semana ISO lunes-domingo de Madrid (para `week`), con frontera DST-correcta. La unidad de la regla "uno por período".

## 8. Graphical Representation

UI mínima en esta iniciativa: el reconocimiento visual de rituales vive en la **Bitácora**, cuya UI es hermana (`dashboard-ui`). Aquí solo el hecho funcional de qué reconoce y cómo etiqueta:

| `kind` | Etiqueta | Icono | Estado |
|---|---|---|---|
| `day` | Jornada | ☀️ | actual |
| `week` | Revisión de la semana | 🔁 | actual |
| `plan_day` | Plan del día | 🎯 | legacy (solo histórico) |
| `review_day` | Cierre del día | 🔄 | legacy (solo histórico) |
| `plan_week` | Plan de la semana | 🗓️ | legacy (solo histórico) |
| `review_week` | Revisión de la semana | 🔁 | legacy (solo histórico) |

La Bitácora agrupa los informes con `kind` en semanas (lo más nuevo primero) → días (lo más nuevo primero) → informes del día (lo más nuevo primero). Un informe sin `kind` no aparece en la Bitácora. Fuente: `apps/dashboard/src/lib/bitacoraView.ts` (`KIND_META`, `buildBitacora`).

## 9. Restrictions & Tradeoffs

- **Solo dos rituales, y solo dos.** No hay plan y cierre separados: si ayer no se concluyó algo, se concluye al inicio de la siguiente jornada. Los kinds legacy son *historia legible*, no flujos vivos: rechazados en propuestas nuevas.
- **El `kind` correcto depende del agente, no del servidor.** El servidor solo ve `approved` y la unicidad; no sabe si *hubo* ritual. Por eso la disciplina del kind y la asimetría de iniciativa son *barandillas*: detectables a posteriori en el audit trail, pero no impedidas en runtime. Hoy no hay revisor automático de ese trail (gap conocido; `docs/issues/2026-06-09`, DOCT-002). Mitigación deliberada: ante la duda, NO poner kind (un no-kind nunca es error).
- **La madurez se infiere, no se almacena.** Se gana robustez y auditabilidad (sin telemetría que ensucie el dominio) a costa de que el coach deba *recalcular* la madurez leyendo el grafo en cada interacción en vez de leer un contador.
- **La invitación depende del runtime.** El agente no puede iniciar conversaciones; en el dashboard la invitación la surfacea el nudge. En un cliente sin nudges, la invitación recae enteramente en que el agente reconozca el momento dentro de una conversación ya abierta.
- **El worker del dashboard no puede cerrar el lazo solo.** Puede conducir e invitar un ritual y dejar el draft listo, pero el commit (la `approved`) lo hace el humano desde la UI; `commit_proposal` está excluido de su toolset. → `conversational-agent-worker`.
- **El convencionalismo 1-3 MITs es blando.** El sistema acepta cualquier número de MITs; la convención solo la sostiene el agente (recuérdalo una vez, respeta la decisión).
- **`decompose_project` es de a-uno.** Una acción por proyecto, un proyecto por vez: descomponer muchos de golpe abruma y va contra el coaching.

## 10. Open Questions & Assumptions

- **Drift en el system-prompt del worker (gap evidenciado).** `backend/huygens-worker/huygens_worker/agent.py` aún menciona los kinds legacy `plan_day`/`review_day` y el lenguaje "cerrar/planificar el día" en su prompt hardcoded (líneas ~48, ~50, ~62), mientras la doctrina y el modelo migraron a la jornada única `day`. Funcionalmente acotado (el worker no commitea, e inyecta la doctrina íntegra como recurso, que gana sobre el prompt), pero es una inconsistencia textual residual. *No corregido aquí* (toca lore/worker; pertenece a `conversational-agent-worker`). **Not evidenced:** si esa migración del prompt del worker está planeada.
- **Ventana del nudge semanal vs. unicidad por semana ISO (matiz).** El nudge `week` usa una ventana móvil de 7 días hacia atrás (para no re-nudgear lunes tras una revisión del domingo), mientras la *unicidad* del commit es por semana ISO calendárica. Son dos cálculos deliberadamente distintos (uno para invitar, otro para enforced): el nudge tira por lo suave, la unicidad por lo estricto. No es contradicción, pero conviene tenerlo presente.
- **La "racha de jornadas" como señal de madurez no tiene una métrica fija.** La doctrina y el prompt dicen "racha en `mit_history`" y "sin racha → guía a UNO", pero el umbral concreto (cuántas jornadas seguidas = hábito sostenido, cuándo subir la rampa) queda al **juicio del agente-coach**, no codificado. **Assumption:** es intencional (el coaching es comportamiento, no un autómata con umbrales duros).
- **"Recaída" no está operacionalizada.** Las reglas de re-enseñanza y de bajar-el-listón disparan "tras recaída" / "tras un par de invitaciones ignoradas", pero ni "recaída" ni "un par" tienen definición numérica en el código; dependen del juicio del coach leyendo el grafo. **Assumption:** deliberado.
- **El "destete" (último peldaño de la rampa) no tiene criterio explícito** de cuándo el coach debe retirarse. **Not evidenced.**
