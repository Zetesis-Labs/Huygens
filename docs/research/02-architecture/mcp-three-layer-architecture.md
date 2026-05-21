# Arquitectura MCP en tres capas

> Cómo se reparte la lógica entre el agente, el MCP oficial de SurrealDB, y el MCP custom de Huygens. La pregunta central es **dónde vive el dominio**.

## El problema

Imagina una operación cotidiana del modelo actual: el agente captura una conversación, sintetiza un informe a partir del raw, y un worker topologiza ese informe en mutaciones del grafo.

Eso implica varias clases distintas de trabajo: razonamiento de dominio (qué tipo es algo, qué edges crear), operaciones de grafo (CREATE/UPDATE/RELATE en SurrealDB) y operaciones código-pesadas (embedding HTTP, chunking determinista, vector search, prompting al LLM con contexto recuperado).

¿Dónde vive cada uno? Más profundo: ¿dónde vive **el conocimiento del dominio** (taxonomía de tipos, qué edges semánticos están autorizados, la regla de que el worker solo aplica lo que el informe ya dice)? ¿Y las operaciones que requieren código TS, retry, API keys?

Hay tres respuestas posibles. Cada una optimiza por algo distinto.

## Path A — Solo surrealmcp oficial

**La forma**: el agente solo tiene acceso al servidor MCP oficial de SurrealDB. Para cualquier operación, el agente escribe SurrealQL directamente.

```
Agente ──SurrealQL──▶ surrealmcp ──▶ SurrealDB
```

**Pros**:

- Cero código en Huygens. El stack es: BBDD + servidor MCP oficial. Setup en minutos.
- Toda la potencia de SurrealQL queda expuesta — joins en graph, RELATE, transactions.
- Una sola fuente de bug surface: el servidor oficial.

**Contras**:

- **Cada operación gasta tokens del agente**. Cada `capture` o `generate_report` requiere generar SurrealQL en cada llamada. El prompt necesita enseñar el dialecto al agente, mantenerlo actualizado, y la salida es prolija. Para volúmenes altos, esto se nota en latencia y dinero.
- **Operaciones que NO son CRUD se quedan fuera**. El agente no puede calcular un embedding (no tiene API a DeepInfra, no debería tenerla — eso es ejecución, no razonamiento). Tampoco puede chunkear markdown de forma determinista, ni armar el prompt de síntesis con los informes cercanos. Sería razonable que sí pudiera, pero la salida sería: el agente genera un script TS, lo ejecuta vía otra tool, escribe los resultados… frágil.
- **El dominio queda implícito en el prompt**. Cada vez. El agente reescribe la query, en vez de tener una operación `capture(content, source_kind)` o `generate_report(raw_id, k_nearby)` que ya esconde la mecánica.

**Veredicto**: este path tiene sentido como **MVP exploratorio** ("¿podemos hablar con SurrealDB desde el agente?"), pero no como arquitectura final. La fricción por operación es alta y las ops de infraestructura no caben.

## Path B — Huygens MCP custom completo

**La forma**: un MCP en TypeScript escrito por nosotros que envuelve **todo**: capture, classify, search, generate_report, embed, chunk, link, unlink, list, etc.

```
Agente ──tools de alto nivel──▶ Huygens MCP ──▶ SurrealDB
```

**Pros**:

- Ergonomía máxima. El agente llama `capture("texto")`, `generate_report(rawId)`, `search("…", filters=…)`. Cada tool tiene una descripción clara y un schema validado.
- Lógica de dominio centralizada y testeable. Si cambia la forma de construir el prompt de síntesis o las reglas de qué edges emite el worker al topologizar, se cambia en un sitio.
- Tokens mínimos por operación. El agente no genera SurrealQL — solo argumentos JSON estructurados.

**Contras**:

- **Semanas de código antes de validar nada**. Capturar es fácil; sintetizar requiere decidir qué interfaz exponer (cómo se parametriza `k_nearby`, qué hace `generate_report` cuando no hay informes previos cercanos, qué errores son recuperables); search vectorial requiere diseñar la API de filtros; topologizar requiere haber decidido el formato de las mutaciones... todo eso se construye **antes** de saber si el sistema funciona.
- **Cada tool nueva es código que mantener**. Cuando aparezca un caso de uso nuevo, hay que decidir: ¿añadimos tool o el agente compone? La tentación de "una tool para todo" infla la superficie del servidor.
- **Cambios al modelo requieren cambios al MCP**. Si añadimos un edge `INSPIRED_BY` mañana, hay que añadir tools `inspire(from, to)` y `remove_inspiration(...)` o exponer un `relate(type, from, to)` genérico — y si lo hacemos genérico, ¿no estábamos huyendo de eso?

**Veredicto**: óptimo en estabilidad, costoso en exploración. Apropiado cuando el dominio está cerrado y maduro. Huygens **no** está ahí — el modelo está en evolución activa.

## Path C — Híbrido (la elección)

**La forma**: tres capas con responsabilidades distintas.

