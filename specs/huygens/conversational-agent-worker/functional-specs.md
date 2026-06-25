# Huygens — `conversational-agent-worker` — Functional Specification

> Reverse-engineered from the implemented `huygens-worker` service and its
> tests. Describes real behavior as implemented, not idealized intent.
> Scope: the conversational agent behind the dashboard chat. The visible chat UI
> is a sibling (`dashboard-ui`); the semantics of each MCP tool live in the tool
> siblings (`capture-and-inbox`, `processing-proposals-and-commit`,
> `retrieval-and-grounding`, `graph-model-notes-and-topology`); the ritual &
> coaching behavior it enacts lives in `rituals-and-coaching`.

## 1. Summary

`huygens-worker` es el **agente conversacional de Huygens**: la superficie con la
que Rubén habla desde el chat del dashboard. Es un agente Agno respaldado por un
modelo de OpenAI, expuesto sobre el protocolo **AG-UI** en el puerto `7777`, que
conduce la memoria estructurada de Rubén a través de las **tools del MCP de
Huygens** (capturar → procesar el inbox → redactar informe-blocks narrativos →
armar propuestas de mutación visibles). Está **activado por defecto** en el
despliegue (`WORKER_ENABLED` por defecto `true` en Compose).

El rasgo que define este servicio funcionalmente es lo que **no** hace: **nunca
commitea**. Su toolset son las tools del MCP **menos `commit_proposal`**, porque
el commit al grafo es siempre una acción humana que Rubén ejecuta desde la UI del
dashboard. Esto convierte al agente en un "cliente sin commit": prepara la
propuesta y la deja en draft, pero la frontera de aprobación la cruza la persona,
no el agente (límite garantizado a nivel de tool, no solo de instrucciones —
ADR-0026).

El agente es **conversacional, no autónomo** (README; ADR-0026): reacciona al
usuario en el chat, no a cambios en la base de datos. No existe loop de fondo. Su
**doctrina de comportamiento** (cuándo capturar, cuándo proponer, cuándo invitar
a un ritual, cómo responder desde el grafo) es la doctrina operativa de Huygens,
que el agente **busca en el MCP al arrancar y se inyecta a sí mismo** en su
system-prompt, porque Agno descarta el `instructions` del servidor MCP.

El boundary de esta iniciativa: el agente/servicio que vive detrás del chat. La
ventana de chat, el canvas y las páginas del dashboard son `dashboard-ui`. La
semántica interna de cada tool MCP que el agente invoca pertenece a sus
iniciativas hermanas; aquí se describe **cómo el agente las usa** y qué
comportamiento conversacional impone alrededor de ellas.

## 2. Actors & Roles

- **Rubén (usuario, único humano).** Habla con el agente desde el chat del
  dashboard. Es el **único que puede commitear** al grafo (desde la UI). El
  agente trata sus correcciones/órdenes explícitas como autorización para
  preparar una propuesta mínima fiel, pero la mutación real la confirma él.
- **El agente conversacional ("Huygens").** Un agente Agno (`name="Huygens"`)
  con persona fijada en su system-prompt: asistente de la memoria estructurada de
  Rubén, que **habla siempre en español** (código e identificadores en inglés) y
  actúa además como **coach del hábito ZTD** (enseña, no sustituye el juicio del
  usuario; ver `rituals-and-coaching`).
- **Sistema externo — MCP de Huygens** (`huygens-mcp`, `MCP_URL`,
  `http://huygens-mcp:3030/mcp` por defecto). Única superficie por la que el
  agente lee y escribe el grafo. Provee las tools y, en su respuesta de
  `initialize`, las `instructions` (doctrina + cookbook SurrealQL + schema en
  vivo) que el agente se inyecta.
- **Sistema externo — proveedor LLM (OpenAI).** Sirve el modelo de razonamiento
  vía la **Responses API** (`OpenAIResponses`). Requiere `OPENAI_API_KEY`.
- **Sistema externo — dashboard SSR (consumidor AG-UI).** El frontend del
  dashboard consume el agente vía AG-UI; el SSR del dashboard hace de **proxy de
  mismo origen** (`/api/agui` → `HUYGENS_AGUI_URL=http://huygens-worker:7777`).
  Es quien envía el historial de cada turno y posee el estado del canvas. (Detalle
  de UI: `dashboard-ui`.)

