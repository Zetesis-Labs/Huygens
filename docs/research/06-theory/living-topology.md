# La topología viva: schemas que evolucionan

> "Como es declarativo, tú puedes alterar los edges dinámicamente. Podrías hacer algoritmos evolutivos que evalúen edges mejores."

## Tesis

El schema declarativo de SurrealDB es, técnicamente, **datos**. Las cláusulas `DEFINE TABLE`, `DEFINE FIELD`, `DEFINE INDEX` son ellas mismas información persistida que puede leerse y mutarse a runtime. Esto colapsa la distinción clásica entre **metadato** (la estructura) y **dato** (las filas) y abre una posibilidad inexplorada en la mayoría de aplicaciones: **la ontología como artefacto vivo**, que evoluciona con el uso, que se afina contra patrones reales, que aprende de su propio uso.

No es la ontología como verdad descubierta una vez y para siempre. Es la ontología como **organismo computacional**.

Este documento explora:

1. Tres niveles ascendentes de "topología viva" — desde auto-tuning trivial hasta evolución autónoma.
2. Por qué Huygens es un campo de prueba ideal para esta idea.
3. Riesgos honestos.
4. Conexiones filosóficas (autopoiesis, constructivismo).
5. Una propuesta concreta para Huygens v3.

---

## 1. Tres niveles de topología viva

La idea no es monolítica. Hay un gradiente — desde optimizaciones triviales que casi cualquier BBDD seria hace, hasta visiones de software auto-modificante que son tema activo de investigación.

### 1.1. Nivel 1 — Auto-tuning (riesgo bajo, valor alto, casi gratis)

El sistema observa qué fields y edges se filtran frecuentemente y materializa o indexa lo que el patrón de uso justifica.

Esto no es novedoso a nivel conceptual. PostgreSQL tiene `pg_stat_statements`, índices automáticos en versiones recientes (no por defecto), y la familia de _autonomic databases_ (AutoAdmin de Microsoft, Oracle Autonomous Database) lo lleva más lejos. Lo que cambia con SurrealDB es que **el schema mismo es manipulable como datos** — no necesitas reiniciar, no necesitas ALTER pesados; las definiciones se rehacen en milisegundos en muchos casos.

Loop concreto:

1. Logger de queries captura cada `SELECT` con su WHERE clause y latencia.
2. Heurística: si un field aparece en >N queries en M días con latencia media >L ms, crear índice.
3. `DEFINE INDEX` automático, observable, reversible.
4. Periódicamente, evaluar uso del índice; si baja del threshold, ofrecer `REMOVE INDEX`.

Esto es ortodoxo. No hay ningún componente especulativo. La aportación de SurrealDB es la **maleabilidad** del schema, que permite hacerlo sin downtime y con granularidad fina.

Para Huygens v1: este nivel se puede activar trivialmente. Logs ya existen; SurrealDB expone telemetría. Es **deuda técnica negativa**: hacerlo ahorra trabajo futuro, no añade.

### 1.2. Nivel 2 — Suggestion-mode (riesgo bajo, valor alto, requiere agente)

El agente observa patrones — no solo de queries, sino del **contenido semántico** de las notas — y **propone** modificaciones de schema al humano. Tú apruebas. El agente nunca actúa solo.

Esto es human-in-the-loop sobre la ontología. El agente hace de **motor de hipótesis**; tú haces de **selector**. Es selección artificial sobre la topología del sistema cognitivo.

Ejemplos plausibles de sugerencias:

- *"He visto el field `priority` en 47 notas de tipo Task dentro de `metadata`. ¿Lo promociono a field tipado en una sub-ontología `task_metadata` con `ASSERT $value BETWEEN 1 AND 5`?"*
- *"Has creado 23 edges `RELATED_TO` cuyo `reason` contiene frases como 'bloquea', 'depende de', 'impide'. ¿Especializo `RELATED_TO` en tres edges nuevos `BLOCKED_BY`, `DEPENDS_ON`, `BLOCKS`?"*
- *"El tipo `routine` no se ha usado en 6 meses. ¿Lo archivamos? ¿O introducimos un workflow diferente para rutinas?"*
- *"Las notas con `pillar=SOPHIA` se relacionan frecuentemente con notas `pillar=TELOS` mediante edges sin tipar. ¿Introduzco un edge `INFORMS` entre Sophia y Telos?"*

