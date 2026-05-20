# Huygens — conocimiento del dominio para el agente

> Este documento es **la verdad operativa** del dominio que el agente necesita para asistir al usuario. Léelo entero al inicio de cualquier sesión nueva. Los matices conceptuales más profundos viven en `docs/research/` (referenciados al final).

## ¿Qué es Huygens?

Una memoria estructurada **personal y única** para Rubén — no es un second-brain de conocimiento general, no es un sistema multi-usuario. Sirve a un único humano (creativo, caótico, fuerte en estrategia, débil en operativa) para que tú (el agente) hagas con él una parte importante del trabajo GTD: capturar entradas, clarificarlas, relacionarlas, generar narrativa.

El input principal es el chat con el usuario (texto corto, notas de voz transcritas, tochos largos). El output son notas markdown clasificadas + informes narrativos + búsqueda sobre el corpus.

## Las cinco entidades

### Note
La unidad-contenedor. Cada Note tiene:
- `title: string` — síntesis corta
- `type: option<record<note_type>>` — opcional. **Una nota capturada sin clarificar todavía vive con `type = NONE`**. Asignarle tipo es el primer paso de clarificación.
- `pillars: array<string>` — ver sección Pilares
- `state: string` — ciclo GTD (ver NoteState)
- `block_order: array<record<block>>` — el contenido vive en blocks, no en un campo `content` de la note
- `metadata: option<object>` — bag tipo-específico (campos de Report, Person, etc.)
- `source_kind`, `source_ref` — trazabilidad (chat / voice / agent / manual / import)
- timestamps + `last_reviewed_at`

### Block
La unidad **direccionable y vectorizable**. Markdown auto-contenido (un Zettel). Cada Block:
- `note: record<note>` — pertenece a una nota
- `content: string` — el markdown del bloque
- `pillars: array<string>` — pilares específicos del bloque (pueden diferir de los de la nota)
- `embedding`, `embedding_model`, `dimensions` — para vector search

**Importante**: una Note no tiene contenido propio. Su contenido emerge de concatenar sus blocks en el orden dado por `note.block_order`. Para reconstruir el markdown completo de una nota: fetch sus blocks, ordénalos según `block_order`, concatena con `\n\n---\n\n` o como prefieras.

### NoteType
Árbol editable de tipos. Los 8 seedeados: `task`, `project`, `area`, `routine`, `note`, `report`, `person`, `reference`. **Puedes crear tipos nuevos** cuando el dominio lo pida y el usuario apruebe — pero NO multipliques tipos para clasificaciones que ya cubre `pillars` o `metadata`.

### NoteState (enum)
Estado del ciclo GTD:
- `INBOX` — capturada, sin procesar
- `CLARIFIED` — el agente o el usuario decidieron qué es y qué hacer
- `ACTIVE` — en marcha
- `WAITING` — bloqueada por algo externo (chequea quincenalmente)
- `SOMEDAY` — no ahora, quizá luego
- `DONE` — completada
- `ARCHIVED` — fuera de circulación activa

Transiciones típicas:
```
INBOX → CLARIFIED → ACTIVE → (DONE | WAITING)
                  ↘ SOMEDAY
DONE → ARCHIVED (con el tiempo)
WAITING ↔ ACTIVE (cuando se desbloquea)
```

### Pillar (enum, 4 valores)
Las **dimensiones estratégicas** del usuario. Una nota puede tocar VARIOS pilares simultáneamente — son ejes ortogonales, no categorías excluyentes. Una nota sobre "programación funcional aplicada a meditación" es `Sophia + Pathos`.

| Pilar | Qué cubre |
|---|---|
| `PATHOS_SOMA` | Salud mental + física, fisioterapia, nutrición, emociones, meditación, estado budista. Lo corpóreo + afectivo. |
| `ETHOS` | Hábito, productividad, GTD, disciplina, rutinas, metodología, gestión del tiempo |
| `TELOS` | Propósito, metas, visión, OKRs, proyecciones comerciales, libertad financiera |
| `SOPHIA` | Conocimiento, filosofía, teoría de categorías, programación funcional, estudios |

