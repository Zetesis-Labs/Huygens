# Huygens — Functional Specification

**App:** `huygens`
**Initiative:** `retrieval-and-grounding`
**Method:** reverse-engineered from the implemented MCP (`apps/mcp`), its behavioral SSOT (`operating-doctrine.md`, `data-model.md`, `surrealql-cookbook.md`), the conceptual model (`docs/MODEL.md`), the relevant ADRs y los tests bajo `apps/mcp/test/`.

> Convención de scope: este documento cubre **cómo Huygens responde desde el grafo** — las superficies de búsqueda, la disciplina de grounding/verificación, las vistas operativas de lectura y las queries guardadas. Se cruza con otras iniciativas que se mencionan en una línea: el modelo de notas/edges/estados → `graph-model-notes-and-topology`; el log inmutable / invariante de fold / time-travel como **garantía de auditoría** → `audit-provenance-and-trust` (aquí `trace_provenance`/`check_claim` aparecen como herramientas para *responder al usuario*, no como la garantía); el render visual de estas vistas → `dashboard-ui`; el ciclo de captura→propuesta→commit → `capture-and-inbox` y `processing-proposals-and-commit`.

---

## 1. Summary

La mitad del valor de una memoria de confianza no está en archivar, sino en **responder**: Huygens es la fuente que se cita, no solo el almacén. Cuando el usuario pregunta por el estado de algo ("¿cómo va Govoy?", "¿qué tengo pendiente?", "¿X sigue bloqueada por Y?"), la respuesta debe salir del grafo —recuperada y verificada— y no de la impresión que el agente tenga de la conversación.

Esta iniciativa cubre la superficie de **lectura** del MCP de Huygens: cómo se recupera contexto relevante (búsqueda semántica, léxica, híbrida y expansión de subgrafo), cómo se **verifica** una afirmación antes de asertarla (faithfulness por triples, trazado de procedencia), las **vistas operativas** que responden "qué hay vivo / cuánto / desde cuándo" (radar diario, jerarquía, recuentos, timeline de MITs, salud del grafo, cambios entre fechas), y las **queries guardadas** como capacidad de usuario (SurrealQL nombrado, de solo lectura, ejecutado con rol VIEWER).

La regla que gobierna todo: **recupera antes de responder; verifica antes de asertar; cita la evidencia cuando importe; y si el grafo y la memoria conversacional discrepan, gana el grafo**. Una discrepancia no es una respuesta inventada: es una captura o una corrección.

Queda **fuera de scope** todo lo que *muta*: ninguna herramienta de esta iniciativa escribe topología. Las únicas excepciones de escritura aquí son `save_query`/`delete_query`, que persisten estado auxiliar del dashboard (la query nombrada), no el grafo.

---

## 2. Actors & Roles

| Actor | Rol respecto a la recuperación / grounding |
|---|---|
| **Usuario (Rubén)** | Hace preguntas en lenguaje natural; espera respuestas ancladas en el grafo. No escribe SurrealQL ni piensa en índices. Es quien decide guardar/borrar queries con nombre. |
| **Agente conversacional** (Hermes, Claude Code, el worker del dashboard, cualquier cliente MCP) | El consumidor real de estas herramientas. Antes de responder *recupera*; antes de asertar topología/estado *verifica*; cuando importa, *cita*. Sigue la doctrina operativa; si un prompt-ritual la contradice, gana la doctrina. |
| **MCP Huygens** | Expone las herramientas estrechas de lectura, da formato canónico (triples + leyenda de nodos, líneas de hit con score y provenance) y aplica la frontera de solo-lectura. |
| **SurrealDB** | Motor multi-modelo (documento + grafo + vector + full-text). Ejecuta el KNN HNSW, el BM25, las agregaciones temporales y de grafo. **Hace cumplir el muro de escritura** vía el rol del usuario de conexión. |
| **`huygens_reader` (rol VIEWER de base de datos)** | Identidad de conexión de solo lectura con la que se ejecutan `query_query`, `run_query` y `list_queries`. La BD rechaza/anula cualquier escritura intentada por esta conexión (ver §6). Es la **frontera de seguridad** de las herramientas de query libre. |
| **DeepInfra (BGE-M3)** | Sistema externo que produce los embeddings (1024 dims, dense, ya L2-normalizados) que alimentan la búsqueda vectorial. Dependencia de red en cada `embed_text`/`find_related`/`vector_search`/`hybrid_search`. |

---

## 3. Goals & User Jobs

**Objetivo de producto:** que las respuestas de Huygens sean *recuperadas y verificables*, no improvisadas — y que el usuario pueda interrogar su propia memoria estructurada sin saber consultar la base de datos.

Jobs-to-be-done del agente (en nombre del usuario):

