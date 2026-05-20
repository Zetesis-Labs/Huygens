# Comparativa de BBDDs de grafo: cómo llegamos a SurrealDB

> Una vez decidido que Huygens necesitaba una BBDD de grafo (ver [`mongodb-pivot.md`](./mongodb-pivot.md)), había que elegir cuál. Este documento es la auditoría honesta del shortlist, con sus pros, sus contras, y por qué SurrealDB se llevó la decisión.

## Criterios de evaluación

Antes de mirar candidatos, conviene fijar la barra. Para Huygens, los criterios — en orden de peso — fueron:

1. **Encaje conceptual con "topología primaria + edges autorizados"**: ¿la BBDD entiende relaciones tipadas con schema enforcement? Esta es la prueba de fuego, viene directa del framing del usuario
2. **Diseño post-IA**: ¿nació con vector search en el corazón o se lo añadieron en 2023 sobre arquitectura del 2010?
3. **Friendly para agentes LLM**: ¿cuánto training data tiene el lenguaje de query? ¿el agente puede escribir queries correctas sin docs paralelas?
4. **Infraestructura simple**: este es un proyecto de un usuario único, devcontainer-first. JVM no, clusters distribuidos no, sidecars no. Una imagen Docker, idealmente bajo 200 MB de RAM
5. **Madurez razonable**: no necesitamos años de combate de producción, pero sí pasar el filtro "no crashea bajo uso normal"
6. **Multi-modelo bonus**: si la BBDD también hace documentos + KV + vector + time series en un solo motor, eso elimina servicios paralelos

Con estos criterios fijados, vamos al shortlist.

## Las candidatas

### Neo4j

- **Año**: 2007. **La** BBDD de grafos canónica
- **Query language**: Cypher — estándar de facto, mucho training data en LLMs, casi cualquier modelo escribe Cypher con razonable corrección
- **Vector index**: añadido en v5.13 (octubre 2023). **Bolt-on**, no nativo del diseño original
- **Backend**: JVM
- **Schema enforcement de edges**: requiere APOC o convención. No es nativo

**Pros**:
- Madurez extrema. 18 años en el mercado. Stack Overflow saturado, GitHub issues con respuesta, drivers en todos los lenguajes
- Cypher es **lingua franca** del mundo grafo — escribirlo te lo enseña a leer todo lo demás
- Tooling visual (Neo4j Bloom, Browser) potente para introspección
- Ecosistema de plugins (APOC, GDS) muy completo

**Contras**:
- **DNA pre-IA**. El vector index es un retrofit decente pero claramente añadido. La filosofía interna sigue siendo grafo puro
- **JVM**: la base ocupa mucha más memoria que cualquier alternativa moderna. Para un proyecto local de un usuario es desproporcionado
- **Edge schemas**: para enforce qué relaciones son legales entre qué tipos de nodos, necesitas APOC o procedural triggers — no es nativo del diseño
- **Licensing**: la versión Community no incluye varias features (clustering, autorización fina, parte del tooling). Para Huygens da igual, pero molesta saber que muchas cosas que se enseñan en tutoriales requieren Enterprise

**Crítica del usuario** (verbatim):

> "Neo4j es previo a la explosión de la IA, qué más hay"

Esa frase fue suficiente. No es ataque a Neo4j — es reconocer que cuando se diseñó, vector search no era una preocupación, y el shape del motor no fue optimizado para esos workloads. En 2026, un proyecto greenfield no debería heredar esa carga.

**Veredicto**: descartado por **DNA pre-IA**. Si Huygens fuera un proyecto sin vector search ni agentes LLM, Neo4j sería elección razonable.

### FalkorDB

- **Año**: 2023. Fork comunitario de **RedisGraph** después de que Redis Inc. discontinuara RedisGraph (febrero 2023)
- **Query language**: Cypher (mismo subset que Neo4j razonablemente compatible)
- **Vector index**: nativo, integrado en Cypher con función `vec.search()` o equivalente
- **Marketing**: **explícitamente** "GraphRAG for AI". Toda su comunicación gira en torno a ser la backend de retrieval para agentes
- **Backend**: sparse matrix algebra (heredada de RedisGraph). Operaciones sobre el grafo son multiplicaciones de matrices dispersas — muy rápido para traversals
- **Infraestructura**: módulo de Redis. Un solo contenedor, ~50 MB RAM en idle

