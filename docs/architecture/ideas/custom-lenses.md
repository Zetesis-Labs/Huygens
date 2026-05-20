# Idea: Custom Personal Lenses

## TL;DR

Crear **lentes personales aprendidas**: pequeños clasificadores entrenables sobre los embeddings BGE-M3 ya existentes que respondan a criterios *editoriales* del usuario ("estoy procrastinando esto", "esto me drena energía", "esto se relaciona con Govoy"). Cada lente es una cabeza ligera (logreg / probe lineal) sobre embeddings congelados, persistida por lente, evaluable como `P(lens | block) ∈ [0,1]`. El MCP expone `lens_score(lens_id, filter?)` para rankear notes por esa lente. Editorial, no schema: la lente vive *fuera* del modelo de datos pero opera *sobre* él.

## Why it matters for Huygens

Hoy un criterio como "qué estoy procrastinando" no tiene representación. No es `state` (procrastinar es ortogonal al estado ZTD), no es `type_slug`, no es `mit_for`. Es un **criterio editorial** — una forma de mirar las notes que solo tiene sentido para *mí*. Lo único que puede hacer el sistema hoy es pedírselo al LLM por query, que da respuesta plausible pero **drift** entre sesiones: el LLM no recuerda qué consideró procrastinación ayer, ni se calibra.

Una lente persistente resuelve eso: se entrena una vez, se almacena, se versiona, se evalúa con holdout. Lo que la lente codifica es **mi criterio**, no la *guess* genérica del LLM. Cuando dentro de tres meses pregunto "¿qué estoy procrastinando?" la respuesta es la misma definición operativa, no la interpretación de un prompt de turno.

Distinción clave: un campo de schema (`mit_for`, `state`) es un **hecho declarado**. Una lente es un **juicio aprendido**. Los hechos cabe enforcearlos; los juicios solo cabe aproximarlos — y mejor con un modelo estable que con un LLM ad-hoc cada vez.

## What it requires

- **Data**: labels por lente. Patrón bootstrap: ~50 ejemplos positivos + ~50 negativos a mano → opcional LLM-assisted expansion sobre el corpus existente (con revisión humana de los samples expandidos) → holdout de ~20% para validar. Re-label *active learning*: la lente propone los casos donde está menos segura y el usuario los etiqueta.
- **Infrastructure**:
  - **Schema**: una tabla `lens` con `id`, `name`, `description`, `version`, `created_at`, `head_kind` (`logreg` / `mlp` / `linear_probe`), `metrics` (precision/recall en holdout), `training_size`. Una tabla `lens_label` (`lens_id`, `block_id` o `note_id`, `label: bool`, `labeled_at`, `source`: `manual` / `llm_assisted` / `active_learning`).
  - **Head weights**: vectores pequeños (1024 floats + bias para logreg = ~4KB por lente). Almacenar inline en el record `lens` como `array<float>` — no merece fichero externo a esta escala.
  - **Invocación**: nuevo tool MCP `lens_score(lens_id, filter?, top_k?)` que aplica producto escalar sobre `block.embedding` y agrega por note (max o mean de blocks). Versión hybrid: `vector_search(query, lens_id?)` que combina similaridad semántica con score de lente.
  - **Label-collection UX**: empezar por CLI / tool MCP `lens_label(lens_id, target_id, label)`. Después: comando ambiente "lensify X as part of procrastination" desde el chat agéntico — el agente abre una sesión interactiva de etiquetado.
- **Prerequisites**: volumen de notes suficiente para que un holdout signifique algo (≥200 notes con embeddings reales, no synthetic). Workflow de captura ya rodando: sin corpus no hay lente.

## Cheapest validation path

Una lente, end-to-end, manual:

1. Elegir una sola criterio: *"esto es algo que llevo pensando >1 semana sin actuar"*.
2. Etiquetar a mano 50 blocks/notes positivas y 50 negativas — directamente en un `.jsonl` local, sin schema todavía.
3. `sklearn.LogisticRegression(C=1.0)` sobre los embeddings ya existentes. Holdout 20%.
4. Top-K=20 sobre el corpus entero. **Lectura humana**: ¿el top-20 "se siente como yo"? ¿reconozco las cosas que llevo demasiado?

