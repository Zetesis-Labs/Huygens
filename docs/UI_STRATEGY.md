# UI Strategy

> Documento canónico. Resultado de iteración entre múltiples perspectivas (Claude → Gemini → Codex → Claude refinado → Codex rebuttal → consolidación + override del usuario sobre Tiptap). Sustituye y unifica los borradores previos `UI_STRATEGY_CLAUDE.md` y `UI_STRATEGY_CODEX.md` (este último se conserva como referencia histórica).

---

## Tesis

La UI de Huygens **no debe representar la ontología directamente**. Debe representar workflows estables.

El grafo es la capa de datos. El usuario no quiere "ver el grafo"; quiere capturar, procesar, aprobar, buscar, revisar y navegar memoria estructurada. Si la UI se acopla al schema actual, cada cambio en tipos, edges o blocks fuerza rediseños. Si se acopla a workflows, el modelo puede evolucionar debajo sin romper la experiencia.

Por tanto:

- **NO** construir una UI centrada en graph visualization.
- **NO** hardcodear `note_type` ni edge kinds en componentes React.
- **NO** permitir que la UI escriba directamente en SurrealDB.
- **NO** duplicar semántica de relaciones solo en frontend.
- **SÍ** construir superficies estables: inbox, workbench, search, note detail, explorer, graph slice.
- **SÍ** consumir view models desde el backend/MCP vía un BFF/adaptador fino.
- **SÍ** usar registries compartidos para renderizar relaciones y tipos de forma genérica, **separando dominio (validación) de presentación (render)**.

---

## Principios

### 1. El MCP es la frontera de persistencia

La UI no habla directamente con SurrealDB. Consume MCP tools a través de un BFF/adaptador HTTP fino (Next.js API routes).

**Razón**: el MCP ya es el boundary que protege la base de datos. Saltárselo desde la UI reintroduce mutaciones silenciosas y contratos paralelos. El BFF resuelve transport (CORS, sesiones, streaming SSE para el chat, formateo de errores) sin duplicar lógica de dominio.

### 2. Workflows por encima de tablas

Las pantallas principales NO son CRUDs sobre `raw_capture`, `note`, `block` y `proposal`. Son workflows:

- **Inbox**: revisar capturas pendientes
- **Workbench**: transformar raws en proposal aprobable
- **Search**: recuperar memoria por texto/vector
- **Note detail**: inspeccionar una entidad y su historia
- **Explorer**: filtrar corpus por estado, tipo, fecha, MIT, texto
- **Graph slice**: inspeccionar vecindario local — nunca grafo completo

### 3. View models estables

La UI no pide "dame todos los edges". Pide objetos preparados para render: `InboxItem`, `ProcessingSession`, `ProposalDraft`, `MutationPreview`, `NoteDetail`, `TimelineItem`, `SearchResult`, `GraphSlice`.

**Razón**: estos view models sobreviven a cambios internos del schema mejor que tablas crudas.

### 4. Registries separados: dominio vs presentación

El frontend necesita saber **cómo presentar** tipos y relaciones. El backend necesita saber **qué es válido**. Son dos cosas distintas y deben vivir separadas:

- **Vocabulary registry** en `packages/huygens-domain/`: validación (`kind`, `from`, `to`, `category`, `dangerous_to_create_manually`). Importado por el MCP y por la UI.
- **Presentation registry** en `apps/ui/src/registry/`: render (`label`, `inverse_label`, `renderer`, `visual_weight`, `icon_hint`, `default_visible`). Importado solo por la UI.

**Razón crítica**: el backend NO debe depender de `renderer: "timeline"` para decidir si una relación es válida. Mezclar las dos cosas acopla validación a presentación. Mantenerlas separadas permite que la UI evolucione visualmente sin tocar la validación.

### 5. Generic rendering, custom workflows

Componentes base genéricos: `<Timeline />`, `<RecordCard />`, `<RelationList />`, `<MutationDiff />`, `<MarkdownBlock />`, `<GraphSlice />`, `<MetadataGrid />`, `<CommandPalette />`.

