# Roadmap: recuperación en contexto + confianza ("Vía A ligera")

**Fecha**: 2026-05-26
**Estado**: Propuesta (no implementado)
**Origen**: sesión de investigación con agentes (5 de estudio + 4 de propuesta) sobre integración KG↔LLM, aterrizada al código real de Huygens.

---

## 0. Contexto y decisión rectora

Se evaluó la hipótesis de "Graph-Injected LLM" (inyectar subgrafos del KG en el espacio latente de un LLM vía GNN + proyector + LoRA, stack Modular MAX/Mojo). **Descartada para Huygens** por evidencia concreta:

- **No es novedosa**: es prior art establecido (GraphToken, GNP/AAAI'24, G-Retriever/NeurIPS'24, GraphGPT, LLaGA, KoPA…).
- **No supera al texto**: el ablation de *"A Graph Talks, But Who's Listening?"* (arXiv 2508.20583) muestra que un soft-prompt **solo de texto** iguala al modelo grafo-lenguaje completo → la inyección latente no aporta sobre **verbalizar el subgrafo en texto**.
- **Mal encaje de escala**: el grafo personal (cientos de nodos ≈ 15-50k tokens) **cabe entero en contexto**; no hay problema de recuperación a resolver que justifique entrenar un proyector.
- **MAX no entrena** (es motor de inferencia: *"MAX supports model inference only"*); el informe original confundía infra de entrenamiento con serving. El "mínimo 80GB" estaba inflado ~3-5× (LoRA sobre 8B entra en 24GB / QLoRA ~16GB).
- **Coste/auditabilidad**: dataset [grafo↔texto] inviable a escala personal; un embedding inyectado no es citable — lo contrario de lo que quiere una *memoria de confianza*.

**Lo que SÍ aplica** (y vertebra este roadmap): recuperar el subgrafo relevante y **verbalizarlo a texto compacto** para el contexto del agente, con **buena serialización** (la codificación texto→grafo mueve el rendimiento del LLM entre +4.8% y +61.8% — *"Talk like a Graph"*, Google), recuperación **híbrida** (vector + grafo), selección de subgrafo **conexo** (estilo G-Retriever), y **faithfulness/procedencia** verificable sobre tripletas del grafo. Todo **en contexto, sin entrenar nada, auditable**.

---

## 1. Las dos ideas-clave (mayor palanca)

**(I) El conocimiento "grafo → texto" existe pero está disperso y ausente donde más importa.**
Hay buena verbalización en `apps/mcp/src/tools/proposal-render.ts:99` (flechas tipadas `from —kind→ to`) y en el dashboard (`apps/dashboard/src/lib/graph.ts:113`), pero:
- Las tools de lectura usan **4 mini-formatos distintos** para los mismos campos: `list-by-type.ts:62`, `list-mits.ts:72`, `find-related.ts:114`, `vector-search.ts:120`.
- Los **embeddings se generan sobre `block.content` pelado** (`index-block.ts:43-50`); el breadcrumb jerárquico que `chunk.ts:5` ya calcula **se descarta antes de embeber** (`chunk-markdown.ts:28` lo promete pero nunca llega al vector).
- El etiquetador reusable existe pero está **cautivo del flujo de proposals** (`proposal/context-labels.ts:42-57`).

→ Un **módulo único `serialize.ts`** es la piedra angular que destraba recuperación, búsqueda y embeddings.

**(II) La procedencia se ESCRIBE pero nunca se LEE.**
`derived_from`/`about`/`affects` se persisten con campos semánticos (`transformation` verbatim/extracted/summarized/inferred — `schema.surql:172-192`), pero **ninguna tool de lectura los devuelve**: `find-related.ts:92-106` y `vector-search.ts:102-110` no traen procedencia; `get-raw.ts:54-56` solo traza una dirección (raw→records). → El agente **no puede citar de dónde sale lo que afirma** ni distinguir "esto lo dijiste tú" de "esto lo inferí yo". Hueco central para una memoria *de confianza*.

---

## 2. Roadmap priorizado