- **Agente** carga la **semántica de dominio** en su prompt. Conoce las tres fases del flujo (captura, síntesis, topologización), la taxonomía de tipos, los edges autorizados, y decide cuándo disparar `generate_report`.
- **surrealmcp** (oficial) expone CRUD genérico + RELATE + query para operaciones de grafo cotidianas. El agente y el worker lo usan para escribir/leer/relacionar nodos y edges.
- **Huygens MCP** (custom, pequeño) expone las operaciones de **infraestructura** y orquestación que requieren código, no prompting (capture, embed, chunk, vector_search, generate_report, get_report).

Los dos MCPs son **hermanos**, no padre-hijo. El agente los compone llamando a cada uno según necesite.

### Diagrama

```
                ┌──────────────────────────────┐
                │           Agent              │
                │  (prompt = fases del flujo,  │
                │   taxonomía, edges autorizados)│
                └───┬──────────────────────┬───┘
                    │                      │
                    │ ops grafo + CRUD     │ ops de infraestructura
                    │ (RELATE, query,      │ (capture, embed, chunk,
                    │  updates)            │  search, generate_report)
                    ▼                      ▼
            ┌───────────────┐       ┌──────────────────┐
            │  surrealmcp   │       │   Huygens MCP    │
            │  (oficial)    │       │   (TS, pequeño)  │
            └───────┬───────┘       └────────┬─────────┘
                    │                        │
                    │ SurrealQL              │ JS driver SurrealDB +
                    │                        │ DeepInfra HTTP
                    ▼                        ▼
            ┌──────────────────────────────────────────┐
            │              SurrealDB                   │
            └──────────────────────────────────────────┘
```

### Tools que vive en Huygens MCP

La lista es deliberadamente corta. Solo lo que **requiere código** y **no es razonamiento**:

| Tool | Firma | Por qué aquí |
|---|---|---|
| `embed_text` | `(text: string) → number[1024]` | Llamada HTTP a DeepInfra. Necesita API key, retry, batching. Determinista. |
| `chunk_markdown` | `(text: string, size?: number, overlap?: number) → string[]` | Algoritmo de chunking semántico (header-aware, párrafo-aware). Determinista, no es razonamiento. |
| `capture` | `(content: string, source_kind: string, source_ref?: string) → { raw_id }` | Inserta un `raw_capture` inmutable. Wrapper trivial pero conveniente. |
| `vector_search` | `(query: string, filters?: Filters, limit?: number) → Block[]` | Embed-ea la query, lanza `SELECT … FROM block WHERE embedding <\|k\|> $q …` (HNSW nativo en SurrealDB), devuelve los blocks con metadata. Requiere driver, no se delega al agente. |
| `generate_report` | `(raw_id: string, k_nearby?: number) → { report_id }` | Carga el raw, hace vector_search sobre informes existentes (top-k), arma el prompt con raw + informes cercanos, llama al LLM, crea `note(type=report)` + blocks + `derived_from` + `based_on`. Orquestación con LLM dentro. |
| `get_report` | `(report_id: string, include_neighborhood?: bool) → ReportPayload` | Devuelve el informe rehidratado (blocks en orden) + opcionalmente el subgrafo cercano. Lo consume el worker al topologizar. |

Nota: `generate_report` mezcla query + LLM + escritura. Podría descomponerse, pero el agente nunca lo ejecutaría paso a paso — siempre los compone juntos. Mejor un tool de orquestación.

### Tools que NO viven en Huygens MCP

Cosas que la tentación pide meter, pero pertenecen al agente o al surrealmcp:

- `update_note_state(id, state)` — un `UPDATE note:id SET state = $state`. Al agente o al worker vía surrealmcp.
- `link_notes(from, to, kind)` — un `RELATE from→edge_kind→to`. Al agente / worker vía surrealmcp.
- `decide_mutations(report) → Mutation[]` — esto es **razonamiento** (lo hace el worker llamando al LLM con el informe + subgrafo). No es una tool del MCP, es la inferencia del modelo dentro del worker.

### Por qué Huygens MCP NO usa surrealmcp por dentro

Tentación natural: que el Huygens MCP llame al surrealmcp para sus operaciones internas (en vez de hablar con SurrealDB directamente). Sería composición elegante en el papel.

En la práctica, no:

1. **Capa innecesaria**. Pasar de Huygens MCP → JSON-RPC → surrealmcp → SurrealDB añade un hop sin valor. El driver `surrealdb` de JS habla directo con el motor.
2. **Dependencia frágil**. surrealmcp es un proceso aparte, con su propio ciclo de vida, posibles cambios de API breaking. Acoplarse a él por dentro mete fragilidad.
3. **Eficiencia**. El driver JS soporta transacciones, prepared statements, conexiones persistentes. JSON-RPC sobre HTTP no es igual de eficiente para operaciones intensivas (un `generate_report` puede hacer decenas de escrituras: blocks, edges, etc.).
4. **Son hermanos, no padre-hijo**. Conceptualmente, surrealmcp y Huygens MCP exponen **caras distintas** del mismo sistema al agente. No hay una jerarquía donde uno envuelve al otro. El agente decide a quién llamar.

