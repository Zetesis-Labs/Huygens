# v2 — near-term: las próximas iteraciones

> Cuando v1 esté en uso real durante 2-4 semanas y aparezcan los primeros patrones de fricción, se atacan las siguientes piezas. Ordenadas por valor/esfuerzo.

## v2.1 — Domain tools del Huygens MCP

A medida que el agente trabaja con `surrealmcp` (CRUD genérico) y se identifican patrones repetidos en las conversaciones de captura/clarificación, esos patrones se destilan en **tools dedicadas** del Huygens MCP. La regla: si el agente repite 5 veces la misma cadena de 3-4 operaciones SurrealQL, esa cadena merece ser una tool.

### Tools candidatas

**`capture_inbox(content: string, sourceKind?: 'text' | 'voice', sourceRef?: string) → noteId`**

- Crea una `Note` con `typeId = null`, `state = INBOX`, `pillars = []`
- Persiste `sourceKind` + `sourceRef` para trazabilidad
- Llama internamente a `index_note` para chunkear/embebber (o lo delega vía un job background si la nota es larga)
- Devuelve el `noteId`
- **Por qué tool**: la captura es la operación más frecuente. Hoy requiere 3-4 llamadas a `surrealmcp` (create + relate + ...). Una sola tool es claridad y velocidad

**`clarify(noteId: string, typeSlug: string, pillars: Pillar[], links: { type: 'parent' | 'related', targetId: string }[]) → void`**

- Transición GTD: `INBOX → CLARIFIED`
- Asigna `typeId` (resuelve `typeSlug` a `note_type:X`)
- Asigna `pillars[]`
- Crea las edges (`parent_of`, `related_to`) que el agente sugiera
- **Por qué tool**: clarificación es el segundo flujo más frecuente. Atomicidad importa — si una de las edges falla, el state no debe quedar en CLARIFIED sin contexto

**`move_state(noteId: string, newState: NoteState) → void`**

- Transición pura de estado con validación de transiciones permitidas
- Reglas básicas: `INBOX → CLARIFIED`, `CLARIFIED → ACTIVE | WAITING | SOMEDAY | DONE`, etc.
- Registra timestamp de la transición en un campo `state_history` (array de `{state, at}`) — útil para analytics futuras
- **Por qué tool**: el agente intentará "mover una nota a DONE" muchas veces. Mejor que sea una tool con validación que un `UPDATE` libre

**`list_inbox(limit?: number) → { noteId, title, capturedAt, snippet }[]`**

- Devuelve las Notes con `state = INBOX` ordenadas por `capturedAt`
- Snippet = primeros 200 chars de `content` para que el agente decida sin cargar todo
- Opcionalmente con priorización heurística (older first, longer first, etc.)
- **Por qué tool**: el ritual diario "qué hay en el inbox" se repite

**`find_related(noteId: string, limit?: number, mode?: 'vector' | 'graph' | 'hybrid') → { noteId, score, reason }[]`**

- `vector`: vector search del content de la nota contra todos los chunks
- `graph`: traversal de edges `related_to` + `parent_of` hasta profundidad 2
- `hybrid`: combina ambos, dedupea, score blended
- **Por qué tool**: encontrar relacionados es lo más interesante semánticamente, y hacerlo bien requiere combinar vector + graph que `surrealmcp` no compone

**`generate_weekly_review(weekStart: ISO8601) → markdown`**

- Recoge todas las Notes con timestamps de la semana
- Las agrupa por pillar y por state-transition
- Llama a un LLM (Claude) con un prompt template para narrativizar
- Devuelve markdown listo para ser una Note `type=report`
- **Por qué tool**: la generación de reports es un flujo complejo (collect + group + LLM) que merece su propia abstracción

### Criterio de cierre v2.1

Las 6 tools implementadas, con tests E2E, y usadas en uso real al menos 2 semanas. Las tools no usadas se descartan, las usadas se refinan.

## v2.2 — Reports: plantillas narrativas

Una vez que `generate_weekly_review` funcione, se generalizan las plantillas.

### Plantillas a implementar

- **`daily_briefing`** — qué hay en cada estado, qué tocó cada pillar hoy. Output: ~300-500 palabras de markdown
- **`weekly_review`** — resumen por pillar con narrativa cohesiva. Output: ~1000-1500 palabras
- **`monthly_perspective`** — visión más amplia, OKR tracking, distribución de atención. Output: ~2000 palabras
- **`project_status(projectId)`** — estado de un Project específico con Tasks asociadas, blockers, ideas relacionadas, timeline. Output: ~500-1000 palabras
- **`pillar_balance(period)`** — distribución de atención por pillar en el período. Output: ~500 palabras + datos numéricos

