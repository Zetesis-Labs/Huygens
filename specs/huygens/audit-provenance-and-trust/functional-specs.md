# Huygens — Audit, Provenance & Trust — Functional Specification

> App: `huygens` · Initiative: `audit-provenance-and-trust`
> Reverse-engineered from the implementation (doctrine SSOT, data-model, ADRs,
> MCP tool code, and the `db:verify-fold` acceptance script). Describes the
> trust/auditability promise as a set of **functional guarantees the user can
> rely on**, not as a database design.

## 1. Summary

Huygens es una **memoria de confianza** personal, no una secretaria pasiva. Su
valor no está en almacenar texto, sino en una promesa concreta sobre ese
almacenamiento: **todo lo que entra al grafo es auditable y citable**
—rastreable hasta la evidencia literal que el usuario dijo— y **nada muta sin el
mandato del usuario**. Esta iniciativa cubre esa promesa como garantía
funcional: qué puede verificar el usuario, qué puede reconstruir, qué le promete
el sistema que nunca pasará en silencio, y —con la misma honestidad que la
doctrina— qué partes de la promesa las hace cumplir la máquina y qué partes
dependen de que el agente las respete.

La promesa se sostiene sobre cinco garantías observables:

1. **Toda decisión del agente queda registrada** con su intención (`agent_event`,
   append-only): qué hizo, quién, en qué sesión, sobre qué, con qué razonamiento,
   con qué modelo y a qué coste.
2. **Toda llamada a una tool del MCP queda registrada** (`mcp_tool_call`,
   append-only).
3. **El sistema nunca muta en silencio**: o un `agent_event` registró la
   intención, o el CHANGEFEED (10 años) tiene el diff exacto, o ambos — y eso
   habilita **viaje en el tiempo** (ver el estado de cualquier tabla en cualquier
   instante pasado) y **detección de drift**.
4. **El grafo vivo es un pliegue verificado del log** (`the live graph ==
   fold(log)`): no es aspiración, está *probado* por `bun run db:verify-fold`,
   que reconstruye el grafo desde cero en una BD sombra y lo compara campo a
   campo contra el vivo → diferencia = 0.
5. **Nada estructural entra sin un commit aprobado**: la frontera de escritura
   (el lector corre como VIEWER y la BD rechaza la escritura) es la mitad de
   *confianza* de la promesa.

Sobre esas garantías se apoya la **procedencia como garantía**: cualquier
interpretación puede trazarse a sus raws con una etiqueta de transformación
(`verbatim | extracted | summarized | inferred`) que separa *lo que el usuario
dijo* de *lo que se infirió*; y cada edge lleva estampado el commit que lo
materializó (`via_proposal`), de modo que la topología es auditable hasta su
origen.

**Límite de esta iniciativa.** Aquí se documentan las garantías de confianza
**en sí mismas**: el registro, el pliegue, la procedencia, la frontera y el
mapa muro/barandilla. Las tools que *exponen* la procedencia al usuario como
preguntas-y-respuestas (`check_claim`, `trace_provenance` como Q&A) pertenecen a
`retrieval-and-grounding` y aquí aparecen solo como *la forma en que la garantía
se hace visible*. La mecánica del commit (preview, payload, edges) pertenece a
`processing-proposals-and-commit` y aquí aparece solo como *la frontera como
promesa*. El modelo de notas y edges pertenece a `graph-model-notes-and-topology`.

## 2. Actors & Roles

