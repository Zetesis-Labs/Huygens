# Limpieza documental — manifest

Fecha de la pasada: 2026-05-21.

Tras el shift al modelo report-centered (`docs/MODEL.md`), se hizo una poda agresiva del corpus documental con múltiples agentes en paralelo. Este doc lista qué se borró, qué se editó quirúrgicamente, y qué quedó pendiente — para que un próximo ciclo de agentes pueda reescribir las partes que faltan sin perderse en arqueología.

Si lees este doc para entender qué pasó: el resumen es que el sistema cambió de "worker autónomo clarifica raws en notas" a "agente genera informes, worker pequeño aplica informes al grafo". El modelo canónico vive en `docs/MODEL.md`. La doc anterior teñía todo de la abstracción vieja, así que se limpió.

---

## 1. Archivos borrados completamente

Cada uno se borró porque su contenido era estructuralmente incompatible con el modelo nuevo (no era cuestión de framing — eran descripciones de un sistema que dejó de existir). Git history los conserva si necesitas releerlos.

### Capa "doctrina operativa"
- **`docs/user-cases.md`** — flujos centrados en morning-planning/weekly-review como ciudadanos primarios. El modelo nuevo no organiza el sistema alrededor de flujos GTD sino del informe.
- **`docs/agents/huygens-domain.md`** — describía el dominio asumiendo worker-clarifies-raws. Reemplazado por `docs/MODEL.md`.
- **`docs/agents/conventions.md`** — reglas operativas para el agente bajo el modelo viejo. Algunas reglas (idempotencia, audit) sobreviven en espíritu pero hay que reescribirlas alineadas con el flujo nuevo.
- **`docs/agents/surrealql-patterns.md`** — queries SurrealQL para el grafo viejo. Tendrá un sucesor cuando estén las queries para `based_on`/`affects`.

### Capa "data model prescriptivo"
- **`docs/research/03-data-model/note-model.md`** — schema Prisma+Mongo + `state=INBOX` por defecto + `pillars`. Era una iteración anterior al pivot a SurrealDB.
- **`docs/research/03-data-model/pillars-and-states.md`** — `Pillar` enum (PATHOS_SOMA/ETHOS/TELOS/SOPHIA) + ciclo de estados completo como load-bearing. Pillars caídos por ADR-0021; sólo CLARIFIED en uso ahora.

### Capa "vision basada en pillars"
- **`docs/research/01-vision/strategic-pillars.md`** — el doc que defendía los 4 pilares estratégicos. Sin pilares, no queda doc.

### Capa "roadmap obsoleto"
- **`docs/research/07-roadmap/v1-current.md`** — snapshot del sistema antes del pivot. No mapea a la realidad actual ni futura.
- **`docs/research/07-roadmap/v2-near-term.md`** — tools planificados (`capture_inbox`, `clarify`, `move_state`) del modelo viejo. Tendrá sucesor cuando se planifique la migración a topologizador.

### Capa "ideas parqueadas inválidas"
- **`docs/architecture/ideas/confidence-scored-clarify.md`** — premisa (gating del auto-commit del clarify) invalidada: el worker ya no clarifica.

### Capa "ADRs invalidados"
- **`docs/architecture/0012-capture-is-uncategorized.md`** — describía captura como "note(type=NONE, state=INBOX)". El modelo nuevo separa raw_capture como tabla propia y captura no crea note alguna.

### Capa "prompts del MCP deferred"
- **`apps/mcp/src/prompts/deferred/morning-planning.md`** — flujo basado en MITs y state transitions (planning phase). Diferidos pero estructuralmente atados al modelo viejo.
- **`apps/mcp/src/prompts/deferred/weekly-review.md`** — mismo. Además, su llamada a `generate_report` usa una firma vieja.

### El directorio `apps/mcp/src/prompts/deferred/` quedó vacío y se eliminó.

**Total: 13 archivos borrados.**

---

## 2. Archivos editados quirúrgicamente

Estos archivos tenían contenido salvable. Se eliminaron las secciones contradictorias y se mantuvieron las que aún aplican.

