# Huygens — SurrealQL cookbook (explorar la topología)

Piezas y recetas READ-ONLY para `query_query` / `run_query`, **verificadas contra el
grafo**. El schema físico real (tablas, campos, enums, edges) está en el recurso
`huygens://lore/schema`. Toda query es la misma plantilla; se compone enchufando ladrillos,
filtrando en cada salto y **anidando subqueries**.

> **`query_query` en su sitio.** Es el *escape hatch* para exploración libre (agregaciones,
> tiempo, grafo a medida). Si hay una tool dedicada, úsala — da formato canónico y validación:
> búsqueda semántica → `vector_search`; ¿ya existe algo parecido? → `find_related`;
> vecindario/contexto como texto → `neighborhood` / `expand_context`; provenance de una note →
> `trace_provenance`; inbox → `list_inbox`; notas por tipo / MITs → `query_query` (filtra por
> `type.slug` / `mit_for`); verificar una afirmación → `check_claim`. Para recetas que repites,
> guárdalas con `save_query` y descúbrelas con `list_queries` / `run_query`.

## Reglas (dónde fallan las queries)

- **READ-ONLY absoluto**: nunca mutes vía SurrealQL. Crear/cambiar notes, blocks, edges o
  estado va por `create_proposal` → `commit_proposal`.
- **`!= NULL` matchea TODAS las filas**. Para campo opcional usa `IS NONE` / `IS NOT NONE`,
  jamás `!= NULL`.
- **`->edge` pelado devuelve ids del edge**, no del nodo. Resuelve a nodo y campo:
  `->part_of->note.title`.
- **`count(->about)` cuenta ARISTAS, no notas distintas** — resuelve `->about->note`
  (y `array::distinct(...)` en multi-edge) para contar/listar las notas reales.
  `affects`/`derived_from`/`blocked_by` sí fiables pelados.
- **`ORDER BY` solo por campo del SELECT o por alias**; `count()`/expresión inline falla
  con "Missing order idiom" → proyecta `… AS x` y ordena por `x`.
- **`block` no tiene `title`**; su texto es `content`. No proyectes el block entero (lleva
  `embedding` de 1024 floats) → `.{id,content}`, `string::slice(content,0,80)` o
  `SELECT * OMIT embedding`.
- **Existencia/raíz**: un traversal vacío es `[]`, no NONE → usa `array::len(->edge)=0`,
  nunca `IS NONE`.
- **Recursión de grafo**: la sintaxis-rango `.{1..n}` / `.{..}` **MIENTE** (devuelve solo el
  nodo más profundo, sin error). Usa los algoritmos `.{..+collect}` / `.{..+path}` /
  `.{..+shortest=…}` (ver Composición). La profundidad exacta `.{N}` sí es correcta.
  **Proyecta el campo FUERA de la puerta de recursión**: `@.{..+collect}<-part_of<-note.title`
  da ERROR (`Expected a record ID`) — colecta nodos/ids y resuelve `.title` en un paso posterior.
- **Texto**: `CONTAINS` es case-SENSITIVE y por substring; `~`/`!~`/`?~`/`*~` NO existen →
  `string::contains(string::lowercase(campo),'minúsculas')` o `string::matches(campo,'(?i)…')`.
  `@@`/`@1@` (full-text) YA tiene analyzer (`huygens_text` sobre `block.content`,
  índice `block_content_fts`): filtra con `content @1@ 'términos'` y ordena por
  `search::score(1)`. Para esto prefiere las tools `lexical_search` (BM25) o
  `hybrid_search` (BM25 + denso fusionados con RRF), que ya lo encapsulan.
- **Datetimes**: máx/mín con `time::max`/`time::min`. `math::*` es solo para **números**
  (counts, `duration::days(...)`); sobre datetimes da `null` o ERROR.
- **`time::group(x,'week')` no agrupa por semana** (suelto da ERROR; bajo `GROUP BY` colapsa
  todo en una fila sin emitir la clave) → usa `time::floor(x,1w)`.
