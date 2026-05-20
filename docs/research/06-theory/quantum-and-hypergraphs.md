# Cuántica e hipergrafos: el mito, la realidad, y la frontera real

> Ensayo técnico-filosófico para el Rubén curioso. Densidad alta, referenciada. Para leer dos veces.

## El insight inicial

El usuario, mirando una tabla de costes computacionales para queries sobre hipergrafos, dejó caer:

> "El coste computacional se dispara [para hipergrafos], pero no se dispararía bajo computación cuántica, ¿verdad?"

La intuición es **medio correcta y medio mítica**. Y la parte mítica es probablemente el malentendido más extendido sobre computación cuántica entre ingenieros senior. Vale la pena desmontarla con cuidado, porque al desmontarla aparece la parte interesante — donde la intuición original sí da en el clavo, aunque por razones distintas a las que el ingeniero medio supone.

Respuesta corta y honesta: **NO en el sentido común**. La cuántica no colapsa NP-hard wholesale. Pero hay vías reales, más interesantes que el mito popular, y algunas de ellas ya están entregando frutos prácticos en hardware **clásico** vía técnicas matemáticas tomadas del mundo cuántico.

## El mito que hay que desactivar

Frase recurrente en blogs, charlas, hilos de Twitter, y conversaciones de pasillo:

> "Computación cuántica hace polinómicos los problemas NP-hard."

**Esto es falso.** Es probablemente el malentendido más extendido sobre computación cuántica.

El consenso teórico actual (Aaronson 2013, Bernstein-Vazirani 1997, Bennett-Bernstein-Brassard-Vazirani 1997):

- **BQP ⊄ NP-completo**: la clase **BQP** (Bounded-error Quantum Polynomial time) — problemas resolubles eficientemente por un computador cuántico — **no contiene** los NP-completos en general
- Conjeturas estándar (no demostradas, pero el campo opera bajo ellas): **P ⊊ BQP ⊊ PSPACE**, y los NP-completos están **fuera de BQP**
- Hay evidencia oráculo de que NP ⊄ BQP (Bennett-Bernstein-Brassard-Vazirani 1997)

Es decir: incluso si tuviéramos un computador cuántico ideal, sin ruido, con un millón de qubits perfectos, **3-SAT seguiría sin tener algoritmo polinómico**. La cuántica no es un genio de la lámpara que pulveriza la jerarquía de complejidad.

## Los speedups reales que cuántica sí ofrece

Lo que cuántica **sí** hace está bien acotado. La tabla a tener interiorizada:

| Algoritmo | Speedup | Problema | Año |
|---|---|---|---|
| **Grover** | Cuadrático (O(√N) vs O(N)) | Búsqueda no estructurada | 1996 |
| **Shor** | Exponencial | Factorización entera (estructura abeliana específica) | 1994 |
| **HHL** (Harrow-Hassidim-Lloyd) | Exponencial CON caveats fuertes | Sistemas lineales bien condicionados | 2008 |
| **Quantum walks** | Polinómico (a veces exponencial) | Problemas específicos de grafos | 2002+ |
| **QAOA / VQE** | Heurístico, no garantizado | Optimización combinatoria, química | 2014 |

Tres observaciones que casi nadie hace explícitas:

**1. Grover es cuadrático.** No exponencial. Si un problema NP-hard requiere `2^N` configuraciones, Grover te lo deja en `2^(N/2)`. Eso es enorme cuantitativamente para `N` pequeño, pero **no cambia la clase de complejidad**. Sigue siendo exponencial. A `N=200` un computador clásico necesita `2^200` operaciones; un cuántico necesita `2^100`. Inalcanzable en ambos casos.

**2. Shor es exponencial pero estrechísimo.** El speedup de Shor depende de que la factorización tiene **estructura algebraica abeliana** (transformada de Fourier sobre Z/NZ). La gran mayoría de problemas que nos importan no la tienen. Por eso Shor no se generaliza a "ataque cuántico a todo".

**3. HHL tiene letra pequeña que casi nadie lee.** El output de HHL es un **estado cuántico** que representa la solución de Ax = b, no la solución leíble. Para extraer la solución entera necesitas medirla, y eso es exponencial en general. HHL es útil cuando solo necesitas un **observable** sobre la solución (norma, valor esperado, etc.), no la solución completa.

## Para problemas de hipergrafos

