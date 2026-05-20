# La BBDD declarativa como ontología formal del dominio

> "La BBDD declarativa tiene tantísima carga semántica que si la construyes bien la información fluye y se consolida por sí sola en ella, es hiperdefinido por su propia topología, es parte de la información semántica."
>
> "Cada constraint que puedas empujar al substrato libera presupuesto cognitivo arriba, en el agente."

## Tesis

Un schema declarativo bien diseñado no es **estructura de datos**: es una **ontología formal del dominio**. Los datos que pasan a través de él no se almacenan en sentido pasivo; se interpretan contra una teoría implícita del mundo, y solo aquellos que satisfacen esa teoría existen.

Esta afirmación parece grandilocuente; no lo es. Es literal. Cuando escribes:

```surql
DEFINE TABLE note SCHEMAFULL;
DEFINE FIELD state ON note TYPE string
  ASSERT $value INSIDE ['INBOX','CLARIFIED','ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED'];
DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
```

estás afirmando un conjunto de **proposiciones constitutivas** sobre el dominio: "las notas son una categoría ontológica", "el estado de una nota pertenece a un universo cerrado de siete valores", "la relación de bloqueo solo puede darse entre notas". Esto no es metáfora ergonómica de programación. Es ontología en el sentido técnico del término — la disciplina que se ocupa de qué cosas existen y cómo se relacionan.

Este documento articula tres ideas anidadas:

1. Schema declarativo = ontología formal (ergonómicamente accesible).
2. La topología es parte de la información semántica del sistema.
3. La división simbiótica entre BBDD declarativa y agente LLM es óptima cuando se entiende como un gradiente de "dónde vive cada constraint".

Cierra con conexiones filosóficas e implicaciones para el diseño concreto de Huygens.

---

## 1. Schema como ontología formal

### 1.1. Qué significa "ontología" en ingeniería del conocimiento

En la tradición de la inteligencia artificial simbólica, una **ontología** es una "especificación formal y explícita de una conceptualización compartida" (Gruber, 1993). Desglosando esa definición:

- **Conceptualización**: una visión abstracta del mundo que se quiere modelar — qué entidades existen, qué propiedades tienen, qué relaciones admiten.
- **Compartida**: aceptada por una comunidad (humanos, agentes, sistemas).
- **Explícita**: enunciada — no implícita en el código que la consume.
- **Formal**: expresable en una sintaxis procesable por máquinas.

Una ontología responde a preguntas como: ¿qué clases de entidades hay? ¿qué propiedades son intrínsecas y cuáles relacionales? ¿qué constraints rigen las relaciones? ¿qué inferencias se siguen de afirmar X?

Aristóteles, en las _Categorías_, hizo exactamente esto para el lenguaje natural: identificó diez predicados fundamentales (substancia, cantidad, cualidad, relación, lugar, tiempo, posición, posesión, acción, pasión) que sostenían que cualquier afirmación sobre el mundo se reducía a alguna combinación de ellos. Es la primera ontología formal de Occidente. El paralelismo no es retórico: cuando declaras `DEFINE TABLE note SCHEMAFULL`, estás cometiéndote con que **note** es una categoría ontológica de tu universo — algo que admite predicación independiente.

### 1.2. La web semántica como intento explícito (y su fracaso parcial)

La web semántica (Berners-Lee et al., 2001) propuso aplicar este aparato a escala internet. Los componentes:

- **RDF (Resource Description Framework)**: representación universal en tripletas `(sujeto, predicado, objeto)`. Todo se reduce a edges etiquetados.
- **RDFS y OWL (Web Ontology Language)**: vocabularios para definir ontologías. OWL hereda de la **Description Logic**, un fragmento decidible de la lógica de primer orden.
- **SPARQL**: lenguaje de consulta sobre RDF.

La intuición era correcta: si tuviéramos ontologías formales legibles por máquinas, la web sería navegable semánticamente, los agentes podrían razonar sobre datos heterogéneos, los datos serían interoperables. La encarnación falló — al menos como sueño totalizador.