- **`object::*` revienta si el campo es NONE** → `WHERE metadata != NONE` primero.
- **Proyectar un campo sobre un array `$ids` enlazado falla** (`SELECT content FROM $ids` →
  *"Specify a database to use"*) → usa `SELECT * FROM block WHERE id IN $ids`,
  `SELECT VALUE content FROM $ids`, o envuelve el campo en función (`string::slice(content,0,80)`).
- **Vencimiento/aplazamiento son campos top-level datetime** (`due_at`, `defer_until`), como `mit_for` — compara/ordena directo, **no** en `metadata`. (Una fecha suelta en `metadata` sería string y habría que castearla `<datetime>metadata.x`, pero no es el patrón.)
- **Conjuntos**: `OUTSIDE` es de geometría (no "no contenido" → usa `NONEINSIDE`/`NOT IN`);
  `*=` sobre conjunto vacío es `true` (verdad vacua) → guárdalo con `array::len(…)>0`.
- **Edges operativos note→note**: `part_of`, `blocked_by`, `depends_on`, `owned_by`,
  `relates_to`, `duplicates`. El multi-edge `->(about,affects)->note` (trace técnico) NO
  deduplica → envuelve en `array::distinct(...)`. (`mentions` es legacy; usa `relates_to`.)
- **KNN vectorial**: `<|K,EF|>` (HNSW, p.ej. `<|5,100|>`) o `<|K,COSINE|>` (fuerza bruta);
  `<|K|>` solo da error, y el KNN va con `AND`, nunca en `OR`/`NOT`. Embeber texto→vector es del
  modelo (tool `embed_text`); el KNN y `vector::similarity::cosine` son SurrealQL.
- **Direcciones**: `part_of` apunta HIJO→PADRE (`->part_of->note`=padres,
  `<-part_of<-note`=hijos). Inbox SSOT = `raw_capture.status`. El MIT está en `note.mit_for`.
- **Auditoría/historia**: usa la tabla `agent_event` (SELECT normal). El changefeed es
  best-effort: `SHOW CHANGES … SINCE <versionstamp>` funciona **sin LIMIT** (con LIMIT está
  roto); `VERSION` solo por record-id, **al final** (no admite WHERE/GROUP/LIMIT detrás) y no
  respeta topología.

## La plantilla

```text
SELECT <proyección>
FROM <note | block | raw_capture | edge | (subquery)>
WHERE <filtros AND… / traversal-filtrado>
[GROUP BY <campo|alias>] [ORDER BY <campo∈SELECT|alias> [COLLATE]] [LIMIT n] [START m]
```

## Vocabulario de ladrillos

**Proyección / forma**
- **campo + alias** — `title AS t`.
- **traversal → campo** — `->part_of->note.title` (no el `->edge` pelado).
- **objeto tras traversal** — `<-about<-block.{id, txt:string::slice(content,0,80)}`.
- **todo menos X** — `SELECT * OMIT embedding, metadata` — el documento entero sin los campos pesados (top-level).
- **resolver link entero** — `… FETCH type` — sustituye el link por el objeto destino completo.
- **recortar / último bloque** — `string::slice(content,0,80)` · `array::at(block_order,-1).content`.
- **un registro vs array** — `FROM ONLY note:abc`.
- **cuerpo de una note** — `block_order.*.content`.
- **lista plana** — `SELECT VALUE title FROM …`.
- **proyectar la arista** — `SELECT in.title AS x, out.title AS y, action FROM affects` (in/out exigen alias).
- **destructuring computado** — `id.{ title, n:count(<-part_of<-note), parents:->part_of->note.title }`.
- **fallback** — `metadata.priority ?? 'none'` (`??` ignora NONE; `?:` también '' y 0).