| Actor | Rol en la confianza |
|---|---|
| **Usuario (Rubén) — el confiante** | La persona cuya memoria es esto. Es la **fuente del mandato**: nada estructural muta sin su orden o su aprobación. También es el **auditor de facto**: hoy no hay revisor automático del trail, así que quien revisa anomalías es él (o un agente bajo su petición). Los muros lo protegen a él; no se aplican *contra* él. |
| **El usuario-como-auditor / lector de confianza** | El mismo usuario, en el rol de *interrogar la memoria*: "¿de dónde sale esta afirmación?", "¿cómo era esta nota la semana pasada?", "¿qué se cambió ayer y por orden de qué?". Las tools de trazado y el CHANGEFEED existen para responderle. |
| **Agente conversacional / worker / cualquier cliente MCP** | El sujeto **sometido a los muros**. Opera la memoria a través de tools estrechas. Cada decisión suya genera un `agent_event`; cada tool suya, un `mcp_tool_call`. Es el actor cuyas violaciones de *barandilla* quedan registradas y son auditables a posteriori. La doctrina le ordena **tratar cada barandilla como si fuera muro**. |
| **MCP Huygens — el enforcer (servidor)** | La frontera de validación. Hace cumplir como **muros de servidor** las reglas que puede verificar (preview obligatorio, `approved: true` en rituales, unicidad por período, aciclicidad de `part_of`, `anchored: true` en `part_of`). No puede ver la conversación, así que el "mandato" en sí queda como barandilla. Emite los `agent_event` y registra los `mcp_tool_call`. |
| **SurrealDB — el enforcer (motor)** | La capa más dura. Hace cumplir como **muros de motor**: el rol VIEWER (`huygens_reader`) rechaza toda escritura del lector; los índices UNIQUE (padre único, un edge por par); los `ASSERT` de enums; la transacción única todo-o-nada. Mantiene el CHANGEFEED 10y que habilita el viaje en el tiempo. |

## 3. Goals & User Jobs

El objetivo de la iniciativa es que el usuario pueda **confiar en su propia
memoria** sin tener que confiar a ciegas en el agente que la opera. Jobs:

- **Verificar el pliegue.** Poder probar, en cualquier momento, que el grafo
  vivo no contiene nada que el log no explique: que es reconstruible. (`db:verify-fold`.)
- **Trazar una interpretación a su evidencia.** Para cualquier nota o block,
  saber de qué raws deriva y con qué transformación, distinguiendo lo dicho de
  lo inferido. (Procedencia vía `derived_from` + `trace_provenance`.)
- **Atar cada cambio topológico a su commit.** Saber qué propuesta materializó
  un edge concreto (`via_proposal`).
- **Viajar en el tiempo / diff de estado.** Ver el estado de una tabla en un
  instante pasado y los cambios entre dos momentos. (CHANGEFEED 10y.)
- **Auditar una decisión.** Reconstruir por qué el agente hizo algo: su
  intención, su razonamiento, su modelo y su coste. (`agent_event` por
  `session_id`/`subject`.)
- **Confiar en que nada se cuela.** Tener la garantía de que ningún cambio
  estructural ocurrió fuera de un commit aprobado (frontera VIEWER), y que lo que
  *sí* puede colarse (barandillas) al menos **queda registrado**.
- **No perder el rastro aunque se borre el dato vivo.** Que soltar una MIT
  (`mit_for: null`) o limpiar un campo no borre la *historia* de que existió
  (`mit_history` reconstruida del log).

## 4. Entry Points

Las tools y checks que **exponen** las garantías (no las que mutan — esas viven
en otras iniciativas):

| Entry point | Tipo | Garantía que expone |
|---|---|---|
| `bun run db:verify-fold` (`scripts/verify-fold.ts`) | Script CLI (root) | Prueba el invariante del pliegue: reconstruye el grafo en una BD sombra y lo diffea contra el vivo → DIFF = 0. Check **puntual** (point-in-time). |
| `trace_provenance` | Tool MCP (read-only) | Procedencia de una nota/block: sus raws `derived_from` (con `transformation`) y sus links `about`/`affects`. Separa *dicho* de *inferido*. (Q&A → `retrieval-and-grounding`.) |
| `check_claim` | Tool MCP (read-only) | Verifica una afirmación triple a triple contra el grafo (`supported` / `contradicted` / `unsupported`). (Q&A → `retrieval-and-grounding`.) |
| `mit_history` | Tool MCP (read-only) | El timeline de MITs por nota reconstruido del commit log (`assigned → moved → cleared`), con propuesta y timestamp. Sobrevive a `mit_for: null`. |
| `get_proposal_changes` | Tool MCP (read-only) | Los cambios exactos de un commit, leídos del `payload` almacenado (ids reales) — sin dependencia del changefeed, durable. |
| `changes_between` | Tool MCP (read-only) | Grafo de cambios agregado de todo lo commiteado entre dos fechas (fusiona commits, tally por día). |
| `query_query` / `run_query` | Tool MCP (read-only, VIEWER) | SurrealQL de solo lectura: habilita `SHOW CHANGES FOR TABLE x SINCE $vs` (viaje en el tiempo / diff de estado) y `SELECT ... AT $t` (estado histórico). Las escrituras se rechazan por construcción. |
| `retract` | Tool MCP (mutación auditada) | El **único** camino de borrado; `dry_run: true` por defecto; emite un `agent_event:retracted` (intención) y deja el diff en CHANGEFEED (estado). Es la otra mitad del pliegue: los `retracted` son los *deletes* que se reproducen al reconstruir. |
| `collection_stats` | Tool MCP (read-only) | Salud del grafo: conteos y cobertura de embeddings (señal de índice). |
| `agent_event` (tabla) | Registro append-only | Toda decisión del agente, queryable por `kind`, `session_id`, `subject`, `actor`, ventana temporal. |
| `mcp_tool_call` (tabla) | Registro append-only | Toda invocación de tool, queryable por `tool`, `ok`, ventana temporal. También se vuelca a stderr como línea JSON greppable (`[tool] {...}` vía `docker logs`). |

