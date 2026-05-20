# Hipergrafos y cognición

> La hipótesis de que la cognición y el cerebro se organizan en orden superior — no en pares — y por qué eso importa tanto para neurociencia como para sistemas que pretenden modelar memoria humana.

## El insight que abre la puerta

Durante una conversación de diseño sobre Huygens, surgió una pregunta que merece un documento entero:

> "Las hiperaristas no son un campo de estudio? En el cerebro no se dan? No abrirían infinitas posibilidades?"

Las tres preguntas tienen la misma respuesta: **sí**.

Sí, los hipergrafos son un campo de estudio formal con más de cincuenta años de historia (ver [hypergraphs-foundations.md](./hypergraphs-foundations.md)). Sí, hay evidencia empírica creciente de que la organización funcional del cerebro vive en orden superior, no en pares. Y sí, las posibilidades abiertas son sustantivas: modelos de memoria, dinámica colectiva, análisis topológico de patrones mentales — todos requieren higher-order para no perder la fenomenología.

Este documento desarrolla la tesis. La estructura es: evidencia neurocientífica, los conceptos clásicos que ya apuntaban en esta dirección, la matemática que ha emergido para tratarlos formalmente, las implicaciones filosóficas, y por qué importa para un sistema como Huygens.

## Tesis central

> La organización funcional del cerebro y la estructura semántica del conocimiento humano son **intrínsecamente higher-order**. Los modelos pairwise (grafos binarios, redes neuronales con activaciones individuales, semánticas de pares sujeto-objeto) son aproximaciones útiles pero **estructuralmente incompletas**. Lo que sucede no se reduce a la suma de relaciones binarias entre dos cosas: hay patrones de coactivación, blends conceptuales y simplicial complexes funcionales que **son entidades de pleno derecho**, no agregaciones de pares.

La tesis tiene tres niveles:

1. **Anatómico/fisiológico**: las sinapsis individuales son uno-a-uno, pero la **función** computacional emerge de ensembles distribuidos cuya unidad operacional es un conjunto, no un par.
2. **Funcional/computacional**: técnicas como TDA aplicadas a fMRI revelan invariantes topológicos (cliques, cavities, persistent features) que solo existen al considerar interacciones de orden ≥ 3.
3. **Semántico/cognitivo**: el pensamiento humano opera por blends conceptuales, schemas, frames — todos estructuras n-arias que coordinan múltiples elementos simultáneamente.

## Evidencia neurocientífica

### El gap entre conectividad anatómica y conectividad funcional

Anatómicamente, una sinapsis individual es un objeto local: un axón terminal conecta con una dendrita, y la transmisión química o eléctrica es bilateral. Es tentador pensar que esto **implica** que el cerebro es un grafo binario gigante (~86 mil millones de neuronas, ~100 billones de sinapsis).

Pero la unidad **funcional** de procesamiento no es la neurona aislada ni la sinapsis. Es el **ensemble**: un grupo de neuronas que coactivan de forma coordinada para representar un concepto, una percepción, una acción. Esto se sabe desde Karl Lashley (1950s) y el concepto de **engrama** — la huella física de la memoria no está en una neurona individual, está distribuida en un patrón.

El concepto se moderniza en los 80–90s con el trabajo de **György Buzsáki** (NYU) sobre sincronización oscilatoria en hippocampus, **Eve Marder** sobre circuitos pequeños con dinámica colectiva, **Rafael Yuste** (Columbia) con su trabajo sobre **neuronal assemblies** observables vía calcium imaging. El _Atlas of the Human Brain_ (Mai et al.) ya no se entiende sin esta capa funcional sobre la anatómica.

**Key papers**:

- Yuste, R. (2015). "From the neuron doctrine to neural networks." _Nature Reviews Neuroscience_ 16, 487–497. Manifiesto contra el reduccionismo a la neurona aislada.
- Pastalkova et al. (2008). "Internally generated cell assembly sequences in the rat hippocampus." _Science_ 321, 1322–1327.
- Carrillo-Reid et al. (2019). "Controlling visually guided behavior by holographic recalling of cortical ensembles." _Cell_ 178, 447–457.

