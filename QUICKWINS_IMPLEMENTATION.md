# Quick-wins Huygens — Guía de implementación gradual

> **Filtros · Vistas · Jump-to · Plantillas**
> Síntesis de arquitectura (3 agentes sobre el código real) → plan de implementación por fases.
> Nodo en Huygens: proyecto `note:qzzf8pl6f6gc2e1x88gj` ("Huygens / Quick-wins: filtros, vistas y jump-to"), `part_of` el proyecto Huygens.
> Fecha: 2026-05-27.

---

## 0. Resumen ejecutivo

**Veredicto:** la arquitectura óptima es una **capa de filtros declarativos en SurrealDB/MCP** + **reutilizar la infra temporal que ya existe** (ADR-0025) + **React Flow gobernado por un `ViewState` unificado**. **~70% de los cimientos ya están construidos** → esto es ensamblaje, no obra nueva.

**Orden (por retorno/esfuerzo):** QW0 → QW1 → QW2 → QW3 → QW4 (núcleo: barra de filtros + vistas/favoritos guardados y manejables por el agente), luego QW5 → QW6 (el "wow" temporal).

**Decisión clave (contradicción resuelta):** las vistas/filtros se persisten en **SurrealDB** (no en localStorage), porque el requisito "*un agente con acceso a sus propias queries guardadas*" lo exige. La UI guarda **llamando a la tool MCP `save_view`** vía endpoint Astro server-side, **nunca escribiendo en Surreal directamente**.

---

## 1. Estado actual del código (lo que se reutiliza, no se reescribe)

| Capa | Elección actual | Evidencia |
|---|---|---|
| Framework UI | Astro 5 SSR (`output:'server'`, adapter node) + islas React 19 | `apps/dashboard/package.json`, `astro.config.mjs` |
| Render de grafos | **@xyflow/react v12 (React Flow)** — ya en producción | `apps/dashboard/package.json`, `components/graph/GraphCanvas.tsx` |
| Layout | `elkjs` 0.9 radial, server-side (Worker singleton) | `apps/dashboard/src/lib/layout.ts` |
| Estado UI | React Context + `useState`/`useNodesState`. **Sin Redux/Zustand/React Query** | `components/graph/GraphViewContext.tsx` |
| Acceso a datos | SurrealDB SDK **solo en servidor** (rol `huygens_reader`) | `apps/dashboard/src/lib/surreal.ts` |
| Backend dominio | MCP en TS (`apps/mcp`), **única frontera de persistencia** | `apps/mcp/src/server.ts`, `docs/UI_STRATEGY.md` |
| Schema | SurrealDB, estilo `DEFINE TABLE OVERWRITE` idempotente | `apps/mcp/surreal/schema.surql` |
| Enums dominio | tipos/estados/edges/kinds (única fuente de verdad) | `apps/mcp/src/domain.ts` |

**Ya existe y se reutiliza:**
- `GraphViewContext` **ya es un proto-filtro**: toggles por tipo de nodo, por kind de edge, por "preexistentes" (`GraphViewContext.tsx`, aplicados en `GraphCanvas.tsx`).
- **Infra temporal completa y validada** (ADR-0025): SurrealKV `?versioned=true` + `CHANGEFEED 10y` en tablas críticas + `VERSION` por-id + **replay del changefeed**. Primitivas en `apps/dashboard/src/lib/surreal.ts` (`replayEdgesAmong`, `replayLiveEdges`, `labelsAtVersion`, `existingEdgesAmong`) detrás del seam `TemporalEdgeReader` (`apps/dashboard/src/lib/temporal.ts`, flag `HUYGENS_TEMPORAL=replay|native`).
- `neighborhood()` / `expand()` con budget de nodos y BFS con dedup (`apps/mcp/src/tools/neighborhood.ts`).
- `nodeLabel()` / `verbalizeSubgraph()` (formato grafo→texto, `apps/mcp/src/tools/serialize.ts`).
- `selectByIds()` con el workaround de `$ids` (`apps/mcp/src/surreal.ts`).
- `proposalToFlow()` y `FlowNode`/`FlowEdge` (`apps/dashboard/src/lib/graph.ts`).

