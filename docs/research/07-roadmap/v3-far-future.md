# v3 — far future: direcciones especulativas a 1-5 años

> Lo que Huygens podría llegar a ser si los datos acumulan, las tecnologías subyacentes maduran, y el Rubén del futuro sigue construyendo. No promesa, exploración. Cada bloque es un proyecto de investigación de varias semanas o meses por sí solo.

## v3.1 — Living ontology completo (Nivel 3)

El paso completo de la _living topology_ — del "el sistema propone, el humano aprueba" a "el sistema se auto-modifica con human-in-the-loop opcional". Ver [../06-theory/living-topology.md](../06-theory/living-topology.md) para el marco conceptual.

### Componentes

- **Algoritmo evolutivo sobre el schema** corriendo en background:
  - Población: variantes del schema actual con mutaciones (campos nuevos, edges nuevas, índices nuevos)
  - Fitness function compuesta: cobertura (% de queries cubiertas sin error) + latencia agregada + precisión semántica medida vía LLM-as-judge contra un set de "preguntas canónicas" del usuario
  - Selección: top-k variantes pasan a la siguiente generación
  - Cruce y mutación: combinar variantes, introducir cambios pequeños
- **Sandbox isolation**: cada variante se evalúa en una base SurrealDB clonada con datos sintéticos derivados del corpus real, sin tocar la BBDD de producción
- **Promoción**: cuando una variante mejora la fitness en >ε% durante N evaluaciones consecutivas, se propone al usuario. Si acepta, se promociona la variante al schema activo con migración automática

### Riesgos y mitigaciones

- **Drift sin sentido humano**: el algoritmo puede converger a schemas técnicamente óptimos pero conceptualmente raros. Mitigación: fitness function incluye un término de "interpretabilidad" medido vía LLM-as-judge
- **Coste computacional alto**: evaluar variantes es caro. Mitigación: correr el evolutivo en background a baja prioridad, una iteración por hora máximo
- **Pérdida de datos**: las migraciones automáticas pueden ser destructivas. Mitigación: backups inmutables antes de cada promoción, dry-run obligatorio

### Cuándo es viable

Cuando el corpus tenga >5000 notas y >12 meses de uso continuo, para que las métricas de fitness tengan señal real. Antes de eso, el evolutivo no tiene de qué alimentarse.

## v3.2 — TDA over personal memory

**Topological Data Analysis** aplicado al grafo de notas + edges + pillars.

### Pipeline

1. Construir el complejo simplicial a partir del grafo: nodos = Notes, edges = relaciones binarias, triángulos = ternas de notas co-ocurrentes (mismo project, misma sesión de captura, mismos pillars), tetraedros y orden superior cuando coactivación N-aria detectada
2. **Persistent homology**: calcular barcodes — features topológicas (componentes conexas, loops, voids) y su "vida" a través de la filtración
3. **Mapper algorithm**: visualización topológica del grafo agrupando regiones similares

### Insights extraíbles

- **Componentes conexas persistentes**: temas que llevan tiempo presentes en tu pensamiento, independientes entre sí
- **Loops (H1)**: estructuras circulares — "estoy dando vueltas sobre lo mismo sin avanzar"
- **Voids (H2+)**: huecos en tu pensamiento — zonas que tu memoria conoce parcialmente pero no completa
- **Barcode persistente**: visualización de qué patrones cognitivos son robustos (barras largas) vs ruido (barras cortas)

### Herramientas

- **Ripser** (más rápido, C++ con bindings Python)
- **Gudhi** (Python, completo)
- **scikit-tda** (alto nivel)
- **Mapper algorithm**: `kmapper` (Python)

### Output

Un dashboard mensual: "tu paisaje topológico de esta semana/mes". Markdown + plot.

### Pre-requisitos

Corpus de >2000 notas con buena densidad de edges. Sin eso, TDA produce ruido.