Todas las propuestas son **read-only o aditivas** y respetan el modelo (informe-block; sin reports legacy; `part_of` jerárquico de padre único, `schema.surql:154`). Donde algo rozaría schema se marca como **decisión explícita del usuario**, no por iniciativa.

### A. Verbalización (keystone)

- **A1 · `serialize.ts`: módulo único grafo→texto** · Esf. S-M · *keystone*
  Funciones puras `{nodes, edges} → Markdown compacto` con jerarquía, tipos de relación, estado ZTD y procedencia **explícitos**. Lo consumen A2/A3/B1/B2/C1 y puede respaldar `proposal-render.ts`. Consolida lo que hoy está duplicado (`context-labels.ts:42-57`, `proposal-render.ts:99`, `graph.ts:113`).

- **A2 · Embeddings contextualizados** · Esf. M · ROI **muy alto**
  Anteponer una cabecera de contexto (tipo+título de la nota padre, estado, breadcrumb `part_of`, y para narrativos los `about`/`derived_from`) **antes de embeber** en `index-block.ts`. Hoy se embebe `content` huérfano; el breadcrumb de `chunk.ts:5` se tira. Es el cuello de botella real de la calidad semántica. Implica re-indexar (corpus pequeño → barato). Resolver el breadcrumb **en runtime** (no añadir campo a `block` salvo decisión explícita).

- **A3 · Unificar salida de las tools de lectura + contexto en snippets** · Esf. S · sobre A1
  Que `list_notes_by_type`, `list_mits_for_date`, `find_related`, `vector_search`, `get_raw` emitan el formato de A1 (hoy 4 convenciones). `vector_search` ya carga `note.title/state/type` (`vector-search.ts:88-94`) pero los desperdicia (`:120`).

### B. Recuperación (subgrafo → texto)

- **B1 · `neighborhood`: subgrafo de N-saltos verbalizado** · Esf. M · ROI **muy alto**
  Tool de lectura nueva: semilla (`note:`/`block:`) → BFS tipado hasta `hops`/`max_nodes` por los 6 edges → texto verbalizado (A1). Hoy **no existe**: la búsqueda es solo vectorial (`vector_search`/`find_related`) o grafo-crudo manual (`query_query` → JSON sin verbalizar). Único traversal actual: `get-raw.ts:54-56` (un edge, una dirección).

- **B2 · `expand_context`: híbrido vector→grafo conexo** · Esf. M · sobre A1+B1
  Query NL → semillas por KNN (`findRelatedImpl`) → expansión de vecindario conexo (B1) → un bloque de texto coherente. Es el "G-Retriever ligero" y el modo por defecto que el agente querrá el 80% de las veces.

### C. Confianza / faithfulness (procedencia escrita pero no leída)

- **C1 · `trace_provenance`: leer y citar la traza** · Esf. S · ROI **muy alto**
  Dado `note:`/`block:`, devolver `derived_from` (con `transformation`) + `about`/`affects` (con `action`/`summary`). Espejo de lectura de `get_raw`. Convierte el `transformation` ya almacenado (`schema.surql:190`) en señal de confianza utilizable (palabra del usuario vs inferencia del agente).

- **C2 · Flag de procedencia en `vector_search`/`find_related`** · Esf. S
  Añadir `has_provenance`/`transformation`/`derived_from_count` a cada hit (datos ya presentes). Sesga al agente hacia afirmar lo respaldado y dudar de lo inferido.

- **C3 · `check_claim`: afirmación→tripletas→contraste con el grafo** · Esf. M
  El agente descompone su afirmación en tripletas con el vocabulario real (`domain.ts:37-47`); el tool devuelve `supported`/`contradicted`/`unsupported` por tripleta. `contradicted` es el de mayor valor (atrapa la alucinación que afirma lo contrario de lo guardado; ej. padre `part_of` distinto, estado opuesto). Empezar solo por topología + estado (verificable de forma determinista). Registrar verificaciones como `agent_event` ampliaría `EVENT_KINDS` (`domain.ts:67`) → **decisión explícita**.

### D. Loop / ritual / robustez