### Arquitectura de las plantillas

Cada plantilla es:

1. **Query phase**: SurrealQL para extraer las Notes relevantes + sus edges. Esto es 100% determinista
2. **Aggregation phase**: TypeScript que agrupa, pivota, calcula métricas. También determinista
3. **Narration phase**: prompt template + datos agregados → Claude (o sub-call) → markdown. **No** determinista pero reproducible aproximadamente con `temperature=0.2`
4. **Persist phase**: la salida se persiste como `Note` con `type = report` para que sea findable después vía vector search

### Decisión clave: ¿Claude del lado del agente o sub-call interno?

Dos opciones:

- **(a) Sub-call interno**: el Huygens MCP llama a Claude vía API directamente. Pro: encapsulación. Contra: doble facturación de tokens, doble latencia
- **(b) Devolver datos al agente, dejar que él narre**: el Huygens MCP devuelve la estructura agregada en JSON, el agente principal (que ya es Claude) genera la narrativa. Pro: cero overhead. Contra: el agente principal recibe mucho contexto

**Recomendación inicial**: (b) para v2.2. Si el contexto se hace inmanejable, migrar plantillas pesadas a (a).

### Criterio de cierre v2.2

Las 5 plantillas funcionan, los reports se persisten, y son encontrables vía `vector_search` semanas después.

## v2.3 — Suggestion-mode schema evolution (versión light)

El primer paso hacia la _living topology_. Ver [../06-theory/living-topology.md](../06-theory/living-topology.md) para el marco conceptual completo.

En v2.3 implementamos la **versión más conservadora**: el sistema **propone** cambios al schema, el usuario los aprueba con un click, y el motor los aplica.

### Tool `propose_schema_evolution`

**Pipeline**:

1. **Lee CHANGEFEED de SurrealDB** de los últimos N días (default 30). SurrealDB tiene CHANGEFEED nativo si se configura `CHANGEFEED 7d` al `DEFINE TABLE`. Esto da un log de todas las operaciones de escritura
2. **Analiza patterns**:
   - Errores recurrentes de validación (`pillars` con valores que no están en el enum, intentos de relación entre tablas no autorizadas)
   - Campos `metadata` JSON que tienen las mismas keys repetidamente (candidato a promover a campo de primera clase)
   - Edges fallidas: el agente intentó `RELATE note:X to_meeting note:Y` y falló porque no existe ese tipo de edge
   - Notas con `typeId` que se pisan con `metadata` específicos repetidos (candidato a nuevo subtipo)
3. **Genera 5-10 propuestas** ranked por fitness estimada. Una propuesta es un objeto:
   ```ts
   {
     id: string,
     kind: 'add_field' | 'add_edge_type' | 'add_note_type' | 'remove_unused',
     description: string,           // narrativa: "He visto que has usado metadata.deadline 12 veces..."
     surql: string,                  // el DEFINE/REMOVE listo para ejecutar
     migrationSurql: string | null, // las UPDATEs necesarias para datos existentes
     evidence: { count: number, examples: string[] },
     estimatedImpact: 'low' | 'medium' | 'high'
   }
   ```
4. **Presenta a Rubén** en formato narrativo markdown
5. **Si Rubén aprueba** una propuesta específica (vía otra tool `apply_schema_evolution(id)`), el motor ejecuta el `DEFINE/REMOVE` + la migración asociada
6. **Persiste el cambio** como `Note` `type = report`, `metadata.kind = schema_evolution`, para historial

### Criterios de fitness para ranking

Cuatro señales combinables:

- **Frecuencia**: ¿cuántas veces se ha intentado este patrón?
- **Recencia**: ¿es un patrón de las últimas semanas o cosa antigua?
- **Coste de NO hacerlo**: ¿cuántas veces ha fallado una operación por no tener esto?
- **Coste de hacerlo**: ¿requiere migración pesada?

Una función lineal simple basta para v2.3 — refinar después con LLM-as-judge en v3.

### Criterio de cierre v2.3

`propose_schema_evolution` corre semanal o on-demand, devuelve propuestas razonables, y al menos una propuesta se ha aceptado y aplicado correctamente sin perder datos.

