# 2026-06-09 — Modelo de uso: el sistema real ya no es el documentado

Segunda parte de la revisión del 2026-06-09 (la primera:
[doctrina y drift](./2026-06-09-doctrine-enforcement-and-drift.md)). Tesis: la
documentación de uso describía el Huygens archivo (capturar → procesar),
mientras que el sistema real es además un **sistema operativo del día** (MITs,
due/defer, rituales, Bitácora, dashboard) y una **memoria consultable con
grounding** (`expand_context`, `check_claim`, `trace_provenance`). IDs estables
`USE-NNN`.

---

## USE-001 — Los rituales semanales están a medio existir

**Estado: resolved** (decisión 2026-06-10; aplicado en el working tree, commit pendiente)

`plan_week` / `review_week` eran kinds válidos sin prompt, sin doctrina y con
unicidad por día en vez de por semana.

**Decisión (Rubén, 2026-06-10):** rediseño mayor que lo pedido — **un solo
ritual por período, sin separar plan de review**. "Soy caótico: quiero bloques
narrativos que planifiquen y cierren sin distinguirlos; no quiero harness duros
para mí más de los necesarios." La estructura vive en las mutaciones que
acompañan al informe (`mit_for`, estados, `affects`), no en la taxonomía del
texto.

**Resolución:** `INFORME_KINDS = ['day', 'week']`. La **jornada** (`day`):
asienta lo pendiente + orienta el día, un informe por día-Madrid. La **semana**
(`week`): revisión de mantenimiento, una por semana ISO. Los cuatro kinds
divididos quedan legacy (válidos en datos históricos, rechazados en proposals
nuevas). Prompts `day.md`/`week.md`; gate con fronteras Madrid DST-correctas
(`madrid-time.ts`, sustituye al `+2h`); tests en `ritual-commit.test.ts` +
`madrid-time.test.ts`.

## USE-002 — La invitación proactiva no tiene runtime (y el "digest" no existe)

**Estado: resolved** (versión barata; aplicado en el working tree, commit pendiente)

La asimetría de iniciativa presuponía un agente que inicia conversaciones;
ninguna superficie lo hace.

**Resolución:** la invitación vive donde el usuario ya mira a diario — el
dashboard. `ritualNudges()` (`apps/dashboard/src/lib/bitacoraView.ts`) genera
banners: hoy sin jornada → invita a hacerla; domingo/lunes sin revisión semanal
en los últimos 7 días → invita a la semana. El nudge es invitación, nunca
artefacto. Un trigger programado real (notificación sin abrir el dashboard) y
el digest de resurgidas (`defer_until`) quedan como mejora futura.

## USE-003 — USING.md describía un sistema que ya no existe

**Estado: resolved** (aplicado en el working tree de esta revisión; commit pendiente)

Errores activos, no solo omisiones: describía el worker como "shell que conecta
y se queda idle, desactivado por defecto" (es el agente Agno del dashboard y
arranca por defecto); afirmaba "indexing is still explicit" (el commit
auto-embebe post-commit); no mencionaba rituales, MITs, due/defer, Bitácora ni
el servicio `huygens-dashboard` (:4321); y su lista de tools era otra copia
driftada.

**Resolución:** reescrito alrededor del bucle diario (plan → captura/corrección
→ cierre) + sesión de inbox + grounding + las dos superficies conversacionales;
la lista de tools es ahora un puntero a la Tools surface de `data-model.md`.

## USE-004 — data-model.md documentaba un contrato de commit retirado

**Estado: resolved** (aplicado en el working tree de esta revisión; commit pendiente)

`CommitProposalResult` aparecía con `temp_ids: {temp_id → real_id}` y la
instrucción "use temp_ids to act on a just-created record". Desde ADR-0028 los
ids reales se asignan en `create_proposal` (el payload almacenado habla ids
reales), el resultado no lleva `temp_ids` y el `result` persistido guarda solo
el ancla (`versionstamp`, `committed_at`). USING.md tenía la versión correcta —
los dos docs se contradecían sobre el mismo contrato.

**Resolución:** bloque de resultado corregido en `data-model.md`, incluida la
nota del auto-embed post-commit. (El test `data-model-drift.test.ts` no cubre
prosa de contratos — cubre presencia de schema/tools; este tipo de drift sigue
requiriendo ojo humano o un futuro test del shape real del resultado.)

## USE-005 — La doctrina no decía cómo *responder* (solo cómo escribir)

**Estado: resolved** (aplicado en el working tree de esta revisión; commit pendiente)

Las tools de grounding (`expand_context`, `check_claim`, `trace_provenance`)
existían sin que ningún documento dijera cuándo usarlas; el árbol de decisión
despachaba la consulta con "query_query / search".

**Resolución:** sección «Responder desde el grafo (grounding)» en la doctrina
(recuperar antes de responder, verificar con `check_claim` antes de afirmar,
citar evidencia, el grafo gana a la memoria conversacional), y sección
«Clientes sin commit» que canoniza el flujo del worker del dashboard (preparar
draft fiel + anunciar listo para commit) en vez de dejarlo solo en su
system-prompt.
