# Idea: Soft Pilares

> Status: park. ADR-0021 dropped Pilares as hard schema; this revisits them as a derived continuous signal.

## TL;DR

Re-introducir PATHOS_SOMA / ETHOS / TELOS / SOPHIA **no como campo del schema** sino como **pertenencia probabilística continua** derivada de los embeddings BGE-M3 ya existentes. Cada block lleva un vector `{P(pathos), P(ethos), P(telos), P(sophia)}` recomputable, nunca escrito por el usuario, nunca obligado a sumar 1. La forma elegante no es un clasificador supervisado clásico sino **prototipos contrastivos**: cuatro vectores aprendidos en el mismo espacio que los blocks, y la membresía es coseno calibrado a prototipo.

## Why it matters for Huygens

ADR-0021 mató Pilares por una razón concreta: el agente cargaba con elegir 1..N de 4 categorías por captura, y la asignación discreta no modelaba notas reales (la "meditación con functors" toca SOPHIA y PATHOS_SOMA con intensidades distintas, no por igual). La Opción C del ADR los rescata como taxonomía dura de **Objetivos**, no de notas — sigue siendo discreta, sigue exigiendo que el agente decida.

Soft Pilares cubre un hueco que ni el schema actual ni la Opción C resuelven:

- **"¿Cómo ha estado mi eje pathos esta semana?"** — agregable como suma de probabilidades sobre raw_captures procesadas en el rango, sin que el agente haya etiquetado nada.
- **Brújula de balance sin compromiso editorial** — si la masa probabilística está sesgada a ETHOS+TELOS y PATHOS≈0 durante 3 semanas, es señal observable.
- **Slicing suave** — "tráeme blocks con P(sophia) > 0.5" sin que existan tags.

Es información **derivada**, no declarada. Encaja con la separación raw_capture/note de ADR-0017: capa de interpretación adicional, no carga cognitiva en captura.

## What it requires

- **Data**: ~150-300 blocks etiquetados por Rubén con un vector 4-dim de intensidad (p.ej. sliders 0..3, normalizables). Bootstrap pattern: 50-80 a mano, expansión con LLM (gpt-4o-mini sobre el content del block), validación humana del subset expandido. Multi-label, **no** mono-clase.
- **Infraestructura**: tabla `pilar_prototype` (4 filas, una por pilar, con `embedding` 1024-dim aprendido y `version`). Nuevo campo `block.pilar_scores: option<array<float>>` (longitud 4, orden canónico). Recálculo: job batch del worker (ADR-0018) cuando cambia un prototipo o llega un block nuevo. Es coseno entre vectores ya almacenados — coste despreciable.
- **Prerequisitos**: (a) volumen ≥500 blocks con embedding estable; (b) un mini-UI o flujo MCP para que Rubén etiquete 50 blocks sin fricción (probable: tool `huygens.label_pilar(block_id, scores)`); (c) decisión consciente de que Soft Pilares no contamina el prompt del agente — es signal de query, no de captura.

## Cheapest validation path

Etiquetar 50 blocks a mano (10 min de trabajo, sliders en CLI). Calcular prototipo por pilar como **media ponderada de embeddings** por intensidad declarada (sin entrenar nada). Holdout de 20 blocks. Si la correlación de Spearman entre `cosine(block, prototype)` y la etiqueta humana supera **0.55 por pilar en promedio**, BGE-M3 captura la distinción y la siguiente iteración (prototipos contrastivos con triplet loss, o LogReg multi-label sobre embeddings frozen) vale la pena. Si está bajo 0.3, el encoder no separa esta señal y la idea muere aquí.

Coste total: una tarde. No requiere infra nueva — query SQL pura sobre `block`.

## Risks

- **BGE-M3 no separa los cuatro ejes** — los prototipos colapsan o son demasiado próximos (cos(ethos, telos) > 0.85 en el corpus de Rubén). *Mitigación*: el experimento barato lo detecta antes de cualquier código. Si pasa, considerar fine-tuning ligero del head (no del encoder) con margin loss.
- **Drift semántico** — lo que para Rubén era "ethos" en 2026 no lo es en 2028. *Mitigación*: `prototype.version`, recomputar prototipos cada N meses con re-labelling incremental (~20 blocks).
- **Sobreajuste a ruido editorial** — 150 labels sobre miles de blocks. *Mitigación*: prototipos (no modelo paramétrico) tienen muchísima menos capacidad de overfitting que un MLP; es la elección conservadora dentro de la familia frontier.
- **Tentación de re-introducir Pilares como campo duro** porque "ya tenemos las probabilidades" — *mitigación*: este doc + ADR-0021 lo prohíben explícitamente. P(.) es signal de query, nunca de write.

## When to revisit

Cuando se cumpla **al menos dos** de:

1. `count(block) >= 500` con embedding estable y >3 meses de uso continuado.
2. Rubén verbaliza la pregunta "¿cómo va mi X-side?" (síntoma de hueco real, no especulativo).
3. La función de Reports (ADR-0022 / Objetivos) lleva tiempo en uso y se nota que no captura balance afectivo/somático, sólo progreso ejecutivo.

## Open questions

- ¿Pilar como dimensión continua o categorización suave (4 valores con softmax temperatura > 1)? El primero es más honesto; el segundo es más explicable en la UI.
- ¿Se aplica a `block` o a `note`? Probablemente block (chunk = unidad semántica), agregable a nivel note por suma normalizada del `block_order`.
- ¿Vale la pena exponer `pilar_scores` por MCP como filtro de `vector_search`, o sólo como agregado en reports? Filtro vivo es más útil; agregado es más barato y menos invasivo.
- ¿4 pilares o reabrir el espacio de dimensiones? La filosofía griega ancla en 4 pero el método (prototipos) admite N — quizá emerja un quinto eje (p.ej. RELATIONAL/φιλία) sólo cuando haya datos.
