# SurrealDB en profundidad

> Documento técnico de referencia para Rubén. Cubre los conceptos base, el lenguaje SurrealQL, los patrones operativos, los storage engines, los modos de deployment, el driver TypeScript, y las limitaciones honestas. No es marketing — es la pieza que se relee para trabajar con la BBDD.

## Modelo mental

SurrealDB se entiende mejor si se piensan tres ideas simultáneamente:

1. **Las records tienen IDs direccionables como URIs** — `note:abc123` no es "row con id abc123 en tabla note"; es **el record `note:abc123`**, citable como entidad
2. **Edges son tables**, no metadatos de los nodos. Cuando dices "A está conectado a B vía X", `X` es una table separada con su propio schema
3. **Schemafull o schemaless por table**, declarativo. Tú decides cuánta disciplina aplica a cada cosa

Si has trabajado con Postgres + ORM, la analogía más cercana es: Surreal es como Postgres donde los foreign keys son entidades de primera clase con su propio nombre, sus propios campos y sus propios índices.

## Conceptos base

### Records con IDs direccionables

Cada record tiene un ID con la forma `tabla:slug`:

```surql
note:abc123          -- table 'note', slug 'abc123' (puede ser hash o legible)
note_type:task       -- table 'note_type', slug 'task'
pillar:ethos         -- table 'pillar', slug 'ethos'
person:ruben         -- table 'person', slug 'ruben'
```

El slug puede ser **cualquier identificador** — UUIDs, hashes, o slugs legibles. Para entidades estables y enumerables (pillars, note types) preferimos legibles; para records generados (notas individuales) preferimos hashes o UUIDs.

El ID completo (`note:abc123`) es referenciable directamente en queries:

```surql
SELECT * FROM note:abc123;
UPDATE note:abc123 SET state = 'CLARIFIED';
```

Sin `WHERE id = ...`. El ID *es* la dirección.

### Namespace > Database > Tables

Surreal organiza todo en una jerarquía `ns/db/table`. Para Huygens:

- **Namespace**: `huygens`
- **Database**: `main`
- **Tables**: `note`, `note_type`, `note_chunk`, `pillar`, `person`, ...

Esta separación importa porque permite **multi-tenancy** trivial (un namespace por usuario u organización) o **multi-stage** (un database para prod y otro para staging dentro del mismo servidor). En Huygens, single-user, sólo usamos un namespace y un database.

### Schemafull vs schemaless

Por table:

- `DEFINE TABLE x SCHEMAFULL` — sólo se aceptan los fields declarados; intentar insertar un field no declarado falla
- `DEFINE TABLE x SCHEMALESS` — se acepta cualquier shape

Por defecto, **schemafull**. Es el modo serio. Schemaless existe para casos verdaderamente heterogéneos (logs, eventos mixtos) o para prototipado rápido.

### Dos sabores de tables

#### Document tables

Almacenan entidades. Se definen así:

```surql
DEFINE TABLE note SCHEMAFULL;

DEFINE FIELD title    ON note TYPE string;
DEFINE FIELD content  ON note TYPE string;
DEFINE FIELD pillars  ON note TYPE array<string>
  ASSERT $value ALLINSIDE ['PATHOS_SOMA', 'ETHOS', 'TELOS', 'SOPHIA'];
DEFINE FIELD state    ON note TYPE string DEFAULT 'INBOX'
  ASSERT $value INSIDE ['INBOX', 'CLARIFIED', 'ACTIVE', 'WAITING', 'SOMEDAY', 'DONE', 'ARCHIVED'];
DEFINE FIELD created_at      ON note TYPE datetime DEFAULT time::now();
DEFINE FIELD last_modified_at ON note TYPE datetime DEFAULT time::now();
```

Las `ASSERT` clauses son validaciones que el motor enforza en cada `CREATE`/`UPDATE`.

#### Relation tables

Almacenan **edges**. Se definen así:

