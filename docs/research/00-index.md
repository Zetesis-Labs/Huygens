# Huygens — Research Index

Bienvenido al **ultradump**. Esta carpeta contiene toda la investigación, diseño y reflexión sobre Huygens. Cada documento es leíble independientemente; los cross-references permiten navegación lateral.

## Si vienes nuevo

Lee en este orden:

1. **[CONTEXT.md](./CONTEXT.md)** — qué es Huygens, decisiones cerradas, perfil de usuario (5 min)
2. **[01-vision/motivation.md](./01-vision/motivation.md)** — por qué existe el proyecto (10 min)
3. **[03-data-model/topology-as-primary.md](./03-data-model/topology-as-primary.md)** — el principio rector del diseño (15 min)
4. **[02-architecture/mcp-three-layer-architecture.md](./02-architecture/mcp-three-layer-architecture.md)** — cómo se compone el sistema (15 min)

Total: ~1 hora para tener el mapa completo.

## Si vienes con un propósito

| Propósito | Entrar por |
|---|---|
| Tocar código / construir tools | [02-architecture/](./02-architecture/) + [03-data-model/](./03-data-model/) + [04-database/surrealdb-deep-dive.md](./04-database/surrealdb-deep-dive.md) |
| Entender por qué SurrealDB y no otra | [04-database/](./04-database/) entero |
| Entender qué embeddings y por qué | [05-embeddings-vector/](./05-embeddings-vector/) |
| Profundizar en teoría | [06-theory/](./06-theory/) |
| Pensar el futuro del proyecto | [07-roadmap/](./07-roadmap/) |
| Recordar quién es el usuario y qué busca | [01-vision/](./01-vision/) |

## Estructura completa

### Referencia compartida
- [CONTEXT.md](./CONTEXT.md) — qué es Huygens, decisiones cerradas, perfil del usuario, convenciones

### 01 — Visión y motivación
- [motivation.md](./01-vision/motivation.md) — Por qué existe Huygens
- [user-context.md](./01-vision/user-context.md) — Quién es Rubén y cómo pensar el proyecto para él

### 02 — Arquitectura
- [stack-decisions.md](./02-architecture/stack-decisions.md) — Bun, TS, Biome, devcontainer, MCP transport
- [mcp-three-layer-architecture.md](./02-architecture/mcp-three-layer-architecture.md) — Agente + surrealmcp + Huygens MCP
- [mcp-composition-patterns.md](./02-architecture/mcp-composition-patterns.md) — Composición MCP vs A2A, por qué la hibridación
- [devcontainer-and-services.md](./02-architecture/devcontainer-and-services.md) — Docker Compose, servicios, lecciones aprendidas

### 03 — Modelo de datos
- [topology-as-primary.md](./03-data-model/topology-as-primary.md) — El insight fundacional: la topología antes que el payload
- [relations-and-edges.md](./03-data-model/relations-and-edges.md) — Edges tipados, schemafull, reificación
- [self-critique.md](./03-data-model/self-critique.md) — Trade-offs y limitaciones reconocidas

### 04 — Base de datos
- [mongodb-pivot.md](./04-database/mongodb-pivot.md) — Por qué empezamos con Mongo y por qué nos vamos
- [graph-db-comparison.md](./04-database/graph-db-comparison.md) — Neo4j, FalkorDB, Memgraph, Kuzu, SurrealDB
- [surrealdb-deep-dive.md](./04-database/surrealdb-deep-dive.md) — Cómo funciona en profundidad
- [surrealdb-innovations.md](./04-database/surrealdb-innovations.md) — Qué hace brutalmente distinto
- [surrealmcp.md](./04-database/surrealmcp.md) — El servidor MCP oficial de SurrealDB

### 05 — Embeddings y búsqueda vectorial
- [bge-m3.md](./05-embeddings-vector/bge-m3.md) — El modelo elegido (1024 dims, multilingüe)
- [deepinfra-integration.md](./05-embeddings-vector/deepinfra-integration.md) — Cómo nos conectamos
- [vector-search-strategy.md](./05-embeddings-vector/vector-search-strategy.md) — Chunking, HNSW, queries híbridas

### 06 — Teoría
**Fundamentos**:
- [declarative-db-as-ontology.md](./06-theory/declarative-db-as-ontology.md) — Schema como ontología formal
- [illegal-states-and-curry-howard.md](./06-theory/illegal-states-and-curry-howard.md) — Type-driven design, tipos como proposiciones
- [living-topology.md](./06-theory/living-topology.md) — Schemas que evolucionan, autopoiesis

**Hipergrafos y cognición**:
- [hypergraphs-foundations.md](./06-theory/hypergraphs-foundations.md) — Berge, n-arias, asimetría
- [hypergraphs-and-cognition.md](./06-theory/hypergraphs-and-cognition.md) — El cerebro y los hipergrafos (Petri, Battiston, Bassett)
- [tensor-networks-and-category-theory.md](./06-theory/tensor-networks-and-category-theory.md) — MERA, MPS, Coecke, ZX-calculus