1. **"Antes de crear una nota, ¿ya existe algo parecido?"** → `find_related` (evitar duplicados).
2. **"Tráeme el contexto relevante a este concepto, como texto que pueda leer."** → `expand_context` (la vía por defecto: vector + grafo → triples).
3. **"Busca por significado / por este término literal / por ambos."** → `vector_search` / `lexical_search` / `hybrid_search`.
4. **"Antes de afirmarle al usuario que X está bloqueada por Y o que sigue ACTIVE, compruébalo."** → `check_claim`.
5. **"Cita de qué evidencia sale esta interpretación, y separa lo que dijo de lo que inferí."** → `trace_provenance`.
6. **"Expande N saltos alrededor de este nodo."** → `neighborhood`.
7. **"¿Qué hay vivo ahora mismo? ¿Qué cuelga de qué? ¿Cuántas notas de cada tipo/estado?"** → `daily_radar`, `get_hierarchy`, `count_notes`.
8. **"¿Cuántos días seguidos lleva Rubén planificando una MIT?" / racha.** → `mit_history`.
9. **"¿Qué se ha commiteado entre estas dos fechas?"** → `changes_between`.
10. **"¿Está sano el grafo? ¿Cuántos bloques quedan sin indexar?"** → `collection_stats`.
11. **"Guarda esta consulta que repito / ejecútala / bórrala."** → `save_query` / `list_queries` / `run_query` / `delete_query`.
12. **"Pregunta libre / agregación a medida sobre el grafo, sin mutar."** → `query_query`.

---

## 4. Entry Points

Todas las entradas son **herramientas MCP** (no hay UI propia en esta iniciativa; el dashboard que renderiza algunas de estas vistas es una pieza hermana — ver `dashboard-ui`). Cada herramienta devuelve un bloque de texto humano-legible **y** un bloque `[raw JSON]` con el resultado estructurado.

### Superficies de búsqueda
- `find_related(query, k=5, threshold=0.45)` — hasta K **notas** distintas (dedup por nota padre), semánticas.
- `vector_search(query, k=10, ef=40, threshold?, state_in?, type_slugs?, updated_since?)` — K **bloques** más cercanos (HNSW cosine).
- `lexical_search(query, k=10, state_in?, type_slugs?, updated_since?)` — K bloques por BM25 full-text.
- `hybrid_search(query, k=10, state_in?, type_slugs?, updated_since?)` — fusión RRF de las dos piernas anteriores.
- `expand_context(query, seeds=3, hops=1, max_nodes=30, threshold=0.45)` — siembra vectorial + expansión de subgrafo a triples.

### Grounding / verificación
- `check_claim(claims[])` — 1..20 triples → veredicto por triple.
- `trace_provenance(id)` — procedencia de una `note:`/`block:`.
- `neighborhood(seed_id, hops=2, max_nodes=30)` — subgrafo a N saltos como triples.

### Vistas operativas de lectura
- `daily_radar()` — superficie viva (sin parámetros).
- `get_hierarchy(root?)` — bosque/subárbol `part_of`.
- `count_notes(type_slug?, state_in?)` — recuento con desglose.
- `mit_history(note_id?)` — timeline de MITs desde el log.
- `changes_between(from, to)` — grafo de cambios agregado entre dos fechas.
- `collection_stats()` — salud del grafo / cobertura de índice (sin parámetros).

### Queries guardadas y query libre
- `save_query(name, query, pinned=false, id?)` — persiste/actualiza una query nombrada.
- `list_queries(pinned?, limit=100)` — lista las guardadas.
- `run_query(id)` — ejecuta una guardada (como VIEWER).
- `delete_query(id)` — borra una guardada.
- `query_query(query, parameters?)` — SurrealQL ad-hoc de solo lectura (como VIEWER).

### Recursos MCP (lectura de la doctrina)
El MCP sirve además, como **recursos** (no herramientas), la documentación que el agente debe leer: `huygens://lore/operating-doctrine`, `huygens://lore/data-model`, `huygens://lore/surrealql-cookbook` y `huygens://lore/schema` (el schema físico vivo). El cookbook es la fuente de recetas SurrealQL de solo lectura verificadas que `query_query` ejecuta.

---

## 5. Workflows

> Convención: cada workflow se describe como **disparador → pasos → fin**, con caminos alternativos/error. La numeración es de referencia.

### W1 — Responder una pregunta de estado desde el grafo (el flujo rector)

**Disparador:** el usuario pregunta por el estado de algo ("¿cómo va Govoy?", "¿qué tengo pendiente?").
**Pasos:**
1. El agente **recupera antes de responder**. La vía por defecto es `expand_context(query)`: hace match vectorial de hasta `seeds` notas (umbral cosine `threshold`) y expande su subgrafo conectado a triples `sujeto —predicado→ objeto` con una leyenda de nodos. Alternativas: `neighborhood(seed_id)` si ya tiene el nodo; `hybrid_search`/`vector_search`/`lexical_search` cuando busca por término o concepto suelto.
2. Si va a **asertar topología o estado** ("X está bloqueada por Y", "Z sigue ACTIVE"), lo pasa por `check_claim` (W6) — triple a triple, soportado/contradicho/no-soportado.
3. Si **importa citar** la evidencia, usa `trace_provenance` (W7) para nombrar los raws de los que deriva la interpretación y con qué `transformation`.
4. Responde con lo que el grafo sostiene, distinguiendo *lo que el usuario dijo* de *lo que se infirió*.

**Fin:** respuesta anclada en el grafo.
**Camino alternativo (discrepancia):** si el grafo y la memoria conversacional del agente discrepan, **gana el grafo**. Si el agente cree que el grafo está desactualizado, eso es una **captura** o una **corrección** (otras iniciativas), nunca una respuesta inventada.
**Error:** si la búsqueda no devuelve coincidencias, el agente lo dice; no rellena el hueco.