Cada sugerencia es **una hipótesis ontológica** sobre cómo refinar el modelo del mundo del usuario. Que tú apruebes o rechaces es **información de fitness** que el sistema puede internalizar.

Para Huygens v2: esto es el siguiente paso natural. El agente ya tiene visibilidad sobre los datos; añadirle capacidad de proponer cambios estructurales lo convierte de _operador_ del sistema en _co-arquitecto_.

### 1.3. Nivel 3 — Evolución autónoma (riesgo alto, valor alto, complejo)

Un algoritmo evolutivo evalúa variantes del schema contra una función de fitness y aplica las mejores. Aquí entramos en territorio especulativo, pero técnicamente coherente.

**Genotipo**: el DDL completo del schema. La lista de `DEFINE TABLE`, `DEFINE FIELD`, `DEFINE INDEX`, `DEFINE RELATION` con sus constraints, tipos, asserts. Es genuinamente un programa, y puede serializarse como una estructura de datos que la evolución manipule.

**Fenotipo**: el comportamiento observable del sistema con ese schema — latencia, cobertura, tasa de errores, calidad de respuestas del agente, conformidad de las inserciones.

**Fitness function**: combinación ponderada de métricas:

- **Cobertura de queries**: porcentaje de queries del agente que se responden sin error.
- **Latencia media** sobre traza histórica.
- **Tasa de errores de validación**: muchos errores = schema demasiado restrictivo; cero errores en mucho tiempo = schema demasiado permisivo (sospechoso).
- **Precisión semántica** estimada por LLM-as-judge sobre informes generados.
- **Estabilidad cognitiva del usuario** (variable subjetiva, pero capturable por feedback explícito).

**Mutaciones**:

- Añadir/quitar edge types.
- Promover fields del bag `metadata` a fields tipados (o democratizar).
- Endurecer/relajar `ASSERT`s.
- Añadir/quitar índices.
- Crear sub-tipos (split de una tabla en varias) o consolidar (merge).

**Crossover**: combinar partes de dos schemas. No trivial — combinar arbitrariamente puede generar incoherencias (un edge que apunte a una tabla inexistente, etc.). Necesita validación estructural post-crossover.

**Selección**: torneos. Cada generación, evaluar N variantes contra una traza fija de uso (replay del CHANGEFEED), retener las mejores. Población pequeña (10-20), generaciones lentas (no diarias — quizá una por mes).

Esto es **Genetic Programming aplicado al schema**. La literatura existe — Koza, _Genetic Programming_ (1992) — pero aplicada típicamente a árboles de expresiones, no a schemas de BBDDs. Aplicarla aquí es speculativo, pero el aparato matemático existe.

Para Huygens vN (no v2, no v3 — algo más lejano): este nivel es investigación. Puede no llegar a justificarse. Pero **es coherente**, lo cual es ya bastante.

---

## 2. Por qué Huygens es un campo de prueba ideal

Hay varias propiedades de Huygens que lo hacen especialmente adecuado para experimentar con topología viva — más que aplicaciones SaaS típicas.

### 2.1. Datos auditables y replayables

SurrealDB ofrece **CHANGEFEED** — un log estructurado de mutaciones que permite replayar la historia del sistema. Esto es oro para evolución: puedes evaluar un schema alternativo contra el histórico real del usuario, sin afectar al sistema en producción.

Workflow:

```surql
-- Snapshot del estado actual
SELECT * FROM note;

-- Replay sobre schema alternativo en una instancia paralela
-- Mide fitness
-- Decide si reemplazas
```

Esta capacidad de **replay determinista** es lo que hace que la evolución sea evaluable. Sin ella, comparar dos schemas requiere experimentos en producción, que son lentos y arriesgados.

### 2.2. Un único usuario, fitness clara

La mayoría de aplicaciones con miles de usuarios no pueden personalizar el schema por usuario — el coste organizacional es prohibitivo. Huygens tiene **un solo usuario**. Eso significa:

- La función de fitness eres tú. Tu feedback es la señal.
- No hay que reconciliar preferencias contradictorias.
- Los experimentos se evalúan contra una única trayectoria.

Esto es una propiedad muy poco común. Las BBDDs multitenant raramente pueden permitirse esto. Huygens sí.

### 2.3. Agente ya integrado como observador