Las pantallas de workflow se diseñan a mano. La estabilidad viene de no acoplar los primitives a entidades concretas.

### 6. Visual diff antes de commit

Aprobar mutaciones requiere verlas. Verde `+` para create, amarillo `~` para update, edges agrupados por categoría (semantic / trace), warnings en rojo. **Nadie aprueba JSON.**

### 7. Chat como motor visible, no apéndice

La conversación con el agente es el modo natural de deliberación en Huygens. El chat NO se esconde por defecto, NO va relegado a un toggle. Está siempre visible (panel lateral redimensionable, default abierto). El usuario puede colapsarlo a 0 si quiere pantalla limpia, pero no es lo normal.

### 8. Desktop-first, mobile como cliente separado

La UI completa es de escritorio. La captura móvil es **otro cliente** — probablemente un cliente MCP-only minimal que solo llama `capture()`. NO intentar hacer la misma UI funcionar en pantalla pequeña.

---

## Arquitectura por capas

```
SurrealDB                  ← capa de datos
  ↓
MCP tools                  ← frontera de persistencia
  ↓
BFF / API adapter          ← Next.js API routes (transport, sesiones, SSE)
  (sin lógica de dominio)
  ↓
View models tipados        ← contratos estables (Zod schemas)
  ↓
Generated TS + hooks       ← codegen desde Zod schemas
  ↓
UI primitives genéricas    ← Timeline, RecordCard, MutationDiff, ...
  ↓
Workflow views             ← /workbench, /search, /note/[id], ...
  ↓
shadcn + Tailwind shell    ← composición visual
```

**Cómo sobrevive evolución**:

- **Schema cambia** → codegen falla en compile → arreglas solo los views afectados
- **Edge nuevo** → entrada al vocabulary + presentation registry → `<RelationList />` lo renderiza automáticamente
- **Workflow cambia** → solo el view específico cambia; primitives y registries intactos
- **Tema visual cambia** → token swap en Tailwind, sin tocar arquitectura

---

## Vocabulary registry (dominio, validación)

Vive en `packages/huygens-domain/`. El MCP lo usa para **validar Proposals**. La UI también lo importa para conocer constraints. **Sin información de presentación.**

```ts
type EdgeVocabularyEntry = {
  kind: string
  category: "semantic" | "trace" | "workflow"
  from: ("note" | "block" | "raw_capture")[]
  to: ("note" | "block" | "raw_capture")[]
  dangerous_to_create_manually?: boolean
}
```

**Categorías**:
- **`semantic`**: relaciones entre notes que expresan conocimiento de dominio (`part_of`, `blocked_by`, `mentions`). Usuario las puede crear vía proposal.
- **`trace`**: relaciones que registran procedencia o causalidad (`derived_from`, `about`, `affects`). **Nunca se crean manualmente** — solo las emite el worker o `commit_proposal`. `dangerous_to_create_manually: true`.
- **`workflow`**: relaciones que el sistema crea como parte de un workflow específico. En v2.1-lite vacía.

Entradas v2.1-lite (vocabulario):

```ts
const edgeVocabulary: EdgeVocabularyEntry[] = [
  { kind: "derived_from", category: "trace",    from: ["block"],          to: ["raw_capture"], dangerous_to_create_manually: true },
  { kind: "about",        category: "trace",    from: ["block"],          to: ["note"],        dangerous_to_create_manually: true },
  { kind: "affects",      category: "trace",    from: ["block"],          to: ["note"],        dangerous_to_create_manually: true },
  { kind: "part_of",      category: "semantic", from: ["note"],           to: ["note"]         },
  { kind: "blocked_by",   category: "semantic", from: ["note"],           to: ["note", "block"] },
  { kind: "mentions",     category: "semantic", from: ["note", "block"],  to: ["note", "block"] }
]
```

Type vocabulary (`note_type`):

```ts
type TypeVocabularyEntry = {
  slug: string
  default_state: NoteState
}
```