**Pros**:
- **Cypher portable**: si mañana hay que migrar a Neo4j/Memgraph/Kuzu, gran parte del código de query es transferible
- **Infraestructura ridícula**: módulo Redis. Un binario, un puerto, fin
- **LLMs escriben Cypher casi perfecto** — Falkor hereda todo el training data de Neo4j
- **Marketing alineado**: el equipo de Falkor está literalmente vendiendo "úsame para retrieval de agentes" — eso garantiza inversión en ese caso de uso
- **Velocidad**: sparse matrix backend es genuinamente rápido para traversals densos

**Contras**:
- **Sin schema enforcement de edges**: como en Neo4j, validas en código. No es feature de Cypher
- **Cypher es de 2011** y muestra su edad: hace bien graph traversals pero composición con vectors y filtros se vuelve barroca rápido
- **El fork es joven**: aunque hereda años de RedisGraph, el proyecto bajo el nombre FalkorDB tiene historia corta
- **Sin multi-modelo**: es grafo + vector, punto. Si quieres time series o KV con schema, otra historia
- **Persistencia heredada de Redis**: AOF o RDB. Funciona, pero no es lo mismo que un storage engine pensado para BBDD desde cero

**Veredicto**: contendiente serio. Si el criterio dominante hubiera sido "Cypher portable + infra mínima", Falkor habría ganado. Descartado por el siguiente factor (ver SurrealDB más abajo).

### Memgraph

- **Año**: 2016. Pivotó hard a **GenAI + MCP integration** en 2023-24
- **Query language**: Cypher (compatible con Neo4j en alta medida)
- **Vector index**: nativo desde 2024
- **Backend**: in-memory primary (con snapshots a disco para persistencia opcional). Diseñado para latencia muy baja
- **Distribución**: Community Edition gratis con limitaciones; Enterprise pagado para clustering y features avanzadas

**Pros**:
- Más **tooling for agents** en la caja que cualquier otro Cypher: integration nativa con varios frameworks LLM, MCP server propio
- **In-memory primary** = latencia muy baja, lo cual es bueno para agente reactivo
- Equipo claramente invertido en GenAI use cases — roadmap empuja en esa dirección
- Live query support razonable (con su driver `mg-go`)

**Contras**:
- **Más enterprise-y**: paid tier no trivial; la versión community tiene límites de tamaño y features
- **In-memory implica RAM proporcional al dataset**: para Huygens local en devcontainer, no es un problema (dataset pequeño), pero conceptualmente no escala como una BBDD on-disk
- **Sin schema enforcement de edges**: igual que el resto del campo Cypher
- **Comunidad open source más pequeña** que Neo4j

**Veredicto**: alternativa razonable a FalkorDB. Mismo trade-off al final contra SurrealDB.

### Kuzu

- **Año**: 2022. **Embedded graph DB columnar**. Spinoff académico (Universidad de Waterloo)
- **Query language**: Cypher con extensiones propias
- **Vector index**: nativo
- **Backend**: embebido en el proceso, columnar (como DuckDB pero para grafos). No es servidor, es librería
- **Storage**: ficheros locales, single-writer

**Pros**:
- **Simplicidad operativa máxima**: no servidor, no puerto, no contenedor separado. Tu app abre un fichero y consulta. Como SQLite pero para grafos
- **Fast OLAP-style**: columnar storage es brutal para queries analíticos sobre datasets medianos
- **Cypher con extensiones razonables**
- **Académicamente sólido**: backed por research papers reales (Hexastore-inspired)

**Contras**:
- **Comunidad pequeña**: el proyecto es joven y el ecosistema apenas existe. Cuando algo se rompe, buscas tú la causa
- **Sin "ecosistema GenAI" empaquetado**: hay vector search, sí, pero no hay MCP server oficial ni librerías de tooling para agentes
- **Single-writer**: pensado para analítica, no para escrituras concurrentes intensas
- **Modo embebido** es elegante pero te ata al proceso. Si quieres separar el agente del MCP server en dos procesos, hace falta otra cosa

**Veredicto**: descartado **por ecosistema**, no por arquitectura. Kuzu es elegante. Pero el coste de ser el primer adoptante en este perfil de uso es alto, y no había argumento decisivo a su favor sobre SurrealDB.

### SurrealDB (ELEGIDO)

