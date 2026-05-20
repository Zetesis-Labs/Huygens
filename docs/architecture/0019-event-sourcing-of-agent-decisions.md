# ADR-0019: Event sourcing de las decisiones agénticas

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: architecture, agent, data-model

## Context

Con la introducción del worker autónomo (ADR-0018), el agente toma decisiones interpretativas sobre `raw_capture`s **sin supervisión humana en tiempo real**: clasifica, segmenta en blocks, propone edges, decide cuándo se rinde y pide revisión. Este modo de operar abre un problema operativo grave: ¿cómo se audita, depura y mejora un sistema cuyas decisiones críticas pasan por una caja negra LLM?

Preguntas concretas que queremos poder responder en cualquier momento:

- "¿Por qué el worker clasificó este raw como Task y no Project?"
- "¿En qué % de capturas el worker se rinde y pide revisión humana?"
- "¿Cómo evoluciona la confidence media con el tiempo?"
- "¿Cuánto cuesta procesar el inbox cada mes?"
- "Tras cambiar el system prompt v3 → v4, ¿mejoró el needs_review rate?"

Sin trazabilidad estructurada, estas preguntas son inrespondibles más allá de impresiones subjetivas. Logs textuales no son queryables; integraciones externas (OpenTelemetry, Logfire) mezclan dominio con observabilidad de infra y dejan el reasoning fuera del grafo de conocimiento — incoherente con ADR-0008 (topología como primaria).

## Decision

Implementar **event sourcing de las decisiones agénticas** vía una nueva tabla `agent_event`. Cada decisión del worker (y del agente conversacional cuando aplique) emite un evento estructurado con metadata completa — kind, actor, session, subject involucrado, payload, confidence, reasoning summary, modelo, tokens, duración.

Schema completo:

```surql
DEFINE TABLE OVERWRITE agent_event SCHEMAFULL;
DEFINE FIELD kind ON agent_event TYPE string
  ASSERT $value INSIDE [
    'raw_received', 'raw_claimed',
    'analysis_started', 'related_context_fetched',
    'decomposition_proposed', 'human_review_requested',
    'commit_attempted', 'commit_succeeded', 'commit_failed',
    'worker_yielded'
  ];
DEFINE FIELD actor ON agent_event TYPE string
  ASSERT $value INSIDE ['worker', 'conversational', 'user', 'system'];
DEFINE FIELD session_id ON agent_event TYPE string;
DEFINE FIELD subject ON agent_event TYPE option<record>;
DEFINE FIELD payload ON agent_event TYPE option<object>;
DEFINE FIELD confidence ON agent_event TYPE option<float>
  ASSERT $value IS NONE OR ($value >= 0 AND $value <= 1);
DEFINE FIELD reasoning_summary ON agent_event TYPE option<string>;
DEFINE FIELD model ON agent_event TYPE option<string>;
DEFINE FIELD tokens_used ON agent_event TYPE option<object>;
DEFINE FIELD duration_ms ON agent_event TYPE option<int>;
DEFINE FIELD created_at ON agent_event TYPE datetime DEFAULT time::now() READONLY;

DEFINE INDEX agent_event_kind_time ON agent_event FIELDS kind, created_at;
DEFINE INDEX agent_event_session   ON agent_event FIELDS session_id;
DEFINE INDEX agent_event_subject   ON agent_event FIELDS subject;
DEFINE INDEX agent_event_actor     ON agent_event FIELDS actor;
```

**Detalles clave de la decisión**:

1. **Una tabla polimórfica, no una por kind**. `kind` + `payload: option<object>`. Las queries más interesantes cruzan kinds (e.g. "sesiones que terminaron en `commit_succeeded` tras pasar por `human_review_requested`"), y una tabla por evento haría esos JOINs incómodos.
2. **`session_id` con UUIDv7**: ordenable temporalmente, único, agrupable. Lo genera quien inicia el procesamiento (worker al picar un raw; conversacional al iniciar una conversación con el usuario).
3. **Retention ilimitado por ahora**. Volumen estimado: 10–100 eventos/raw × 10–50 raws/día × 365 = 36k–1.8M eventos/año. Manejable indefinidamente.
4. **Worker y conversacional emiten al mismo schema**, distinto `actor`. Permite comparar performance entre ambos modos de operar.
5. **`subject: option<record>`** acepta cualquier tipo de record (raw_capture, note, block, edge) sin necesidad de union explícita — SurrealDB lo trata como record genérico.

Eventos típicos durante un clarify del worker:

```
session_id: 01933e8f-...

T+0    raw_claimed             subject=raw_capture:xyz   actor=worker
T+50   analysis_started        subject=raw_capture:xyz   model=claude-opus-4-7
T+1200 related_context_fetched payload={matches_count: 3, top_score: 0.82}
T+8400 decomposition_proposed  confidence=0.88
                               payload={notes_count: 3, edges_count: 5}
                               tokens_used={input: 4200, output: 1100}
                               reasoning_summary="3 intents distintos detectados..."
T+8500 commit_attempted
T+8650 commit_succeeded        payload={notes_ids: [...], edges_ids: [...]}
```

## Consequences

**Positivas**:

- Auditabilidad completa de decisiones autónomas: cada paso queda registrado con su contexto
- Debugging trivial vía `session_id` — reconstruir un flujo entero es una query
- Analytics nativas en SurrealQL (tasa de needs_review, distribución de confidence, coste mensual, latencias) — ver bloque en Notes
- A/B testing de prompts y modelos viable: comparar dos prompts es agregar por `model` o por ventana temporal
- Coherente con ADR-0008: los eventos también son nodos del grafo, no logs externos

**Negativas**:

- Overhead de escritura: 10–100 eventos por raw procesado
- Volumen de datos crece linealmente con el uso (mitigado: events son baratos de almacenar; si crece a 1M+/mes, considerar partitioning por mes o exportar a cold storage)
- Nueva responsabilidad para el código del worker y el conversacional: emitir los eventos correctamente

**Neutrales**:

- Convención compartida entre worker y conversacional — codificada en `docs/agents/conventions.md`
- La emisión es síncrona con la decisión (no fire-and-forget): si falla la escritura del evento, falla la decisión. Aceptamos ese coste a cambio de no perder trazas.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Logs textuales sin estructura | Cero esfuerzo, sale gratis del runtime | No queryable, no agregable, se pierde con la rotación | No responde ninguna de las preguntas que motivan el ADR |
| OpenTelemetry / Logfire externo | Stack maduro, dashboards listos | Mezcla dominio con observabilidad de infra; reasoning del agente queda fuera del grafo; coste recurrente; vendor lock-in | El dominio (decisiones agénticas) merece vivir en el mismo sistema que el conocimiento que produce |
| Una tabla por kind (`event_decomposition`, `event_commit`, etc.) | Tipado más estricto por evento | Verboso; queries cross-kind requieren UNION o multi-SELECT; añadir un kind nuevo es migración | El polimorfismo natural se pierde, y el 90% de las queries son cross-kind |
| Solo `CHANGEFEED` de SurrealDB (ADR-0020) | State diff automático, sin código en el agente | Captura el qué cambió, NO el porqué (reasoning, confidence, tokens, modelo) | Es complementario, no sustituto: ADR-0020 captura el estado; ADR-0019 captura la intención |

## Related

- ADR-0018: Worker autónomo (el productor principal de estos eventos)
- ADR-0020: CHANGEFEED para state diff (complementario — uno captura intención, el otro el cambio resultante)
- ADR-0008: Topology as primary (justifica por qué los eventos viven en SurrealDB y no en un sistema externo)
- `docs/agents/conventions.md`: convención obligatoria de emisión para todos los agentes
- `apps/mcp/surreal/schema.surql`: la implementación

## Notes

Queries que esto desbloquea inmediatamente:

```surql
-- Tasa de needs_human_review por mes
SELECT
  time::format(created_at, '%Y-%m') AS month,
  count() AS total_events,
  count((kind = 'human_review_requested')) AS reviews
FROM agent_event
WHERE actor = 'worker' AND kind IN ['commit_succeeded', 'human_review_requested']
GROUP BY month;

-- Distribución de confidence
SELECT math::round(confidence * 10) / 10 AS bucket, count() AS n
FROM agent_event
WHERE kind = 'decomposition_proposed'
GROUP BY bucket;

-- Reconstruir el flujo completo de un raw concreto
SELECT * FROM agent_event
WHERE session_id = (
  SELECT session_id FROM agent_event WHERE subject = raw_capture:xyz LIMIT 1
)
ORDER BY created_at;

-- Coste por mes (input + output tokens)
SELECT
  math::sum(tokens_used.input)  AS total_input,
  math::sum(tokens_used.output) AS total_output,
  count()                       AS events
FROM agent_event
WHERE created_at > time::now() - 30d AND tokens_used IS NOT NONE;
```

Futuro (v2): añadir una herramienta `replay_events(session_id)` que reconstruye la decisión en otro modelo para comparar (Opus 4.7 vs Sonnet 4.6, por ejemplo). Si el volumen crece desproporcionadamente (>1M eventos/mes), partitioning por mes o export a cold storage; mientras tanto, retention ilimitado es la opción simple y correcta.