## Responsabilidades por capa

| Capa | Responsable de | NO responsable de |
|---|---|---|
| **Agente** | Semántica de dominio, decisiones ambiguas, decidir cuándo capturar y cuándo disparar `generate_report`, redacción cuando hace falta, escribir SurrealQL para CRUD/RELATE | Validar estructura del schema, calcular embeddings, paralelizar I/O, chunkear texto |
| **surrealmcp** | Exponer SurrealDB al protocolo MCP (CRUD, RELATE, SELECT, transactions) | Conocer la lógica de Huygens específica (qué edges son legales, formato del informe) |
| **Huygens MCP** | Operaciones que requieren código TS: embeddings, chunking, vector search, generación de reportes | Operaciones de grafo o CRUD básicas (eso es surrealmcp) |
| **SurrealDB** | Persistencia, enforcement de schema (FROM/TO en edges), queries, índices vectoriales, transacciones | Embeddings, chunking, lógica de aplicación |

El _enforcement_ está en la BBDD. Si el agente intenta hacer un edge ilegal (`RELATE person→BLOCKED_BY→task` cuando `BLOCKED_BY` solo existe entre tasks), SurrealDB rechaza la operación. Esto es lo que permite tener la lógica de dominio **en el prompt** sin temor a corrupción: la BBDD es el guardián último.

## Por qué este reparto

El agente como **capa semántica**, surrealmcp como **adaptador genérico** al motor, Huygens MCP como **biblioteca de operaciones código-pesadas**. Cada capa optimiza por algo diferente:

- **Tokens**: el agente solo gasta los necesarios para razonar, no para reinventar primitivas mecánicas
- **Latencia**: las ops mecánicas no requieren round-trips al LLM
- **Determinismo**: las cosas que deben pasar exactamente igual cada vez (chunking, embedding, formato de reporte) están en código TS
- **Flexibilidad**: las cosas que dependen de criterio (qué pilar es relevante, qué edges crear) están en el prompt — cambiar el prompt es barato

## Cuándo evolucionar a otra arquitectura

Esta arquitectura no es definitiva. Heurísticas para mover responsabilidades:

- **Si una operación se repite mucho en el agente y siempre toma muchos pasos idénticos**: candidata a convertirse en tool en Huygens MCP. Si la síntesis de un informe requiere siempre la misma secuencia (load raw → vector_search → prompt → write blocks → edges), conviene una tool `generate_report` que esconda la mecánica.
- **Si una operación necesita razonamiento ambiguo**: dejar en el agente. Decidir cuándo cerrar la captura y disparar la síntesis no es determinista — depende de cómo va la conversación.
- **Si una operación es determinista y mecánica**: tool en Huygens MCP. Vector search, embedding, chunking.
- **Si una operación es CRUD/RELATE de pocos pasos**: dejar al agente con surrealmcp.

Regla práctica: **una tool de Huygens MCP se justifica si esconde >1 llamada a DeepInfra/SurrealDB y/o lógica TS no trivial**. Si solo envuelve una query simple, no aporta sobre surrealmcp.

## Anti-patrones

- **Tools que hacen razonamiento opaco por nosotros**: una tool `classify_note_automatically(noteId)` que internamente llama a un LLM sin contexto explícito es mezcla de responsabilidades. El razonamiento de dominio vive en el agente conversacional (síntesis) y en el worker (topologización), no como tools laterales del MCP. `generate_report` es la excepción consciente — sí llama al LLM, pero su prompt y output están bien definidos por el modelo.
- **Tools genéricas tipo `execute_query(sql)`**: si ya tenemos surrealmcp, una tool así duplica. Si la queremos para auth/filtrado, mejor un proxy MCP explícito (ver [./mcp-composition-patterns.md](./mcp-composition-patterns.md)).
- **Tools por convenience**: cada tool nueva es 50 líneas de código + docs + tests. Si solo se va a usar dos veces al mes, dejar al agente componer.

## Detalle de implementación: stateless

Tanto surrealmcp como Huygens MCP corren en modo stateless (`sessionIdGenerator: undefined`). El estado vive en SurrealDB. Esto significa:

- Cualquier petición es self-contained
- No hay "sesión de captura abierta"
- Escalado horizontal trivial si llega el caso
- Testing simple (cada test es una request)

Cuando una operación necesita atomicidad (e.g., `generate_report` debe escribir los blocks + el note + los edges `derived_from` y `based_on` o ninguno), se usa una transacción de SurrealDB dentro de la tool, no estado de sesión MCP.

## Para profundizar

- [Composición MCP y A2A](./mcp-composition-patterns.md) — qué otras formas hay y por qué no las usamos
- [SurrealDB deep dive](../04-database/surrealdb-deep-dive.md) — el motor detrás de surrealmcp
- [surrealmcp](../04-database/surrealmcp.md) — el servidor oficial en detalle
- [DeepInfra integration](../05-embeddings-vector/deepinfra-integration.md) — la HTTP API que usa `embed_text`
- [Topología como modelo primario](../03-data-model/topology-as-primary.md) — por qué edges schemafull son el cimiento