¿Por qué? Razones técnicas y sociales entremezcladas:

- **Sintaxis bizantina**: RDF/XML, Turtle, JSON-LD, N-Triples — múltiples serializaciones, ninguna ergonómica.
- **Queries impracticables**: SPARQL es expresivo pero verboso y costoso de optimizar.
- **Overhead ontológico**: definir ontologías OWL es trabajo de especialista. La industria nunca lo internalizó.
- **Reasoners costosos**: OWL DL es decidible pero NP-hard en el peor caso; reasoning sobre KGs grandes es lento.
- **Falta de tooling**: en comparación con SQL o REST, el ecosistema RDF nunca alcanzó masa crítica.

La lección histórica no es "la idea era mala". La lección es "la idea era correcta, la encarnación no". Los schemas declarativos modernos — SurrealDB con `SCHEMAFULL`, PostgreSQL con `CHECK constraints` y tipos enumerados, Idris con dependent types, TypeScript estricto con discriminated unions — realizan parcial pero ergonómicamente lo que OWL quiso hacer totalmente y dolorosamente.

Y, no por casualidad, el renacer ontológico llega ahora por la puerta de atrás: los **knowledge graphs** que alimentan a los LLMs (GraphRAG, Wikidata, ontologías médicas, etc.) son ontologías ligeras, pragmáticas, y funcionan.

### 1.3. SurrealQL como lenguaje ontológico

Mirando un fragmento real de schema de Huygens:

```surql
DEFINE TABLE note SCHEMAFULL;
DEFINE FIELD title ON note TYPE string;
DEFINE FIELD content ON note TYPE string;
DEFINE FIELD pillars ON note TYPE array<string>
  ASSERT $value ALLINSIDE ['PATHOS_SOMA','ETHOS','TELOS','SOPHIA'];
DEFINE FIELD state ON note TYPE string
  ASSERT $value INSIDE ['INBOX','CLARIFIED','ACTIVE','WAITING','SOMEDAY','DONE','ARCHIVED'];
DEFINE FIELD type ON note TYPE option<record<note_type>>;
DEFINE FIELD priority ON note TYPE option<int>
  ASSERT $value IS NONE OR ($value >= 1 AND $value <= 5);

DEFINE TABLE blocked_by TYPE RELATION FROM note TO note SCHEMAFULL;
DEFINE FIELD reason ON blocked_by TYPE option<string>;
```

Cada línea aquí es una **proposición ontológica**. Léelas en lenguaje natural:

- "Existe una categoría llamada _note_."
- "Toda nota tiene un título que es una cadena."
- "Toda nota se asocia a un subconjunto de cuatro pilares conocidos."
- "Toda nota está en exactamente uno de siete estados."
- "Una nota puede o no tener un tipo, y si lo tiene, es un registro de la tabla note_type."
- "Una nota puede o no tener prioridad, y si la tiene, es un entero entre 1 y 5."
- "Existe una relación _blocked_by_ que solo puede darse entre notas."

Esto es un mapa ontológico del dominio cognitivo de Rubén. No describe cómo se almacenan los datos — describe **qué cosas existen** en el universo de Huygens y cómo pueden relacionarse. Cualquier dato que viole estas proposiciones no se almacena; el motor lo rechaza. La BBDD se convierte en un guardián epistemológico.

---

## 2. Topología como información semántica

Hay una intuición que conviene articular: **la estructura del grafo es información, no solo contenedor de información**.

### 2.1. El usuario no elige cómo modelar; descubre cómo es el dominio

Cuando Rubén decide que "una nota puede bloquear a otra nota pero no a una persona", no está tomando una decisión estética de modelado. Está afirmando algo sobre **cómo es el mundo que está representando**. Los bloqueos, en el dominio GTD ampliado, son relaciones causales entre tareas o proyectos — entre _notas_, no entre personas. Modelarlo de otra forma sería un error ontológico, no un error de diseño.

