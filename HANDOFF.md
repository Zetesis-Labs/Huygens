# HANDOFF — migración a event-sourcing / genesis commit

> Estado al cierre del **2026-06-02**. Rama `feat/changefeed-traceability` (sin mergear, sin desplegar a prod). Prod `huygens/main` **intacto**. Seguimos mañana.

---

## TL;DR / decisión tomada hoy

El dashboard de la rama **no funciona con los datos viejos de prod** porque el refactor *máximo-limpio* hace que el código lea `note_creates[].id` (ids reales), pero **todos los proposals viejos de prod usan `temp_id`**. Intentamos migrar los payloads viejos → máximo-limpio, pero **no es recuperable de forma fiable** (31 de 71 commits no tienen el mapa `temp→real`).

**Decisión:** **NO** migrar payload a payload, **NI** adaptar el código a legacy. En su lugar:

> **Aplanar todo el histórico viejo en un único commit "génesis"** (snapshot máximo-limpio del grafo actual, con los ids reales que ya existen) y arrancar el log de event-sourcing desde ahí. *"Aplanar esos viejos en un commit inicial y pista."*

---

## Contexto / a dónde vamos

Huygens evoluciona hacia **event-sourcing**: los **proposals committed = log de eventos (verdad)**; el **grafo (note/block/edges) = proyección reconstruible**. Garantía por construcción: *nada que escriba fuera del flujo de proposals sobrevive a un `rebuild()`*.

Modelo **máximo-limpio** (ya implementado en la rama): en `create_proposal` se pre-generan los ids reales (`realizePayload`), el payload almacenado habla solo de ids reales (sin `temp_id`), y `proposal.result` se reduce al ancla `{ versionstamp, committed_at }`.

---

## Lo que YA está hecho en la rama (commiteado)

- **`02050d3`** — Fase 1 (A): la **vista del proposal en el dashboard** se reconstruye desde el **SSOT (fold)**, no desde el changefeed. `proposalView.ts` usa `foldTopology(listCommittedProposalsBefore(committedAt))`. Coherente con el Diario.
- **`c5645c4`** — Fase 2: **`rebuild()`** (event-sourcing, el núcleo). Verificado en namespace aislado: grafo idéntico tras rebuild (notas con updates en orden, edges, ids narrativos), **log intacto** (`committed_at` preservado).
  - `apps/mcp/src/tools/proposal/commit.ts` → **`buildReplayTx(payload)`**: transacción solo-grafo (sin `finalize` → no toca el log).
  - `apps/mcp/src/tools/proposal/rebuild.ts` → **`rebuildGraphImpl()`**: vacía las tablas de proyección (`note, block, part_of, blocked_by, mentions, about, affects, derived_from`) y re-ejecuta cada committed en orden de `committed_at`.
  - `apps/mcp/scripts/rebuild-graph.ts` + script `db:rebuild`.
  - Caveats de `rebuild()`: ids de bloques **descriptivos** se regeneran (no van pre-asignados en el payload); timestamps de metadatos del grafo (`updated_at`/`topologized_at`) quedan a hora-de-rebuild (el grafo es caché); **embeddings NO** se reconstruyen (re-indexar `index_block` después).

Working tree **limpio**. El shim de compatibilidad legacy que se empezó en `packages/graph/src/index.ts` fue **revertido** (decisión: migrar datos, no adaptar código).

---

## El blocker (por qué el dashboard "no funciona aun")

- El **502** inicial era el dev server colgado en un "Restarting…" (lo disparó un edit a `package.json`). **Resuelto** reiniciando el contenedor (`docker restart huygens-huygens-dashboard-1`). Home/chat/explorer → 200.
- El error real al abrir el Diario `/?day=2026-05-29`:
  ```
  Error: undefined is not an object (evaluating 'id.includes')
  ```
  Causa: `proposalToFlow` (en `packages/graph/src/index.ts`, línea ~116) hace `nodes.set(n.id, { id: n.id, … })` sobre `payload.note_creates`. En los payloads viejos **`n.id` es `undefined`** (llevan `n.temp_id`) → ids `undefined` → revienta en `proposalView.ts` (`flow.nodes.map(n=>n.id).filter(nid => nid.includes(':'))`).
- `fuseProposals`/`foldTopology` **sí** remapean `temp→real` vía `tempMap`, pero solo si `proposalToFlow` emite el `temp_id` como id — y el refactor lo cambió a `id`. De ahí la incompatibilidad total con datos viejos.

---

## Inventario de datos de prod (huygens/main) — diagnóstico de hoy

```
proposals:  71 committed · 4 discarded · 0 draft
```

- **Los 71 committed son formato viejo** (`payload.narrative_blocks[0].temp_id` presente en los 71).
- **Solo 40/71** tienen `result.temp_ids` (mapa autoritativo `temp→real`, shape `{ notes:{}, blocks:{} }`).
- **31/71 NO** tienen el mapa: **30 no tienen `result` en absoluto** (`has_result:false`, `has_vs:false`) y **1** tiene `result`+`versionstamp` pero sin `temp_ids`. Son los commits más antiguos.
- Esos 31 tienen 0–4 `note_creates` y 1–2 `narrative_blocks` cada uno; los **títulos son distintivos** (recuperables por match, pero con riesgo: un `note_update` posterior pudo cambiar el título → match por título no es bulletproof).

**Conclusión:** migración determinista payload→payload **inviable** para 31/71. Por eso → **commit génesis**.

