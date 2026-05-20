# SurrealQL — patrones para Huygens

> Patrones de query copy-pasteables para operar sobre Huygens. Asume el schema actual (`apps/mcp/surreal/schema.surql`). Cuando aparezca una tool del Huygens MCP que envuelva un patrón, prefiere la tool — pero cuando no exista, usa SurrealQL directo vía `surrealmcp.query`.

## Conexión

Variables de entorno disponibles dentro del devcontainer:

```bash
SURREAL_URL=ws://surrealdb:8000/rpc
SURREAL_NS=huygens
SURREAL_DB=main
SURREAL_USER=root
SURREAL_PASS=root
```

## Captura (raw_capture)

### Guardar evidencia cruda

```surql
CREATE raw_capture CONTENT {
  content: $text,
  source_kind: 'voice',           -- 'chat' | 'voice' | 'manual' | 'import' | 'agent-self'
  source_ref: $session_ref        -- opcional, e.g. id de sesión de chat
};
```

**Nota**: `$session` es palabra reservada en SurrealDB. Usar `$session_ref` u otro nombre.

`processed_at` defaultea a NONE — el raw queda en el inbox.

### Listar el inbox real (raws pendientes)

```surql
SELECT id, content, source_kind, source_ref, created_at
FROM raw_capture
WHERE processed_at IS NONE
ORDER BY created_at ASC;
```

### Marcar un raw como procesado

```surql
UPDATE $raw SET
  processed_at = time::now(),
  processed_into = $note_ids;   -- array<record<note>>
```

### Localizar la procedencia de una Note

```surql
-- Encontrar el raw_capture que generó esta nota
SELECT id, content, source_kind FROM raw_capture
WHERE $note IN processed_into;
```

## Procesamiento (clarify: raw → notes)

### Insertar varios blocks de golpe

```surql
INSERT INTO block [
  { note: $note, content: $b1, pillars: ['ETHOS'] },
  { note: $note, content: $b2, pillars: [] },
  { note: $note, content: $b3, pillars: ['SOPHIA'] }
];
```

`CREATE block CONTENT [...]` **NO funciona** — `CREATE` espera un objeto, no array. Para batch usa `INSERT`.

### Asignar el orden de blocks en la note

```surql
UPDATE $note SET block_order = $ordered_block_ids;
```

`$ordered_block_ids` es array de `record<block>` en el orden de presentación.

## Lectura

### Releer una Note completa con sus blocks ordenados

Patrón en dos pasos (más fiable que un único join):

```surql
-- Paso 1: get note
SELECT * FROM note WHERE id = $id;

-- Paso 2: get blocks (fetched in any order)
SELECT id, content, pillars FROM block WHERE id IN $note.block_order;
```

Luego ordena los blocks en TS/Python según el orden de `note.block_order`:

```ts
const byId = new Map(blocks.map(b => [String(b.id), b]))
const ordered = note.block_order
  .map(id => byId.get(String(id)))
  .filter(Boolean)
```

### Listar notas pendientes de revisar (no es el inbox del usuario)

```surql
SELECT id, title, pillars, state, updated_at FROM note
WHERE state IN ['CLARIFIED', 'ACTIVE']
  AND (last_reviewed_at IS NONE OR last_reviewed_at < time::now() - 7d)
ORDER BY updated_at DESC;
```

El "inbox del usuario" es `raw_capture WHERE processed_at IS NONE` — ver sección anterior.

### Listar lo activo tocado recientemente (weekly review insight)

```surql
SELECT id, title, state, type.slug AS type_slug, pillars, updated_at
FROM note
WHERE state IN ['ACTIVE', 'WAITING']
  AND updated_at > $since
ORDER BY updated_at DESC;
```

### Notas que tocan un pilar concreto

```surql
SELECT id, title FROM note WHERE $pillar IN pillars;
```

### Una Person y todas las notas que la mencionan

