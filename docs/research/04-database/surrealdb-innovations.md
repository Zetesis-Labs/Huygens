# Las innovaciones de SurrealDB

> Documento de análisis técnico. Las "features" típicas no importan — todas las BBDDs tienen features. Lo interesante son las **innovaciones genuinas**, las decisiones de diseño que ningún otro motor toma en la combinación que las toma Surreal. Cada una se examina en su propio mérito y por su impacto concreto en Huygens.

## Qué es una "innovación" en este contexto

Para no caer en marketing speak: una innovación, aquí, es algo que cumple **dos condiciones**:

1. **No es incremental**: no es "X 20% más rápido" o "configuración más fácil de Y conocido". Es una primitiva nueva o una combinación que no existe en otros sistemas serios
2. **Tiene consecuencias prácticas observables**: si pudieras conseguir el mismo resultado con boilerplate trivial sobre otro motor, no cuenta

Con ese listón, repasamos lo que SurrealDB hace que el resto del shortlist no hace.

## 1. Relations as schemafull tables con properties tipadas

### Lo que hacen los demás

- **Neo4j / FalkorDB / Memgraph / Kuzu**: una relación en Cypher es un "bag de properties" sin schema. Puedes meter cualquier field con cualquier tipo. La validación es responsabilidad del código aplicación
- **Postgres**: si quieres modelar una relación con properties, creas una *junction table*. Pero entonces pierdes el modelo de grafo — las consultas de traversal son JOINs en serie y la abstracción se rompe
- **MongoDB**: arrays de `ObjectId` o subdocumentos. Sin garantías de tipo, sin schema enforcement
- **Falkor/Neo4j con constraints**: puedes declarar índices únicos sobre properties, pero **no** puedes declarar "esta relación es entre A y B, los demás extremos son ilegales"

### Lo que hace Surreal

```surql
DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE FIELD reason ON blocked_by TYPE string;
DEFINE FIELD since  ON blocked_by TYPE datetime DEFAULT time::now();
DEFINE INDEX blocked_by_since ON blocked_by FIELDS since;
```

Cuatro cosas en cuatro líneas:

1. La arista `blocked_by` existe como entidad con nombre
2. Sólo va de `note` a `note` — el motor rechaza otros endpoints
3. Tiene fields tipados — `reason: string`, `since: datetime` con default — y rechaza fields no declarados
4. Tiene un índice secundario sobre `since` para queries temporales

Es decir: las aristas son entidades de primera clase con el mismo nivel de disciplina que los nodos.

### Por qué es innovador

En el panorama de BBDDs, las edges son históricamente "second-class citizens": o son foreign keys en SQL (sin properties), o son arrays/objetos sin schema en NoSQL, o son bags sin tipo en Cypher. La diferencia entre **arista como concepto incidental** y **arista como entidad declarada con schema** es categórica, no incremental.

### Por qué importa para Huygens

Es **exactamente lo que el usuario pidió**: "definir una topología inicial y las relaciones que **autorizamos**". Sin esto, esa frase se traduce a "valida en tu código" — el motor no participa. Con esto, el motor enforza. Para un sistema donde el agente puede escribir relaciones, esa diferencia es de seguridad, no de comodidad.

## 2. Wire protocol diseñado para apps reactivas, no para apps del 95

### Lo que tienen los demás

- **Postgres**: TCP wire protocol diseñado en **1996**. Request/response. Sin server push real (LISTEN/NOTIFY existe, pero es un parche)
- **MongoDB**: protocolo binario propio sobre TCP. Request/response
- **Redis**: protocolo RESP, request/response
- **Neo4j Bolt**: protocolo binario sobre TCP, request/response
- Todos pueden hacer "long-polling" o tienen mecanismos de pub/sub atornillados, pero **el wire protocol fue diseñado para apps cliente-servidor de los 90/2000**

### Lo que hace Surreal

Wire protocol **WebSocket-first**. El cliente abre una conexión WebSocket persistente y la usa para:

- Queries (request/response sobre el mismo canal)
- Live queries (server-push de eventos)
- Streaming de resultados (paginación reactiva)
- Sesión persistente con auth + namespace + database

