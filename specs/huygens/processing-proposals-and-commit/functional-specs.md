# Huygens — `processing-proposals-and-commit` — Functional Specification

## 1. Summary

Esta iniciativa cubre el **corazón deliberado de Huygens**: la sesión de procesamiento del
inbox y el ciclo `propuesta → commit` que la materializa. Es donde la evidencia literal
(capturas en bruto, `raw_capture`) se convierte en **interpretación estructurada y aprobada**:
un `block` narrativo (`block_kind='narrative'`) —el **informe-block**— trazado a sus raws,
acompañado de un conjunto **completo y visible** de mutaciones al grafo (notas, edges,
provenance), que el usuario revisa antes de que nada se escriba.

El principio de producto que rige toda la iniciativa es que **Huygens es una memoria de
confianza, no una secretaria pasiva**: todo lo que entra al grafo debe ser auditable y citable,
y **nada estructural muta sin mandato del usuario**. La pieza que hace cumplir ese principio es
`commit_proposal`: la **única puerta de mutación** del grafo. No existe atajo; el lector del
grafo corre como rol `VIEWER` y la base de datos rechaza cualquier escritura por SurrealQL. El
mandato del usuario es lo que autoriza el commit, pero "mandato" no es "interrogatorio": una
**orden o corrección explícita** ("eso ya está hecho", "X pasa a WAITING") **ya es la
aprobación** para una propuesta mínima y fiel a esa orden, que se prepara y se commitea sin
re-preguntar.

El artefacto persistente del ciclo es la **propuesta** (`proposal`), una máquina de estados de
cuatro valores (`draft`, `committed`, `discarded`, `superseded`) cuyo `payload` es la
representación canónica —y el único origen de verdad (SSOT)— del cambio. El payload se realiza
con **ids reales** ya en el momento de crearlo (ADR-0028), de modo que lo que el usuario ve en
el preview son los identificadores definitivos.

**Frontera de la iniciativa.** Se documentan aquí: el informe-block como artefacto
interpretativo, las seis tools del ciclo (`create_proposal`, `update_proposal`, `get_proposal`,
`discard_proposal`, `commit_proposal`, `get_proposal_changes`), el esquema del payload, las
puertas (gates) que el servidor exige en el commit, la forma del resultado del commit, el
auto-embed best-effort posterior, y los dos guiones de sesión (`process_inbox`,
`decompose_project`).

Queda **fuera** (referencia de una línea a la iniciativa hermana): la semántica de los rituales
`day`/`week`, la etiqueta `kind`, `approved:true`, la unicidad por período y el coaching
(`rituals-and-coaching`); el modelo de notas/edges/estados/ejes temporales en sí
(`graph-model-notes-and-topology`); la revisión visual de la propuesta y la UI humana de commit
—Borradores, grafo de cambios en React Flow— (`dashboard-ui`); el log de auditoría, el
invariante de fold y el changefeed (`audit-provenance-and-trust`); las tools de
búsqueda/grounding (`retrieval-and-grounding`).

## 2. Actors & Roles

- **Usuario (Rubén).** El único que tiene autoridad para autorizar un commit. Da órdenes y
  correcciones explícitas (que valen como aprobación de una propuesta mínima) y aprueba (o pide
  cambios / descarta) los previews de interpretación y topología nueva.
- **Agente conversacional con commit (cliente MCP completo: Claude Code, Codex, Hermes, …).**
  Conduce la sesión: agrupa raws, interpreta, redacta el informe-block, persiste la propuesta
  visible y —solo con aprobación explícita— la commitea. Es el actor que ejecuta las seis tools.
- **Agente del dashboard (worker, cliente sin commit).** Opera **sin `commit_proposal`** en su
  toolset: prepara la propuesta mínima y fiel, la deja en `draft` y anuncia que está lista; el
  commit lo hace el humano desde la UI. Referencia de una línea: el detalle del worker y su
  disciplina vive en `conversational-agent-worker`.
- **MCP Huygens (servidor de tools).** La frontera de persistencia y validación. Hace cumplir
  las puertas del commit (preview, aciclicidad de `part_of`, anclaje, aprobación de ritual,
  normalización de fechas, atomicidad). No es un agente autónomo: no topologiza por iniciativa.
- **SurrealDB (motor + roles).** Persistencia documento/grafo/vector/auditoría. El rol
  `huygens_reader` (`VIEWER`) que usan los lectores **no puede escribir**: es el muro físico que
  garantiza que el grafo solo cambia vía `commit_proposal`.