```surql
SELECT id, title, content
FROM (SELECT VALUE <-mentions<-(note|block) FROM $person);
```

## Mutaciones

### Cambiar el estado de una Note (transición GTD)

```surql
UPDATE $note SET state = $new_state;
```

El motor enforza el `ASSERT $value INSIDE [...]`. Si pasas un valor inválido, rechaza.

### Asignar tipo a una Note (clarificación)

```surql
UPDATE $note SET type = $type;  -- $type es record<note_type>, e.g. note_type:task
```

### Añadir un block a una note existente

```surql
LET $new = (INSERT INTO block { note: $note, content: $content, pillars: $pillars });
UPDATE $note SET block_order = array::append(block_order, $new.id);
```

### Promover un block a Note autónoma

```surql
-- 1. Crear la nueva note
LET $new_note = (CREATE note CONTENT {
  title: $new_title,
  pillars: $block.pillars,
  state: 'CLARIFIED'
});

-- 2. Reasignar el block a la nueva note (o copiar su contenido si quieres preservar el original)
UPDATE $block SET note = $new_note.id;

-- 3. Quitar el block del block_order de la note vieja
UPDATE $old_note SET block_order = array::remove(block_order, $block.id);

-- 4. Inicializar el block_order de la nueva note
UPDATE $new_note SET block_order = [$block.id];

-- 5. Dejar edge de procedencia
RELATE $new_note->mentions->$old_note;
```

## Edges

### Crear un edge tipado (idempotente gracias a UNIQUE)

```surql
RELATE $from->mentions->$to;
RELATE $from->supports->$to;
RELATE $from->blocked_by->$to CONTENT { reason: $reason };  -- con props
```

El UNIQUE index en `(in, out)` impide duplicados — re-ejecutar la misma RELATE no spawns un segundo edge, lanza error que puedes ignorar. Para hacerlo robusto:

```surql
-- Intenta, swallow error si ya existe (capturar en código aplicación, no en SurrealQL)
RELATE $from->mentions->$to;
```

Si necesitas garantizar idempotencia sin error, query primero:

```surql
LET $exists = (SELECT * FROM mentions WHERE in = $from AND out = $to);
IF !$exists THEN { RELATE $from->mentions->$to } END;
```

### Eliminar un edge

```surql
DELETE mentions WHERE in = $from AND out = $to;
```

### Listar edges entrantes/salientes de una nota

```surql
-- Salientes de cualquier tipo
SELECT id, ->? FROM $note;

-- Entrantes desde notas vía cualquier edge
SELECT <-?<-note FROM $note;

-- Salientes de un tipo concreto
SELECT ->mentions->? FROM $note;
```

## Traversal de grafo

### Tasks de un Project (1 hop)

```surql
SELECT * FROM note
WHERE ->of_type->note_type.slug = 'task'  -- nota: not implementado aún si no usamos edge para type
  AND <-part_of<-note = $project;
```

Nota: actualmente `type` es un campo, no un edge. Para filtrar por tipo: `WHERE type.slug = 'task'`.

### Subárbol completo bajo un Area (recursivo, multi-hop)

```surql
SELECT id, title,
       ->part_of->note.* AS parent,
       <-part_of<-note.* AS children
FROM $area FETCH children, children.children;
```

### Notas mencionadas por cualquier block de una nota

```surql
SELECT VALUE array::distinct(
  array::flatten(
    SELECT ->mentions->? FROM block WHERE note = $note
  )
);
```

## Vector search

### Búsqueda K-NN sobre blocks con threshold y score

Patrón inspirado en kaig:

```surql
SELECT *, score
FROM (
  SELECT id, content, note,
         (1 - vector::distance::knn()) AS score
  FROM block
  WHERE embedding <|$k,$ef|> $query_embedding
)
WHERE score >= $threshold
ORDER BY score DESC;
```