### Entry points
- **`AGENTS.md`** — Se eliminó la sección "lecturas obligatorias" que mandaba a 3 docs borrados, las descripciones de tools inexistentes (`capture_inbox`, `set_state`, `relate`) y un roadmap obsoleto. Reemplazado por un pointer corto a MODEL.md.
- **`README.md`** — Se eliminó "Modelo de datos: Note + Block" como descripción canónica de la topología, la sección "Estado" con tools pendientes obsoletas, y la "Arquitectura MCP (resumen)" que reflejaba el modelo viejo. Añadido un párrafo corto pointing a MODEL.md.
- **`USING.md`** — Se eliminó la frase de apertura "autonomous worker decomposes them into typed notes", la lista de 8 tools sin `generate_report`, el "5-step clarify pipeline" del worker, y el "What's not done yet" obsoleto. Se conservaron Boot, MCP wiring, capture/query/inspect. Reescrito el framing del worker como "legacy clarify hoy, topologizador per MODEL.md target".
- **`CLAUDE.md`** — Se eliminaron las 4 referencias a docs borrados (`huygens-domain.md`, `conventions.md`, `user-cases.md`). Sustituidas por pointers a MODEL.md donde el flujo de prosa lo requería.
- **`backend/huygens-worker/README.md`** — Se eliminó "(eventually) drives the clarify loop via Agno + LLM" y el framing "Iteration 0: poll-and-log". Reemplazado por una descripción honesta (legacy clarify hoy, topologizador como target per MODEL.md).

### MCP runtime layer
- **`apps/mcp/src/lore/clarify-spec.md`** — Se eliminó la sección de `mit_for` rules, la narrativa de la máquina de estados completa (`ACTIVE/WAITING/SOMEDAY/DONE/ARCHIVED`), y el framing de "worker decomposes raws into Decomposition". Se conservaron las tablas de note types, transformations y edges. Se añadió pointer a MODEL.md como canónico.
- **`apps/mcp/src/lore/data-model.md`** — Se eliminó el field `processed_at` del ejemplo de `raw_capture` y la frase "`processed_at IS NONE` means the worker hasn't clarified it yet". Se conservó el esqueleto de los dos planos.
- **`apps/mcp/src/prompts/clarify-system.md`** — Cuerpo entero reemplazado por una línea: "Pending rewrite as `topologize-system`. Operate as clarifier per existing tool signatures until then." El worker sigue funcionando con esto en el modo legacy.
- **`apps/mcp/src/lore-and-prompts.ts`** — Eliminada la referencia a los prompts deferred borrados; descripciones de los entries actualizadas para reflejar el estado de transición.

### Research surviving
- **`docs/research/CONTEXT.md`** — Eliminadas las decisiones #1 (pillars múltiples por nota) y #2 (capture=note+INBOX state). Reemplazadas por nuevas decisiones que reflejan el modelo de tres fases (capture/synthesize/topologize) y worker como topologizador.
- **`docs/research/01-vision/motivation.md`** — Eliminado `Pillar[]` de la descripción del output y la frase "Cada review se vertebra por los cuatro Pilares Estratégicos". Pillars eliminados como axis de organización.
- **`docs/research/01-vision/user-context.md`** — Eliminado "Pillar" como eje. Tabla "3 axes orthogonales" reducida a "2 axes" (state + type).
- **`docs/research/02-architecture/mcp-composition-patterns.md`** — Eliminada la definición de Pillars con heurísticas + lifecycle GTD completo + framing de captura como `state=INBOX`. Actualizada la lista de edges (incluyendo `based_on`, `affects`) y de note types (10).
- **`docs/research/02-architecture/mcp-three-layer-architecture.md`** — Eliminado el ejemplo concreto del pipeline mostrando `state=INBOX, typeId=null, pillars=[]` y `NoteChunk`. Tools actualizados a la lista actual.
- **`docs/research/03-data-model/relations-and-edges.md`** — Eliminado el edge `touches_pillar`, la discusión "fields vs edges para Type y Pillar", queries por pillar. Añadido `derived_from` a la tabla principal y forward-pointer a `based_on`/`affects`.
- **`docs/research/03-data-model/self-critique.md`** — Eliminadas las secciones #2 (Type=inbox vs state=INBOX) y #5 (Pillar enum vs NoteType model). Renumerados los survivors.
- **`docs/research/03-data-model/topology-as-primary.md`** — Eliminados `OF_TYPE` y `TOUCHES_PILLAR` de la tabla de edges y la framing "report semanal por Pillar". Añadida nota de apertura subordinando topology al informe como artefacto primario.
- **`docs/research/04-database/surrealdb-deep-dive.md`** — Eliminado el campo `pillars` del schema ejemplo, recortada la lista de estados a `['CLARIFIED']`, eliminados pillar records de ejemplos, renombrado `note_chunk` a `block`, eliminada query INBOX-gated, ejemplo de UDF actualizado.
- **`docs/research/05-embeddings-vector/vector-search-strategy.md`** — Eliminada la sección "Por qué no indexar en INBOX", el traversal `->touches_pillar->pillar`, y todas las referencias a `note_chunk`. El pipeline ahora describe indexing de blocks sin gating de estado.
- **`docs/research/07-roadmap/v3-far-future.md`** — Eliminadas referencias a pillars en TDA y tensor representation. Renombrado "weekly review writer" a "report writer".