- **Año**: 2022 lanzamiento público, **v2.0 GA en septiembre 2024**, v2.x actualmente estable
- **Query language**: **SurrealQL** — SQL-ish con extensiones nativas de grafo + vector + JSON access
- **Multi-modelo**: graph + document + KV + time series + vector — todo nativo en un solo schema, sin sidecars
- **Storage backends**: RocksDB (recomendado), SurrealKV (propio, más nuevo), TiKV (cluster distribuido), memoria (testing)
- **Schemafull edges**: `DEFINE TABLE x TYPE RELATION FROM A TO B SCHEMAFULL` enforced por el motor — los demás Cypher no lo dan nativo
- **Live queries**: subscripciones reactivas server-push
- **CHANGEFEED**: time-travel built-in (historial automático con expiración configurable)
- **Wire protocol**: WebSocket-first (también HTTP)
- **Modo embebido**: corre dentro del proceso (Bun, Node, Rust, Python...)

**Pros**:
- **Encaje 1:1 con el framing**: "topología primaria + edges autorizados" es literalmente lo que `DEFINE TABLE TYPE RELATION ... SCHEMAFULL` enforza
- **Diseño post-IA**: nacido en 2022, vector search es nativo, no retrofit
- **Flexibilidad con disciplina**: el motor soporta schemaless si lo pides, schemafull si lo pides. No te obliga a uno, pero schemafull es el modo serio
- **Multi-modelo real**: una sola query puede mezclar graph traversal + vector similarity + document filter. Sin services paralelos
- **Wire protocol moderno**: WebSocket-first habilita live queries elegantes — el agente puede suscribirse a "nuevos items en inbox" en vez de hacer polling
- **CHANGEFEED**: time-travel queries automáticos. Para los informes semanales del agente ("¿qué cambió esta semana?") sin tablas de audit a mano
- **Self-introspectable**: `INFO FOR DB` devuelve el schema completo en JSON, así que el agente puede preguntar "qué tablas tienes" a runtime

**Contras**:
- **Madurez menor**: v2.0 GA fue septiembre 2024. Es la BBDD más joven del shortlist en términos de "estable y rodada"
- **SurrealQL es nicho**: los LLMs lo conocen mucho menos que Cypher. Sus respuestas tienen más probabilidad de inventar sintaxis. Esto se compensa con docs explícitas en el prompt del agente
- **Lock-in**: no portable a otros sistemas. Si Surreal desaparece, migrar es caro
- **Pre-2.0 había bugs serios**: v1.x tuvo cosas feas (panics, queries fallidas). v2.x ha estabilizado pero la memoria larga del ecosistema todavía lleva esa carga
- **Performance en traversals muy profundos** (5+ hops): el query planner es joven, no compite con Neo4j en ese rango

**Veredicto**: **ELEGIDO** por encaje conceptual con el framing del usuario y por ser el único del shortlist con schema enforcement de edges como feature de primera clase del motor.

## Otras evaluadas brevemente y descartadas

### Weaviate

- Vector-first con "cross-references" entre objects que dan **algo** de modelado relacional
- **NO es un property graph real**: las cross-refs son foreign keys + filtros, no edges con properties
- **Descartado**: si tu BBDD se vende como vector DB y "ah también tenemos refs", no es BBDD de grafo. Es lo que pasa cuando intentas vender una sola herramienta para todo

### ArangoDB

- Multi-model maduro: documento + grafo + KV. Muy capaz
- **AI-tooling retrofiteado**: vector index añadido relativamente tarde
- Mismo problema fundamental que Neo4j: arquitectura pensada para era pre-IA, con add-ons modernos
- **Descartado** por el mismo criterio que Neo4j, pero sin la ventaja de Cypher

### TigerGraph / JanusGraph / OrientDB / HypergraphDB

- **TigerGraph**: enterprise pesado, no community-friendly para proyectos personales
- **JanusGraph**: requiere Cassandra/HBase/BerkeleyDB como storage. Infraestructura aniquiladora para single-user
- **OrientDB**: legacy. Comunidad casi muerta tras la adquisición por SAP
- **HypergraphDB**: investigación, no producción
- **Descartados** por legacy, enterprise-only, o moribundo

## Matriz de decisión final