**Filtros de entidad (WHERE)**
- **tipo / estado** — `type.slug='task'` · `state NOT IN ['DONE','ARCHIVED']`.
- **existencia de campo** — `mit_for IS NOT NONE`, `embedding IS NONE`.
- **existencia de relación** — `count(->blocked_by->note)>0`; raíz `array::len(->part_of)=0`.
- **metadata flexible** — `metadata.priority='high'` · `object::keys(metadata) CONTAINS 'url'` (con `metadata != NONE`).
- **ejes temporales** — `due_at`, `defer_until`, `mit_for` (todos datetime top-level indexados): `due_at < time::now()`, `defer_until > time::now()`, etc.
- **pertenencia en arrays** — `block_order CONTAINS block:abc` · `CONTAINSALL/CONTAINSANY/NONEINSIDE [..]`.
- **texto** — `string::contains(string::lowercase(content),'x')` · `string::matches(title,'(?i)(a|b)')`.
- **rango de fecha** — `created_at IN d'2026-05-27'..d'2026-05-29'` (`..` excluye fin, `..=` lo incluye).

**Tiempo**
- **aritmética / edad** — `time::now()-4w` · `duration::days(time::now()-updated_at) AS age`.
- **stale / reciente** — `updated_at < time::now()-2w` · `created_at > time::now()-1w`.
- **cadencia** — `time::group(x,'day')` / `time::floor(x,1w)` · día de semana `time::wday(x)`, `time::format(x,'%A')`.
- **último toque de un traversal** — `time::max(<-part_of<-note.updated_at)`.
- **fallback de nulos** — `(defer_until IS NONE OR defer_until <= time::now())`.

**Traversal + filtrado entre saltos**
- **direcciones** — part_of: `->part_of->note`=padres, `<-part_of<-note`=hijos. blocked_by: `->blocked_by->`=mis bloqueantes. about/affects/derived_from nacen del block; desde la note son entrantes (`<-about<-block`).
- **filtro de NODO** — `<-part_of<-note[WHERE type.slug='project']`.
- **filtro de ARISTA** — `->affects[WHERE action='state_changed']->note` · `->blocked_by[WHERE out.state!='DONE']->note`.
- **`count()` respeta el filtro** — `count(<-blocked_by<-note[WHERE state IN ['ACTIVE','WAITING']])`.
- **multi-edge en un salto** — `array::distinct(->(about,affects)->note.title)`.
- **recursión (cierre transitivo)** — `@.{..+collect}<-part_of<-note` (ver Composición).

**Agregación / orden**
- **agrupar** — `GROUP BY campo` o `GROUP ALL` (total global).
- **contar** — `count() AS n` · condicional `count(<cond> OR NONE) AS m`.
- **estadística** — `math::mean/median/percentile(arr,90)/stddev/mode` sobre `(SELECT VALUE <num> FROM …)`.
- **multiset por grupo** — `array::group(x)` · conjuntos `array::distinct/complement/intersect`.
- **ordenar / paginar** — `ORDER BY alias DESC [COLLATE]` · `LIMIT n START m` · muestreo `ORDER BY rand()`.

## Composición y subqueries (lo más potente)

Las subqueries permiten filtrar y ordenar por **valores computados de grafo**, imposibles en
un solo nivel. Son el núcleo de la composability.

Ordenar/filtrar por un agregado de grafo (subquery en `FROM`):
```surql
SELECT title, kids FROM (SELECT title, count(<-part_of<-note) AS kids FROM note) WHERE kids > 0 ORDER BY kids DESC LIMIT 5;
```
Cierre transitivo del árbol (todos los descendientes, en una query):
```surql
SELECT VALUE @.{..+collect}<-part_of<-note FROM note:abc;
```
Árbol anidado con hijos (la `@` marca la puerta de recursión); admite filtro de arista por rama:
```surql
SELECT @.{..3}.{ id, title, children: <-part_of<-note[WHERE state!='DONE'].@ } AS tree FROM note:abc;
```
Reporte compuesto en una llamada (`LET` + `RETURN`):
```surql
LET $live = (SELECT VALUE count() FROM note WHERE state NOT IN ['DONE','ARCHIVED'] GROUP ALL)[0];
RETURN { live: $live, oldest_days: math::max((SELECT VALUE duration::days(time::now()-updated_at) FROM note WHERE state NOT IN ['DONE','ARCHIVED'])) };
```
Subquery correlacionada (traversal que arranca con `<-` dentro de una proyección):
```surql
SELECT title, (SELECT VALUE out.title FROM $parent.id<-part_of<-note[WHERE state='ACTIVE']->blocked_by) AS kid_blockers FROM note:abc;
```
**Parámetros**: pasa valores con `$name` vía el campo `parameters` de la tool, nunca
concatenando strings. Es el puente del flujo vectorial: `embed_text('concepto')` te da el
vector → lo bindeas como `$v` → la receta KNN de abajo con `$v` en lugar del `LET`.