> ⚠️ El doc `docs/UI_STRATEGY.md` propone Next.js + shadcn + React Query: **es aspiracional y NO está implementado**. Construir sobre Astro + React Flow + Context, que es el código real.

> ⚠️ El grafo del dashboard hoy es el **change-graph de una proposal** (`pages/proposals/[id].astro`), no el grafo global del KG. Los quick-wins introducen un explorador general seedeado por filtro/vecindario, reutilizando el mismo `GraphCanvas`.

---

## 2. Arquitectura objetivo

```
┌─ SurrealDB ─────────────────────────────────────────────────────┐
│  Dominio: note/block/edges (+ changefeed 10y, VERSION)  ← ya está│
│  Meta-grafo NUEVO:  view · view_template · composes(edge)        │
└─────────────────────────────────────────────────────────────────┘
        ▲ compila Filter JSON → SurrealQL parametrizado (binds, SELECT * FROM $ids)
┌─ MCP (apps/mcp) ────────────────────────────────────────────────┐
│  NUEVO:  run_filter · save_view · list_views · run_view · delete │
│  Temporal NUEVO (TS, sin schema): temporalAxis · temporalSliceAt │
│  Reusa:  expand() · nodeLabel() · replayLiveEdges · labelsAtVer  │
└─────────────────────────────────────────────────────────────────┘
        ▲ endpoints Astro proxy (server-side, rol reader)
┌─ UI (apps/dashboard) ───────────────────────────────────────────┐
│  ViewStateProvider (useReducer) = filtros + vista activa + jump  │
│  FilterBar · ViewsSidebar(favoritos) · GraphCanvas(React Flow)   │
│  NodeContextMenu(jump-to) · JumpToOverlay(scrubber temporal)     │
└─────────────────────────────────────────────────────────────────┘
```

**Contrato unificado (punta a punta):**
```
Filter JSON {anchor, traversal, where}        ← lo que el agente entiende y guarda
   → (compilador TS) → SurrealQL parametrizado
   → FilterResult {nodes[], edges[], truncated}  ≡  TemporalSlice {nodes[], edges[]}
   → sliceToFlow()  (hermana de proposalToFlow ya existente)
   → React Flow
```

**Dos planos de filtrado (decisión de UI):**
- **Visibilidad (cliente, instantáneo):** ocultar tipos/kinds ya cargados → flip de `hidden` **sin re-fetch ni re-layout** (posiciones estables). Da el "todo customizable desde la barra".
- **Dataset (servidor):** cambiar anchor / saltar de vecindario / viajar en el tiempo → `run_filter` / `neighborhood` / `temporalSliceAt`.

---

## 3. Modelo de datos

### 3.1 Tipos TypeScript (fuente: `apps/mcp/src/domain.ts`)

```typescript
// Un FILTRO es declarativo y serializable a JSON. NUNCA SurrealQL crudo.
type Filter = {
  anchor:
    | { kind: 'ids';    ids: string[] }                         // ["note:govoy", ...]
    | { kind: 'type';   type_slugs: NoteTypeSlug[] }            // todas las task
    | { kind: 'all';    table: 'note' | 'block' | 'raw_capture' }
    | { kind: 'vector'; query: string; k: number; threshold: number }
    | { kind: 'view';   view_id: string }                       // composición: arranca de otra vista

  traversal?: {                       // opcional; si ausente, resultado = anchor filtrado
    edges: EdgeKind[]                 // part_of | blocked_by | mentions
    direction: 'out' | 'in' | 'both'
    min_hops: number                  // 0 = incluye el anchor
    max_hops: number                  // 1..3 (budget BFS)
    max_nodes: number                 // ≤ 60 (como neighborhood)
  }

  where?: Predicate
  sort?:  { field: 'updated_at'|'created_at'|'mit_for'|'title'|'score'; dir: 'asc'|'desc' }
  limit?: number
}

type Predicate =
  | { op: 'and'|'or'; clauses: Predicate[] }
  | { op: 'not'; clause: Predicate }
  | { field: 'state';      in: NoteState[] }
  | { field: 'type_slug';  in: NoteTypeSlug[] }
  | { field: 'mit_for';    range: { gte?: string; lt?: string } }
  | { field: 'updated_at'|'created_at'; range: { gte?: string; lt?: string } }
  | { field: 'block_kind'; in: BlockKind[] }
  | { field: 'status';     in: RawStatus[] }
  | { field: 'metadata';   path: string; eq?: unknown; exists?: boolean }
  | { field: 'has_edge';   kind: EdgeKind; direction: 'out'|'in'; to_type?: NoteTypeSlug }

// CONTRATO DE SALIDA (lo consumen la capa temporal y la UI). Forma = GraphSlice.
type FilterResult = {
  filter_id: string | null           // view:id si vino de vista guardada; null si ad-hoc
  resolved_filter: Filter            // filtro efectivo tras resolver composición (auditable)
  node_count: number
  truncated: boolean
  nodes: ResultNode[]
  edges: ResultEdge[]
  generated_at: string               // ISO
}
type ResultNode = {
  id: string; table: 'note'|'block'|'raw_capture'; label: string
  type_slug: string|null; state: NoteState|null; mit_for: string|null
  updated_at: string; created_at: string; score?: number; metadata?: Record<string, unknown>
}
type ResultEdge = { id: string; source: string; target: string; kind: EdgeKind; qualifier?: string }
```