- **D1 · Validación de schema al boot** · Esf. S · *quick win*
  `INFO FOR DB` al arrancar `index.ts` y comparar contra las tablas esperadas; error legible (`bun run db:apply`) en vez de fallos runtime opacos (las tablas SCHEMALESS se crean implícitas → `commit_proposal`/`find_related` revientan tarde). Cierra ARCH-004.

- **D2 · Servir el prompt del ritual de inbox** · Esf. S · *quick win*
  `PROMPT_ENTRIES` está **vacío** (`lore-and-prompts.ts:30`) pese a existir la maquinaria. Servir el ritual canónico (listar pending → agrupar raws → debatir interpretación → narrative blocks + mutaciones visibles → commit) lo hace recuperable por cualquier cliente (Claude Code, Codex, Hermes). Que el prompt derive de `CONVENTIONS.md`, no lo duplique.

- **D3 · Loop de revisión ZTD: `list_stale_notes`/`mark_reviewed`** · Esf. M · estructural
  `last_reviewed_at` y su índice existen (`schema.surql:92,100`) y `MODEL.md:131` lo lista, pero **ninguna tool lo escribe ni lo lee** → infraestructura muerta. Sin revisión, las notes ACTIVE/WAITING se pudren. Mantenerlo como lectura + sello manual (sin RRULE engine, fuera de scope `MODEL.md:206`).

- **D4 · Invariante `block_order`** · Esf. S · preventivo
  No hay `DEFINE EVENT` que mantenga `note.block_order` (`schema.surql:82`); hoy solo `appendBlocks` (`commit.ts:102-113`) lo cuida por convención. Cualquier futura tool escritora puede dejar bloques invisibles o referencias colgantes. Empezar por un test de consistencia (un `DEFINE EVENT` es schema → decisión explícita).

- **D5 · Reconexión del singleton ante drops** · Esf. S
  `surreal.ts:62-65` solo reautentica ante errores de **auth**; un WebSocket caído (restart/idle) no se recupera y deja el cliente muerto hasta reiniciar el MCP (relevante en hermes vía systemd, sesiones de días).

- **D6 · Dead-letter para `emitEvent`** · Esf. S
  `events.ts:38-42` traga el error en `console.error`; si la BBDD parpadea se pierde el `agent_event` que más importaba (ADR-0019 declara la trazabilidad no negociable).

- **D7 · Vista de inbox en el dashboard** · Esf. M · UX
  El dashboard solo ve proposals (`pages/index.astro`, `proposals/[id].astro`); es ciego a la **cabeza** del flujo (captura→inbox→sesión). `listInbox` ya existe en el MCP. Mantener read-only.

---

## 3. Primer lote recomendado (barato + alta palanca + convergente)

**A1 (keystone) → A2 + C1 + D1 + D2.** Casi todas **S**; entre las cinco: el agente *lee mejor* el grafo, los embeddings *recuperan mejor*, el agente puede *citar* su fuente, el MCP *falla legible* al arrancar, y el ritual central queda *servido*. Después: la línea de recuperación (B1→B2) y el loop de revisión (D3).

---

## 4. Notas

- **Lo que NO se hará**: GNN, proyector entrenado, inyección latente de tensores, dataset [grafo↔texto], entrenamiento, MAX/Mojo para esto. Descartado en §0.
- **Deuda de docs**: `docs/issues/2026-05-21-architecture-review.md` está desincronizado con el código v2.1-lite (marca como crítico p.ej. la atomicidad del commit, ya resuelta en `commit.ts`; y referencia `commit_clarify`/`generate_report`/worker ya eliminados). Conviene actualizarlo para no inducir trabajo fantasma.

## 5. Referencias
- "A Graph Talks, But Who's Listening?" — https://arxiv.org/abs/2508.20583 (ablation: texto ≈ inyección latente)
- "Talk like a Graph" (Google) — https://arxiv.org/abs/2310.04560 (la codificación importa: +4.8–61.8%)
- GraphToken — https://arxiv.org/abs/2402.05862 · G-Retriever — https://arxiv.org/abs/2402.07630 · GNP — https://arxiv.org/abs/2309.15427
- GraphEval (faithfulness por tripletas+NLI) — https://arxiv.org/abs/2407.10793
- Modular MAX "inference only" — https://docs.modular.com/max/serve/lora-adapters/