8 entries: `task`, `project`, `area`, `routine`, `idea`, `reference`, `person`, `objetivo`. Default state `CLARIFIED` para todos en v2.1-lite.

---

## Presentation registry (solo UI)

Vive en `apps/ui/src/registry/`. Solo la UI lo importa. Define cómo se renderizan los kinds del vocabulary.

### Edge presentation

```ts
type EdgePresentationEntry = {
  kind: string                          // referencia al vocabulary
  label: string
  inverse_label: string
  default_visible: boolean
  visual_weight: "weak" | "normal" | "strong"
  renderer: "relation_list" | "timeline" | "provenance" | "block_reference"
}
```

Entradas v2.1-lite (presentación):

```ts
const edgePresentation: EdgePresentationEntry[] = [
  { kind: "derived_from", label: "Derived from",  inverse_label: "Produced",         default_visible: true,  visual_weight: "normal",   renderer: "provenance"      },
  { kind: "about",        label: "About",         inverse_label: "Discussed by",     default_visible: true,  visual_weight: "normal",   renderer: "block_reference" },
  { kind: "affects",      label: "Affects",       inverse_label: "Affected by",      default_visible: true,  visual_weight: "strong",   renderer: "timeline"        },
  { kind: "part_of",      label: "Part of",       inverse_label: "Contains",         default_visible: true,  visual_weight: "strong",   renderer: "relation_list"   },
  { kind: "blocked_by",   label: "Blocked by",    inverse_label: "Blocks",           default_visible: true,  visual_weight: "strong",   renderer: "relation_list"   },
  { kind: "mentions",     label: "Mentions",      inverse_label: "Mentioned by",     default_visible: false, visual_weight: "weak",     renderer: "relation_list"   }
]
```

### Type presentation

```ts
type TypePresentationEntry = {
  slug: string
  label: string
  description: string
  icon_hint: "check" | "folder" | "map" | "repeat" | "lightbulb" | "book" | "user" | "target"
}
```

8 entries con label legible, descripción y icono semántico por type.

### Field presentation

Para `metadata` bag flexible:

```ts
type FieldPresentationEntry = {
  key: string
  label: string
  type: "string" | "datetime" | "url" | "markdown" | "json" | "reference"
  render_hint: "badge" | "link" | "inline" | "block"
}
```

Entradas iniciales: `url`, `due_date`, `mit_for`, `source_ref`. Fallback a key-value card si aparece campo no registrado.

---

## View models

TypeScript types concretos. Son la API que la UI consume — no SurrealQL crudo.

### `InboxItem`

```ts
type InboxItem = {
  id: string
  content: string
  source_kind: "chat" | "voice" | "manual" | "import" | "agent-self"
  source_ref: string | null
  status: "pending" | "processed" | "ignored" | "deferred"
  created_at: string
  processed_at: string | null
  has_proposal: boolean
}
```

### `ProcessingSession`

```ts
type ProcessingSession = {
  selected_raws: InboxItem[]
  active_proposal: ProposalDraft | null
  related_notes: NoteSummary[]
  warnings: ValidationWarning[]
}
```

### `ProposalDraft`

```ts
type ProposalDraft = {
  id: string
  status: "draft" | "committed" | "discarded"
  raw_captures: string[]
  payload: ProposalPayload
  preview: MutationPreview
  created_at: string
  updated_at: string
}
```

### `MutationPreview`

```ts
type MutationPreview = {
  raw_ids: string[]
  narrative_blocks: PreviewNarrativeBlock[]
  note_creates: PreviewNoteCreate[]
  note_updates: PreviewNoteUpdate[]
  semantic_edges: PreviewEdge[]
  trace_edges: PreviewTraceEdge[]
  validation: {
    status: "valid" | "invalid"
    errors: ValidationWarning[]
  }
}
```

### `NoteDetail`

```ts
type NoteDetail = {
  id: string
  title: string
  type_slug: string | null
  state: NoteState
  metadata: Record<string, unknown>
  descriptive_blocks: MarkdownBlockView[]
  affected_by: TimelineItem[]
  relations: RelationGroup[]
  raw_provenance: ProvenanceItem[]
}
```