Tienes un componente — el LLM — que ya está leyendo los datos, escribiendo sobre ellos, y razonando semánticamente. Es el **motor de hipótesis natural**. No hay que añadir un sub-sistema "schema observer" — el agente ya lo es.

Patterns concretos:

- El agente, al final de cada sesión, escribe un resumen reflexivo (que ya hace para generar reports).
- Una vez al día / semana, ese resumen incluye observaciones sobre la topología: "_he visto que las notas X, Y, Z usan field N en metadata, podría ser estructural_".
- Mensualmente, el agente compila propuestas formales de schema modification.

Esto convierte cada conversación en una **señal de fitness**. El agente no opera _sobre_ una topología fija; **es parte del sistema homeostático** que la mantiene afilada.

### 2.4. Escala humana, no industrial

Huygens, como memoria personal de un humano, tiene escala manejable: probablemente <100k notas en una década, <1M edges. Esto significa que **migraciones son rápidas**, **evaluaciones son baratas**, **experimentos son seguros**. Una migración que cambie un edge type tarda segundos, no horas.

La escala humana hace que la evolución del schema sea **operacionalmente viable**, no solo conceptualmente atractiva.

---

## 3. Riesgos honestos

Esta sección es importante porque las visiones de "software que evoluciona" tienden a ser glamourosas. No lo son sin pagar costes serios.

### 3.1. Migración de datos

Si el algoritmo evolutivo decide que el edge type `MOTIVATES` ya no aporta valor y lo elimina, ¿qué pasa con las 80 notas que lo usaron? Opciones:

- **Eliminar los edges**. Pérdida de información histórica.
- **Migrar a edge más genérico** (`RELATED_TO`). Pérdida de granularidad.
- **Preservar como edges legacy con flag `archived: true`**. Bagaje en el schema, complicación creciente.

Ninguna opción es indolora. Cada cambio estructural tiene **coste histórico** que el algoritmo de fitness debe sopesar. Esto significa: la fitness no es solo "qué tan bueno sería este schema desde cero" — es "qué tan bueno sería este schema **dado el histórico que ya existe**".

Esto convierte la evolución del schema en una optimización con **memoria** — más cercana a _online learning_ que a _offline search_.

### 3.2. Estabilidad cognitiva del usuario

El usuario tiene un modelo mental del sistema. Si la topología muta cada semana, **el modelo mental queda obsoleto**. Te conviertes en arqueólogo de tu propio sistema. Es una forma de _technical debt_ que la mayoría de proyectos no consideran.

Mitigaciones:

- **Cambios siempre human-in-the-loop**. Nunca evolución autónoma sin tu aprobación, al menos en v2/v3.
- **Cambios documentados narrativamente**. Cuando promueves `priority` de metadata a field tipado, el sistema escribe una entrada de bitácora explicando por qué.
- **Cooldown periods**. No más de un cambio mayor por mes, sin importar cuántas oportunidades detecte el algoritmo.
- **Rollback fácil**. Mantener historial del schema en formato versionado (`schema-2025-11-15.surql`), poder volver atrás en minutos.

### 3.3. Overfitting

El schema podría evolucionar a encajar perfectamente con los últimos 30 días de uso, pero ser frágil para los próximos 30. Esto es overfitting clásico. Mitigaciones:

- **Ventanas largas**. Evaluar fitness sobre 6-12 meses, no 30 días.
- **Cross-validation temporal**. Entrenar contra mes 1-9, evaluar contra mes 10-12.
- **Regularización ontológica**. Penalizar schemas con muchos tipos/edges/asserts. Preferir parsimonia (Occam: el modelo más simple que cubre los datos).
- **Conservar capacidades de "campo abierto"**. Mantener tipos genéricos (`RELATED_TO`, `note`) que admiten cosas no previstas. No eliminarlos solo porque uno más específico cubre la mayoría.

### 3.4. Coste de evaluación

Fitness con LLM-as-judge es **caro**. Si para evaluar un candidate schema tienes que regenerar 100 informes con LLM y compararlos, el coste por generación crece linealmente con el tamaño de la población y la profundidad de la evaluación. En extremo:

- Población de 20 variantes.
- 10 generaciones.
- 100 informes por evaluación.
- = 20,000 generaciones LLM por ciclo evolutivo.

Esto es caro incluso con modelos eficientes. Hay que ser pragmático: **evaluaciones aproximadas** (proxies cuantitativos) para la mayoría de comparaciones; LLM-as-judge solo para las comparaciones finales entre top-N candidatos.