## 3. Goals & User Jobs

- **Convertir evidencia en interpretación auditable.** Tomar uno o varios `raw_capture` y
  producir un informe-block que documente *qué significan* y *qué cambian*, trazado a sus raws.
- **Ver el cambio completo antes de aplicarlo.** El usuario quiere un diff legible y exhaustivo
  (qué notas se crean/actualizan, qué edges, qué provenance) y la garantía de que **nada se
  commitea sin haberlo visto**.
- **Aplicar correcciones de bajo coste sin ceremonia.** Una orden directa ("ciérralo", "pasa a
  WAITING") debe materializarse en una propuesta mínima y fiel, sin re-preguntas.
- **Confiar en que la puerta es estrecha.** El usuario quiere la certeza de que ningún camino
  alternativo (SurrealQL, otra tool) puede mutar el grafo a sus espaldas.
- **Poder auditar después lo que se aplicó.** Releer los cambios exactos de una propuesta
  commiteada de forma durable (`get_proposal_changes`), con ids reales, sin depender del
  changefeed.
- **Descomponer un proyecto en su próxima acción** (job de coaching): convertir un proyecto vivo
  sin tareas accionables en una `task` concreta colgada de él, vía una sola propuesta aprobada.

## 4. Entry Points

Todo el ciclo se ejerce a través de **tools MCP** (no hay UI propia en esta iniciativa; la
revisión visual es de `dashboard-ui`). Las seis tools del ciclo:

| Tool | Entrada principal | Efecto |
|---|---|---|
| `create_proposal` | `raw_ids[]` (1..100) + `payload` | Persiste un `draft` visible. **No muta** el grafo. Asigna ids reales al payload. |
| `update_proposal` | `proposal_id` + `payload` | Reemplaza el payload de un `draft`. **Limpia `previewed_at`** (invalida el preview). |
| `get_proposal` | `proposal_id` | Devuelve un diff legible determinista **+** el JSON crudo. Sobre un `draft`, **estampa `previewed_at`**. |
| `discard_proposal` | `proposal_id` | Marca el `draft` como `discarded`. **No muta** el grafo. |
| `commit_proposal` | `proposal_id` + `approved?` | **La puerta de mutación.** Transacción atómica: crea blocks/notas/edges, marca raws `processed`, estampa el ancla. |
| `get_proposal_changes` | `proposal_id` | Lee el delta exacto desde el `payload` almacenado (SSOT, ids reales). Read-only, durable, sin changefeed. |

Entradas adicionales que alimentan o auditan el ciclo (descritas en otras iniciativas, citadas
aquí por contexto): `capture` y `list_inbox` (plano de evidencia, `capture-and-inbox`);
`set_raw_status` para despachar raws que no se topologizan; `find_related` / `vector_search` /
`trace_provenance` durante la interpretación (`retrieval-and-grounding`); `retract` como único
camino de borrado para correcciones (`audit-provenance-and-trust`).

**Guiones de sesión (prompts MCP).** Dos prompts encapsulan el flujo paso a paso como *deltas*
sobre la doctrina:

- `process_inbox` — la sesión deliberada de procesamiento del inbox.
- `decompose_project` — descomponer un proyecto en su próxima acción (coaching).

## 5. Workflows

### Workflow 1 — Sesión de procesamiento del inbox (`process_inbox`)

**Trigger.** El usuario pide procesar ("procesemos el inbox") o hay inbox pendiente que
interpretar.

**Pasos.**
1. **Listar el inbox** (`list_inbox`, estados `pending` y, si procede, `deferred`). Si está
   vacío, decirlo y parar.
2. **Agrupar** los raws que hablan de lo mismo. Si un raw es ambiguo, **preguntar antes de
   interpretar** — no asumir el área/padre por el contexto reciente (las personas y tareas
   atraviesan áreas; `part_of` es de padre único).
3. **Interpretar en voz alta.** Antes de crear notas, usar `find_related` / `vector_search` para
   no duplicar; `trace_provenance` si hay que citar.
4. **Redactar el informe-block**: un `block` narrativo trazado a sus raws vía `derived_from`. Es
   un informe de proceso: **NO lleva `kind`** (el `kind` es solo para los rituales `day`/`week`).
5. **Proponer, visible** (`create_proposal`; `update_proposal` si hay que rehacer) y **repasar
   el conjunto** con `get_proposal` (esto estampa el preview).
6. **Commit solo con aprobación explícita** (`commit_proposal`). Auditar con
   `get_proposal_changes` y resumir lo aplicado.

**Fin.** Uno o varios informe-blocks aprobados, las mutaciones aplicadas atómicamente, los raws
implicados marcados `processed`.

**Caminos alternos.**
- Raws que no deben volverse topología → `set_raw_status` (`ignored` / `deferred` / `processed`),
  sin crear propuesta.
- Varios raws se funden en **un solo** informe-block (relación N raws → 1 block).
- El usuario pide cambios sobre el preview → `update_proposal` (que invalida el preview previo) →
  nuevo `get_proposal` → commit.

**Caminos de error / aborto.**
- El usuario descarta → `discard_proposal` (sin mutación).
- Validación del payload falla en `create_proposal`/`update_proposal` (ver Workflow 4).
- Una puerta del commit falla → la propuesta sigue `draft`, los raws siguen `pending`, nada se
  materializa (ver Workflow 3 y la Regla R-ATOMIC).

### Workflow 2 — Corrección mínima sin re-preguntar

**Trigger.** El usuario da una **orden o corrección explícita** sobre una nota existente ("eso
ya está hecho" → `DONE`; "X pasa a WAITING" → `WAITING`; soltar un MIT → `mit_for: null`).

**Pasos.**
1. Preparar una propuesta **mínima y fiel** a la orden: típicamente un único `note_updates`
   (cambio de estado/campo) más, opcionalmente, un informe-block breve que lo documente. **Sin
   `kind`** (no es un ritual).
2. `create_proposal` → `get_proposal` (preview obligatorio, sin volver a pedir permiso) →
   `commit_proposal`.

**Fin.** El cambio aplicado en un solo commit; el usuario no fue interrogado por lo que ya
ordenó.

**Caminos alternos.**
- **Cliente sin commit (worker):** prepara la propuesta mínima, la deja en `draft`, y **anuncia
  que está lista para commit**; el humano la commitea desde la UI.

**Regla de no-disparo.** Si la orden es **ambigua o implica topología/notas nuevas**, este
camino no aplica: se pregunta o se trata como sesión de interpretación (Workflow 1). Un cambio
de estado a media tarde es una corrección normal, **nunca** una jornada/ritual.

### Workflow 3 — Ciclo de vida de la propuesta y commit atómico

**Trigger.** Existe un `draft` (de cualquiera de los workflows anteriores) listo para revisar.

**Estados y transiciones.**
```
create_proposal ──► draft
   draft ──update_proposal──► draft        (reemplaza payload; previewed_at = NONE)
   draft ──get_proposal──────► draft        (estampa previewed_at)
   draft ──discard_proposal──► discarded    (sin mutación de grafo)
   draft ──commit_proposal───► committed    (transacción atómica)
   (superseded: artefacto de migración, ver Data Concepts — ninguna tool transiciona a él)
```

**Pasos del commit (`commit_proposal`), en orden.**
1. Cargar la propuesta y **exigir que sea `draft`** (rechaza `committed`/`discarded`/`superseded`
   con "proposal is not draft: <status>"). Esto es el anti-doble-commit.
2. **Exigir preview** (`previewed_at != NONE`): la propuesta —o su último payload— debe haberse
   renderizado al menos una vez exactamente como está almacenada. Si no, rechaza con "never
   previewed".
3. Validar contra la BD: raws **committables** (solo `pending`|`deferred`), refs existentes,
   `part_of` **acíclico**, y la **puerta de ritual** (aprobación + unicidad por período; detalle
   en `rituals-and-coaching`).
4. Construir y ejecutar **una sola transacción** `BEGIN…COMMIT` que: crea notas (con sus blocks
   descriptivos), aplica `note_updates`, crea los informe-blocks narrativos con su provenance
   `derived_from`, materializa `about`/`affects`, elimina edges (`edges_remove`) y crea edges
   (`part_of`/`blocked_by`/`mentions`), marca los raws `processed` (con `processed_at`), y
   estampa el resultado-ancla en la propuesta (`status='committed'`, `result = { versionstamp,
   committed_at }`).
5. Recuperar el `versionstamp` de la transacción (desde el changefeed de la propia propuesta) y
   estamparlo en `result.versionstamp`.
6. Emitir un `agent_event` `proposal_committed` con `actor: 'user'`.
7. **Auto-embed best-effort** de los blocks creados (ver Workflow 5).
8. Devolver `CommitProposalResult` (ver Data Concepts).

**Fin.** Propuesta `committed`; grafo mutado de forma consistente; raws cerrados; resultado
devuelto con ids reales.

**Camino de error / aborto.** Cualquier fallo en los pasos 1–3 lanza **antes** de tocar el
grafo. Un fallo dentro de la transacción del paso 4 (p. ej. el índice UNIQUE de `part_of`
rechaza dos padres para el mismo hijo) **revierte todo**: ninguna nota/block/edge queda, los
raws siguen `pending`, la propuesta sigue `draft`. (Verificado en
`proposal-lifecycle.test.ts`: "fails and rolls back atomically").

### Workflow 4 — Validación del payload en create / update

**Trigger.** `create_proposal` o `update_proposal`.

**Pasos (validación a nivel de entrada, espacio de `temp_id`).**
1. **Esquema Zod** del payload: `raw_ids` ≥ 1 (formato `raw_capture:…`), `narrative_blocks` ≥ 1,
   cada uno con `temp_id`, `content` no vacío y `raw_ids` ≥ 1; fechas con formato de día
   calendario real (rechaza p. ej. `2026-02-31`).
2. `raw_ids` del argumento **deben coincidir** (como conjunto) con `payload.raw_ids`.
3. **`temp_id` únicos** a través de `note_creates` + `narrative_blocks` (reporta el duplicado).
4. Cada `raw_id` que cite un narrative block **debe estar declarado** en `payload.raw_ids`.
5. **No fugas temporales en `metadata`**: rechaza claves tipo `due`, `deadline`, `vencimiento`,
   `mitfor`, `deferuntil`, … (normalizadas) en `metadata`/`metadata_merge`; deben ir en los
   campos top-level `due_at`/`mit_for`/`defer_until`.
6. **`part_of` exige `anchored: true`**: un edge `part_of` sin `anchored` se rechaza aquí.
7. Si todo pasa, se **realiza** el payload: cada nota y narrative block nuevos reciben un **id
   real** (uuidv7), y **toda** referencia (`edges`, `edges_remove`, `about`, `affects`) se
   reescribe de `temp_id` a id real. El payload persistido habla solo ids reales (sin `temp_id`,
   sin puente).

**Fin.** Un `draft` cuyo payload almacenado es la SSOT del cambio.

**Camino de error.** Cualquier check fallido lanza y **no se persiste nada** (en `create`) o no
se actualiza (`update`). Verificado: "expect noteCount to be 0" tras un rechazo.

### Workflow 5 — Auto-embed best-effort post-commit

**Trigger.** Un commit acaba de materializar blocks nuevos (narrativos + descriptivos).

**Pasos.**
1. Si hay clave de embeddings configurada (`DEEPINFRA_API_KEY`) y hay blocks nuevos, se embeben
   en lotes de 64 (`index_block`).
2. Si el embed **falla** (sin clave / proveedor / red), se captura el error y el block queda
   simplemente **sin indexar**; el commit ya está hecho y **no se revierte**.

**Fin.** Búsqueda vectorial completa en el caso normal; en el caso degradado, `db:reindex` (un
comando de mantenimiento) rellena los embeddings pendientes después.

**Nota de diseño.** El grafo es la SSOT y ya está commiteado; el embedding es caché. El embed
**nunca** puede tumbar ni revertir el commit.

### Workflow 6 — Descomponer un proyecto en su próxima acción (`decompose_project`)

**Trigger.** El usuario quiere desbloquear la planificación de un proyecto vivo sin tareas
accionables (es coaching: se **enseña** a descomponer, no se descompone por el usuario).

**Pasos.**
1. Elegir **un** proyecto vivo (`ACTIVE`) con 0 (o pocas) tareas hijas accionables
   (`get_hierarchy` o query). Traerlo con su contexto (de qué área cuelga).
2. Enseñar el concepto en una frase y **modelar** un ejemplo, pero dejar que el usuario diga su
   próxima acción física concreta.
3. El usuario decide la próxima acción (verbo + objeto concreto).
4. `capture` de su respuesta (`source_kind:'chat'`).
5. **Una sola propuesta**: un `note_creates` tipo `task` (`state:'ACTIVE'`) colgado del proyecto
   con un edge `part_of` **`anchored: true`** (el padre es inequívoco) **+** un informe-block
   trazado a la raw. Repasar con `get_proposal`.
6. Commit solo con OK del usuario; auditar con `get_proposal_changes`.
7. Cerrar el puente al hábito sin marcar `mit_for` aquí (eso es la jornada).

**Fin.** El proyecto tiene una próxima acción concreta; el terreno queda listo para que mañana
sea un MIT.

**Caminos de error / aborto.** **Una acción por proyecto, un proyecto por vez** (no descomponer
19 de golpe). El usuario define la acción; el agente **no la inventa ni la elige** por él. Sin
`kind` (no es un ritual diario).

## 6. Functional Rules & Constraints

Las reglas se clasifican según el **mapa de enforcement** de la doctrina: un **muro** lo hace
cumplir el sistema (el intento falla); una **barandilla** existe solo si el agente la respeta (el
servidor acepta la mutación; la violación solo es detectable a posteriori en el audit trail).
Donde aplica se indica *dónde* se hace cumplir.

**Frontera de aprobación (la regla madre)**

- **R-DOOR (muro/motor).** `commit_proposal` es la **única puerta de mutación** del grafo. No se
  usa SurrealQL para escribir: el reader corre como `VIEWER` y la BD rechaza la escritura. (Las
  tools de lectura `query_query`/`run_query` no pueden escribir.)
- **R-APPROVAL (barandilla).** El mandato del usuario autoriza el commit. Una orden/corrección
  explícita autoriza una propuesta mínima fiel (no re-preguntar). La interpretación, la
  topología nueva, los MITs y los rituales requieren que el usuario apruebe el preview. El
  servidor no ve la conversación: el agente es el único enforcement aquí, salvo los gates de
  ritual (que sí son muro).

**Gates servidor-enforced sobre `commit_proposal`** (extraídos del mapa "muro o barandilla")

- **R-DRAFT (muro/motor).** Solo se commitea un `draft`. Un segundo commit o un commit de una
  propuesta `committed`/`discarded`/`superseded` se rechaza ("proposal is not draft: <status>").
- **R-PREVIEW (muro/servidor).** La propuesta debe haber sido **previsualizada**: `get_proposal`
  estampa `previewed_at` sobre un `draft`; `update_proposal` lo limpia; `commit_proposal` lo
  exige. Consecuencia: lo que se commitea fue renderizado al menos una vez **exactamente** como
  está almacenado — nada estructural se commitea a ciegas.
- **R-RAW-COMMITTABLE (muro/servidor).** Todos los `raw_ids` deben existir y estar en estado
  **`pending` o `deferred`** (committables). Un raw `processed` o `ignored` bloquea el commit
  ("raw_capture not committable: … status=<x>").
- **R-REFS (muro/servidor).** Toda referencia que la propuesta **no crea** debe existir ya
  (notas, blocks). Endpoints de `about`/`affects` deben ser blocks; endpoints de
  `part_of`/`blocked_by` deben ser notas. Una ref a un id inexistente o a un `temp_id` sin
  resolver se rechaza **antes** de mutar.
- **R-PARTOF-SINGLE (muro/motor).** `part_of` es de **padre único** (índice UNIQUE sobre `in`).
  Dos padres para el mismo hijo en una propuesta se rechazan (en validación y, en última
  instancia, por el índice → rollback atómico). Reparentar es un **replace**: el commit borra el
  padre anterior del hijo en la misma transacción.
- **R-PARTOF-ANCHORED (muro/servidor).** Un edge `part_of` **exige `anchored: true`** (afirmación
  deliberada de que el usuario dijo el padre). Sin él, se rechaza. *(Que el usuario de verdad lo
  dijera es barandilla: `anchored` lo escribe el agente.)*
- **R-PARTOF-ACYCLIC (muro/servidor).** La jerarquía `part_of` debe seguir siendo un bosque. El
  índice UNIQUE no ve ciclos (A→B, B→A son dos filas válidas), así que el commit comprueba
  **alcanzabilidad** contra el grafo *tal como quedará* (edges existentes − removals + replace +
  nuevos). Ciclo directo, transitivo o auto-padre → rechazo ("part_of cycle: …"). Reparentar
  fuera del ciclo en el mismo commit sí se permite.
- **R-DATES-UTC (muro/servidor).** Los tres ejes temporales (`mit_for`, `due_at`, `defer_until`)
  se **normalizan a medianoche UTC del día escrito** en el commit (un día-solo y un datetime con
  zona caen en el mismo instante). Esto mantiene consistentes las queries de rango (vencidas, MITs
  de hoy, dormidas).
- **R-ATOMIC (muro/motor).** El commit es **todo-o-nada**: una sola transacción `BEGIN…COMMIT`.
  Cualquier fallo revierte el conjunto completo; ni notas, ni blocks, ni edges quedan, los raws
  siguen `pending` y la propuesta sigue `draft`.
- **R-RITUAL (muro/servidor).** Un informe de ritual (narrative block con `kind` `day`/`week`)
  exige `approved: true` y es **único por período** (un `day` por día Madrid, una `week` por
  semana ISO, frontera DST-correcta). Un informe sin `kind` ignora esta puerta. *(Detalle de
  ritual, coaching y disciplina del `kind` → `rituals-and-coaching`.)*

**Reglas del payload y del resultado**

- **R-PAYLOAD-SSOT.** El `payload` almacenado (ids reales) es el **único origen de verdad** del
  cambio. Tanto el commit como los lectores y el dashboard ven ese payload.
- **R-REALIDS (ADR-0028).** Los ids reales de notas y narrative blocks se asignan en
  `create_proposal`; no hay mapa `temp_id → real`. Los ids que el usuario ve en el preview son
  los definitivos. `CommitProposalResult` lista **ids reales**.
- **R-RESULT-ANCHOR.** La propuesta commiteada guarda en `result` **solo el ancla**:
  `committed_at` + `versionstamp`. El detalle del cambio no se materializa en `result`; se deriva
  del payload (`get_proposal_changes`).
- **R-TRANSFORMATION.** En el commit, cada edge `derived_from` informe-block → raw se estampa con
  `transformation: 'summarized'` (el payload no permite elegir la transformación por block; los
  valores `verbatim`/`extracted`/`inferred` existen en el modelo pero no se fijan en este flujo).
- **R-EDGE-PROVENANCE (muro/código, invariante M2a).** Todo edge creado en el commit lleva
  `via_proposal` (la propuesta que lo materializó); un único choke-point lo garantiza y **falla
  ruidosamente** si un camino futuro lo olvidara. (El detalle de auditoría/fold →
  `audit-provenance-and-trust`.)
- **R-CHANGES-DURABLE.** `get_proposal_changes` lee el delta **directamente del payload**
  (`source: 'payload'`), sin dependencia del changefeed, de forma durable (sobrevive a
  EXPORT/IMPORT y a upgrades de formato del motor) y funciona idéntico para cualquier propuesta,
  incluida la genesis. Sobre una propuesta no commiteada (`draft`/`discarded`), `committed_at` es
  `null` pero el delta del payload se devuelve igualmente. Un id desconocido lanza "proposal not
  found".

**Estados de la propuesta (máquina de estados)** — ver Data Concepts §7.

## 7. Data Concepts

Glosario de conceptos que el usuario percibe (no es un esquema de BD).

- **`raw_capture` (capa de evidencia).** El registro inmutable de lo que el usuario dijo; el
  inbox real. Tiene `status` (`pending` | `processed` | `ignored` | `deferred`) que es el origen
  de verdad del inbox. Entradas y detalle en `capture-and-inbox`.
- **Informe-block.** La **pieza central** de la iniciativa: un `block` con
  `block_kind = 'narrative'`, texto en markdown, que documenta la **interpretación** —el puente
  entre la evidencia literal y la topología—. Puede existir solo (no pertenece a una nota); se
  conecta a notas vía `about` y `affects`, y a sus raws de origen vía `derived_from`. Un ritual
  es un informe-block con la etiqueta `kind` (`day`/`week`); un informe de proceso normal **no**
  lleva `kind`. Es la unidad vectorizable (se embebe tras el commit).
- **Block descriptivo.** Un `block` con `block_kind = 'descriptive'` que **pertenece a una nota**
  (se renderiza vía `note.block_order`). Se crean dentro del commit como hijos de las notas
  (`descriptive_blocks` en `note_creates`, `descriptive_blocks_append` en `note_updates`).
- **Propuesta (`proposal`).** El artefacto persistente y visible del cambio. Campos percibidos:
  `id`, `status`, `raw_captures`, `payload`, `result` (ancla, si commiteada), `previewed_at` (si
  se renderizó), `created_at`/`updated_at`. Su `payload` es la SSOT del cambio.
- **Estados de la propuesta:**
  - **`draft`** — recién creada o actualizada; **mutable**; la única desde la que se puede
    commitear, descartar, actualizar o previsualizar.
  - **`committed`** — aplicada atómicamente; inmutable; guarda solo el ancla.
  - **`discarded`** — descartada sin mutar el grafo; inmutable.
  - **`superseded`** — **artefacto de migración**: una propuesta legacy *aplanada* dentro del
    commit **genesis** (`genesis.ts`). Las superseded quedan **fuera** de la ventana de
    fold/rebuild (que solo reproduce las `committed`); su payload se conserva para auditoría pero
    no forma parte de la proyección viva. Es **el estado más común por recuento** (un artefacto
    puntual de la migración), aunque **ninguna tool transiciona a él en runtime**. Un lector del
    ciclo de vida debe esperarlo.
- **Payload de la propuesta (el cambio completo y visible).** Conjunto de cambios que el usuario
  percibe como **completo**. Componentes funcionales:
  - **`raw_ids`** — las capturas que esta propuesta procesa (≥ 1). En el commit pasan a
    `processed`.
  - **`narrative_blocks`** — los informe-blocks a crear (≥ 1). Cada uno: `content`, los `raw_ids`
    que resume (≥ 1, su trazo `derived_from`) y un `kind` opcional (solo en rituales).
  - **`note_creates`** — notas nuevas: `type_slug`, `title`, `state` (por defecto `CLARIFIED`),
    ejes temporales opcionales (`mit_for`/`due_at`/`defer_until`), `metadata` y blocks
    descriptivos.
  - **`note_updates`** — mutaciones mínimas sobre notas existentes: `title`, `state`, los ejes
    temporales (`null` los limpia, valor los fija), `metadata_merge` (fusión) y append de blocks
    descriptivos.
  - **`edges`** — los edges navegables a crear: `part_of` | `blocked_by` | `mentions`, con `from`
    / `to`, `reason?` (se persiste en `blocked_by`) y `anchored?` (obligatorio en `part_of`).
  - **`edges_remove`** — retirada explícita de edges semánticos (el inverso de `edges`).
  - **`about`** — qué notas *trata* cada informe-block (block → note).
  - **`affects`** — qué notas *cambia* cada informe-block, con `action` (`created` | `updated` |
    `state_changed` | `linked` | `archived`) y `summary?`. Es la traza de "este informe produjo
    este cambio en esta nota".
  En la entrada, `from`/`to`/`block_temp_id`/`note_ref` aceptan un `temp_id` local o un id real;
  tras realizarse, el payload almacenado solo habla ids reales.
- **`CommitProposalResult` (lo que el usuario aprende que se creó/actualizó).** Lo que devuelve
  el commit, con **ids reales** (sin mapa `temp_id`): `proposal_id`, `raw_ids_processed`,
  `narrative_blocks_created[]`, `notes_created[]`, `notes_updated[]`,
  `descriptive_blocks_created[]`, y los recuentos `derived_from_created`, `about_created`,
  `affects_created`, `semantic_edges_created`, `semantic_edges_removed`.
- **Diff de `get_proposal`.** Una vista legible, determinista, derivada solo del payload: cabecera
  con estado y si es committable, raws procesados, notas a crear/actualizar (con sus extras: MIT,
  due, defer, metadata, blocks descriptivos), informe-blocks (con su `← from <raws>`), edges (con
  marca "reemplaza padre anterior" en un `part_of` sobre nota preexistente), edges removidos,
  topología (`about`/`affects`) y un resumen con el tally completo. Va seguido del JSON crudo.
- **Provenance `derived_from`.** El edge informe-block → `raw_capture` que ancla la
  interpretación a su evidencia. Sirve para citar y para distinguir lo dicho de lo inferido
  (detalle en `audit-provenance-and-trust`).

## 8. Graphical Representation

No aplica a esta iniciativa. El ciclo `propuesta → commit` es *headless* (tools MCP). La
**revisión visual** de la propuesta y la **UI humana de commit** (la vista de *Borradores*, el
grafo de cambios en React Flow) son una iniciativa hermana: `dashboard-ui`. El diff legible que
produce `get_proposal` es texto, no UI.

## 9. Restrictions & Tradeoffs

- **El commit no es vía-libre: es una puerta estrecha por diseño.** Toda mutación estructural
  pasa por `commit_proposal`; no hay API "rápida" para escribir el grafo. Es deliberado: la
  garantía de auditabilidad vale más que la comodidad.
- **`approved`/`anchored` son afirmaciones del agente, no verificaciones del servidor.** El
  servidor no ve la conversación: que el usuario *de verdad* aprobara, o *de verdad* anclara el
  padre, es barandilla. Son detectables a posteriori en el audit trail, pero **hoy no hay revisor
  automático** de ese trail (gap conocido). La doctrina manda tratar cada barandilla como si
  fuera muro.
- **`get_proposal` tiene un efecto colateral en un `draft`: estampa el preview.** Leer una
  propuesta borrador la marca como previsualizada; esto es intencional (el preview *es* la
  precondición del commit), pero significa que `get_proposal` no es puramente de lectura sobre un
  `draft`.
- **`update_proposal` invalida cualquier preview previo.** Cualquier cambio de payload obliga a
  un nuevo `get_proposal` antes de poder commitear; un preview "viejo" nunca autoriza un commit
  de un payload distinto.
- **La transformación de provenance está fijada a `summarized`.** Este flujo no permite marcar un
  informe-block como `verbatim`/`extracted`/`inferred` por raw; todos los `derived_from` que crea
  el commit son `summarized`.
- **El payload no permite topología arbitraria.** Solo tres edge kinds navegables
  (`part_of`/`blocked_by`/`mentions`) más las trazas `about`/`affects`/`derived_from`. No se
  introducen edge types nuevos por esta vía.
- **`get_proposal_changes` describe el *intento* del payload, no el estado *vivo* tras posibles
  retracts.** Lee el payload almacenado (durable, ids reales), que es lo que la propuesta declaró
  cambiar; el estado actual del grafo (p. ej. si un block fue retraído después) se consulta por
  otras vías.
- **Auto-embed best-effort: una propuesta puede quedar commiteada con blocks sin indexar.** Si
  falta la clave de embeddings o el proveedor falla, el commit se mantiene y el block queda sin
  embedding hasta que `db:reindex` lo rellene. El grafo es la SSOT; el embedding es caché.
- **`rebuildGraph` (reproyección del grafo desde el log) está guardado y bloqueado por defecto**
  en producción: hoy aplanaría la `via_proposal` de cada edge sobre la genesis, destruyendo la
  provenance real. Existe pero rechaza correr sin un override deliberado. (Detalle en
  `audit-provenance-and-trust`.)

## 10. Open Questions & Assumptions

**Supuestos (claramente etiquetados).**
- *Asunción:* La afirmación de que `superseded` es "el estado más común por recuento" se toma de
  la doctrina y del data-model como verdad documentada; **no se verificó contra una BD viva** en
  esta sesión (la memoria fue borrada el 2026-06-09 y la DB actual está vacía salvo schema+seed).
  Como hecho de *diseño* (artefacto único de la migración genesis), la afirmación es consistente
  con el código (`genesis.ts` supersede todas las committed legacy de una vez).
- *Asunción:* "El cambio es completo y visible" se interpreta como: el payload enumera **todas**
  las mutaciones que el commit aplicará. El código lo sostiene (el commit construye la transacción
  exclusivamente desde el payload; el diff y `get_proposal_changes` derivan del mismo payload).

**Preguntas abiertas / Not evidenced.**
- **Limpieza de drafts huérfanos.** No se evidenció ningún proceso (manual o programado) que
  caduque o purgue propuestas que quedan en `draft` sin commitear ni descartar. **Not evidenced.**
- **Tope superior de tamaño del payload.** `raw_ids` está acotado a 1..100; no se evidenció un
  límite explícito sobre el número de `note_creates`/`edges`/blocks por propuesta más allá de la
  validación estructural. **Not evidenced.**
- **Concurrencia entre dos commits que tocan la misma nota.** La atomicidad por transacción está
  probada, pero no se evidenció el comportamiento exacto ante dos `commit_proposal` simultáneos
  sobre solapamiento (más allá de que los índices UNIQUE y el replace-on-write de `part_of`
  resuelven el caso de reparent). **Not evidenced.**
- **Recuperación del `versionstamp` que devuelve `null`.** El código contempla que el
  `versionstamp` no aflore (entonces el changeset "no es changefeed-anchorable"); el impacto
  funcional de ese caso para el usuario no está documentado más allá de que `result.versionstamp`
  queda `null`. **Parcialmente evidenciado.**
