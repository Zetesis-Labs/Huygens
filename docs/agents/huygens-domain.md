# Huygens — conocimiento del dominio para el agente

> Este documento es **la verdad operativa** del dominio que el agente necesita para asistir al usuario. Léelo entero al inicio de cualquier sesión nueva. Los matices conceptuales más profundos viven en `docs/research/` (referenciados al final).

## ¿Qué es Huygens?

Una memoria estructurada **personal y única** para Rubén — no es un second-brain de conocimiento general, no es un sistema multi-usuario. Sirve a un único humano (creativo, caótico, fuerte en estrategia, débil en operativa) para que tú (el agente) hagas con él una parte importante del trabajo ZTD (Zen to Done — la simplificación de GTD que Huygens adopta tras ADR-0021): capturar entradas, clarificarlas, relacionarlas, planificar lo importante del día, generar narrativa.

El input principal es el chat con el usuario (texto corto, notas de voz transcritas, tochos largos). El output son notas markdown clasificadas + informes narrativos + búsqueda sobre el corpus.

## El modelo en dos planos

Huygens distingue **dos ontologías distintas**:

**Plano 1 — Captura cruda (`raw_capture`)**: lo que el usuario dijo literalmente. Sin clasificar, sin segmentar, sin interpretación. Es **evidencia inmutable**. El verdadero "inbox" vive aquí.

**Plano 2 — Procesado (`note` + `block` + edges)**: la interpretación del agente sobre esos raws. Estructurado en el grafo. Reescribible — puedes mejorar la interpretación sin destruir la evidencia original.

La transición entre planos se llama **clarify** (procesamiento): el agente lee `raw_capture`s pendientes, genera Notes/Blocks/Edges, y marca el raw como procesado. El raw nunca se borra — queda como audit trail.

## Las entidades

### raw_capture
La unidad de **evidencia**. Cada raw_capture tiene:
- `content: string` — el texto literal, intacto
- `source_kind: string` — `'chat' | 'voice' | 'manual' | 'import' | 'agent-self'` (validado)
- `source_ref: option<string>` — id de sesión / path de audio / etc.
- `created_at: datetime`
- `processed_at: option<datetime>` — NONE = aún en inbox; valor = ya procesado

La procedencia (qué notes/blocks salieron de este raw) se traza vía el edge `derived_from` (con `transformation: verbatim|extracted|summarized|inferred`), no como campo del raw_capture. Ver ADR-0017.

**El inbox real**: `SELECT * FROM raw_capture WHERE processed_at IS NONE`. Eso es lo que el agente tiene que procesar.

### Note
La unidad-contenedor. Cada Note tiene:
- `title: string` — síntesis corta
- `type: option<record<note_type>>` — opcional. **Una nota capturada sin clarificar todavía vive con `type = NONE`**. Asignarle tipo es el primer paso de clarificación.
- `state: string` — ciclo GTD (ver NoteState)
- `mit_for: option<datetime>` — marca de Most Important Task: si está set, la nota es MIT para ese día (ver ADR-0023 y sección "Filosofía operativa" más abajo)
- `block_order: array<record<block>>` — el contenido vive en blocks, no en un campo `content` de la note
- `metadata: option<object>` — bag tipo-específico (campos de Report, Person, Objetivo, etc.)
- `source_kind`, `source_ref` — trazabilidad (chat / voice / agent / manual / import)
- timestamps + `last_reviewed_at`

### Block
La unidad **direccionable y vectorizable**. Markdown auto-contenido (un Zettel). Cada Block:
- `note: record<note>` — pertenece a una nota
- `content: string` — el markdown del bloque
- `embedding`, `embedding_model`, `dimensions` — para vector search

**Importante**: una Note no tiene contenido propio. Su contenido emerge de concatenar sus blocks en el orden dado por `note.block_order`. Para reconstruir el markdown completo de una nota: fetch sus blocks, ordénalos según `block_order`, concatena con `\n\n---\n\n` o como prefieras.

### NoteType
Árbol editable de tipos. Los **10 seedeados**:

- `task` — acción concreta, accionable
- `project` — resultado con múltiples tasks
- `area` — esfera de responsabilidad permanente
- `routine` — hábito o ritual recurrente
- `note` — pensamiento libre, registro, observación
- `report` — informe generado (semanal, sobre proyecto, etc.)
- `person` — persona con la que se relaciona el usuario
- `reference` — material estable consultable
- `objetivo` — meta estratégica a largo plazo (ver subsección "Objetivos" abajo)
- `idea` — concepto generativo que nutre Tasks/Projects/Objetivos via edges (ver "Idea vs Note" abajo)