### `SearchResult`

```ts
type SearchResult = {
  block_id: string
  block_kind: "descriptive" | "narrative"
  content_snippet: string
  parent_note: { id: string; title: string; type_slug: string | null; state: NoteState } | null
  score: number
  source: "vector" | "text" | "hybrid"
}
```

### `GraphSlice`

```ts
type GraphSlice = {
  seed_id: string
  depth: number
  nodes: GraphNode[]
  edges: GraphEdge[]
  registry_snapshot: {
    edges: EdgePresentationEntry[]
    types: TypePresentationEntry[]
  }
  truncated: boolean
}
```

---

## Workbench v0 — la primera pantalla

Es la pantalla que más justifica salir del chat puro. Procesa raws contra el approval gate.

### Layout — tres zonas, no equivalentes

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Huygens · /workbench                              [⌘K]  [user]           │
├──────────────┬────────────────────────────────────┬────────────────────────┤
│  INBOX       │  PROCESSING                        │  AGENT                 │
│  (240px      │  (flex — la zona grande)            │  (320px default        │
│   fijo)      │                                    │   resizable 200-720)   │
│              │                                    │                        │
│  ▾ pending   │  ┌─ Raw seleccionado ──────────┐   │  user                  │
│  ▸ raw:k3m   │  │ "mañana fisio + revisar     │   │  > vamos a procesar    │
│  ● raw:p9x   │  │  contrato Govoy antes del   │   │    raw:p9x             │
│  ▸ raw:q2v   │  │  viernes"                    │   │                        │
│              │  │ source: chat · raw:p9x       │   │  agent                 │
│  ▾ deferred  │  └──────────────────────────────┘   │  veo dos tasks         │
│  ▸ raw:a1f   │                                    │  distintas — fisio     │
│              │  ┌─ Visual diff ────────────────┐   │  (personal) y Govoy    │
│  ▾ ignored   │  │                              │   │  (proyecto). ¿quieres  │
│   (3 ▾)      │  │ ▸ Narrative block (draft)    │   │  que mantenga fisio    │
│              │  │   "Rubén tiene cita..."      │   │  standalone?           │
│              │  │                              │   │                        │
│              │  │ ▸ Notes                      │   │  > sí                  │
│              │  │   + task   "Fisio mañana"   │   │                        │
│              │  │   + task   "Revisar Govoy"  │   │  agent                 │
│              │  │   ~ project "Govoy" WAITING │   │  llamando              │
│              │  │                              │   │  update_proposal…      │
│              │  │ ▸ Semantic edges             │   │  hecho.                │
│              │  │   task2 ─part_of→ Govoy      │   │                        │
│              │  │                              │   │  [▾ tools used]        │
│              │  │ ▸ Trace edges (read-only)    │   │                        │
│              │  │   block ─derived_from→ ...   │   │  [textarea ────] [↑]   │
│              │  │   block ─about→ Govoy        │   │                        │
│              │  │   block ─affects→ Govoy      │◀──┼── drag handle ──       │
│              │  │   block ─affects→ task2      │   │                        │
│              │  └──────────────────────────────┘   │                        │
├──────────────┴────────────────────────────────────┴────────────────────────┤
│  [Discard ⌘⇧D]  [Defer d]  [Ignore i]                  [Commit ⌘↵] ●green │
└────────────────────────────────────────────────────────────────────────────┘
```

**Decisiones de layout**:
- **Inbox sidebar fija** (240px): lista densa, te orienta siempre.
- **Processing en el centro (flex)**: zona dominante, es la pieza cara de leer.
- **Agent panel derecho redimensionable** (default 320px, drag-resize entre 200-720px): chat **siempre visible**, no escondido. Colapsable a 0px solo si quieres pantalla limpia momentánea, pero NO es el estado por defecto.
- **Footer fijo** con 4 acciones críticas.

### Flujo

1. Seleccionas raw en sidebar (`j`/`k` o click).
2. Conversas con el agente en el panel derecho.
3. El agente llama `create_proposal` con block narrativo + mutaciones.
4. La zona central renderiza `MutationPreview`.
5. Refinas en el chat — agente llama `update_proposal`, diff se re-renderiza.
6. `⌘↵` ejecuta `commit_proposal`, raw desaparece de pending.
7. Siguiente raw.

### Visual diff — anatomía

4 secciones verticales en la zona central:

1. **Narrative block (draft)** — card con borde azul, markdown render del content. Editable con Tiptap si el usuario quiere refinar antes de commit.
2. **Notes** — creates (verde `+`) y updates (amarillo `~`) intercalados; updates con diff de campos cambiados.
3. **Semantic edges** — `part_of`, `blocked_by`, `mentions` listados con flechas, IDs resueltos a títulos. Editables (click → propose edit).
4. **Trace edges (read-only)** — `derived_from`, `about`, `affects` en sección secundaria, label "read-only · system-generated", visualmente más débil (azul/neutral). NO se pueden editar desde la UI.

Separar **semantic** (editables) y **trace** (read-only) es importante: el usuario debe entender qué puede modificar y qué emite el sistema.

### Keyboard shortcuts

| tecla | acción | tool MCP |
|---|---|---|
| `j` / `k` | sig / ant raw en inbox | — |
| `enter` | abrir raw en processing | — |
| `⌘↵` | commit proposal | `commit_proposal` |
| `⌘⇧D` | discard proposal | `discard_proposal` |
| `d` | defer raw seleccionado | `set_raw_status(deferred)` |
| `i` | ignore raw seleccionado | `set_raw_status(ignored)` |
| `⌘K` | command palette (post-v0) | — |
| `⌘\` | toggle agent panel | — |
| `esc` | focus chat input | — |

---

## Otras superficies (priorizadas)

### `/search` + Command palette (`⌘K`) — M2

Búsqueda híbrida (texto literal + vector sobre embeddings de blocks). Resultados con preview, navegación con teclas, links a note padre. Es lo que reemplaza menús jerárquicos en un grafo no jerárquico.

### `/note/[id]` — M3

Generic renderer (`<RecordCard />` + `<RelationList />` + `<MetadataGrid />`):
- Bloques descriptivos ordenados por `block_order`
- Metadata grid (campos conocidos con render específico, desconocidos como key-value)
- Relaciones agrupadas por edge category (semantic, trace)
- Timeline con narrative blocks que afectaron a esta note (`affected_by`)

### `/explorer` — M4

Listado filtrable de notes. Filtros derivados del type/field/edge presentation registries (por type, state, fecha, mit_for, texto).

### `/graph/[seed_id]` — M5

ReactFlow auxiliar. Slice de profundidad N alrededor de un seed. Filtros por edge `category`. **Auxiliar, no central** — se accede desde un nodo concreto.

---

## Visual diff — tratamiento

El visual diff es **determinista y legible**. No decorativo.

**Colores**:
- Verde discreto: create
- Amarillo discreto: update
- Gris: ignore / defer
- Rojo: validation error
- Azul/neutral: trace / provenance

**JSON NUNCA como formato principal**. Puede existir como panel avanzado opcional ("ver payload raw") para debug.

**Separación visual semantic/trace**:
- Semantic edges en sección destacada (click → propose edit)
- Trace edges en sección secundaria con label "read-only · system-generated"

---

## Stack decisions

| Decisión | Recomendación | Razón |
|---|---|---|
| Framework | **Next.js App Router** | Alineado con stack TS del repo. Server components reducen client JS. |
| Component library | **shadcn + Tailwind** | Accessible primitives + copy-paste philosophy = friendly a evolución. |
| State management | **React Query** | Encaja con hooks tipados por codegen. |
| API layer | **BFF/adapter** (Next.js API routes que delegan al MCP) | Transport, CORS, sesiones, streaming SSE para chat. Sin lógica de dominio duplicada. |
| Graph viz | **ReactFlow** | API declarativa, suficiente para slices auxiliares. |
| Forms | **react-hook-form + Zod resolvers** | Tipado + validación compartida con MCP. |
| Editor markdown | **Tiptap** | Edición rica de blocks narrativos durante processing (refinar el draft del agente antes de commit). Para display read-only, markdown renderer plain. |
| Codegen | **Zod schemas como source → TS + hooks** | View models en Zod, TS generated en build. NO desde `schema.surql` crudo. |
| Auth | Diferir | Single-user local en v0. |
| Vector search UI score | Ocultar en v0 | Hasta saber si añade señal útil. |
| Visual theme | **Dark por defecto, single tema en v0** | Sin theming sofisticado. Cambiar es token swap en Tailwind, no arquitectura. No es principio, es default. |

---

## Codegen pipeline

**Orden pragmático** (importante: NO empezar codegen desde `schema.surql`):

1. **View models en Zod** en `packages/huygens-domain/src/view-models/`
2. **Codegen desde esos Zod schemas** hacia cliente (TS types + React Query hooks)
3. **Más adelante**: explorar codegen desde `schema.surql` si aporta valor real

**Razón**: el schema de BD es demasiado bajo nivel para la UI. La UI debe depender del contrato de aplicación, no de tablas.

**Pipeline**:
- Script en `apps/mcp/scripts/emit-view-models.ts` corre en `postbuild` del MCP + `watch` en dev
- Output a `apps/ui/generated/` (gitignored, reconstruido en CI)
- Si un Zod del MCP cambia incompatible, `tsc --noEmit` de la UI rompe inmediatamente

---

## Lo que NO entra en v0

| Pieza | Razón |
|---|---|
| Graph viz central como pantalla principal | Frágil ante evolución. El grafo evolucionará. |
| Dashboard con widgets | No hay métricas estables. |
| Bespoke views por `note_type` (TaskBoard, ProjectKanban...) | Generic renderer cubre 90%. Custom solo cuando duele. |
| Mobile UI completa | Captura móvil es otro cliente. Procesamiento es desktop. |
| Light mode + theming sofisticado | Dark por defecto, un solo tema en v0. |
| Multi-user, permissions, sharing | Single-user por diseño. |
| Notificaciones, recordatorios, calendario | Out of scope ZTD básico. |
| Versioning visible de proposals | `agent_event` ya audita. |
| Drag-and-drop sobre graph para crear edges | Las mutaciones pasan por proposal visible. |
| Edición manual de trace edges (`derived_from`, `about`, `affects`) fuera de proposal | Son `dangerous_to_create_manually`. Solo el sistema las emite. |
| Composición libre de UI por LLM para acciones peligrosas | Todo lo que muta el grafo pasa por approval gate visible. |

---

## Roadmap por milestones

Sin estimaciones de tiempo concretas — el tiempo real dependerá de cuánto código baseline haya que construir alrededor del agente/chat. Milestones por entregable E2E:

### M0 — Contratos

- Definir view models en Zod en `packages/huygens-domain/`
- Definir vocabulary registry (dominio) y presentation registry (UI)
- Definir endpoints/wrappers necesarios en MCP o BFF
- Documentar límites de mutación

### M1 — `/workbench` end-to-end usable

- Inbox pending/deferred funcional con `list_inbox`
- Selección de raws
- Chat inline en panel derecho redimensionable, siempre visible
- Crear/actualizar/discard proposal via tools del MCP
- Visual diff con separación semantic/trace
- Commit/discard/defer/ignore funcionando contra DB real

**Criterio de "M1 cerrado"**: un raw real entra por `capture`, sale por `commit_proposal` via UI, queda persistido en SurrealDB correctamente. Verificable por test E2E.

### M2 — Command palette + búsqueda híbrida

- `⌘K` overlay
- Búsqueda híbrida (texto + vector)
- Navegación a note/detail/provenance

### M3 — `/note/[id]`

- Bloques descriptivos
- Metadata grid (con field presentation registry)
- Timeline de `affects`
- Relaciones agrupadas por edge category

### M4 — `/explorer`

- Filtros derivados de registries
- Listas filtrables por estado, tipo, fecha, MIT

### M5 — `/graph/[seed_id]`

- ReactFlow slice
- Profundidad limitada
- Filtros por edge category

Cada milestone independiente. No avanzar al siguiente sin haber cerrado el anterior con E2E.

---

## Reglas para coding agents

Si un agente implementa esta UI:

1. **Leer primero** `docs/MODEL.md`, `docs/CONVENTIONS.md` y este doc.
2. **NO introducir mutaciones directas** contra SurrealDB desde frontend.
3. **NO reintroducir** `commit_clarify`, `generate_report`, `note_type:note` o `note_type:report` como features de UI.
4. **NO hardcodear edge kinds** en componentes visuales — siempre vía registry.
5. **NO mezclar vocabulary registry (dominio) con presentation registry (UI)** — viven en sitios distintos.
6. **NO hacer graph global** antes de `/workbench`.
7. **NO convertir metadata flexible en schema rígido** de frontend.
8. **Toda acción que cambie topología** debe pasar por proposal visible y aprobación.
9. **El primer objetivo usable es `/workbench`**, no una landing page.
10. **NO permitir creación manual de trace edges** (`derived_from`, `about`, `affects`) desde la UI. Solo el sistema las emite.
11. **Separar visualmente** semantic y trace edges. Trace edges son read-only en la UI.
12. **Chat siempre visible**, panel derecho redimensionable, NO escondido por defecto.

---

## Migración desde no-UI a v0

Pasos en orden, todos ejecutables en el devcontainer:

1. **Workspace** — crear `apps/ui` con Next.js App Router + Bun + Tailwind + shadcn
2. **Domain package** — `packages/huygens-domain` con view model Zod schemas + vocabulary registry
3. **UI presentation registry** — `apps/ui/src/registry/` con edge/type/field presentation entries
4. **BFF adapter** — `apps/ui/src/app/api/mcp/[...]/route.ts` que delega al MCP HTTP transport
5. **Codegen pipeline** — Zod schemas → TS types + React Query hooks
6. **Primitives base** — `<RecordCard />`, `<RelationList />`, `<MutationDiff />`, `<MarkdownBlock />`, `<CommandPalette />`
7. **Workbench** — 3 zonas (sidebar inbox + processing + chat resizable) contra tools reales
8. **E2E** — test que captura un raw, lo procesa vía UI, commitea, verifica el grafo

**Criterio de "v0 terminado"**: ese E2E con un raw real procesado por humano usando solo el UI. No antes.

---

## Decisión provisional

**NO construir una UI completa todavía.**

Sí conviene conservar esta estrategia porque fija una dirección si Huygens necesita interfaz visual. La primera UI que tiene sentido NO es un dashboard ni un grafo: es un workbench de procesamiento deliberado con visual diff de proposals y chat siempre visible como motor de deliberación.

---

## Origen del documento

Este doc es resultado de iteración entre múltiples perspectivas:

1. **Claude v1**: hybrid de primitives + views + codegen desde schema, chat colapsable.
2. **Gemini**: aportó NodeViewer genérico, command palette tipo Raycast, visual diff con verde/amarillo.
3. **Codex v1**: aportó workflows estables como tesis central, view models concretos, registries como contrato, separación trace/semantic, reglas para coding agents.
4. **Claude v2**: sintetizó con estructura de Codex + concreción visual (ASCII mockup) + decisiones cerradas de stack.
5. **Codex rebuttal**: 6 críticas — chat colapsable abajo, fetch directo sin BFF, registry mezclado dominio/presentación, Tiptap inconsistente, dark theme como principio elevado, 6 semanas como timing.
6. **Consolidación** (este doc): adopta 5 críticas (chat siempre visible, BFF adapter, split de registries, dark theme demoted, milestones-by-E2E). Mantiene **Tiptap** por override del usuario (edición rica de blocks narrativos durante processing).

Si en el futuro este doc vuelve a fragmentarse, la regla es: una sola estrategia viva. Dos docs en paralelo generan drift.
