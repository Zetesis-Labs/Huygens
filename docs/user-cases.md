# Huygens — Casos de uso y flujos

Mapa exhaustivo de quién hace qué en Huygens, con visualizaciones de los flujos principales. Este doc es la fotografía actual del sistema — cuando cambien las cosas, se actualiza aquí.

---

## 1. Actores

```mermaid
flowchart LR
    user([Rubén])
    conv[Claude Code<br/>agente conversacional]
    worker[huygens-worker<br/>agente autónomo]
    mcp[huygens-mcp<br/>13 tools + 2 resources + 3 prompts]
    db[(SurrealDB v3<br/>HNSW · CHANGEFEED 10y)]

    user -->|"chat (captura, consulta, review)"| conv
    conv -->|"tools / prompts / resources"| mcp
    worker -->|"tools (find_related, commit_clarify, index_block) + prompts"| mcp
    worker -->|"poll inbox · emit events"| db
    mcp -->|"reads / writes"| db
```

| actor | rol | responsabilidad |
|---|---|---|
| **Usuario** | originador | captura raws, decide acciones, gobierna el sistema |
| **Agente conversacional** (Claude Code) | facilitador | traduce intención del usuario a tool calls; carga prompts del MCP para entrar en modos |
| **Worker autónomo** (Agno + GPT-4o-mini) | procesador | clarifica el inbox autónomamente, sin intervención |
| **MCP server** | superficie | expone tools, lore, prompts canónicos |
| **SurrealDB** | sustrato | persiste todo · audita todo |

---

## 2. Casos de uso por actor

### 2.1 Usuario (vía agente conversacional)

#### Captura
- **Capturar un pensamiento crudo** — "captura: mañana cita con el dentista a las 10 y revisar el contrato del cliente antes del viernes"
- **Capturar una idea generativa** — "idea: aplicar functores aplicativos al sistema de queries"
- **Capturar transcripción de voz** — input pegado desde transcriptor
- **Capturar referencia externa** — URL/libro/paper

#### Consulta sobre estado actual
- **¿Qué tengo pendiente?** → `list_inbox` (raws sin procesar)
- **¿Qué hay para hoy?** → `list_mits_for_date(today)`
- **¿Qué tasks activos tengo?** → `list_notes_by_type(task, [ACTIVE, CLARIFIED])`
- **¿Qué proyectos llevo en marcha?** → `list_notes_by_type(project, [ACTIVE])`
- **¿Qué ideas tengo CLARIFIED sin promover?** → `list_notes_by_type(idea, [CLARIFIED])`

#### Búsqueda / recall semántico
- **¿Qué dije sobre X?** → `vector_search(query=X)`
- **Dame contexto relacionado con esta idea** → `find_related(query)`
- **Detalle de un raw** — "muéstrame raw_capture:abc" → `get_raw(id)`

#### Acción sobre notas existentes
- **Mover de estado** ("ya está hecho", "esto se bloqueó") → `update_note_state`
- **Iniciar trabajo en algo** (CLARIFIED → ACTIVE) → `update_note_state`
- **Archivar lote viejo** — bucle de `update_note_state` con state=ARCHIVED

#### Síntesis / report
- **Genera un report de esta semana** → `generate_report(period, persist=true)`
- **Genera un report sobre un objetivo concreto** → `generate_report(note_ids=[...])`
- **Solo dame el markdown sin persistir** → `generate_report(persist=false)`

#### Modos estructurados (cargan un prompt del MCP)
- **Morning planning** — agente carga `prompts/morning-planning`
- **Weekly review** — agente carga `prompts/weekly-review`
- **(futuro)** reflection, inbox-zero, planning-session

### 2.2 Worker autónomo

Una sola misión. No decide cuándo trabajar — siempre que haya cola.

- **Polling del inbox** cada 2s — fetch `raw_capture WHERE processed_at IS NONE`
- **Claim** — emite `raw_claimed` event, marca en `seen_processed` (in-memory)
- **Pre-fetch RAG** — llama `find_related(raw_content)` para evitar duplicación
- **Clarify (cognición)** — Agno + GPT-4o-mini produce `Decomposition` Pydantic
- **Commit** — llama `commit_clarify_via_mcp` (atómico, idempotente)
- **Index** — llama `index_block_via_mcp` para los blocks creados
- **Resilencia ante RAW_ALREADY_PROCESSED** — silent success, marca seen

### 2.3 Modos del agente conversacional — qué hace cada uno

Cada modo es un prompt del MCP. Cuando el usuario solicita el modo (o el agente lo infiere), se carga ese prompt como context.

