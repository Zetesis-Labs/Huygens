# ADR-0018: Worker autónomo con Agno

**Status**: Accepted (rol concreto del worker actualizado — ver `docs/MODEL.md`)
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: architecture, agent

> **Update**: la responsabilidad concreta del worker descrita aquí (clarify autónomo de `raw_capture`s) ya no aplica. El modelo vigente está en `docs/MODEL.md`: el worker es un **topologizador** que reacciona a informes nuevos, no un clarifier de raws. **Lo que este ADR decide y sigue vigente es el envoltorio del proceso**: tenerlo como proceso separado, en Python con Agno, hablando directo a SurrealDB. Los detalles del trabajo concreto que ejecuta serán objeto de un ADR futuro.

## Context

El sistema tenía dos opciones para el procesamiento de fondo que no requiere intervención humana inmediata:

- **Solo conversacional**: el agente principal procesa cuando el usuario lo pide. Limitación: el sistema solo avanza cuando hay sesión activa. Para una memoria personal que debe "estar al día" sin fricción, esto convierte el sistema en una bandeja de entrada más, no en memoria viva.
- **Worker autónomo en paralelo**: un proceso de fondo que reacciona a cambios en la BBDD y ejecuta su trabajo sin necesidad de sesión humana.

Por debajo de "qué hace exactamente" hay una pregunta más estable: **¿debería existir un proceso autónomo separado de los MCPs, y en qué stack?** Esta es la pregunta que este ADR responde.

## Decision

Añadir un **worker autónomo** (`huygens-worker`) como proceso separado, **complementario** del flujo conversacional.

Tres elecciones que sobreviven al cambio de modelo:

**1. Proceso separado, no parte de un MCP.** El worker tiene un loop de vida propio (reacciona a cambios en la BBDD sin que ningún cliente lo invoque). Meterlo dentro de un MCP rompe el modelo request/response de MCP y mezcla responsabilidades.

**2. Python + Agno (no TypeScript + Bun).** Aunque el resto del stack es TS, el ecosistema de agentes con structured output (Pydantic) y tool use orquestado está significativamente más maduro en Python. El coste de añadir un segundo lenguaje es menor que el coste de reinventar el agent loop en TS.

**3. Habla directo al driver SurrealDB Python, no pasa por los MCPs.** Coherente con ADR-0014: los MCPs sirven al agente conversacional (request/response, sesión humana). El worker es un proceso autónomo y comparte la BBDD como única dependencia.

`huygens-worker` se suma como contenedor en `docker-compose` (junto a `app`, `surrealdb`, `surrealdb-init`).

## Consequences

**Positivas**:
- Memoria que avanza entre sesiones — el sistema no depende de que el usuario abra Claude Code para procesar lo que tiene pendiente.
- Coste LLM trazable: cada ciclo del worker tiene coste medible y atribuible (ver ADR-0019 para el event sourcing).
- Stack del worker optimizado para su trabajo (Python + Agno + Pydantic), sin condicionar el resto del proyecto.

**Negativas**:
- Otro proceso a operar (contenedor, logs, restart policy).
- Coste LLM continuo (mitigado: uso personal, volumen bajo).
- Decisiones autónomas pueden equivocarse (mitigado por la auditabilidad de ADR-0019 + ADR-0020 y porque las evidencias originales nunca se borran → re-procesable).

**Neutrales**:
- Python entra al stack (junto al TS de MCP). Ya hay Python en otros proyectos del usuario, coste cognitivo bajo.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Solo conversacional | Cero infraestructura extra; humano controla todo | El sistema no progresa entre sesiones; memoria pasiva | No cumple "memoria viva" |
| Cron job N veces/día | Simple, sin eventos | Polling, latencia variable, peor UX por coste similar | Peor UX por coste similar |
| LangGraph en lugar de Agno | Familiaridad parcial; comunidad grande | Más rígido en grafos de flujo; verboso para un worker simple | Agno más ergonómico para tool use y structured output |
| Worker en TypeScript con `surrealdb` JS | Un solo lenguaje en el stack | Ecosistema de agentes en TS menos maduro; sin equivalente real a Agno/Pydantic-AI | El coste de Python << el coste de reinventar el agent loop |

## Related

- ADR-0014: arquitectura MCP de tres capas (el worker NO va por el MCP, habla directo a SurrealDB)
- ADR-0019: event sourcing — el worker emite eventos de su ciclo de trabajo
- ADR-0020: CHANGEFEED para observabilidad complementaria
- `docs/MODEL.md`: definición vigente de qué hace exactamente el worker

## Notes

En v1 el worker corre con un solo agente Agno. Si el trabajo se vuelve complejo se puede partir en sub-agentes, pero el principio es **empezar simple** y especializar solo cuando los datos justifiquen.
