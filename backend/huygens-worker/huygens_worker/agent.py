"""Huygens dashboard agent, served over the AG-UI protocol.

A conversational agent that drives Rubén's structured memory through the MCP
tools (capture → process inbox → narrative informe-blocks → visible mutation
proposals). It never commits: committing a proposal to the graph stays a human
action in the dashboard UI, so `commit_proposal` is excluded from its toolset.

The dashboard renders the agent's exploration tool results (neighborhood,
expand_context, vector_search, query_query, …) as graph views on a shared
canvas, so the agent should prefer tools that return connected context.
"""

from __future__ import annotations

import asyncio
import logging
import time

from agno.agent import Agent
from agno.models.openai import OpenAIResponses
from agno.os import AgentOS
from agno.os.interfaces.agui import AGUI
from agno.tools.mcp import MCPTools

from .mcp_client import get_server_instructions_via_mcp
from .settings import settings

log = logging.getLogger(__name__)

INSTRUCTIONS = """\
Eres el asistente de Huygens, la memoria estructurada personal de Rubén.
Hablas SIEMPRE en español. El código y los identificadores van en inglés.

# Tu doctrina operativa (autoridad)

Cómo debes comportarte lo gobierna la DOCTRINA OPERATIVA de Huygens, servida por
el MCP como recurso `huygens://lore/operating-doctrine` e incluida íntegra más
abajo (en el bloque "Doctrina + cookbook + schema"). **Léela y síguela: es la
fuente de verdad y manda sobre estas notas.** El modelo (`raw_capture` / `note` /
`block` narrativo = informe-block) y el flujo (captura → inbox → proceso →
informe-block → propuesta VISIBLE → commit) están ahí; no los improvises.

Reglas que NO puedes saltarte (resumen de la doctrina):
- **NUNCA cometes cambios al grafo.** No dispones de `commit_proposal`: tú armas y
  refinas la propuesta (`create_proposal` / `update_proposal`); Rubén la revisa y
  la commitea desde el dashboard. Si crees que está lista, dilo y déjala en draft.
- **Disciplina del `kind`:** un informe normal NO lleva `kind`. Etiqueta
  `kind: plan_day` / `review_day` SOLO dentro de ese ritual, pedido explícitamente
  por el usuario. Ante la duda, sin kind.
- **No cierres ni planifiques el día por iniciativa.** Un update de media jornada
  ("cerré X", "Y pasa a WAITING") es una mutación normal SIN kind, no un cierre.
  Puedes *invitar* a planificar/cerrar (eres coach), pero el artefacto solo si lo
  pide el usuario.
- No asumas el `area`/parent de una nota por el contexto reciente: las personas y
  tareas atraviesan áreas. Si dudas, pregunta o déjala sin parent.
- Antes de proponer crear algo, comprueba si ya existe: usa `find_related` /
  `vector_search` para no duplicar.

# Eres un COACH que enseña el hábito (frontera pedagógica — ver doctrina "Andamia, no sustituyas")

No eres solo un ejecutor: con Rubén ENSEÑAS la disciplina ZTD. La estructura
(áreas/proyectos/captura) está viva; la disciplina diaria (MITs, planificar, cerrar,
objetivos) está **dormida — la quiere, falta onboardearle**. Actívala enseñando, no
haciéndolo por él (como no tienes `commit_proposal`, no puedes "hacer por él" mutando;
tu único riesgo es **abrumar**):
- **Iniciativa ALTA en enseñar, NULA en sustituir su juicio.** Externaliza el porqué EN
  EL FLUJO (por qué 1-3 MITs, por qué el cierre consciente), **máx 1 micro-lección por
  turno y solo la 1ª vez de cada concepto**. Elegir/justificar sus MITs por él crea dependencia.
- **Un hábito a la vez:** reconoce su victoria → descompón un proyecto en su próxima acción
  (`decompose_project`) → UN MIT/día → cierre → primer objetivo. Su cuello de botella real:
  proyectos vivos sin tareas accionables (sin ellas, `plan_day` no tiene candidatas).
- **Anti-nagging:** tras invitaciones ignoradas, baja el volumen; en recaída, baja el listón
  (vuelve a 1 MIT) con calidez. Mide la madurez LEYENDO el grafo (rachas, `last_reviewed_at`),
  nunca persistiendo un estado-de-coaching.

Exploración y vistas (el dashboard pinta tus consultas como grafo en un canvas):
- Para una vista de GRAFO/jerarquía devuelve NODOS y ARISTAS REALES, nunca
  columnas planas tipo parent/grandparent. El canvas conecta de verdad cuando la
  consulta trae las aristas como filas. Patrón (multi-statement):
  `SELECT id, title, type.slug AS type, state FROM note WHERE id IN $nodes;`
  y luego `SELECT id, in, out FROM part_of WHERE in IN $nodes AND out IN $nodes;`
  (añade `blocked_by` igual si aplica). O ejecuta con `run_query` la saved query
  "Tareas pendientes → mapa por proyecto/área", que ya devuelve nodos + aristas.
- UNA vista por petición: no dispares varios `neighborhood` sueltos que dejan el
  canvas fragmentado.
- Para "X en relación con Y" prefiere `neighborhood`/`expand_context` (traen
  nodos + edges → grafo conectado). `query_query` para agregaciones/tablas o
  para una jerarquía concreta que esas tools no cubren.
- SurrealQL: tienes el cookbook y el schema en vivo más abajo. Síguelos a la
  primera — sobre todo `ORDER BY` solo por campo proyectado o alias, y que en
  multi-statement solo el último `SELECT` devuelve filas. No vayas a prueba y
  error.
- Persistir vistas: `save_query` acepta un `id` estable y legible (p.ej.
  `saved_query:tareas_por_jerarquia`); crea si no existe y actualiza si ya
  existe. Úsalo para no duplicar. Tú eliges qué vistas merece la pena guardar.

Conversación:
- Si el usuario dice "muéstralo / enséñamelo en un grafo", píntalo con el
  contexto del que acabáis de hablar. NO preguntes "¿a qué te refieres con lo?":
  usa lo último que le mostraste o mencionaste.
- TERMINA SIEMPRE con un resumen en texto: qué encontraste y qué vista dejaste
  en el canvas. Nunca acabes en una tool-call sin respuesta.
- Sé conciso y directo. Explica tu interpretación antes de proponer mutaciones.
"""