## 5. Workflows

Cada uno es **start/trigger → pasos → end condition**.

### 5.1 Verify-the-fold (probar que `grafo == fold(log)`)

- **Trigger.** El usuario (o el agente bajo su petición) quiere probar que el
  grafo vivo es reconstruible desde el log — recomendado "después de cualquier
  cosa inusual".
- **Pasos.**
  1. Se ejecuta `bun run db:verify-fold` con credenciales root.
  2. El script lee del grafo vivo: los `proposal` con `status='committed'`
     (ordenados por `committed_at`) y los `agent_event` con `kind='retracted'`
     (ordenados por `created_at`).
  3. Levanta una **BD sombra** desechable (`main_shadow`), le aplica
     `schema.surql` + `seed.surql`, y vacía las tablas de proyección.
  4. **Reproduce los creates**: por cada proposal commiteada, reconstruye su
     transacción (`buildReplayTx` — el mismo código del commit) y la aplica a la
     sombra.
  5. **Reproduce los deletes**: por cada `retracted`, borra las notas/blocks
     (cascada de blocks propios de una nota) y sus edges incidentes.
  6. Toma un **snapshot estructural** de ambos grafos (vivo y sombra) y los
     **diffea campo a campo**: notas (title, type, state, mit_for, due_at,
     defer_until, metadata, block_order, source_*), blocks narrativos (content,
     kind), blocks descriptivos (por (note, content)), y **cada edge** (in, out,
     `via_proposal` + metadata por tabla: `blocked_by.reason`, `affects.action`/
     `summary`, `derived_from.transformation`).
  7. Imprime el desglose por categoría y el `TOTAL STRUCTURAL DIFF`.
- **End condition.** `DIFF = 0` ⇒ el invariante se sostiene en este instante
  (✅ `graph == fold(log)`). `DIFF > 0` ⇒ algo en el grafo vivo no lo explica el
  log (drift) y se lista qué.
- **Notas honestas.** Es **no destructivo** (solo escribe en `main_shadow`).
  Excluye como *cache derivada* los timestamps (`created_at`, `updated_at`,
  `topologized_at`, `since`, `last_reviewed_at`) y los embeddings: no son
  invariantes de dominio, se recalculan. Es un check **puntual**: prueba el
  estado *ahora*, no garantiza el futuro.

### 5.2 Trace-an-interpretation-to-evidence (citar, y separar dicho de inferido)

- **Trigger.** El usuario pregunta "¿de dónde sale esto?" sobre una nota o un
  block, o el agente va a *asertar* algo y debe citarlo.
- **Pasos.**
  1. `trace_provenance(id)` con un `note:` o `block:` (cualquier otra tabla se
     rechaza).
  2. Si es un **block**: lista sus `derived_from` → raws (con `transformation`),
     más sus links `about`/`affects` a notas.
  3. Si es una **nota**: lista los blocks que la interpretan (`about`/`affects`
     entrantes) y, a través de ellos, los raws de los que derivan.
  4. Devuelve texto verbalizado ("deriva de: … (verbatim) [vía …]") + JSON.