Detalle conceptual en [../06-theory/hypergraphs-and-cognition.md](../06-theory/hypergraphs-and-cognition.md).

## v3.3 — Tensor networks para compresión semántica

Aplicar **MERA / MPS** sobre la combinación embeddings + adyacencia para comprimir la representación de la memoria.

### Motivación

Cada nota tiene un embedding de 1024 dims. Si tienes 10k notas, son 10M flotantes. Más las relaciones, más los chunks: rápidamente el corpus es decenas de GB en RAM si quieres procesarlo todo. Tensor networks comprimen esto con error controlado vía bond dimension.

### Componentes

- **Tensor representation del corpus**: construir un tensor de rank alto `T[note, chunk, embedding_dim, pillar, type, time_bucket]` y descomponerlo en una MERA o MPS
- **Queries vía contracciones tensoriales**: en vez de "vector search exacto contra todos los chunks", contraer el tensor comprimido contra el embedding del query. Resultado aproximado pero mucho más rápido para corpora grandes
- **Knowledge graph completion**: usar la descomposición tensorial para predecir edges plausibles. Si el tensor de relaciones se factoriza limpiamente, las posiciones "vacías" con valores altos en la factorización son candidatos a edges faltantes

### Herramientas

- **Quimb** (Python, completo)
- **TensorNetwork** (Google, Python, integración con JAX)
- **ITensor** (Julia, el más optimizado)

### Cuándo es viable

Cuando el corpus pase de ~10k notas. Antes, el coste de la descomposición no compensa.

Detalle conceptual en [../06-theory/tensor-networks-and-category-theory.md](../06-theory/tensor-networks-and-category-theory.md) y conexión con cuántica en [../06-theory/quantum-and-hypergraphs.md](../06-theory/quantum-and-hypergraphs.md).

## v3.4 — Multi-agent A2A

Reemplazar el "un agente principal hace todo" por **agentes especializados** que cooperan.

### Roles

- **Agente principal (captura/clarificación)**: el que vive en el chat del día a día. Optimizado para latencia baja, contexto corto, decisiones rápidas. Modelo: Claude Sonnet 4.x
- **Sub-agente "weekly review writer"**: especializado en generar reports narrativos. Más tokens, más caro, mejor output. Solo se activa al pedirle un report. Modelo: Claude Opus o equivalente
- **Sub-agente "researcher"**: profundiza en temas que aparecen recurrentemente en las notas. Lee referencias externas (vía WebSearch), las cruza con el corpus interno, y propone síntesis. Modelo: Claude Opus + tool access a web
- **Sub-agente "schema evolution proposer"**: el que orquesta el flujo de v2.3/v3.1, analiza patterns y propone cambios. Modelo: Claude Sonnet
- **Sub-agente "memory curator"**: en background, identifica notas redundantes, propone fusiones, detecta orphans (notas sin edges). Modelo: Claude Haiku (suficiente, queremos volumen barato)

### Protocolo de comunicación

A2A (Agent-to-Agent) protocol o equivalente. Cada sub-agente expone su propio MCP server. El agente principal los invoca como tools.

### Trade-offs

- Pro: cada agente optimizado para su tarea, modelos del tamaño apropiado, paralelizable
- Contra: complejidad de orquestación, coste por agente, posibilidad de loops infinitos entre agentes

### Cuándo es viable

Cuando v2 esté maduro y los tools tradicionales lleguen a su techo. Si un solo agente con un MCP rico hace el 95% del trabajo, no compensa la complejidad de la orquestación multi-agente.

Detalle en [../02-architecture/mcp-composition-patterns.md](../02-architecture/mcp-composition-patterns.md).

## v3.5 — Quantum-inspired ML over the KG

Aplicar **métodos quantum-inspired clásicos** sobre el knowledge graph para tareas que el ML clásico hace mediocremente.

### Aplicaciones candidatas