Roles de permiso relevantes a este servicio: el agente opera **sin el privilegio
de commit**; las lecturas del grafo se ejecutan como `huygens_reader` (VIEWER) a
través del MCP; ninguna escritura estructural pasa por el agente.

## 3. Goals & User Jobs

Objetivo del producto (esta iniciativa): dar a Rubén una **superficie
conversacional fiable** sobre su memoria estructurada, que respete la frontera de
confianza (nada muta sin su mandato y, aquí, sin su commit) y que le **enseñe** a
operar su sistema en vez de hacerlo por él.

Jobs-to-be-done de Rubén con el agente:

- **Soltar algo sin ceremonia** y que quede capturado como evidencia, sin que el
  agente le interrogue.
- **Corregir/ordenar un cambio de estado** ("cerré X", "Y pasa a WAITING") y que
  el agente prepare la propuesta mínima fiel y la **deje lista para commit**, sin
  re-preguntar lo ya dicho.
- **Procesar el inbox** en una sesión deliberada y obtener uno o varios
  informe-blocks con sus mutaciones propuestas, visibles antes de aplicarse.
- **Preguntar por el estado de algo** ("¿cómo va X?", "¿qué tengo pendiente?") y
  recibir una respuesta **anclada en el grafo**, verificada, no improvisada.
- **Ver el contexto como grafo**: pedir "muéstralo en un grafo" y que el agente
  pinte una vista conectada (nodos + aristas) en el canvas.
- **Ser invitado** (proactivamente) a los rituales diario/semanal en el momento
  adecuado, sin que el agente fabrique el ritual por su cuenta.
- **Conservar y recuperar conversaciones** del chat (hilo + estado del canvas):
  guardarlas, listarlas, reabrirlas, borrarlas.

Job que el agente **no** puede cumplir por diseño: **commitear**. Si Rubén lo
pide, el agente lo explica y le indica dónde se hace (ver Workflow 6).

## 4. Entry Points

- **Endpoint AG-UI `POST /agui` en el puerto `7777`** (servido por Agno
  `AgentOS.serve` con la interfaz `AGUI`). Es la única superficie de entrada del
  agente. El puerto se **expone** en la red interna del Compose, **no se
  publica**; el dashboard SSR proxya hacia él (no hay superficie pública nueva —
  ADR-0026). Cada turno del chat entra por aquí; el **historial lo transporta el
  hilo AG-UI** (el frontend lo reenvía en cada turno), así que el agente no
  guarda historial propio.
- **Arranque del proceso (`huygens-worker` / `__main__.main`).** Al boot:
  registra `mcp_url`, `actor` y `worker_enabled`; si el worker está
  **deshabilitado** no sirve el agente y duerme indefinidamente (ver Workflow 7);
  si está habilitado pero falta `OPENAI_API_KEY`, **aborta** con
  `SystemExit("OPENAI_API_KEY is required to serve the AG-UI agent")`.
- **Fetch de doctrina contra el MCP (`initialize`)** durante la construcción del
  agente: el worker llama al MCP para traer sus `instructions` y armarse el
  system-prompt completo (ver Workflow 8). Es una llamada de salida hacia un
  sistema externo, parte del arranque.
- **Llamadas de tool salientes al MCP** (`MCPTools`, transport
  `streamable-http`, contra `MCP_URL`): toda lectura/escritura de propuesta que
  el agente realiza durante una conversación. La tool `commit_proposal` está
  **excluida** de esta superficie.

No hay entry points programados (cron), ni webhooks, ni un loop que reaccione a
la BBDD: esa responsabilidad autónoma quedó como trabajo futuro y no se
materializó (ADR-0026).

## 5. Workflows

Convención: cada workflow es **disparo → pasos → fin**, con caminos alternos y de
error. Los workflows 1–5 describen cómo el agente **encarna la doctrina
operativa** sobre las tools del MCP; la semántica detallada de cada tool vive en
las iniciativas hermanas.

### Workflow 1 — Capturar sin ceremonia

- **Disparo:** el usuario suelta algo en el chat que no es ni consulta ni orden
  (información, una idea, un hecho).