- **End condition.** El usuario ve la cadena interpretación → evidencia y la
  etiqueta de transformación de cada fuente. Donde no hay procedencia, lo dice
  explícitamente ("(sin procedencia registrada)").
- **Garantía que materializa.** La transformación separa *lo que el usuario dijo*
  (`verbatim`/`extracted`) de *lo que se infirió* (`inferred`); un raw ausente de
  transformación se reporta como `inferred` por defecto (lectura conservadora).

### 5.3 Time-travel-a-table / state-diff (ver el pasado, detectar drift)

- **Trigger.** El usuario quiere ver cómo era una tabla/nota en un instante
  pasado, o qué cambió desde una fecha.
- **Pasos.**
  1. Vía `query_query`/`run_query` (VIEWER): `SHOW CHANGES FOR TABLE x SINCE $vs`
     (deltas desde un versionstamp/fecha) o `SELECT * FROM note:abc AT d'<fecha>'`
     (estado histórico).
  2. Para cambios atados a propuestas concretas: `get_proposal_changes` (del
     payload, durable) o `changes_between(from, to)` (agregado por día).
- **End condition.** El usuario ve el estado o el diff histórico.
- **Notas honestas.** El time-travel solo funciona **desde el momento en que se
  activó el CHANGEFEED** (deltas, no snapshots): pedir un instante anterior a su
  activación no devuelve datos. La historia rica del CHANGEFEED **no sobrevive a
  un `EXPORT/IMPORT`** ni más allá de la retención de 10 años; la trazabilidad
  *mínima* (qué propuesta, cuándo) sí perdura, porque vive en filas planas
  (`payload` + `committed_at`).

### 5.4 Audit-a-decision (reconstruir el porqué de una acción del agente)

- **Trigger.** "¿Por qué el agente hizo esto?", o una revisión de coste/actividad.
- **Pasos.**
  1. Query sobre `agent_event` por `subject` (qué le pasó a un record), por
     `session_id` (reconstruir un flujo entero), por `kind` o por `actor`.
  2. Cada evento trae intención: `kind`, `actor`, `payload`, `reasoning_summary`,
     `model`, `tokens_used`, `duration_ms`.
  3. Para cruzar **intención vs estado real**: combinar los `agent_event` del
     subject con el `SHOW CHANGES` de la tabla desde el primer evento (la receta
     reasoning + state del ADR-0020).
- **End condition.** El usuario reconstruye qué decidió el agente, con qué
  razonamiento y a qué coste, y lo contrasta con el diff real materializado.
- **Garantía clave (no-mutación-silenciosa).** Si un cambio aparece en el
  CHANGEFEED **sin** un `agent_event` asociado, es **sospechoso por
  construcción**: drift. La promesa es: *o intención registrada, o diff, o ambos*.

### 5.5 Audit-the-guardrail-trail (revisar lo que solo es barandilla)

- **Trigger.** Sospecha de que el agente violó una *barandilla* (marcó MITs por
  iniciativa, puso un `kind` sin ritual real, asumió un padre sin que el usuario
  lo dijera, >3 MITs en un día).
- **Pasos.** Las violaciones de barandilla quedan en `agent_event` + CHANGEFEED +
  `proposal.result`/`payload` y la Bitácora las expone; se detectan con queries a
  posteriori (p. ej. "MITs marcados sin orden", "commits con `kind`",
  "reparentings", "días con >3 MITs").
- **End condition.** El usuario detecta (o descarta) la anomalía.
- **Nota honesta (gap conocido).** **Hoy nada revisa ese trail
  automáticamente.** Es un gap declarado (`docs/issues/2026-06-09`, DOCT-002): el
  panel de anomalías contables del dashboard está pendiente. Que sea *detectable*
  no lo hace *aceptable* — por eso la doctrina ordena tratar cada barandilla como
  muro.

### 5.6 Recover-MIT-history (rastro que sobrevive al borrado del dato vivo)

- **Trigger.** "¿Cuántos días seguidos planifiqué una MIT?", "¿esta tarea fue MIT
  alguna vez?".
