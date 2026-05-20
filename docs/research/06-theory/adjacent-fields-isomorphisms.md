# Campos adyacentes e isomorfismos con Huygens

> "Si miras estas áreas hay un hilo común: todas tratan estructuras donde lo local y lo global se relacionan no-trivialmente. Schema local genera comportamiento global. Edges locales generan topología global. Reglas locales generan dinámica global."

Este documento mapea 13 campos académicos/teóricos que tienen **isomorfismo genuino o conexión profunda** con lo que Huygens está intentando hacer. Es un mapa de territorio para el Rubén curioso del futuro: dónde mirar cuando quiera profundizar en un eje concreto, qué campo es la herencia natural de qué insight.

No están todos al mismo nivel. Los he agrupado por **fuerza de conexión** — desde isomorfismos casi-literales hasta resonancias filosóficas más sueltas. Lo importante: ninguno es decoración. Todos contienen herramientas matemáticas que podrías traer a Huygens cuando madure.

---

## A. Áreas con isomorfismo genuino (no metáfora)

### A1. Teoría de procesos estocásticos / Cadenas de Markov sobre grafos

**Conexión**:
Tu memoria evoluciona por **transiciones de estado** (`INBOX → CLARIFIED → ACTIVE → WAITING → ...`). Cada Note tiene una probabilidad — implícita pero real — de saltar a otro estado dado el estado actual. Eso es literalmente una **cadena de Markov sobre el espacio de estados de cada nota**.

Aplicado a grafos enteros (no solo a estados de un nodo aislado): **random walks on graphs**. Lovász los formaliza en el survey clásico. Camina aleatoriamente por edges, ponderando por algún peso, y descubres propiedades emergentes: centralidad, comunidades, importancia.

**Herramientas concretas que podrías traer**:
- **PageRank**: cada nota acumula "importancia" según cuántas notas centrales la apuntan
- **Diffusion maps**: distancias semánticas vía calor difundiéndose por el grafo
- **Hitting time / commute time**: cuántos pasos esperados de un nodo a otro
- **Stationary distribution**: si dejas el agente caminando aleatoriamente por tu KG, ¿en qué notas pasa más tiempo? Probablemente las "centrales en tu pensamiento actual"

**Aplicación para Huygens v3+**:
Una tool `mental_centrality(period)` que pondera transiciones recientes y devuelve las notas más conectadas activamente. No es solo "más editadas" — es más **transitadas** por flujos semánticos.

**Lectura clave**:
- Lovász, **"Random Walks on Graphs: A Survey"** — paper canónico
- Norris, _Markov Chains_ (libro estándar)
- Coifman & Lafon, **"Diffusion maps"** — Applied and Computational Harmonic Analysis 2006

**Cross-refs**: [living-topology.md](./living-topology.md), [tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md)

---

### A2. Cibernética de segundo orden (Heinz von Foerster, Ross Ashby)

**Conexión**:
Sistemas que observan sistemas que se observan. Tu agente es un **observador** del hipergrafo cognitivo de Rubén — y a su vez Rubén observa al agente observando. Hay un bucle recursivo de observación que la cibernética de segundo orden formalizó en los 70.

Heinz von Foerster (Biological Computer Lab, Illinois) lo articuló: "observing systems" en lugar de "observed systems". El observador no está fuera; participa en la dinámica del sistema observado.

**Ross Ashby** trabajó en variedades requeridas (_Law of Requisite Variety_): un controlador necesita al menos tanta variedad interna como el sistema que controla. Para Huygens: tu agente debe tener al menos tanta "variedad cognitiva" como tu mundo mental. Modelos pequeños fracasan no por inteligencia sino por **falta de variedad de respuesta**.

**Conexiones internas**:
Esto es la **raíz** de autopoiesis (Maturana, Varela) — ya cubierto en [living-topology.md](./living-topology.md) — y de la conexión Wolfram con observers en [wolfram-and-the-substrate-of-information.md](./wolfram-and-the-substrate-of-information.md).

**Aplicación para Huygens**:
- El diseño del agente es un acto cibernético: estás construyendo un controlador que observa-y-actúa sobre un sistema (tu memoria) del que tú también formas parte
- La triada `Rubén ↔ Agente ↔ Memoria` no son tres entidades independientes — son un sistema con loops
- Mantener variedad de respuesta = exponer suficientes tools, dar contexto rico, no limitar artificialmente al agente