```surql
DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE FIELD since   ON blocked_by TYPE datetime DEFAULT time::now();
DEFINE FIELD reason  ON blocked_by TYPE option<string>;
```

Lo crítico:

- `TYPE RELATION` marca esto como una table de aristas
- `FROM note TO note` enforza que esta arista sólo va de `note` a `note`. Intentar crear `blocked_by` desde una `note` a un `pillar` falla en el motor
- Los fields son **fields de la arista**, no de los nodos extremos. Una arista `blocked_by` tiene sus propios `since` y `reason`

Que esto sea **una table** significa que puedes:

- `SELECT * FROM blocked_by WHERE since < '2026-01-01'` — listar aristas
- `SELECT count() FROM blocked_by` — contarlas
- Definir índices sobre ellas

Edges = entidades de primera clase.

## CRUD básico

### Crear

```surql
CREATE note:abc CONTENT {
  title: 'Pivotar a Surreal',
  content: 'Mongo no encaja, ver investigación...',
  pillars: ['ETHOS', 'SOPHIA'],
  state: 'INBOX'
};
```

`CONTENT { ... }` reemplaza todo el record. `SET field = value, ...` actualiza fields individuales:

```surql
UPDATE note:abc SET state = 'CLARIFIED', last_modified_at = time::now();
```

### Leer

```surql
SELECT * FROM note WHERE state = 'INBOX';
SELECT title, state FROM note WHERE pillars CONTAINS 'ETHOS';
SELECT * FROM note:abc;  -- por ID directo
```

### Borrar

```surql
DELETE note:abc;
DELETE FROM note WHERE state = 'ARCHIVED' AND last_modified_at < d'2025-01-01';
```

### RELATE (crear aristas)

```surql
RELATE note:abc -> of_type -> note_type:task;
RELATE note:def -> blocked_by -> note:abc CONTENT { reason: 'waiting on PR review' };
RELATE note:ghi -> part_of -> note:project_001;
```

La sintaxis lee literalmente "desde `note:abc`, una arista `of_type`, hasta `note_type:task`".

`CONTENT { ... }` sobre RELATE pone fields en la arista, no en los nodos.

## Traversal operators: la diferencia real

Aquí SurrealQL diverge fuertemente de SQL y se acerca a Cypher. Los operadores `->` y `<-` recorren aristas.

### `->edge->target` (salir hacia adelante)

```surql
-- Notas que son de tipo 'task'
SELECT * FROM note WHERE ->of_type->note_type.slug = 'task';

-- Para una nota dada, su tipo
SELECT ->of_type->note_type AS type FROM note:abc;
```

Lee: "desde el record, sigue una arista `of_type` hacia un record `note_type`".

### `<-edge<-source` (entrar hacia atrás)

```surql
-- Para una nota dada, quién la bloquea (qué notas la apuntan vía blocked_by)
SELECT <-blocked_by<-note AS blockers FROM note:abc;
```

Lee: "desde el record, retrocede una arista `blocked_by` hacia un record `note`".

### Multi-hop

Se encadena:

```surql
-- Todas las notas que están en algún Project que pertenece al Area 'salud'
SELECT *
FROM note
WHERE ->part_of->note WHERE ->of_type->note_type.slug = 'project'
                       AND ->part_of->note->of_type->note_type.slug = 'area'
                       AND ->part_of->note.title = 'salud';
```

Sí, se complica. Para queries multi-hop con condiciones complejas, considerar:

1. Romperlas en pasos con `LET $intermediate = ...`
2. Definir funciones (`DEFINE FUNCTION`) que encapsulen el patrón
3. Aceptar que el query es complejo porque la pregunta lo es

### Fetching aristas como objetos

A veces quieres los edges, no los targets:

```surql
-- Las propias edges blocked_by que salen de una nota
SELECT ->blocked_by AS blocks FROM note:abc FETCH blocks;
```

`FETCH` resuelve el record link y trae los campos en el resultado.

## Vector search

### Definir el índice

