# Pendiente tras la auditoría — 2026-06-05

Estado de los hallazgos de la auditoría multi-agente del proyecto, tras la sesión
del 2026-06-05. Sirve de backlog: qué está cerrado (no rehacer), qué se aparcó por
decisión, qué se descartó, y qué queda **realmente pendiente** (priorizado).

---

## ✅ Cerrado en esta sesión

| Hallazgo | Qué se hizo | Commit |
|---|---|---|
| Logging del MCP | traza de cada tool call (in/out, ok/error) → stderr + tabla `mcp_tool_call` | `ee9ca7c`, `0fdaa53` |
| Informe fantasma (Bitácora) | lector cruza payload↔block vivo | `efb6c37` |
| Consolidación de docu | doctrina operativa como SSOT de comportamiento; entrega en capas | `b696f95` |
| **CRÍTICO-1** kind en el block | campo materializado + commit/replay/genesis + backfill | `739bf7a` |
| **ALTO-4** prompts gemelos + iniciativa invertida | doctrina + gate `commit_proposal` (approved + 1 ritual/día) + cron proactivo | `739bf7a`, doctrina |
| **ALTO-5** worker | doc corregida + **CI** (ruff/mypy/pytest vía uv) | `ebd748f` |
| **MEDIO-6** (formato fecha) | normalización a medianoche UTC de mit_for/due_at/defer_until | `d80fa2f` |
| **MEDIO-7** due/defer dates | `due_at` (deadline) + `defer_until` (tickler real) — backend, cron, dashboard | `d80fa2f`, `71bc045` |
| Apuesta A (kind) · Apuesta C (gate) | — | — |
| Lint del CI (dashboard) | CardNode/DateRangePicker | `539a85a` |

---

## ⏸️ Aparcado por decisión del usuario → ciclo semanal

- **CRÍTICO-2 — Objetivos vacíos** (0 notas `objetivo`, 0 MITs históricos). Se sembrarán
  dentro de la **planificación semanal**, no en sesión aparte (Big Rocks = revisión
  semanal, estilo ZTD).
- **Prompts `plan_week` / `review_week`** (BAJO-9): `INFORME_KINDS` y el `KIND_META`
  del dashboard ya los contemplan, pero **no existen los prompts**. Es el próximo build.
- **Decisión de producto `mit_for` histórico**: soltar (`mit_for: null`) borra el rastro
  de que fue MIT ese día. ¿Preservar histórico? (la otra mitad de MEDIO-6).

## ⛔ Descartado

- **Backup automatizado** de SurrealDB (parte de CRÍTICO-3) — el usuario decidió que no.

---

## 🔴🟡 Pendiente de verdad

### Hardening due/defer — capa operacional a medio migrar (revisión 2026-06-05, verificado)

El núcleo (schema/doctrina/data-model/commit) habla `due_at`/`defer_until`, pero la
capa operacional aún arrastra semántica vieja. Verificado contra código y grafo.
**Nada miente todavía porque hay 0 notas usando los campos — pero lo hará en cuanto
haya deadlines/ticklers reales.** Por prioridad:

1. **Migrar las 3 saved queries pineadas** (tabla `saved_query`) — el mayor miss, ni
   estaba en este informe. Usan `metadata.deadline`/`metadata.due` y NO excluyen dormidas:
   - `ebrk9y01h58jicz7svhv` "Informe diario → radar operativo completo" (la espina del digest).
   - `1ik8bjetg5nm1yond1kq` "Tareas → deadlines próximos".
   - `gysnjflby2omsk3flbsb` "Tareas pendientes → mapa por proyecto/área".
   → proyectar `due_at`/`defer_until`, deadlines desde `due_at` (no metadata), y radar
   activo con `(defer_until IS NONE OR defer_until <= <hoy>)`.
2. **`get_proposal_changes`**: `notes_created` omite `mit_for`/`due_at`/`defer_until`
   (`apps/mcp/src/tools/proposal/changes.ts`, `summarize`); solo proyecta
   `{id,type_slug,title,state}`. Rompe la promesa "delta exacto" para notas que nacen
   con esos campos. (Ya estaban en `updatedFields` para updates.)
3. **Validación estricta de fecha calendario** en `DayDateSchema`
   (`apps/mcp/src/tools/proposal/schemas.ts`): `new Date('2026-02-31')` no es NaN → rueda
   a marzo y se guarda otro día en silencio. Rechazar fechas imposibles.