### 3.2 Esquema SurrealDB nuevo (en `apps/mcp/surreal/schema.surql`)

> Meta-grafo, **fuera del vocabulario de edges de dominio**: las vistas no son `note` (evita el approval gate y no contamina inbox/búsqueda/`list_notes_by_type`). **Sin CHANGEFEED** (config de baja cardinalidad, sin valor histórico).

```sql
-- view: un filtro guardado = un "favorito". Unidad que el usuario nombra y reusa.
DEFINE TABLE OVERWRITE view SCHEMAFULL;
DEFINE FIELD OVERWRITE name        ON view TYPE string;
DEFINE FIELD OVERWRITE description ON view TYPE option<string>;
DEFINE FIELD OVERWRITE filter      ON view TYPE object FLEXIBLE;        -- el Filter serializado
DEFINE FIELD OVERWRITE template    ON view TYPE option<record<view_template>>;
DEFINE FIELD OVERWRITE pinned      ON view TYPE bool DEFAULT false;     -- "favorito"
DEFINE FIELD OVERWRITE owner       ON view TYPE string DEFAULT 'user';  -- user | agent | system
DEFINE FIELD OVERWRITE created_at  ON view TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at  ON view TYPE datetime VALUE time::now();
DEFINE INDEX OVERWRITE view_pinned ON view FIELDS pinned;
DEFINE INDEX OVERWRITE view_owner  ON view FIELDS owner;

-- view_template: config de visualización reutilizable (separa "qué datos" de "cómo se muestra").
DEFINE TABLE OVERWRITE view_template SCHEMAFULL;
DEFINE FIELD OVERWRITE name       ON view_template TYPE string;
DEFINE FIELD OVERWRITE layout     ON view_template TYPE string
  ASSERT $value INSIDE ['list','board','graph','timeline','table'];
DEFINE FIELD OVERWRITE config     ON view_template TYPE object FLEXIBLE;
DEFINE FIELD OVERWRITE created_at ON view_template TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at ON view_template TYPE datetime VALUE time::now();

-- composes: composición de vistas (área ▸ proyecto ▸ objetivo). DIFERIDO a fase 2 del motor.
DEFINE TABLE OVERWRITE composes TYPE RELATION FROM view TO view SCHEMAFULL;
DEFINE FIELD OVERWRITE mode ON composes TYPE string ASSERT $value INSIDE ['intersect','union','subtract'];
DEFINE FIELD OVERWRITE created_at ON composes TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE composes_unique ON composes FIELDS in, out, mode UNIQUE;
```

**Composición de filtros (2 niveles):**
- **Intra-filtro:** árbol `Predicate` con `and`/`or`/`not` (cubre el 90%).
- **Inter-vista:** álgebra de conjuntos sobre los record-ids resultado de cada vista, vía edge `composes.mode` ∈ {intersect, union, subtract}. Anchor `{kind:'view'}` permite encadenar. Límite anti-ciclos: profundidad ≤ 4 + detección de ciclo (DFS con set visitados, patrón de `expand()`).

### 3.3 Contratos temporales (jump-to) — en `apps/dashboard/src/lib/temporal.ts`

