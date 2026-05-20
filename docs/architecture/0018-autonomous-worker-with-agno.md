# ADR-0018: Worker autónomo con Agno para procesar el inbox

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: architecture, agent

## Context

Tras ADR-0017 el flujo de entrada quedó en dos planos: `raw_capture` (evidencia inmutable) y `note + block + edges` (interpretación). El paso de uno al otro — "clarify" — es **interpretativo**: requiere razonamiento LLM para título, segmentación, type, pillars y edges.

La primera propuesta era hacerlo solo **conversacional**: el agente principal procesa raws cuando el usuario lo pide. Tres limitaciones reales: el inbox crece silenciosamente si el usuario no inicia el clarify; cada captura exige atención humana posterior aunque sea trivial; no hay procesamiento de fondo — la memoria estructurada solo avanza cuando hay sesión. Para una memoria personal que debe "estar al día" sin fricción, esto convierte el sistema en una bandeja de entrada más, no en memoria viva.

## Decision

Añadir un **worker autónomo** (`huygens-worker`) — proceso separado en Python con framework **Agno** — que escucha el inbox y procesa raws automáticamente. **Complementario, no sustituto** del flujo conversacional.

Cuatro elecciones clave:

**1. Trigger event-driven vía LIVE queries.** `LIVE SELECT * FROM raw_capture WHERE processed_at IS NONE`. SurrealDB pusha por WebSocket cada nuevo raw. Sin polling, sin cron, sin overhead.

**2. Race-safe claim atómico.** Antes de procesar, `UPDATE $id SET processed_at = time::now() WHERE processed_at IS NONE`. Solo uno gana — protege contra dos workers o worker + agente conversacional intentando a la vez.

**3. Structured output con Pydantic.** El agente Agno se define con `response_model=Decomposition` (clase Pydantic). El LLM devuelve un objeto tipado y validado, no JSON libre.

**4. Hybrid worker + conversational.** Si la confidence es baja o detecta ambigüedad, el worker marca `needs_human_review=True` y devuelve el raw al flujo conversacional. **No fuerza decomposición cuando duda** — el coste de meter la pata en la memoria personal es alto.

`huygens-worker` se suma como **cuarto contenedor** en `docker-compose` (junto a `app`, `surrealdb`, `surrealdb-init`). Habla **directo al driver SurrealDB Python** — no pasa por Huygens MCP ni por `surrealmcp`. Coherente con ADR-0014: el MCP sirve al agente conversacional, no media procesos de fondo.

Esbozo del worker:

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from surrealdb import AsyncSurreal
from pydantic import BaseModel

class Decomposition(BaseModel):
    notes: list[NoteProposal]
    needs_human_review: bool = False
    review_reason: str | None = None
    confidence: float

async with db.live("SELECT * FROM raw_capture WHERE processed_at IS NONE") as live:
    async for event in live:
        if not await claim_raw(db, event.result['id']):
            continue
        agent = Agent(model=Claude(id="claude-opus-4-7"), response_model=Decomposition, ...)
        decomp = await agent.arun(event.result['content'])
        if decomp.needs_human_review:
            await mark_pending_review(...)
        else:
            await commit_decomposition(decomp)  # transaccional
```

El commit final usa transacción SurrealDB (INSERT notes + blocks, RELATE `derived_from`, UPDATE raw) — la consecuencia multi-step ya prevista en ADR-0017.

## Consequences

**Positivas**:
- Inbox vacío sin intervención humana — memoria viva entre sesiones
- Procesamiento event-driven (latencia ~segundos), no batch
- Coste LLM trazable: cada raw tiene coste medible y atribuible
- `needs_human_review` mantiene al humano en el loop solo cuando aporta valor

**Negativas**:
- Otro proceso a operar (contenedor, logs, restart policy)
- Coste LLM continuo (mitigado: uso personal ~5-50 capturas/día → despreciable)
- Decisiones autónomas pueden equivocarse (mitigado por `needs_human_review`, por `derived_from.transformation` de ADR-0017 que permite auditoría, y porque el raw nunca se borra → re-procesable)

**Neutrales**:
- Python entra al stack (junto al TS de MCP). Ya hay Python en otros proyectos del usuario, coste cognitivo bajo.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Solo conversacional (status quo de ADR-0017) | Cero infraestructura extra; humano controla todo | Inbox crece sin procesar; memoria pasiva | No cumple "memoria viva" |
| Cron job que procesa N veces/día | Simple, sin LIVE | Polling, latencia variable, no event-driven | Peor UX por coste similar |
| LangGraph en lugar de Agno | Familiaridad parcial; comunidad grande | Más rígido en grafos de flujo; verboso para un worker simple | Agno más ergonómico para tool use y structured output |
| Worker en TypeScript con `surrealdb` JS | Un solo lenguaje en el stack | Ecosistema de agentes en TS menos maduro; sin equivalente real a `pydantic-ai`/Agno | El coste de Python << el coste de reinventar el agent loop |

## Related

- ADR-0014: arquitectura MCP de tres capas (el worker NO va por el MCP, habla directo a SurrealDB)
- ADR-0017: separación `raw_capture` / notes + edge `derived_from` (el worker procesa raws y emite `derived_from`)
- ADR-0019: event sourcing (el worker emite eventos del ciclo de procesamiento) ✅ pendiente
- ADR-0020: CHANGEFEED para observabilidad complementaria ✅ pendiente
- [docs/agents/huygens-domain.md](../agents/huygens-domain.md): modelo de dominio que el worker debe respetar
- [docs/agents/surrealql-patterns.md](../agents/surrealql-patterns.md): patrones de query (LIVE, claim atómico, transacción de commit)
- Código futuro: `apps/worker/` (Python + Agno), entrada en `docker-compose.yml`

## Notes

En v1 el worker corre con un solo agente Agno. Si la decomposición se vuelve compleja (extracción de entities, asignación de pilares, generación de edges como pasos separados) se puede partir en sub-agentes — pero el principio es **empezar simple** y especializar solo cuando los datos justifiquen.

Latencia objetivo de raw insertado a notes commited: **<30 segundos**. Sin auto-tuning ni circuit breakers hasta tener datos reales.