### W2 — Evitar duplicados antes de crear una nota (`find_related`)

**Disparador:** el agente está a punto de proponer una nota nueva sobre un tema.
**Pasos:**
1. Llama `find_related(query)` con el concepto en lenguaje natural.
2. La herramienta embebe la query (BGE-M3) y hace KNN sobre los bloques **descriptivos** con nota padre; **sobre-muestrea** (K×3 candidatos) para que, tras deduplicar por nota padre, queden hasta K notas distintas. Cada nota aparece una vez con su mejor bloque como snippet (las filas llegan en orden de distancia ascendente; la primera por nota es la mejor).
3. Filtra por umbral cosine (`score = 1 − distance ≥ threshold`, default `0.45`), ordena por score descendente, corta a K.
4. Adjunta señal de procedencia por hit: cuántos `raw_capture` respaldan el bloque (`derived_from`) y una `transformation` representativa.

**Fin:** lista de hasta K notas con score, snippet y procedencia.
**Regla de decisión (doctrina/descripción de la tool):** si el hit top tiene score ≳ `0.65`, **referenciar esa nota existente** en la propuesta (enlazar vía `part_of`/`mentions`) en lugar de duplicar.
**Camino vacío:** corpus vacío, o sin nota padre, o bajo umbral → lista vacía; el texto dice "No related notes above threshold." Los bloques narrativos huérfanos (sin nota padre) se ignoran.

### W3 — Búsqueda semántica de bloques (`vector_search`)

**Disparador:** el agente quiere los bloques más cercanos por significado.
**Pasos:**
1. Embebe la query (BGE-M3) → vector de 1024 dims.
2. KNN HNSW (`<|K,ef|>`, cosine) sobre `block.embedding`; `ef` (efSearch) por defecto 40 (buen valor para K≤20).
3. Aplica filtros opcionales sobre la **nota padre**: `state_in` (estados), `type_slugs` (tipos), `updated_since` (ISO; solo bloques cuya nota padre se actualizó después). **Si no se pasa `state_in`, las notas ARCHIVED quedan ocultas por defecto** (lastre que contamina la recuperación); DONE sigue siendo buscable (historia legítima).
4. Opcional `threshold` cosine (0..1) recorta hits flojos.
5. Adjunta procedencia por bloque y ordena por distancia ascendente (score = 1 − distance).

**Fin:** hasta K hits con score cosine, snippet (100 chars), y sufijo de procedencia (`⟵ N raw (transformation)`).
**Camino vacío:** "No matches."

### W4 — Búsqueda léxica literal (`lexical_search`)

**Disparador:** el término literal importa — nombres propios, identificadores, acrónimos, citas exactas — que el vector denso difumina.
**Pasos:**
1. **OR-tokeniza** la query (hasta 16 tokens): cada token es su propio predicado full-text `content @N@ $tN`, unidos por OR; el score es la **suma** de los `search::score(N)` por token (un predicado que no matchea suma 0, así que la suma premia naturalmente los bloques que aciertan más términos). Esto evita que una query multi-palabra (la norma cuando viene de `hybrid_search`) exija *todos* los términos en un bloque (operador AND) y muera.
2. Aplica los mismos filtros de nota padre que `vector_search` (mismo contrato), con el mismo ocultamiento de ARCHIVED por defecto.
3. Ordena por score BM25 descendente, corta a K.

**Fin:** hasta K hits. El **score es BM25** (no acotado, mayor = mejor), **no** un cosine 0..1.
**Nota de comportamiento (tests):** el analizador es **insensible a mayúsculas y a acentos** ("REUNION" matchea "reunión"); una query como "Stripe zzznoexiste" sigue devolviendo el bloque de "Stripe" (OR de tokens).
**Camino vacío:** "No lexical matches."

### W5 — Búsqueda híbrida de máxima recuperación (`hybrid_search`)

**Disparador:** la query puede depender tanto del significado como de términos exactos — el **default de mayor recall**, a preferir sobre `vector_search`.
**Pasos:**
1. Dispara **en paralelo** la pierna densa (`vector_search`) y la léxica (`lexical_search`), cada una sobre un *pool* sobre-muestreado (`k×4`, acotado a [20, 100]) para que la fusión tenga solape suficiente. **Sin umbral denso**: la fusión decide la relevancia; un suelo temprano la dejaría sin candidatos.
2. Fusiona por **Reciprocal Rank Fusion (RRF)**: el score fusionado de un id es la suma sobre rankings de `1/(k + rank)` (rank 1-based, `k` constante = 60). RRF no necesita calibrar escalas entre un cosine 0..1 y un BM25 no acotado: ordena por posición.
3. Ordena por score fusionado descendente, corta a K. Cada hit lleva `dense_rank` y `lexical_rank` (1-based o null) para mostrar qué pierna lo surfaceó; un bloque que aparece en ambas piernas suele superar a los de una sola.

**Fin:** hasta K `HybridHit` con score RRF y las dos posiciones de pierna.
**Filtros:** los mismos de nota padre que las dos piernas (se aplican a ambas).
**Camino vacío:** "No matches."

### W6 — Verificar una afirmación antes de asertarla (`check_claim`)