```surql
DEFINE INDEX chunk_embedding ON note_chunk
  FIELDS embedding
  HNSW DIMENSION 1024 DIST COSINE
  EFC 150 M 16;
```

- **HNSW**: algoritmo (alternativa: `MTREE`)
- **DIMENSION 1024**: BGE-M3 produce 1024-dim
- **DIST COSINE**: métrica
- **EFC** / **M**: parámetros de HNSW (calidad del índice)

### Consultar

```surql
SELECT id, content,
       vector::distance::cosine(embedding, $query) AS score
FROM note_chunk
WHERE embedding <|10|> $query
ORDER BY score ASC;
```

- `<|10|>` significa "top-K=10 vecinos más cercanos del índice"
- `vector::distance::cosine(...)` da la distancia exacta (entre 0 y 2)

### Combinando vector + grafo

Aquí es donde Surreal brilla. En un solo statement:

```surql
SELECT id, content,
       vector::distance::cosine(embedding, $query) AS score
FROM note_chunk
WHERE embedding <|20|> $query
  AND <-of_chunk<-note WHERE state = 'ACTIVE'
                          AND pillars CONTAINS 'SOPHIA'
ORDER BY score ASC
LIMIT 10;
```

Lee: "vecinos top-20 del query embedding, filtrados a aquellos cuya nota padre está activa y toca el pilar Sophia, los 10 mejores".

En Mongo + Atlas Search hacerlo requería `$vectorSearch` seguido de `$lookup` y `$match`. Aquí es una expresión.

## Live queries

```surql
LIVE SELECT * FROM note WHERE state = 'INBOX';
```

Devuelve un **WebSocket subscription**. Cada `CREATE`/`UPDATE` que afecta la condición emite un evento. El cliente recibe push en tiempo real.

Útil para Huygens: el agente puede suscribirse a "nuevos items en inbox" en vez de hacer polling cada N segundos. Para queries de tipo "monitor", esto es notablemente más limpio.

## INFO FOR DB (introspección)

```surql
INFO FOR DB;
```

Devuelve un objeto con el schema completo: tables, fields, indexes, functions, events, params. Útil porque:

- El agente puede preguntar el schema a runtime — no necesita docs paralelas
- Tests pueden verificar que las migrations dejaron el schema en el estado esperado
- Tooling de introspección (CLI, dashboard) es trivial de construir

También hay `INFO FOR TABLE note`, `INFO FOR FIELD title ON note`, etc.

## CHANGEFEED (time-travel)

```surql
DEFINE TABLE note CHANGEFEED 30d;
```

Marca la table para mantener 30 días de cambios. Luego puedes consultar:

```surql
-- Estado de la table en un momento del pasado
SELECT * FROM note AT d'2026-05-13T10:00:00Z' WHERE state = 'ACTIVE';

-- Lista de cambios desde una fecha
SELECT * FROM note SINCE d'2026-05-15';
```

Esto **reemplaza tablas de audit hechas a mano**. Para los informes semanales del agente ("¿qué pasó esta semana?"), CHANGEFEED es exactamente la primitiva correcta. Ver [`surrealdb-innovations.md`](./surrealdb-innovations.md) para profundidad.

## DEFINE FUNCTION (UDFs)

Funciones definidas en SurrealQL, reusables como `fn::nombre(...)`:

```surql
DEFINE FUNCTION fn::days_since_review($note_id: record<note>) -> int {
  RETURN duration::days(time::now() - $note_id.last_reviewed_at);
};

-- Uso
SELECT title, fn::days_since_review(id) AS stale
FROM note
WHERE state = 'ACTIVE';
```

Para Huygens: encapsulan cómputos que aparecen en muchos queries (staleness, scoring, agregaciones específicas del dominio).

## DEFINE EVENT (triggers)

```surql
DEFINE EVENT note_updated ON note
  WHEN $event = 'UPDATE' THEN {
    UPDATE $this SET last_modified_at = time::now();
  };
```

Variables disponibles: `$event` (CREATE/UPDATE/DELETE), `$this` (record actual), `$before` / `$after` (estado previo y posterior).

