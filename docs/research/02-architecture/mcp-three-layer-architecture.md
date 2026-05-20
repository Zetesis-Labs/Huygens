# Arquitectura MCP en tres capas

> Cómo se reparte la lógica entre el agente, el MCP oficial de SurrealDB, y el MCP custom de Huygens. La pregunta central es **dónde vive el dominio**.

## El problema

Imagina una operación cotidiana: "captura esta nota de voz transcrita".

Eso implica:

1. Crear un nodo `Note` con `state=INBOX`, `typeId=null`, `pillars=[]`.
2. Persistir el markdown como `content`.
3. Trocear el contenido en `NoteChunk` records.
4. Calcular embeddings con BGE-M3 vía DeepInfra para cada chunk.
5. Escribir los chunks como records relacionados al `Note`.
6. Devolver el ID al agente.

¿Dónde vive ese pipeline? Más profundo: ¿dónde vive **el conocimiento de que existe** "INBOX", "Pilar", "NoteType"? ¿Y la regla de que `BLOCKED_BY` solo va de Task a Task? ¿Y la decisión de cuándo crear un edge `REFERENCES` versus dejarlo solo en el texto?

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

- **Cada operación gasta tokens del agente**. Una captura simple requiere generar una query `CREATE note CONTENT { … } RETURN id` en cada llamada. El prompt necesita enseñar el dialecto SurrealQL al agente, mantenerlo actualizado, y la salida es prolija. Para volúmenes altos (muchas capturas al día), esto se nota en latencia y dinero.
- **Operaciones que NO son CRUD se quedan fuera**. El agente no puede calcular un embedding (no tiene API a DeepInfra, no debería tenerla — eso es ejecución, no razonamiento). Tampoco puede chunkear markdown de forma determinista. Sería razonable que sí pudiera, pero la salida sería: el agente genera un script TS, lo ejecuta el agente vía otra tool, escribe los resultados… frágil.
- **El dominio queda implícito en el prompt**. Cada vez. El agente reescribe la query, en vez de tener una operación `capture_note(markdown)` que ya esconde la mecánica.

**Veredicto**: este path tiene sentido como **MVP exploratorio** ("¿podemos hablar con SurrealDB desde el agente?"), pero no como arquitectura final. La fricción por operación es alta y las ops de infraestructura no caben.

## Path B — Huygens MCP custom completo

**La forma**: un MCP en TypeScript escrito por nosotros que envuelve **todo**: capture, classify, search, generate_report, embed, chunk, link, unlink, list, etc.

```
Agente ──tools de alto nivel──▶ Huygens MCP ──▶ SurrealDB
```

**Pros**:

- Ergonomía máxima. El agente llama `capture("texto")`, `classify(noteId, pillars=[…])`, `search("…", filters=…)`. Cada tool tiene una descripción clara y un schema validado.
- Lógica de dominio centralizada y testeable. Si cambia la regla de qué pilares son válidos, se cambia en un sitio.
- Tokens mínimos por operación. El agente no genera SurrealQL — solo argumentos JSON estructurados.

**Contras**:

- **Semanas de código antes de validar nada**. Capturar es fácil; clasificar requiere decidir qué interfaz exponer ("qué argumentos opcionales", "cómo se actualizan los pilars sin tocar el resto", "qué errores son recuperables"); search vectorial requiere diseñar la API de filtros; generate_report requiere haber decidido el formato del reporte... todo eso se construye **antes** de saber si el sistema funciona.
- **Cada tool nueva es código que mantener**. Cuando aparezca un caso de uso nuevo, hay que decidir: ¿añadimos tool o el agente compone? La tentación de "una tool para todo" infla la superficie del servidor.
- **Cambios al modelo requieren cambios al MCP**. Si añadimos un edge `INSPIRED_BY` mañana, hay que añadir tools `inspire(from, to)` y `remove_inspiration(...)` o exponer un `relate(type, from, to)` genérico — y si lo hacemos genérico, ¿no estábamos huyendo de eso?

**Veredicto**: óptimo en estabilidad, costoso en exploración. Apropiado cuando el dominio está cerrado y maduro. Huygens **no** está ahí — el modelo está en evolución activa.

## Path C — Híbrido (la elección)

**La forma**: tres capas con responsabilidades distintas.

- **Agente** carga la **semántica de dominio** en su prompt. Sabe qué es un Pilar, conoce los tipos de edge autorizados, entiende el lifecycle GTD, decide cuándo asignar `typeId='project'` versus `typeId='task'`.
- **surrealmcp** (oficial) expone CRUD genérico + RELATE + query para operaciones de grafo cotidianas. El agente lo usa para escribir/leer/relacionar nodos y edges.
- **Huygens MCP** (custom, pequeño, ~200 líneas TS) expone solo operaciones de **infraestructura** que requieren código, no prompting.

Los dos MCPs son **hermanos**, no padre-hijo. El agente los compone llamando a cada uno según necesite.

### Diagrama