- **Pasos:** el agente clasifica la interacción ("¿solo está soltando algo?") y
  **captura** el texto como `raw_capture` pendiente vía `capture`, sin preguntar.
  La captura es evidencia literal, no compromete el grafo.
- **Fin:** el raw queda en el inbox; el agente confirma brevemente y termina con
  un resumen en texto (nunca acaba en una tool-call muda).
- **Alterno:** si lo soltado es a la vez una corrección de estado, se trata como
  Workflow 2.

### Workflow 2 — Corrección/orden explícita → propuesta mínima dejada en draft (la adaptación "cliente sin commit")

- **Disparo:** el usuario da una corrección u orden explícita sobre una nota
  ("eso ya está hecho" → DONE; "X pasa a WAITING" → WAITING).
- **Pasos:**
  1. El agente entiende la orden como **la aprobación** para una propuesta
     **mínima y fiel** a esa orden — **no re-pregunta** lo ya dicho ni pide
     permiso para prepararla.
  2. Arma la propuesta con `create_proposal` (y la refina con `update_proposal`
     si hace falta), **sin `kind`** (un cambio de estado a media jornada no es un
     ritual). Antes de proponer crear algo nuevo, comprueba duplicados (vía la
     tool de búsqueda semántica del MCP).
  3. La deja **en draft** y **anuncia que está lista para commit**.
- **Fin:** existe un draft visible (en *Borradores* del dashboard) listo para que
  Rubén lo commitee desde la UI. El agente **no** intenta commitear.
- **Alterno (ambigüedad / topología nueva):** si la orden es ambigua o implica
  topología o notas nuevas, el agente **sí pregunta** antes de armar la
  propuesta. En particular, **no asume el `area`/parent** por el contexto
  reciente; si no se dijo el padre explícitamente, deja la nota sin parent o
  pregunta (un `part_of` exige que el usuario lo haya anclado).

### Workflow 3 — Procesar el inbox (sesión deliberada)

- **Disparo:** el usuario pide procesar, o hay inbox que interpretar.
- **Pasos:** sesión de proceso deliberada: el agente revisa los raws pendientes,
  **interpreta**, redacta uno o varios **informe-blocks narrativos** y propone
  las mutaciones acompañantes (notas, edges, `affects`), todo dentro de una
  propuesta. Aquí **sí** propone y repasa (hay interpretación). El informe va
  **sin `kind`** (un informe normal nunca lleva kind).
- **Fin:** una o varias propuestas en draft, visibles, listas para commit humano.
- **Error/alterno:** ante interpretación o topología no evidente, pregunta antes
  de comprometer la propuesta. (El guion paso a paso del modo de proceso es un
  *delta* sobre la doctrina; ver `processing-proposals-and-commit` y
  `rituals-and-coaching`.)

### Workflow 4 — Responder desde el grafo (grounding)

- **Disparo:** el usuario pregunta por el estado de algo (un proyecto, una
  persona, una tarea; "¿cómo va X?", "¿qué tengo pendiente?").
- **Pasos:**
  1. **Recupera antes de responder**: trae contexto conectado del grafo (vía
     recuperación híbrida vector+grafo por defecto, o expandiendo el vecindario
     de un nodo ya conocido, o búsqueda por término suelto).
  2. **Verifica antes de afirmar**: si va a asertar topología o estado, lo pasa
     por la comprobación de fidelidad del MCP, que dice triple a triple si el
     grafo lo sostiene, lo contradice o no lo cubre. No afirma lo no soportado
     como dato.
  3. **Cita la evidencia cuando importa** y distingue *lo que el usuario dijo* de
     *lo que se infirió* (vía el rastreo de procedencia del MCP).
- **Fin:** una respuesta anclada en el grafo, con la evidencia citable. El agente
  **no muta** para responder.
- **Regla de conflicto:** si el grafo y la memoria conversacional discrepan,
  **gana el grafo**; si el agente cree que el grafo está desactualizado, eso es
  una captura o una corrección (Workflows 1/2), no una respuesta inventada.

### Workflow 5 — Pintar una vista de grafo en el canvas

- **Disparo:** el usuario pide "muéstralo / enséñamelo en un grafo", o el agente
  decide ilustrar lo que acaba de explorar.