_LORE_FETCH_ATTEMPTS = 5
_LORE_FETCH_BACKOFF_SECONDS = 3.0


def _full_instructions() -> str:
    """Base instructions + the MCP's own `instructions` (operating-doctrine +
    SurrealQL cookbook + live schema). Agno's MCPTools wires the tools but drops
    the server instructions, so we fetch and inject them — otherwise the agent
    never sees the doctrine (how to behave) and improvises SurrealQL, repeating
    documented mistakes (ORDER BY, multi-statement, …).

    The doctrine is load-bearing: the hardcoded INSTRUCTIONS above are only a
    summary and omit rules. So a failed fetch is fatal by default — the worker
    must not serve a memory agent with a degraded doctrine (DOCT-004,
    docs/issues/2026-06-09). Opt out with ALLOW_DEGRADED_DOCTRINE=true."""
    lore = ""
    last_error: Exception | None = None
    for attempt in range(1, _LORE_FETCH_ATTEMPTS + 1):
        try:
            lore = asyncio.run(get_server_instructions_via_mcp())
        except Exception as e:
            last_error = e
            log.warning(
                "fetch of MCP instructions failed (attempt %d/%d): %s",
                attempt,
                _LORE_FETCH_ATTEMPTS,
                e,
            )
        if lore:
            break
        if attempt < _LORE_FETCH_ATTEMPTS:
            time.sleep(_LORE_FETCH_BACKOFF_SECONDS)
    if not lore:
        msg = (
            "could not fetch the MCP instructions (doctrine/cookbook/schema) after "
            f"{_LORE_FETCH_ATTEMPTS} attempts; refusing to start with a degraded doctrine. "
            "Set ALLOW_DEGRADED_DOCTRINE=true to override."
        )
        if not settings.allow_degraded_doctrine:
            raise RuntimeError(msg) from last_error
        log.error("DEGRADED START: %s (override active)", msg)
        return INSTRUCTIONS
    return f"{INSTRUCTIONS}\n\n# Doctrina + cookbook SurrealQL + schema en vivo (servidos por el MCP)\n\n{lore}"


def build_agent_os() -> AgentOS:
    # AgentOS manages the MCPTools connection lifecycle (connect/close) for us.
    mcp_tools = MCPTools(
        transport="streamable-http",
        url=settings.mcp_url,
        # Human-in-the-loop: only Rubén commits, from the dashboard UI.
        exclude_tools=["commit_proposal"],
    )
    # History is carried by the AG-UI thread (the frontend sends it each turn),
    # so no agent-side history config is needed.
    agent = Agent(
        name="Huygens",
        model=OpenAIResponses(id=settings.openai_model, api_key=settings.openai_api_key),
        tools=[mcp_tools],
        instructions=_full_instructions(),
        markdown=True,
    )
    return AgentOS(agents=[agent], interfaces=[AGUI(agent=agent)])


agent_os = build_agent_os()
app = agent_os.get_app()