### Theory / spiritual (anchors load-bearing)
- **`docs/research/06-theory/philosophical-resonances.md`** — Eliminados los anchors específicos en Whitehead/Peirce/Wheeler/wu wei que apuntaban a "agent clarificando inbox" como operación canónica. Argumentos filosóficos sobreviven en forma abstracta.
- **`docs/research/08-spiritual-traditions/05-jewish-mystical-and-hermetic.md`** — Eliminado el fragment INBOX, los dos párrafos articulando tikkun como "agente que mueve notas de INBOX a CLARIFIED", y reescrito el cierre y la línea-259. Argumento tikkun/tzimtzum/shevirat sobrevive.

### ADRs (surgical — historical records, no overwrites)
- **`docs/architecture/0010-pillars-and-state-as-enums.md`** — Eliminado el bloque schema de Pillars y referencia a ADR-0012. Status actualizado para clarificar que sólo CLARIFIED se driven.
- **`docs/architecture/0011-schemafull-edges-with-note-or-block.md`** — Eliminado el claim de "7 edge tables" como completo. Añadida nota de que la lista no es exhaustiva y los nuevos edges viven en MODEL.md.
- **`docs/architecture/0014-three-layer-mcp-architecture.md`** — Eliminado del diagrama el labelado del worker reaccionando a `raw_capture` vía LIVE query. Decisión three-layer conservada.
- **`docs/architecture/0018-autonomous-worker-with-agno.md`** — Eliminada la `Decomposition` Pydantic class, el flow raw+`needs_human_review`, el código sample. Conservadas las decisiones de tech (Agno over LangGraph, Python+uv over Bun).
- **`docs/architecture/0019-event-sourcing-of-agent-decisions.md`** — Eliminados los `kind` values específicos del clarify lifecycle. Conservada la decisión core de event sourcing.
- **`docs/architecture/0023-mit-field-on-note.md`** — Añadida una línea status: "campo reservado en schema, no driven en esta fase".
- **`docs/architecture/0009-block-composed-notes.md`**, **`0016-agent-knowledge-in-docs-agents.md`**, **`0017-raw-capture-separation-and-derived-from.md`**, **`0021-adopt-ztd-drop-pillars.md`**, **`0022-objetivo-and-idea-types.md`** — Eliminadas referencias a docs borrados.
- **`docs/architecture/README.md`** — Removida la entrada de ADR-0012 del índice.
- **`docs/architecture/ideas/README.md`** — Removida la entrada de `confidence-scored-clarify.md`.

### Índices
- **`docs/research/00-index.md`** — Removida la entrada de `strategic-pillars.md`.

### Issues
- **`docs/issues/2026-05-21-architecture-review.md`** — Eliminada referencia a `docs/agents/conventions.md`.

**Total: ~45 archivos editados.**

---

## 3. Las 6 preguntas operacionales abiertas