- **Tensor decomposition de la matriz de adyacencia generalizada**: descomposiciones tipo Tucker, CP decomposition para detectar comunidades latentes en el grafo. Útil para encontrar "clusters cognitivos" del usuario
- **Knowledge graph completion vía quantum-inspired methods**: modelos como ComplEx, QuatE, RotatE — todos motivados por estructuras del álgebra que la mecánica cuántica usa (complejos, cuaterniones, rotaciones). Aplicables directamente con TensorFlow / PyTorch
- **Anomaly detection**: patterns inusuales en tu memoria — "esta semana has hablado de X mucho, pero X no se conecta con nada del resto de tu corpus, ¿está aislado por accidente?"

### Herramientas

- **PyKEEN** — KG embedding library con muchos modelos quantum-inspired incluidos
- **AmpliGraph** — alternativa
- **DGL-KE** — para escalar a grafos grandes
- **Cualquier framework que use PyTorch/JAX** con embeddings complejos

### Cuándo es viable

Cuando el corpus tenga estructura rica (>10k notas, >50k edges). Antes, los modelos quantum-inspired son sobre-ingeniería.

## v3.6 — Hypergraph proper (vía reificación heavy)

El modelo actual reifica relaciones n-arias mínimamente. En v3.6 se va más lejos: **episodios cognitivos enteros como hyperedges reificadas**.

### Concepto

Una "reunión" o "sesión de pensamiento" no es solo una serie de Notes con sus edges. Es un **evento hipergráfico** que conecta N participantes + un tópico + decisiones + ideas + bloqueos en una sola unidad cognitiva.

### Modelo

```surql
DEFINE TABLE episode SCHEMAFULL;
DEFINE FIELD title ON episode TYPE string;
DEFINE FIELD occurred_at ON episode TYPE datetime;
DEFINE FIELD duration_minutes ON episode TYPE option<int>;
DEFINE FIELD context ON episode TYPE option<string>;

DEFINE TABLE episode_role TYPE RELATION FROM episode TO note;
DEFINE FIELD role ON episode_role TYPE string;
-- role IN ['participant', 'topic', 'decision', 'idea', 'blocker', 'reference']
```

Un `episode` es una **hyperedge reificada** que une N notas con roles distintos. Es lo que en bases de datos relacionales llamarías "tabla de asociación con atributos", pero pensada explícitamente como un objeto cognitivo de primera clase.

### Tools

- **`capture_episode(title, participants[], topic, decisions[], blockers[]) → episodeId`** — crea el episodio y todas sus relaciones de un golpe
- **`episode_analysis(episodeId) → markdown`** — análisis narrativo: qué decisiones, qué bloqueos, qué se concluyó, qué quedó abierto
- **`episodes_around(noteId) → episode[]`** — todos los episodios donde una nota tiene rol

### Análisis derivados

- **TDA over episodes**: complejos simpliciales donde cada simplex es un episodio. Encontrar episodios "centrales" (alta conectividad simplicial) — momentos clave en tu pensamiento
- **Episode chains**: secuencias temporales de episodios sobre el mismo tema, narrativa evolutiva de una idea

## v3.7 — Auto-publishing

Detección de notas que están "listas para compartir" + pipeline a publicación.

### Componentes

- **Quality scorer**: LLM evalúa una nota contra criterios (coherencia, profundidad, originalidad). Score 0-100
- **PII detector**: regex + LLM + named entity recognition para detectar nombres propios, lugares, datos sensibles. Score 0-100 de "share-safety"
- **Tool `prepare_blog_post(noteIds: string[]) → markdown`** — ensambla un draft narrativo cohesivo a partir de N notas relacionadas. El draft incluye intro, desarrollo, conclusión, y referencias internas
- **Human review obligatorio**: nunca auto-publish sin la luz verde del usuario. La pipeline asiste, no decide
- **Publishing pipeline**: tras review, push a un repo Hugo/Astro/Eleventy estático con CI/CD a Cloudflare Pages o similar