**Lectura clave**:
- von Foerster, _Cybernetics of Cybernetics_ (1974)
- Ashby, _An Introduction to Cybernetics_ (1956, gratis online en archive.org)
- Glanville, _The Black Box_ (Vol 1-2) — sucesor intelectual de von Foerster

**Cross-refs**: [living-topology.md](./living-topology.md), [wolfram-and-the-substrate-of-information.md](./wolfram-and-the-substrate-of-information.md)

---

### A3. Information Theory (Shannon) aplicada a estructura semántica

**Conexión**:
**Shannon entropy** mide incertidumbre. **Mutual information** mide cuánto dos variables informan una de otra. Aplicado a tu KG: cada edge tiene un coste informacional (lo que comunica sobre el estado del sistema) y un valor (cuánto reduce incertidumbre sobre lo que está pasando en tu cabeza).

¿Qué edges son "informativos" (reducen entropía sobre tu estado mental) vs ruido? Eso es una **métrica de fitness para living-topology**: un edge que no reduce información sobre el sistema es candidato a podarse. Un edge que reduce mucho es estructuralmente importante.

**Conceptos clave que aplicarías**:
- **H(X)**: entropía de una variable (incertidumbre sobre su valor)
- **I(X; Y) = H(X) - H(X|Y)**: información mutua (cuánto saber Y reduce incertidumbre sobre X)
- **KL divergence**: distancia entre dos distribuciones
- **Cross-entropy**: cuánto cuesta codificar una distribución asumiendo otra

**Aplicación para Huygens v3**:
Un fitness para schema evolution: en cada propuesta de cambio de schema, mide `I(estado_mental_del_día; representación_en_huygens)`. Si añadir un edge type aumenta esa información mutua, es señal de que la nueva estructura captura algo real. Si no, es ruido.

Métricas concretas:
- **Edge importance**: `I(typeId; →edge→targetType)`
- **Pillar coherence**: `H(content_distribution | pillar)` — un pilar bien-definido tiene baja entropía condicional
- **State predictability**: dada la historia de transiciones, ¿qué transiciones son sorpresivas (alta self-information)?

**Lectura clave**:
- Cover & Thomas, _Elements of Information Theory_ (libro estándar)
- MacKay, _Information Theory, Inference, and Learning Algorithms_ (gratis online — recomendado para Rubén porque tiene ejemplos en Bayesian inference)
- Shannon, _A Mathematical Theory of Communication_ (1948) — el paper fundacional, sigue siendo legible

**Cross-refs**: [living-topology.md](./living-topology.md), [epistemological-pattern.md](./epistemological-pattern.md)

---

### A4. Algebraic Topology aplicada (más allá de TDA)

**Conexión**:
TDA (persistent homology) ya estaba en [hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md). Pero hay más: **sheaf theory sobre grafos**.

Un **sheaf** asigna datos locales (un valor, un conjunto, un espacio vectorial) a cada nodo y cada edge de manera que los datos sean **consistentes globalmente**. Si dos vecinos asignan valores incompatibles, hay un "fallo de coherencia" detectable. Es topología algebraica al servicio de modelado de información distribuida.

**Robert Ghrist** (UPenn) tiene trabajo aplicado a redes de sensores y robots distribuidos. Lo trasladas a "redes de notas semánticas" sin esfuerzo: cada nota carga información local (su pillars, type, content), y los sheaves miden cuándo esa información es **localmente consistente** y cuándo hay tensiones globales.

**Para Huygens, esto compra**:
- **Detección de inconsistencias semánticas**: dos notas relacionadas que afirman cosas incompatibles en su content
- **Propagación de updates**: cuando cambias el typeId de una nota, qué edges relacionados deberían reconsiderar
- **Coherencia narrativa**: un informe semanal es bueno si es un sheaf "global section" sobre las notas que cubre

**Lectura clave**:
- Ghrist, _Elementary Applied Topology_ (gratis online — entrada accesible)
- Bredon, _Sheaf Theory_ (referencia avanzada)
- Curry, _Sheaves, Cosheaves and Applications_ (PhD thesis Curry 2014 — el puente moderno entre sheaves y data)
- "Sheaves of Information" — Ghrist's lectures on YouTube

**Cross-refs**: [hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md), [tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md)

---

### A5. Categorical Databases (David Spivak)