## Recetas

Cada receta: la pregunta que responde + la query. `note:abc`/`block:abc`/`proposal:abc` son
placeholders de ids concretos. Algunas devuelven `[]` hoy (estado del grafo, no error).

### Orientarse

Panorama (qué hay, por tipo y estado):
```surql
SELECT type.slug AS type, state, count() AS total FROM note GROUP BY type, state ORDER BY total DESC;
```
Raíces — áreas sin padre:
```surql
SELECT id, title FROM note WHERE type.slug='area' AND count(->part_of)=0;
```
Accionables de un tipo (lo vivo, lo más reciente arriba):
```surql
SELECT id, title, state, updated_at FROM note WHERE type.slug='task' AND state IN ['ACTIVE','WAITING'] AND (defer_until IS NONE OR defer_until <= time::now()) ORDER BY updated_at DESC LIMIT 20;
```
Notas ordenadas por nº de hijos (vía subquery):
```surql
SELECT title, kids FROM (SELECT title, count(<-part_of<-note) AS kids FROM note) WHERE kids > 0 ORDER BY kids DESC LIMIT 10;
```

### Jerarquía (incluye recursión)

Padres e hijos directos:
```surql
SELECT title, ->part_of->note.title AS parent, <-part_of<-note.title AS children FROM ONLY note:abc;
```
Subárbol completo (cierre transitivo, todos los niveles) — devuelve los nodos descendientes; para títulos resuelve FUERA de la puerta (no `.title` dentro del gate):
```surql
SELECT VALUE @.{..+collect}<-part_of<-note FROM note:abc;
```
Árbol anidado, podando ramas cerradas:
```surql
SELECT @.{..4}.{ title, state, children: <-part_of<-note[WHERE state NOT IN ['DONE','ARCHIVED']].@ } AS tree FROM note:abc;
```
Accionables de un área dos saltos abajo (vía proyectos vivos):
```surql
SELECT title, <-part_of<-note[WHERE type.slug='project' AND state='ACTIVE']<-part_of<-note[WHERE type.slug='task' AND state IN ['ACTIVE','WAITING']].title AS live_tasks FROM note:abc;
```
Ramas muertas — proyecto ACTIVE con hijos, pero 0 vivos:
```surql
SELECT title, count(<-part_of<-note) AS kids, count(<-part_of<-note[WHERE state NOT IN ['DONE','ARCHIVED']]) AS live FROM note WHERE type.slug='project' AND state='ACTIVE' AND count(<-part_of<-note)>0 AND count(<-part_of<-note[WHERE state NOT IN ['DONE','ARCHIVED']])=0;
```

### Lo que se nos olvida (tiempo / atención)