**Regla pragmática**: si una nota no encaja claramente en ningún pilar (e.g. lista de la compra), deja `pillars` vacío. No fuerces. El usuario lo agradecerá.

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

### Cuándo asignar pilares

- **Cero pilares**: la nota es operativa pura (compra, recordatorio mecánico). OK.
- **Un pilar**: la nota toca claramente una dimensión.
- **Varios pilares**: la nota cruza dimensiones. Esto es lo más valioso a largo plazo porque permite informes que cosen pilares — pero no fuerces interpretaciones.

## Flujo de captura típico

1. **Recibes input del usuario** (texto, transcripción de voz, lo que sea)
2. **Crea una Note nueva** con:
   - `title` — síntesis corta que tú generas del input
   - `type` — NONE si todavía no clasificas
   - `state` — INBOX por defecto
   - `pillars` — los que detectas con confianza, o vacío
   - `source_kind` y `source_ref` — para trazabilidad
3. **Crea los Blocks** segmentando el input si es largo (un solo block si es corto)
4. **Actualiza `note.block_order`** con los IDs en orden
5. **Detecta menciones** en el texto del usuario (mentions `[[note:X]]` o `@person:Y` si las hay) y crea los edges correspondientes
6. **Termina con un breve resumen** al usuario de lo que capturaste

## Flujo de clarificación

Cuando el usuario pide clarificar inbox, o tú decides hacerlo:

1. Listar notas en `state=INBOX` ordenadas por antigüedad
2. Para cada una:
   - Decide su `type` (o pregunta al usuario si dudas)
   - Asigna `pillars` definitivos
   - Crea edges hacia notas existentes si aplica (`part_of` un Project, `mentions` una Person, etc.)
   - Transiciona a `state=CLARIFIED` (o `ACTIVE` si se va a empezar ya, `SOMEDAY` si se aparca)
3. Reporta lo procesado al usuario

## Flujo de generación de Report

Cuando el usuario pide un informe (semanal, mensual, sobre un proyecto, sobre un pilar):

1. Define el alcance temporal y/o por pilar/proyecto
2. Recupera las notas/blocks relevantes vía queries SurrealQL (ver `surrealql-patterns.md`)
3. Genera el informe como una **nueva Note con `type = report`**
4. **Crea edges `about`** desde el Report hacia las notas/blocks que citas — esto asegura trazabilidad
5. Si el informe debe llevar metadata (periodo cubierto, etc.), úsala en `note.metadata`

## Lo que NO debes hacer

- ❌ Inventar pillar names nuevos
- ❌ Inventar edge types nuevos sin proponer schema change
- ❌ Borrar notas sin que el usuario lo pida explícitamente
- ❌ Cambiar `state` sin razón clara (e.g. mover de ACTIVE a SOMEDAY sin contexto)
- ❌ Forzar pilares cuando la nota no encaja
- ❌ Duplicar info que ya cubre `metadata`
- ❌ Crear blocks de un párrafo cada uno (over-chunking) o un único block para un tocho de 5000 palabras (under-chunking)
- ❌ Asumir que recordarás contexto entre sesiones — guárdalo como notas con `source_kind='agent-self'` (ver `conventions.md`)

## Para profundizar

Lecturas en `docs/research/` ordenadas por relevancia inmediata:

- `03-data-model/topology-as-primary.md` — el principio fundacional
- `03-data-model/note-model.md` — anatomía detallada de Note
- `03-data-model/relations-and-edges.md` — semántica completa de edges
- `03-data-model/pillars-and-states.md` — más detalle sobre enums
- `01-vision/strategic-pillars.md` — origen filosófico de los 4 Pilares
- `01-vision/user-context.md` — quién es Rubén y cómo trabaja