```
                ┌──────────────────────────────┐
                │           Agent              │
                │  (prompt = semántica GTD,    │
                │   pilares, edges autorizados)│
                └───┬──────────────────────┬───┘
                    │                      │
                    │ ops grafo + CRUD     │ ops de infraestructura
                    │ (capture, relate,    │ (embed, chunk, search,
                    │  query, classify)    │  report)
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
| `index_note` | `(noteId: string) → { chunks: number }` | Lee la note, chunkea, embed-ea cada chunk, escribe los `NoteChunk` records, devuelve el conteo. Orquestación pura. |
| `vector_search` | `(query: string, filters?: Filters, limit?: number) → NoteChunk[]` | Embed-ea la query, lanza `SELECT … FROM NoteChunk … vector::distance::cosine(embedding, $q) …` (SurrealDB's vector index nativo), devuelve resultados con metadata. Requiere driver, no se delega al agente. |
| `generate_weekly_report` | `(periodStart: Date, periodEnd: Date) → string` | Recopila notas del período, las agrupa por pilar/estado, formatea markdown según plantilla. Mezcla query + format, pero el formato es estable. |

Nota: `index_note` y `vector_search` podrían descomponerse en pasos más finos, pero la composición es siempre la misma y exponerla descompuesta forzaría al agente a orquestar mecánicamente. Mejor un tool de orquestación.

### Tools que NO viven en Huygens MCP

Cosas que la tentación pide meter, pero pertenecen al agente o al surrealmcp:

- `capture_note(text)` — esto es solo `CREATE note CONTENT { content: text, state: 'INBOX' }`. Una línea SurrealQL. Al agente.
- `classify_note(id, pillars, typeId)` — un `UPDATE note:id SET pillars = $pillars, typeId = $typeId, state = 'CLARIFIED'`. Al agente.
- `link_notes(from, to, kind)` — un `RELATE from→edge_kind→to`. Al agente.
- `decide_pillars(text) → Pillar[]` — esto es **razonamiento**. Es exactamente lo que el LLM hace bien. No es una tool, es la inferencia del modelo.

### Por qué Huygens MCP NO usa surrealmcp por dentro

Tentación natural: que el Huygens MCP llame al surrealmcp para sus operaciones internas (en vez de hablar con SurrealDB directamente). Sería composición elegante en el papel.

En la práctica, no:

1. **Capa innecesaria**. Pasar de Huygens MCP → JSON-RPC → surrealmcp → SurrealDB añade un hop sin valor. El driver `surrealdb` de JS habla directo con el motor.
2. **Dependencia frágil**. surrealmcp es un proceso aparte, con su propio ciclo de vida, posibles cambios de API breaking. Acoplarse a él por dentro mete fragilidad.
3. **Eficiencia**. El driver JS soporta transacciones, prepared statements, conexiones persistentes. JSON-RPC sobre HTTP no es igual de eficiente para operaciones intensivas (un `index_note` puede hacer 50 escrituras).
4. **Son hermanos, no padre-hijo**. Conceptualmente, surrealmcp y Huygens MCP exponen **caras distintas** del mismo sistema al agente. No hay una jerarquía donde uno envuelve al otro. El agente decide a quién llamar.

## Responsabilidades por capa

| Capa | Responsable de | NO responsable de |
|---|---|---|
| **Agente** | Semántica de dominio, decisiones ambiguas, redacción de notas/reports, decidir qué edges crear, clasificación a pilares, escribir SurrealQL para CRUD/RELATE | Validar estructura del schema, calcular embeddings, paralelizar I/O, chunkear texto |
| **surrealmcp** | Exponer SurrealDB al protocolo MCP (CRUD, RELATE, SELECT, transactions) | Conocer la lógica de Huygens específica (qué es un Pilar, qué edges son legales) |
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

- **Si una operación se repite mucho en el agente y siempre toma muchos pasos idénticos**: candidata a convertirse en tool en Huygens MCP. Si cada vez que el agente captura una nota larga genera la misma secuencia de `CREATE` + `RELATE` + queries, conviene una tool `capture_with_classification(text, hints) → { noteId, suggestedPillars }`.
- **Si una operación necesita razonamiento ambiguo**: dejar en el agente. Clasificar una nota a un pilar no es determinista — depende del contenido.
- **Si una operación es determinista y mecánica**: tool en Huygens MCP. Vector search, embedding, formato de reporte semanal.
- **Si una operación es CRUD/RELATE de pocos pasos**: dejar al agente con surrealmcp.

Regla práctica: **una tool de Huygens MCP se justifica si esconde >1 llamada a DeepInfra/SurrealDB y/o lógica TS no trivial**. Si solo envuelve una query simple, no aporta sobre surrealmcp.

## Anti-patrones

- **Tools que hacen razonamiento por nosotros**: una tool `classify_note_automatically(noteId)` que internamente llama a un LLM es mezcla de responsabilidades. El razonamiento es del agente, no del MCP. Si en el futuro necesitamos clasificación batch en background, eso será un job, no una tool.
- **Tools genéricas tipo `execute_query(sql)`**: si ya tenemos surrealmcp, una tool así duplica. Si la queremos para auth/filtrado, mejor un proxy MCP explícito (ver [./mcp-composition-patterns.md](./mcp-composition-patterns.md)).
- **Tools por convenience**: cada tool nueva es 50 líneas de código + docs + tests. Si solo se va a usar dos veces al mes, dejar al agente componer.

## Detalle de implementación: stateless

Tanto surrealmcp como Huygens MCP corren en modo stateless (`sessionIdGenerator: undefined`). El estado vive en SurrealDB. Esto significa:

- Cualquier petición es self-contained
- No hay "sesión de captura abierta"
- Escalado horizontal trivial si llega el caso
- Testing simple (cada test es una request)

Cuando una operación necesita atomicidad (e.g., `index_note` debe escribir todos los chunks o ninguno), se usa una transacción de SurrealDB dentro de la tool, no estado de sesión MCP.

## Para profundizar

- [Composición MCP y A2A](./mcp-composition-patterns.md) — qué otras formas hay y por qué no las usamos
- [SurrealDB deep dive](../04-database/surrealdb-deep-dive.md) — el motor detrás de surrealmcp
- [surrealmcp](../04-database/surrealmcp.md) — el servidor oficial en detalle
- [DeepInfra integration](../05-embeddings-vector/deepinfra-integration.md) — la HTTP API que usa `embed_text`
- [Topología como modelo primario](../03-data-model/topology-as-primary.md) — por qué edges schemafull son el cimiento