**Cuántica, epistemología, Wolfram**:
- [quantum-and-hypergraphs.md](./06-theory/quantum-and-hypergraphs.md) — Qué resuelve QC, qué no, tensor networks como puente
- [epistemological-pattern.md](./06-theory/epistemological-pattern.md) — Teoría → dormición → unlock (el patrón de neuronas, hipergrafos, etc.)
- [wolfram-and-the-substrate-of-information.md](./06-theory/wolfram-and-the-substrate-of-information.md) — NKS, Physics Project, ruliad

**Adyacencias y filosofía**:
- [adjacent-fields-isomorphisms.md](./06-theory/adjacent-fields-isomorphisms.md) — 13 campos con isomorfismo (Markov, cibernética, sheaves, Spivak, Friston, Whitehead, Deutsch, etc.)
- [philosophical-resonances.md](./06-theory/philosophical-resonances.md) — Tradiciones filosóficas que iluminan el proyecto

### 07 — Roadmap
- [v3-far-future.md](./07-roadmap/v3-far-future.md) — Living ontology, TDA, tensor networks, hipergrafos, distribución embebida

## Lecturas temáticas verticales

Si quieres profundizar en un eje específico, estos clusters cohesionan:

**Eje 1 — Por qué SurrealDB**:
1. [03-data-model/topology-as-primary.md](./03-data-model/topology-as-primary.md)
2. [04-database/mongodb-pivot.md](./04-database/mongodb-pivot.md)
3. [04-database/graph-db-comparison.md](./04-database/graph-db-comparison.md)
4. [04-database/surrealdb-innovations.md](./04-database/surrealdb-innovations.md)
5. [06-theory/declarative-db-as-ontology.md](./06-theory/declarative-db-as-ontology.md)

**Eje 2 — La teoría debajo del modelo**:
1. [06-theory/declarative-db-as-ontology.md](./06-theory/declarative-db-as-ontology.md)
2. [06-theory/illegal-states-and-curry-howard.md](./06-theory/illegal-states-and-curry-howard.md)
3. [06-theory/living-topology.md](./06-theory/living-topology.md)
4. [06-theory/wolfram-and-the-substrate-of-information.md](./06-theory/wolfram-and-the-substrate-of-information.md)
5. [06-theory/adjacent-fields-isomorphisms.md](./06-theory/adjacent-fields-isomorphisms.md)
6. [06-theory/philosophical-resonances.md](./06-theory/philosophical-resonances.md)

**Eje 3 — Hipergrafos y cognición**:
1. [06-theory/hypergraphs-foundations.md](./06-theory/hypergraphs-foundations.md)
2. [06-theory/hypergraphs-and-cognition.md](./06-theory/hypergraphs-and-cognition.md)
3. [06-theory/tensor-networks-and-category-theory.md](./06-theory/tensor-networks-and-category-theory.md)
4. [06-theory/quantum-and-hypergraphs.md](./06-theory/quantum-and-hypergraphs.md)

**Eje 4 — La epistemología que estás viviendo**:
1. [06-theory/epistemological-pattern.md](./06-theory/epistemological-pattern.md)
2. [06-theory/wolfram-and-the-substrate-of-information.md](./06-theory/wolfram-and-the-substrate-of-information.md)
3. [06-theory/philosophical-resonances.md](./06-theory/philosophical-resonances.md)

## Cifras del ultradump

| Cifra | Valor |
|---|---|
| Documentos totales | 36 markdowns (35 contenido + este index) |
| Secciones | 7 + referencia compartida |
| Palabras (estimadas) | ~85,000 |
| Agentes paralelos usados | 8 (primer batch) + 1 (Wolfram) + 2 (escritos directamente: adyacencias, filosofía) |
| Estado de v1 | Commit `707fadb`, en proceso de pivote Mongo → SurrealDB |

## Convenciones internas

- **Español** salvo bloques de código o términos técnicos consagrados
- **Sin emojis** (excepto ✅/❌ en tablas donde aporten claridad)
- **Cross-references** vía rutas relativas markdown
- **Bibliografía** al final de los docs teóricos
- **Tono**: técnico pero accesible, sin marketing speak, sin condescendencia

Para detalle del estilo: [CONTEXT.md](./CONTEXT.md).

## Mantenimiento

Este index NO se actualiza solo. Cuando añadas/elimines docs:
1. Actualiza esta lista
2. Actualiza las cifras al final
3. Si añades una nueva sección entera, añádela a las lecturas temáticas verticales si aplica

Para preguntas no cubiertas o decisiones nuevas: añade un doc en la carpeta apropiada con un nombre descriptivo en kebab-case, y referencialo aquí.