También expone HTTP, pero el modo nativo es WebSocket.

### Por qué es innovador

Las BBDDs que nacieron antes de la web reactiva nunca consideraron "el cliente quiere subscribirse a cambios" como caso de uso de primera. Lo soportan con cinturones y tirantes. SurrealDB es de las primeras BBDDs *generalistas* (no especializadas en pub/sub como Redis) que diseña el protocolo con eso en mente.

### Por qué importa para Huygens

Dos consecuencias concretas:

- **Live queries elegantes**: el agente puede suscribirse a "items nuevos en inbox" o "notas que entran en `ACTIVE`" sin polling. Cuando algo cambia, el agente reacciona. Para un MCP server que el día de mañana hace orquestación reactiva, esto cambia el shape de la arquitectura
- **Streaming results**: una query con muchas filas no devuelve todo en un buffer; el cliente itera. Memoria controlada

## 3. Mismo motor: server, embedded library, browser via WASM

### Lo que tienen los demás

- **Postgres / MySQL / Mongo / Neo4j**: servidor, punto. Cliente conecta vía red. Modo embebido = no existe
- **SQLite**: embedded, punto. Servidor = no existe (modulo proyectos terceros como Litestream que añaden replicación)
- **DuckDB / Kuzu**: embedded primarily

Cada uno hace **una cosa** bien. Para tener servidor y embebido, tradicionalmente tienes que elegir dos productos diferentes.

### Lo que hace Surreal

El **mismo binario y el mismo motor** corre en tres modos:

- **Standalone server**: `surreal start ...` — escucha en un puerto
- **Embedded en proceso**: `new Surreal()` con storage local (RocksDB, SurrealKV, memoria) — corre dentro de Bun/Node/Rust/Python
- **WebAssembly en browser**: el motor compila a WASM, una pestaña puede correrlo

El **schema y las queries son las mismas** en los tres modos. No hay traducción entre client SDK y server SDK porque no hay dos motores diferentes; hay uno solo.

### Por qué es innovador

Disuelve la frontera cliente/servidor. La pregunta "¿dónde corre el motor?" se desacopla de la pregunta "¿qué motor uso?". Esa decoupling no la ofrece nadie más en el shortlist.

### Por qué importa para Huygens

- **Día de mañana**: el MCP server de Huygens podría empaquetarse como binario único (Bun + Surreal embedded) — sin servicios separados, instalable como una app más. No es plan inmediato pero es opción real
- **Testing**: corres Surreal en memoria dentro del test runner, sin contenedor, sin puerto. Tests rápidos y aislados
- **Portabilidad**: si mañana Huygens necesita correr en un context offline (laptop, container limitado), embedded mode sigue funcionando

## 4. CHANGEFEED: time-travel built-in

### Lo que tienen los demás

- **Postgres**: extensiones como `temporal_tables` o `pg_audit` lo aproximan. Es trabajo manual
- **Mongo**: change streams emiten eventos en tiempo real, pero no permiten "query del estado en un punto pasado". Para eso necesitas mantener una tabla de audit a mano
- **Neo4j**: no nativo. Para auditoría completa, plugin terceros o trigger manuales
- **Datomic**: sí lo hace, pero es comercial, JVM, y el modelo es bastante esotérico

### Lo que hace Surreal

```surql
DEFINE TABLE note CHANGEFEED 30d;
```

Esa sola línea: la table mantiene 30 días de cambios automáticamente. Luego:

```surql
-- Estado de la tabla en un momento del pasado
SELECT * FROM note AT d'2026-05-13T10:00:00Z' WHERE state = 'ACTIVE';

-- Lista de cambios desde una fecha
SELECT * FROM note SINCE d'2026-05-15';

-- Pueden incluso usarse en queries más complejos
SELECT count() FROM note SINCE d'2026-05-15' WHERE $event = 'UPDATE';
```

El motor mantiene un log interno y resuelve queries temporales por reconstrucción.

### Por qué es innovador