## v2.4 — Voice ingestion

Pipeline para procesar notas de voz.

### Stack

- **Whisper** — local (vía `whisper.cpp` o `mlx-whisper` si Mac, o `faster-whisper` en CPU) o API (OpenAI o DeepInfra)
- **Segmentation**: una llamada a LLM que toma el transcript completo y lo segmenta en notas cohesivas. Una sesión de voz típica no es 1 audio = 1 nota; puede ser 1 audio = N notas distintas (mientras camino se me ocurren 3 cosas inconexas)
- **Persistence**: cada nota entra al inbox con `sourceKind = 'voice'` + `sourceRef = audio_id`

### Flujo

```
Audio file (.m4a, .wav, .mp3)
        ↓
Whisper → transcript (texto plano)
        ↓
LLM segmenter → ["nota 1 sobre X", "nota 2 sobre Y", "nota 3 sobre Z"]
        ↓
Per nota:
  capture_inbox(content=nota, sourceKind='voice', sourceRef=audio_id)
        ↓
Background: index_note para cada una
```

### Tools

- **`transcribe_audio(audioPath: string) → { transcript: string, duration: number }`**
- **`segment_transcript(transcript: string) → string[]`**
- **`ingest_voice(audioPath: string) → noteIds[]`** — orquesta el flujo completo

### Decisión: ¿local o API?

- Local: privacidad total, latencia variable según hardware
- API: mejor calidad, latencia constante baja, coste por audio

**Recomendación inicial**: API (DeepInfra hospeda Whisper) para v2.4. Local si la privacidad lo justifica más adelante.

### Criterio de cierre v2.4

Una nota de voz de 3-5 minutos se procesa correctamente, genera 1-3 notas en el inbox con sus transcripts, y son findables vía vector search.

## v2.5 — Routines

Modelado de tareas recurrentes. El tipo `routine` está seedeado desde v1 pero v1 no hace nada con él.

### Schema mínimo

Añadir a `Note`:

```surql
DEFINE FIELD recurrence ON note TYPE option<string>;
-- RRULE (RFC 5545) string si la nota es type=routine, null en otro caso
DEFINE FIELD streak ON note TYPE option<int> DEFAULT 0;
DEFINE FIELD last_completed ON note TYPE option<datetime>;
```

### Tools

- **`generate_routine_instances(date: ISO8601) → Note[]`** — para la fecha dada, genera las Tasks recurrentes que deben aparecer ese día. Internamente: lee todas las notas con `type=routine`, evalúa el RRULE contra la fecha, y para cada match crea una Task hija con `parent_of` edge a la rutina
- **`complete_routine(routineId: string, date: ISO8601) → { streak: number }`** — marca la rutina como completada en esa fecha, incrementa o resetea el streak, devuelve el streak actualizado
- **`streak(routineId: string) → { current: number, longest: number, daysActive: number }`** — calcula racha de cumplimiento. Considera el RRULE para saber qué días "contaban"

### Decisión: ¿generar Tasks o tener un view virtual?

Dos opciones:

- **(a) Generar Tasks reales** cada día → genealogía de instancias. Pro: trazable, las Tasks pueden completarse y formar parte del registro. Contra: explosión de Notes si hay muchas rutinas
- **(b) View virtual** que muestra "lo que debería estar pasando hoy" sin persistir Tasks → menos noise. Contra: no hay registro histórico

**Recomendación inicial**: (a) — la trazabilidad histórica vale el coste de noise.

### Criterio de cierre v2.5

Una rutina diaria genera su Task cada mañana, se completa con `complete_routine`, y el streak se incrementa correctamente. Una rutina semanal hace lo mismo en su día.

## Orden de implementación recomendado

Por valor inmediato sobre el flujo diario:

1. **v2.1** (domain tools) — multiplica la productividad del agente desde día 1
2. **v2.2** (reports) — primer feedback macro sobre tu vida, narrativa semanal
3. **v2.4** (voice) — captura mientras caminas, vacía la mente
4. **v2.5** (routines) — Éthos pillar: disciplina diaria trackeada
5. **v2.3** (schema evolution) — el menos urgente pero el más conceptualmente interesante; necesita data acumulada (~3 meses) para que tenga señal real

## Lo que NO se hace en v2

Ver [v3-far-future.md](./v3-far-future.md) para el resto. v2 es deliberadamente conservador en alcance.