```typescript
type TemporalAxis = {                 // se pide UNA vez al hacer jump-to (barato)
  focus_id: string
  instants: TemporalInstant[]         // orden ascendente; último = "live"
  current_index: number               // jump in/out mueve este cursor
}
type TemporalInstant = {
  versionstamp: string | null         // ancla de ORDEN (changefeed)
  at: string                          // ISO datetime — etiqueta humana
  is_live: boolean                    // estado actual (sin time-travel)
  cause?: { kind: 'edge_added'|'edge_removed'|'node_state'|'node_created'; detail: string; agent_event_id?: string }
}
type TemporalSlice = {                 // se pide POR instante (lazy/prefetch)
  focus_id: string; instant: TemporalInstant
  nodes: TemporalNode[]; edges: TemporalEdge[]
}
type TemporalNode = { id: string; title: string; type: string; state?: string; hop: number; presence: 'present'|'gone' }
type TemporalEdge = { id: string; source: string; target: string; kind: string }
type TemporalDelta = {                 // lo que la UI ANIMA (calculable client-side)
  from_index: number; to_index: number
  nodes_added: string[]; nodes_removed: string[]
  edges_added: TemporalEdge[]; edges_removed: TemporalEdge[]
  state_changes: { id: string; from?: string; to?: string }[]
}
```

**Primitivas temporales (generalizar lo que ya existe):**
- **A — instantes disponibles:** `SHOW CHANGES FOR TABLE {note,part_of,blocked_by,mentions} SINCE d"1970-01-01T00:00:00Z"` (¡sin `LIMIT`!), filtrar en TS por toques a `focus_id` (`in==X || out==X`) → lista ordenada de `versionstamp`.
- **B — vecindario en T:** `replayLiveEdges(rows, vs)` → set de edges vivo en `vs` → BFS desde `focus_id` con budget (reusa el patrón de `expand()`).
- **C — estado/etiquetas en T:** `SELECT title,type,state FROM note:id VERSION d"…"` **una sentencia por id** (es lo único fiable; el scan está roto). Nodos sin filas → `presence:'gone'`.
- **jump out** = índice−1; **jump in** = índice+1 (último = live, usa `existingEdgesAmong` + `SELECT *` actual).

---

## 4. Capa MCP — tools nuevas (`apps/mcp/src/tools/filter/`)

Seguir el patrón del repo: tool estrecha + Zod shape + `defineTool` + salida texto-legible **y** `jsonBlock` (ver `apps/mcp/src/tools/define-tool.ts`, `expand-context.ts`). Registrar en `apps/mcp/src/server.ts`.

| Tool | Rol | Conexión |
|---|---|---|
| `run_filter` | Ejecuta un `Filter` ad-hoc (sin guardar) → `FilterResult`. | `getReadOnlyDb()` |
| `save_view` | Crea/actualiza una `view` (name, filter, opcional template). → `view:id`. | `getDb()` |
| `list_views` | Lista vistas (filtrable por `pinned`/`owner`). "Tus favoritos". | `getReadOnlyDb()` |
| `run_view` | Resuelve `view:id` (+ composición), compila y ejecuta. | `getReadOnlyDb()` |
| `delete_view` | Borra una vista (no toca dominio). | `getDb()` |

**Reglas del compilador Filter→SurrealQL (críticas):**
- Anchor `ids`/`view` → bind `$ids` (array de `StringRecordId`) y **`SELECT * FROM $ids`** — NUNCA proyección de campos sobre `$ids` (rompe con "Specify a database to use"; ya mitigado en `selectByIds`, `apps/mcp/src/surreal.ts`). La proyección se hace en TS sobre el resultado.
- Anchor `type`/`all` → `SELECT … FROM note WHERE type.slug IN $slugs` (patrón válido, `list-by-type.ts`).
- Anchor `vector` → reusa `findRelatedImpl` (`apps/mcp/src/tools/find-related.ts`) para las semillas.
- Traversal → BFS reusando `expand()` (`neighborhood.ts`), parametrizado por `edges`/`direction`.
- `where` → árbol → cláusulas WHERE parametrizadas (`$p0`, `$p1`, …). **Cero interpolación**, todo bind (regla de `query/query.ts`).