### Shapes relevantes (para mañana)

- **`StoredProposalPayload`** (destino máximo-limpio) en `apps/mcp/src/tools/proposal/schemas.ts:142`:
  - `narrative_blocks: { id, content, raw_ids }[]`
  - `note_creates: { id, type_slug, title, state, mit_for?, metadata?, descriptive_blocks:[{content}] }[]`
  - `note_updates: { id, title?, state?, mit_for?, metadata_merge?, descriptive_blocks_append:[{content}] }[]`
  - `edges: { kind, from, to, reason? }[]` · `edges_remove: { kind, from, to }[]`
  - `about: { block_id, note_id }[]` · `affects: { block_id, note_id, action, summary? }[]`
- **`realizePayload(input)`** en `apps/mcp/src/tools/proposal/crud.ts:31` — patrón a clonar para el génesis (genera ids reales + remapea refs). `newId(table) = `${table}:${uuidv7().replace(/-/g,'')}``.
- **`result.temp_ids`** legacy: `{ notes: Record<temp,"note:real">, blocks: Record<temp,"block:real"> }` (schemas.ts:189).

---

## Plan para mañana — commit génesis ("aplanar")

Construir **un único proposal máximo-limpio** que, al ejecutarse/replayarse, **reproduzca exactamente el grafo vivo actual** (con los ids reales que YA existen, para ser fiel):

1. **Leer el grafo vivo de prod** (read-only): todas las `note` (id real, type_slug, title, state, mit_for, metadata), todos los `block` (narrative/descriptive, content, raw_ids vía `derived_from`), y todos los edges (`part_of`, `blocked_by`, `mentions`, `about`, `affects`, `derived_from`).
2. **Serializarlo como un `StoredProposalPayload`** con esos ids reales:
   - notes → `note_creates` (con su state/type/metadata actuales).
   - narrative blocks → `narrative_blocks` (id real + content + raw_ids).
   - descriptive blocks → como `descriptive_blocks` de su nota (vía la relación actual block↔note / block_order).
   - edges note↔note → `edges`; `about`/`affects` → sus arrays; `derived_from` se reconstruye desde `narrative_blocks[].raw_ids`.
   - `raw_ids` = unión de los raws referenciados.
3. **Crear el proposal génesis** (status `committed`, `result = { versionstamp:NONE, committed_at: <ts del grafo / time::now()> }`), p.ej. `proposal:genesis` o un id uuidv7.
4. **Decidir qué hacer con los 71+4 viejos**: marcarlos `archived`/`superseded` (no `committed`) para que **no entren en `foldTopology`/`rebuild`**, pero conservarlos como evidencia histórica. (Definir el estado/flag mañana — ojo que `rebuild` filtra por `status='committed'`.)
5. **Verificar en ns aislado** (con copia de prod): `rebuild()` desde solo el génesis debe reproducir el grafo idéntico; el dashboard (Diario + vista proposal) debe abrir sin el error `id.includes`.
6. **Aplicar a prod** (con backup) y **re-indexar embeddings**. Reiniciar dashboard.

> Detalle a resolver: el génesis tendrá **muchísimos** note_creates/edges en un payload — validar que el dashboard lo renderiza bien y que `buildReplayTx` lo ejecuta en una sola transacción sin problemas de tamaño. Alternativa: génesis como caso especial de replay (no como proposal "visible" en el Diario).

---

## Cosas sueltas / pendientes

- **Reconciliación** (¿todos los nodos vienen de un commit?): **bloqueada** por el formato viejo; el commit génesis la hace trivial (todo el grafo pasa a venir del génesis).
- **Changefeed** (aclaración de hoy): ya **no lo usa el dashboard** (Fase 1). Lo sigue usando `get_proposal_changes`. Hay **código lector muerto** (`replayEdgesAmong`, `scanEdgesAmongAt`, `labelsAtVersion` en `apps/dashboard/src/lib/surreal.ts`). **"Desactivar" (quitar `CHANGEFEED 10y` del schema, deja de loguear) ≠ "quitar del código" (borrar lectores muertos)** — son pasos independientes, ninguno hecho aún. Aplazado.
- **Mutación huérfana Casa Roma/Domótica**: el commit génesis (snapshot del estado actual) la "fija" tal cual esté ahora; revisar si el estado actual es el correcto antes de congelarlo.
- **Backups**: copia previa de hoy en `backups/huygens-pre-recon-20260602-011413.surql` (5.6M).
- **NO desplegado / NO mergeado**: todo en la rama `feat/changefeed-traceability`.

## Comandos útiles

```bash
# contenedores
docker ps --format '{{.Names}}\t{{.Status}}' | grep huygens
docker restart huygens-huygens-dashboard-1

# SQL prod (read-only para inspeccionar)
printf "SELECT ...;" | docker exec -i huygens-surrealdb-1 /surreal sql \
  --endpoint http://localhost:8000 --user root --pass root \
  --namespace huygens --database main --json

# typecheck / test MCP
docker exec -w /workspace huygens-huygens-dashboard-1 bun --filter '@huygens/mcp' typecheck
docker exec -w /workspace huygens-huygens-dashboard-1 bun --filter '@huygens/mcp' test

# rebuild (Fase 2) — ¡solo en ns aislado por ahora!
#   ns aislado de pruebas: SURREAL_NS=test SURREAL_DB=skeleton (mismo motor, no toca prod)
```