4. **`review_day.md` / `plan_day.md`**: distinguir los tres ejes — MIT vencida (`mit_for`
   pasado), deadline vencido (`due_at` pasado), dormida (`defer_until` futuro); `plan_day`
   debe **excluir dormidas** de las candidatas a MIT salvo override explícito.
5. **Alinear semántica de "vencido"**: el cookbook usa `due_at < time::now()` (marca vencida
   desde las 00:00 de su propio día, porque se guarda a medianoche UTC). El **dashboard ya lo
   hace bien** (`dueDay < hoy`, estrictamente anterior) — alinear el cookbook y demás recetas
   a ese criterio. Ojo a la interacción con el bug DST (#4 de MEDIO-8: `+2h` fijo).
6. **Otras recetas del cookbook** (desatendido, cola de revisión, proyectos fantasma) no
   excluyen dormidas — retrofit del filtro `defer_until`.
7. **Tests de due/defer**: crear con due_at/defer_until, limpiar con null, normalización de
   datetime con TZ, rechazo de fecha imposible, génesis preservándolos, preview de proposal,
   `get_proposal_changes` en creates, radar excluyendo dormidas.

### Robustez operativa (CRÍTICO-3 resto + apuesta E)
1. **Separar BD test/prod.** `db:smoke` / `db:rebuild` / `db:genesis` corren contra el
   `ns=huygens db=main` vivo. Riesgo: una operación destructiva (p.ej. aplanar el génesis)
   se ejecuta sobre producción. → namespace/instancia efímera para test.
2. **Volúmenes duplicados/muertos** + `name: huygens` explícito en compose. Conviven
   `huygens_surrealkv_data`, `huygens_surrealkv_data_v2`, `devcontainer_surrealkv_data_v2`,
   `huygens_surrealdb_data`. Un arranque con el project-name equivocado monta un volumen
   vacío → "memoria desaparecida". Declarar `name:` y limpiar los muertos.

### Dashboard / visibilidad (MEDIO-8 + apuesta D)
3. **Activar la vista de Inbox.** Hoy es placeholder "pronto" (`apps/dashboard/src/pages/index.astro`)
   pese a haber raws reales y `list_inbox` ya expuesto.
4. **Bug latente DST.** Offset `+2h` fijo (`apps/dashboard/src/lib/surreal.ts` `MADRID_DAY`);
   se romperá en horario de invierno (debería ser +1h/CET). Calcular el offset real o usar TZ.
5. **Vista de Objetivos / MITs huérfanas / panel de coaching de ritual** (apuesta D).
   Solapa con los Objetivos del ciclo semanal — mejor abordarlo cuando existan objetivos.

### Rituales (apuesta B, a medias)
6. **`review_day` no estampa `last_reviewed_at`.** Cerrar el día no marca las notas como
   revisadas, así que el radar de "nunca revisado" (`last_reviewed_at IS NONE`) no funciona.
   (Sembrar objetivos era la otra mitad de la apuesta B, ya aparcado.)

### Deuda fina (BAJO-9)
7. **`domain.ts` `PROPOSAL_STATUSES` sin `superseded`.** Solo `['draft','committed','discarded']`,
   pero el schema y 71 filas vivas usan `superseded`. Drift del que `domain.ts` se declara SSOT.
8. **ADRs citan piezas retiradas** (`supports`, "reports"). Prosa desfasada (no rompe runtime).
9. **Driver `surrealdb ^2.0.3` vs engine 3.0.5** — posible skew de versión a revisar.
10. **71 proposals `superseded` inflando la tabla** (24 committed vs ~94 commits reales en
    `agent_event`). Ligado al aplanado del génesis.
11. **`routine`: 0 notas.** Decidir si se activa o se quita del seed.

---

## Recomendación de orden

**Combo quick-win (autónomo, bajo riesgo, alto valor visible):** #3 (Inbox) + #6
(`last_reviewed_at`) + #7 (`superseded`) + #4 (DST). Deja dashboard y rituales más
completos sin tocar nada arriesgado.

**Mayor valor estructural pero más cuidado:** #1 + #2 (robustez ops — compose,
volúmenes, scripts test/prod).

**Cuando se retome el ciclo semanal:** Objetivos (CRÍTICO-2) + prompts `plan_week`/
`review_week` + decisión `mit_for` histórico + apuesta D del dashboard.
