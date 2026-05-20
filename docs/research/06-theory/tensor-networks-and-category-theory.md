# Tensor networks y teoría de categorías

> Tensor networks como matemática moderna para representar correlaciones higher-order. Cómo conectan hipergrafos, mecánica cuántica y teoría de categorías. Por qué, contra-intuitivamente, **corren en hardware clásico hoy** y abren un camino concreto para representar memoria estructurada.

## Tesis

Los **tensor networks** son una abstracción nacida en física cuántica de muchos cuerpos (DMRG, Steven White 1992) que ha evolucionado hasta convertirse en uno de los pilares matemáticos transversales de la ciencia computacional moderna. Su propiedad central:

> Representan **objetos de altísima dimensión** (tensores de rank N con dimensión D, naïvely `D^N` parámetros) usando estructura local (`O(N · D · χ²)` parámetros, lineal en N), con una **bond dimension** `χ` que parametriza el compromiso compresión↔precisión.

Aplicaciones que han demostrado en los últimos quince años:

- **Quantum many-body physics**: ground states, dinámica, modelos de spin.
- **Quantum chemistry**: estados electrónicos correlacionados.
- **Machine learning**: layers como tensor networks, modelos generativos, compresión de redes neuronales.
- **Knowledge graphs**: tensor decomposition para link prediction (RESCAL, ComplEx, TuckER).
- **Combinatorial optimization**: SAT solving, contagem de soluciones, model counting.
- **Probabilistic inference**: representaciones compactas de distribuciones.

Y, crucialmente para este documento, son **el lenguaje natural compartido** entre tres mundos que un lector de Milewski y Coecke tendrá interés en unificar: hipergrafos, mecánica cuántica categórica y operads/multicategorías.

## Tensores: la definición básica

Un **tensor** es la generalización de scalar / vector / matrix a número arbitrario de índices.

- **Rank 0** — escalar: `s ∈ ℝ`
- **Rank 1** — vector: `v[i]`, `i ∈ [1..d]`
- **Rank 2** — matriz: `M[i, j]`
- **Rank N** — tensor: `T[i₁, i₂, ..., iₙ]`

Cada índice tiene una **dimensión** (cuántos valores puede tomar). Un tensor `T[i₁, ..., iₙ]` con cada índice de dimensión `D` tiene `Dⁿ` componentes — exponencial en el rank.

**Conexión con hipergrafos**: una hyperedge n-aria con vértices etiquetados por valores de un dominio finito `[1..D]` codifica exactamente un tensor de rank `n`. Si el hipergrafo es pesado (cada hyperedge tiene un valor real), el tensor es real. Si los pesos son booleanos (presencia/ausencia), el tensor es de soporte (un indicador). La biyección es exacta.

## Network: tensores conectados

Un **tensor network** es un conjunto de tensores conectados por **índices compartidos**. La operación fundamental es la **contracción**: sumar sobre índices que aparecen en dos (o más) tensores.

Notación de Einstein:

```
C[i, k] = Σⱼ A[i, j] · B[j, k]
```

es la contracción de `A` y `B` sobre el índice `j`. Visualmente:

```
   ┌───┐   ┌───┐
i ─┤ A ├─j─┤ B ├─ k
   └───┘   └───┘
```

Una "pata" (índice abierto) queda como índice del resultado. Una pata "interior" (compartida) se suma sobre todos sus valores.

Generalizando: un network con `m` tensores y `n` índices abiertos contracta a un tensor de rank `n` cuyo valor en cada combinación de índices abiertos es la suma sobre todas las combinaciones de índices interiores.

Esto es:

- Matemáticamente equivalente a la definición de morfismos en una **categoría monoidal simétrica** con dualidades (compact closed). Una contracción es composición.
- Visualmente equivalente a un **string diagram** (Penrose 1971, Joyal-Street 1991). Las cajas son tensores, las cuerdas son índices.
- Operacionalmente equivalente a un programa que evalúa sumas anidadas en hardware clásico.

## Variantes principales

Hay un zoo de tensor networks. Cada uno corresponde a una **topología de contracción** distinta, optimizada para distintos sistemas físicos o tipos de correlación.

### MPS / Tensor Trains