- **Pasos:** el agente ejecuta **una** consulta que devuelve **nodos y aristas
  reales** (no columnas planas tipo parent/grandparent), de modo que el canvas
  conecte de verdad. Prefiere tools que traen subgrafo conectado para "X en
  relación con Y"; usa SurrealQL read-only para agregaciones/tablas o jerarquías
  concretas; puede ejecutar una saved query que ya devuelve nodos + aristas.
  Si el usuario dice "muéstralo" sin nombrar el qué, **no pregunta "¿a qué te
  refieres?"**: usa lo último que mostró o mencionó. Puede **persistir** la vista
  con la tool de guardar consultas (id estable y legible) cuando merezca la pena.
- **Fin:** **una** vista por petición en el canvas (no varias consultas sueltas
  que lo fragmenten), más un **resumen en texto** de qué encontró y qué vista
  dejó. (El render del canvas es `dashboard-ui`.)

### Workflow 6 — El usuario pide commitear (sin tener la tool)

- **Disparo:** el usuario pide al agente que commitee una propuesta.
- **Pasos:** el agente reconoce que **no dispone de `commit_proposal`** y lo
  **dice**; señala **dónde** se commitea —hoy: una sesión MCP completa, p. ej.
  Claude Code; y el draft queda **visible en *Borradores* del dashboard** para
  commitearlo desde la UI— y **no lo intenta por otra vía**.
- **Fin:** el usuario sabe que el draft está listo y dónde cruzar la frontera de
  commit. No hay mutación.

### Workflow 7 — Arranque deshabilitado (guarda de despliegue)

- **Disparo:** el proceso arranca con `WORKER_ENABLED` falso (el default del
  *código* es `False`; el default del *despliegue* Compose es `true`).
- **Pasos:** loguea "huygens-worker disabled; set WORKER_ENABLED=true to serve
  the AG-UI agent" y entra en un sleep indefinido (no importa las deps del agente,
  no abre el puerto, no sirve AG-UI).
- **Fin:** proceso vivo pero inerte; ninguna superficie conversacional expuesta.
- **Camino habilitado (alterno):** con `WORKER_ENABLED=true`, si falta
  `OPENAI_API_KEY` aborta con `SystemExit`; si está, sirve el agente AG-UI en
  `AGUI_HOST:AGUI_PORT` (`0.0.0.0:7777` por defecto).

### Workflow 8 — Anclar la doctrina al arrancar (fail-fast)

- **Disparo:** construcción del agente al boot (camino habilitado).
- **Pasos:**
  1. El agente llama al MCP (`initialize`) para traer sus `instructions` (la
     doctrina operativa + cookbook SurrealQL + schema en vivo). Lo hace porque
     **Agno cablea las tools pero descarta esas `instructions`**, así que el
     agente nunca las vería si no las pidiera explícitamente.
  2. Reintenta hasta **5 veces** con **3 s** de espera entre intentos.
  3. Si las obtiene, las **concatena** a su system-prompt fijo (las
     `INSTRUCTIONS` hardcodeadas son solo un *resumen* y omiten reglas), bajo el
     bloque "Doctrina + cookbook SurrealQL + schema en vivo".
- **Fin:** el agente arranca con la doctrina completa inyectada y empieza a servir.
- **Error (doctrina no disponible):** tras 5 intentos fallidos, **rehúsa
  arrancar** con `RuntimeError` ("refusing to start with a degraded doctrine"),
  porque servir un agente de memoria con doctrina degradada es inaceptable
  (DOCT-004). **Opt-out:** con `ALLOW_DEGRADED_DOCTRINE=true` arranca igualmente,
  loguea el arranque degradado como *error*, y opera **solo con el resumen
  hardcodeado**.

### Workflow 9 — Persistir / recuperar conversaciones del chat

- **Disparo:** el usuario (o el frontend en su nombre) guarda, lista, reabre o
  borra un hilo de chat. (El disparo viene del dashboard; aquí se describe la
  capacidad funcional.)