**Disparador:** el agente va a afirmarle al usuario algo sobre topología o estado.
**Pasos:**
1. El agente **descompone la afirmación en triples** (1..20): `subject` (record id `note:`/`block:`/`raw_capture:`), `predicate` (un edge del vocabulario `part_of`/`blocked_by`/`mentions`/`about`/`affects`/`derived_from`, **o** un atributo de nota `state`/`type`), `object` (record id para edges; un valor como `ACTIVE` o `task` para `state`/`type`).
2. Por cada triple, el grafo decide el veredicto:
   - **Edge:** existe el edge `(in=subject, out=object)` → `supported`.
   - **`part_of` con padre distinto:** como `part_of` es de **padre único**, afirmar un padre cuando existe *otro* → `contradicted` (el detalle revela el padre real). Afirmar un padre cuando **no hay ninguno** → `unsupported` (no contradicho).
   - **Edges multivaluados** (`mentions`/`about`/`affects`/`derived_from`): la ausencia es `unsupported`, **nunca** `contradicted`.
   - **Atributo `state`/`type`:** solo aplica a `note:`; valor coincide → `supported`, distinto → `contradicted` (detalle: valor real); sujeto inexistente → `unsupported` (detalle: "el sujeto no existe"); sujeto no-nota → `unsupported` (detalle: "state/type solo aplican a note:").
3. Devuelve el veredicto por triple. El veredicto que **importa** es `contradicted`: caza una aserción que **choca** con la topología/estado guardados (un padre equivocado, un estado equivocado).

**Fin:** lista de `{subject, predicate, object, verdict, detail?}`; cabecera "⚠ N afirmación(es) CONTRADICEN el grafo" o "sin contradicciones".
**Regla de uso:** no afirmar lo no soportado como si fuera dato.

### W7 — Citar de dónde sale algo (`trace_provenance`)

**Disparador:** hay que citar la evidencia o separar *lo dicho* de *lo inferido*.
**Pasos (según el tipo del id):**
- **Bloque (`block:`):** traza saliente — sus `derived_from` (cada `raw_capture` con su `transformation`: verbatim/extracted/summarized/inferred) y sus enlaces `about`/`affects` (este último con `action` y `summary` opcional).
- **Nota (`note:`):** traza entrante — los bloques que la interpretan (`about`/`affects` que la apuntan) y, a través de ellos, los `raw_capture` de origen (cada fuente etiquetada con `via` = el bloque por el que llega).
**Fin:** un `ProvenanceTrace` con `label`, `sources[]` y `links[]`, todo re-etiquetado con labels humanos.
**Camino error/vacío:** solo acepta ids `note:` o `block:` — cualquier otro (p. ej. `raw_capture:`) **lanza** "trace_provenance accepts only note: or block: ids, got …"; id inexistente → "Not found: …"; sin procedencia registrada → "(sin procedencia registrada)".
**Disciplina (doctrina):** distinguir siempre verbatim/extracted (lo que el usuario **dijo**) de inferred (lo que se **infirió**).

### W8 — Expandir el vecindario de un nodo (`neighborhood`)

**Disparador:** el agente tiene un nodo (p. ej. un hit de búsqueda) y quiere su contexto conectado como texto.
**Pasos:**
1. BFS desde el seed hasta `hops` (default 2) o `max_nodes` (default 30), recogiendo aristas de los seis tipos (`part_of, blocked_by, mentions, about, affects, derived_from`).
2. Construye los **triples inducidos**: solo aristas con **ambos** extremos visitados (si el presupuesto corta un extremo, esa arista se descarta). Las aristas llevan calificador (`affects.action`, `derived_from.transformation`) que refina el predicado: p. ej. `—affects(state_changed)→`.
3. Resuelve labels de los nodos visitados y serializa como `sujeto —predicado→ objeto` + leyenda de nodos.

**Fin:** subgrafo como triples + leyenda (`node_count`, `nodes`, `edges`, `triples`).
**Casos límite (tests):** seed inexistente → `null` ("Not found: …"); nodo aislado → `node_count=1`, `triples=''`; los ciclos se deduplican (no hay expansión infinita).

### W9 — Radar de lo vivo (`daily_radar`)

**Disparador:** "¿qué hay vivo ahora mismo?".
**Pasos:** selecciona las notas en estado `ACTIVE`/`WAITING`/`CLARIFIED` que **no estén diferidas** (`defer_until IS NONE OR defer_until <= now`), con su nota padre (`->part_of->note.title`) y sus ejes temporales (`mit_for`, `due_at`), ordenadas por tipo y estado.
**Fin:** `{ live_count, items[] }`, cada ítem con id, title, type, state, parent, mit_for, due_at.
**Regla:** las notas **dormidas** (diferidas hasta una fecha futura) quedan **fuera** del radar y resurgen en su día. SOMEDAY, DONE y ARCHIVED también quedan fuera.

### W10 — Jerarquía `part_of` (`get_hierarchy`)

**Disparador:** "¿qué cuelga de qué?" (áreas → proyectos → tareas).
**Pasos:** lee todas las aristas `part_of` (hijo→padre: `in`=hijo, `out`=padre). Sin `root` → el bosque entero; con `root` (un id de nota) → solo ese subárbol (descendientes vía adyacencia padre→hijos). Resuelve title/type/state de cada nodo.
**Fin:** `{ root, nodes[], edges[], node_count, edge_count }` — filas de arista reales, nunca el `[]` ambiguo que produce la recursión cruda ni el ruido de edges semánticos de `neighborhood`/`expand_context`.