Las BBDDs tradicionales obligan a elegir entre: (a) inmutabilidad explícita (event sourcing, lo construyes tú), (b) audit tables a mano, (c) no tener historia. Surreal ofrece **una primitiva nativa con expiración configurable**.

### Por qué importa para Huygens

- **Informes semanales narrativos automáticos**: el agente genera reports tipo "esta semana añadiste 12 notas al inbox, completaste 4 tasks de ETHOS, hubo 3 cambios de estado significativos". Sin CHANGEFEED tienes que mantener una tabla `note_change_history` a mano y poblarla con triggers. Con CHANGEFEED es un query
- **Recuperación contra mistakes del agente**: si el agente sobre-escribe algo con basura, mirar el estado de hace 1 hora es trivial. Sin esto, hay que arrastrar audit a mano
- **Análisis longitudinal**: "¿cuántas tasks se movieron de ACTIVE a DONE en marzo?" es una sola query

## 5. Un solo lenguaje para graph + document + vector + geo + KV

### Lo que tienen los demás

- **Mongo + Atlas Search**: queries documentales en pipeline syntax, `$vectorSearch` como stage especial, traversals con `$graphLookup` (lento)
- **Postgres + pgvector + extensions**: SQL para relacional, sintaxis distinta para vector (`<->`), funciones para geo, no hay traversals nativos
- **Neo4j + GDS**: Cypher para grafo, pero vector queries con sintaxis específica de plugin, document operations limitadas
- **Falkor/Memgraph**: Cypher + vector functions, pero no son entornos multi-modelo de verdad

Cada uno paga el "tax cognitivo" de cambiar entre lenguajes/paradigmas dentro del mismo motor.

### Lo que hace Surreal

Una sola query mezcla los paradigmas:

```surql
SELECT 
  title,
  ->of_type->note_type.name AS type,
  vector::distance::cosine(embedding, $query) AS sim,
  geo::distance(meta.location, $user_location) AS km_away,
  meta.tags
FROM note
WHERE state = 'ACTIVE'
  AND ->touches_pillar->pillar.slug = 'sophia'
  AND embedding <|20|> $query
ORDER BY sim ASC
LIMIT 10;
```

En una expresión:

- Selección + projection (relacional/document)
- Traversal de aristas (graph) — `->of_type->note_type.name`
- Vector similarity (vector) — `vector::distance::cosine(...)`
- Geo distance (geo) — `geo::distance(...)`
- JSON path access (document) — `meta.tags`

Todo en SurrealQL. Sin sidecars, sin pipelines de extensión, sin polyglot.

### Por qué es innovador

Multi-modelo *real* — no "tenemos plugins para todo" sino "el lenguaje base entiende todo". El query planner ve la query entera y puede ordenar mejor las operaciones (índices vectoriales primero, traversal después, etc.).

### Por qué importa para Huygens

Búsqueda híbrida es el caso de uso central. El agente quiere preguntar: "dame las notas activas del pilar Sophia más relevantes a este texto, ordenadas por similitud, considerando jerarquía de proyectos". Esa pregunta tiene tres componentes (filter, vector, traversal) que en otros motores requieren tres pasos. En Surreal es una.

## 6. Record links as typed pointers

### Lo que tienen los demás

- **Mongo**: `ObjectId` como referencia, sin tipo. Tu código sabe que `Note.authorId` apunta a `Person`, pero el motor no lo enforza
- **Postgres**: foreign keys tipadas (`REFERENCES persons(id)`) — bien, pero no las traversas con dot notation. Necesitas `JOIN`
- **Neo4j**: edges en vez de refs. Para "el autor de la nota" tienes que escribir `(n)-[:AUTHORED_BY]->(p)`. Más explícito pero más verboso
- **Cypher engines**: para campos derivados (`note.author.country.name`), encadenas traversals largos

### Lo que hace Surreal

```surql
DEFINE FIELD author ON note TYPE record<person>;

-- Uso natural:
SELECT title, author.name, author.country.name FROM note;
```

`author` es un campo tipado como **record link a `person`**. En queries, lo accedes con dot notation. El motor resuelve el link.