**Conexión que Rubén apreciará especialmente**:
**David Spivak** (MIT) ha formalizado las BBDDs como **funtores entre categorías**. Un schema es una categoría. Las instancias son funtores a la categoría de conjuntos `Set`. Los queries son **transformaciones naturales** entre funtores.

Esto es literalmente la formalización de lo que SurrealDB hace intuitivamente: cuando declaras `DEFINE TABLE` y `DEFINE FIELD`, estás escribiendo objetos y morfismos en una categoría finita. Cuando insertas datos, estás dando un funtor a `Set`. Cuando haces JOINs y traversals, estás componiendo transformaciones naturales.

**Por qué esto es brutal**:
- Para alguien que lee a Milewski, **categorical databases** es donde la teoría de categorías deja de ser arte y se vuelve ingeniería
- Spivak prueba que **migraciones de schema** se modelan como funtores entre categorías → puedes razonar sobre migraciones de la misma manera que razonas sobre tipos
- "Data migration functors" — herramientas específicas para mover datos entre schemas preservando estructura

**Aplicación para Huygens v3 (living topology)**:
Si vas a evolucionar el schema, Spivak te da el marco formal. Una propuesta de schema change es un funtor `F: SchemaActual → SchemaPropuesto`. Si `F` es completo y fiel, la migración preserva información. Si no, hay loss; lo cuantifica formalmente.

