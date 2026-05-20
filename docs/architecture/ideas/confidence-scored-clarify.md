# Idea: Confidence-scored Auto-clarify

## TL;DR

Antes de commitear una `Decomposition` del worker, calcular un score `P(Rubén la habría aceptado | features)` con una cabeza ligera entrenada sobre **mis propias correcciones** a clarifies pasados. Por encima del umbral, auto-commit (comportamiento actual). Por debajo, encolar en un estado intermedio `PROPOSED` — fuera de la state machine ZTD — y esperar revisión humana vía un tool MCP `pending_clarify_review()`. El sistema aprende qué me importa observando qué corrijo, sin pedirme reglas.

## Why it matters for Huygens

Hoy el worker es fire-and-forget (ADR-0018): gpt-4o-mini emite una `Decomposition` y `commit_clarify` la materializa verbatim. Si la decomposition es mala — fragmenta lo que debería ser un solo bloque, asigna `type=task` a algo que era `idea`, infiere `mit_for` sin base — la basura entra al grafo y se queda hasta que la encuentro. El cleanup es trabajo silencioso: edito title, parto block, rebajo type, sin que el sistema registre que *eso era una corrección*.

`agent_event` ya graba qué propuso el modelo (ADR-0019), CHANGEFEED 10y ya graba qué quedó después de mi edit (ADR-0020). Tengo los dos extremos del par. Falta cerrar el bucle: convertir esa diferencia en señal y usarla como gate antes del próximo commit. Cleanup pasa a ser training data automáticamente.

## What it requires

- **Data**:
  - Ediciones por note (CHANGEFEED ya retiene 10y → reconstruible)
  - Deletes de decompositions: capturarse como evento explícito (`agent_event` kind `decomposition_reverted`) — no basta con la ausencia
  - Tabla `clarify_correction` (o vista): `raw_capture_id`, `proposed_decomposition` JSON, `final_state_at_T+window`, `correction_kind` ∈ {none, minor, major, reverted}
- **Infrastructure**:
  - Estado **`PROPOSED`** explícitamente **fuera** de la state machine ZTD (`CLARIFIED → ACTIVE → ...`). Es una **cola**, no un paso. Modelado como tabla `proposed_decomposition` aparte o flag `note.is_proposed: bool` invisible a tools normales hasta aceptación
  - Tool MCP `pending_clarify_review(limit, order_by)`, `accept_proposal(id)`, `reject_proposal(id, reason)` — el reject alimenta el dataset
  - Sklearn pipeline serializado en `model/clarify_gate_vN.pkl`, retrain semanal con ≥N correcciones nuevas
  - Definición operativa de "corrección": diff de blocks por edit-distance, diff de `type`/`mit_for` por igualdad, sliding window de ~14 días post-commit (a los 3 meses ya no es corrección, es evolución)
- **Prerequisites**: ≥50 decompositions corregidas para señal real. Antes: heurística determinista (longitud del reasoning_summary, `n_notes > 3`, `inferred` en `mit_for`) como v0.

## Cheapest validation path

Sin tocar el worker. Solo log y notebook:

1. Durante 200 clarifies, persistir `(proposed_decomposition, agent_event_id)` en un `.jsonl` local
2. A dos semanas vista, computar `final_state` por diff CHANGEFEED de cada note. Label manual rápido: `{none, minor, major, reverted}`
3. Features: `n_notes`, `mean_block_len`, `n_inferred_transformations`, `has_mit_for`, `n_internal_refs`, `n_external_refs`, embedding del `reasoning_summary` (BGE-M3, ya disponible)
4. `LogisticRegression` binario (`{none, minor}` vs `{major, reverted}`). Holdout 20%
5. Decisión: si el top-decil de "alta probabilidad de corrección mayor" coincide con ≥3× el rate base manual → señal real, vale construir el gate. Si no — la firma no está en estas features

Coste: un par de tardes. Cero cambios al schema, cero al worker.

## Frontier alternative

Antes que la cabeza supervisada: **self-consistency**. Pedir al LLM N=3-5 samples con `temperature>0` sobre la misma `raw_capture`, medir divergencia (mismo `n_notes`, mismo set de `type`, edit distance entre titles) y usar **acuerdo entre samples** como proxy de confidence. Si coinciden, commit. Si divergen, encolar.

Ventajas: cero training data, funciona día 1, sin umbral aprendido. Coste: 5× tokens por clarify. Probablemente la v0 honesta — y la señal supervisada se acumula en paralelo para reemplazarla cuando exista.

## Risks

- **Chilling effect** — la cola se vuelve chore y dejo de corregir notes ya commiteadas. Mitigación: si el rate de correcciones baja, el umbral sube automáticamente y el gate se relaja
- **Aprender a ser conservador** — modelo aprende "casi todo se corrige un poco" → gatea todo → backlog. Mitigación: el target es `{major, reverted}`, no "cualquier edit"; minor edits son ruido aceptable
- **Drift de gusto** — correcciones de hace 6 meses ya no son señal. Mitigación: sliding window de 6 meses, versionado del modelo, reset manual posible
- **Overfit a malos clarifies tempranos** — primeros 50 errores son idiosincráticos. Mitigación: floor de 100 correcciones antes de promover heurística-v0 a clasificador-v1
- **Threshold tuning** — alto → cola se llena, bajo → no gatea. Mitigación: empezar en P50 de scores observados durante una semana **shadow** (gate computado pero no enforced)

## When to revisit

- He corregido ≥30 decompositions manualmente y el patrón se siente repetido ("otra vez fragmentó el block")
- Onboarding de un nuevo `note_type` o cambio de gusto editorial: quiero que el worker defiera mientras "calibra"
- Self-consistency v0 está live y los falsos positivos son obvios — toca añadir señal supervisada

## Open questions

- Cola FIFO, o ranked por `|score - threshold|` (los más cercanos al umbral aportan más al modelo), o por edad
- ¿Re-promptear al LLM con el feedback del reject ("la propuesta fragmentó X, intenta respetando Y"), o aceptar que no aprende intra-sesión y reservar la señal para el clasificador externo
- Umbrales por `note_type`: probablemente sí — `task` se corrige distinto que `idea` o `report`
- ¿Cabeza en worker (Python) o MCP (TS)? Worker es lo natural — ya tiene sklearn y modelo serializado
- ¿`PROPOSED` realmente fuera de la state machine? Mi instinto: sí. ZTD describe **el ciclo de vida de un compromiso humano**; una propuesta del worker es un draft pendiente de ratificación, no un compromiso. Mezclarlas contamina la semántica de `state`
