# 2026-06-09 — Doctrina: enforcement sin señalizar y copias con drift

Hallazgos de la revisión crítica del 2026-06-09 centrados en la **capa de
doctrina**: qué reglas están realmente hechas cumplir (y dónde) frente a cuáles
son solo prosa, y cuántas copias de la doctrina existen con riesgo de drift.
Los IDs son estables (`DOCT-NNN`).

Contexto: la tesis de Huygens es que la confianza viene de auditabilidad +
frontera de aprobación. Esa tesis está bien ejecutada en el plano del dato
(VIEWER, UNIQUE, transacción atómica), pero la doctrina no distinguía qué parte
de sí misma es **muro** (el sistema lo impide) y qué parte es **barandilla**
(el agente debe quererlo cumplir), y sus copias derivaban.

---

## DOCT-001 — La doctrina no señaliza qué reglas son muro y cuáles barandilla

**Estado: resolved** (aplicado en el working tree de esta revisión; commit pendiente)

`operating-doctrine.md` mezclaba sin distinción reglas con enforcement real
(read-only vía rol VIEWER del motor, padre único vía índice UNIQUE en
`part_of`, `approved: true` + un-ritual-por-día en `commit_proposal`) con
reglas que solo existen si el LLM las lee y obedece ("no marcar MITs por
iniciativa", "no asumir padre por contexto", "kind solo dentro de ritual").
Un lector — humano o agente — no podía saber qué pasa si una regla se ignora.

**Resolución:** sección «Muro o barandilla: el mapa de enforcement» añadida a
`apps/mcp/src/lore/operating-doctrine.md`, con tabla regla→tipo→dónde se hace
cumplir, y las Prohibiciones etiquetadas `(muro)` / `(barandilla)`.

## DOCT-002 — Reglas críticas solo-prosa: el servidor no puede verificar el mandato

**Estado: triaged** (decisiones 2026-06-10; parcialmente aplicado en el working tree)

**Decisiones (debate con Rubén, 2026-06-10)** — criterio: *muros para el
agente, no para Rubén* (ahora en la doctrina):

- **Promovido a muro — preview obligatorio**: `get_proposal` estampa
  `previewed_at`, `update_proposal` lo invalida, `commit_proposal` lo exige.
  Nada estructural se commitea sin haber sido renderizado tal cual.
  ✔ implementado (`commit-muros.test.ts`).
- **Promovido a muro — `part_of` acíclico**: check de alcanzabilidad en commit
  (el UNIQUE de padre único no ve ciclos). ✔ implementado.
- **Rechazado — límite duro de 3 MITs**: queda como *barandilla deliberada*
  (convención; si el usuario quiere 5, son 5). Constreñía al usuario, no al
  agente.
- **Rechazado — registro del mandato en el ritual**: los narrative blocks ya
  exigen `raw_ids ≥ 1`; el servidor no puede leer si el raw contiene la orden.
- **Pendiente — panel de anomalías contables** en el dashboard (commits con
  kind, retracts, reparentings, días con >3 MITs): queries sobre datos que ya
  existen, sin LLM juez. Es lo único que mantiene este issue abierto.

`commit_proposal` no tiene forma de saber si el usuario aprobó nada:
`approved: true` lo escribe el propio agente. Igualmente sin validación de
servidor: marcar MITs (cualquier `mit_for` se acepta), límite de 1-3 MITs/día,
asumir padre (`part_of` válido se acepta), poner `kind` habiendo o no ritual
real (el servidor solo valida `approved` y unicidad diaria), y que la
propuesta fue *mostrada* antes del commit.

No todo debe promoverse a muro — validar "mandato" es imposible desde el
servidor — pero hay opciones intermedias pendientes de decisión:

- **Auditor del trail**: el audit trail (`agent_event` + CHANGEFEED +
  `proposal.result`) permite detectar violaciones de barandilla a posteriori,
  pero hoy nada lo revisa. Un job/tool de revisión periódica (p. ej. "MITs
  marcados sin orden del usuario en la conversación", ">3 MITs el mismo día")
  cerraría el bucle sin convertir barandillas en muros.
- **Muros baratos**: límite duro de 3 MITs por día en `commit_proposal`
  (recuento, no interpretación); rechazo de `kind` si la proposal no declara
  raws del día (heurística, discutible).
- **Registro del mandato**: exigir en el payload del ritual una referencia al
  raw_capture que contiene la orden del usuario (hace el `approved` citable).

## DOCT-003 — Doctrina duplicada en cuatro sitios

**Estado: resolved** (aplicado en el working tree de esta revisión; commit pendiente)

Las mismas reglas vivían en `operating-doctrine.md` (SSOT declarado),
`CLAUDE.md`, `AGENTS.md` y el `INSTRUCTIONS` hardcodeado de
`backend/huygens-worker/huygens_worker/agent.py`. La jerarquía de precedencia
estaba declarada en prosa, pero nada detectaba el drift, y el drift ya había
ocurrido (ver DOCT-005 y DOCT-006).

**Resolución:** `CLAUDE.md` y `AGENTS.md` reducidos a punteros al SSOT en lo
que era doctrina o contrato de datos (conservan solo convenciones de repo);
el resumen de `agent.py` queda como énfasis deliberado *condicionado a* que la
doctrina completa se inyecte siempre (DOCT-004). Test de presencia de
referencias cruzadas en `apps/mcp/test/doctrine-drift.test.ts`.

## DOCT-004 — Fallback silencioso del worker: opera sin doctrina si el fetch falla

**Estado: resolved** (aplicado en el working tree de esta revisión; commit pendiente)

Agno descarta el `instructions` del MCP, así que el worker lo recupera vía
`get_server_instructions_via_mcp()`. Si ese fetch fallaba, el agente arrancaba
con solo el resumen hardcodeado — que omite reglas clave ("no asumir padre",
"invitar proactivamente", "un ritual por día") — y un `log.warning` como única
señal. Un agente de memoria operando con doctrina degradada es exactamente el
fallo que la doctrina dice evitar.

**Resolución:** el fetch ahora reintenta y, si agota los intentos, **el worker
no arranca** (`RuntimeError`), salvo opt-in explícito
(`ALLOW_DEGRADED_DOCTRINE=true` en settings) que degrada con `log.error`.

## DOCT-005 — data-model.md: sync manual sin verificación (12 tools sin documentar)

**Estado: resolved** (aplicado en el working tree de esta revisión; commit pendiente)

`data-model.md` dice "keep in sync with `schema.surql` and the tool contracts"
pero el sync era manual y ya había roto: **12 tools registradas no estaban
documentadas** (`trace_provenance`, `neighborhood`, `expand_context`,
`check_claim`, `changes_between`, `save_query`, `list_queries`, `run_query`,
`save_conversation`, `get_conversation`, `list_conversations`,
`delete_conversation`). En contraste, `huygens://lore/schema` se genera en
vivo con `INFO FOR DB` — el patrón correcto — y el cookbook ya tenía test
anti-drift (`cookbook-drift.test.ts`).

**Resolución:** tools añadidas a la Tools surface de `data-model.md` (con la
aclaración de que saved queries y conversaciones son estado auxiliar del
dashboard que escribe fuera del ciclo de proposal), y test anti-drift
`apps/mcp/test/data-model-drift.test.ts` que valida en ambas direcciones:
tablas/campos/enums/edges del schema vivo ⊆ documento, y tools registradas en
`createServer()` ⊆ documento.

## DOCT-006 — AGENTS.md desactualizado (drift consumado)

**Estado: resolved** (aplicado en el working tree de esta revisión; commit pendiente)

Evidencia de que las copias derivan: AGENTS.md describía
`backend/huygens-worker` como "shell Python MCP; futuro worker especializado"
y afirmaba "el worker no usa Agno/OpenAI" — falso desde que el worker es el
agente del dashboard (Agno + OpenAI + AG-UI). Su lista de tools omitía
`lexical_search`, `hybrid_search`, `retract`, `collection_stats` y todas las
de exploración. Señalaba `docs/CONVENTIONS.md` como "reglas operativas" cuando
es un stub.

**Resolución:** descripciones corregidas y listas sustituidas por punteros al
SSOT (`data-model.md` Tools surface / recursos `huygens://lore/*`).

---

## Anexo — otros hallazgos de la misma revisión (no tratados aquí)

Registrados para no perderlos; merecen doc propio o entrada en el backlog:

- **Sin estrategia de backup/restore** del volumen SurrealKV (crítico:
  pérdida del volumen = pérdida total de la memoria; el CHANGEFEED vive en el
  mismo volumen).
- **El HTTP MCP no tiene autenticación** (`apps/mcp/src/index.ts`): las tools
  de escritura corren con credenciales root; crítico si se despliega fuera
  del devcontainer.
- ~~Cero tests del enforcement ritual~~ — **resuelto** en esta revisión:
  `apps/mcp/test/ritual-commit.test.ts` cubre `approved: true`, un-ritual-por-día,
  coexistencia plan+review, corrección vía retract+recommit y el paso libre de
  informes sin kind.
- ~~Día-Madrid hardcodeado como `+ 2h`~~ — **resuelto** (2026-06-10): el gate
  ritual usa `src/madrid-time.ts` (Intl, DST-correcto, fronteras como datetimes
  bind); tests en `madrid-time.test.ts`.
- Sin versionado de migraciones (un `schema.surql` idempotente con cambios
  destructivos silenciosos posibles).
- `part_of` no previene ciclos en BD (mitigado en lectura).
- Race teórica de doble commit (check de draft y transacción no atómicos
  entre sí).
- `SHOW CHANGES … SINCE d"${since}"` interpolado en vez de bind
  (`commit.ts:51`; origen confiable, pero rompe el patrón).