### Cell assemblies (Hebb, 1949)

**Donald Hebb** propone en _The Organization of Behavior_ (1949) que el sustrato de la memoria son **cell assemblies**: grupos de neuronas que se fortalecen mutuamente al coactivar repetidamente. Su célebre dictum — "neurons that fire together, wire together" — es la base de plasticidad sináptica hebbiana, hoy formalizada en LTP (Long-Term Potentiation) descubierta por Bliss y Lømo en 1973.

**El punto estructural**: un cell assembly **es** una hyperedge en el grafo neural funcional. No es la suma de las sinapsis binarias que lo conectan — es la unidad operacional que coactiva como bloque. La sinapsis binaria es la implementación, el assembly es la abstracción.

Esto no es una analogía libre. Buzsáki (_Rhythms of the Brain_, Oxford 2006) lo explicita: el cerebro se organiza por **co-activación coherente**, modulada por oscilaciones globales (theta, gamma) que sincronizan ensembles. El verbo "co-activar" implica conjunto, no par.

### Place cells, grid cells y la geometría del contexto

**John O'Keefe** descubre en 1971 las _place cells_ del hippocampus de rata: neuronas que disparan cuando el animal está en una localización espacial específica. **May-Britt y Edvard Moser** descubren en 2005 las _grid cells_ del entorhinal cortex, con campos receptivos hexagonales que tiling el espacio. Nobel de Medicina 2014 a los tres.

Lo crítico para nuestra tesis: **el contexto** que estas células codifican no es solo espacial. Es **espacio + tiempo + emoción + objetivo**. Múltiples place cells co-activan para representar un episodio concreto — "yo, aquí, ahora, queriendo X, sintiendo Y". Esto es:

- una hyperedge funcional sobre `{location_cell_a, time_cell_b, emotion_cortex_c, reward_cell_d, ...}`
- la base biológica de la **memoria episódica**: un evento específico ligando lugar, tiempo y contenido

El paper canónico moderno: **Buzsáki & Tingley (2018), "Space and time: the hippocampus as a sequence generator"**, _Trends in Cognitive Sciences_ 22(10): 853–869. Argumenta que el hippocampus no codifica espacio per se, sino **secuencias de coactivación** — exactamente lo que necesitamos para narrativa, recuerdo, planificación.

### Engramas y memoria episódica

Modern engram research (Tonegawa lab en MIT, Josselyn lab en Toronto) ha localizado **engramas específicos** vía optogenética: identificar las neuronas activas durante un aprendizaje, marcarlas con channelrhodopsin, reactivarlas a voluntad y observar recall del recuerdo asociado.

**Key paper**: Josselyn, Köhler & Frankland (2017). "Heroes of the engram." _Journal of Neuroscience_ 37(18): 4647–4657.

Lo que se ve: la memoria de un episodio reside en una **coalición de neuronas distribuidas** — cortex sensorial específico (qué viste/oíste), hippocampus (contexto espacio-temporal), amígdala (carga emocional), prefrontal (significado, plan). No es uno-a-uno. Es N-a-N coordinado. Hyperedge funcional.

La pregunta abierta — sobre la que hay debate vivo — es **cómo** se mantiene la coherencia de esta hyperedge sin que los nodos individuales sean "el" lugar del recuerdo. Hipótesis dominantes: sincronización oscilatoria, sharp-wave ripples del hippocampus, replay durante sueño REM/SWS. Todas implican **un patrón de coactivación**, no una sinapsis privilegiada.

## TDA aplicada al cerebro

La técnica matemática que permite **estudiar formalmente** la estructura higher-order de redes funcionales cerebrales es el **Topological Data Analysis** (TDA), especialmente **persistent homology**.

### Persistent homology, brevísimamente