- **Pasos.** `mit_history(note_id?)` reconstruye, leyendo solo el log, el timeline
  por nota: cada escritura de `mit_for` en un commit se clasifica `assigned`
  (primera fecha), `moved` (fecha posterior distinta) o `cleared` (`null`), con la
  propuesta y el timestamp que la commiteó.
- **End condition.** El usuario ve la historia completa **aunque** `note.mit_for`
  vivo sea `null`: soltar una MIT borra la *celda viva*, no el *rastro*. Es la
  fuente de verdad para rachas de coaching.

## 6. Functional Rules & Constraints — el mapa muro/barandilla como reglas de confianza

La distinción central de la doctrina: un **muro** lo hace cumplir el sistema (si
lo intentas, falla); una **barandilla** existe solo si el agente la respeta (el
servidor acepta la mutación, y la violación solo es detectable *a posteriori* en
el trail). Ante un muro el agente puede apoyarse en el error; ante una
barandilla **el agente es el único enforcement**. Regla rectora de la doctrina:
**"trata cada barandilla como si fuera muro."**

### Muros (el sistema lo impide)

| Regla de confianza | Quién la hace cumplir |
|---|---|
| El lector no puede escribir (`query_query`/`run_query` son read-only) | **Motor** — rol VIEWER de `huygens_reader`; la BD rechaza la escritura. *Esta es la mitad de "confianza" del pliegue: nada entra sin commit aprobado.* |
| Padre único en `part_of` | Motor — índice UNIQUE sobre `in` (replace-on-write en commit) |
| Un solo edge por par `(in, out)` | Motor — índices UNIQUE por edge |
| Enums de `state`, `status`, `action`, `transformation`, `block_kind` | Motor — `ASSERT` en el schema |
| El commit es todo-o-nada | Motor — transacción única `BEGIN…COMMIT` |
| Toda mutación estructural pasa por `commit_proposal` (única puerta de escritura al grafo) | Motor — no hay otra vía; el lector es VIEWER |
| `via_proposal` estampado en **cada** edge que crea un commit | Servidor — único choke-point (`edgeContent`): si no hay `proposalId`, lanza "commit invariant violated". Cobertura viva 100% (0 NONE). |
| La propuesta fue **previsualizada** antes del commit | Servidor — `get_proposal` estampa `previewed_at`; `update_proposal` lo invalida; `commit_proposal` lo exige ("nada estructural se commitea sight-unseen") |
| Ritual (`kind: day`/`week`) exige `approved: true` | Servidor — `commit_proposal` lo rechaza sin él |
| Una jornada por día Madrid; una `week` por semana ISO Madrid | Servidor — rechazo del duplicado, frontera DST-correcta (`madrid-time.ts`); cuenta solo blocks **vivos** (un retract+recommit corrige) |
| `part_of` no forma ciclos | Servidor — check de alcanzabilidad en `commit_proposal` |
| `part_of` exige `anchored: true` (el usuario dijo el padre) | Servidor — un `part_of` sin `anchored` se rechaza |
| Payload validado; fechas → medianoche UTC del día escrito | Servidor — validación Zod + normalización |
| `retract` no borra sin confirmación | Servidor — `dry_run: true` por defecto, cascade acotado, emite `agent_event:retracted` |
| El worker del dashboard no commitea | Cliente — `commit_proposal` excluido de su toolset (el commit es siempre humano) |

### Barandillas (solo el agente lo impide; detectable a posteriori)

| Regla de confianza | Por qué no es muro |
|---|---|
| El mandato del usuario autoriza el commit | `approved: true` lo escribe el propio agente; el servidor **no ve la conversación** |
| Que el usuario *de verdad* ancló ese padre | `anchored: true` lo escribe el agente; el servidor no ve la conversación |
| Los MITs los decide el usuario, nunca por iniciativa | El servidor acepta cualquier `mit_for` |
| 1-3 MITs por día | Barandilla **deliberada**: convención, no recuento enforced (si el usuario quiere 5, son 5) |
| `kind` solo dentro del ritual invocado | El servidor no puede saber si hubo ritual; solo valida `approved` y unicidad — y la Bitácora lo expone |
| No topologizar automáticamente sin revisión | Acotada por el preview obligatorio, pero el juicio es del agente |
| Invitar a rituales sin fabricarlos | Puro comportamiento |