Para Huygens: mantenimiento automático de `last_modified_at`, propagación de cambios, etc.

## DEFINE PARAM

Variables globales del database:

```surql
DEFINE PARAM $embed_dim VALUE 1024;
DEFINE PARAM $embed_model VALUE 'BAAI/bge-m3';
```

Usables luego como `$embed_dim` en cualquier query. Útiles para constantes de configuración.

## Storage engines

### RocksDB (recomendado para Huygens)

- Persistente
- Rodado en producción (es el storage de Kafka Streams, CockroachDB, etcd, etc.)
- Embebido en el binario Surreal (no requiere proceso separado)
- Performance bueno para read-heavy con writes razonables
- **Es la elección por defecto y la que usamos en Huygens**

Setup:
```bash
surreal start rocksdb:/data/db --bind 0.0.0.0:8000
```

### SurrealKV

- Storage engine propio de SurrealDB
- Más nuevo, aún con aristas en v2.x
- Diseñado para mejorar latencias específicas (especialmente live queries)
- Para producción con cargas críticas, todavía elegimos RocksDB

### TiKV

- Distribuido (CockroachDB-style consensus)
- Para cluster multi-nodo
- **Overkill brutal para Huygens single-user**

### Memory

- No persistente, todo en RAM
- Sólo para testing o demos efímeras

## Deployment modes

### Standalone server (modo Huygens)

Un binario corriendo como servicio:

```bash
surreal start rocksdb:/data/db \
  --bind 0.0.0.0:8000 \
  --user root --pass root \
  --log info
```

Cliente se conecta via WebSocket o HTTP. Es lo que corre en el devcontainer.

### Embedded en proceso

El driver TypeScript permite correr Surreal **dentro del proceso del cliente**, sin servidor separado:

```ts
import { Surreal } from 'surrealdb'

const db = new Surreal()
await db.connect('surrealkv://./data/huygens.db', {
  namespace: 'huygens',
  database: 'main'
})
```

Usa storage local (RocksDB o SurrealKV). Útil para CLIs portables, testing, o para el día que se empaquete Huygens como binario único.

### WASM en browser

Surreal compila a WebAssembly. El mismo motor puede correr en una pestaña del browser. Para Huygens no aplica directamente, pero conceptualmente es relevante: la frontera cliente/servidor se disuelve.

## Driver TypeScript

```ts
import { Surreal } from 'surrealdb'

const db = new Surreal()

await db.connect('ws://surrealdb:8000/rpc', {
  namespace: 'huygens',
  database: 'main',
  auth: { username: 'root', password: 'root' }
})

// Query simple
const [inbox] = await db.query<[Note[]]>(
  `SELECT * FROM note WHERE state = 'INBOX'`
)

// Con params
const [results] = await db.query<[Note[]]>(
  `SELECT * FROM note WHERE pillars CONTAINS $pillar`,
  { pillar: 'ETHOS' }
)

// CRUD helpers (alternativa a query raw)
const created = await db.create('note', {
  title: 'Foo',
  content: 'Bar',
  pillars: ['ETHOS']
})

// Live query
const liveId = await db.live<Note>('note', (action, result) => {
  console.log(action, result)  // 'CREATE' | 'UPDATE' | 'DELETE'
}, true /* diff */)

// Cleanup
await db.kill(liveId)
await db.close()
```

Notas sobre el driver:

- **Tipos genéricos en `query<T>`** son útiles, pero NO los infiere automáticamente del schema — tú declaras los tipos en TS
- Para mantener parity entre schema SurrealQL y tipos TS, usar **generadores** (existen comunidad-built) o tipear a mano las entidades en `apps/mcp/src/types/`
- El driver soporta `ws://`, `wss://`, `http://`, `https://`, y `surrealkv://` / `rocksdb://` para embedded

## Limitaciones honestas para Huygens

Vale la pena saber dónde duele.

### 1. Traversals muy profundos (5+ hops)