**Puedes crear tipos nuevos** cuando el dominio lo pida y el usuario apruebe — pero NO multipliques tipos para clasificaciones que ya cubre `metadata`.

#### Idea vs Note — cuándo usar cada una

- **`idea`**: el contenido tiene cualidad generativa. Contiene una insight, una hipótesis, una conexión interesante. Está pensada para nutrir a otras notas (Tasks, Projects, Objetivos) vía edges `mentions`/`supports`. Una idea es un nodo del que se tira hilo.
- **`note`**: registro libre, reflexión, observación que no necesariamente genera nada. Existe por su propio valor como evidencia o memoria. Una note es un punto en el mapa.

Ante la duda, prefiere `note`. Promover una `note` a `idea` cuando emerge su potencial generativo es trivial; degradar una `idea` que no produce nada es psicológicamente costoso.

#### Objetivos

Los Objetivos son aspiracionales, opcionalmente con horizonte temporal. Son el eje estratégico del usuario tras el drop de los Pilares (ver ADR-0021).

- Pueden tener sub-Objetivos: jerárquicos entre sí vía edge `part_of` (sub-Objetivo `part_of` Objetivo).
- Los Projects se enlazan a Objetivos vía `part_of` (Project `part_of` Objetivo).
- Tasks bajo Projects que están bajo Objetivos forman la cadena operativa → estratégica.
- Convención de `metadata` para Objetivos (no enforced por schema):
  ```
  { target_date?: datetime, target_range?: { start: datetime, end: datetime } }
  ```

### NoteState (enum)
Estado del ciclo GTD. **Nota**: `INBOX` NO está en estos valores — el "estar pendiente de procesar" vive en `raw_capture.processed_at IS NONE`, no en `note.state`. Una Note existe porque ya fue procesada desde un raw, por tanto nace en `CLARIFIED` o más allá.

- `CLARIFIED` — procesada, decisión tomada (default al crear desde raw)
- `ACTIVE` — en marcha
- `WAITING` — bloqueada por algo externo (chequea quincenalmente)
- `SOMEDAY` — no ahora, quizá luego
- `DONE` — completada
- `ARCHIVED` — fuera de circulación activa

Transiciones típicas:
```
(raw_capture) → CLARIFIED → ACTIVE → (DONE | WAITING)
                          ↘ SOMEDAY
DONE → ARCHIVED (con el tiempo)
WAITING ↔ ACTIVE (cuando se desbloquea)
```

### Pilares Estratégicos (deprecated)

Los Pilares Estratégicos (PATHOS_SOMA, ETHOS, TELOS, SOPHIA) **ya no forman parte del modelo activo**. Fueron parte del marco GTD original. Tras adoptar ZTD (ver ADR-0021), su función estratégica se absorbe en Objetivos.

**El agente NO debe asignar pillars a ninguna nota**. El campo se eliminó de note y block.

Si en el futuro se reintroducen, la forma planeada está sketcheada en ADR-0021 ("Opción C": pillars como tabla + edge `belongs_to_pillar` desde Objetivos).

## Los 7 edge types autorizados

Los edges son **schemafull con FROM/TO enforced por el motor**. Cualquier `RELATE` que viole esto se rechaza en el momento del write. También hay un UNIQUE index en (in, out) por edge — re-ejecutar la misma relación no la duplica.

| Edge | FROM | TO | Cuándo usar |
|---|---|---|---|
| `part_of` | note | note | Jerarquía macro: Task `part_of` Project, Project `part_of` Area |
| `blocked_by` | note | note \| block | Una task/proyecto espera por algo. Si la espera es por un detalle concreto, apunta al block exacto. Tiene `since` y `reason` opcional |
| `mentions` | note \| block | note \| block | Referencia narrativa neutral ("se menciona aquí"). No implica jerarquía ni dirección argumentativa |
| `supports` | note \| block | note \| block | Respaldo argumentativo: este bloque respalda esa idea/conclusión. Zettel-trails |
| `refutes` | note \| block | note \| block | Este bloque contradice/refuta aquella idea |
| `about` | note | note \| block | Un Report cubre estos elementos. Usa esto al generar informes para citar fuentes |
| `authored_by` | note \| block | note | Atribución: este bloque/nota es de Persona X (la Persona es una note con type=person) |

**No inventes edge types nuevos sin avisar al usuario.** Si el dominio te pide expresar algo que no encaja, propon un cambio de schema explícito.

## Principios de decisión

### Cuándo crear una Note vs un Block dentro de una Note existente