**Matrix Product States (MPS)** en lenguaje físico, **Tensor Trains (TT)** en lenguaje aplicado (Oseledets 2011). Tensores conectados en cadena 1D:

```
   ┌───┐    ┌───┐    ┌───┐         ┌───┐
   │ A₁├──χ─┤ A₂├──χ─┤ A₃├── ... ──┤ Aₙ│
   └─┬─┘    └─┬─┘    └─┬─┘         └─┬─┘
     │d       │d       │d            │d
```

Cada `Aᵢ` (excepto los extremos) es de rank 3: un índice físico `d` (de dimensión `d`) y dos índices virtuales `χ` (bond dimension, `χ` configurable). Extremos son rank 2.

**Propiedad clave**: un tensor de rank `N` con dimensión `d` por índice, naïvely `d^N` parámetros, se representa con `(N · d · χ²)` parámetros. Si `χ` es manejable (digamos `100`), el ahorro es astronómico.

**Aplicaciones**:

- **Ground states de sistemas cuánticos 1D**: el teorema de Hastings (2007) demuestra que estados con gap espectral en 1D tienen entropía de entanglement acotada, y MPS los representa polinomialmente. Es la base de **DMRG** (Density Matrix Renormalization Group).
- **Compresión de redes neuronales**: layers de NN como TT (Novikov et al. 2015).
- **Probabilistic inference**: marginal queries en redes bayesianas con tree decomposition acotada.
- **Procesado de lenguaje (clásico)**: Pestun & Vlasov (2017) propusieron MPS para language models antes de los transformers.