Esta distinción importa. En ingeniería de software clásica, "modelado" se trata como una actividad creativa con cierta arbitrariedad. En diseño ontológico, **hay decisiones correctas e incorrectas**, juzgadas contra la realidad del dominio. Un schema mal diseñado no es feo; es **falso**.

### 2.2. La topología como predicado

Cada edge type en un grafo es un predicado relacional. `blocked_by(n1, n2)` es una proposición que afirma una relación específica entre dos entidades. El conjunto de edge types que admite tu schema es el **vocabulario relacional** de tu ontología — el conjunto de cosas que puedes _decir_ sobre el mundo.

Si tu vocabulario solo admite `related_to`, tu mundo es plano: todo se relaciona genéricamente con todo. Si tu vocabulario distingue `blocked_by`, `supports`, `refutes`, `motivates`, `contradicts`, tu mundo es rico: puedes hacer afirmaciones precisas sobre las relaciones causales, dialécticas, motivacionales entre tus entidades.

El usuario lo expresó con precisión:

> "Cuanto más tipados, más interpretable es la red. Una red de `related_to`s es un mar plano. Una red con `BLOCKED_BY`, `SUPPORTS`, `REFUTES`, `INSTANCE_OF` se acerca a un mapa cognitivo navegable."

Esto es ontología pura: el grado de expresividad de tu vocabulario relacional determina la riqueza de las inferencias que puedes hacer.

### 2.3. La topología es ya información

Considera: si te dijera "Huygens tiene 1000 nodos y 5000 edges, ¿qué información tienes?", la respuesta sería "ninguna". Pero si te dijera "Huygens tiene 1000 nodos tipo _note_, 200 nodos tipo _note_type_, y los edges son `of_type` (1000), `blocked_by` (300), `supports` (1500)", ya sabes algo significativo sobre la estructura del conocimiento que contiene. La topología tipada es, ella misma, información de alto nivel sobre la naturaleza del sistema.

Esto se relaciona con un concepto profundo de la teoría de la información estructural: el **shape** del grafo es portador de información independiente del contenido nodal. En Huygens, la forma del grafo es una descripción comprimida de la estructura cognitiva de Rubén.

Para profundizar este punto, ver `../03-data-model/topology-as-primary.md` y `../03-data-model/relations-and-edges.md`.

---

## 3. División simbiótica: BBDD y agente

### 3.1. Asimetría de fortalezas

Hay una asimetría fundamental entre lo que un schema declarativo hace bien y lo que un LLM hace bien:

| Componente | Bueno en | Malo en |
|---|---|---|
| BBDD declarativa | Consistency, validation, tipos, constraints, queries deterministas, transacciones | Juicio semántico, ambigüedad, narrativa, generalización |
| LLM agente | Juicio semántico, narrativa, decisiones ambiguas, generalización, abstracción | Consistency, no-alucinación, memoria de hechos exactos, deterministic queries |

La BBDD es buena exactamente en aquello en lo que la LLM es mala, y viceversa. Esta no es coincidencia: son **modelos computacionales con sesgos opuestos**. Una BBDD declarativa es un sistema simbólico-deductivo; una LLM es un sistema estadístico-asociativo. Juntos forman un sistema híbrido que cubre ambos modos de razonamiento.

### 3.2. El gradiente: dónde vive cada constraint

Para cada invariante que tu dominio requiere, hay un gradiente de lugares donde puede vivir, con costes muy distintos:

| Vive en | Coste cognitivo del agente | Fiabilidad |
|---|---|---|
| Schema (BBDD enforces) | **Cero**. Invariante automática, garantizada. | Total. |
| Tool TS con Zod (capa app) | Bajo. Validas y recuperas errores, pero el agente puede pedir cosas inválidas. | Alta, dentro del path validado. |
| Solo en el prompt | Alto. Recordarlo en cada turno + posibilidad de alucinación. | Baja-media. La LLM olvida o ignora. |
| Ningún lado | Catastrófico. Datos inconsistentes en silencio. | Cero. |