Aplicado a queries sobre hipergrafos — que son tensores de rank alto:

- Lo mejor que tenemos hoy son speedups **Grover-style**: si traversal NP-hard requiere `N` configuraciones, cuántica te lo deja en `√N`. Sigue siendo exponencial, solo es **raíz cuadrada del exponente**
- Esto **no es un cambio de clase de complejidad**. Es una mejora cuantitativa importante para problemas medianos, irrelevante para problemas grandes
- Por ejemplo: encontrar el clique máximo en un hipergrafo (que es NP-hard) sigue siendo NP-hard cuánticamente; Grover solo lo hace cuadráticamente más rápido

**Conclusión parcial**: la intuición "cuántica resuelve hipergrafos" es falsa en el sentido literal.

## Estado actual del hardware cuántico (2026)

Para enmarcar realista mente el horizonte temporal:

- **~1000 qubits ruidosos** (NISQ era — Noisy Intermediate-Scale Quantum). IBM Condor, Atom Computing han pasado del umbral, pero son qubits con error rates altos
- **Tiempo de coherencia limitado**: microsegundos a milisegundos según la modalidad (superconductors, ions atrapados, fotónicos)
- **Error rates altos**: ~0.1-1% por gate de dos qubits — necesitas **quantum error correction** para algoritmos profundos
- **Logical qubits ≈ 1000s of physical qubits** bajo error correction (códigos surface code)
- "Quantum advantage" demostrado solo en problemas **artificiales** (random circuit sampling, Boson sampling — sin utilidad práctica)
- **Cero quantum advantage** demostrado en problemas prácticos
- Practical quantum computing para BBDDs reales: **15-30 años** optimista. Posiblemente nunca para muchos problemas

Esto no es pesimismo, es la lectura del propio Aaronson, Preskill, y los responsables de los equipos de hardware (Chow en IBM, Castelvecchi en Google). El "10 años" recurrente del marketing es 10 años desde 1995.

## La parte interesante (donde la intuición sí acierta)

Y ahora viene lo bueno. La intuición del usuario — "cuántica e hipergrafos deberían encajar" — **acierta**, pero por razones distintas a las que el discurso popular sugiere.

### 1. Tensor networks: quantum-inspired CLÁSICO

Esto es probablemente lo más relevante para Huygens en horizonte 5-10 años.

Las técnicas matemáticas que la comunidad cuántica desarrolló para representar **many-body states** — sistemas cuánticos con N partículas entrelazadas, intratables computacionalmente — son **exactamente** lo que necesitas para representar correlaciones de orden superior en hipergrafos eficientemente:

- **MPS** (Matrix Product States) — entrelazamiento 1D
- **PEPS** (Projected Entangled Pair States) — entrelazamiento 2D
- **MERA** (Multi-scale Entanglement Renormalization Ansatz) — entrelazamiento jerárquico, multi-escala
- **TTN** (Tree Tensor Networks)

La conexión profunda: un **hipergrafo es un tensor de rank alto**. La matriz de incidencia generalizada de un hipergrafo k-uniforme es un tensor de rank `k`. Almacenarlo explícitamente cuesta `N^k`. Las tensor networks **comprimen tensores de rank alto aprovechando la estructura de entanglement** (correlaciones locales, jerarquía multi-escala).

Y aquí el punto clave: **corren en hardware clásico**. No necesitas qubits. La matemática se inventó para simular sistemas cuánticos en computadores clásicos, y se descubrió que es una herramienta general para tensores estructurados.

Librerías maduras hoy:

- **TensorNetwork** (Google, Python)
- **Quimb** (Python, muy completo)
- **ITensor** (Julia, el más optimizado para physics)
- **TeNPy** (Python, física condensed matter)

Aplicado a knowledge graphs hay investigación activa desde ~2018: papers sobre tensor network knowledge bases, knowledge graph completion vía tensor decomposition, etc.

**Esta es la vía real por donde "cuántica" YA está ayudando a hipergrafos** — vía matemática prestada, no vía qubits. Y aquí sí cabe pensar en pipelines de producción en horizonte de 5 años.

Detalle en [tensor-networks-and-category-theory.md](./tensor-networks-and-category-theory.md).

### 2. Quantum Graph/Hypergraph Neural Networks (HQGNN)

Investigación viva pero pre-producción:

- **HQGNN** (Hybrid Quantum-Graph Neural Networks): combinar un GNN clásico con un parametrized quantum circuit (PQC) que actúa sobre embeddings
- Parametrized quantum circuits sobre estructuras de grafo: cada nodo se mapea a un qubit, cada edge induce una operación entangling
- Resultados experimentales prometedores **en datasets pequeños** (≤ 30 nodos típicamente — el límite del hardware NISQ)
- Papers en NeurIPS, ICML, ICLR 2022-2026

Estado real: frontera de la frontera. Hay papers, hay benchmarks, hay claim de speedup en algunos toy problems. **No production-ready** y posiblemente nunca lo sea con NISQ. La pregunta abierta es si la **expresividad** que ganas con qubits compensa el overhead de simular/ejecutar el circuit.

Para hipergrafos específicamente la literatura es aún más escasa. Hay propuestas teóricas (parametrized circuits que respetan permutation-invariance sobre hyperedges) pero pocas implementaciones.

### 3. Topological Quantum Computing

Un paradigma distinto del gate model:

- **Anyons**, **Fibonacci anyons**, modelo de Kitaev
- Codifica información en la **estructura topológica** del sistema (trenzados de quasiparticles en 2D), no en estados puntuales de qubits
- Las operaciones se vuelven **topológicamente protegidas**: pequeñas perturbaciones no afectan el resultado porque la información vive en una propiedad global

Conexión con hipergrafos: las hiperaristas y los **simplicial complexes** viven en este mundo natural. La topología algebraica que describe anyons (categorías modulares, MTC) es prima cercana de la topología algebraica que describe complejos simpliciales (homología, cohomología persistente).

- **Microsoft Station-Q** lleva años persiguiendo esto. Su apuesta es **Majorana fermions** en nanowires de InAs/Al
- Hardware práctico: 15-20 años (siendo realistas), o más
- Papers de referencia: Kitaev "Fault-tolerant quantum computation by anyons" (2003), Nayak-Simon-Stern-Freedman-Das Sarma "Non-Abelian anyons and topological quantum computation" (2008)

Para Huygens esto es ciencia ficción operativa, pero filosóficamente importante: si TQC funciona, la conexión "topología → computación" deja de ser metáfora.

### 4. Categorical Quantum Mechanics (la conexión profunda)

Aquí está la joya filosófica, y aquí es donde la intuición del usuario se conecta con su propio recorrido lector.

**Coecke + Kissinger** desarrollaron desde ~2004 un programa para reformular la mecánica cuántica en lenguaje de **teoría de categorías**:

- _Picturing Quantum Processes_ (Coecke & Kissinger, 2017) — el libro de referencia
- **ZX-calculus** — un lenguaje gráfico para razonar sobre quantum circuits que es completo (todo lo demostrable sobre circuits clifford+T se puede demostrar gráficamente)
- **String diagrams** para procesos cuánticos
- **Categorías monoidales compactas** como la estructura matemática que captura "procesos que se componen en serie y en paralelo con dualidad"

Y aquí la conexión que probablemente el usuario aún no ha hecho explícita:

**Quantum-as-category y hypergraphs-as-multicategories son el mismo dibujo desde dos lados.**

- Una **multicategoría** generaliza categoría permitiendo que los morfismos tengan múltiples inputs (no solo uno). Eso es literalmente lo que una hiperarista es respecto a una arista
- Una **categoría monoidal compacta** captura procesos paralelos + dualidad, que es la estructura matemática que aparece tanto en quantum protocols (teleportation, dense coding) como en redes hipergráficas con orientación
- Los **string diagrams** de Coecke son visualmente idénticos a las representaciones de hipergrafos dirigidos

Para Rubén — que ya lee a Milewski (Category Theory for Programmers) y le interesa Coecke — esta es la lectura más alta-densidad-de-insight disponible: **leer a Coecke + leer a Milewski conecta dos tradiciones aparentemente lejanas (computación cuántica y programación funcional) bajo el mismo paraguas de teoría de categorías**. Y bajo ese paraguas, los hipergrafos aparecen como objetos naturales, no como una generalización ad hoc de los grafos.

### 5. QBism — la cuántica como creencia bayesiana del observador

Aquí está la pieza que cierra el círculo del **subjetivismo metodológico sin colapso al ontológico**. **QBism** (Quantum Bayesianism) es una interpretación de la mecánica cuántica desarrollada por **Christopher Fuchs**, **Rüdiger Schack** y **N. David Mermin** desde principios de los 2000s.