Dado un conjunto de datos (point cloud, grafo, hipergrafo), construyes una **filtración**: una secuencia anidada de simplicial complexes parametrizada por un umbral `t`. Para cada `t` computas los grupos de homología — invariantes topológicos que cuentan **componentes conexas** (H₀), **bucles** (H₁), **huecos 2D** (H₂), etc.

A medida que `t` crece, features topológicas **nacen** y **mueren**. Persistent homology registra esos nacimientos-muertes en un **diagrama de persistencia** (o **barcode**). Features que persisten mucho son **estructurales**; las que aparecen y desaparecen rápido son ruido.

Aplicado a fMRI/EEG, esto revela algo no visible en análisis pairwise: **patrones de NO-conexión que tienen significado funcional**. Un hueco (H₁ persistente) en la red cerebral significa que un cierto patrón de conexión "rodea" un vacío estructural. Esto puede correlacionar con estados patológicos, fases del desarrollo, modulación atencional.

### Trabajo de Giovanni Petri y colaboradores

**Giovanni Petri** (Centre Physics of Complex Systems, Torino) es uno de los pioneros en aplicar TDA a datos neurocientíficos. Papers clave:

- **Petri, Expert, Turkheimer, Carhart-Harris, Nutt, Hellyer, Vaccarino (2014). "Homological scaffolds of brain functional networks."** _Journal of the Royal Society Interface_ 11(101): 20140873. Análisis de fMRI de cerebros bajo placebo y bajo psilocibina. Encuentran que la "estructura homológica" — los patrones de cliques y cavities — cambia drásticamente: bajo psilocibina, conexiones funcionales **inusuales** (entre regiones que normalmente no se hablan) aparecen y crean nuevos features topológicos. Es uno de los hallazgos más citados en el campo.

- **Petri, Scolamiero, Donato, Vaccarino (2013). "Topological strata of weighted complex networks."** _PLoS ONE_ 8(6): e66506. Marco metodológico para extraer estratos topológicos de redes pesadas.

### Trabajo de Danielle Bassett y la "network neuroscience"

**Danielle Bassett** (UPenn, ahora Santa Fe Institute) es probablemente la figura más visible de **network neuroscience**. Su trabajo combina graph theory, control theory y TDA aplicados a estructura y función cerebral.

Referencias clave:

- **Bassett & Sporns (2017). "Network neuroscience."** _Nature Neuroscience_ 20(3): 353–364. Review canónica del campo.
- **Sizemore, Giusti, Kahn, Vettel, Betzel, Bassett (2018). "Cliques and cavities in the human connectome."** _Journal of Computational Neuroscience_ 44: 115–145. Aplicación específica de TDA al conectoma humano. Hallazgo central: la red estructural cerebral tiene **cliques de orden alto** (subgrafos completamente conectados de tamaño ≥ 4) en patrones no triviales, y **cavities** (bucles homológicos) que estructuran el flujo de información.

**Ann Sizemore Blevins** (Penn → ahora industry) trabajó en el grupo de Bassett y ha publicado especificamente sobre TDA experimental aplicado.

### Battiston y dinámica higher-order

**Federico Battiston** (CEU Vienna) ha llevado el campo más allá del análisis estático a la **dinámica**: ¿cómo cambia el comportamiento colectivo cuando los modelos de interacción incluyen tripletes, cuádruples, n-tuplas en lugar de solo pares?

- **Battiston et al. (2020). "Networks beyond pairwise interactions: Structure and dynamics."** _Physics Reports_ 874: 1–92. La referencia moderna por excelencia. Cubre desde definiciones de hipergrafos hasta dinámica de sincronización, contagio, percolación, todo en orden superior.
- **Iacopini, Petri, Barrat, Latora (2019). "Simplicial models of social contagion."** _Nature Communications_ 10: 2485. Muestra que modelos pairwise de contagio (SIR clásico) **fallan** al predecir umbrales de adopción cuando la influencia es genuinamente grupal. Con simplicial dynamics, los umbrales y bifurcaciones son cualitativamente distintos.