Mover constraints hacia abajo (hacia el schema) **libera presupuesto cognitivo del agente**. Cada regla que la BBDD enforza es una regla que el agente no tiene que recordar, no tiene que articular en su prompt, no puede alucinar.

Esto es lo que el usuario quería expresar con: _"Cada constraint que puedas empujar al substrato libera presupuesto cognitivo arriba, en el agente."_ Es una afirmación operativa con consecuencias medibles:

- **Prompts más cortos** → más rápido, más barato, menos contexto desperdiciado.
- **Menos alucinaciones** → no puede inventar un pillar que no existe.
- **Mejor reasoning** → el agente razona sobre el qué y el por qué, no sobre el cómo de la validación.
- **Recuperación trivial de errores** → fallo de schema es un error estructurado, no una salida malformada.

### 3.3. El "presupuesto cognitivo" como recurso

Hay una metáfora útil: el agente tiene un **presupuesto cognitivo** finito por turno — context window, tokens de razonamiento, atención de la red. Cada token gastado en "asegúrate de que el estado es uno de INBOX, CLARIFIED, ..." es un token que no se gasta en juicio semántico. Hay un trade-off explícito.

El diseño óptimo del sistema es aquel que minimiza la carga del agente moviendo todo lo deterministicamente expresable al substrato. No por ahorro económico (que también), sino por **especialización**: que el agente se ocupe solo de aquello en lo que es insustituible — el juicio.

---

## 4. Conexiones filosóficas

### 4.1. Aristóteles y la metafísica de las categorías

Las _Categorías_ de Aristóteles no son un texto histórico curioso; son el ancestro directo de todo el aparato ontológico moderno. Aristóteles distinguió:

- **Substancia primera**: entidades individuales (este caballo, esta persona).
- **Substancia segunda**: especies y géneros (caballo, animal).
- **Predicados accidentales**: cantidad, cualidad, relación, lugar, tiempo, etc.

Tu schema replica esta distinción:

- `note_type` (tabla) ≈ substancia segunda (las especies que existen).
- Una `note:abc123` con `type: note_type:project` ≈ substancia primera con su especie.
- Fields como `priority`, `state` ≈ predicados accidentales.
- Edges como `blocked_by` ≈ predicados relacionales (categoría de _relación_ en Aristóteles).

Cuando declaras `DEFINE TABLE note SCHEMAFULL`, comprometiéndote con la existencia de _note_ como categoría, estás haciendo metafísica aristotélica con SQL.

### 4.2. Wittgenstein y los límites del mundo

En el _Tractatus_, Wittgenstein escribe (5.6): _"Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt"_ — "los límites de mi lenguaje significan los límites de mi mundo". Aplicado a schemas: los límites del schema son los límites del mundo representable.

Si tu schema no admite `BLOCKED_BY`, entonces en el mundo de tu BBDD no existen los bloqueos. Si no admite la propiedad `priority`, no existen las prioridades. El schema no describe pasivamente un mundo preexistente — **constituye** el mundo que tu sistema puede habitar.

Esta consecuencia es seria. Significa que decisiones de modelado son **decisiones epistemológicas**. Cambiar un schema es cambiar la ontología del mundo de la BBDD. Esta idea se desarrolla con más extensión en `./living-topology.md` y conecta con el constructivismo epistemológico.

### 4.3. Curry-Howard y el schema como prueba

La correspondencia de Curry-Howard, que se desarrolla en detalle en `./illegal-states-and-curry-howard.md`, ofrece una lectura formal de esta idea. Tipos son proposiciones; programas son pruebas. Un schema declarativo es un conjunto de proposiciones sobre el dominio; los datos válidos son **pruebas constructivas** de esas proposiciones. Insertar una nota con `state: 'ACTIVE'` y `pillars: ['SOPHIA']` es construir una prueba de la proposición compuesta "_existe una nota con estado entre los siete válidos y un pilar entre los cuatro válidos_".

