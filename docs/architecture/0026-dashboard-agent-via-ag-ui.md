# ADR-0026: Agente conversacional del dashboard vía AG-UI

**Status**: Accepted
**Date**: 2026-05-29
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: architecture, agent, dashboard

## Context

[ADR-0018](./0018-autonomous-worker-with-agno.md) decidió tres cosas sobre
`huygens-worker`: (1) proceso separado, (2) Python + Agno, (3) hablando
**directo a SurrealDB**, con un rol de **topologizador autónomo** que reacciona
a cambios sin sesión humana. Las piezas (1) y (2) sobreviven; el rol autónomo y
la conexión directa a la BBDD nunca se materializaron: el worker quedó como un
*shell* MCP inerte (lista tools y duerme).

Ahora queremos un agente **dentro del dashboard**: Rubén chatea, el agente
razona sobre su memoria y conduce el flujo de captura (procesar el inbox,
explorar el grafo, armar propuestas), con un canvas que muestra las vistas que
el agente genera. Esto es conversacional y humano-en-el-bucle, no autónomo.

## Decision

Revivir Agno en `huygens-worker`, pero con un rol y un cableado distintos a
ADR-0018:

**1. Conversacional, no autónomo.** El agente lo dirige el usuario desde el chat
del dashboard. No hay loop de fondo que reaccione a la BBDD (eso queda como
trabajo futuro separado, si se justifica).

**2. Habla por el MCP, no directo a SurrealDB.** Diverge del punto 3 de
ADR-0018. El flujo de Huygens es request/response con propuestas visibles y
commit humano — exactamente lo que el MCP sirve. El agente usa `MCPTools`
(streamable-http) contra `huygens-mcp`, reutilizando toda la validación y el
formato canónico de las tools en vez de reinventarlos contra el driver.

**3. Servido por AG-UI, consumido por Assistant-UI.** El agente se expone con el
protocolo AG-UI (`AGUI` + `AgentOS.serve` de Agno, endpoint `POST /agui`). El
dashboard React lo consume con el runtime AG-UI de Assistant-UI. El dashboard
hace de proxy SSR (mismo origen) hacia el endpoint del worker.

**4. Nunca commitea.** `commit_proposal` queda excluido de su toolset
(`exclude_tools`). El agente arma y refina la propuesta; el commit al grafo es
una acción explícita de Rubén con un botón en la UI. Es el límite
humano-en-el-bucle, garantizado a nivel de tool, no solo por instrucciones.

**5. Cura sus vistas.** Las consultas del agente (`neighborhood`,
`expand_context`, `vector_search`, `query_query`) se pintan como grafo en el
canvas; el agente decide cuáles persistir con `save_query`.

## Consequences

**Positivas**:
- Reusa el MCP como única superficie de escritura/lectura → coherencia con la
  validación, el event-sourcing y el cookbook ya existentes.
- El humano-en-el-bucle es estructural (sin `commit_proposal` no puede mutar el
  grafo aunque "quiera").
- Encaja con el dashboard existente (islas React, lectura `huygens_reader`).

**Negativas**:
- El worker pasa de shell inerte a servicio con coste LLM por turno (mitigado:
  uso personal, modelo barato configurable).
- Entra un puerto/proceso más a operar (el AG-UI del worker).

**Neutrales**:
- ADR-0018 sigue válido en su envoltorio (proceso Python + Agno). Este ADR
  redefine **qué hace** el worker y **cómo se conecta**, no que exista.

## Alternatives considered

| Alternativa | Por qué se rechazó |
|---|---|
| Agente en el MCP mismo | Rompe request/response del MCP y mezcla el agent-loop con la capa de tools |
| Agente directo a SurrealDB (ADR-0018) | Se salta validación/event-sourcing del MCP y no da propuestas humano-en-el-bucle |
| Agente que commitea solo | Contradice el principio "propuesta visible → commit" de Huygens |
| Frontend chat sin AG-UI (REST a medida) | AG-UI estandariza streaming de texto + tool-calls + estado; Assistant-UI lo consume sin pegamento |

## Related

- ADR-0018: worker como proceso Python + Agno (envoltorio que se mantiene)
- ADR-0014: arquitectura MCP de tres capas (el agente ahora SÍ va por el MCP)
- ADR-0019: event sourcing de decisiones del agente
- `docs/MODEL.md`: modelo de dominio v2.1-lite y rol del worker