```mermaid
flowchart TB
    user([Usuario])
    user -->|"captura: X"| capture["Captura libre<br/>(sin modo)"]
    user -->|"buenos días, qué tengo hoy"| morning["Morning planning"]
    user -->|"vamos a revisar la semana"| weekly["Weekly review"]
    user -->|"¿qué dije sobre X?"| search["Búsqueda / recall"]
    user -->|"genera un report"| report["Síntesis"]

    capture -->|"capture(text)"| inbox[(inbox)]
    morning -->|"list_mits + list_inbox<br/>+ discutir + update_state"| kg[(grafo)]
    weekly -->|"inventory + triage<br/>+ generate_report + review note"| graph
    search -->|"vector_search + find_related"| graph
    report -->|"generate_report"| graph
```

| modo | prompt | qué hace |
|---|---|---|
| Captura libre | (ninguno) | un solo turno: capturar y devolver |
| Morning planning | `morning-planning` | surface MITs + inbox · discutir realismo · decidir EL UNO · transiciones |
| Weekly review | `weekly-review` | inventario · triaje WAITING/SOMEDAY · generar report · próximo commit |
| Búsqueda | (ninguno) | recall semántico ad-hoc |
| Síntesis | (ninguno) | generar narrativa sobre un periodo o un grupo |
| **Reflection** (futuro) | `reflection` | resurfar nota vieja, cuestionar coherencia |
| **Inbox zero** (futuro) | `inbox-zero` | procesar el inbox manualmente (cuando worker falló) |

---

## 3. Flujos principales (sequence diagrams)

### 3.1 Captura → procesamiento autónomo

```mermaid
sequenceDiagram
    participant U as Usuario
    participant C as Claude Code
    participant M as huygens-mcp
    participant DB as SurrealDB
    participant W as huygens-worker
    participant O as OpenAI

    U->>C: "captura: mañana fisio + revisar Govoy"
    C->>M: capture(content, source_kind=chat)
    M->>DB: INSERT raw_capture
    M->>DB: emit agent_event(raw_received)
    M-->>C: { raw_id }
    C-->>U: "capturado raw:abc"

    Note over W: ~2s después · poll loop

    W->>DB: SELECT raw_capture WHERE processed_at IS NONE
    DB-->>W: [raw:abc]
    W->>DB: emit agent_event(raw_claimed)
    W->>M: find_related(raw_content)
    M->>DB: HNSW search
    M-->>W: 0 candidates (corpus vacío)
    W->>M: get_prompt(clarify-system)
    M-->>W: <prompt markdown>
    W->>O: chat completion (system=prompt, user=raw+candidates)
    O-->>W: Decomposition (2 notes, 2 blocks)
    W->>M: commit_clarify(decomposition)
    M->>DB: CREATE note×2 + block×2 + derived_from×2 + mark processed_at
    M->>DB: emit commit_succeeded
    M-->>W: { notes_created, blocks_created }
    W->>M: index_block(blocks_created)
    M->>O: embeddings (DeepInfra BGE-M3)
    O-->>M: vectors
    M->>DB: UPDATE block SET embedding
    M-->>W: ok
```

### 3.2 Weekly review (modo conversacional)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant C as Claude Code
    participant M as huygens-mcp
    participant O as OpenAI (via M)

    U->>C: "vamos a hacer la weekly review"
    C->>M: get_prompt(weekly-review)
    M-->>C: <prompt: inventario · triaje · report · commit>

    Note over C: Entra en modo review

    C->>M: list_inbox()
    C->>M: list_notes_by_type(task, [ACTIVE])
    C->>M: list_notes_by_type(task, [WAITING])
    C->>M: list_notes_by_type(project, [ACTIVE])
    M-->>C: estado actual

    C-->>U: "tienes 6 tasks ACTIVE, 2 WAITING desde hace >7d..."
    U-->>C: (discusión turn-by-turn)

    loop por cada decisión
        C->>M: update_note_state(note_id, new_state, reason)
    end

    C->>M: generate_report(period=last_week, persist=true)
    M->>O: chat completion (narrative)
    O-->>M: markdown
    M->>M: chunk + persist note(type=report) + about edges + index_block
    M-->>C: { report_id, report_block_ids }

    C->>M: capture("compromiso siguiente semana: X") [si emergió]
    C-->>U: "review completa. report:def. commitment capturado."

    Note over M: (propuesto) C->>M: commit_clarify(review note) · type=review · about edges → todo lo tocado
```

### 3.3 Búsqueda semántica simple

```mermaid
sequenceDiagram
    participant U as Usuario
    participant C as Claude Code
    participant M as huygens-mcp
    participant DI as DeepInfra
    participant DB as SurrealDB

    U->>C: "¿qué tengo sobre functores aplicativos?"
    C->>M: vector_search(query="functores aplicativos", k=10)
    M->>DI: embed(query)
    DI-->>M: vector (1024 dims)
    M->>DB: HNSW <\|K,EF\|>
    DB-->>M: blocks ordenados por distancia
    M-->>C: hits con score, title, snippet
    C-->>U: presenta jerarquía narrativa