- **Pasos / operaciones disponibles (tools del MCP en el toolset del agente):**
  - **Guardar** (`save_conversation`): persiste un hilo = **mensajes + estado del
    canvas** (vista activa + historial de vistas). Acepta un `title` (si no, se
    deriva) y un `id` existente para **actualizar** en vez de crear.
  - **Recuperar** (`get_conversation`): carga un hilo por id con sus mensajes y su
    estado de canvas (read-only). Si no existe, responde "Not found".
  - **Listar** (`list_conversations`): hilos persistidos, **el más recientemente
    actualizado primero**, con título y nº de mensajes (límite por defecto 50,
    máximo 200).
  - **Borrar** (`delete_conversation`): elimina un hilo por id.
- **Fin:** el hilo persiste/reaparece/desaparece. Los mensajes y el estado del
  canvas son **blobs opacos** propiedad del frontend; el agente/MCP no interpreta
  su forma. Esto es **estado auxiliar del dashboard fuera del ciclo de propuesta**
  (no es topología y no pasa por commit).

## 6. Functional Rules & Constraints

**Frontera de commit (la regla que define el servicio):**

- El agente **no commitea jamás**. `commit_proposal` está **excluido** de su
  toolset (`exclude_tools=["commit_proposal"]`). Es un **muro de cliente**: la
  herramienta no está disponible, no es solo una instrucción. El commit es
  siempre humano, desde la UI del dashboard.
- Adaptación "cliente sin commit": ante una orden explícita, prepara la propuesta
  mínima y fiel, la **deja en draft** y **anuncia que está lista**; **no pide
  permiso para prepararla** y **no re-pregunta** lo ya ordenado.
- Si el usuario pide commitear, lo **dice** y **señala dónde** se commitea (sesión
  MCP completa / *Borradores* del dashboard); **no busca otra vía**.

**Disciplina de comportamiento (heredada de la doctrina, que el agente inyecta):**

- **Captura sin ceremonia**; **una orden explícita ES la aprobación** para una
  propuesta mínima fiel; **preguntar solo** ante interpretación, topología nueva,
  ambigüedad o ritual.
- **Disciplina del `kind`:** un informe normal **no lleva `kind`**; etiquetar un
  ritual solo dentro del ritual invocado explícitamente por el usuario; ante la
  duda, sin `kind`.
- **Asimetría de iniciativa:** **invitar** a los rituales con iniciativa alta
  (es un coach), pero **nunca fabricar/mutar** el ritual por iniciativa; idéntica
  asimetría con los MITs (los decide el usuario). (Detalle en
  `rituals-and-coaching`.)
- **Frontera pedagógica:** enseña el hábito ZTD con palabras (máx. una
  micro-lección por turno, solo la primera vez de cada concepto), no sustituye el
  juicio del usuario; mide la madurez **leyendo el grafo**, nunca persistiendo un
  estado-de-coaching.
- **No asumir parent/área** por el contexto reciente; `part_of` exige que el
  usuario haya anclado el padre.
- **Grounding obligatorio** para responder por estado (recuperar → verificar →
  citar); el grafo gana sobre la memoria conversacional.

**Reglas de presentación / UX del agente:**

- **Habla siempre en español**; código e identificadores en inglés.
- **Termina siempre con un resumen en texto** (qué encontró, qué vista dejó);
  nunca acaba en una tool-call sin respuesta.
- **Una vista de grafo por petición**; las vistas devuelven nodos + aristas
  reales, no columnas planas.
- Es **conciso y directo**; explica su interpretación antes de proponer
  mutaciones.

**Reglas de arranque / configuración:**

- `WORKER_ENABLED` debe ser verdadero para servir el agente; falso = proceso
  inerte que duerme. Default de código `False`; default de despliegue (Compose)
  `true`.
- `OPENAI_API_KEY` es **obligatoria** en el camino habilitado; su ausencia aborta
  el arranque.
- La doctrina del MCP debe obtenerse al arrancar; si no, **fail-fast** salvo
  `ALLOW_DEGRADED_DOCTRINE=true`.
- Toda lectura del grafo va por el MCP como VIEWER (`huygens_reader`); el agente
  no tiene escritura estructural directa.

**Comportamiento de error encodeado en los tests (`test_settings`, `test_errors`):**

- `test_settings`: `WORKER_ENABLED` por defecto es **`False`**; con la variable
  de entorno `WORKER_ENABLED=true` pasa a **`True`** (la guarda de habilitación
  responde a entorno).