| Criterio | Neo4j | FalkorDB | Memgraph | Kuzu | **SurrealDB** |
|---|---|---|---|---|---|
| Madurez | ★★★★★ | ★★★ | ★★★ | ★★ | ★★★ |
| Cypher / LLM-friendly query | ✅ Cypher | ✅ Cypher | ✅ Cypher | ✅ Cypher (~) | ❌ SurrealQL |
| Vector index nativo | bolt-on | ✅ | ✅ | ✅ | ✅ |
| **Schemafull edges (enforced)** | ❌ | ❌ | ❌ | ❌ | **✅** |
| Multi-model real | ❌ | ❌ | ❌ | ❌ | ✅ |
| Live queries / server push | ❌ | ❌ | ✅ (mg-go) | ❌ | ✅ |
| CHANGEFEED / time-travel | ❌ | ❌ | ❌ | ❌ | ✅ |
| Modo embebido | ❌ | ❌ | ❌ | ✅ | ✅ |
| Infra simple | ❌ JVM | ✅ Redis module | ★★★ | ✅ embedded | ✅ single binary |
| Diseño post-IA | ❌ | ✅ | ✅ (parcial) | ✅ | ✅ |
| Tooling para agentes | bibliotecas | marketing focus | ✅ MCP nativo | ❌ poco | ✅ surrealmcp oficial |
| **Encaje con "topología + edges autorizados"** | parcial | parcial | parcial | parcial | **✅ exacto** |

## El criterio que decidió

La frase del usuario era:

> "Definir una topología inicial y luego ir definiendo las relaciones que **autorizamos** hacia los markdowns."

Reescrito en lenguaje técnico: "las edges deben estar enumeradas como entidades de primera clase en el schema, y el motor debe rechazar las que no están autorizadas".

De toda la lista:

- **Cypher engines (Neo4j, Falkor, Memgraph, Kuzu)** te dejan declarar índices, constraints sobre properties, índices únicos. Pero **no** te dejan declarar "estas son las edges legales entre estos tipos de nodos, y rechaza el resto en runtime"
- **SurrealDB** sí — exactamente con:

```surql
DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE FIELD reason ON blocked_by TYPE string;
DEFINE FIELD since ON blocked_by TYPE datetime DEFAULT time::now();
```

Esa declaración significa: existe una arista llamada `blocked_by`. Sólo va de `note` a `note`. Tiene los fields `reason` (string) y `since` (datetime). Cualquier intento de meter una `blocked_by` entre `note` y `pillar`, o de añadirle un field no declarado, es **rechazado por el motor**.

Esa correspondencia 1:1 con el framing fue lo decisivo. Las otras opciones eran buenas BBDDs de grafo. Surreal era la única que **hablaba el mismo idioma** que el usuario.

## Trade-offs reconocidos honestamente

La elección no es gratis. Los tres costes principales:

### 1. El agente conoce menos SurrealQL que Cypher

Esto es real. Falkor o Neo4j habrían dado al agente más fluidez out-of-the-box. La mitigación es:

- Mantener un **prompt section** con ejemplos canónicos de SurrealQL para Huygens (un par de patrones bien explicados resuelven el 80% de los casos)
- Usar el MCP oficial de SurrealDB (ver [`surrealmcp.md`](./surrealmcp.md)) — sus tools normalizan parte de las operaciones, y el `query` raw deja escape hatch

### 2. v2.x es joven

Es lo que hay. La alternativa era tomar algo con DNA pre-IA o tomar Kuzu con ecosistema mínimo. Surreal es el sweet spot pragmático entre frontier y rodado.

### 3. Lock-in

Cierto. SurrealQL no se traduce a Cypher trivialmente. Si Surreal muere o el roadmap toma un giro pésimo, migrar es trabajo serio.

La defensa contra esto es **mantener el schema y la lógica de dominio bien declarados** — si toda la "verdad" sobre el modelo vive en `DEFINE TABLE` declarations + un layer pequeño de TS, una migración es traducir esas declarations, no reescribir lógica enredada en el código.

## Cross-references

- [`mongodb-pivot.md`](./mongodb-pivot.md) — por qué dejamos Mongo
- [`surrealdb-deep-dive.md`](./surrealdb-deep-dive.md) — cómo funciona Surreal en profundidad
- [`surrealdb-innovations.md`](./surrealdb-innovations.md) — qué hace Surreal que ningún otro
- [`surrealmcp.md`](./surrealmcp.md) — el MCP oficial de SurrealDB
- [`../02-architecture/mcp-three-layer-architecture.md`](../02-architecture/mcp-three-layer-architecture.md)
- [`../02-architecture/devcontainer-and-services.md`](../02-architecture/devcontainer-and-services.md)
- [`../03-data-model/topology-as-primary.md`](../03-data-model/topology-as-primary.md)
- [`../03-data-model/relations-and-edges.md`](../03-data-model/relations-and-edges.md)