Desatendido — vivo pero sin tocar en >2 semanas:
```surql
SELECT id, title, state, updated_at FROM note WHERE state IN ['ACTIVE','WAITING'] AND (defer_until IS NONE OR defer_until <= time::now()) AND updated_at < time::now()-2w ORDER BY updated_at ASC LIMIT 15;
```
Cola de revisión — vivo y sin tocar hace mucho (Huygens 2: la revisión es evento de proposal/ritual, no un field; se usa `updated_at` como proxy de frescura):
```surql
SELECT id, title, updated_at FROM note WHERE state IN ['ACTIVE','WAITING'] AND (defer_until IS NONE OR defer_until <= time::now()) AND updated_at < time::now()-4w ORDER BY updated_at ASC;
```
Proyectos "fantasma" — ACTIVE, pero su hijo vivo más fresco lleva días helado:
```surql
SELECT title, state, duration::days(time::now()-time::max(<-part_of<-note[WHERE state IN ['ACTIVE','WAITING']].updated_at)) AS days_since_live_kid_touch FROM note WHERE type.slug='project' AND state='ACTIVE' AND count(<-part_of<-note[WHERE state IN ['ACTIVE','WAITING']])>0 ORDER BY days_since_live_kid_touch DESC;
```
Salud temporal — media/mediana/p90 de días sin tocar (lo vivo):
```surql
RETURN { mean: math::mean((SELECT VALUE duration::days(time::now()-updated_at) FROM note WHERE state NOT IN ['DONE','ARCHIVED'])), median: math::median((SELECT VALUE duration::days(time::now()-updated_at) FROM note WHERE state NOT IN ['DONE','ARCHIVED'])), p90: math::percentile((SELECT VALUE duration::days(time::now()-updated_at) FROM note WHERE state NOT IN ['DONE','ARCHIVED']), 90) };
```

### Bloqueos

Qué bloquea a cada nota (note o block):
```surql
SELECT id, title, ->blocked_by->(note,block).title AS blocked_by FROM note WHERE count(->blocked_by)>0;
```
Cuello de botella REAL — qué bloquea a más notas vivas:
```surql
SELECT title, count(<-blocked_by<-note[WHERE state IN ['ACTIVE','WAITING']]) AS bloquea_vivas FROM note WHERE count(<-blocked_by<-note[WHERE state IN ['ACTIVE','WAITING']])>0 ORDER BY bloquea_vivas DESC;
```
Bloqueo zombie — el bloqueante ya está DONE (desatascar):
```surql
SELECT title, ->blocked_by->note[WHERE state='DONE'].title AS resueltos FROM note WHERE count(->blocked_by->note[WHERE state='DONE'])>0;
```

### Provenance (de dónde viene y qué tocó)

Provenance de un narrative block (fuentes + topología, dedup multi-edge):
```surql
SELECT id, ->derived_from->raw_capture.content AS sources, array::distinct(->(about,affects)->note.title) AS topics FROM block WHERE block_kind='narrative' LIMIT 5;
```
Qué evidencia (y canal) cambió un estado:
```surql
SELECT title, state, <-affects[WHERE action='state_changed']<-block->derived_from->raw_capture.{kind:source_kind, evidence:string::slice(content,0,90)} AS from_evidence FROM note WHERE count(<-affects[WHERE action='state_changed']<-block)>0;
```

### Inbox, contenido y metadata

Inbox pendiente, FIFO:
```surql
SELECT id, content, source_kind, created_at FROM raw_capture WHERE status='pending' ORDER BY created_at ASC;
```
Salud del inbox (recuento por estado):
```surql
SELECT status, count() AS n FROM raw_capture GROUP BY status;
```
Un raw y lo que generó (su detalle + blocks derivados):
```surql
SELECT *, <-derived_from<-block.id AS derived FROM raw_capture:abc;
```
Buscar texto (varios términos, case-insensitive):
```surql
SELECT id, block_kind, string::slice(content,0,80) AS snip FROM block WHERE string::matches(content,'(?i)(surreal|dashboard|schema)') LIMIT 20;
```
Cuerpo de una nota:
```surql
SELECT title, block_order.*.content AS body FROM ONLY note:abc;
```
Claves presentes en metadata de todo el grafo (el "schema latente"):
```surql
RETURN array::distinct(array::flatten((SELECT VALUE object::keys(metadata) FROM note WHERE metadata != NONE)));
```
Agrupar por una clave de metadata con fallback:
```surql
SELECT (metadata.project ?? '(sin proyecto)') AS proj, count() AS n FROM note GROUP BY proj ORDER BY n DESC;
```

