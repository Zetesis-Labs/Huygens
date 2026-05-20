# Hipergrafos: fundamentos del campo

> Generalización del grafo binario a relaciones de aridad arbitraria. Qué son, de dónde vienen, por qué importan y por qué — pese a ser conceptualmente naturales — no han desplazado al grafo binario en la mayoría de bases de datos.

## Punto de partida: por qué necesitamos generalizar el grafo

El grafo binario clásico es la abstracción dominante en computación moderna: redes sociales, knowledge graphs, dependency graphs, parsers, optimizadores. Lo conocemos como `G = (V, E)` donde `E ⊆ V × V`. Cada arista conecta exactamente dos vértices.

Esta abstracción es elegante, computacionalmente tratable y suficiente para muchísimos problemas. Pero arrastra una asunción profunda: **toda relación interesante se puede descomponer en pares**. Y eso no es cierto.

Considera tres ejemplos cotidianos:

1. **Una reunión**: Alice, Bob y Carlos discuten el roadmap del Q3. Modelarlo como tres edges binarios (`alice-bob`, `alice-carlos`, `bob-carlos`) pierde el hecho de que es **un solo evento**, no tres encuentros bilaterales superpuestos.
2. **Una reacción química**: `2 H₂ + O₂ → 2 H₂O`. Hay reactivos (conjunto), productos (conjunto) y estequiometría. Reducirlo a pares de moléculas elimina la estructura de la reacción.
3. **Un paper coautorizado**: cinco autores firmando un mismo artículo. El "co-autoría" es una relación 5-aria intrínseca; descomponerla en `C(5,2) = 10` aristas binarias borra que es **una colaboración**, no diez colaboraciones bilaterales.

En cada caso, la unidad semántica es un **conjunto de participantes**, no un par. Cuando forzamos el modelo binario, o reificamos (convertimos la relación en un nodo) o aceptamos pérdida estructural. La reificación funciona y es el patrón dominante en grafos reales, pero conceptualmente estamos aproximando algo que tiene una abstracción matemática propia: el **hipergrafo**.

## Definición formal

Un **hipergrafo** es un par `H = (V, E)` donde:

- `V` es un conjunto finito de vértices
- `E ⊆ 𝒫(V)` es un conjunto de **hyperedges**, cada uno un subconjunto cualquiera de `V` con cardinalidad `|S| ≥ 2`

El grafo clásico es el caso degenerado `|S| = 2` para todo `S ∈ E`. Un hipergrafo donde todas las aristas tienen la misma cardinalidad `k` se llama **k-uniforme** (un grafo es un hipergrafo 2-uniforme).

Notación habitual:

```
H = (V, E)
V = {v₁, v₂, ..., vₙ}
E = {e₁, e₂, ..., eₘ},  donde cada eᵢ ⊆ V, |eᵢ| ≥ 2
```

La definición es completamente combinatoria: nada impide que una hyperedge contenga 2, 3 o `n-1` vértices. Esa libertad es la fuente de la potencia expresiva y también de la dificultad algorítmica.

## Historia: de Berge a la network science higher-order

### Claude Berge y la fundación (1970s)

El campo lo funda **Claude Berge**, matemático francés especializado en combinatoria, con _Graphes et hypergraphes_ (1970). La traducción inglesa _Hypergraphs: Combinatorics of Finite Sets_ (North-Holland, 1989) es la referencia canónica. Berge no inventa el objeto — variantes aparecen antes en combinatoria — pero sistematiza la teoría: colorings, matchings, transversales, dualidad, propiedad de Helly, hypergraphs balanceados.

Su perspectiva es la de un combinatorialista puro: hipergrafos como **conjuntos de conjuntos** con propiedades estructurales que extienden teoremas clásicos (Hall, König, Menger).

### Trabajo paralelo en probabilidad: Erdős y Rényi