### W11 — Recuento de notas (`count_notes`)

**Disparador:** "¿cuántas notas de cada tipo/estado?" — contadas, **nunca a ojo**.
**Pasos:** `count()` con filtros opcionales `type_slug` y/o `state_in`, más un desglose por `(type, state)`.
**Fin:** `{ total, by_type_state[] }`.

### W12 — Timeline de MITs / rachas (`mit_history`)

**Disparador:** medir la racha de coaching ("¿cuántos días seguidos lleva Rubén planificando/cerrando una MIT?") o ver el historial de una tarea.
**Pasos:**
1. La celda viva `note.mit_for` es **única**: reasignar o limpiar (`mit_for: null`) borra el valor anterior. Pero el rastro **no se pierde**: cada asignación/movimiento/limpieza es una escritura de `mit_for` dentro del `payload` de una **proposal commiteada**.
2. La herramienta lee del log: todas las proposals `committed` cuyo `payload.note_creates`/`note_updates` tocaron `mit_for`, en orden de commit. Clasifica cada escritura relativa al valor previo de *esa* nota: primer valor = `assigned`, valor distinto posterior = `moved`, `null` = `cleared` (una MIT soltada conscientemente es exactamente la fila `cleared`).
3. Decora con el title/state/`current_mit_for` actuales y ordena las notas por actividad más reciente.

**Fin:** `{ note_id?, note_count, event_count, timeline[] }`, cada timeline con su `history` de eventos `{committed_at, proposal_id, mit_for, action, source}`.
**Regla:** **fuente de verdad para rachas**; **sobrevive a `mit_for: null`**. No consultar `mit_for` para historia — consultar `mit_history`. Las notas que nunca tuvieron MIT no aparecen.

### W13 — Cambios entre dos fechas (`changes_between`)

**Disparador:** "¿qué se commiteó entre estas dos fechas?".
**Pasos:** fusiona todas las proposals **commiteadas** cuyo commit cayó en `[from, to]` (inclusive; fecha-sola se expande al día UTC completo) en un único grafo de cambios — notas creadas/actualizadas, la topología nota↔nota (ids temporales resueltos a las notas reales que produjo el commit), recuento de raws, mapa "tocada por N proposals" y un tally por día. Usa el mismo fusionado (`fuseProposals`) que el dashboard.
**Fin:** texto agregado (resumen, CREATE, UPDATE, topología, por-día).
**Camino vacío:** "Nothing committed in this window."

### W14 — Salud del grafo / cobertura de índice (`collection_stats`)

**Disparador:** "¿está sano el grafo? ¿cuántos bloques faltan por indexar?".
**Pasos:** agrega recuentos de `raw_capture` (por status), `note` (por state), `block` (total + **embedded vs unembedded** + por kind), aristas por tipo, y proposals (por status).
**Fin:** el resumen incluye el **% indexado**. La **señal clave** es el recuento de bloques sin embeber: esos bloques son **invisibles** a `vector_search`/`hybrid_search` hasta que se indexen (`index_block`).
**Camino vacío:** grafo vacío → todos los contadores a 0 (no `undefined`), 100% indexado por convención.

### W15 — Queries guardadas (usuario): `save_query` / `list_queries` / `run_query` / `delete_query`

**Disparador:** el usuario quiere persistir una consulta que repite.
**Pasos:**
- **`save_query(name, query, pinned?, id?)`** — guarda un SurrealQL nombrado. Sin `id` → crea con id aleatorio `saved_query:…` (`updated: false`). Con `id` elegido por el caller → **upsert**: lo crea si no existe (`updated:false`) o lo actualiza si existe (`updated:true`), permitiendo ids estables y memorables sin un "¿existe?" previo.
- **`list_queries(pinned?, limit=100)`** — lista las guardadas, más recientes primero, filtrable por `pinned` (favoritas). Se ejecuta como VIEWER.
- **`run_query(id)`** — carga la query guardada y la **ejecuta de solo lectura** (como VIEWER), devolviendo el resultado SurrealQL crudo. Si el id no existe → "saved query not found: …".
- **`delete_query(id)`** — borra la query guardada por id.

**Fin:** la query nombrada queda persistida / listada / ejecutada / borrada.
**Frontera:** `save_query`/`delete_query` escriben estado **auxiliar del dashboard** (la query nombrada, tabla SCHEMALESS `saved_query`), **fuera** del ciclo de proposal — no son topología del grafo. `run_query`/`list_queries` leen como VIEWER.

### W16 — Query libre de solo lectura (`query_query`)

**Disparador:** agregación/tiempo/grafo a medida sobre el grafo, sin herramienta dedicada.
**Pasos:** ejecuta SurrealQL contra el grafo **como `huygens_reader` (VIEWER)**. Valores por `$name` + `parameters` (nunca concatenando strings → seguro frente a inyección). Multi-statement devuelve un array de resultados por statement.
**Fin:** resultado SurrealQL serializado a JSON (RecordId → "table:id"; bigint → string).
**Camino error:** sintaxis inválida → `QueryError`.
**Frontera (ver §6 y §9):** `CREATE/UPDATE/DELETE/RELATE` **no mutan el grafo** por esta vía. Es el *escape hatch*: si hay una herramienta dedicada, se usa esa (da formato canónico y validación).