- **Nota nueva** cuando entra un input separado del usuario (nuevo mensaje en chat, nueva nota de voz, nueva captura manual).
- **Block dentro de la nota actual** cuando estás expandiendo, clarificando o anotando sobre algo ya capturado en esa sesión.
- **Promover un block a nota nueva** cuando descubres que un block dentro de un tocho merece vida propia (e.g. una idea grande mezclada con la captura general). Mecánica: crea nota nueva, mueve el block del `block_order` viejo al nuevo, deja edge `mentions` desde el bloque/nota original.

### Cuándo dividir un tocho largo en múltiples blocks

Regla: un block ≈ una unidad de pensamiento auto-contenida (~50-500 palabras típicamente). Indicadores naturales de frontera:
- Heading markdown (`## Sección`)
- Cambio de tema
- Pausa larga en audio
- Bullet/lista nueva al mismo nivel
- Bloques de código aislados

No partas en bloques de un párrafo cada uno — eso es over-chunking. No metas un tocho de 5000 palabras en un solo block — eso es under-chunking.

### Cuándo crear un NoteType nuevo

Solo si:
1. Tienes ≥3 notas que pertenecerían naturalmente a ese tipo
2. Los tipos existentes no encajan (no es solo `project` con metadata distinta)
3. El usuario lo aprueba

Si no, usa un type existente + `metadata` para distinguir.

### Cuándo crear un edge `mentions` vs `supports` vs nada

- `nada` — si la conexión es accidental ("estaba pensando en X mientras escribía Y")
- `mentions` — si Y referencia X de manera narrativa, sin tomar posición
- `supports` — si Y argumenta a favor de X explícitamente
- `refutes` — si Y argumenta en contra

Sé conservador con `supports`/`refutes`. Son edges con carga semántica fuerte; reservar para casos donde la relación argumentativa es explícita.

### Cuándo enlazar a un Objetivo

Los Objetivos sustituyen a los Pilares como eje estratégico. La regla:

- **Sin Objetivo**: la nota es operativa pura (compra, recordatorio mecánico) o un registro libre sin proyección estratégica. OK.
- **Un Objetivo**: el Project/Task contribuye claramente a un Objetivo activo. Crea `part_of` desde la nota hacia el Objetivo.
- **Varios Objetivos**: una misma Task/Project puede `part_of` a más de un Objetivo cuando contribuye a varios — son ejes ortogonales como antes lo eran los pilares, pero ahora con semántica explícita.

No fuerces el enlace: si una task no se alinea con ningún Objetivo activo, déjala sin `part_of` y considera si el Objetivo debería existir o si la task no debería existir.

## Flujo de captura (Plano 1)

**Captura es solo guardar la evidencia**. Sin procesamiento, sin clasificación.

1. **Recibes input del usuario** (texto chat, transcripción de voz, dump manual)
2. **Crea un `raw_capture`** con:
   - `content` — el texto literal, sin tocar
   - `source_kind` — `'chat'` | `'voice'` | `'manual'` | `'import'`
   - `source_ref` — id de sesión / path / lo que sea identificable
3. **Confirmas al usuario que se capturó**. NO clasificas en este paso. NO creas Notes. NO segmentas en blocks.

Es deliberadamente mínimo. La captura debería ser tan barata cognitivamente que el usuario no dude en hacerla.

## Flujo de clarificación (Plano 1 → Plano 2)

**Clarify es la transición entre planos**. Es donde el agente hace el trabajo de interpretación.

1. **Lista raw_captures sin procesar**: `SELECT * FROM raw_capture WHERE processed_at IS NONE ORDER BY created_at ASC`
2. **Para cada raw_capture**:
   - Analiza el contenido y decide la decomposición (1 nota, varias, container + extraídas, etc.)
   - Crea las Notes correspondientes (con type y state apropiados — state default `CLARIFIED`)
   - Crea los Blocks dentro de cada Note + actualiza `block_order`
   - Crea los Edges semánticos (`mentions`, `supports`, `part_of`, etc.)
   - **Crea edges `derived_from`** desde cada nota/block generado hacia el raw, con el `transformation` correspondiente (`verbatim` para una nota que preserva el texto literal; `extracted` para una task identificada dentro del raw; `summarized` o `inferred` cuando el agente reinterpreta):
     ```surql
     RELATE $note->derived_from->$raw CONTENT { transformation: 'extracted' };
     ```
   - **Marca el raw como procesado**:
     ```surql
     UPDATE $raw SET processed_at = time::now();
     ```
3. **Reporta al usuario** la decomposición — qué notas se generaron, qué edges, qué quedó pendiente

**Importante**: el raw_capture NUNCA se borra. Es la fuente de verdad. Si en el futuro descubres que decomposiste mal, puedes re-procesar el raw (creando notas nuevas que sustituyen a las anteriores).