El punto: **fenómenos colectivos como sincronización, opinión pública o contagio biológico cambian de fase de manera fundamentalmente distinta cuando el sustrato es higher-order**. No es una corrección cuantitativa; son **regímenes nuevos**.

### Higher-order interactions vs pairwise: implicaciones

Resumen de hallazgos consolidados (síntesis de Battiston 2020 y trabajos posteriores):

1. **Sincronización**: en redes con higher-order coupling, aparecen **transiciones explosivas** (discontinuas) en lugar de las transiciones suaves de redes pairwise. El comportamiento colectivo no es monótono.
2. **Percolación**: el umbral crítico para que aparezca un componente gigante cambia significativamente con interacciones higher-order, y hay regímenes de **doble transición**.
3. **Random walks higher-order**: definir caminos aleatorios sobre hipergrafos (no triviales — varias definiciones) revela patrones de exploración cualitativamente distintos a random walks en grafos.
4. **Contagio social**: el modelo de "complex contagion" de Centola pre-figuraba esto sin formalizarlo; los simplicial contagion models de Iacopini lo formalizan.

Para neurociencia funcional, esto implica que **modelar la dinámica cerebral con grafos pairwise puede estar perdiendo precisamente los fenómenos que queremos entender** — los estados de transición, las bifurcaciones, las dinámicas críticas que correlacionan con consciencia, atención, patologías.

## Conceptos cognitivos clásicos que ya apuntaban hacia higher-order

Mucho antes de que existiera TDA o network science, varias tradiciones psicológicas y cognitivas habían identificado la naturaleza no-pairwise del pensamiento. Es revelador releerlas ahora con el lenguaje del hipergrafo en mano.

### Gestalt psychology (1920s)

**Max Wertheimer**, **Wolfgang Köhler**, **Kurt Koffka** fundan la Gestalt en Berlín. Su dictum central: _"Das Ganze ist mehr als die Summe seiner Teile"_ — "el todo es más que la suma de las partes". Una figura percibida (un triángulo en un grupo de puntos, una melodía en una secuencia de tonos) **emerge** como unidad y no es reducible a relaciones entre pares de sus componentes.

Estructuralmente, **una Gestalt es exactamente una hyperedge perceptual**. La percepción del triángulo no es la conjunción de tres percepciones binarias "punto-punto"; es una entidad de 3-aria mínima. Y los principios Gestalt (proximidad, similitud, continuidad, clausura, figura/fondo) describen precisamente las regularidades que llevan al sistema perceptual a **agrupar conjuntos** en hyperedges.

Referencias:

- **Wertheimer (1923). "Untersuchungen zur Lehre von der Gestalt II."** _Psychologische Forschung_ 4: 301–350. El artículo seminal sobre principios de agrupamiento.
- **Wagemans et al. (2012). "A century of Gestalt psychology in visual perception."** _Psychological Bulletin_ 138(6): 1172–1217. Review moderna comprehensiva, dos partes en el mismo volumen.

### Conceptual blending (Fauconnier & Turner)

**Gilles Fauconnier** y **Mark Turner** desarrollan en los 90s la teoría del **conceptual blending** (o **conceptual integration**), culminando en _The Way We Think: Conceptual Blending and the Mind's Hidden Complexities_ (Basic Books, 2002).

Tesis: el pensamiento creativo, las metáforas, los chistes, la invención científica operan por **blending** — combinar **al menos cuatro espacios mentales** (`input₁, input₂, generic space, blended space`) en una red de proyecciones cruzadas que produce significado emergente.

Cada blend es estructuralmente una **hyperedge cognitiva**: un evento mental que coordina simultáneamente cuatro o más estructuras. El blend no se reduce a una superposición lineal de los inputs; tiene propiedades emergentes (la famosa "carro-elefante" de Fauconnier, donde un dibujo de un coche con piernas de elefante carga inferencias que ni el coche ni el elefante tenían).