- `test_errors` (reconstrucción tipada de errores del MCP): cuando una tool del
  MCP falla, el servidor TS empaqueta `{code, message, details}` en
  `CallToolResult.structuredContent.error`; el worker lo **re-hidrata a una
  excepción tipada** por `code` para poder discriminarla. Casos cubiertos:
  - un `code` conocido (p. ej. `RAW_NOT_FOUND`, `BLOCK_NOT_FOUND`) produce la
    **subclase** correspondiente, conservando `code` y `details`;
  - un `code` **desconocido** cae al **`HuygensError` genérico** (no a una
    subclase concreta) — desconocido se degrada con gracia, no rompe;
  - `structuredContent` ausente o malformado (`None`, `{}`, `{"error": "string"}`,
    `{"error": null}`) devuelve `None` (no inventa un error);
  - `details` ausente por defecto es `{}` (nunca `None`).
  Estos códigos de error son el **contrato estable** entre el MCP y el worker; el
  texto del mensaje es para humanos y puede cambiar.

## 7. Data Concepts (glossary)

Conceptos que el agente percibe/maneja a nivel de producto (no schema de BBDD):

- **Conversación / hilo de chat** — una sesión del chat del dashboard
  persistible: un conjunto de **mensajes** (hilo assistant-ui) más un **estado de
  canvas** (vista activa + historial de vistas). Tiene `title` (derivable),
  `id`, nº de mensajes y `updated_at`. Es estado auxiliar del dashboard, **fuera
  del ciclo de propuesta**. Mensajes y estado son blobs opacos.
- **Canvas / vista** — la representación de grafo (nodos + aristas) que el agente
  genera con sus consultas y deja pintada; su estado viaja con la conversación.
  (El render es `dashboard-ui`.)
- **Propuesta (draft)** — el cambio completo que el agente arma
  (`create_proposal` / `update_proposal`), **visible** antes de aplicarse,
  esperando commit humano en *Borradores* del dashboard. El agente nunca la
  commitea. (Semántica completa: `processing-proposals-and-commit`.)
- **Raw capture (evidencia)** — texto literal del usuario capturado sin
  interpretar; entra al inbox como pendiente. (Detalle: `capture-and-inbox`.)
- **Informe-block (narrativo)** — la pieza central: un `block` narrativo que el
  agente redacta documentando la interpretación entre evidencia y topología. Sin
  `kind` salvo ritual. (Detalle: `processing-proposals-and-commit`.)
- **`kind` (etiqueta de ritual)** — marca opcional `day` / `week` (en runtime,
  según la doctrina inyectada) que distingue un informe de ritual de uno normal;
  solo dentro del ritual invocado. (Detalle: `rituals-and-coaching`.)
- **MIT (Most Important Task)** — foco del día; lo decide el usuario, el agente
  solo propone candidatas. (Detalle: `rituals-and-coaching`.)
- **Doctrina operativa** — el documento de comportamiento que el agente trae del
  MCP e inyecta en su system-prompt; manda sobre el resumen hardcodeado.
- **`actor`** — la identidad con la que el worker se atribuye en el audit del
  MCP (`agent_event.actor`); por defecto `worker`. Valores posibles: `worker`,
  `conversational`, `user`, `system`.
- **HuygensError tipado** — la jerarquía de errores que el worker reconstruye
  desde las respuestas del MCP, discriminada por un `code` estable (p. ej.
  `RAW_NOT_FOUND`, `BLOCK_NOT_FOUND`, `QUERY_ERROR`, `CONFIG_MISSING`, …).

## 8. Graphical Representation

Omitido por scope. La superficie visible (ventana de chat, canvas, páginas de
*Borradores*/Bitácora) es `dashboard-ui`; esta iniciativa cubre el
agente/servicio que vive detrás del chat, que es headless (un endpoint AG-UI).

## 9. Restrictions & Tradeoffs

- **Sin commit por diseño.** El agente no puede cerrar el ciclo
  captura→propuesta→commit; siempre deja al usuario el último paso. Tradeoff
  deliberado: humano-en-el-bucle estructural a cambio de no poder "terminar" una
  tarea solo (ADR-0026).
- **Conversacional, no autónomo.** No hay loop de fondo que procese el inbox o
  topologice sin sesión: el sistema solo avanza cuando Rubén está en el chat. El
  rol autónomo de ADR-0018 nunca se materializó (ADR-0026).