**Por qué Filter JSON declarativo y no SurrealQL guardado:** el agente razona sobre `{anchor, traversal, where}` con enums que ya conoce de `domain.ts` (no sobre dialecto SurrealDB), lo guarda como dato validable, lo recupera por nombre y lo recompone — sin reaprender SurrealQL ni reabrir superficie de inyección. `query_query` queda como escape hatch read-only.

---

## 5. Capa UI (`apps/dashboard`)

**Cambio estructural:** ascender `GraphViewContext` → **`ViewStateProvider` (useReducer)** que unifique filtros + vista activa + jump (hoy hay 2-3 `useEffect` descoordinados que reescriben `hidden`).

```typescript
type ViewState = {
  filters: {
    hiddenTypes: ReadonlySet<string>   // ya existe
    hiddenKinds: ReadonlySet<string>   // ya existe
    showHydrated: boolean              // ya existe
    states?: ReadonlySet<string>       // nuevo (ZTD)
    text?: string                      // nuevo (filtro por título)
  }
  activeView: { id: string; name: string } | null
  jump: { focusId: string | null; hops: number; anchor: 'live' | { committedAt: string; versionstamp: string } } | null
}
```

**Árbol de componentes:**
```
/explorer.astro (o /proposals/[id].astro)   ← SSR: carga datos + lee ?view=/?seed=/?at= de la URL
  └─ <GraphExplorer client:only="react">
       └─ <ViewStateProvider initial={fromURL}>
            ├─ <FilterBar/>          chips derivados de los datos (no hardcode de kinds) + SaveViewButton
            ├─ <ViewsSidebar/>       favoritos: list_views → aplicar 1-click (?view=<id>)
            ├─ <GraphCanvas/>        ya existe; consume filtros derivados
            │    ├─ <CardNode onContextMenu>  → <NodeContextMenu/> (Focus / Jump in / Jump out / Aislar)
            │    └─ <GraphLegend/>   (pasa a leer del nuevo store)
            └─ <JumpToOverlay/>      HUD/scrubber temporal cuando hay jump activo
```

**Flujo de datos y deep-linking:**
- Visibilidad → `dispatch` → `useMemo(hiddenIds)` → `useEffect` → `setRfNodes/Edges(hidden)`. Sin re-fetch.
- Cambio de dataset (seed/instante) → endpoint Astro → `FilterResult`/`TemporalSlice` → `sliceToFlow()` → `layoutGraph()` → `fitView({duration})`.
- Estado serializado a query-string: `?types=-mentions&kinds=-blocked_by&q=govoy&view=mit-hoy` (filtros → `history.replaceState`); `?seed=note:x&hops=2&at=2026-…Z` (jump-to → navegación real / re-SSR). `?view=<id>` aplica el favorito en el primer render.

**Jump-to (2 ejes ortogonales):** *espacial* (Focus → re-fetch `neighborhood` + re-layout + `fitView` animado al foco; jump in/out = hops ±1, 1..3; breadcrumb `focusHistory`) y *temporal* (scrubber recorre `instants`, React Flow anima el `TemporalDelta`). Anti-parpadeo: mantener grafo atenuado + spinner durante el fetch.

**Decisiones UI:** ampliar Context con `useReducer` (no Zustand, ≤60 nodos); **React Flow se queda** (correcto a esta escala); menú contextual propio (~40 líneas, `onNodeContextMenu`); persistencia de vistas **vía MCP, no localStorage**.

---

## 6. Plan de implementación por fases

> Cada fase es independientemente desplegable y demo-able. Nodos Huygens entre paréntesis.

### QW0 · Schema + Zod del Filter (`note:he7e9wx10hosb8civzo4`)
- **Tocar:** `apps/mcp/surreal/schema.surql` (tablas `view`, `view_template`; `composes` puede crearse ya o diferirse).
- **Crear:** Zod del `Filter`/`Predicate` derivado de los enums de `apps/mcp/src/domain.ts`.
- **Aceptación:** `apply-schema.ts` corre idempotente; el schema valida; tipos exportados.