Pero **también puedes RELATE** entre los mismos records si quieres tratarlo como edge con properties:

```surql
RELATE note:abc -> authored_by -> person:ruben CONTENT { written_at: time::now() };
```

Es decir: Surreal te permite elegir el grado de "edginess" por relación:

- Si la relación es **simple y unidireccional** (autoría, tipo, owner): `record<X>` como field
- Si la relación es **rica con properties propias y bidireccionalidad explícita** (blocked_by con reason, supports con strength): RELATION table

Esa flexibilidad es subutilizada en otros sistemas, donde la elección es binaria (foreign key vs edge) sin matiz.

### Por qué es innovador

Unifica foreign key + embedded reference + graph edge en un mismo modelo conceptual con tres puntos de la curva: ref tipada con dot access, embedded object completo, o edge con schema.

### Por qué importa para Huygens

- **Note.type** no necesita ser una edge — es una relación 1:1 trivial. `DEFINE FIELD type_id ON note TYPE option<record<note_type>>` y se accede `note.type_id.name`
- **Note.blocked_by** sí necesita ser edge — es N:N con `reason` y `since`
- Modelado más limpio que en Mongo (donde todo sería `ObjectId`) y más conciso que en Cypher (donde todo sería edge explícita)

## 7. Field-level permissions declarativos

### Lo que tienen los demás

- **Postgres**: Row-Level Security (RLS) — potente pero verboso, ligado a roles SQL
- **Mongo**: granular access en Atlas con roles, no a nivel de field declarativo
- **Neo4j Enterprise**: similar a Postgres, edge case features
- **Falkor / Memgraph CE**: minimal access control

### Lo que hace Surreal

```surql
DEFINE FIELD secret ON user
  PERMISSIONS FOR select WHERE id = $auth.id;

DEFINE TABLE note
  PERMISSIONS FOR select, update WHERE author = $auth.id;
```

Permisos como parte del schema, expresables con queries normales. `$auth` es el contexto autenticado de la sesión.

### Por qué es innovador

Postgres RLS funciona pero es divorciado del schema (vives en otra parte de la sintaxis). En Surreal el permission es **inline con la definición de field/table**, como una propiedad más.

### Por qué importa para Huygens (todavía no, pero futuro)

Huygens v1 es single-user — no se usa. Pero si en futuro hay variantes multi-tenant (Rubén comparte algunas notas con su socio, o instala Huygens para un cliente), tener permission expressions declarativos significa que el control de acceso es **parte del modelo**, no un layer aparte que se desincroniza.

## 8. DEFINE FUNCTION + EVENT + PARAM como ciudadanos de primera

### Lo que tienen los demás

- **Postgres**: stored procedures, triggers, sequences — sí, pero la ergonomía es de 1995. PL/pgSQL es punitivo. Funciones SQL son limitadas
- **Mongo**: aggregation pipelines como "código en data". Funciones server-side via `mapReduce` (deprecadas) o `$function` (JS, sandboxed, no recomendado)
- **Neo4j**: stored procedures en Java (APOC, custom). Triggers via APOC. Lejos de "nativo"

### Lo que hace Surreal

Todo en SurrealQL nativo:

```surql
-- Funciones
DEFINE FUNCTION fn::days_since($t: datetime) -> int {
  RETURN duration::days(time::now() - $t);
};

-- Triggers
DEFINE EVENT note_state_change ON note
  WHEN $event = 'UPDATE' AND $before.state != $after.state THEN {
    CREATE state_transition CONTENT {
      note: $this.id,
      from: $before.state,
      to: $after.state,
      at: time::now()
    };
  };

-- Variables globales
DEFINE PARAM $embed_model VALUE 'BAAI/bge-m3';
DEFINE PARAM $embed_dim VALUE 1024;
```

No JavaScript embebido, no PL/pgSQL, no plugins externos. **Las primitivas server-side son del mismo lenguaje que las queries**.

### Por qué es innovador

Reduce el polyglot mental — para extender el comportamiento del motor no aprendes otro lenguaje. La "expressividad server-side" es continua con la "expresividad de query".

### Por qué importa para Huygens