Parámetros:
- `$k` — cuántos vecinos devolver (e.g. 10)
- `$ef` — effort de búsqueda en HNSW (e.g. 40, mayor = más preciso pero más lento)
- `$threshold` — score mínimo (0-1, e.g. 0.4)

El `1 - distance` convierte distancia coseno a similitud.

### Búsqueda híbrida — vector + filtro + temporal

```surql
SELECT *, score
FROM (
  SELECT b.id AS id, b.content AS content, b.note AS note,
         b.note.title AS note_title,
         (1 - vector::distance::knn()) AS score
  FROM block AS b
  WHERE b.embedding <|20,40|> $query_embedding
    AND b.note.state IN ['ACTIVE', 'WAITING']
    AND b.note.updated_at > $since
)
WHERE score >= 0.4
ORDER BY score DESC
LIMIT 10;
```

Esto combina similitud semántica + filtro por estado de la nota + filtro temporal.

## Reports

### Crear un Report con citas (edges `about`)

```surql
-- 1. Crear la note del report
LET $report = (CREATE note CONTENT {
  title: $title,
  type: note_type:report,
  pillars: $pillars,
  state: 'CLARIFIED',
  metadata: {
    period_start: $period_start,
    period_end: $period_end
  }
});

-- 2. Crear blocks con el contenido narrativo (ver patrón "Insertar varios blocks")

-- 3. Crear edges `about` hacia cada nota/block citado
LET $sources = $cited_note_or_block_ids;
FOR $src IN $sources {
  RELATE $report->about->$src;
};
```

### Listar reports que cubren una nota concreta

```surql
SELECT <-about<-note AS reports FROM $note;
```

## Mantenimiento

### Marcar una nota como revisada (weekly review)

```surql
UPDATE $note SET last_reviewed_at = time::now();
```

### Encontrar notas no revisadas en >N días

```surql
SELECT id, title, last_reviewed_at FROM note
WHERE state IN ['ACTIVE', 'WAITING']
  AND (last_reviewed_at IS NONE OR last_reviewed_at < time::now() - 14d);
```

### Borrar una nota y todo lo que de ella depende

Cuando el usuario explícitamente lo pide. Idealmente esto debería gestionarse con `DEFINE EVENT` para cascadear automáticamente (futuro). Manualmente:

```surql
-- 1. Borrar blocks
DELETE block WHERE note = $note;

-- 2. Borrar edges (entrantes y salientes). Por cada tipo de edge:
DELETE mentions WHERE in = $note OR out = $note;
DELETE supports WHERE in = $note OR out = $note;
DELETE refutes WHERE in = $note OR out = $note;
DELETE part_of WHERE in = $note OR out = $note;
DELETE blocked_by WHERE in = $note OR out = $note;
DELETE about WHERE in = $note OR out = $note;
DELETE authored_by WHERE in = $note OR out = $note;

-- 3. Borrar la note
DELETE $note;
```

## Anti-patrones

- ❌ **`CREATE table CONTENT [array]`**: el array no funciona; usa `INSERT INTO table [...]`
- ❌ **`SELECT FROM ONLY $id LIMIT 1`** sin que `ONLY` sea apropiado: si pasas variable, prefiere `WHERE id = $id`
- ❌ **`ORDER BY array::find_index(...)`**: el parser actual de SurrealQL 3.x no parece aceptar esto en ORDER BY. Ordena en código aplicación
- ❌ **Borrar edges una nota tras otra al borrar la nota**: si hay muchos edges, será lento. Cuando montemos `DEFINE EVENT` esto se cascadeará en motor
- ❌ **No usar `LET $var = ...` para componer queries**: SurrealDB soporta variables locales; úsalas para legibilidad

## Para profundizar

- `apps/mcp/surreal/schema.surql` — el schema real (la fuente)
- `docs/research/04-database/surrealdb-deep-dive.md` — SurrealQL en profundidad
- `apps/mcp/scripts/smoke.ts` — ejemplo end-to-end de uso del driver TS