Un schema bien diseñado, leído así, es una **teoría matemática del dominio**. Los datos son su modelo en el sentido lógico (tipo `M ⊨ T`, "el modelo M satisface la teoría T").

---

## 5. Conexión con LLMs y el patrón GraphRAG

Hay un patrón emergente en 2024-2026 que da fuerza empírica a todo lo anterior. La combinación de LLMs con knowledge graphs estructurados (GraphRAG, structured RAG, hybrid retrieval) se ha convertido en uno de los approaches más sólidos para sistemas de IA que requieren consistency factual.

### 5.1. Por qué funciona la combinación

El insight es exactamente el que estamos articulando: la LLM es buena infiriendo y narrando, mala manteniendo consistency. Externalizar la estructura a una BBDD/KG y dejar que la LLM razone sobre ella es óptimo. La LLM **lee** el KG con queries deterministas, **razona** sobre lo recuperado, y **escribe** de vuelta proponiendo cambios — pero el KG mantiene la integridad.

Papers de referencia:

- **GraphRAG: A Knowledge Graph-Based Retrieval Augmented Generation** (Microsoft Research, 2024). Demuestra que indexar documentos en un knowledge graph antes de RAG mejora significativamente la calidad de respuestas en queries de "sense-making" (resumir, sintetizar, comparar).
- **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks** (Lewis et al., 2020). Paper fundacional de RAG.
- **Knowledge Graph Completion: A Survey** (Wang et al., 2023). Cómo los LLMs ayudan a completar KGs.

### 5.2. Huygens como instancia local del patrón

Huygens es exactamente este patrón aplicado a memoria personal. El schema declarativo es el knowledge graph; el MCP server expone tools para que el agente lo lea y escriba; el agente (Claude) hace el juicio semántico. La división de trabajo es limpia.

La consecuencia práctica para Huygens: **invertir en el schema es la decisión de mayor apalancamiento del proyecto**. Un schema bien diseñado significa agente más simple, queries más rápidas, narrativa más coherente, y errores estructurados en lugar de inconsistencias silenciosas.

---

## 6. Implicaciones concretas para Huygens

### 6.1. El schema no es configuración; es el modelo del mundo

Esto cambia cómo se piensa el documento `schema.surql`. No es un archivo de "setup de BBDD" entre otros archivos de infraestructura. Es **el documento más importante del proyecto** después del prompt del agente. Define qué es representable, qué se asume verdadero por construcción, qué inferencias son legítimas.

Versionar el schema cuidadosamente, justificar cada cambio, mantener un changelog ontológico — todo esto está justificado por el peso semántico del archivo.

### 6.2. La inversión de mayor apalancamiento es definir bien la topología inicial

El usuario habló de "topología inicial". Es la frase correcta. Definir bien la topología inicial significa:

- Identificar los nodos correctos (no añadir tablas que sean accidentes históricos).
- Identificar los edges correctos con la granularidad correcta (ni `related_to` único, ni un edge por cada matiz pensable).
- Tipar los constraints donde sean enforzables.
- Dejar abierto el espacio para evolución (ver `./living-topology.md`).

Cada hora invertida aquí ahorra órdenes de magnitud de horas en debugging, en prompts más complejos, en datos inconsistentes que limpiar.

### 6.3. La narrativa de informes hereda de la ontología

Una consecuencia menos obvia: si la ontología está bien diseñada, los informes narrativos que el agente genera son **automáticamente más coherentes**. Porque el agente no inventa los conceptos — los lee del schema. "Pilar Telos", "estado ACTIVE", "bloqueado por" no son frases ad-hoc; son lecturas literales de la ontología. Esto da consistencia inter-informe gratuita.

---

## 7. Para profundizar — Para el Rubén curioso del futuro

### Libros