---

## 6. Functional Rules & Constraints

### Reglas rectoras del grounding (doctrina operativa, §"Responder desde el grafo")
- **R1 — Recupera antes de responder.** Ante una pregunta de estado, recuperar del grafo (`expand_context` por defecto; `neighborhood` si se tiene el nodo; `hybrid_search` por término/concepto suelto) antes de responder.
- **R2 — Verifica antes de asertar.** Antes de asertar topología o estado, pasarlo por `check_claim`. No afirmar lo no soportado como si fuera dato.
- **R3 — Cita la evidencia cuando importe.** `trace_provenance` da los raws de origen y la `transformation`; distinguir siempre verbatim/extracted (dicho) de inferred (inferido).
- **R4 — El grafo gana.** Lo recordado de la conversación es contexto, no fuente. Si el grafo y la memoria conversacional discrepan, **gana el grafo**; una discrepancia es captura o corrección, no respuesta inventada.

### Frontera de solo lectura (la garantía de no-mutación de esta superficie)
- **R5 — `query_query`, `run_query` y `list_queries` se ejecutan como `huygens_reader` (rol VIEWER de base de datos).** Es la frontera de seguridad de la query libre; no se relaja a root. Requiere `SURREAL_READER_PASS`; el usuario se crea una vez con `bun run db:define-reader`.
- **R6 — Una escritura por la vía VIEWER no muta el grafo.** Por doctrina es un **muro de motor** ("la BD rechaza la escritura"). Matiz de comportamiento real verificado en test: contra una tabla SCHEMAFULL sin cláusula PERMISSIONS explícita, SurrealDB v2.6 **devuelve un resultado vacío en lugar de lanzar** (la fila se filtra silenciosamente). La garantía en la que se confía es **que los datos quedan sin cambios**, no que se lance un error. El agente no debe interpretar un resultado vacío como "hecho".
- **R7 — Ninguna herramienta de recuperación/grounding/vistas muta topología.** Las únicas escrituras de esta iniciativa son `save_query`/`delete_query` (estado auxiliar del dashboard, no grafo). Toda mutación estructural va por `commit_proposal` (otra iniciativa).

### Reglas de las superficies de búsqueda
- **R8 — ARCHIVED oculto por defecto.** `vector_search`/`lexical_search`/`hybrid_search` ocultan las notas ARCHIVED salvo que el caller las pida explícitamente vía `state_in`. DONE permanece buscable (historia legítima).
- **R9 — Semántica de score por superficie.** `find_related`/`vector_search`: cosine `0..1` (= `1 − distance`). `lexical_search`: BM25 (no acotado, mayor = mejor). `hybrid_search`: score RRF fusionado (`Σ 1/(60 + rank)`). No comparar scores entre superficies.
- **R10 — Umbrales y K.** `find_related`: K≤10 (default 5), threshold default `0.45`, regla de duplicado a score ≳ `0.65`. `vector_search`/`lexical_search`/`hybrid_search`: K≤50 (default 10). `vector_search.ef`≤500 (default 40). `expand_context`: seeds 1..5 (default 3), hops 1..3 (default 1), max_nodes 2..60 (default 30), threshold default `0.45`.
- **R11 — `find_related` dedup y orden.** Una nota con varios bloques que matchean aparece **una sola vez** con su mejor bloque; resultados ordenados por score descendente, cortados a K; ignora bloques narrativos huérfanos (sin nota padre).
- **R12 — `lexical_search` OR-tokeniza** (hasta 16 tokens) y suma scores por token; insensible a mayúsculas y acentos. Esto es lo que impide que `hybrid_search` degenere a solo-vector con queries multi-palabra.
- **R13 — Filtros de nota padre compartidos.** `state_in`, `type_slugs`, `updated_since` (ISO) se comportan idénticos en las tres búsquedas de bloques (mismo contrato), y `hybrid_search` los aplica a ambas piernas.

### Reglas del grounding/verificación
- **R14 — Vocabulario de `check_claim`.** Predicados de edge: `part_of`, `blocked_by`, `mentions`, `about`, `affects`, `derived_from`. Atributos: `state`, `type` (solo `note:`). 1..20 triples por llamada.
- **R15 — `contradicted` solo donde puede haberlo.** `part_of` (padre único) y los atributos `state`/`type` pueden contradecirse; los edges multivaluados solo pueden ser supported/unsupported (la ausencia no contradice).
- **R16 — `trace_provenance` solo `note:`/`block:`.** Cualquier otro id lanza error explícito. La `transformation` ausente en un `derived_from` se reporta como `inferred`.
- **R17 — Subgrafo inducido.** `neighborhood`/`expand_context` solo emiten aristas con **ambos** extremos visitados; el presupuesto `max_nodes` corta la expansión; los ciclos se deduplican.