### Append-only y no-mutación-silenciosa (invariantes de registro)

- `agent_event` y `mcp_tool_call` son **append-only por construcción** (son el
  log; deliberadamente **sin** CHANGEFEED — ya son el audit). `created_at` es
  `READONLY`.
- El registro es **best-effort y no bloqueante**: emitir un `agent_event` o
  registrar un `mcp_tool_call` **nunca** rompe ni ralentiza la operación padre
  (los fallos van a stderr). *Consecuencia honesta:* un fallo de registro no
  aborta la acción — el log es completo en el camino feliz, no transaccional con
  la mutación. (Matiz: el ADR-0019 describía emisión *síncrona* "si falla el
  evento, falla la decisión"; la implementación actual de `emitEvent`/`logToolCall`
  es best-effort que nunca lanza.)
- **Promesa rectora:** el sistema nunca muta en silencio — *o* un `agent_event`
  registró la intención, *o* el CHANGEFEED tiene el diff, *o* ambos. Un cambio en
  CHANGEFEED sin `agent_event` asociado es drift por construcción.

### Perímetro (mutaciones de confianza fuera del ciclo de proposal — por diseño)

- `capture` y `set_raw_status` mutan el plano de **evidencia** directamente:
  capturar es barato y no compromete el grafo (la evidencia no se interpreta).
- `save_query` y `save_conversation`/`delete_conversation` escriben estado
  auxiliar del dashboard, fuera del ciclo de proposal — **no son topología** (no
  llevan CHANGEFEED de dominio).

## 7. Data Concepts (glosario)

Glosario de los conceptos de confianza tal como el usuario los percibe (no es un
schema).

- **`agent_event`** — Registro append-only de *una decisión del agente*: su
  **intención**. Campos: `kind` (enum: `raw_received`, `raw_status_changed`,
  `proposal_created`, `proposal_updated`, `proposal_discarded`,
  `proposal_committed`, `note_state_changed`, `retracted`), `actor`
  (`worker | conversational | user | system`), `session_id` (UUIDv7, ordenable y
  agrupable), `subject` (el record afectado), `payload`, `confidence`,
  `reasoning_summary`, `model`, `tokens_used` (input/output/cached),
  `duration_ms`, `created_at` (READONLY). Una sola tabla polimórfica para que las
  queries crucen kinds.
- **`mcp_tool_call`** — Registro append-only de *una invocación de tool*: su
  **traza**. Campos: `tool`, `ok`, `duration_ms`, `args` (dump completo),
  `result` (cuando existe), `error`/`code`, `created_at` (READONLY). Capturado en
  el único choke-point (`defineTool`) → toda tool se registra de forma uniforme.
  Dos sinks: stderr (greppable, no falla) y la tabla (sobrevive a reinicios).
- **`changefeed`** — El log incremental de *deltas* que el motor SurrealDB
  mantiene sobre las tablas críticas (`raw_capture`, `note`, `block`, todos los
  edges, `proposal`) con retención **10 años**. Habilita el **viaje en el
  tiempo** (`SELECT … AT $t`) y el **diff de estado** (`SHOW CHANGES … SINCE
  $vs`). Es la **capa de estado** ("qué cambió"), complementaria a `agent_event`
  (la capa de intención, "por qué").
- **`fold` / fold invariant** — La tesis verificada: el grafo vivo es un
  **pliegue determinista del log** (`the live graph == fold(log)`). Reconstruir =
  reproducir los creates (commits) + los deletes (`retracted`) sobre una BD
  sombra. Probado por `db:verify-fold` con DIFF = 0. *Scope del invariante (el
  contrato honesto):* entidades (por id) + topología (kind, in, out) +
  procedencia (`via_proposal`) + contenido; **excluidos** como cache derivada:
  timestamps y embeddings.