### Privacidad

Por defecto **todo es privado**. Solo notas explícitamente marcadas `metadata.shareable = true` entran al pipeline de auto-publishing. Conservadurismo absoluto en este eje.

## v3.8 — Embedded distribution

Hacer Huygens **portable** sin Docker.

### Concepto

- **SurrealDB embebido**: SurrealDB tiene un modo `embedded` (RocksDB backend) que corre dentro del proceso, sin servidor TCP
- **Huygens MCP compilado a binario Bun único**: `bun build --compile` produce un binario ejecutable
- **Resultado**: `./huygens start` arranca todo, sin Docker, sin contenedor, sin compose
- **Sync vía Dropbox / iCloud / Syncthing**: el directorio de datos SurrealDB se sincroniza para multi-device single-user

### Trade-offs

- Pro: portabilidad total, instalación trivial
- Contra: pierdes la separación procesos del modelo cliente-servidor; los backups dependen de la sync; debugging del DB es más opaco

### Cuándo es viable

Cuando v1+v2 estén estables y la complejidad del despliegue actual se sienta excesiva para single-user. Posiblemente nunca si el devcontainer cumple su función.

## Lo más especulativo (v4+)

A más de 5 años, donde se vuelve genuinamente especulación:

### Brain-computer interfaces para captura directa

- Dispositivos tipo Neuralink (cuando existan y sean fiables) podrían capturar "thought streams" pre-verbalización
- Pipeline: BCI signal → STT/decoder → notas en el inbox
- Implicación: la fricción de "tengo que escribirlo" desaparece. La memoria captura literalmente la corriente de conciencia
- Riesgo evidente: si captura todo, captura ruido. El bottleneck pasaría a curation, no captura

### Reasoning agéntico full sin LLM

- Cuando el KG sea denso y bien estructurado, ciertos tipos de razonamiento podrían hacerse con **algoritmos simbólicos** sobre el grafo (path-finding, constraint propagation, traversals semánticos)
- Más rápidos, más deterministas, más baratos que llamar a un LLM para cada cosa
- LLM se reserva para tareas de generación natural; razonamiento estructurado se delega al motor simbólico
- Conexión con neuro-symbolic AI (Garcez, Lamb)

### Multi-Rubén: sub-personalidades

- Cuando la memoria llegue a ser densa (>50k notas, >5 años de uso), pueden coexistir varias "personas" coherentes en ella — el Rubén-ingeniero, el Rubén-filósofo, el Rubén-empresario
- Cada sub-persona tendría **perspective distinta sobre las mismas notas**
- Tool `view_as(persona: string)` que filtra/repondera el corpus según la lens elegida
- Filosóficamente interesante: ¿son sub-personas reales o artefactos de cómo el sistema agrupa? Probable híbrido — son patrones reales pero la división es construida

### Memoria compartida selectiva entre humanos

- Si un día Huygens tiene multi-usuario, no como SaaS sino como **memoria compartida selectiva entre humanos** (Rubén + pareja, Rubén + equipo de trabajo)
- Cada usuario tiene su corpus privado + zonas compartidas con permisos finos
- Edges cruzados entre corpora con consent explícito
- Mucho más cercano a "memoria colectiva" que a "Google Docs"

## Principio común a todo v3

**No optimizar para nada de v3 mientras se construye v1/v2**. Lo único que conviene tener en cuenta hoy es:

1. **Acumular topología bien estructurada**: cada nota bien clasificada, cada edge bien tipada, son datos de los que v3 podrá beneficiarse. Datos malformados ahora son deuda técnica permanente
2. **Mantener el schema extensible**: SurrealDB lo permite. No tomar decisiones que cierren puertas
3. **Documentar las decisiones de diseño**: este conjunto de archivos de research es esa documentación. El Rubén del futuro lo agradecerá cuando vuelva a leerlo

El resto se construye cuando los datos lo justifican y la tecnología lo permite.