- Encapsular cómputos comunes (staleness, scoring) sin escribirlos en TS y depender de round-trips
- Mantener invariantes (`last_modified_at` siempre actualizado en UPDATE) sin lógica de aplicación
- Constantes del dominio centralizadas (modelo de embeddings, dimensiones) — un único lugar de verdad

## 9. Schema is data and introspectable

### Lo que tienen los demás

- **Postgres**: `information_schema` y `pg_catalog` — funcionan, pero la query es ad-hoc y formato no estándar
- **Mongo**: `db.getCollectionInfos()` etc., expone parcialmente el shape; sin validación enforced no es "el schema" sino "lo que hemos visto"
- **Neo4j**: `db.schema.visualization()` — visual, no estructurado consistentemente para tooling

### Lo que hace Surreal

```surql
INFO FOR DB;
```

Devuelve un objeto JSON con el schema entero: tables, fields, indexes, functions, events, params. Estructurado, consistente, parseable.

También a niveles más finos:

```surql
INFO FOR TABLE note;
INFO FOR FIELD title ON note;
INFO FOR INDEX chunk_embedding ON note_chunk;
```

### Por qué es innovador

El schema **es data accesible vía query normal**, no metadata escondida que requiere herramientas separadas. Cualquier agente, tooling o test puede preguntarlo a runtime.

### Por qué importa para Huygens

- **El agente puede preguntar el schema** antes de operar sobre algo que no conoce — "¿qué tipos de notas existen? ¿qué pillars? ¿qué edges puedo crear desde una `note`?". No necesita docs paralelas que pueden desincronizarse
- **Validar migrations**: un test ejecuta `INFO FOR DB` después de aplicar todas las migrations y verifica que el schema resultante es el esperado
- **Self-documenting**: el dashboard o las tools de introspección no necesitan formatos especiales — leen `INFO FOR DB` y lo presentan

## Resumen del impacto en Huygens

| Innovación | Impacto concreto en Huygens |
|---|---|
| Relations schemafull | "Relaciones autorizadas" enforced por motor — el framing del usuario, en código |
| Wire protocol moderno | Live queries reactivos en vez de polling |
| Mismo motor server / embedded / WASM | Opción futura: binario único; testing fácil sin contenedores |
| CHANGEFEED | Informes semanales narrativos automáticos sin tablas de audit a mano |
| Lenguaje multi-modelo | Búsqueda híbrida (graph + vector + filter) en una sola expresión |
| Record links como pointers tipados | Modelado limpio sin abusar de edges para todo |
| Permission expressions inline | Preparado para multi-tenant futuro sin re-arquitectura |
| Functions / events / params nativos | Server-side logic en el mismo lenguaje que queries |
| Schema introspectable como data | Agente self-aware del schema; tests verificables |

## La pregunta honesta: ¿son innovaciones reales o "features que también existen"?

Algunas (CHANGEFEED, schema introspectable, multi-modelo unified) son **claramente nuevas como combinación** — ningún otro motor del shortlist las ofrece todas a la vez. Otras (record links, permission inline) son refinamientos significativos de primitivas conocidas, no novedades absolutas.

La fuerza de Surreal **no es una innovación aislada**. Es la **combinación coherente** de todas ellas en un único motor diseñado a partir de un modelo mental moderno. Eso es lo que ningún otro entrega.

## Cross-references

- [`mongodb-pivot.md`](./mongodb-pivot.md) — contexto histórico
- [`graph-db-comparison.md`](./graph-db-comparison.md) — comparativa
- [`surrealdb-deep-dive.md`](./surrealdb-deep-dive.md) — cómo funciona en detalle
- [`surrealmcp.md`](./surrealmcp.md) — MCP oficial
- [`../03-data-model/topology-as-primary.md`](../03-data-model/topology-as-primary.md)
- [`../06-theory/declarative-db-as-ontology.md`](../06-theory/declarative-db-as-ontology.md) — el schema como ontología
- [`../06-theory/living-topology.md`](../06-theory/living-topology.md) — la topología como entidad viva (CHANGEFEED + evolución)