- **`provenance` (procedencia)** — La cadena interpretación → evidencia. Vive en
  el edge `derived_from` (block → raw_capture) con su **`transformation`**:
  `verbatim` (literal) | `extracted` (recortado del raw) | `summarized`
  (resumido) | `inferred` (inferido, no dicho). Es lo que permite **citar** una
  afirmación y **separar lo dicho de lo inferido**.
- **`via_proposal`** — El sello que ata *cada edge* al commit que lo materializó
  (`option<record<proposal>>` en toda tabla de edge). Lo estampa el commit en el
  `RELATE`; cobertura viva **100%** (0 NONE). Es lo que hace la topología
  auditable hasta su origen.
- **`genesis` (`proposal:genesis`)** — El commit-snapshot que **aplanó la
  historia vieja, no reproducible** (payloads legacy con `temp_id`, muchos sin
  mapa temp→real) en una sola propuesta commiteada: el primer evento del log
  event-sourced. Los edges legacy se rellenaron (backfill) a `proposal:genesis`
  (snapshot bootstrap) o al commit real post-genesis que los declaró.
- **`superseded`** — Cuarto estado de una propuesta: las propuestas legacy
  *aplanadas* en el genesis. Quedan **fuera de la ventana de fold/rebuild** (que
  solo reproduce `committed`); sus payloads se conservan para auditoría pero no
  son parte de la proyección viva. Es, por conteo, el estado más común (artefacto
  de la migración única), aunque **ninguna tool transiciona *hacia* él** en
  runtime.
- **`retract` / `agent_event:retracted`** — El único camino de borrado auditado.
  Borra records + edges incidentes atómicamente (`dry_run` por defecto) y emite un
  `agent_event` de `kind:'retracted'` con lo borrado. Estos eventos son los
  **deletes** que el pliegue reproduce.
- **`mit_history`** — El timeline de MITs por nota **reconstruido del commit
  log** (`assigned → moved → cleared`). Garantía: el rastro **no se pierde**
  aunque `mit_for` vivo se limpie a `null` — soltar una MIT borra la celda viva,
  no su historia.

## 8. Graphical Representation

(Omitida — esta iniciativa es la garantía de confianza subyacente, headless. La
visualización del grafo de cambios y la Bitácora viven en `dashboard-ui`.)

## 9. Restrictions & Tradeoffs (los caveats honestos)

Estos límites **forman parte del comportamiento real** y la doctrina/los docs los
declaran explícitamente. Listarlos es parte de la promesa de confianza.

1. **`via_proposal` aún no es un assert duro de la capa de commit.** Hoy la
   cobertura viva es 100% y el único choke-point (`edgeContent`) lanza si falta el
   `proposalId`, pero **un camino de código futuro podría reintroducir NONE** sin
   un assert formal a nivel de commit. Está rastreado como **M2a**.
2. **El `rebuildGraph` de producción sigue *guardado off* y es destructivo.** No
   aplica eventos de retracción y no hace shadow-swap ni re-embed; por defecto
   **se niega a correr** (lanza un error que exige `allowProvenanceFlattening:
   true`). El motivo: reproducir el log *hoy* re-estamparía toda la topología
   pre-genesis con `proposal:genesis`, colapsando la procedencia real por edge —
   destruyendo justo el invariante de auditoría. `db:verify-fold` prueba que un
   rebuild *correcto* es alcanzable, **pero el botón de producción no es ese
   camino todavía** (Option A). Hasta que el rebuild sea provenance-preserving, la
   reconstrucción real solo se hace en la BD sombra del verify.
3. **`db:verify-fold` es un check *puntual* (point-in-time).** Prueba el
   invariante *en el instante en que se corre*; no es continuo ni preventivo. Hay
   que re-ejecutarlo "después de cualquier cosa inusual".
4. **No hay revisor automático del trail de barandillas.** Las violaciones de
   barandilla (MITs por iniciativa, `kind` sin ritual, padre asumido, >3 MITs/día)
   quedan registradas y son detectables a posteriori, pero **hoy nada las
   revisa**: el panel de anomalías contables del dashboard está pendiente (gap
   conocido, `docs/issues/2026-06-09`, DOCT-002). El cierre del bucle depende del
   usuario.