**Lectura clave**:
- Spivak, _Category Theory for the Sciences_ (gratis online en arxiv y MIT Press — leíble para alguien con base FP)
- Spivak, "Functorial Data Migration" — paper de 2012
- Spivak, "Algebraic Databases" — paper de 2016 con Wisnesky et al.
- Catlab.jl — librería Julia que implementa estas ideas (escrita en parte por Spivak's students)

**Cross-refs**: [declarative-db-as-ontology.md](./declarative-db-as-ontology.md), [illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md), [living-topology.md](./living-topology.md)

---

## B. Áreas con conexión fuerte pero más indirecta

### B6. Active Inference / Free Energy Principle (Karl Friston)

**Conexión**:
Marco unificado en neurociencia computacional propuesto por Karl Friston (UCL): los cerebros minimizan **free energy** — una cota superior de la "sorpresa predictiva". La hipótesis es que TODO lo que hace el cerebro (percepción, acción, aprendizaje) es minimización de free energy bajo un modelo generativo del mundo.

Aplicado a Huygens:
- Tu agente al clarificar el inbox está literalmente minimizando free energy sobre tu modelo mental
- Está convirtiendo entradas no estructuradas (notas crudas) en estructura predictiva (notas clasificadas con tipo + state + pillars)
- Cada clarification es una update bayesiana del modelo

**Por qué esto importa**:
Es el framework más ambicioso de cog-sci de los últimos 15 años. Si Active Inference funciona como teoría unificada de la mente, los principios se trasladan a cómo diseñas agentes. El agente como "minimizador de free energy" sobre el modelo de Rubén es una formulación útil — guía decisiones sobre qué procesar primero (lo más sorpresivo), qué archivar (lo bien-modelado), qué propagar (cambios que reducen sorpresa global).

**Lecturas clave**:
- Friston, **"The free-energy principle: a unified brain theory?"** — Nature Reviews Neuroscience 2010 (canónico)
- Friston et al., "Active inference: a process theory" — Neural Computation 2017
- Hohwy, _The Predictive Mind_ — libro accesible
- Parr, Pezzulo, Friston, _Active Inference: The Free Energy Principle in Mind, Brain, and Behavior_ — libro reciente (2022), gratis en MIT Press

**Cross-refs**: [hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md), [epistemological-pattern.md](./epistemological-pattern.md)

---

### B7. Process Philosophy (Whitehead)

**Conexión**:
**Alfred North Whitehead** en _Process and Reality_ (1929) argumenta que la realidad fundamental no son objetos sino **eventos** (actual occasions). Cada evento "concrece" (concrescence) información de eventos previos. La sustancia es ilusoria; el proceso es real.

Esto es **eerily similar** a Wolfram (universo como evolución de hipergrafo) pero filosófico, no computacional. Y casa con tu modelo: una Note no es una cosa estática; es un **evento de captura/clarificación/transición** que toma información de eventos previos (otras notas, contexto, conversación con el agente) y concrece.

**Conceptos clave de Whitehead aplicables**:
- **Actual occasion**: la unidad básica de realidad. Un evento puntual. (≈ una Note creada o transicionada)
- **Concrescence**: el proceso por el cual un actual occasion absorbe información de su pasado para devenir
- **Prehension**: cómo un occasion "abraza" información de occasions previos
- **Nexus**: red de occasions relacionados (≈ subgrafo en tu KG)

**Por qué importa para Huygens**:
- El modelo de "una Note como evento, no como entidad" tiene implicaciones de diseño: timestamps son centrales, history matters, audit trails son ontológicos no añadidos
- La idea de **process > substance** es exactamente la filosofía del CHANGEFEED de SurrealDB

**Lecturas clave**:
- Whitehead, _Process and Reality_ (1929) — **brutalmente difícil**; no intentar primero
- Henning, _The Ethics of Creativity: Beauty, Morality, and Nature in a Processive Cosmos_ — introducción más accesible
- Mesle, _Process-Relational Philosophy: An Introduction to Alfred North Whitehead_ — versión muy accesible (recomendada como entrada)
- Cobb & Griffin, _Process Theology: An Introductory Exposition_ — si quieres explorar conexiones religiosas (puedes saltarlas)

**Cross-refs**: [wolfram-and-the-substrate-of-information.md](./wolfram-and-the-substrate-of-information.md), [epistemological-pattern.md](./epistemological-pattern.md)

---

### B8. Constructor Theory (David Deutsch, Chiara Marletto)

**Conexión**:
Reformula la física en términos de **qué transformaciones son posibles vs imposibles** en lugar de leyes dinámicas. Es el programa heterodoxo de David Deutsch (Oxford, fundador de QC) y Chiara Marletto.

Para Huygens: qué transformaciones del KG son **permitidas** (edges autorizados, transiciones de estado válidas) vs **imposibles** (constraints, schema enforcement) — es exactamente el lenguaje de Constructor Theory aplicado a un grafo cognitivo.

**Posibles vs Imposibles** como categorías ontológicas primarias:
- En física tradicional: "el sistema evoluciona según esta ecuación"
- En Constructor Theory: "esta transformación es posible bajo estas condiciones; aquella es imposible"
- Es un cambio de paradigma del "describe la dinámica" al "describe qué es transformable"

**Aplicación a Huygens**:
Cuando declaras un schema, NO estás describiendo qué pasa (eso lo hace el código aplicación). Estás declarando **qué transformaciones son ontológicamente posibles** en tu mundo cognitivo. Una `RELATE note -> blocked_by -> note` es posible; una `RELATE note -> blocked_by -> pillar` es **imposible** (ontológicamente, no solo "no permitida").

**Lecturas clave**:
- Deutsch, "Constructor Theory" (2013) — paper inicial en _Synthese_
- Marletto, _The Science of Can and Can't_ (2021) — libro divulgativo
- Deutsch, _The Beginning of Infinity_ (2011) — contexto filosófico amplio (no técnico)

**Cross-refs**: [declarative-db-as-ontology.md](./declarative-db-as-ontology.md), [illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md)

---

### B9. Symbolic Dynamics

**Conexión**:
Subcampo de teoría de sistemas dinámicos: estudia trayectorias en espacios discretos como **secuencias simbólicas**. Si tu agente recorre el grafo siguiendo edges, esa traza es un sistema simbólico — una secuencia de símbolos del alfabeto de tipos de nodos y edges.

Tiene aparato matemático maduro:
- **Entropía topológica**: complejidad asintótica de un sistema simbólico
- **Complejidad de Kolmogorov de trayectorias**: cuán comprimibles son
- **Shifts of finite type**: sistemas donde las transiciones permitidas se definen localmente

**Para Huygens**:
- Una conversación entre Rubén y el agente genera una traza simbólica (qué notas se tocan, en qué orden, con qué tipos de edges)
- Esa traza es analizable: tiene entropía, tiene patrones, tiene "vocabulario" característico
- Comparar trazas entre conversaciones revela patrones del propio modo de pensar de Rubén

**Aplicación v3+**: una tool `analyze_thinking_patterns(period)` que extrae regularidades de las trazas del agente — qué tipos de notas se relacionan secuencialmente, qué secuencias son sorpresivas vs típicas.

**Lecturas clave**:
- Lind & Marcus, _Symbolic Dynamics and Coding_ — libro estándar
- Adler, "The Concept of Sequence Entropy" — paper temprano
- Kurka, _Topological and Symbolic Dynamics_

**Cross-refs**: [hypergraphs-foundations.md](./hypergraphs-foundations.md), [wolfram-and-the-substrate-of-information.md](./wolfram-and-the-substrate-of-information.md) (los autómatas celulares son un caso de symbolic dynamics)

---

## C. Áreas con conexión sutil pero suculenta

### C10. Mereotopología

**Conexión**:
Subcampo de lógica/filosofía que estudia relaciones **parte-todo + conexión topológica simultáneamente**. La **Region Connection Calculus (RCC)** formaliza esto: ¿cuándo una región es "parte" de otra? ¿Cuándo está "conectada" pero no es "parte"? ¿Cuándo está "externamente conectada" (tocando pero sin solapar)?

Es relevante para `PART_OF` edges de manera no trivial: ¿una task es "parte" de un project del mismo modo que una región espacial es parte de otra? ¿O hay distintos tipos de "ser parte" que conviene distinguir?

**RCC distingue (entre otros)**:
- **DC** (disconnected)
- **EC** (externally connected — tocando)
- **PO** (partial overlap)
- **TPP** (tangential proper part — parte tocando frontera)
- **NTPP** (non-tangential proper part — parte interior)

**Aplicación para Huygens**:
- ¿Una Task que está "en pausa" es PART_OF su Project del mismo modo que una activa? RCC sugiere que no — la relación cambia (TPP vs NTPP por ejemplo)
- Un sistema mereotopológico explícito sobre tu KG permitiría queries más sutiles sobre estructura organizativa
- Probablemente overkill para v1 — interesante para experimentación tardía

**Lecturas clave**:
- Cohn & Renz, **"Qualitative Spatial Representation and Reasoning"** — handbook chapter en _Handbook of Knowledge Representation_ 2008
- Casati & Varzi, _Parts and Places: The Structures of Spatial Representation_ (libro)
- Smith, "Ontology and Information Systems" — para conexión con ontology engineering

**Cross-refs**: [hypergraphs-foundations.md](./hypergraphs-foundations.md), [relations-and-edges.md](../03-data-model/relations-and-edges.md)

---

### C11. Type Theory homotópica (HoTT) — Univalent Foundations

**Conexión**:
**Univalent Foundations** (Voevodsky, 2010s) extiende type theory hasta encontrarse con topología algebraica directamente: los tipos son **espacios topológicos**, la igualdad es un **camino entre puntos** en ese espacio, y dos cosas isomorfas son iguales (axioma de univalencia).

Para Huygens es overkill hoy, pero filosóficamente: tu schema declarativo + topología de edges autorizados literalmente vive en este marco. Los tipos de notas son espacios; las transformaciones (edges) son caminos; las "igualdades" entre instancias son homotopías.

**El núcleo radical**:
- En tipos tradicionales: `a = b` es una proposición (true/false)
- En HoTT: `a = b` es ella misma un tipo, cuyos habitantes son **pruebas** de la igualdad, y dos pruebas distintas pueden no ser iguales

Esto resuena con la idea de Process Philosophy (Whitehead): no hay identidad absoluta, hay caminos de identificación.

**Lecturas clave**:
- **HoTT Book** (gratis online: homotopytypetheory.org) — _Homotopy Type Theory: Univalent Foundations of Mathematics_
- Awodey, _Category Theory_ (libro previo recomendado)
- Voevodsky's lectures (YouTube) — el inventor era brillante y didáctico
- Univalent Foundations Program publications

**Cross-refs**: [illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md), [tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md)

---

### C12. Knowledge Compilation (AI clásica)

**Conexión**:
Subcampo de AI simbólica que estudia cómo convertir conocimiento declarativo (lógica proposicional, programas Prolog, BBDDs lógicas) en formas **computacionalmente eficientes** para razonamiento posterior:
- **OBDDs** (Ordered Binary Decision Diagrams)
- **d-DNNF** (deterministic Decomposable Negation Normal Form)
- **SDD** (Sentential Decision Diagrams)

El insight: una vez compilado, las queries que tardarían exponencial sobre la representación original pasan a polinomial sobre la compilada. Trade-off: compilation es cara, pero solo se hace una vez.

**Para Huygens, cuando madure**:
Si el KG llega a tener decenas de miles de notas con queries complejas (e.g., "todas las notas ACTIVE en pilar SOPHIA que NO están bloqueadas y fueron tocadas en la última semana"), compilar el subgrafo relevante a una representación eficiente permite que el agente haga inferencias rápidas.

Es lo que la AI clásica hizo bien antes de los LLMs. No se ha perdido — espera su renacimiento aplicado a knowledge graphs.

**Lecturas clave**:
- Darwiche & Marquis, **"A Knowledge Compilation Map"** — JAIR 2002 (paper de referencia)
- Darwiche, _Modeling and Reasoning with Bayesian Networks_ — libro
- Choi, Vergari, Van den Broeck, **"Probabilistic Circuits: A Unifying Framework"** — paper más reciente uniendo compilation con probabilidad

**Cross-refs**: [living-topology.md](./living-topology.md), [vector-search-strategy.md](../05-embeddings-vector/vector-search-strategy.md)

---

### C13. Quantum Cognition (no es lo mismo que Quantum Computing)

**Conexión**:
Aplicar **formalismos** de QM (superposición, interferencia, no-conmutación de operadores) a fenómenos cognitivos donde la probabilidad clásica falla. No es "el cerebro es cuántico" (que es controvertido y probablemente falso) — es "los formalismos QM modelan ciertos sesgos cognitivos mejor que la probabilidad clásica".

**Fenómenos donde quantum cognition tiene tracción**:
- **Conjunction fallacy** (Linda problem): "Linda es feminista" + "Linda es bancaria" → la gente cree que la conjunción es más probable que un término solo. Probabilidad clásica lo prohíbe; modelos cuánticos con interferencia lo explican.
- **Order effects** en encuestas: el orden de preguntas afecta respuestas. En probabilidad clásica `P(A∩B) = P(B∩A)`; en QM no.
- **Disjunction effect** en toma de decisiones bajo incertidumbre

**Para Huygens**:
Si vas a modelar **toma de decisiones humana** (qué nota leer primero, qué proyecto priorizar), los formalismos cuánticos pueden ser más predictivos que los bayesianos clásicos. Útil para el agente cuando intenta predecir tus preferencias o detectar inconsistencias en tu propio razonamiento.

Es especulativo, pero el campo está creciendo en cog-sci.

**Lecturas clave**:
- Busemeyer & Bruza, **_Quantum Models of Cognition and Decision_** (2012) — libro estándar
- Aerts, "Quantum Structure in Cognition" — papers iniciales
- Wang, Busemeyer, "A Quantum Question Order Model" — Topics in Cognitive Science 2013
- Pothos & Busemeyer review papers en _Trends in Cognitive Sciences_

**Cross-refs**: [hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md), [quantum-and-hypergraphs.md](./quantum-and-hypergraphs.md)

---

## El meta-patrón

Mirando estas 13 áreas, hay un hilo común conceptual:

**Todas tratan estructuras donde lo local y lo global se relacionan no-trivialmente.**

- **Schema local** genera **comportamiento global** (BBDDs declarativas, Spivak)
- **Edges locales** generan **topología global** (algebraic topology, sheaves)
- **Reglas locales** generan **dinámica global** (Wolfram, autómatas celulares, symbolic dynamics)
- **Información local** genera **patrones globales** (information theory, free energy)
- **Eventos locales** componen **procesos globales** (Whitehead, mereotopología)
- **Constraints locales** definen **espacios globales de posibilidad** (constructor theory, HoTT)

Tu pregunta de fondo — **"cómo emerge la estructura semántica desde reglas declarativas mínimas"** — es una pregunta que aparece **bajo distintos disfraces en física, matemáticas, ciencias cognitivas, lógica e informática teórica**.

Cada campo la responde con sus herramientas. Pero la pregunta es la misma. Y eso es lo que hace que valga la pena conectar campos: las **herramientas son trasladables** si reconoces el isomorfismo de fondo.

### La triple intersección que probablemente unifique todo

Si tuvieras que apostar a UN área de la matemática contemporánea que en 10-20 años unifique mucho de lo que hemos venido hablando, sería:

```
        Category Theory
              △
             ╱ ╲
            ╱   ╲
           ╱     ╲
          ╱       ╲
         ╱         ╲
        ╱           ╲
Algebraic ───── Information
Topology         Theory
```

**Por qué esta intersección**:

- **Category Theory ↔ Algebraic Topology**: ya bien establecido. Categorías de espacios, funtores entre topologías, sheaves como funtores. HoTT es la encarnación moderna.
- **Category Theory ↔ Information Theory**: campo emergente. _Categorical Probability_ (Fritz, Perrone), markov categories. Conecta probabilidad con composicionalidad.
- **Algebraic Topology ↔ Information Theory**: TDA + sheaf information + persistent entropy. Información topológica como cantidad medible.

En el centro: una teoría compositiva de la información estructurada. Es donde está la frontera contemporánea para problemas como el de Huygens. Si Wolfram tiene razón sobre que la información es lo fundamental, y Coecke tiene razón sobre que las categorías son el lenguaje natural, y la topología algebraica realmente captura "estructura distribuida", entonces el centro de gravedad intelectual de los próximos 20 años para problemas de memoria, cognición, agentes y conocimiento está en ese triángulo.

Huygens es un instrumento pequeño que opera en una esquina de ese territorio. Pero el territorio existe, y es el que aclara qué estás construyendo.

---

## Para profundizar — referencias consolidadas

| Área | Referencia esencial | Para entrar |
|---|---|---|
| Random walks / Markov | Lovász, "Random Walks on Graphs: A Survey" | MacKay, _Info Theory, Inference, and Learning_ |
| Cibernética 2º orden | von Foerster, _Cybernetics of Cybernetics_ | Ashby, _Introduction to Cybernetics_ (gratis) |
| Information theory | Cover & Thomas, _Elements of IT_ | MacKay (gratis online) |
| Algebraic topology aplicada | Ghrist, _Elementary Applied Topology_ (gratis) | Carlsson, "Topology and Data" |
| Categorical databases | Spivak, _Cat Theory for the Sciences_ (gratis) | Milewski videos previos |
| Active Inference | Friston, _The free-energy principle_ (paper) | Hohwy, _The Predictive Mind_ |
| Process philosophy | Whitehead, _Process and Reality_ | Mesle, _Process-Relational Philosophy_ |
| Constructor theory | Marletto, _The Science of Can and Can't_ | Deutsch's papers |
| Symbolic dynamics | Lind & Marcus, _Symbolic Dynamics and Coding_ | (campo bastante específico) |
| Mereotopology | Cohn & Renz handbook chapter | Casati & Varzi, _Parts and Places_ |
| HoTT | _HoTT Book_ (gratis online) | Awodey, _Category Theory_ |
| Knowledge compilation | Darwiche & Marquis, "A Knowledge Compilation Map" | Darwiche's lectures |
| Quantum cognition | Busemeyer & Bruza, _Quantum Models of Cognition_ | Pothos & Busemeyer reviews |

---

## Conexiones internas con el resto de Huygens docs

Cada uno de estos campos toca uno o varios documentos previos de teoría:

- **Markov/random walks** → [living-topology.md](./living-topology.md), [tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md)
- **Cibernética** → [living-topology.md](./living-topology.md), [wolfram-and-the-substrate-of-information.md](./wolfram-and-the-substrate-of-information.md)
- **Information theory** → [living-topology.md](./living-topology.md), [epistemological-pattern.md](./epistemological-pattern.md)
- **Algebraic topology** → [hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md), [tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md)
- **Categorical DBs** → [declarative-db-as-ontology.md](./declarative-db-as-ontology.md), [illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md)
- **Active Inference** → [hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md)
- **Process philosophy** → [wolfram-and-the-substrate-of-information.md](./wolfram-and-the-substrate-of-information.md)
- **Constructor theory** → [declarative-db-as-ontology.md](./declarative-db-as-ontology.md), [illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md)
- **Symbolic dynamics** → [hypergraphs-foundations.md](./hypergraphs-foundations.md), [wolfram-and-the-substrate-of-information.md](./wolfram-and-the-substrate-of-information.md)
- **Mereotopología** → [relations-and-edges.md](../03-data-model/relations-and-edges.md), [hypergraphs-foundations.md](./hypergraphs-foundations.md)
- **HoTT** → [illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md), [tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md)
- **Knowledge compilation** → [vector-search-strategy.md](../05-embeddings-vector/vector-search-strategy.md), [living-topology.md](./living-topology.md)
- **Quantum cognition** → [quantum-and-hypergraphs.md](./quantum-and-hypergraphs.md), [hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md)

Este documento NO es definitivo — es un mapa abierto. A medida que Huygens madure y aparezcan necesidades específicas, alguno de estos 13 campos será la herramienta correcta, y será momento de profundizar entonces.