Importante: blending no es metáfora. Una metáfora pairwise (A es B) es un caso degenerado. Los blends en _The Way We Think_ son típicamente 4+ espacios.

### Schema theory (Bartlett, Piaget, Rumelhart)

**Frederic Bartlett** (_Remembering_, Cambridge 1932) introduce **schemas** como estructuras de conocimiento que organizan la memoria y la comprensión. **Jean Piaget** los toma como núcleo de su epistemología genética. **David Rumelhart** los formaliza en cognitive science computacional (Rumelhart & Norman 1978).

Un schema es una estructura n-aria que coordina:

- **Actores** (quién participa)
- **Objetos** (qué cosas están involucradas)
- **Acciones** (qué pasa)
- **Contextos** (cuándo, dónde, por qué)
- **Expectativas** (qué normalmente sigue)

Por ejemplo, el schema "restaurante" (Schank & Abelson 1977, _scripts_) coordina: cliente, camarero, menú, comida, pago, expectativa de propina, secuencia "entrar → pedir → comer → pagar → salir". Todo eso simultáneamente. Es una hyperedge cognitiva con roles tipados.

Frames de Marvin Minsky (1974), scripts de Schank & Abelson (1977), y FrameNet (Charles Fillmore, ongoing) son refinamientos del mismo objeto. La lingüística computacional moderna (FrameNet, PropBank, AMR — Abstract Meaning Representation) los formaliza con esquemas n-arios explícitos.

Referencias:

- **Minsky (1974). "A framework for representing knowledge."** MIT AI Memo 306. Hito de IA simbólica.
- **Schank & Abelson (1977). _Scripts, Plans, Goals, and Understanding_.** Lawrence Erlbaum.
- **Fillmore (1976). "Frame Semantics and the Nature of Language."** _Annals of the NY Academy of Sciences_ 280: 20–32.

### Distributed cognition y enactivismo

Más radicalmente, las tradiciones de **distributed cognition** (Edwin Hutchins, _Cognition in the Wild_, MIT 1995) y **enactivismo** (Varela, Thompson, Rosch, _The Embodied Mind_, MIT 1991) argumentan que la cognición no está confinada al cráneo: incluye herramientas, cuerpo, ambiente, otros agentes.

Si esto es cierto — y hay evidencia robusta de ello (Clark & Chalmers "The Extended Mind", 1998) — entonces una cognición individual es ya una **hyperedge sobre el sistema {cerebro, cuerpo, herramientas, ambiente, otros}**. Cualquier modelo que separe estos en nodos binarios pierde el carácter de **sistema acoplado** que constituye la cognición real.

## Implicación filosófica

Sintetizando los hilos anteriores, una conclusión epistemológica fuerte:

> Si la mente es un sistema computacional (functionalism, Putnam 1967, Fodor 1975) y ese sistema opera fundamentalmente con interacciones higher-order, entonces los modelos pairwise de la mente — incluidas grandes franjas de la psicología cognitiva clásica, la connectomics estructural y muchos modelos de IA — son **estructuralmente incompletos**.

No es un detalle técnico que se corregirá con más datos o mejores algoritmos sobre el mismo modelo. Es una limitación **del modelo**. Como pasar de física clásica a cuántica: no se trata de hacer mejor newtoniana, se trata de cambiar la estructura del estado.

Esto tiene consecuencias programáticas:

1. **Para neurociencia teórica**: los modelos canónicos (Hopfield, Boltzmann machines, integrate-and-fire) son pairwise. Hay versiones higher-order (Hopfield modernas, Krotov & Hopfield 2016; modelos simpliciales) pero no son mainstream. Probablemente lo serán.
2. **Para IA**: los transformers son pairwise por construcción (cada atención es producto interno entre dos tokens). Funcionan bien, pero hay un techo estructural. Trabajos como [Pegasus Hypergraphs](https://arxiv.org/abs/2106.10785), set transformers, y attention over groups están explorando higher-order de varias formas.
3. **Para sistemas de memoria personal**: un sistema que pretende modelar conocimiento y experiencia humana **no puede** ser solo pairwise sin distorsionar la cosa modelada. Esto nos concierne directamente.

## Implicación para Huygens

Concretemos. Huygens modela memoria operativa y estratégica de Rubén con SurrealDB. El modelo actual:

- `Note` central con `pillars` (multi-valor: `PATHOS_SOMA`, `ETHOS`, `TELOS`, `SOPHIA`), `type` (opcional, único), `state` (GTD), `metadata` (JSON tipo-específico).
- Relaciones binarias tipadas vía `RELATE` (mentions, references, derived_from, part_of, etc.).

### La tensión latente

Una "nota" en la cabeza de Rubén raramente es una entidad simple binariamente conectada. Un pensamiento típico ata:

- Un **proyecto** específico ("Mileto-Infra-GitOps Sprint 2")
- Una **persona** (un coautor, un ex-jefe, un amigo)
- Una **emoción** o estado (`PATHOS_SOMA`)
- Una **idea teórica** (`SOPHIA`: teoría de categorías, modelado de hipergrafos, etc.)
- Una **acción** o `task` derivada
- Un **contexto temporal** (un encuentro concreto, una mañana específica)

Esto es una **hyperedge cognitiva de 5–6 entidades**. Modelarlo como nota con un solo `type` y unas pocas edges binarias es una **simplificación pragmática** — necesaria para que un sistema funcione, pero consciente de que sacrifica algo.

### La aproximación viable: episodios reificados

El patrón natural en SurrealDB:

```surql
-- Crear el episodio (hyperedge reificada)
CREATE note:e_2024_12_20_planning SET
  title = 'Planning Mileto Sprint 2 con Bob',
  type = 'episode',
  state = 'ACTIVE',
  pillars = ['ETHOS', 'TELOS', 'SOPHIA'],
  content = '... markdown ...',
  occurred_at = d'2024-12-20T10:00:00Z';

-- Conectar a cada participante con edges tipados
RELATE note:e_2024_12_20_planning -> involves -> person:bob;
RELATE note:e_2024_12_20_planning -> about    -> project:mileto;
RELATE note:e_2024_12_20_planning -> elaborates -> note:cat_theory_essay;
RELATE note:e_2024_12_20_planning -> spawned   -> note:task_refactor_helm;
RELATE note:e_2024_12_20_planning -> felt      -> emotion:flow;
```

Cada `note:episode` es estructuralmente una hyperedge reificada (ver [hypergraphs-foundations.md](./hypergraphs-foundations.md) para el patrón general). Conceptualmente:

- **Vertex set** efectivo: `{bob, mileto, cat_theory_essay, task_refactor_helm, emotion:flow}` ∪ contextuales temporales/pilares
- **Hyperedge**: el nodo `note:e_2024_12_20_planning` central
- **Roles**: codificados en el tipo de edge (`involves`, `about`, `elaborates`, `spawned`, `felt`)

Esto es el mismo patrón que un frame semántico FrameNet, una reacción química con reactivos/productos, o un cell assembly anatómicamente reificado.

### Análisis topológico futuro (v3+)

Si en futuro el grafo de Rubén crece a miles de notas y decenas de miles de edges, **persistent homology aplicada al bipartito subyacente** revelará:

- **Componentes funcionales aislados** (H₀): clusters de pensamiento desconectados. Útil para detectar áreas mentales sin puentes.
- **Bucles persistentes** (H₁): patrones de pensamiento cíclicos no triviales. Pueden ser rumiación, pueden ser exploraciones genuinas.
- **Cavidades** (H₂+): patrones de NO-conexión estructuralmente significativos. Tipos de cosas que coactivan pero **no se cierran** — preguntas abiertas, tensiones intelectuales no resueltas.

Esto es análisis exploratorio, no predicción operativa. Pero el valor para un sistema que pretende **servir reflexión personal** es claro: el insight no siempre está en lo que dijiste, está en la **forma estructural** de lo que has venido pensando.

Librerías relevantes para implementarlo: [Gudhi](https://gudhi.inria.fr/), [Ripser](https://github.com/Ripser/ripser), [Giotto-TDA](https://giotto-ai.github.io/), [XGI](https://github.com/xgi-org/xgi).

### Pillars como hyperedges latentes

Una observación complementaria: los **Pillars** (`PATHOS_SOMA`, `ETHOS`, `TELOS`, `SOPHIA`) ya son **una declaración de no-pairwise-ness**.

En un modelo pairwise estricto, cada nota tendría un solo "tag" o "categoría". Ortogonalizar en cuatro ejes y permitir multi-valor (`pillars: ['ETHOS', 'TELOS']`) reconoce que **una nota toca varios dominios simultáneamente, y esa simultaneidad es información**. Es estructuralmente una hyperedge `pillar_assignment(note, {pillar₁, pillar₂, ...})`.

Esto es coherente con la fenomenología (un libro de filosofía sobre disciplina personal toca Sophia + Ethos; una nota sobre salud mental con vista al propósito toca Pathos+Soma + Telos). El schema está bien.

## Para profundizar

### Imprescindibles

- **Battiston, Cencetti, Iacopini, Latora, Lucas, Patania, Young, Petri (2020). "Networks beyond pairwise interactions: Structure and dynamics."** _Physics Reports_ 874: 1–92. [arXiv:2006.01764](https://arxiv.org/abs/2006.01764). **LA referencia moderna de network science higher-order**. Lee al menos la intro y las conclusiones.
- **Petri, Expert, Turkheimer, Carhart-Harris, Nutt, Hellyer, Vaccarino (2014). "Homological scaffolds of brain functional networks."** _Journal of the Royal Society Interface_ 11(101): 20140873. **El paper que pone TDA y cerebro en el mapa**.
- **Sizemore, Giusti, Kahn, Vettel, Betzel, Bassett (2018). "Cliques and cavities in the human connectome."** _Journal of Computational Neuroscience_ 44: 115–145.
- **Iacopini, Petri, Barrat, Latora (2019). "Simplicial models of social contagion."** _Nature Communications_ 10: 2485.

### Libros de neurociencia con perspectiva de redes

- **Olaf Sporns — _Networks of the Brain_**, MIT Press (2010). Texto de referencia para network neuroscience. Capítulos sobre función y dinámica.
- **Olaf Sporns — _Discovering the Human Connectome_**, MIT Press (2012). Más enfocado a estructura, complementa al anterior.
- **György Buzsáki — _Rhythms of the Brain_**, Oxford University Press (2006). La perspectiva oscilatoria/sincronización del cerebro. Lectura excelente para entender por qué co-activación coherente es la unidad funcional.
- **György Buzsáki — _The Brain from Inside Out_**, Oxford University Press (2019). Argumento más reciente y filosófico sobre cognición generativa.
- **Andersen, Morris, Amaral, Bliss, O'Keefe — _The Hippocampus Book_**, Oxford (2007). Referencia técnica densa sobre el órgano central de la memoria.

### Libros sobre cognición y blending

- **Gilles Fauconnier & Mark Turner — _The Way We Think: Conceptual Blending and the Mind's Hidden Complexities_**, Basic Books (2002). Definitivo para entender pensamiento como operación higher-order.
- **Edwin Hutchins — _Cognition in the Wild_**, MIT Press (1995). Cognición distribuida. Etnografía de navegación naval con conclusiones radicales sobre dónde "está" la cognición.
- **Andy Clark — _Surfing Uncertainty_**, Oxford (2016). Predictive processing — otra forma de leer la cognición como un sistema generativo de alta dimensión.
- **Stanislas Dehaene — _Consciousness and the Brain_**, Viking (2014). Global Neuronal Workspace theory — modelo concreto donde la consciencia emerge de coactivación higher-order entre áreas.

### Cell assemblies y engramas

- **Donald Hebb — _The Organization of Behavior_**, Wiley (1949). El original, todavía leíble.
- **Yuste, R. (2015). "From the neuron doctrine to neural networks."** _Nature Reviews Neuroscience_ 16, 487–497.
- **Josselyn, Köhler, Frankland (2017). "Heroes of the engram."** _Journal of Neuroscience_ 37(18): 4647–4657. Review accesible.
- **Tonegawa, Pignatelli, Roy, Ryan (2015). "Memory engram storage and retrieval."** _Current Opinion in Neurobiology_ 35: 101–109.

### TDA aplicada

- **Gunnar Carlsson — "Topology and Data"**, _Bulletin of the AMS_ 46 (2009): 255–308. Paper de campo abierto.
- **Robert Ghrist — _Elementary Applied Topology_** (2014, libre en su web). Pedagógico.
- **Herbert Edelsbrunner & John Harer — _Computational Topology: An Introduction_**, AMS (2010). Técnico.
- **Otter, Porter, Tillmann, Grindrod, Harrington (2017). "A roadmap for the computation of persistent homology."** _EPJ Data Science_ 6: 17. Excelente review práctica.

### Lingüística computacional y frames

- **Charles Fillmore (1976). "Frame Semantics and the Nature of Language."** _Annals NY Acad. Sci._ 280: 20–32.
- **FrameNet project** (UC Berkeley): [https://framenet.icsi.berkeley.edu/](https://framenet.icsi.berkeley.edu/).
- **AMR (Abstract Meaning Representation) project**: [https://amr.isi.edu/](https://amr.isi.edu/). Representación semántica con estructura genuinamente n-aria.

### Comunidades, channels, conferencias

- **Network Science Society** (NetSci annual conference): hub de network science incluyendo higher-order.
- **Complexity Science Hub Vienna**: instituto referencia, mucho material en YouTube.
- **Santa Fe Institute**: ditto, especialmente sus cursos abiertos.
- **Channel "Network Science" en YouTube** (varios autores curan playlists).
- **arXiv** secciones `physics.soc-ph`, `q-bio.NC`, `cs.SI` para papers fresh.

### Software

- [**XGI**](https://github.com/xgi-org/xgi) — librería Python para análisis de hipergrafos. La más activa hoy.
- [**HypergraphX**](https://github.com/HGX-Team/hypergraphx) — alternativa.
- [**Gudhi**](https://gudhi.inria.fr/) — librería C++/Python de TDA, soporta persistent homology.
- [**Giotto-TDA**](https://giotto-ai.github.io/) — Python, integra con scikit-learn.
- [**NetworkX higher-order extensions**](https://networkx.org/) — algunas funciones básicas de hipergrafos.

### Referencias cruzadas en esta documentación

- [./hypergraphs-foundations.md](./hypergraphs-foundations.md) — Fundamentos formales del campo, definiciones, reificación, conexión categórica.
- [./tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md) — La matemática operativa para comprimir y manipular tensors de coactivación higher-order.
- [./quantum-and-hypergraphs.md](./quantum-and-hypergraphs.md) — Conexiones con estructuras cuánticas.
- [./living-topology.md](./living-topology.md) — La topología no es estática; evoluciona con la memoria.
- [./declarative-db-as-ontology.md](./declarative-db-as-ontology.md) — El schema declarativo como compromiso ontológico sobre qué cuenta como entidad.
- [./illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md) — Tipos como invariantes.
- [./epistemological-pattern.md](./epistemological-pattern.md) — Patrón epistemológico de Huygens.
- [../03-data-model/topology-as-primary.md](../03-data-model/topology-as-primary.md) — Topología sobre nodos en el design de Huygens.
- [../03-data-model/relations-and-edges.md](../03-data-model/relations-and-edges.md) — Catálogo de edges.