### 3.5. El problema de la auto-referencia

Si el agente propone cambios al schema, y el agente vive en un contexto que conoce el schema, entonces **el agente está cambiando su propio entorno**. Esto es bonito filosóficamente — autopoiesis genuina — pero técnicamente delicado:

- ¿Cómo medir si una propuesta del agente _hizo mejor el sistema o mejor al agente_? (Goodhart's law: cualquier métrica suficientemente optimizada deja de ser una buena métrica.)
- ¿Cómo evitar que el agente proponga schemas que le faciliten _su_ trabajo pero empeoren la experiencia del usuario?
- ¿Cómo retener diversidad ontológica si el agente tiende a converger a representaciones que _él_ prefiere?

Estas son preguntas serias. No tienen respuesta cerrada en la literatura todavía. Una conclusión defendible: **mantener al humano en el loop de aprobación es la única protección sólida contra goodharting del schema**, al menos en horizontes prácticos.

---

## 4. Conexiones filosóficas

### 4.1. Autopoiesis (Maturana y Varela)

El concepto de **autopoiesis** fue acuñado por Humberto Maturana y Francisco Varela en los años 70 (publicado canónicamente en _Autopoiesis and Cognition: The Realization of the Living_, 1980). Definición:

> Un sistema autopoiético es una red de procesos que producen y mantienen los componentes que constituyen el propio sistema, y que demarca al sistema como una unidad distinguible de su entorno.

Originalmente, la noción era estrictamente biológica — Maturana y Varela la usaban para definir _qué es estar vivo_. Una célula es autopoiética: produce sus propias enzimas, mantiene su membrana, regenera sus componentes. Un cristal no — crece pero no se mantiene a sí mismo.

La extensión a sistemas cognitivos y sociales vino después (Luhmann, en sociología; Varela en _The Embodied Mind_). Y la extensión a software es controvertida pero atractiva: ¿puede un sistema computacional ser autopoiético?

Aplicado a Huygens: un sistema donde el agente observa el uso, propone modificaciones a la ontología, las aplica (con aprobación humana), y el resultado es un sistema que **se mantiene a sí mismo afilado** — esto **se parece** a autopoiesis funcional. No es vivo en el sentido biológico, pero sí en el sentido cibernético de Maturana: una red de procesos que produce y mantiene los componentes que la constituyen.

Esto da una lente nueva para diseñar Huygens: no como "una BBDD con un agente encima", sino como **un sistema cognitivo distribuido entre humano, agente, y substrato ontológico**, donde los tres se co-mantienen.

### 4.2. Constructivismo epistemológico

Glasersfeld, Piaget, y la línea constructivista de la epistemología argumentan que **el conocimiento no se descubre, se construye** en interacción con el entorno. No hay una "realidad objetiva" que el conocedor lee pasivamente — el conocedor genera modelos del mundo en respuesta a perturbaciones, y los ajusta cuando fallan.

Aplicado a Huygens: lo que sabes sobre tu propio mundo cognitivo no preexiste a tu interacción con el sistema. **Se construye al usar el sistema.** El schema no es una representación de tu mente — es una **herramienta para co-construirla**. Cada uso refina la herramienta; la herramienta refinada refina los usos siguientes; el resultado es un sistema cognitivo emergente.

Esta es una posición fuerte. Implica que Huygens **no es memoria** en sentido pasivo — es un **organismo cognitivo simbiótico**. Y la topología viva es lo que permite que el organismo crezca contigo.

### 4.3. Cibernética y Project Cybersyn

**Project Cybersyn** (1971-1973), liderado por Stafford Beer en el Chile de Allende, fue un intento pionero de aplicar cibernética a la gestión económica nacional. Su componente más famoso, **Cyberstride**, era un sistema de monitorización en tiempo real que **se reconfiguraba** según patrones detectados. La idea: un sistema de gestión que no es un programa fijo sino una **red adaptativa** que evoluciona con el contexto que gestiona.

Cybersyn fue interrumpido por el golpe de 1973, pero las ideas pervivieron. La línea de _self-adaptive software_ (DARPA invirtió pesadamente en los 2000s) y la teoría de sistemas reactivos heredan directamente. Papers como _"Self-Adaptive Software: Landscape and Research Challenges"_ (Salehie & Tahvildari, 2009) ofrecen un mapa actualizado.

La diferencia entre Cybersyn y Huygens: Cybersyn intentaba gestionar una economía nacional con tecnología de los 70. Huygens intenta gestionar **un cerebro** con tecnología de 2026 (LLMs + grafos declarativos + telemetría). La escala es 1:millones-de-veces más pequeña; las herramientas son órdenes de magnitud mejores. La idea es la misma.

### 4.4. Ontology learning y schema mining

Hay una línea formal en investigación de ingeniería del conocimiento llamada **ontology learning** — aprender ontologías automáticamente desde corpus, datos, o uso. Subcampos relevantes:

- **Inductive Logic Programming (ILP)**: aprender reglas lógicas desde ejemplos positivos y negativos. Tradición de Stephen Muggleton (papers desde los 90s).
- **Ontology Learning from Text**: extraer ontologías desde corpus de texto. Maedche & Staab (2001) y sucesores.
- **Knowledge Graph Completion (KGC)**: predecir edges faltantes en KGs. Familias: tensor decomposition (DistMult, ComplEx), embeddings (TransE, RotatE), GNN-based (R-GCN), text-augmented (KG-BERT).
- **Schema discovery / schema mining**: inferir schemas desde datos schemaless (Klettke et al. para document stores; varios para JSON/NoSQL).
- **Schema drift**: el problema de que los datos cambien shape sin que el schema lo refleje. Tema activo en data engineering moderna.

Para Huygens, dos subcampos son especialmente prometedores: **suggestion-mode** desde KGC y **schema discovery** desde el bag `metadata`. Ambos están suficientemente maduros para ser aplicables en 2026, no son investigación frontera.

### 4.5. Meta-learning con LLMs sobre topología

El approach más contemporáneo: usar el LLM mismo como motor de hipótesis sobre el grafo. El patrón emergente:

1. LLM lee `INFO FOR DB` (introspección del schema) + queries históricas + muestra de datos.
2. LLM produce propuestas de schema modification en lenguaje natural y/o DDL.
3. Validador (otro LLM, o humano, o SMT solver para constraints decidibles) aprueba/rechaza.
4. Lo aprobado se aplica.

Hay productos comerciales para Postgres que hacen esto (DBNew, AWS Aurora con recomendaciones, etc.). Para grafos / SurrealDB es nuevo territorio. Huygens podría ser uno de los primeros casos prácticos.

---

## 5. Una propuesta concreta para Huygens vN

Atando todo, una propuesta arquitectónica concreta. No es para v1. Es para cuando el sistema haya acumulado uso real (digamos 6-12 meses).

### 5.1. Servicio nocturno `huygens-evolve`

Un job que corre una vez por semana (más frecuente puede ser sobre-reactivo; menos frecuente puede perder ventana):

1. **Recopilar señal**.
   - Leer CHANGEFEED de los últimos 7-30 días.
   - Extraer queries fallidas, inserts rechazados, fields recurrentes en `metadata`, edges de tipo genérico (`RELATED_TO`) cuyo `reason` se parece a otros.
   - Métricas cuantitativas: latencias, frecuencias.

2. **Generar hipótesis**.
   - Plantilla de prompt al LLM con: `INFO FOR DB`, top-50 queries del periodo, anomalías detectadas.
   - LLM produce 5-10 propuestas de schema modification ranked por valor estimado.
   - Cada propuesta incluye: qué cambia, por qué (con datos), riesgos, migración asociada.

3. **Validar**.
   - Cada propuesta se valida sintácticamente (¿el DDL parsea?).
   - Se valida ontológicamente (¿no rompe referential integrity?).
   - Se replaya contra una copia del estado actual y la traza histórica para estimar fitness.

4. **Presentar al humano**.
   - Email matinal / página estática / nota en Huygens mismo.
   - Formato narrativo, no técnico: _"He visto que has creado 23 relaciones `RELATED_TO` con razones del tipo 'bloquea'. ¿Te gustaría que las re-tipemos como `BLOCKED_BY`? Esto requeriría migrar esos edges; tardaría 2 segundos; podemos revertirlo si no te gusta."_

5. **Aplicar lo aprobado**.
   - El humano (Rubén) marca aprobado / rechazado / pospuesto.
   - Los aprobados ejecutan: backup → DDL change → data migration → log.
   - Los rechazados se registran como señal negativa para futuras propuestas similares.

### 5.2. Tool MCP: `propose_schema_evolution`

El servicio expone una tool dentro del Huygens MCP:

```typescript
type SchemaProposal = {
  id: string;
  rationale: string; // narrativa
  ddl: string;       // SurrealQL para aplicar
  migration: string; // SurrealQL para migrar datos
  rollback: string;  // SurrealQL para revertir
  fitness_estimate: {
    coverage_delta: number;     // diferencia en cobertura
    latency_delta_ms: number;   // diferencia en latencia
    risk_level: 'low'|'med'|'high';
  };
  data_affected: number; // cuántas rows
};

// MCP tools
tools.propose_schema_evolution() → SchemaProposal[];
tools.apply_schema_proposal(id: string) → ApplyResult;
tools.reject_schema_proposal(id: string, reason?: string) → void;
```

Esto cierra el loop: el agente (en una conversación con Rubén) puede consultar propuestas pendientes, presentárselas en lenguaje natural, ejecutar la aprobada. La evolución no es "infrastructure" — es **parte de la conversación cognitiva**.

### 5.3. Bitácora ontológica

Cada cambio de schema produce una entrada en una colección `schema_history`:

```surql
DEFINE TABLE schema_history SCHEMAFULL;
DEFINE FIELD applied_at ON schema_history TYPE datetime;
DEFINE FIELD ddl ON schema_history TYPE string;
DEFINE FIELD rationale ON schema_history TYPE string;
DEFINE FIELD proposed_by ON schema_history TYPE string;  -- 'human' | 'agent:huygens-evolve'
DEFINE FIELD approved_by ON schema_history TYPE string;
DEFINE FIELD outcome ON schema_history TYPE option<string>;  -- review post-hoc
```

Esto convierte la evolución del sistema en un **objeto de estudio**. Puedes preguntar al sistema: _"¿qué cambios he aprobado en el último año? ¿qué propuestas rechacé? ¿se nota un patrón en mis rechazos?"_.

El sistema **conoce su propia historia ontológica**. Esto es, técnicamente, lo más cerca de autopoiesis genuina que puede estar un sistema software contemporáneo.

---

## 6. Para profundizar — Para el Rubén curioso del futuro

### Libros

- **_Autopoiesis and Cognition: The Realization of the Living_** — Maturana & Varela, 1980. Texto canónico, denso. Conviene leer primero _The Tree of Knowledge_.

- **_The Tree of Knowledge: The Biological Roots of Human Understanding_** — Maturana & Varela, 1987 (revisado 1998). Versión accesible, escrita para no-especialistas. Empezar aquí.

- **_The Embodied Mind: Cognitive Science and Human Experience_** — Varela, Thompson, Rosch, 1991 (revisado 2016). Extiende autopoiesis a la cognición humana con conexiones a fenomenología y budismo.

- **_Out of Control: The New Biology of Machines, Social Systems, and the Economic World_** — Kevin Kelly, 1994. Clásico de divulgación sobre sistemas que evolucionan. Capítulos sobre genetic algorithms y sistemas adaptativos.

- **_The Self-Made Tapestry: Pattern Formation in Nature_** — Philip Ball, 1999. Sobre patrones emergentes en sistemas auto-organizados.

- **_Genetic Programming: On the Programming of Computers by Means of Natural Selection_** — John Koza, 1992. Manual fundacional de programación genética.

- **_Cybernetics: Or Control and Communication in the Animal and the Machine_** — Norbert Wiener, 1948. Texto fundacional de la cibernética.

- **_Beer's Brain of the Firm_** — Stafford Beer, 1972. Sobre el Viable System Model — la teoría detrás de Cybersyn.

- **_Cybernetic Revolutionaries: Technology and Politics in Allende's Chile_** — Eden Medina, 2011. Historia rigurosa de Cybersyn.

- **_Programming the Universe_** — Seth Lloyd, 2006. Computación como sustrato natural; conecta con quantum + categorical theory.

### Papers y artículos

- **"Self-Adaptive Software: Landscape and Research Challenges"** — Salehie & Tahvildari, 2009. Survey panorámico del campo.

- **"Knowledge Graph Completion: A Survey"** — Wang et al., 2023. Estado del arte en KGC.

- **"A Survey on Knowledge Graphs: Representation, Acquisition, and Applications"** — Ji et al., 2022 (IEEE TNNLS). Más amplio que KGC.

- **"Learning Schemas for Document Stores"** — Klettke, Awolin, Storl, Hartmann, Scherzinger, 2017. Schema discovery aplicado.

- **"Ontology Learning from Text: An Overview"** — Maedche & Staab, 2001. Punto de partida del subcampo.

- **"Inductive Logic Programming: Theory and Methods"** — Muggleton & De Raedt, 1994.

- **"GraphRAG: A Knowledge Graph-Based Retrieval Augmented Generation"** — Edge et al., Microsoft Research, 2024.

- **"From Local to Global: A Graph RAG Approach to Query-Focused Summarization"** — Edge et al., 2024.

- **"HypE: Knowledge Hypergraph Embedding"** — Fatemi et al., 2020. Sobre KGC con relaciones n-arias.

- **"GETD: Generalizing Tensor Decomposition for N-ary Relational Knowledge Bases"** — Liu et al., 2020.

### Artículos sobre la teoría categorial subyacente

- **_Picturing Quantum Processes_** — Coecke & Kissinger, 2017. ZX-calculus y string diagrams. Conexión profunda entre teoría de categorías y procesos. Relacionado con `./quantum-and-hypergraphs.md`.

- **_Category Theory for Programmers_** — Bartosz Milewski. Categorías como base universal de estructura.

- **"Functorial Semantics of Algebraic Theories"** — F.W. Lawvere, 1963. Tesis fundacional de la teoría de categorías aplicada a semántica.

### Tools y sistemas para investigar

- **SurrealDB CHANGEFEED** — la primitiva clave para replay.
- **Apache Atlas, Apache Ranger** — metadata-as-data en data lakes (escala enterprise).
- **Datomic** — BBDD donde el schema es histórico-versionado por diseño.
- **dbt + Great Expectations** — el approach pragmático a "validar el schema" en data engineering.
- **OpenAI's Memory feature, Anthropic Memory** — caso de uso muy relacionado, aunque los detalles internos son opacos.

### Conexiones cruzadas

- `./declarative-db-as-ontology.md` — la ontología como artefacto formal (este documento extiende esa idea con evolución).
- `./illegal-states-and-curry-howard.md` — base lógica de los schemas; cuando los schemas evolucionan, evoluciona el sistema de axiomas.
- `./hypergraphs-foundations.md` — extensiones a relaciones n-arias y su impacto en evolución.
- `./epistemological-pattern.md` — el patrón epistemológico subyacente.
- `../03-data-model/topology-as-primary.md` — la topología como información primaria, base operacional.
- `../03-data-model/relations-and-edges.md` — vocabulario relacional concreto.
- `../03-data-model/self-critique.md` — limitaciones honestas del approach.
- `../04-database/surrealdb-deep-dive.md` — qué herramientas concretas ofrece SurrealDB para manipular schemas a runtime.
- `../04-database/surrealdb-innovations.md` — qué hace SurrealDB que enable esta visión.

---

## 7. Una nota cautelar y un cierre

Es importante terminar con una nota cautelar: **nada de esto está implementado**. El argumento de este documento es que **es coherente**, no que sea barato, fácil, o necesario para v1. Huygens v1 debe tener un schema sólido, estático, bien diseñado. Las ideas de evolución son para más tarde, cuando el sistema haya generado el histórico que permita evaluación sensata.

Pero el hecho de que sea coherente importa. Significa que el diseño de v1 puede **anticipar** este horizonte sin forzarlo. Específicamente:

- El schema debe ser introspectable (SurrealDB lo es).
- Las mutaciones deben ser auditables (CHANGEFEED activado por defecto).
- El bag `metadata: option<object>` es una **incubadora de futuros fields tipados**. No es solo flexibilidad — es el _hatchery ontológico_ donde nacen las próximas categorías formales.
- Los edges genéricos (`RELATED_TO`) son la **incubadora de futuros edges especializados**.

Diseñar v1 con esta intuición no cuesta nada. Y deja el camino abierto a que el sistema, en su madurez, **co-evolucione con su usuario** — no como ciencia ficción, sino como ingeniería rigurosa apoyada en literatura existente.

Esa es la promesa profunda de la topología viva: que la BBDD deje de ser una herramienta inerte que tienes y empiece a ser un **órgano cognitivo** que cuidas. No es viva en sentido biológico. Es viva en sentido cibernético, autopoiético, constructivista. Y para una memoria personal estratégica, esa es probablemente la forma correcta de estar viva.