**Software**: [ITensor](https://itensor.org/), [TeNPy](https://tenpy.readthedocs.io/), [Quimb](https://quimb.readthedocs.io/), [TensorNetwork (Google)](https://github.com/google/TensorNetwork).

### MPO (Matrix Product Operators)

Mismo patrón que MPS pero para **operadores** en lugar de **estados**. Cada `Aᵢ` es de rank 4 (dos índices físicos — input y output — más dos virtuales). Sirve para representar Hamiltonianos en DMRG, canales cuánticos, evolución temporal con TEBD (Time-Evolving Block Decimation).

### TTN (Tree Tensor Networks)

Tensores conectados en estructura de **árbol**. Cada hoja es un sitio físico; cada nodo interno agrega información jerárquicamente:

```
        root
       /    \
      x      y
     /\     /\
    a  b   c  d
   /\
  ...
```

Captura correlaciones jerárquicas. Útil cuando el sistema tiene estructura natural de árbol (modelos de Bethe lattice, ciertos sistemas multilevel).

### MERA (Multi-scale Entanglement Renormalization Ansatz)

**Guifre Vidal (2008)**. Estructura escala-invariante que combina **disentanglers** (operadores unitarios que eliminan entanglement local) y **isometrías** (que coarse-grain a escalas mayores). Captura **correlaciones de largo alcance** y críticas (sistemas en transiciones de fase).

Su importancia trasciende física: **Brian Swingle (2012)** muestra que la estructura de MERA es geométricamente un **espacio hiperbólico** discretizado, y conjetura una conexión con **AdS/CFT** (Maldacena 1997) — la dualidad holográfica de Juan Maldacena que vincula teorías de gauge con gravedad. La conjetura "ER = EPR" de Maldacena-Susskind (2013) y los desarrollos posteriores (códigos cuánticos como geometría, Pastawski-Yoshida-Harlow-Preskill 2015) toman MERA-like networks como modelo concreto.

Para un lector con curiosidad: tensor networks tipo MERA son una de las pocas formas concretas de **emerger geometría desde estructura cuántica** — un programa de investigación con consecuencias filosóficas no triviales sobre la naturaleza del espacio.

### PEPS (Projected Entangled Pair States)

Generalización de MPS a 2D. Tensores en una grilla 2D, cada uno conectado a sus cuatro vecinos:

```
─T─T─T─T─
 │ │ │ │
─T─T─T─T─
 │ │ │ │
─T─T─T─T─
```

**Captura**: ground states de sistemas cuánticos 2D, modelos topológicos (toric code, fractones).

**Coste**: contraer un PEPS exactamente es **#P-hard** (Schuch-Wolf-Verstraete-Cirac 2007). En la práctica se usan métodos aproximados (boundary MPS, corner transfer matrix). Es **el** algoritmo de frontera en simulación de materia cuántica 2D.

### TNS generales

Generalizando aún más: cualquier grafo (o hipergrafo) de tensores es un tensor network. Los anteriores son casos con topología fija. Hay trabajos recientes sobre **tensor networks de topología aprendida** — donde la estructura de contracción se optimiza junto con los parámetros.

## ¿Por qué importan para hipergrafos y bases de datos?

Tres conexiones operativas:

### 1. Compresión exponencial de tensores higher-order

Un knowledge graph es naturalmente un **tensor de rank ≥ 3**: `T[entity, relation, entity]`. Para hipergrafos n-arios es rank `n+1` (`n` participantes + tipo). Para Wikidata con qualifiers, rank ≥ 5.

Un tensor con 100k entidades, 1000 relaciones, rank 3: `10^5 · 10^3 · 10^5 = 10^13` componentes. Intratable.

Tensor decomposition (CP, Tucker, MPS) lo comprime a `O(N · D · R)` donde `R` es el rank de descomposición. Esto **es** la base de **embeddings** de knowledge graphs: cada entidad y cada relación se representa como vector(es) de baja dimensión cuya combinación reproduce el tensor original.

Modelos canónicos:

- **RESCAL** (Nickel-Tresp-Kriegel 2011): cada relación es una matriz, cada entidad un vector. `score(s, r, o) = sᵀ Mᵣ o`. Equivalente a una descomposición tensor con factor de relación matricial.
- **DistMult** (Yang et al. 2014): simplificación con `Mᵣ` diagonal.
- **ComplEx** (Trouillon et al. 2016): vectores complejos para capturar asimetría.
- **TuckER** (Balažević-Allen-Hospedales 2019): full Tucker decomposition. Estado del arte en muchas tareas.

Para hipergrafos:

- **HypE** (Fatemi et al. 2020): generaliza ComplEx a hyperedges n-arias.
- **GETD** (Liu et al. 2020): tensor decomposition para n-ary KGs.
- **NeuralLP-N** (Wang et al. 2021): inferencia lógica diferenciable sobre KGs n-arios.

### 2. Tensor completion como KG completion

**KG completion** — predecir edges faltantes — es matemáticamente **tensor completion**: dado un tensor parcialmente observado, completar las entradas faltantes asumiendo una estructura de bajo rank.

Esta equivalencia formal significa que toda la literatura de tensor completion (Kolda-Bader survey 2009; Liu-Musialski-Wonka-Ye 2013; Cichocki et al. 2016) es aplicable a knowledge graphs higher-order. Es uno de los puentes más concretos entre matemáticas aplicadas y razonamiento sobre grafos.

### 3. Operaciones algebraicas sobre el grafo

Una vez tu grafo está representado como tensor (o tensor network), muchas queries son **contracciones**:

- Vecinos de un nodo: contracción del vector indicador con la matriz de adyacencia.
- Caminos de longitud `k`: `A^k`.
- Random walks: `(D⁻¹A)^k`.
- Inferencia probabilística: marginalización via contracción de índices.

Esto **no es** una alternativa a graph traversal — para queries de exploración puntual, los algoritmos de grafos siguen siendo más eficientes. Es una **complemento** para queries globales/estructurales donde la representación tensor es más natural.

## Quantum-inspired classical algorithms

Una de las contribuciones más importantes (y subestimadas) de tensor networks es que son **algoritmos clásicos** que importan ideas de mecánica cuántica.

**Trayectoria**:

1. 1992 — Steven White desarrolla DMRG para sistemas cuánticos 1D. Funciona escandalosamente bien, nadie entiende del todo por qué (la teoría llegó después).
2. 1995–2005 — Östlund, Rommer, Verstraete, Cirac formalizan DMRG como variational algorithm sobre MPS. La estructura de MPS se ve como "área-ley de entanglement" — exactamente lo que necesitan ground states gappados.
3. 2007 — Hastings prueba rigurosamente que estados gappados 1D obedecen área-ley y por tanto admiten MPS polinomial.
4. 2009+ — Tensor networks generalizan: PEPS, MERA, TTN. Se extienden a problemas clásicos: machine learning, optimización.
5. 2015+ — Quantum-inspired ML: Stoudenmire & Schwab "Supervised learning with quantum-inspired tensor networks" (NeurIPS 2016) muestra que MPS-based classifiers competen con kernel methods en MNIST.
6. 2020+ — Tang's quantum-inspired algorithms para recomendación (2018) inician una ola: para muchos problemas donde había aceleración cuántica esperada, hay algoritmos clásicos inspirados (no requiriendo qubits) competitivos.

**Lección operativa**: muchas técnicas que viven en el reino "cuántico" en la literatura son **traducibles a hardware clásico** vía tensor networks. Esto es relevante porque significa que **no necesitas un qubit funcional para tener parte del valor**. Es un gradiente, no un cliff.

## Conexión con teoría de categorías

Esta es la sección que un lector de Milewski y Coecke estará esperando. La conexión tiene tres niveles.

### Nivel 1: monoidal categories y string diagrams

Una **categoría monoidal** `(𝒞, ⊗, I)` es una categoría con:

- Un bifuctor `⊗ : 𝒞 × 𝒞 → 𝒞` (producto tensorial)
- Un objeto unidad `I`
- Isomorfismos asociadores y unidades (con axiomas coherencia: pentagon, triangle — Mac Lane 1963)

Si además hay un swap `σ : A ⊗ B → B ⊗ A` (con axiomas), es **simétrica**. Si los objetos tienen **duales** (`A* ⊗ A → I` y `I → A ⊗ A*`), es **compact closed**.

**Teorema de coherencia de Joyal-Street (1991)**: el lenguaje gráfico de **string diagrams** es **completo** para categorías monoidales. Es decir: dos morfismos son iguales en cualquier categoría monoidal sii sus string diagrams son isotópicos (deformables uno en otro sin cortar/pegar). Es álgebra dibujada.

**Tensor networks son string diagrams**:

- Categoría: `FdVect` (espacios vectoriales finito-dim sobre `ℝ` o `ℂ`)
- `⊗` = producto tensorial
- Cada tensor = caja con cuerdas (una por índice)
- Composición = pegar cuerdas (= contracción)

Esto **es** el contenido conceptual: tensor networks son la realización de string diagrams en una categoría monoidal compact closed específica. No es analogía, es identidad estructural.

Referencias:

- **Selinger (2010). "A survey of graphical languages for monoidal categories."** En _New Structures for Physics_, Springer Lecture Notes in Physics. La review canónica.
- **Joyal & Street (1991). "The geometry of tensor calculus, I."** _Advances in Mathematics_ 88(1): 55–112. Paper técnico fundacional.

### Nivel 2: Categorical Quantum Mechanics (CQM)

**Bob Coecke** (Oxford, ahora chief scientist en Quantinuum) y colaboradores (Samson Abramsky, Aleks Kissinger, Chris Heunen) desarrollan desde ~2004 un programa de **reformulación de la mecánica cuántica en lenguaje categórico**.

Idea central: la formulación tradicional de QM en términos de espacios de Hilbert y operadores lineales es **un caso particular**. Los axiomas estructurales reales son los de una **dagger compact symmetric monoidal category** — y muchos resultados de QM se siguen **solo** de esa estructura, sin requerir la realización específica.

El libro de referencia: **Bob Coecke & Aleks Kissinger — _Picturing Quantum Processes: A First Course in Quantum Theory and Diagrammatic Reasoning_**, Cambridge University Press (2017).

Es un libro pedagógico (no técnico) que enseña QM **dibujando**. Capítulos sobre:

- Procesos como cajas
- Estados, efectos, números
- Dagger compactness y dualidades
- Entanglement como cuerda
- Teleporting via reidemeister moves
- Algebras de Frobenius (clásica vs cuántica)
- Spider diagrams
- Aplicaciones a lingüística (DisCoCat — Distributional Compositional Categorical models of meaning)

Es **el libro** para alguien con base en CT que quiere entender QM sin pasar por meses de bra-ket y operadores en Hilbert. Y conecta directamente con tensor networks: los diagramas de Coecke **son** tensor networks con dagger structure (que es lo que da unitariedad).

### Nivel 3: ZX-calculus

**ZX-calculus** es una notación gráfica específica para qubit-level quantum computing, derivada de CQM. Su origen: Coecke & Duncan (2008).

Componentes:

- **Spiders verdes (Z-spiders)**: representan operaciones diagonales en la base computacional, parametrizadas por una fase `α`.
- **Spiders rojos (X-spiders)**: idem para la base de Hadamard.
- **Cables**: cables de información cuántica.

Reglas de reescritura (rewriting rules) — un cálculo formal que permite manipular diagramas:

- Spider fusion (spiders del mismo color se fusionan sumando fases)
- Hadamard color change (intercambio de colores con H)
- π-copy, π-commute
- ...

**Teorema de completitud (Vilmart 2018, Jeandel-Perdrix-Vilmart 2018)**: ZX-calculus con reglas finitas es **completo** para QM de qubits — toda igualdad entre operadores demostrable en QM es demostrable como secuencia de rewrites en ZX.

**Aplicaciones**:

- **Compilación cuántica**: optimizar circuitos antes de mapearlos a hardware. PyZX, Quantomatic.
- **Verificación de circuitos**: probar equivalencia entre dos circuitos.
- **Quantum error correction**: representar y razonar sobre códigos como ZX diagramas.
- **Hybrid classical-quantum reasoning**: ZX diagramas permiten "open boundaries" — partes clásicas dentro de un proceso cuántico.

**Software**: [PyZX](https://github.com/Quantomatic/pyzx), [Quantomatic](https://quantomatic.github.io/).

**Recursos**: [https://zxcalculus.com](https://zxcalculus.com) tiene un wiki, tutorials, lista de papers, y un excelente "ZX-calculus for the working quantum mechanic" (van de Wetering 2020) como introducción técnica.

### Nivel 4: multicategorías, operads, PROPs

Volviendo al puente con hipergrafos (ver [hypergraphs-foundations.md](./hypergraphs-foundations.md) sección "Conexión con teoría de categorías"):

- Una **multicategoría** sobre un conjunto `X` con morfismos `f : x₁, ..., xₙ → y` corresponde a la categoría de **tensores con `n` patas de entrada y `1` de salida** sobre los espacios `x_i`, `y`.
- Un **operad** es una multicategoría con un solo objeto: tensores `n → 1` sobre un único espacio.
- Un **PROP** (PROduct and Permutation category) permite multiple outputs: tensores `n → m`. Es exactamente lo que necesitas para tensor networks generales.
- Una **wheeled PROP** añade trazas (cerrar bucles). Necesario para tensor networks con loops (PEPS, MERA con cycles).

Esta es la estructura algebraica **completa** para tensor networks. Si te interesa el aspecto categórico riguroso:

- **Tom Leinster — _Higher Operads, Higher Categories_**, Cambridge (2004). Definitivo.
- **Brendan Fong — _The Algebra of Open and Interconnected Systems_** (tesis doctoral, 2016, en arXiv). Marco moderno con hypergraph categories como objeto central.
- **Fong & Spivak — _An Invitation to Applied Category Theory_**, Cambridge (2019). Capítulo sobre composing relations con coends; matemáticamente cercano.

### Resumen: por qué un lector con base en CT debe importarle

El lector de Milewski conoce categorías, monoidal categories, functors. El lector de Coecke conoce CQM y string diagrams. **Tensor networks son el lugar donde ambos lenguajes se vuelven operativos**:

- Son objetos que se **computan** (no solo se discuten).
- Tienen librerías maduras (Quimb, ITensor, TensorNetwork).
- Aparecen en deep learning de vanguardia, quantum computing, knowledge graphs, optimización.
- Y son **literalmente** los string diagrams de Coecke con valores concretos en los cables.

Si quieres "ver categorías en acción" en un contexto que no sea programación funcional pura, este es el lugar.

## Resumen visual de las conexiones

```
                            Hipergrafos
                              │
                              │  (un hipergrafo n-ario = tensor de rank n)
                              ▼
   Higher-order ────►  Tensor networks  ◄──── Quantum many-body physics
   networks              │      │
   (Battiston)           │      │
                         │      ├──► Quantum-inspired ML
                         │      │
                         │      ├──► Knowledge graph completion
                         │      │     (RESCAL, ComplEx, HypE, ...)
                         │      │
                         │      └──► Categorical Quantum Mechanics
                         │             (Coecke, Kissinger)
                         │              │
                         │              ├──► ZX-calculus
                         │              │     (qubit-level)
                         │              │
                         ▼              ▼
                    String diagrams ◄── Monoidal categories
                    (Joyal-Street)         │
                                           │
                                           ├──► Multicategorías
                                           │     (n-ary morphisms)
                                           │
                                           └──► PROPs, operads
                                                 (tensor networks abstractos)
                                                 │
                                                 │
   Brain dynamics ◄────────────────────────────► Category theory
   (Petri, Bassett)                              (Milewski, MacLane)
```

Cada flecha es un puente con literatura propia. Lo notable: **todos los nodos son aspectos del mismo objeto matemático** — una categoría monoidal con tensors como morfismos.

## Aplicación posible a Huygens (v3+)

Una idea concreta — no para v1, pero para tener en cabeza:

### Memoria como tensor higher-order

Modelar la memoria de Rubén como tensor:

```
T[note, pillar, type, project, person, time_bucket] ∈ ℝ
```

Cada entrada es un peso (relevancia, fortaleza de la coactivación). El tensor es esparso pero genuinamente higher-order — captura que una nota dada toca múltiples pillars con un proyecto y una persona en un tiempo dado.

Si tienes 10k notas, 4 pillars, 8 types, 50 projects, 100 personas, 100 time buckets:

```
10^4 · 4 · 8 · 50 · 100 · 100 = 1.6 · 10^11 entradas
```

Intratable como tensor denso. Pero **manejable como tensor network**: MPS o Tucker con bond dimension moderada lo comprime a `O(10^6)` parámetros.

### Operaciones útiles que esto habilita

1. **Queries semánticas como contracciones**:

   "Notas sobre Ethos relacionadas con persona X en el último mes" = contracción del tensor sobre los índices `pillar=ETHOS`, `person=X`, `time_bucket=recent`, sumando sobre el resto. Devuelve un vector indexado por `note` con scores.

2. **Knowledge graph completion**:

   Si el tensor está aprendido por descomposición de las relaciones existentes, entradas con valor alto pero no observadas en el dataset son **sugerencias** de relaciones que el sistema infiere. Útil para sugerir tags, conexiones entre notas, asignaciones de pillars.

3. **Anomaly detection estructural**:

   Patrones de coactivación que el modelo no explica bien (residuales altos tras descomposición) marcan **outliers** — notas que no encajan en la estructura aprendida. Pueden ser malclasificadas, o pueden ser **insights nuevos** (ideas que rompen la estructura existente).

4. **Compresión y resumen**:

   La descomposición misma tiene valor: los **factores** representan dimensiones latentes (temas implícitos en la memoria, modos de pensamiento, fases temporales). Pueden visualizarse e inspeccionarse.

### Stack técnico viable

- **Backend de almacenamiento**: SurrealDB (ya está).
- **Capa de exportación**: cron job que materializa el grafo como tensor esparso COO (Coordinate Format).
- **Librería de tensor decomposition**: [Quimb](https://quimb.readthedocs.io/) (Python, MPS/PEPS/general), [TensorLy](http://tensorly.org/stable/index.html) (Python, decomposiciones clásicas: CP, Tucker), [ITensor](https://itensor.org/) (Julia, más performant).
- **Servir queries**: endpoint en el MCP server que toma el tensor pre-computado y ejecuta contracciones.
- **Periodicidad**: re-aprender el tensor diariamente o semanalmente. Operativo, no realtime.

### Por qué NO ahora

- El grafo de Rubén es pequeño (cientos de notas, no decenas de miles). La motivación de tensor networks es la **compresión** — no aporta valor sin volumen.
- La calidad de los embeddings de chunks (BGE-M3, ya en plan) cubre la mayoría de queries semánticas hoy.
- Construir esta capa antes de tener tracción es over-engineering.

Pero el modelo de datos (notas + edges tipados + pillars como multi-valor) **es compatible** con esta extensión sin migraciones traumáticas. La estructura está bien planteada desde el inicio.

## Para profundizar

### Libros canónicos sobre tensor networks

- **Roman Orús — "A practical introduction to tensor networks: Matrix product states and projected entangled pair states."** _Annals of Physics_ 349 (2014): 117–158. [arXiv:1306.2164](https://arxiv.org/abs/1306.2164). **La mejor introducción técnica accesible**. Si vas a leer un solo paper, este.
- **Jacob Bridgeman & Christopher T. Chubb — "Hand-waving and Interpretive Dance: An Introductory Course on Tensor Networks."** _J. Phys. A: Math. Theor._ 50 (2017): 223001. [arXiv:1603.03039](https://arxiv.org/abs/1603.03039). Más reciente, pedagógico, con ejercicios.
- **Jacob Biamonte & Ville Bergholm — "Tensor Networks in a Nutshell."** [arXiv:1708.00006](https://arxiv.org/abs/1708.00006) (2017). Súper compacto, denso.
- **Glen Evenbly & Guifre Vidal — "Tensor Network States and Geometry."** _J. Stat. Phys._ 145 (2011): 891–918. Para MERA y geometría.

### Libros de Coecke y categorical QM

- **Bob Coecke & Aleks Kissinger — _Picturing Quantum Processes: A First Course in Quantum Theory and Diagrammatic Reasoning_**, Cambridge University Press (2017). **El libro maestro para alguien con base en CT que quiere entender QM**.
- **Chris Heunen & Jamie Vicary — _Categories for Quantum Theory: An Introduction_**, Oxford (2019). Tratamiento más matemático, complementario al de Coecke.
- **Bob Coecke (ed.) — _New Structures for Physics_**, Springer Lecture Notes in Physics 813 (2010). Compilación con el seminal "A survey of graphical languages" de Selinger.

### Categorías y operads

- **Tom Leinster — _Higher Operads, Higher Categories_**, Cambridge (2004). [arXiv:math/0305049](https://arxiv.org/abs/math/0305049). Libre en arXiv. El texto canónico.
- **Saunders Mac Lane — _Categories for the Working Mathematician_**, Springer (1971, 2nd ed. 1998). Referencia última.
- **Emily Riehl — _Category Theory in Context_**, Dover (2016). Excelente accesible.
- **Brendan Fong & David Spivak — _An Invitation to Applied Category Theory_**, Cambridge (2019). Aplicado, con muchos ejemplos.
- **Bartosz Milewski — _Category Theory for Programmers_** (libre en GitHub, también en print). El puente desde la programación funcional.

### ZX-calculus

- **Aleks Kissinger & John van de Wetering — _Picturing Quantum Software: An Introduction to the ZX-Calculus and Quantum Compilation_**. Borrador disponible, libro en preparación.
- **John van de Wetering — "ZX-calculus for the working quantum computer scientist."** [arXiv:2012.13966](https://arxiv.org/abs/2012.13966) (2020). Introducción técnica completa.
- **[https://zxcalculus.com](https://zxcalculus.com)** — Web oficial con tutoriales, papers, software.

### Tensor decomposition clásica (no-network)

- **Tamara Kolda & Brett Bader — "Tensor Decompositions and Applications."** _SIAM Review_ 51(3) (2009): 455–500. **Clásico imprescindible** para CP, Tucker, HOSVD.
- **Andrzej Cichocki et al. — "Tensor Decompositions for Signal Processing Applications."** _IEEE Signal Processing Magazine_ 32(2) (2015): 145–163.
- **Lieven De Lathauwer — "A multilinear singular value decomposition."** _SIAM J. Matrix Anal._ 21(4) (2000): 1253–1278. HOSVD original.

### Knowledge graph embeddings

- **Maximilian Nickel, Volker Tresp, Hans-Peter Kriegel — "A Three-Way Model for Collective Learning on Multi-Relational Data."** _ICML 2011_. RESCAL original.
- **Antoine Bordes et al. — "Translating Embeddings for Modeling Multi-relational Data."** _NeurIPS 2013_. TransE.
- **Théo Trouillon et al. — "Complex Embeddings for Simple Link Prediction."** _ICML 2016_. ComplEx.
- **Ivana Balažević et al. — "TuckER: Tensor Factorization for Knowledge Graph Completion."** _EMNLP 2019_.
- **Bahare Fatemi et al. — "Knowledge Hypergraphs: Prediction Beyond Binary Relations."** _IJCAI 2020_. HypE — extensión a n-arias.

### Quantum-inspired ML

- **E. Miles Stoudenmire & David J. Schwab — "Supervised Learning with Tensor Networks."** _NeurIPS 2016_. Paper seminal.
- **Yoav Levine et al. — "Quantum Entanglement in Deep Learning Architectures."** _Phys. Rev. Lett._ 122 (2019). Conexiones profundas entre entanglement y expressivity de NNs.
- **Ewin Tang — "A quantum-inspired classical algorithm for recommendation systems."** [arXiv:1807.04271](https://arxiv.org/abs/1807.04271) (2018). El paper que inició la ola dequantized.

### Software

- [**TensorNetwork (Google)**](https://github.com/google/TensorNetwork) — Python, backend-agnostic (NumPy, TensorFlow, JAX, PyTorch).
- [**Quimb**](https://github.com/jcmgray/quimb) — Python, MPS/PEPS/general, muy maduro.
- [**ITensor**](https://itensor.org/) — Julia (y C++), referencia en simulación cuántica.
- [**TeNPy**](https://tenpy.readthedocs.io/) — Python, DMRG-focused.
- [**TensorLy**](http://tensorly.org/) — Python, decomposiciones clásicas (CP, Tucker, etc.).
- [**PyZX**](https://github.com/Quantomatic/pyzx) — ZX-calculus en Python.
- [**Tensorial**](https://github.com/SciML/SymbolicNumericIntegration.jl) (Julia) — Symbolic tensor manipulation.

### Conferencias, video, comunidad

- **QPL (Quantum Physics and Logic)** — Conferencia anual de CQM. Proceedings públicos.
- **ACT (Applied Category Theory)** — Conferencia anual. Tutoriales pedagógicos.
- **Tensor Networks YouTube channel** (varios) — playlists con tutoriales de Vidal, Verstraete, Cirac, etc.
- **Quantinuum (former Cambridge Quantum) YouTube** — Coecke da regularmente talks accesibles.
- **Bartosz Milewski's YouTube** — Series sobre category theory para programadores; tarde-en-la-vida tiene conferencias sobre profunctors, optics, ends/coends.

### Papers de frontera

- **Brian Swingle (2012). "Entanglement Renormalization and Holography."** _Phys. Rev. D_ 86: 065007. MERA ↔ AdS/CFT.
- **Pastawski, Yoshida, Harlow, Preskill (2015). "Holographic quantum error-correcting codes."** _JHEP_. Códigos cuánticos como geometría.
- **Hayden, Nezami, Qi, Thomas, Walter, Yang (2016). "Holographic duality from random tensor networks."** _JHEP_. Tensor networks como modelo de gravedad holográfica.

Estos últimos son lectura de capa más profunda; pero apuntan a un programa fascinante donde **estructura matemática (tensor networks) recupera estructura física (geometría espaciotemporal)**. Es una de las direcciones más bonitas de la física teórica moderna.

### Referencias cruzadas en esta documentación

- [./hypergraphs-foundations.md](./hypergraphs-foundations.md) — Hipergrafos como objeto formal; conexión con tensors vía rank.
- [./hypergraphs-and-cognition.md](./hypergraphs-and-cognition.md) — Por qué la cognición humana es higher-order y necesita esta matemática.
- [./quantum-and-hypergraphs.md](./quantum-and-hypergraphs.md) — Estructuras cuánticas e hipergrafos.
- [./declarative-db-as-ontology.md](./declarative-db-as-ontology.md) — El schema como compromiso ontológico.
- [./illegal-states-and-curry-howard.md](./illegal-states-and-curry-howard.md) — Tipos y enforcement.
- [./living-topology.md](./living-topology.md) — La topología como objeto vivo.
- [./epistemological-pattern.md](./epistemological-pattern.md) — Patrón epistemológico general de Huygens.
- [../03-data-model/topology-as-primary.md](../03-data-model/topology-as-primary.md) — Topología como primaria.
- [../03-data-model/relations-and-edges.md](../03-data-model/relations-and-edges.md) — Catálogo de relaciones.