### QW1 · Motor de filtros + 5 tools MCP (`note:n3za9vb5lzg6gn2ee3j6`)  ← *depende QW0*
- **Crear:** `apps/mcp/src/tools/filter/` (engine + compiler + schemas, espejando `apps/mcp/src/tools/proposal/`).
- **Alcance MVP del compilador:** anchor `ids|type|all` + `where` plano (`and`/`or` + state/type/mit_for/updated_at) + `sort`/`limit`. **Sin traversal** (lo cubre `neighborhood`/`expand_context`). **Sin composes** todavía.
- **Tools:** `run_filter`, `save_view`, `list_views`, `run_view`, `delete_view`. Registrar en `server.ts`. Salida = `FilterResult` (§3.1) + `jsonBlock`.
- **Aceptación:** guardar una vista "tasks ACTIVE con mit_for esta semana", recuperarla por nombre y ejecutarla devuelve `FilterResult` correcto. Respeta `SELECT * FROM $ids`.

### QW2 · Endpoints Astro proxy (`note:ul4eiqjxsxzw3shlbkh6`)  ← *depende QW1*
- **Crear:** `apps/dashboard/src/pages/api/` con endpoints server-side (rol reader) que proxean `run_filter`/`save_view`/`list_views`/`run_view`/`delete_view` y `neighborhood`.
- **Aceptación:** la UI puede ejecutar/guardar/listar vistas vía HTTP sin tocar Surreal directamente.

### QW3 · ViewStateProvider + FilterBar + deep-link URL (`note:p4c6s0nqbh79u3nwpldi`)  ← *depende QW2*
- **Refactor:** `GraphViewProvider` → `ViewStateProvider` (`useReducer`), manteniendo `toggleType/Kind/Hydrated`.
- **Crear:** `<FilterBar/>` (chips derivados de los datos) + filtro de texto; serialización a query-string (`replaceState`) + lectura en SSR (`Astro.url.searchParams`).
- **Aceptación:** el grafo se customiza desde la barra (visibilidad instantánea); copiar la URL reabre con los mismos filtros.

### QW4 · ViewsSidebar (favoritos) + plantillas (`note:lo2oc8ipv37suwxl6uvk`)  ← *depende QW3*
- **Crear:** `<ViewsSidebar/>` (lista vía `list_views`, aplicar con 1 clic, `?view=<id>`); `SaveViewButton` (→ `save_view`); plantillas (`view_template`).
- **Aceptación:** guardar "MIT hoy", un clic la aplica; deep-link `?view=` funciona.

### QW5 · Jump-to espacial (`note:r65ubdag2nw1sihwrj4t`)  ← *depende QW3*
- **Crear:** `<NodeContextMenu/>` (`onNodeContextMenu`) con Focus / Jump in / Jump out / Aislar; endpoint `/api/neighborhood` (wrapper de `neighborhoodImpl`) → `sliceToFlow` → `layoutGraph` → `fitView({duration})`; breadcrumb de foco.
- **Aceptación:** click derecho en un nodo salta a su vecindario; +/− hops; "volver" funciona.

### QW6 · Jump-to temporal (`note:x2j03h91fgzl6ix352k7`)  ← *depende QW5*
- **Crear:** `temporalAxis(focusId)` + `temporalSliceAt(focusId, instante)` en `apps/dashboard/src/lib/temporal.ts` (reusa `replayLiveEdges`/`labelsAtVersion` tras el seam); `computeDelta()` puro (testeable como `graph.ts`); scrubber en `<JumpToOverlay/>`; React Flow anima enter/exit + recoloreo por cambio de estado.
- **Alcance MVP:** 1 hop, edges semánticos, budget 30 nodos.
- **Prerequisito:** **verificar que el rol VIEWER puede ejecutar `SHOW CHANGES`** (ADR-0025 lo deja pendiente).
- **Aceptación:** scrubber recorre los instantes del vecindario y anima cómo cambia el entorno del nodo en el tiempo.

---

## 7. Riesgos y gotchas de SurrealDB (consenso de los 3 agentes)