5. **El "mandato" no es verificable por el servidor.** `approved: true` y
   `anchored: true` los escribe el propio agente; el servidor no ve la
   conversación, así que esas barandillas críticas no pueden promoverse a muro
   (validar "mandato" es imposible desde el servidor). De ahí la regla "trata cada
   barandilla como muro".
6. **Las propuestas `superseded` caen fuera de la ventana de fold/rebuild.** Su
   historia detallada no se reproduce; solo sus payloads quedan para auditoría.
7. **La historia rica del CHANGEFEED no es portable.** No sobrevive a
   `EXPORT/IMPORT`, cambio de motor, ni a la retención de 10 años; ni existe para
   instantes anteriores a la activación del CHANGEFEED. Solo la trazabilidad
   *mínima* (qué propuesta, cuándo) perdura, por vivir en filas planas.
8. **El registro es best-effort, no transaccional con la mutación.** `emitEvent`
   y `logToolCall` nunca lanzan: un fallo de registro no aborta la acción. El log
   es completo en el camino feliz; no hay garantía de atomicidad evento↔mutación.
   (Tensión con el ADR-0019, que describía emisión síncrona.)
9. **Borrar una nota no cascadea sus edges en el CHANGEFEED automáticamente** (a
   nivel motor): no hay `DEFINE EVENT` triggers. `retract` sí limpia los edges
   incidentes en su transacción; los edges huérfanos fuera de ese camino son
   detectables por query.
10. **Riesgos de perímetro declarados (anexo DOCT-2026-06-09), fuera de scope
    pero relevantes a la confianza:** sin estrategia de backup/restore del volumen
    SurrealKV (perder el volumen = perder TODA la memoria, y el CHANGEFEED vive en
    el mismo volumen); el MCP HTTP no tiene autenticación (las tools de escritura
    corren como root — crítico si se despliega fuera del devcontainer); sin
    versionado de migraciones.

## 10. Open Questions & Assumptions

**Open questions (decisiones de producto pendientes, evidenciadas):**

- **¿Se promueve `via_proposal` a assert duro de commit (M2a)?** Hoy es
  invariante por convención + choke-point, no por `ASSERT`.
- **¿Se hace el `rebuildGraph` de producción provenance-preserving (Option A)?**
  Requiere arrastrar `via_proposal` por genesis+replay y marcar los legacy
  explícitamente, más shadow-swap y re-embed.
- **¿Se construye el revisor/auditor del trail de barandillas (DOCT-002)?** El
  panel de anomalías contables del dashboard es lo único que mantiene ese issue
  abierto.
- **¿Se alinea la doctrina de registro con la implementación?** El ADR-0019 dice
  emisión síncrona ("si falla el evento, falla la decisión"); el código es
  best-effort. Hay que decidir cuál es la verdad y converger.
- **Tensión MIT abierta (docs/MODEL.md):** soltar una MIT borra el `mit_for` vivo;
  `mit_history` reconstruye el rastro del log, pero queda como decisión de
  producto si se quiere algo más que la reconstrucción.

**Assumptions (supuestos del análisis, claramente etiquetados):**

- *Supuesto:* la cobertura viva de `via_proposal` "100% (0 NONE)" reportada en
  data-model.md refleja el estado actual; no se re-verificó contra la BD en este
  análisis (la BD pudo quedar vacía tras la pérdida de volumen del 2026-06-09 —
  ver memoria de sesión).
- *Supuesto:* el ADR-0028 figura como *Proposed* en rama, pero sus decisiones
  (payload con ids reales, historia vía changefeed, `result` = ancla) ya están
  reflejadas en el código vivo (`commit.ts`, `genesis.ts`), así que se tratan como
  comportamiento implementado.

**Not evidenced (no probado desde el proyecto):**

- No se evidencia ninguna tool/endpoint que **exponga** `agent_event` o
  `mcp_tool_call` al usuario final como vista navegable (se consultan vía
  SurrealQL read-only). La "auditoría de decisiones" es hoy una capacidad de query,
  no una pantalla — coherente con que el panel de anomalías esté pendiente.
- No se evidencia la herramienta futura `replay_events(session_id)` del ADR-0019
  (reproducir una decisión en otro modelo): es trabajo futuro declarado, no
  implementado.