```

---

## 4. Ciclo de vida de un pensamiento

```mermaid
stateDiagram-v2
    [*] --> Raw: capture(text)

    state "Plano 1: Evidencia" as P1 {
        Raw: raw_capture<br/>processed_at = NONE
    }

    Raw --> CLARIFIED: worker · clarify + commit

    state "Plano 2: Interpretación" as P2 {
        CLARIFIED --> ACTIVE: empezar trabajo
        CLARIFIED --> SOMEDAY: posponer
        CLARIFIED --> ARCHIVED: descartar
        ACTIVE --> WAITING: bloqueado
        ACTIVE --> DONE: completado
        ACTIVE --> SOMEDAY: pausar
        WAITING --> ACTIVE: desbloqueado
        WAITING --> SOMEDAY: deja de importar
        SOMEDAY --> ACTIVE: reanimar
        DONE --> ARCHIVED: clean-up review
        SOMEDAY --> ARCHIVED: clean-up review
    }

    ARCHIVED --> [*]
```

Cualquier nota puede saltar a cualquier estado en cualquier momento — la máquina de estados es **canónica, no enforcada** por el schema. Las transiciones "no canónicas" (DONE → ACTIVE = reabrir) están permitidas técnicamente.

---

## 5. Topología del grafo

```mermaid
flowchart LR
    raw[(raw_capture)]
    note[note]
    block[block]
    nt[note_type]
    report[note · type=report]
    review[note · type=review]
    event[(agent_event)]

    note -->|derived_from| raw
    block -->|note ref| note
    note -->|block_order| block
    note -->|type| nt
    note -->|mentions/supports/refutes/part_of/blocked_by/authored_by| note
    report -->|about| note
    review -->|about| note
    review -->|about| report

    event -.->|subject| raw
    event -.->|subject| note
```

**Edges narrativos (note↔note)**: `mentions`, `supports`, `refutes`, `part_of`, `blocked_by`, `about`, `authored_by`.
**Edge de procedencia (cross-plane)**: `derived_from`.

---

## 6. Mapeo modo ↔ tools del MCP

```mermaid
flowchart LR
    subgraph mcp[huygens-mcp · 13 tools + 3 prompts]
        direction TB
        t_cap[capture]
        t_li[list_inbox]
        t_gr[get_raw]
        t_cc[commit_clarify]
        t_cm[chunk_markdown]
        t_et[embed_text]
        t_ib[index_block]
        t_vs[vector_search]
        t_fr[find_related]
        t_uns[update_note_state]
        t_lm[list_mits_for_date]
        t_lt[list_notes_by_type]
        t_gn[generate_report]
        p_cs((clarify-system))
        p_mp((morning-planning))
        p_wr((weekly-review))
    end

    worker[worker] --> p_cs
    worker --> t_fr
    worker --> t_cc
    worker --> t_ib

    user_capture[modo: captura libre] --> t_cap
    user_search[modo: búsqueda] --> t_vs
    user_search --> t_fr

    morning[modo: morning] --> p_mp
    morning --> t_lm
    morning --> t_li
    morning --> t_lt
    morning --> t_uns
    morning --> t_cap

    weekly[modo: weekly review] --> p_wr
    weekly --> t_li
    weekly --> t_lt
    weekly --> t_uns
    weekly --> t_gn
    weekly --> t_cc

    report_mode[modo: síntesis] --> t_gn
```

---

## 7. Lo que NO está cubierto (y necesita decisión)

- **Modo reflection**: resurfar nota vieja, cuestionar si sigue siendo cierta. Sin prompt aún.
- **Modo inbox-zero**: procesar inbox manualmente cuando el worker falló o quieres control. Sin prompt aún.
- **`note · type=review` como entidad propia**: hoy un weekly-review produce un `report`, pero la SESIÓN no se representa en grafo. Propuesta en discusión.
- **`refine_report(report_id, instruction)`**: AI regenera un report manteniendo id + edges. No existe.
- **Backup / export del corpus**: el SurrealDB volume es el único sitio.
- **Logging implícito** (feedback infrastructure): `note_accessed`, `search_result_consumed`, `clarify_corrected` no se emiten. Sin esto, los planes de "Huygens aprende mi criterio" tienen cold-start eterno.

Ver `docs/architecture/ideas/` para las ideas parqueadas asociadas.

---

## 8. Resumen ejecutivo en una frase

> El **usuario** captura intención cruda → el **worker** la interpreta autónomamente al grafo tipado → el **agente conversacional** ayuda al usuario a navegar, decidir y sintetizar usando los mismos tools que el worker.

Los tres actores comparten el mismo MCP. El MCP lleva la verdad de qué se puede hacer (tools), cómo está estructurado el grafo (resources de LORE), y cómo "ser" un agente Huygens en distintos modos (prompts).