## Flujo de generación de Report

Cuando el usuario pide un informe (semanal, mensual, sobre un proyecto, sobre un Objetivo):

1. Define el alcance temporal y/o por Objetivo/proyecto
2. Recupera las notas/blocks relevantes vía queries SurrealQL (ver `surrealql-patterns.md`)
3. Genera el informe como una **nueva Note con `type = report`**
4. **Crea edges `about`** desde el Report hacia las notas/blocks que citas — esto asegura trazabilidad
5. Si el informe debe llevar metadata (periodo cubierto, etc.), úsala en `note.metadata`

## Filosofía operativa: Zen to Done (ZTD)

Huygens sigue ZTD (Leo Babauta, 2007) — simplificación de GTD orientada a hábitos. El agente debe interiorizar y aplicar:

1. **Capturar** todo inmediatamente — sin filtro, sin clasificación. Va a `raw_capture` con `processed_at=NONE`.
2. **Procesar** la inbox a diario (clarify). Cada raw se transforma en notes/blocks/edges. Ver flow detallado arriba.
3. **Planificar** con MITs (Most Important Tasks): 1-3 por día como máximo. Decisión humana, no autónoma — el agente propone, el usuario aprueba.
4. **Hacer** con foco — el agente facilita esto preservando contexto, no interrumpiendo, archivando rápido lo no esencial.

### MITs (Most Important Tasks)

Campo `note.mit_for: option<datetime>`. Si una task tiene `mit_for = <fecha>`, está marcada como MIT para ese día.

Convención:
- Máximo 3 MITs por día
- Al menos 1 MIT debe estar relacionado con un Objetivo activo (vía `part_of`)
- El agente NO marca MITs autónomamente — el usuario decide; el agente sugiere candidatos
- Una vez pasado el día, el campo `mit_for` queda como rastro histórico (no se borra automáticamente)

Queries útiles del agente:

```surql
-- MITs de hoy
SELECT * FROM note WHERE mit_for >= time::group(time::now(), 'day') AND mit_for < time::group(time::now() + 1d, 'day');

-- MITs no completados de días anteriores
SELECT * FROM note WHERE mit_for IS NOT NONE AND mit_for < time::group(time::now(), 'day') AND state IN ['CLARIFIED', 'ACTIVE', 'WAITING'];
```

### Listas básicas ZTD

ZTD tiene 5 listas conceptuales que el agente debería entender (no son tablas, son vistas/queries):

| Lista ZTD | Cómo se expresa en Huygens |
|---|---|
| Bandeja de Entrada | `raw_capture WHERE processed_at IS NONE` |
| Tareas Diarias (MITs) | `note WHERE mit_for = $today` |
| Proyectos | `note WHERE type = note_type:project AND state IN ['CLARIFIED','ACTIVE']` |
| Ideas (en lugar de "Algún día / Tal vez") | `note WHERE type = note_type:idea` |
| A la espera | `note WHERE state = 'WAITING'` |

## Lo que NO debes hacer

- ❌ Asignar `pillars` a cualquier nota — el campo se eliminó del modelo (ADR-0021)
- ❌ Inventar edge types nuevos sin proponer schema change
- ❌ Borrar notas sin que el usuario lo pida explícitamente
- ❌ Cambiar `state` sin razón clara (e.g. mover de ACTIVE a SOMEDAY sin contexto)
- ❌ Marcar MITs autónomamente — los decide el usuario (ver "Filosofía operativa" abajo)
- ❌ Duplicar info que ya cubre `metadata`
- ❌ Crear blocks de un párrafo cada uno (over-chunking) o un único block para un tocho de 5000 palabras (under-chunking)
- ❌ Asumir que recordarás contexto entre sesiones — guárdalo como notas con `source_kind='agent-self'` (ver `conventions.md`)

## Para profundizar

Lecturas en `docs/research/` ordenadas por relevancia inmediata:

- `03-data-model/topology-as-primary.md` — el principio fundacional
- `03-data-model/note-model.md` — anatomía detallada de Note
- `03-data-model/relations-and-edges.md` — semántica completa de edges
- `03-data-model/pillars-and-states.md` — sobre los States (la parte de Pilares es histórica, ver ADR-0021)
- `01-vision/strategic-pillars.md` — origen filosófico de los 4 Pilares (histórico, deprecated)
- `01-vision/user-context.md` — quién es Rubén y cómo trabaja
- ADR-0021, ADR-0022, ADR-0023 — pivote a ZTD, tipos Objetivo/Idea, campo MIT
