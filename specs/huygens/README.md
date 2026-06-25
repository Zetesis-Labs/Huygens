# Huygens — Definición funcional (reverse-engineered)

> Especificación funcional completa de **Huygens**, derivada por ingeniería
> inversa del código implementado (no de requisitos idealizados), siguiendo el
> skill `reversed-functional-design` y la estructura canónica de
> `functional-designer` (10 secciones). Prosa en español, *headings* canónicos en
> inglés, identificadores/enums/tools verbatim.
>
> **App:** `huygens` (un único producto). El repo se modela como **una app con
> ocho iniciativas** no solapadas; cada `functional-specs.md` cubre exactamente
> una. Para topología física, schema, ADRs o el *porqué* conceptual, ver
> `apps/mcp/src/lore/*`, `docs/architecture/*` y `docs/MODEL.md` — aquí no se
> documenta arquitectura técnica.

## Qué es Huygens

Una **memoria estructurada de confianza** para una persona (Rubén). El usuario
habla con un agente conversacional; el agente usa el MCP; el MCP persiste en
SurrealDB. El valor rector: todo lo que entra al grafo es **auditable y citable**
—rastreable hasta la evidencia literal— y **nada muta sin mandato del usuario**.

El pipeline canónico, y qué iniciativa cubre cada tramo:

```text
captura  →  inbox        →  proceso        →  informe-block  →  propuesta  →  commit
[capture-and-inbox]         [processing-proposals-and-commit]              [(humano)]
            \__ modelo del grafo: graph-model-notes-and-topology __/
            \__ lectura/grounding: retrieval-and-grounding ________/
            \__ rituales/coaching: rituals-and-coaching ___________/
superficies: conversational-agent-worker (chat) · dashboard-ui (visual)
garantía:    audit-provenance-and-trust (auditabilidad transversal)
```

## Las ocho iniciativas

| # | Iniciativa | Qué define |
|---|---|---|
| 1 | [`capture-and-inbox`](./capture-and-inbox/functional-specs.md) | Plano de evidencia: captura sin ceremonia, `raw_capture`, inbox, ciclo de `status`, `set_raw_status`. |
| 2 | [`processing-proposals-and-commit`](./processing-proposals-and-commit/functional-specs.md) | Sesión de proceso, el informe-block narrativo, el ciclo de propuesta y la **frontera de aprobación** (`commit_proposal`). |
| 3 | [`graph-model-notes-and-topology`](./graph-model-notes-and-topology/functional-specs.md) | El modelo como conceptos de producto: 8 tipos de nota, estados ZTD, 3 ejes temporales, MITs, edges, `retract`. |
| 4 | [`retrieval-and-grounding`](./retrieval-and-grounding/functional-specs.md) | Responder **desde el grafo, citado**: búsqueda (vector/lexical/hybrid/expand), `check_claim`, `trace_provenance`, vistas y saved queries. |
| 5 | [`rituals-and-coaching`](./rituals-and-coaching/functional-specs.md) | La jornada (`day`) y la semana (`week`), disciplina del `kind`, asimetría de iniciativa, andamiaje pedagógico ZTD. |
| 6 | [`conversational-agent-worker`](./conversational-agent-worker/functional-specs.md) | El agente del dashboard (Agno + OpenAI, AG-UI `:7777`); toolset = MCP **menos `commit_proposal`**; persistencia de conversaciones. |
| 7 | [`dashboard-ui`](./dashboard-ui/functional-specs.md) | La superficie visual Astro: home (Inbox/MITs/Bitácora/Diario), explorer (grafo), chat, revisión de propuestas. |
| 8 | [`audit-provenance-and-trust`](./audit-provenance-and-trust/functional-specs.md) | La promesa de confianza: `agent_event`/`mcp_tool_call`, CHANGEFEED/time-travel, el **fold invariant**, provenance, muro vs barandilla. |

## Hallazgos transversales (evidencia, no idealización)

La ingeniería inversa surfaceó discrepancias entre la doctrina/los docs y la
implementación real. Se documentan en la sección 9/10 de cada spec; resumen:

- **El commit humano NO ocurre en el dashboard.** No existe botón, formulario ni
  ruta en `apps/dashboard` que invoque `commit_proposal`; `proposals/[id].astro`
  es un redirect y el detalle es de solo lectura. El commit humano se hace hoy
  desde un cliente MCP completo (p. ej. Claude Code), no desde la UI. *(→ 7; matiza la narrativa "se commitea desde Borradores".)*
- **Drift de lenguaje legacy en el worker.** El system-prompt fijo de
  `agent.py` aún usa `plan_day`/`review_day` y la dicotomía plan/cierre, ya
  unificada a la jornada única (`day`). Acotado —el worker no commitea e inyecta
  la doctrina íntegra, que gana en runtime— pero es drift textual residual. *(→ 5, 6.)*
- **`/workbench` de `docs/UI_STRATEGY.md` no está implementado.** Lo entregado es
  un lector + chat + explorer (tema claro), no el diff editable con commit por
  teclado. *(→ 7.)*
- **Las conversaciones guardadas no se rehidratan:** existe `getConversation`
  pero `ChatApp` solo guarda, no carga. *(→ 6, 7.)*
- **El "muro" del VIEWER es inmutabilidad, no excepción:** en SurrealDB v2.6 una
  escritura del reader sobre tabla SCHEMAFULL devuelve resultado vacío en vez de
  lanzar. La garantía es "datos sin cambios", no "error". *(→ 4, 8.)*
- **Emisión de eventos best-effort vs ADR-0019:** el ADR describe emisión
  síncrona ("si el evento falla, la decisión falla"); `emitEvent`/`logToolCall`
  implementados nunca lanzan. *(→ 8.)*
- **Sin revisor automático del trail de barandillas** (DOCT-002): las violaciones
  de barandilla son auditables a posteriori pero hoy nadie las revisa. *(→ 4, 8.)*

## Caveat de datos

Varias afirmaciones de *cobertura en vivo* (p. ej. `via_proposal` al 100%,
`superseded` como estado más común por recuento) provienen de los docs y **no se
re-verificaron contra la BD viva**: el volumen con la memoria fue borrado el
2026-06-09 y la base actual está vacía salvo schema+seed. Quedan etiquetadas como
asunción en los specs 2 y 8.

## Método

Ocho agentes en paralelo, uno por iniciativa, cada uno: leyó las dos skills
(ignorando su sección residual "Nixon"), la SSOT de comportamiento
(`operating-doctrine.md`, `data-model.md`, `docs/MODEL.md`), el código, los tests
y los ADRs relevantes; y escribió su spec siguiendo las 10 secciones canónicas.
Re-ejecutar el skill sobre una iniciativa **actualiza** su spec in situ (cambio
mínimo), no lo reescribe a ciegas.