Antes y durante Berge, **Paul Erdős** y **Alfréd Rényi** estudian hipergrafos aleatorios. El célebre teorema umbral de Erdős–Rényi sobre conectividad en grafos `G(n,p)` se generaliza a hipergrafos `k`-uniformes con resultados sobre cuándo aparecen hyperedges, cuándo se conecta el hipergrafo, cuándo emergen componentes gigantes. Esta línea conecta directamente con la moderna network science.

### Los hipergrafos en sombra (1990s–2000s)

Durante dos décadas el campo permanece principalmente en matemáticas discretas, con apariciones esporádicas en optimización combinatoria (set cover, hitting set), bases de datos relacionales (dependencias multivaluadas como hyperedges del schema) y verificación formal.

La ausencia en sistemas prácticos es notable: aunque RDF (1999) define triples sujeto-predicado-objeto que son edges binarios etiquetados, no hay un equivalente "RDF n-ario" que se imponga. Las extensiones como [N3](https://www.w3.org/TeamSubmission/n3/) o reificación RDF son workarounds.

### Renacimiento: higher-order networks (2010s–presente)

Dos cosas cambian a partir de ~2015:

1. **Datasets reales**: surgen colecciones masivas de interacciones genuinamente higher-order — coautoría académica (DBLP), grupos en redes sociales (chats grupales en WhatsApp/Telegram), eventos colectivos (drug-protein-disease en biomedicina), conversaciones multi-participante.
2. **Topología algebraica computacional madura**: TDA (Topological Data Analysis) ofrece herramientas (persistent homology, Mapper) que requieren estructura simplicial. Librerías como [Gudhi](https://gudhi.inria.fr/) y [Ripser](https://github.com/Ripser/ripser) hacen viable computar invariantes topológicos sobre datos reales.

El paper que marca el cambio de fase es **"Networks beyond pairwise interactions: Structure and dynamics"** de Federico Battiston, Giulia Cencetti, Iacopo Iacopini, Vito Latora, Maxime Lucas, Alice Patania, Jean-Gabriel Young y Giovanni Petri, publicado en _Physics Reports_ (2020). Es la referencia moderna canónica: cataloga el zoo de modelos higher-order, define la terminología, plantea los problemas abiertos.

Desde entonces hay venues dedicados (workshops en NetSci, en NeurIPS sobre hypergraph learning), un libro de Battiston _Higher-Order Systems_ (Springer, 2022), y un crecimiento exponencial en arxiv. El campo ya no está latente.

## Variantes principales

La definición básica `H = (V, E ⊆ 𝒫(V))` admite enriquecimientos. Cada variante captura un fenómeno distinto.

### Hipergrafos no dirigidos

La forma pura: hyperedges como conjuntos sin orientación interna. Aplica cuando los participantes son **simétricos** en el papel que juegan:

- Coautoría académica: cinco autores firman un paper; ninguno tiene rol distinguido en la relación de coautoría.
- Grupos sociales: miembros de un equipo, alumnos de una clase, asistentes a una conferencia.
- Conjuntos co-comprados (market basket analysis): los productos en un carrito.

Aquí la estructura matemática es la de un **sistema de conjuntos** sobre `V`. Esto es lo que Berge llama "hipergrafo" sin más adjetivo.

### Hipergrafos dirigidos

Cada hyperedge tiene dos lados orientados: una **cola** (`tail`) y una **cabeza** (`head`), cada uno un subconjunto de `V`:

```
e = (T, H),  T, H ⊆ V,  T ∩ H = ∅ (opcionalmente)
```

Aplica cuando hay flujo, causación o transformación:

- Reacciones químicas: `T = {H₂, H₂, O₂}`, `H = {H₂O, H₂O}`. La estequiometría puede modelarse con multiconjuntos.
- Workflows: una tarea con N inputs produce M outputs.
- Dependencias en sistemas de build: compilar un binario requiere N archivos fuente y produce M artefactos.
- Petri nets: son esencialmente hipergrafos dirigidos con semántica operacional (tokens).

### Hipergrafos con roles (k-partite, atributados)

Cada participante en la hyperedge ocupa un **rol nombrado**:

```
giving_event(giver: Alice, receivers: {Bob, Carlos}, gift: Book42, date: 2024-12-25)
```

Esto es lo que en bases de datos llamamos un "evento" reificado con campos tipados. En lingüística computacional es exactamente un **frame semántico** al estilo FrameNet o PropBank: `Commerce_buy(Buyer, Seller, Goods, Money)`. Cada slot tiene un rol y un dominio.

Estructuralmente, un hipergrafo con roles es un hipergrafo cuyas hyperedges son **diccionarios rol → vértice** (o rol → conjunto de vértices) en lugar de simples conjuntos.

### Simplicial complexes

Un **complejo simplicial abstracto** `K` sobre `V` es un sistema de conjuntos cerrado bajo subconjuntos: si `σ ∈ K` y `τ ⊆ σ`, entonces `τ ∈ K`. Es decir: si tenemos la hyperedge `{a, b, c}`, automáticamente tenemos `{a, b}`, `{a, c}`, `{b, c}`, `{a}`, `{b}`, `{c}`.

Es **más estructurado** que un hipergrafo general — la presencia de un simplex `k`-dimensional implica la presencia de todas sus caras. Esta clausura es lo que permite definir homología, cohomología y persistent homology de forma limpia. Casi toda la topología algebraica computacional opera sobre simplicial complexes (o sus generalizaciones: CW-complexes, cubical complexes).

La relación es: **todo simplicial complex es un hipergrafo, pero no todo hipergrafo es un simplicial complex**. Para convertir un hipergrafo `H` en un simplicial complex se computa su _down-closure_ (añadir todas las caras de cada hyperedge).

### Hypergraphs vs bipartite graphs (el isomorfismo subestimado)

Un hipergrafo `H = (V, E)` admite una representación canónica como **grafo bipartito** `B(H)`:

- Lado izquierdo: `V` (vértices originales)
- Lado derecho: `E` (un nodo por hyperedge)
- Aristas binarias: `v — e` sii `v ∈ e`

Esto es matemáticamente una equivalencia: los hipergrafos sobre `n` vértices están en biyección con los grafos bipartitos con un lado de `n` nodos. **La reificación de la que hablaremos abajo no es un workaround sucio, es esta biyección formal**.

## Por qué los hipergrafos no son mainstream en bases de datos

Si los hipergrafos son tan naturales para muchos problemas, ¿por qué casi ningún graph DB los soporta nativamente? Cinco razones, por orden de peso:

### 1. Complejidad computacional crece bruscamente

Muchos problemas que son polinómicos en grafos se vuelven NP-hard (o peor) en hipergrafos:

| Problema | Grafos | Hipergrafos |
|---|---|---|
| Vertex cover | NP-hard, 2-aprox PTIME | NP-hard, no constant-factor aprox bajo UGC |
| Matching máximo | O(V·E) (Hopcroft–Karp en bipartito), polinómico general | NP-hard incluso para 3-uniform |
| Edge coloring | NP-hard pero ≤ Δ+1 (Vizing) | NP-hard, sin cota tipo Vizing |
| 2-coloring (bipartiteness) | O(V+E) BFS | NP-hard ("property B") |
| Min cut | Polinómico (Stoer–Wagner) | Polinómico pero más caro, definición delicada |
| Isomorfismo | Quasi-polinómico (Babai 2016) | Abierto, presumiblemente más difícil |

Estos resultados son [folklore documentado en Berge 1989 y revisado en Schrijver _Combinatorial Optimization_]. La consecuencia práctica: los optimizadores de queries en hipergrafos no pueden apoyarse en los algoritmos clásicos del catálogo.

### 2. No hay un Cypher de hipergrafos

Cypher (Neo4j), Gremlin (TinkerPop), GQL (ISO 2024) — todos asumen edges binarios. La sintaxis fundamental `(a)-[r]->(b)` codifica esa asunción. Generalizarla a n-ariedad rompe la elegancia visual y la composabilidad. **Las propuestas existen** (HyperGremlin, extensiones académicas) pero **ninguna ha cuajado como estándar**. Cada hypergraph engine reinventa su DSL.

### 3. Mental model más costoso

Dibujar grafos binarios es sencillo: puntos y líneas. Dibujar hipergrafos requiere o bien:

- **Representación de Euler**: hyperedges como regiones que envuelven sus vértices. Visualmente saturado para hyperedges grandes.
- **Representación bipartita**: añadir nodos auxiliares por hyperedge. Es claro pero exactamente lo mismo que la reificación.
- **Hyperedges como hipersuperficies**: extender la metáfora geométrica al espacio n-dimensional. Útil para análisis, intratable para inspección visual.

Esto importa porque las graph databases viven en parte de su valor como **herramienta de pensamiento** — diagramas en pizarras, exploradores interactivos. Si el modelo no se dibuja, no se piensa fluido.

### 4. Optimizadores con décadas de tuning para binario

Los planners de Neo4j, Memgraph, JanusGraph, TigerGraph llevan 10–15 años optimizando joins, traversals, índices sobre el modelo binario. Replicar ese trabajo para hipergrafos requeriría una inversión que ningún incumbente ha hecho. Los hypergraph engines académicos parten desde cero y se notan.

### 5. HypergraphDB como caso ilustrativo

[HypergraphDB](http://hypergraphdb.org/) (Borislav Iordanov, ~2010, Java) es el ejemplo más serio de DB con hyperedges nativos. Es un proyecto interesante, conceptualmente claro, pero:

- Desarrollo prácticamente parado desde ~2018
- Ecosistema mínimo (sin drivers maduros, sin tooling de observabilidad)
- Documentación buena pero envejecida
- Performance sobre datasets modernos sin benchmarks competitivos

Es un museo virtual valioso para entender la idea, pero no un sistema en el que apostar producción. Su trayectoria es la advertencia: el mercado no ha premiado la fidelidad estructural sobre la pragmática.

## El workaround universal: reificación

La reificación es **la** técnica para representar relaciones n-arias con edges binarios. Es matemáticamente exacta (la biyección hipergrafo ↔ bipartito vista arriba) y operacionalmente manejable con cualquier graph DB del mercado.

### Patrón

Dado una hyperedge `e = (v₁, v₂, ..., vₖ)` con roles `r₁, ..., rₖ`:

1. Crear un nodo `n_e` que representa la hyperedge
2. Por cada participante `vᵢ`, crear una arista binaria tipada `n_e -[rᵢ]→ vᵢ` (o invertida, según convención)
3. Atributos de la relación se guardan como propiedades de `n_e`

### Ejemplo en SurrealDB

Una reunión "Alice y Bob discuten el proyecto Mileto en una llamada el 2024-12-20":

```surql
CREATE meeting:m1 SET
  topic = 'Sprint planning Q1',
  date = d'2024-12-20T10:00:00Z',
  duration_min = 60;

RELATE person:alice -> hosted -> meeting:m1;
RELATE person:bob   -> attended -> meeting:m1;
RELATE meeting:m1   -> about     -> project:mileto;
```

La hyperedge original era 4-aria: `(host=alice, attendee=bob, topic=mileto, time=2024-12-20)`. La reificación la descompone en un nodo `meeting:m1` con tres edges binarios tipados (`hosted`, `attended`, `about`).

### Ventajas

- **Funciona con todo**: cualquier graph DB lo soporta nativamente
- **Composable**: la hyperedge ahora es un objeto de primera clase con su propia identidad, atributos, relaciones con otras hyperedges (`meeting:m1 -> follows -> meeting:m0`)
- **Queryable**: los queries pairwise siguen funcionando
- **Indexable**: índices estándar sobre el nodo reificado
- **Evolutivo**: añadir un participante o un rol nuevo es añadir una edge, no migrar schema

### Coste

- **Más nodos**: explota el conteo total de entidades; el modelo de costes hay que ajustarlo
- **Pérdida de aridad como invariante**: nada en el schema garantiza que `meeting:m1` tendrá exactamente un `hosted`. Hay que enforce-arlo en lógica (o en SurrealDB schema con tablas `RELATE` schemafull + `ASSERT`).
- **Identidad de la hyperedge**: ahora la hyperedge tiene una ID propia. Bien si quieres referenciarla. Mal si te obliga a pensarla como "cosa" cuando conceptualmente era pura relación.

Para Huygens, este patrón es exactamente el que vamos a usar para episodios cognitivos n-arios (ver [hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md)). SurrealDB no es un hypergraph engine nativo, pero la biyección hipergrafo↔bipartito hace que el modelo subyacente sea fielmente representable.

## Conexión con teoría de categorías

Para un lector que viene de Milewski y Coecke, hay una traducción natural que conviene tener en cabeza.

### Multicategorías

Una **multicategoría** generaliza una categoría permitiendo morfismos con múltiples inputs y un solo output:

```
f : A₁, A₂, ..., Aₙ → B
```

donde `A₁, ..., Aₙ` es una lista (o multiconjunto) de objetos. La composición se define para sustituir un morfismo `g : C₁, ..., Cₘ → Aᵢ` en el `i`-ésimo input de `f`, produciendo:

```
f ∘ᵢ g : A₁, ..., Aᵢ₋₁, C₁, ..., Cₘ, Aᵢ₊₁, ..., Aₙ → B
```

Una hyperedge dirigida con tail `{v₁, ..., vₙ}` y head `{w}` es exactamente un morfismo n-ario en una multicategoría sobre `V`. La hyperedge "lleva" la información de los `vᵢ` al `w`.

### Operads

Un **operad** es una multicategoría con un solo objeto: los morfismos son operaciones puras `n → 1`. Vienen de topología algebraica (Boardman–Vogt, May) y son la abstracción correcta para "operaciones que combinan `n` cosas en `1`": árboles sintácticos, parsers, expresiones aritméticas.

Cuando un operad permite múltiples outputs, se llama **PROP** (PROduct and Permutation category) o, más general, una **dioperad** o una **wheeled prop**. Estas estructuras describen, entre otras cosas, el álgebra de tensor networks (ver [tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md)).

### Profunctores y matrices

Un **profunctor** `P : 𝒞 ↛ 𝒟` es un functor `𝒞ᵒᵖ × 𝒟 → Set`. Generaliza la noción de relación entre categorías. Para categorías discretas, un profunctor es una matriz indexada por `Obj(𝒞) × Obj(𝒟)` con valores en `Set`. Para enriquecimientos sobre `[0,∞]` (categorías de Lawvere) son matrices de distancias.

Un hipergrafo bipartito es un profunctor sobre conjuntos. Esta perspectiva no es solo cosmética: te da composición de hipergrafos vía composición de profunctores (coends), y abre la puerta a hipergrafos enriquecidos (donde "ser hyperedge" no es booleano sino un peso o una estructura).

### Bibliografía categórica

- **Tom Leinster — _Higher Operads, Higher Categories_** (Cambridge, 2004). Texto canónico. Capítulo 2 sobre multicategorías es la introducción más clara.
- **Bob Coecke y Aleks Kissinger — _Picturing Quantum Processes_** (Cambridge, 2017). String diagrams como cálculo gráfico para monoidal categories — el lenguaje natural de las multicategorías simétricas y los tensor networks.
- **Emily Riehl — _Category Theory in Context_** (Dover, 2016). Para profunctores y coends en versión moderna y accesible.

## Campos donde se usan hipergrafos hoy

| Campo | Aplicación | Herramientas |
|---|---|---|
| **TDA (Topological Data Analysis)** | Persistent homology sobre simplicial complexes derivados de point clouds | [Gudhi](https://gudhi.inria.fr/), [Ripser](https://github.com/Ripser/ripser), [Giotto-TDA](https://giotto-ai.github.io/) |
| **Hypergraph Neural Networks** | DL sobre hipergrafos para clasificación, link prediction | HGNN (Feng et al. 2019), HyperGCN (Yadati et al. 2019), [DGL-Hypergraph](https://docs.dgl.ai/) |
| **Knowledge graphs n-arios** | Wikidata con qualifiers, biomedical KGs (genes × drugs × diseases) | HypE (Fatemi et al. 2020), GETD, NeuralLP-N |
| **Química computacional** | Reacciones químicas, espacios de reacción | RDKit, ASKCOS, GraphRXN |
| **Biología de sistemas** | Vías metabólicas, regulatory networks | Cytoscape Hypergraph, KEGG |
| **Redes sociales higher-order** | Grupos, eventos, conversaciones | XGI library, [HypergraphX](https://github.com/HGX-Team/hypergraphx) |
| **Epidemiología** | Super-spreader events, contagio en grupos | EoN, Iacopini et al. _Nature Comm._ 2019 |
| **Lingüística computacional** | Frames semánticos (FrameNet, PropBank), AMR (Abstract Meaning Representation) | PENMAN, AMR-eager |
| **Verificación formal** | Dependencias en proofs, type checking dependiente | Lean, Coq (hyperedges en typing contexts) |
| **Optimización combinatoria** | Set cover, scheduling con recursos, SAT-solving | (subyacente, no superficie) |

La conclusión: el campo está activo y maduro en investigación, pero fragmentado y sin un sistema de propósito general que sirva todos los casos. Cada vertical tiene su stack.

## Implicación para Huygens

SurrealDB es un graph engine binario tipado. No nos da hyperedges nativos. Eso no es un problema porque:

1. **La biyección hipergrafo↔bipartito** es matemáticamente exacta. Reificar no es pérdida estructural.
2. **El catálogo de relaciones binarias tipadas** que vamos a definir (ver [../03-data-model/relations-and-edges.md](../03-data-model/relations-and-edges.md)) ya incluye edges como `mentions`, `references`, `derived_from`, `assigned_to` — la materia prima de cualquier reificación.
3. **El concepto de "episodio cognitivo"** — una `Note` con `type=episode` que coactiva múltiples Pillars + Projects + Persons + Reports + eventos temporales — es **exactamente** una hyperedge reificada. La nota es el nodo central; las aristas tipadas a cada participante son la reificación canónica.
4. **Cuando el grafo crezca**, técnicas de TDA aplicables al bipartito subyacente nos darán insight estructural sobre patrones globales (homological scaffolds, cliques, cavities). Esto es trabajo de v3+ pero el modelo lo permite.

Lo que **no** vamos a tener es un planner que entienda hyperedges como first-class para optimizar queries. Si en algún momento eso fuera bottleneck (no lo será en años), habría que evaluar engines especializados. Hoy, no.

## Para profundizar

### Libros canónicos

- **Claude Berge — _Hypergraphs: Combinatorics of Finite Sets_**, North-Holland (1989). El texto fundacional. Combinatorialmente denso pero claro; el capítulo 1 da la motivación, los capítulos 2–6 desarrollan la teoría clásica.
- **Vladimir Voloshin — _Introduction to Graph and Hypergraph Theory_**, Nova Science (2009). Más pedagógico que Berge; bueno como primera lectura.
- **Alain Bretto — _Hypergraph Theory: An Introduction_**, Springer (2013). Tratamiento moderno con énfasis en aplicaciones.

### Papers fundacionales modernos

- **Battiston, Cencetti, Iacopini, Latora, Lucas, Patania, Young, Petri — "Networks beyond pairwise interactions: Structure and dynamics"**, _Physics Reports_ 874 (2020): 1–92. [arXiv:2006.01764](https://arxiv.org/abs/2006.01764). LA referencia moderna. Imprescindible.
- **Benson, Gleich, Leskovec — "Higher-order organization of complex networks"**, _Science_ 353 (2016): 163–166. Motifs higher-order como unidades estructurales.
- **Iacopini, Petri, Barrat, Latora — "Simplicial models of social contagion"**, _Nature Communications_ 10 (2019): 2485. Dinámica higher-order en contagio social.

### TDA

- **Gunnar Carlsson — "Topology and Data"**, _Bulletin of the AMS_ 46 (2009): 255–308. El paper que pone TDA en el mapa.
- **Robert Ghrist — _Elementary Applied Topology_** (2014, libro abierto en su web). Texto pedagógico de referencia.
- **Herbert Edelsbrunner, John Harer — _Computational Topology: An Introduction_**, AMS (2010). Definitivo para persistent homology computacional.

### Hypergraph learning

- "A Survey on Hypergraph Representation Learning" — Antelmi et al., _ACM Computing Surveys_ (2023). [arXiv:2203.01158](https://arxiv.org/abs/2203.01158).
- "Hypergraph Neural Networks" — Feng, You, Zhang, Ji, Gao, _AAAI 2019_. El paper original de HGNN.
- "HyperGCN" — Yadati et al., _NeurIPS 2019_. Aproximación spectral.

### Tutoriales y código

- **"Hypergraphs Made Easy"** — Iacopini, Lucas, Centellegher et al., notebook tutorial en arXiv. Buena introducción aplicada.
- **XGI library** (Python): [https://github.com/xgi-org/xgi](https://github.com/xgi-org/xgi). Library moderna para análisis de hipergrafos.
- **HypergraphX**: [https://github.com/HGX-Team/hypergraphx](https://github.com/HGX-Team/hypergraphx). Alternativa con buena documentación.

### Conexión con categorías

- **Tom Leinster — _Higher Operads, Higher Categories_**, Cambridge (2004). Disponible libre en arXiv del autor.
- **John Baez, Mike Stay — "Physics, Topology, Logic and Computation: A Rosetta Stone"** (2009). Para la conexión entre tensores, lógica, computación y topología.
- **Brendan Fong, David Spivak — _An Invitation to Applied Category Theory_**, Cambridge (2019). Capítulo 2 sobre orden y resource theories tiene material de hipergrafos como profunctores.

### Repositorios de datasets

- **HyperNetX** dataset collection (LANL)
- **SNAP — Stanford Network Analysis Project**: tiene varios datasets higher-order.
- **DBLP** y **arXiv collaboration networks**: estándares para co-autoría.

### Referencias cruzadas en esta documentación

- [./hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md) — Aplicación a neurociencia y cognición humana.
- [./tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md) — Hipergrafos como tensores, conexión con CQM y ZX-calculus.
- [./quantum-and-hypergraphs.md](./quantum-and-hypergraphs.md) — Estructuras higher-order en mecánica cuántica.
- [./declarative-db-as-ontology.md](./declarative-db-as-ontology.md) — Por qué un schema relacional ya es un compromiso ontológico.
- [./illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md) — Tipos y enforcement de estructura.
- [./living-topology.md](./living-topology.md) — Topología como objeto vivo, no estructura estática.
- [./epistemological-pattern.md](./epistemological-pattern.md) — Patrón epistemológico general.
- [../03-data-model/topology-as-primary.md](../03-data-model/topology-as-primary.md) — Topología como primaria sobre nodos.
- [../03-data-model/relations-and-edges.md](../03-data-model/relations-and-edges.md) — Catálogo de relaciones en Huygens.