- **_Category Theory for Programmers_** — Bartosz Milewski. Especialmente los capítulos sobre productos, sumas, functors. Es la base matemática del aparato ontológico moderno.
- **_Ontology Engineering with Ontology Design Patterns_** — Hitzler, Gangemi, Janowicz, Krisnadhi, Presutti (2016). Tratado de ingeniería ontológica práctica.
- **_Designing Data-Intensive Applications_** — Martin Kleppmann. Capítulo 2 sobre data models es esencial; capítulos sobre consistency models complementan la división con LLMs.
- **_Type-Driven Development with Idris_** — Edwin Brady (2017). Demuestra en código lo que aquí se argumenta filosóficamente.
- **_Aristotle's Categories_** — texto fundacional, traducciones de Cohen & Reeve (Hackett), Ackrill (Oxford). Es corto y denso; merece la pena leerlo entero.
- **_Wittgenstein's Tractatus Logico-Philosophicus_** — proposiciones 1-3 son las relevantes para esta discusión.

### Papers y artículos

- **"A Translation Approach to Portable Ontology Specifications"** — Thomas Gruber, 1993. Definición canónica de ontología en IA.
- **"The Semantic Web"** — Berners-Lee, Hendler, Lassila, _Scientific American_, 2001. Visión original.
- **"Lessons from the Semantic Web"** — varios artículos retrospectivos de los 2010s, incluyendo "What's Wrong with the Semantic Web?" de Hjelm.
- **"Make Illegal States Unrepresentable"** — Yaron Minsky, Jane Street Tech Blog. Aplicación práctica de type-driven design.
- **"GraphRAG: Unlocking LLM Discovery on Narrative Private Data"** — Edge et al., Microsoft Research, 2024.
- **"From Local to Global: A Graph RAG Approach to Query-Focused Summarization"** — Edge et al., 2024.
- **"Knowledge Graph Completion: A Survey"** — Wang et al., 2023.

### Lenguajes y sistemas para experimentar

- **Idris 2** — el lenguaje donde el aparato dependent types está más maduro y ergonómico.
- **Lean 4** — más orientado a matemáticas formales, pero con un sistema de tipos extraordinariamente rico.
- **F#** — discriminated unions, units of measure, type providers. Mucho más práctico para producción.
- **Protégé** — editor histórico de ontologías OWL. Vale la pena explorarlo para entender qué intentaba ser la web semántica.
- **Wikidata** — la ontología viva más grande del mundo, y un ejemplo de cómo ontologías ligeras escalan.

### Conexiones cruzadas en esta documentación

- `./illegal-states-and-curry-howard.md` — formalización matemática del schema como prueba.
- `./living-topology.md` — la ontología como artefacto evolutivo, no estático.
- `./hypergraphs-foundations.md` — extensión a relaciones n-arias.
- `./epistemological-pattern.md` — el patrón epistemológico subyacente a Huygens.
- `../03-data-model/topology-as-primary.md` — argumento operacional de por qué la topología es primaria.
- `../03-data-model/relations-and-edges.md` — el vocabulario relacional concreto de Huygens.
- `../03-data-model/self-critique.md` — críticas y limitaciones del enfoque.
- `../04-database/surrealdb-deep-dive.md` — implementación concreta en SurrealDB.
- `../04-database/surrealdb-innovations.md` — qué hace SurrealDB que es ontológicamente interesante.

---

## Cierre

La frase del usuario — _"la BBDD declarativa tiene tantísima carga semántica que si la construyes bien la información fluye y se consolida por sí sola en ella"_ — describe un fenómeno emergente real. Cuando la ontología está bien construida, los datos encuentran su sitio. Las relaciones se vuelven inevitables. Las inconsistencias se vuelven imposibles. El agente, liberado de la carga de mantener consistency, se especializa en lo que solo él puede hacer: juicio semántico, narrativa, generalización.

Esta es la promesa filosófica de Huygens. No es construir "una BBDD bonita"; es construir **una teoría formal del dominio cognitivo del usuario** y dejar que tanto el usuario como el agente operen contra esa teoría como si fuera el mundo. Porque, en cierto sentido literal, dentro del sistema, lo es.