MODEL.md es conceptualmente cerrado pero deja deliberadamente abiertas algunas decisiones operativas. Listadas aquí para que el próximo ciclo de diseño las atienda en orden:

1. **Cuándo exactamente un raw se convierte en informe** — ¿manual siempre? ¿el agente decide solo en algún caso? ¿qué tamaño/contexto justifica generar uno?

2. **Cómo se mide "informe cercano relacionalmente"** — ¿vector similarity al raw? ¿al subgrafo afectado? ¿k=5 fijo o configurable? ¿threshold mínimo?

3. **Prompt + protocolo del worker topologizador** — MODEL.md dice "LLM produce lista de mutaciones" sin especificar formato, constraints, ni feedback loop. Hay que diseñar este protocolo.

4. **Edición/regeneración de un informe ya topologizado** — ¿se re-topologiza? ¿se reversan los `affects` viejos? ¿el grafo se mantiene auditable durante la revisión?

5. **Captures pequeños** ("cita dentista mañana") — ¿pasan por el ciclo completo? ¿bypass del agente? Hand-waved en MODEL.md.

6. **Topologización manual / ediciones directas** — MODEL.md dice "todo cambio del grafo pasa por informe" pero en la práctica el usuario querrá micro-ediciones. ¿Cómo se reconcilia esto sin convertir el informe en ceremonia?

---

## 4. Implementation gap (conocido, no es bug)

MODEL.md describe el sistema TARGET. El código actual implementa el sistema ANTERIOR:

- `apps/mcp/surreal/schema.surql` aún NO tiene `based_on` ni `affects` edges.
- El worker (`backend/huygens-worker`) sigue clarificando raws en modo legacy.
- `generate_report` existe pero no usa `k_nearby` ni crea `based_on` edges.
- `clarify-system.md` prompt sigue siendo el del clarifier (con cuerpo placeholder).

Esto es deuda intencional. Migrarlo requiere otra conversación de diseño que resuelva al menos las preguntas 2, 3 y 4 de arriba.

---

## 5. Próximo ciclo de agentes — qué reescribir

Cuando volvamos a la doc, hay piezas que faltan y vale la pena escribir frescas:

| pieza | propósito |
|---|---|
| `docs/AGENT.md` o `docs/CONVENTIONS.md` | Reglas operativas para el agente conversacional bajo el modelo nuevo. Antes vivían en `docs/agents/conventions.md`, ahora hay que rehacerlas alineadas con el flujo de tres fases. |
| `docs/QUERIES.md` | Patrones SurrealQL canónicos para el grafo nuevo: cómo navegar `based_on`/`affects`, cómo encontrar informes que afectaron un nodo, etc. Antes vivían en `docs/agents/surrealql-patterns.md`. |
| `docs/WORKER.md` | Protocolo del worker topologizador — el prompt, el formato de salida del LLM, idempotencia, cómo maneja errores. Depende de resolver la pregunta abierta #3. |
| `topologize-spec.md` LORE | Resource servido por el MCP. Reemplaza `clarify-spec.md`. Describe la spec del topologizador para que el LLM sepa qué producir. |
| `topologize-system.md` prompt | Prompt servido por el MCP. Reemplaza `clarify-system.md`. Sistema del worker en modo topologizador. |
| ADRs nuevos (0024-0028+) | Documentar decisiones nuevas — `based_on`/`affects` edges, raw_capture como tabla propia, worker as topologizer, event kinds nuevos, etc. ADRs viejos quedan superseded sin que se escribiera el sucesor (deuda explícita). |
| Nuevo `roadmap/v2.md` | Plan de migración del estado actual al target. |

---

## Cierre

Tras la limpieza, el repo queda con ~50 docs activos (de ~70 iniciales). Los ~20 borrados están en git history. Lo que queda es coherente con MODEL.md o explícitamente histórico (ADRs que registran decisiones pasadas).

Si abres este repo dentro de un mes y todo te parece confuso: empieza por `docs/MODEL.md`. Si no entiendes algún detalle operativo, mira las 6 preguntas abiertas de arriba — probablemente lo que te confunde es justo lo que dejamos sin decidir.