El query planner es joven. Neo4j tiene 18 años optimizando esto y le sigues teniendo respeto. En Surreal v2.x, una query con 6 hops y filtros complejos puede ser sensiblemente más lenta de lo esperado. Para Huygens (uso real ~2-3 hops) no es problema, pero si en futuro aparece una query "todo lo conectado a X dentro de 5 saltos", conviene profile-arlo.

### 2. SurrealQL lock-in

No se traduce a Cypher trivialmente. Si Surreal muere o cambia roadmap, migrar implica reescribir queries. Mitigación: mantener el schema declarativo limpio (mucha de la "verdad" en `DEFINE TABLE`s) y la lógica TS desacoplada de SurrealQL en queries auxiliares.

### 3. Madurez

v2.x es estable, pero la huella de v1.x todavía pesa. Hay edge cases que aparecen en GitHub issues. La comunidad responde rápido pero pequeña.

### 4. SurrealQL LLM gap

Los modelos conocen Cypher mejor que SurrealQL. Para Huygens, donde el agente escribe queries, esto significa más fricción inicial. Mitigación: ejemplos canónicos en el prompt + uso del MCP oficial para CRUD (que normaliza las operaciones más comunes — ver [`surrealmcp.md`](./surrealmcp.md)).

### 5. Tooling visual menos rico

Surrealist (el dashboard oficial) es decente pero no comparable con Neo4j Browser o Memgraph Lab en términos de visualización de grafos. Para introspección rápida está bien; para "explorar visualmente un dataset complejo", aún no compite.

## Performance esperado a escala de Huygens

Para calibrar expectativas, vale la pena hacer la cuenta:

- **Notas estimadas**: ~5k/año → ~50k en 10 años
- **Chunks**: ~3-5 por nota → ~150k-250k chunks en 10 años
- **Edges**: ~3-10 por nota → ~150k-500k edges en 10 años
- **Traversals típicos**: 2-3 hops, no más
- **Vector queries**: docenas por día (no QPS de SaaS)
- **Writes**: bajísimos (decenas al día como mucho)

En ese rango, **Surreal es completamente cómodo** corriendo single-node con RocksDB, en un devcontainer de 2-4 GB RAM, dataset cabiendo en memoria. Latencias esperadas: sub-10ms para queries simples, sub-100ms para traversal multi-hop, sub-200ms para vector search en top-10.

Donde Surreal empezaría a sufrir: >1M nodos con traversals profundos constantes, o >10M vectores con QPS alto. **Lejísimos del uso real**.

## Recursos para profundizar

- **Docs oficiales**: https://surrealdb.com/docs
- **Surrealist** (dashboard): https://surrealist.app
- **GitHub**: https://github.com/surrealdb/surrealdb
- **Discord**: comunidad activa, equipo presente
- **Aeon book** (libro oficial, gratis): tour completo en formato narrativo
- **YouTube channel oficial**: walkthroughs de v2.x features (CHANGEFEED, live queries, vector, etc.)

## Cross-references

- [`mongodb-pivot.md`](./mongodb-pivot.md) — por qué pivotamos
- [`graph-db-comparison.md`](./graph-db-comparison.md) — la comparativa que decidió Surreal
- [`surrealdb-innovations.md`](./surrealdb-innovations.md) — qué hace Surreal único
- [`surrealmcp.md`](./surrealmcp.md) — el MCP oficial
- [`../02-architecture/devcontainer-and-services.md`](../02-architecture/devcontainer-and-services.md) — cómo se monta el devcontainer
- [`../02-architecture/mcp-three-layer-architecture.md`](../02-architecture/mcp-three-layer-architecture.md) — capas
- [`../03-data-model/topology-as-primary.md`](../03-data-model/topology-as-primary.md) — el principio rector
- [`../03-data-model/relations-and-edges.md`](../03-data-model/relations-and-edges.md) — modelado de relaciones
- [`../05-embeddings-vector/`](../05-embeddings-vector/) — embeddings y vector search en detalle