- **Doctrina duplicada.** La doctrina vive como **resumen hardcodeado** en el
  system-prompt *y* como documento completo inyectado desde el MCP. El resumen
  omite reglas a propósito; por eso el fetch es fail-fast. Riesgo de drift entre
  ambas copias (ver Open Questions).
- **Fail-fast con escape.** Sin la doctrina del MCP, el worker rehúsa arrancar
  (protege la memoria) salvo override explícito; el override degrada la calidad
  del agente conscientemente.
- **Sin historial propio.** El agente no persiste historial; depende de que el
  frontend reenvíe el hilo AG-UI cada turno. La persistencia de conversaciones es
  una capacidad **explícita** (Workflow 9), no automática.
- **Barandillas, no muros, para casi todo el comportamiento.** Salvo la exclusión
  de `commit_proposal` (muro de cliente) y los muros del servidor/motor (enums,
  preview, unicidad de ritual, VIEWER), la mayoría de la disciplina del agente
  (kind, asimetría de iniciativa, no asumir parent, grounding) es **barandilla**:
  el sistema la aceptaría si se violara, y solo es detectable a posteriori en el
  audit trail. El agente es el único enforcement de esas reglas. No hay hoy
  revisor automático del trail (gap conocido, DOCT-002).
- **Estado auxiliar fuera de auditoría de dominio.** `save_query` y las tools
  `*_conversation` escriben estado del dashboard fuera del ciclo de propuesta; no
  son topología y no se auditan como mutaciones del grafo.

## 10. Open Questions & Assumptions

- **Drift de `kind` en el resumen hardcodeado (evidenciado).** El system-prompt
  fijo (`agent.py`) todavía nombra los kinds **legacy** `plan_day` / `review_day`
  ("etiqueta `kind: plan_day` / `review_day` SOLO dentro de ese ritual"), mientras
  la doctrina operativa vigente (inyectada desde el MCP, que **manda**) unificó
  los rituales en `day` / `week` y marca `plan_day`/`review_day` como legacy solo
  legibles en datos históricos. En runtime gana la doctrina inyectada; el resumen
  quedó desactualizado. **No corregido aquí** (cambiar lore/agent requiere OK
  explícito de Rubén).
- **`OPENAI_MODEL` por defecto (evidenciado, pero posiblemente irreal).** El
  default en código y README es `gpt-5.5`; el CHANGELOG registra un vaivén
  ("revertir gpt-5.5 — el audit lo marcó irreal por error"). El id exacto del
  modelo se sirve vía la Responses API de OpenAI y es configurable por entorno;
  el efecto funcional (qué modelo razona) depende de ese valor, no del literal.
- **Drift de nombres de tool de recuperación en el resumen.** El resumen
  hardcodeado nombra `find_related` / `vector_search` para dedup y exploración;
  la sección de grounding de la doctrina inyectada nombra además
  `expand_context` / `hybrid_search` / `check_claim` / `trace_provenance`. Ambas
  conviven; el agente dispone de todas (el toolset es el del MCP menos
  `commit_proposal`). No es contradicción, pero el resumen es menos completo que
  la doctrina que lo supera en runtime.
- **`ACTOR` configurable, efecto en audit no verificado aquí.** El README lista
  `ACTOR` (default `worker`) como el valor escrito en `agent_event.actor`. La
  mecánica concreta de cómo se propaga al MCP en cada tool-call no está
  evidenciada en el código del worker leído. **Not evidenced** en este servicio.
- **Persistencia de conversaciones — quién dispara.** El Workflow 9 describe la
  capacidad; **quién** invoca cada tool (el frontend automáticamente vs. el
  agente a petición del usuario) es UI (`dashboard-ui`) y no se resuelve desde el
  código del worker. **Assumption:** el frontend posee los blobs y orquesta el
  guardado; el agente puede invocar las tools por estar en su toolset.
- **Sincronía de literales de dominio.** `domain.py` declara los literales (note
  states, kinds, etc.) "KEEP IN SYNC with apps/mcp/src/domain.ts"; el propio
  comentario admite que **no hay test que falle si divergen** (guardrail solo por
  comentario). Posible fuente de drift silencioso entre worker y MCP.
