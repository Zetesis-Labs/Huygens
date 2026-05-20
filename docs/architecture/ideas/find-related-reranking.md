# Idea: Learned Re-ranking on top of HNSW

> Status: park. Depende de `[[feedback-infrastructure]]`. No hay señal de uso loggeada hoy.

## TL;DR

HNSW + BGE-M3 da los K vecinos "semánticamente parecidos" — métrica genérica, idéntica para cualquiera con el mismo modelo. **Lo útil para Rubén** es una función personal y temporal sobre esa similitud, aprendible solo desde comportamiento observado. La idea: re-ranker ligero (gradient boosting o LambdaMART) sobre el top-K de HNSW, entrenado con eventos de uso reales como señal positiva/negativa.

## Why it matters for Huygens

BGE-M3 ordena por su noción de "parecido"; eso es necesario pero no es lo que hay que optimizar con miles de notas. Dos hits con coseno 0.81 y 0.79 son intercambiables para el modelo, pero no lo son: uno puede ser una `decision` consultada tres veces este mes, otro una `capture` huérfana. **"Parecido" es propiedad del corpus, "útil ahora" es propiedad del usuario sobre el corpus.**

El gap crece con la talla del grafo. Con 200 notas, top-K por coseno basta. A partir de unos miles, la cola de hits "parecidos pero irrelevantes" ahoga a los útiles, y la única forma honesta de cortarla es aprender qué señales discriminan **para este usuario en este momento**.

## What it requires

- **Data**: señal de uso que no existe. Positiva explícita — el agente conversacional pidió el contenido del hit, el usuario lo enlazó, el worker lo usó vía `external_refs` al cerrar una decomposición, o se editó la nota dentro de los X minutos siguientes. Negativa implícita — hit devuelto e ignorado, o reformulación inmediata. Bootstrap: ~3 meses de uso real antes de que haya volumen entrenable.
- **Infrastructure**:
  - Nuevos `agent_event.kind`: `search_executed`, `search_result_consumed`, `search_result_ignored`, `link_followed`. Cada `search_executed` lleva `query_hash` y los IDs del top-K; los `consumed`/`ignored` referencian ese evento.
  - Job de entrenamiento periódico (cron semanal): materializa `(query, candidate, label)` desde el changefeed, entrena, snapshot a disco.
  - Invocación del re-ranker en `find_related` y `vector_search` como capa post-HNSW; coste objetivo < 30ms para K=50.
- **Prerequisites**:
  - `[[feedback-infrastructure]]` primero — sin los `agent_event.kind` nuevos no hay forma de etiquetar nada.
  - Volumen: cientos de búsquedas con outcome observado antes de que el entrenamiento sirva.

## Cheapest validation path

Con `[[feedback-infrastructure]]` loggeando, correr 4-6 semanas. Después, **comparar tres opciones sobre el mismo holdout**:

1. **Baseline**: orden por coseno puro.
2. **Cross-encoder off-the-shelf**: `bge-reranker-v2-m3` vía DeepInfra sobre el top-50, sin entrenar nada. Correrlo **primero** — puede ganarle al modelo aprendido sin requerir datos.
3. **Gradient boosting aprendido**: sklearn `GradientBoostingClassifier` binario sobre features ingenieradas (coseno, edad, tipo, densidad de aristas, recency × frequency), target = "consumido en los 10 min siguientes".

Métrica: top-1 success rate sobre holdout. Umbral: el ganador bate al baseline por **≥5 puntos**. Si gana el cross-encoder, el modelo aprendido se aparca hasta tener muchísimos más datos.

## Risks

- **Popularity collapse**: el usuario consume lo que aparece arriba, eso refuerza que siga arriba, los hits nuevos nunca salen. *Mitigación*: ε-greedy — 10-15% de búsquedas devuelven ranking puro; las impresiones "frías" entran al training set con peso aumentado.
- **Señal escasa al principio**: muchos `search_executed` sin ningún `_consumed`. *Mitigación*: positivas implícitas (hit ofrecido + sin reformulación en 60s); ponderar negativos a la mitad hasta que haya volumen.
- **Reformulaciones confunden al learner**: query A → resultados → query B (refinamiento) → consumo. ¿Lo de A fue ignorado o redirigido? *Mitigación*: clusterizar queries por similitud BGE-M3 en ventana de 5 min como una sesión; el consumo aplica a la sesión.
- **Drift de intereses**: lo útil hace 4 meses ya no lo es. *Mitigación*: decay exponencial (half-life ~6 semanas); reentrenar semanalmente desde cero.

## When to revisit

Alguno de: `[[feedback-infrastructure]]` lleva ≥2 meses con volumen real, `vector_search` empieza a repetir hits aburridos, o el corpus pasa de ~3000 blocks y el coseno deja de discriminar.

## Open questions

- **¿Capa MCP o capa worker?** En el MCP impacta a todos los consumidores; en el worker queda como afinado y no afecta a `find_related` directo. Probablemente MCP — el worker es uno de los principales generadores de señal positiva vía `external_refs`.
- **Diversidad vs. relevancia**: si los 5 top son cinco facetas del mismo cluster, técnicamente correctos pero inútiles. ¿MMR como post-paso, o feature de "novedad respecto a hits anteriores" dentro del modelo?
- **¿Cross-encoder gana siempre?** Hipótesis: cross-encoder hasta ~10k blocks, modelo aprendido a partir de ahí. Si el experimento 2 bate al baseline con margen amplio, el modelo personal puede no compensar nunca.
- **Granularidad del label**: ¿"consumo" binario o gradual (editar > linkear > leer > scroll)? Empezar binario; revisar si la señal continua mejora.