**Tesis central**: las probabilidades cuánticas no son frecuencias objetivas ni propensiones físicas. Son **creencias bayesianas personales** de un agente sobre sus experiencias futuras. La función de onda no es un objeto físico — es la representación del estado de información del observador.

**Consecuencias radicales que el formalismo se toma en serio**:

- **Cada observador tiene su propio estado cuántico** para el mismo sistema, porque "estado" = creencias del observador, y dos observadores con información distinta tienen creencias distintas
- **La medición no es un evento en el mundo, es una experiencia del agente**. El colapso de la función de onda es **actualización bayesiana** de creencias, no un proceso físico misterioso
- **No hay "vista desde ningún lado"**. La cuántica entera es relativa al agente — pero el mundo subyacente es uno solo, no múltiple
- **Conecta QM con probabilidad bayesiana clásica** de manera continua, no como dos formalismos disjuntos

Es una posición **realista pero observer-centric**: hay un mundo, pero todo lo que decimos cuánticamente sobre él es relativo a quién observa. No es many-worlds (Everett), ni Copenhagen (Bohr), ni hidden variables (Bohm). Es su propia familia interpretativa.

**Por qué importa para Huygens (y para la pregunta sobre subjetivismo)**:

QBism es la **prueba de existencia** de que el subjetivismo metodológico puede mantenerse sin caer al ontológico. Fuchs es físico riguroso, no postmoderno. El formalismo es estricto, predictivo, falsable. Pero el papel del observador es **constitutivo del formalismo**, no añadido a posteriori. Es exactamente lo que estábamos buscando: dependencia del observador SIN relativismo metafísico.

Y se enlaza con piezas que ya tenemos cubiertas:

- **Active Inference** (ver [adjacent-fields-isomorphisms.md](./adjacent-fields-isomorphisms.md#b6-active-inference--free-energy-principle-karl-friston)): ambos son bayesianos, ambos centran al agente. Hay literatura emergente sobre QBism + Active Inference como marcos compatibles
- **Ruliad de Wolfram** (ver [wolfram-and-the-substrate-of-information.md](./wolfram-and-the-substrate-of-information.md)): cada observador hace su slice de lo mismo. QBism dice algo estructuralmente similar específicamente para QM
- **Constructivismo radical** (ver [living-topology.md](./living-topology.md)): la realidad cuántica del agente es construida por sus interacciones, no descubierta como ya-dada
- **Cibernética de segundo orden** (ver [adjacent-fields-isomorphisms.md](./adjacent-fields-isomorphisms.md#a2-cibernética-de-segundo-orden-heinz-von-foerster-ross-ashby)): el observador participa, no contempla desde fuera

**Aplicado a Huygens**: si el agente IA es un observador computacionalmente limitado del hipergrafo de tu memoria, **el modelo del agente sobre tu memoria es QBista en espíritu** — su "estado de tu memoria" son sus creencias bayesianas actualizables, no una vista objetiva privilegiada. Otro agente con otro contexto vería otra cosa. Ningún agente tiene "vista verdadera" — solo creencias bien actualizadas o mal actualizadas.

Eso justifica una decisión arquitectónica concreta: el Huygens MCP **no debería intentar dar al agente una representación canónica** de la memoria. Debería darle las herramientas para que el agente construya su propio estado de creencias sobre la marcha, en cada sesión. Cada sesión es un experimento QBista en miniatura.

**Para profundizar**:

- Fuchs, **"QBism, the Perimeter of Quantum Bayesianism"** (2010, arxiv:1003.5209) — paper accesible y autocontenido
- Fuchs, _Coming of Age with Quantum Information_ (2010) — libro autobiográfico-técnico que recoge correspondencia y desarrollo del programa
- Hans Christian von Baeyer, **_QBism: The Future of Quantum Physics_** (2016, Harvard UP) — intro divulgativa muy buena para entrada
- Caves, Fuchs, Schack, **"Quantum probabilities as Bayesian probabilities"** (Physical Review A, 2002) — paper fundacional
- Fuchs & Schack, "Quantum-Bayesian Coherence" (2013) — formalización más rigurosa
- N. David Mermin's lectures sobre QBism en YouTube — el físico veterano explicando la idea con claridad y polémica

**Críticas honestas a QBism** (porque las hay):

- **¿Solipsismo encubierto?** Si la cuántica es enteramente sobre creencias del agente, ¿qué garantiza que dos agentes hablen del mismo mundo? Fuchs responde con el concepto de "agent-relative empirical adequacy" + la coherencia bayesiana, pero la pregunta sigue mordiendo
- **Subjetividad de los SIC-POVMs**: el formalismo QBista descansa en estructuras matemáticas (SIC-POVMs) cuya existencia general no está completamente demostrada
- **El programa de Fuchs está incompleto**: él mismo lo reconoce. Es una interpretación en desarrollo activo, no un sistema cerrado

Pero la crítica fundamental que algunos lanzan — "es relativismo postmoderno disfrazado de física" — **es falsa**, y por eso es relevante en nuestra discusión. Fuchs y Mermin defienden enfáticamente que QBism es realista sobre el mundo, solo subjetivo sobre la información que cada agente tiene sobre ese mundo. La distinción es exactamente la que defendimos en philosophical-resonances.

## Realismo crudo sobre la timeline

Sin azucarar:

| Horizonte | Promesa | Estado |
|---|---|---|
| **Hoy** | Cuántica resuelve hipergrafos de tu memoria personal | NO. Hardware insuficiente, problemas fuera de BQP |
| **5 años** | Tensor networks clásicos para tu KG personal | SÍ, factible hoy con esfuerzo, mainstream en 5 años |
| **5-10 años** | Quantum-inspired ML sobre tu KG (sin qubits) | SÍ probable, ya hay papers, falta production |
| **15-30 años** | Quantum advantage práctico para problemas de grafos medios | INCIERTO. Optimista. Posiblemente nunca para muchos problemas |

La línea más honesta que he encontrado en la literatura: Scott Aaronson en _Quantum Computing Since Democritus_ y en su blog Shtetl-Optimized lleva 20 años pinchando burbujas mientras defiende que el campo es real. Lo recomiendo como antídoto contra el marketing.

## Implicación para Huygens

Pragmáticamente:

- **Hoy**: cuántica no cambia nada. SurrealDB + reificación de relaciones n-arias + DeepInfra para embeddings basta y sobra para v1
- **En 5 años**: tensor networks clásicos sobre tu KG personal es un experimento posible. El stack matemático ya existe (Quimb, ITensor). La pregunta abierta es si tu KG llegará a tener suficiente densidad de relaciones n-arias para que valga la pena
- **En 15-30 años**: si llega quantum advantage para tu clase de problemas, tendrás los **datos** acumulados para aprovecharlo. La inversión hoy es en **acumular topología bien estructurada**, no en optimizar para hardware que no existe

## La parte filosófica honesta

La cuántica y los hipergrafos **comparten ADN matemático** — multicategorías, string diagrams, monoidal categories. Pero el ADN compartido vive en la **categoría monoidal compacta**, no en el "speed-up exponencial" mediático.

Lo realmente interesante no es que cuántica vaya a "resolver" hipergrafos, sino que tanto cuántica como hipergrafos viven en el **mismo lenguaje matemático abstracto** (categorías monoidales), y ese lenguaje es el que está dando frutos prácticos vía tensor networks **hoy mismo**.

Dicho de otra forma: el mito popular dice "cuántica + hipergrafos = magia futura". La realidad es "cuántica y hipergrafos son dos manifestaciones de la misma matemática de orden superior, y esa matemática ya nos está dando herramientas usables". Lo primero es propaganda. Lo segundo es Coecke, Penrose, y el programa de categorical foundations of physics.

Y eso conecta con el otro ensayo de esta serie: si el patrón histórico de "idea madura → dormición → desbloqueo" se cumple para hipergrafos, el desbloqueo **no vendrá de qubits**. Vendrá de la combinación de tensor networks + GPUs + datasets etiquetados + algún algoritmo no descubierto aún. Ver [epistemological-pattern.md](./epistemological-pattern.md).

## Para profundizar — bibliografía exhaustiva

### Cuántica fundamental

- **_Quantum Computation and Quantum Information_** — Nielsen & Chuang (Cambridge UP, 10th anniversary ed. 2010). La "Biblia" del campo. Denso pero completo. Capítulos 1-4 y 8-10 son suficientes para hablar el idioma
- **_Quantum Computing Since Democritus_** — Scott Aaronson (Cambridge UP, 2013). Accesible, polémico, divertido. Lectura de cabecera para no comprarse el hype. Cubre complexity theory, philosophy of QC, anthropic principle. Único libro de QC que cita a Wittgenstein
- **_Quantum Theory: Concepts and Methods_** — Asher Peres (1995). Punto de vista operacional, muy claro sobre qué es y qué no es la mecánica cuántica

### Conexión con teoría de categorías (DEBE leer)

- **_Picturing Quantum Processes: A First Course in Quantum Theory and Diagrammatic Reasoning_** — Coecke & Kissinger (Cambridge UP, 2017). INDISPENSABLE para Rubén. Reformula QM enteramente desde string diagrams. Conecta directo con Milewski
- **_Categorical Quantum Mechanics_** — Coecke, lecture notes online (Oxford). Versión condensada
- **ZX-calculus tutorials**: [zxcalculus.com](https://zxcalculus.com). Tutoriales interactivos
- **_Quantum Computation, Categorical Semantics and Linear Logic_** — Selinger, surveys. Conexión con linear logic

### Tensor networks

- **"Tensor Networks in a Nutshell"** — Biamonte & Bergholm, arXiv:1708.00006 (2017). 60 páginas, excelente intro técnica
- **"Hand-waving and Interpretive Dance: An Introductory Course on Tensor Networks"** — Bridgeman & Chubb, arXiv:1603.03039 (2017). Título informal, contenido sólido
- **"The density-matrix renormalization group in the age of matrix product states"** — Schollwöck (Annals of Physics 2011). Clásico
- **Quimb** — [quimb.readthedocs.io](https://quimb.readthedocs.io)
- **TensorNetwork (Google)** — [github.com/google/TensorNetwork](https://github.com/google/TensorNetwork)
- **ITensor** — [itensor.org](https://itensor.org)

### Quantum ML / Quantum HGNN

- **_Quantum Machine Learning: What Quantum Computing Means to Data Mining_** — Schuld & Petruccione (Springer, 2nd ed. 2021). Libro de referencia
- **"Parameterized quantum circuits as machine learning models"** — Benedetti et al, Quantum Science and Technology (2019)
- **"Quantum Graph Neural Networks"** — Verdon et al, arXiv:1909.12264 (2019). Punto de partida
- arXiv search: "quantum graph neural networks", "quantum hypergraph", "quantum-inspired knowledge graph"

### Topological QC

- **"Fault-tolerant quantum computation by anyons"** — Kitaev, Annals of Physics (2003). Paper fundacional
- **"Non-Abelian anyons and topological quantum computation"** — Nayak, Simon, Stern, Freedman, Das Sarma, Reviews of Modern Physics (2008). El review canónico
- Microsoft Station-Q publications — buscar en arXiv autores Freedman, Nayak, Kitaev

### Complexity theory (para enmarcar BQP)

- **_Computational Complexity: A Modern Approach_** — Arora & Barak (Cambridge UP, 2009). El libro de complexity. Capítulo sobre BQP
- **_The Complexity Zoo_** — Aaronson (online wiki). Catálogo enciclopédico de clases. [complexityzoo.uwaterloo.ca](https://complexityzoo.uwaterloo.ca)
- **"BQP and the Polynomial Hierarchy"** — Aaronson, STOC 2010. Resultados de oráculo sobre BQP vs PH

### Conferencias para seguir

- **QIP** (Quantum Information Processing) — la conferencia teórica anual
- **TQC** (Theory of Quantum Computation, Communication and Cryptography)
- **AQIS** (Asian Quantum Information Symposium)
- **NeurIPS / ICML / ICLR** — para Quantum ML

### Blogs y voces críticas

- **Shtetl-Optimized** — Scott Aaronson. Antídoto contra hype, mantenido desde 2005
- **Quantum Frontiers** — Caltech (Preskill et al)
- **The Quantum Pontiff** — Bacon (legacy pero útil)

---

**Cierre**: la pregunta "¿cuántica resolverá hipergrafos?" tiene mejor reformulación. La pregunta correcta es: **¿qué matemática de orden superior — categorías monoidales, tensor networks, topología algebraica — nos va a dar herramientas para razonar y computar sobre estructuras n-arias?** La respuesta es: ya lo está haciendo, y la mayor parte no necesita qubits. Esa es la frontera real.
