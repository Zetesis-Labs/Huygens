# Patrones de composición: MCPs y A2A

> Qué patrones existen para componer MCPs entre sí, qué es Agent-to-Agent (A2A), y por qué Huygens elige el caso más simple. Documento derivado de la pregunta original "¿puedes hacer composición de un MCP que use otro? O A2A donde un agente hable con otro a través de un MCP?".

## Respuesta corta

Sí, ambas son técnicamente posibles y existen patrones consolidados.

Para Huygens elegimos **ninguna**: un solo agente principal con la lógica de dominio en su prompt, llamando directamente a dos MCPs **hermanos** (surrealmcp oficial + Huygens MCP custom). Sin sub-agentes. Sin un MCP envolviendo a otro.

La razón es regla heurística: **lo que parece sofisticado suele ser sobreingeniería cuando las operaciones son deterministas**. Reservamos la composición para cuando la complejidad lo justifique.

## Patrón 1 — MCP composition (MCP-as-client-of-MCP)

### Qué es

Un MCP server puede actuar simultáneamente como **server** (expone tools al agente) y como **client** (consume tools de otro MCP). El SDK oficial soporta ambos roles.

```
Agente ──▶ MCP_A ──▶ MCP_B ──▶ recurso
              │       │
              │       └─ MCP_B no sabe que está siendo envuelto
              └─ MCP_A puede filtrar, traducir, agregar auth
```

### Usos típicos

- **Gateway / proxy**: MCP_A expone un subconjunto filtrado de las tools de MCP_B (e.g., quita las destructivas)
- **Auth wrapping**: MCP_A añade un check de autorización antes de delegar a MCP_B (útil cuando MCP_B no tiene noción de usuarios)
- **Traducción de parámetros**: MCP_A normaliza schemas distintos de varios MCP_B hacia un schema único
- **Composición de varios backends**: MCP_A reúne datos de MCP_B y MCP_C en una sola respuesta

### Cuándo aporta

Cuando MCP_B es **externo** (no controlado por nosotros) y queremos filtrar superficie expuesta, añadir lógica transversal (auth, rate limit, logging) sin tocar MCP_B, o versionar una API estable mientras MCP_B evoluciona.

### Por qué Huygens NO lo usa

Huygens tiene **dos MCPs** hermanos (surrealmcp + Huygens MCP). La tentación natural es que Huygens MCP llame internamente a surrealmcp en vez de hablar con SurrealDB directamente. Sería composición artificial:

| Aspecto | Driver `surrealdb` directo | Vía surrealmcp |
|---|---|---|
| Latencia | Una conexión | Dos hops (JSON-RPC + SurrealDB protocol) |
| Eficiencia | Pool de conexiones, transactions | Transport efímero por llamada |
| Acoplamiento | Solo al motor | A motor + versión del MCP oficial |

El driver directo es eficiente, robusto y oficial. Por eso son **hermanos**, no padre-hijo: cada uno habla con el motor por la vía más directa.

## Patrón 2 — A2A (Agent-to-Agent)

### Qué es

Un agente "principal" invoca a otro agente como si fuera una tool. El sub-agente tiene **su propio contexto** (no hereda el del principal), **su propio prompt** (especializado), y **su propio juego de tools**. Devuelve un resultado al principal, que sigue su flujo.

```
Agente principal
     │
     │ invoca con un prompt acotado
     ▼
Sub-agente especializado (code-reviewer, translator, researcher, …)
     │
     │ usa sus propias tools
     ▼
Resultado devuelto al principal
```

A2A puede implementarse de varias formas:

- **Como sub-proceso del agente principal** (e.g., Claude Code's `Task` tool, OpenAI Assistants API anidados)
- **Como llamada a otra instancia LLM** (con su propio system prompt)
- **A través de un MCP intermediario** que exponga al sub-agente como tool

### Cuándo aporta

- **Especialización profunda**: el sub-agente sabe algo que el principal no necesita saber siempre (e.g., reglas de un dominio jurídico, sintaxis de un lenguaje raro)
- **Aislamiento de contexto**: el sub-agente trabaja con su propio scratchpad y no contamina el contexto del principal
- **Reuso a través de equipos**: un sub-agente "translator" puede ser invocado desde cualquier flujo

### Cuándo NO aporta

- Cuando la operación es **determinista** — un round-trip de LLM cuesta tokens y latencia
- Cuando el dominio cabe en el prompt del principal — el sub-agente sería el mismo modelo con otro prompt
- Cuando hay que mantener consistencia compartida — coordinar dos agentes con visión parcial es más frágil que un agente con visión completa

### Por qué Huygens NO lo usa

El agente principal tiene **todo el dominio** en su prompt:

- Los NoteType seedeados (task, project, area, routine, note, report, person, reference, objetivo, idea) y cuándo elegir cada uno
- Edges autorizados y semántica (`blocked_by`, `mentions`, `part_of`, `derived_from`, `based_on`, `affects`)
- Reglas de captura (todo entra como `raw_capture` inmutable)

Eso cabe en ~2000 tokens de system prompt. No hay razón para partirlo en sub-agentes. Las operaciones son **bien definidas**: capturar, buscar, generar informe. No hay un sub-dominio que requiera prompt especializado.

A2A reaparecería si introdujésemos un "weekly review writer" especializado, un "reference linker" para documentos externos, o un sub-agente de "voz a estructura" — pero todas esas operaciones siguen cabiendo en el agente principal hoy. Si el dominio crece a varias sub-áreas con prompts incompatibles, se reabre la conversación.

## Comparativa

| Patrón | Coste tokens | Determinismo | Cuándo |
|---|---|---|---|
| **Single agent + multiple MCPs** (Huygens) | Bajo | Alto (DB enforces) | Cuando el dominio cabe en un prompt y las ops son bien definidas |
| **MCP composition** | Bajo | Alto | Cuando necesitas envolver un MCP externo para filtrar, auth, traducir |
| **A2A** | Alto (n × LLM rounds) | Variable | Cuando necesitas razonamiento especializado en un sub-dominio |
| **Multi-agent orchestration** | Muy alto | Variable | Workflows complejos multi-step con roles claramente distintos (planner + executor + reviewer) |

Notas a la tabla:

- "Coste tokens" se mide por operación de usuario. Un round-trip LLM extra es 1-10k tokens dependiendo de cuánto contexto se pase.
- "Determinismo" mide cuán predecible es el resultado. Las DBs y el código TS son deterministas; los LLMs no lo son.
- Los patrones se pueden mezclar: nada impide tener un agente principal + un sub-agente + MCPs hermanos. La cuestión es cuándo justificarlo.

## El insight clave

> **El agente como "capa de dominio" SIN sub-agentes adicionales es lo más limpio si las operaciones son bien definidas.**

Lo que parece sofisticado (A2A, MCPs anidados, orchestración) suele ser **sobreingeniería** cuando las ops son deterministas. Cada capa nueva:

- Suma tokens (si es agente)
- Suma latencia (si es proceso)
- Suma superficie de bug
- Suma código que mantener
- Disuelve responsabilidad ("¿quién decide X?" se vuelve menos obvio)

La progresión natural es:

1. **Empezar con single agent + tools**. Validar que el modelo de dominio funciona.
2. **Si el prompt se infla** (>4k tokens, contradicciones internas, prompt-engineering difícil): considerar A2A.
3. **Si una operación se repite en muchos flujos** y siempre con la misma lógica: convertirla en tool.
4. **Si una tool externa requiere policy** (auth, filtrado, rate limit): considerar MCP composition.

Huygens está en el paso 1. Probablemente esté ahí mucho tiempo: el dominio es pequeño (un solo usuario, una sola memoria) y deliberadamente concentrado.

## Anti-patrones

Cosas que tentaban y se descartaron:

### "Crear un sub-agente solo para ser modular"

Modularidad ≠ sub-agentes. Si quiero modularidad, hago tools. Un sub-agente solo se justifica si tiene su propio prompt sustancialmente distinto del principal. Si vas a usar el mismo modelo con un prompt parecido, no es modular — es overhead.

### "Mezclar dominio en MCP y en agente"

Si el MCP "sabe" qué es un Pilar y el agente también, hay dos fuentes de verdad. Cuando cambies la definición, una de las dos quedará desactualizada. Regla: **el dominio vive en una sola capa**. En Huygens, vive en el prompt del agente. El MCP es código mecánico (chunking, embedding, vector search) que no decide nada sobre dominio.

### "MCP wrap MCP cuando un driver directo funciona"

Si la única razón para envolver MCP_B con MCP_A es "queda más uniforme", no la hay. La uniformidad arquitectónica no es un fin — es un medio para reducir complejidad. Si añadirla aumenta complejidad, deja de ser uniformidad.

### "Pre-orchestar workflows que pueden ser tools"

A veces se diseña un orquestador multi-agente para algo que es realmente una secuencia determinista de operaciones. Si la lógica es "primero A, luego B, luego C, siempre", no necesitas un planner LLM — necesitas una función.

## Referencias del ecosistema (para investigación posterior)

- **MCP server SDK** (TypeScript): https://github.com/modelcontextprotocol/typescript-sdk — el SDK soporta server y client en el mismo proceso
- **Claude `Task` tool** — el mecanismo A2A nativo de Claude Code
- **CrewAI, LangGraph, AutoGen** — frameworks que asumen multi-agente como punto de partida (el otro extremo del espectro)

## Conclusión

Para Huygens: **un solo agente** con dominio completo en el prompt, **dos MCPs hermanos** sin composición interna entre ellos, **sin sub-agentes** hasta que el dominio lo justifique. Es el setup más simple que resuelve el problema real.

## Para profundizar

- [Arquitectura MCP en tres capas](./mcp-three-layer-architecture.md) — la elección concreta de capas en Huygens
- [Decisiones de stack](./stack-decisions.md) — el contexto técnico general
- [Topología como modelo primario](../03-data-model/topology-as-primary.md) — por qué el dominio cabe en un prompt (la BBDD enforza, el agente solo razona)