### Reglas de las vistas operativas
- **R18 — Radar excluye dormidas.** `daily_radar` = `ACTIVE/WAITING/CLARIFIED` **y** `(defer_until IS NONE OR defer_until <= now)`. `defer_until` es un *snooze de visibilidad*, no un estado: la tarea sigue ACTIVE pero desaparece del radar hasta su fecha.
- **R19 — Tres ejes temporales ortogonales.** `mit_for` (prioridad: foco del día, 1–3/día), `due_at` (compromiso: vencimiento duro), `defer_until` (tickler: ocultar hasta). Son campos top-level indexados, normalizados a medianoche UTC del día escrito; nunca dentro de `metadata`. No confundirlos: MIT hoy ≠ vence hoy ≠ no verlo hasta hoy.
- **R20 — Contar, no estimar.** Los recuentos salen de `count()` (`count_notes`, `collection_stats`), nunca "a ojo".
- **R21 — Historia de MITs vía log.** `mit_history` se deriva del log de proposals commiteadas y sobrevive a `mit_for: null`; es la fuente de verdad para rachas. La celda viva `mit_for` no sirve para historia.
- **R22 — Ventana de `changes_between` inclusiva**; fecha-sola se expande al día UTC completo. Solo fusiona proposals `committed`.
- **R23 — Cobertura de índice.** Un bloque sin embedding es invisible a la búsqueda vectorial/híbrida; `collection_stats` expone el recuento como señal operativa.

---

## 7. Data Concepts (glosario)

Conceptos que el usuario/agente percibe a través de estas herramientas (no es un schema de BD — el modelo físico vive en `graph-model-notes-and-topology`).

- **`raw_capture`** — la evidencia literal de lo que el usuario dijo; el inbox semántico. Aquí aparece como *fuente* citada por `trace_provenance` y como origen de la señal de procedencia de los hits.
- **`note`** — entidad topológica tipada (`task|project|area|routine|idea|reference|person|objetivo`) con estado ZTD (`CLARIFIED|ACTIVE|WAITING|SOMEDAY|DONE|ARCHIVED`). Es la unidad que devuelven `find_related`, `daily_radar`, `get_hierarchy`, `count_notes`.
- **`block`** — átomo de contenido direccionable y **vectorizable** (`descriptive` = cuerpo de una nota; `narrative` = informe-block interpretativo). La unidad de la búsqueda vectorial/léxica. Su texto es `content` (no tiene `title`).
- **`embedding`** — vector BGE-M3 dense de **1024 dims**, cosine, ya L2-normalizado, indexado con HNSW (`EFC 150 M 12 M0 24`, `TYPE F32`). Un bloque sin él no es recuperable por vector.
- **Edges del vocabulario** — `part_of` (jerarquía hijo→padre, **padre único**), `blocked_by`, `mentions`, `about` (un bloque habla de una nota), `affects` (un bloque causó/justificó un cambio, con `action`), `derived_from` (un bloque deriva de un raw, con `transformation`).
- **`transformation`** — cómo una interpretación deriva de un raw: `verbatim` | `extracted` (lo que el usuario **dijo**) vs `summarized` | `inferred` (lo que se **infirió**). Eje central del grounding honesto.
- **`action`** (en `affects`) — `created|updated|state_changed|linked|archived`; refina el predicado en los triples.
- **Triple** — `sujeto —predicado→ objeto`, la forma canónica KG-RAG en que se verbaliza un subgrafo (con leyenda de nodos). El producto de `neighborhood`/`expand_context`.
- **Score (3 sabores)** — cosine `0..1` (vector/find_related), BM25 (léxico), RRF fusionado (híbrido). Ver R9.
- **Veredicto** (`check_claim`) — `supported` | `contradicted` | `unsupported`.
- **Ejes temporales** — `mit_for` (prioridad), `due_at` (compromiso), `defer_until` (tickler). Ver R19.
- **MIT (Most Important Task)** — foco del día (1–3/día), decidido por el usuario; su historia vive en `mit_history`, no en la celda viva.
- **`saved_query`** — query SurrealQL nombrada y persistida (tabla auxiliar SCHEMALESS), con `name`, `query`, `pinned`, id estable. Estado del dashboard, no topología.
- **`huygens_reader` / VIEWER** — la identidad de solo lectura con la que se ejecutan las queries libres; la frontera que garantiza no-mutación.
- **Cobertura de índice** — proporción de bloques embebidos; lo no embebido es invisible a la búsqueda vectorial.

---

## 8. Graphical Representation

*(Mínima por diseño — el render visual de estas vistas es una pieza hermana; ver `dashboard-ui`.)*

Estas herramientas son **headless**: devuelven texto canónico + JSON, no pantallas. El único "formato visual" propio es textual:

- **Hits de búsqueda:** una línea por hit, `- [score] <tipo · título (estado)> — <id> :: <snippet>  ⟵ N raw (transformation)`. El híbrido antepone `[rrf <score> d<rank>+l<rank>]`.
- **Subgrafo (`neighborhood`/`expand_context`):** bloque de triples `A —predicado(calificador)→ B` seguido de una **leyenda de nodos** (`<id>  <label>`).
- **`check_claim`:** una línea por triple con marca `✓`/`✗`/`·` y veredicto en mayúsculas; cabecera de contradicciones.
- **`trace_provenance`:** "deriva de:" + fuentes (con `transformation` y `[vía <block>]`), luego "sobre:"/"afecta a:".

El dashboard (Astro + React Flow) reusa `changes_between`/`fuseProposals` y las vistas operativas para renderizar el grafo, los MITs (vencidos en ámbar) y la Bitácora — pero ese render no pertenece a esta iniciativa.

---

## 9. Restrictions & Tradeoffs