Si la respuesta es sí → invertir en schema, MCP tool, UX. Si no → o el criterio es demasiado difuso (no se aprende), o BGE-M3 no captura esa dimensión y se necesita reranker o features adicionales (tiempo desde creación, número de menciones, etc.).

Coste estimado: una tarde. No tocar ni schema ni MCP hasta validar.

## Risks

| Riesgo | Mitigación |
|---|---|
| **Pocos labels** → cabeza overfitea, lente parece funcionar y no generaliza | Holdout obligatorio + métricas almacenadas; rechazar lente si AUC < 0.75 en holdout |
| **Drift del criterio** ("mi sentido de procrastinar cambia") | Versionado: `lens.version`. Re-train periódico con labels recientes (sliding window). Histórico de versiones queryable |
| **Lentes que conflictúan** (algo etiquetado como "procrastino" y "calma" a la vez — incoherencia interna) | Asumir lentes independientes por defecto. Si emerge necesidad, modelar como multi-label classifier o como composición lógica `lens_score_compose(A AND NOT B)` |
| **Lens explosion**: 20 lentes y olvido cuál es cuál | Límite suave: la UI lista lentes con `description` + ejemplos canónicos. Lentes sin uso en X meses → archived |
| **BGE-M3 no separa el criterio** (la dimensión no existe en el embedding) | Detectar vía AUC bajo en holdout → la lente "no se aprende", señal honesta. Considerar features auxiliares (recencia, edges, type) como input adicional |
| **Riesgo de profecía autocumplida** — la lente refuerza lo que ya creía | Re-label activo: pedir feedback en los casos *fronterizos*, no solo en los obvios |

## When to revisit

- Corpus alcanza ≥200 notes con embeddings reales.
- Aparece **una pregunta editorial recurrente** que ya estoy formulando al LLM cada semana ("¿qué estoy posponiendo?", "¿qué tiene que ver con Govoy?") — esa frecuencia es la señal de que merece persistirse.
- Frustración explícita: "le pregunté esto la semana pasada y dio otra respuesta". Eso es el drift haciéndose sentir.

No revisitar antes. Una lente sobre 50 notes es ruido.

## Open questions

- **Multi-class vs binario por lente**: ¿una lente "estado emocional" con clases {calmo, ansioso, neutral} o tres lentes binarias? Probablemente binarias — composición es más simple, calibración por lente es independiente.
- **Per-lens calibration**: ¿necesito Platt scaling / isotonic para que el `score` sea probabilidad real interpretable? Para ranking no importa; para *thresholding* ("muéstrame todo con P > 0.7") sí.
- **Lens composition**: ¿`lens(procrastino) AND lens(govoy)` se computa como producto de probabilidades, mínimo, o se entrena una lente nueva sobre la intersección? Producto es la opción honesta a falta de datos.
- **Lens versioning y backfill**: cuando re-entreno v2 de una lente, ¿los scores históricos persistidos quedan obsoletos? Probablemente sí — score no se materializa, se computa on-demand.
- **Lentes generativas vs descriptivas**: ¿una lente solo *clasifica* o también puede *sugerir* la acción ("lo que llevas procrastinando, ¿lo haces hoy?")? Eso ya es agente, no lente. Mantener la lente como signal puro y dejar la acción al agente del cliente.
- **Active learning como first-class loop**: la mejora marginal por label etiquetado activamente >> por label random. ¿Merece UX dedicada desde el día 1 o se difiere a v2?
- **Reranker vs probe lineal**: con suficiente data, ¿un cross-encoder tipo BGE-reranker-v2-m3 da mejor que logreg sobre embeddings? Sí casi seguro, a coste de latencia 100x. Esa es la apuesta frontier: probe primero, reranker cuando el probe satura.