### Auditoría e introspección

Historia de eventos por tipo (la tabla `agent_event` es la vía real, no el changefeed):
```surql
SELECT kind, count() AS n FROM agent_event GROUP BY kind ORDER BY n DESC;
```
Línea de tiempo de un sujeto (ciclo de vida de una proposal; `subject` es record-id sin comillas):
```surql
SELECT kind, actor, created_at FROM agent_event WHERE subject = proposal:abc ORDER BY created_at ASC;
```
Schema vivo de una tabla (campos, asserts, índices):
```surql
INFO FOR TABLE note STRUCTURE;
```
¿Usa índice esta query? (diagnóstico):
```surql
SELECT id FROM note WHERE state='ACTIVE' EXPLAIN;
```

### Búsqueda vectorial / híbrida

Más como este block (vecinos semánticos, sin modelo) — con score de similitud:
```surql
LET $v = (SELECT VALUE embedding FROM ONLY block:abc);
SELECT id, string::slice(content,0,60) AS s, vector::similarity::cosine(embedding,$v) AS score FROM block WHERE embedding <|5,100|> $v AND id != block:abc;
```
Híbrida — similitud + filtro + grafo en una query (lo que la tool `vector_search` no combina):
```surql
LET $v = (SELECT VALUE embedding FROM ONLY block:abc);
SELECT string::slice(content,0,60) AS s, ->about->note.title AS about FROM block WHERE embedding <|10,100|> $v AND block_kind='narrative' AND id != block:abc;
```
Por concepto (texto libre): `embed_text('…')` → bindea el vector como `$v` (campo `parameters`)
→ la misma query KNN sin el `LET`.

## Plantillas latentes

Queries **válidas (STATUS OK)** que hoy devuelven `[]` porque el campo aún no se puebla; se
"encienden" solas cuando lleguen datos.

- **MITs de un día** (`mit_for` sin poblar): `SELECT id, title, mit_for FROM note WHERE mit_for IN d'2026-05-28'..d'2026-05-29';`
- **Sin tocar hace mucho** (Huygens 2 no tiene `last_reviewed_at`: la revisión es evento de proposal/ritual; se usa `updated_at`): `SELECT id, title FROM note WHERE updated_at < time::now()-4w AND state NOT IN ['DONE','ARCHIVED'];`
- **Evidencia inferida que cambió un estado** (riesgo de fidelidad; `transformation` hoy 100% 'summarized'): `SELECT title FROM note WHERE count(<-affects[WHERE action='state_changed']<-block->derived_from[WHERE transformation='inferred']->raw_capture)>0;`
- **Bloqueos sin razón** (`reason` 100% vacío hoy): `SELECT in.title AS blocked, out.title AS blocker, since FROM blocked_by WHERE reason IS NONE;`
- **Vencidas por deadline** (`due_at` campo real; vencida = día **estrictamente anterior** a hoy, no "hoy mismo a las 00:00" — `due_at` está a medianoche): `SELECT id, title, due_at FROM note WHERE due_at IS NOT NONE AND due_at < time::floor(time::now(), 1d) AND state NOT IN ['DONE','ARCHIVED'] ORDER BY due_at ASC;`
- **Próximos vencimientos**: `SELECT id, title, due_at FROM note WHERE due_at IS NOT NONE AND state NOT IN ['DONE','ARCHIVED'] ORDER BY due_at ASC;`
- **Aplazadas / dormidas** (tickler activo): `SELECT id, title, defer_until FROM note WHERE defer_until IS NOT NONE AND defer_until > time::now() ORDER BY defer_until ASC;`
- **Radar activo** (vivas y NO dormidas — el patrón canónico del digest/dashboard): `SELECT id, title, state FROM note WHERE state IN ['ACTIVE','WAITING'] AND (defer_until IS NONE OR defer_until <= time::now());`
  (para "día Madrid" exacto, compara `time::format(defer_until + 2h, '%Y-%m-%d') <= '<día>'`, como el digest.)