- **Solo lectura, por diseño.** Esta superficie nunca muta topología. La mutación es siempre humana vía `commit_proposal` (otra iniciativa). `save_query`/`delete_query` son la única escritura, y solo de estado auxiliar.
- **El muro VIEWER es de "datos sin cambios", no de "error".** En SurrealDB v2.6, una escritura por la conexión VIEWER contra una tabla SCHEMAFULL devuelve resultado vacío en vez de lanzar (R6). La garantía es la inmutabilidad del grafo, no una excepción visible; el agente no debe leer "vacío" como éxito.
- **Dependencia de red para lo semántico.** `find_related`/`vector_search`/`hybrid_search`/`expand_context` necesitan embeber vía DeepInfra (BGE-M3) en cada llamada. Si DeepInfra cae, no hay búsqueda vectorial hasta restaurar (fallback TEI/Ollama documentado pero no cableado). La pierna léxica (`lexical_search`) y las vistas operativas siguen funcionando sin red externa.
- **Cobertura de índice como punto ciego.** Un bloque recién creado se auto-embebe *best-effort* tras el commit; si falla, queda invisible a la búsqueda vectorial hasta `index_block`/`db:reindex`. `collection_stats` lo expone, pero el agente debe mirarlo.
- **`vector_search` no combina filtros de grafo.** La herramienta filtra por atributos de nota padre (state/type/updated), pero no expande grafo ni mezcla similitud + travesía en una query; para eso están `expand_context`/`neighborhood` (o `query_query` a mano, según el cookbook).
- **`contradicted` solo donde el modelo lo permite.** `check_claim` solo puede *contradecir* en `part_of` (padre único) y atributos `state`/`type`; en edges multivaluados un hueco es "no soportado", lo que el agente debe interpretar como "el grafo no lo respalda", no como "es falso".
- **`changes_between`/`mit_history` solo ven proposals `committed`.** Drafts, descartadas y `superseded` no cuentan; la historia es la del log de commits.
- **`query_query` es potente y con trampas.** SurrealQL crudo permite agregaciones que ninguna tool da, pero el cookbook documenta numerosas trampas (recursión `.{1..n}` que miente, `!= NULL` que matchea todo, `count(->about)` que cuenta aristas no notas, `SHOW CHANGES … LIMIT` roto, `VERSION` solo fiable por-id, etc.). La preferencia es usar la tool dedicada cuando exista.
- **`find_related` sobre bloques descriptivos.** Su KNN busca solo bloques `descriptive` con nota padre (para devolver *notas*); no surfacea informe-blocks narrativos huérfanos.

---

## 10. Open Questions & Assumptions

**Assumptions (etiquetadas):**
- *(Assumption)* El umbral de "referenciar en vez de duplicar" (score ≳ `0.65`) es una **guía de comportamiento** descrita en la doctrina y en la descripción de la tool `find_related`, no un valor que la herramienta haga cumplir: la herramienta solo filtra por el `threshold` (default 0.45) y devuelve la lista; la decisión de reusar es del agente.
- *(Assumption)* El `RRF_K = 60`, el `POOL_MULTIPLIER = 4` (acotado [20,100]) y el `OVERSAMPLE = 3` de `find_related` son constantes de implementación, no parámetros expuestos al usuario.

**Open questions / Not evidenced:**
- **Sin revisor automático del trail de barandillas.** La doctrina marca como gap conocido (DOCT-002) que hoy no hay revisor que verifique a posteriori que el agente *de verdad* recuperó/verificó antes de responder; R1–R4 son **barandillas de comportamiento**, no muros — el motor no obliga a llamar `check_claim` antes de asertar. **Not evidenced** que exista enforcement de "recupera antes de responder".
- **Reconstrucción temporal del contexto (ADR-0025)** existe para el *dashboard* (`TemporalEdgeReader`, replay del changefeed hasta el versionstamp del commit), no como herramienta MCP de esta iniciativa. **Not evidenced** una tool MCP que devuelva el grafo "en el instante del commit"; el viewer histórico vive en el dashboard.
- **`transformation` 100% `summarized` / `reason` 100% vacío hoy.** El cookbook anota varias "plantillas latentes" (queries válidas que hoy devuelven `[]` porque el campo aún no se puebla: MITs por día, `last_reviewed_at`, evidencia `inferred` que cambió un estado, bloqueos con `reason`). Funcionalmente las herramientas las soportan; el dato aún no las "enciende". **Not evidenced** cobertura real de esos campos en producción al momento de escribir.
- **Estado de la base de datos.** Memoria de proyecto registra una pérdida de datos (2026-06-09): la DB pudo quedar vacía (schema + seed). Las herramientas son correctas, pero los **resultados reales** dependen del estado de recuperación del grafo, que no se verifica aquí.
- **`vector_search` vs recall.** ADR-0007 fija parámetros HNSW de calidad (`EFC 150`) "sin perfilar en producción"; **Not evidenced** una medida de recall sobre un set de regresión real; el `ef` de búsqueda (default 40) se documenta como "buen valor para K≤20" sin curva publicada.
- **`save_query` no valida que la query sea de solo lectura en el guardado.** Se guarda como root y se ejecuta como VIEWER, así que una query con escritura simplemente no mutaría al ejecutarse (R6); pero **Not evidenced** una validación de "esto es read-only" en `save_query` más allá de la frontera de ejecución.