1. **Proyección sobre `$ids`** → `SELECT campos FROM $ids` falla con "Specify a database to use". Usar **`SELECT * FROM $ids`** y proyectar en TS (`apps/mcp/src/surreal.ts`). El compilador DEBE respetarlo.
2. **`VERSION`-scan/traversal roto** en SurrealDB 3.0.5 (#7245) → usar **replay del changefeed + `VERSION` por-id**. Tripwire en `apps/mcp/test/temporal-edges.test.ts` avisa cuando se arregle (flip de flag `HUYGENS_TEMPORAL=native`).
3. **Trampas de changefeed:** `SHOW CHANGES … LIMIT` roto; `SINCE 0`/versionstamp-bajo devuelve vacío; leer `SHOW CHANGES` en la misma tx que la escritura falla. Usar siempre `SINCE d"1970-…"` sin `LIMIT`.
4. **Rol VIEWER + `SHOW CHANGES`:** verificar permiso antes de cualquier demo temporal (el dashboard corre como `huygens_reader`).
5. **`note_type` y `agent_event` sin changefeed:** el `type` histórico puede mostrar el nombre actual, no el de entonces. Riesgo bajo (taxonomía casi inmutable).
6. **Horizonte temporal:** las queries temporales solo funcionan desde que se activó el changefeed / génesis del import a SurrealKV. Degradar con gracia a "live".
7. **`metadata` (`object FLEXIBLE`) sin índices:** predicados sobre `metadata.path` = full-scan en memoria. Aceptable single-user; si una clave se vuelve filtro caliente, promocionarla a campo top-level indexado (precedente `mit_for`).
8. **`part_of` es árbol estricto** (índice UNIQUE → padre único): el traversal `part_of` nunca ve multi-padre. `mentions`/`blocked_by` SÍ son grafo general → BFS con dedup por nodo (`Set` visited, como `expand()`).
9. **Borrado de nodo no cascadea edges:** el BFS debe tolerar endpoints `gone` (campo `presence`).

---

## 8. Punteros de código clave

- **Datos/MCP:** `apps/mcp/src/domain.ts` (enums), `apps/mcp/surreal/schema.surql`, `apps/mcp/scripts/apply-schema.ts`, `apps/mcp/src/server.ts`, `apps/mcp/src/surreal.ts` (`selectByIds`), `apps/mcp/src/tools/neighborhood.ts` (`expand`), `apps/mcp/src/tools/serialize.ts` (`nodeLabel`), `apps/mcp/src/tools/define-tool.ts`, `apps/mcp/src/tools/find-related.ts`, `apps/mcp/src/tools/query/query.ts`.
- **Temporal:** `apps/dashboard/src/lib/temporal.ts` (seam, `commitAnchor`), `apps/dashboard/src/lib/surreal.ts` (`replayEdgesAmong`, `replayLiveEdges`, `labelsAtVersion`, `existingEdgesAmong`, `scanEdgesAmongAt`), `apps/mcp/test/temporal-edges.test.ts` (tripwire), `docs/architecture/0025-temporal-context-reconstruction.md`.
- **UI:** `apps/dashboard/src/components/graph/{GraphViewContext,GraphCanvas,GraphLegend,CardNode,FloatingEdge}.tsx`, `styles.ts`; `apps/dashboard/src/lib/{graph,layout,surreal}.ts`; `apps/dashboard/src/pages/proposals/[id].astro`; `apps/dashboard/package.json`.

---

## 9. Referencias

- ADR-0025 — `docs/architecture/0025-temporal-context-reconstruction.md` (base empírica de la temporalidad).
- ADR-0024 — migración a SurrealKV `?versioned=true`.
- ADR-0022/0023 — tipos `objetivo`/`idea`, promoción de `mit_for`.
- `docs/UI_STRATEGY.md` — estrategia de UI (parcialmente aspiracional; presentation registry para el render modular **futuro**).
- `docs/MODEL.md` / `apps/mcp/src/lore/data-model.md` — modelo de datos canónico.
- Proyecto en Huygens: `note:qzzf8pl6f6gc2e1x88gj` (+ tasks QW0–QW6 con `part_of`/`blocked_by`).

---

## Fuera de alcance (apuestas grandes posteriores)

- Render modular avanzado del grafo (criterios por nº de padres, direccionalidad, estilos de línea) → enganchar en el **presentation registry** (`styles.ts` + `FloatingEdge.tsx`).
- Versionado de esquema / KG temporal histórico completo (rutas a esquemas antiguos).
- Menciones fuertes/débiles desde bloques markdown.
- PayloadCMS → KG (opcional) · KGE/embeddings (descartado).
