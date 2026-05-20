# Idea: Feedback Infrastructure

> Status: park, but high-priority park. Prerequisite for `[[soft-pilares]]`, `[[custom-lenses]]`, `[[find-related-reranking]]`, `[[confidence-scored-clarify]]`, `[[predicted-state-transitions]]`. Esta idea debería aterrizar **antes** que cualquiera de ellas.

## TL;DR

`agent_event` registra qué **decidió** el agente; CHANGEFEED registra cómo cambió el estado. Falta el tercer eje: qué resultó **útil**, qué fue **corregido**, qué fue **ignorado**. Añadir unos pocos event kinds nuevos sobre la misma tabla `agent_event` (algunos primary, otros derivados offline desde CHANGEFEED) convierte la observabilidad en dataset de feedback. Sustrato sin el cual toda idea de "aprender el criterio del usuario" tiene cold-start eterno.

## Why it matters for Huygens

Soft Pilares necesita labels. Custom lenses necesita "estos cinco notes los miro juntos". Re-ranking necesita pares (query, hit, ¿consumido?). Confidence-scored clarify necesita saber cuándo una clarify se corrige a las 2 h. Predicted state transitions necesita histórico de "CLARIFIED → ACTIVE a los 3 días".

**Todas comparten el mismo bloqueo**: hoy no se loggea el uso. Loggeamos decisiones y mutaciones, no consumo, corrección, ni ignorancia. No es una feature de Huygens — es la condición de posibilidad de que Huygens aprenda de sí mismo. Sin esto, cada idea posterior arranca con dataset cero y genera el suyo mal y tarde.

Elegancia: `agent_event.payload` ya es `option<object> FLEXIBLE`. No hay que rebuild observabilidad — sólo nombrar y emitir más kinds.

## What it requires

**Primary kinds (TS MCP boundary):**

- `note_accessed` — agente o usuario inspeccionó una note. Payload: actor, note_id, `access_context` (search_hit | direct | navigation).
- `search_executed` — `vector_search` / `find_related`. Payload: `query_hash`, `k`, filters, `top_k_ids`.
- `search_result_consumed` — hit del `search_executed` accedido / citado / enlazado. Derivable de `note_accessed` con `access_context = search_hit`.
- `note_edited` — cambio en title / blocks / state / mit_for / metadata. Higher-level que el diff de CHANGEFEED.
- `link_created` — edge autoral (no `derived_from`, que es del worker).
- `link_followed` — navegación a lo largo de un edge.

**Derived kinds (offline job over CHANGEFEED + `agent_event`):**

- `search_result_ignored` — `search_executed` cuya ventana de ~10 min pasó sin consumed.
- `clarify_corrected` — `commit_succeeded` seguido de `note_edited` sobre la misma note dentro de ~24 h.

**Schema:** todos los kinds viven en `agent_event` (payload `FLEXIBLE`, no breaking — sólo añadir a `EVENT_KINDS` en `apps/mcp/src/domain.ts`). Una sola tabla nueva: `clarify_correction`, caché materializada del join `commit_succeeded ↔ note actual ↔ block_order diff`. Reconstruible desde CHANGEFEED.

**Emit boundaries:** TS MCP emite los 6 primary. El worker Python ya emite decisiones — `related_context_fetched` se desdobla / renombra hacia `note_accessed` con `actor=worker`. Job offline emite los 2 derived.

**Retención:** misma política que `agent_event` (ilimitada). 50 eventos/día → ~10k en 6 meses, trivial. Si crece a millones, particionar por mes o downsample `note_accessed` antiguos.

## Cheapest validation path

Instrumentar **sólo dos** kinds en el MCP TS — `note_accessed` y `search_executed` — y dejar correr una semana. Query simple: ¿los `search_executed` agregados por `query_hash` reflejan lo que subjetivamente recuerdo haber buscado? ¿Las notes con más `note_accessed` son las que considero "vivas"? Si sí, la señal es real. Si los conteos no se parecen a nada que reconozca, hay problema de cobertura antes de seguir.

Coste: una tarde de instrumentación, una semana de espera, una hora de análisis.

## Risks

- **Over-instrumentation** — loggear todo se vuelve ruido. *Mitigación*: los 6 primary y nada más; ningún kind nuevo sin consumidor identificado.
- **Schema drift** — payloads ad-hoc, campos inconsistentes. *Mitigación*: cada kind entra con literal en `EVENT_KINDS` + schema TS validable (zod si llega a doler).
- **Overhead operacional** — 1-3 emits por mutación. *Mitigación*: fire-and-forget, fallo no rompe operación, buffer local 1 s antes de insertar.
- **Chilling effect** — saber que se loggea cambia el comportamiento. *Mitigación*: mínimo en single-user (Rubén loggeando a Rubén). Lo nombro por honestidad y porque si Huygens se abre a otros usuarios cambia la conversación.

## When to revisit

Distinto del resto de ideas en `ideas/`: ésta no espera a un umbral de volumen. **Cue negativo**: cuando vaya a trabajar en cualquiera de las 5 ideas dependientes y compruebe que no tengo datos, esta idea pasa a critical path. El error a evitar es arrancar una idea posterior, instrumentar feedback ad-hoc sólo para ella, y duplicar infraestructura. Indicador concreto: la primera vez que escriba "necesitaría saber si el usuario consumió ese hit" en otro doc, sube de park a next.

## Cross-references

- `[[soft-pilares]]` — labels implícitos (blocks editados juntos, consultados juntos) para bootstrap de prototipos.
- `[[custom-lenses]]` — notes co-accedidas como semilla de un lens.
- `[[find-related-reranking]]` — training set = `search_executed` × `_consumed` vs `_ignored`.
- `[[confidence-scored-clarify]]` — `clarify_corrected` es la métrica honesta de calidad del worker.
- `[[predicted-state-transitions]]` — transiciones observadas (state ↔ state previo via CHANGEFEED) son el target del clasificador.

## Open questions

- **Sampling vs full logging**: trivial hasta 10k/6 meses. A 10M, sampling estratificado por kind (todos los `_consumed`, samplear `note_accessed`).
- **Event versioning**: si `note_accessed.access_context` gana valor nuevo (`from_lens`), ¿versionar el kind (`note_accessed_v2`) o el payload (`schema_version`)? Segundo más barato, primero envejece mejor.
- **Idempotencia del walker derivado**: si re-corro el job sobre el mismo rango, ¿se duplica? Tentativa: `unique(search_executed_id)` + upsert. Pensarlo antes de tener un mes huérfano.
- **¿`note_accessed` para reads del worker?** Llena de auto-eventos no-consumo. Filtrar `actor != 'worker'` o introducir `access_intent` (for_context | for_consumption).
- **Granularidad de `note_edited`**: ¿uno por edit o agregado por sesión? CHANGEFEED ya tiene el diff fino; conviene bursty-agregado para no ahogar la señal.
