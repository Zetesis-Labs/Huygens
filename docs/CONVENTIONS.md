# Huygens — Convenciones para agentes

Este documento traduce `docs/MODEL.md` a reglas operativas. Es para Claude
Code, Codex, Hermes o cualquier agente que use el MCP de Huygens.

## Regla principal

El usuario habla con un agente conversacional. El agente usa el MCP. El MCP
persiste en SurrealDB.

```text
Usuario -> agente conversacional -> MCP Huygens -> SurrealDB
```

El usuario no deberia tener que pensar en SurrealQL, tablas o edges durante el
uso normal.

## Escrituras permitidas

### Captura ligera

El agente puede capturar fragmentos en el inbox sin mucha ceremonia cuando el
usuario lo pide o cuando el contexto lo justifica claramente.

```text
capture(content, source_kind)
```

Capturar no clasifica. Un `raw_capture` es evidencia, no interpretacion. Varios
raws pequeños pueden acumularse en el inbox durante el dia.

### Procesar inbox

Cuando el usuario diga algo como "procesemos el inbox", el agente debe:

```text
listar raws pendientes
agrupar raws relacionados si tiene sentido
debatir la interpretacion con el usuario
proponer uno o varios blocks narrativos
proponer mutaciones visibles
```

Un block narrativo puede derivar de varios raws. No fuerces un block por raw si
la sesion muestra que varios fragmentos pertenecen al mismo asunto.

### Propuesta antes de topologia

Antes de crear o modificar topologia compleja, el agente debe mostrar una
propuesta visible:

```text
raws del inbox que se van a procesar
block narrativo propuesto
notes a crear o actualizar
edges minimos a persistir
```

El usuario debe aprobar esa propuesta o pedir ajustes.

Tras `commit_proposal`, el MCP ejecuta una transaccion atomica (BEGIN…COMMIT):
todas las mutaciones aterrizan juntas o ninguna. El resultado materializado
queda en `proposal.result` con los record ids reales, el mapa `temp_ids`
(temp_id → record id real) y el `versionstamp` de la transaccion. Para
inspeccionar qué cambió exactamente usa `get_proposal_changes`.

### Cambios de estado y metadata

Cambiar el estado ZTD o el `mit_for` de una note existente, o ajustar su
`metadata`, se hace dentro de una proposal (`commit_proposal` con
`note_updates`), igual que cualquier otra mutacion del grafo: el usuario ve el
preview antes de que se aplique. No hay atajo de mutacion directa.

Si la operacion implica interpretar una conversacion, crear varias notes o
decidir relaciones, vale el mismo flujo deliberado.

## Ontologia minima

Usar el vocabulario de v2.1-lite:

```text
raw_capture
note
block
```

`block.block_kind` objetivo:

```text
descriptive
narrative
```

Tipos de `note` objetivo:

```text
task
project
area
routine
idea
reference
person
objetivo
```

No cambies el slug `objetivo` sin una decisión explícita de migración.

Estados ZTD como field:

```text
CLARIFIED
ACTIVE
WAITING
SOMEDAY
DONE
ARCHIVED
```

Edges objetivo:

```text
derived_from: block -> raw_capture          (campo opcional: transformation = verbatim|extracted|summarized|inferred)
about:        block -> note
affects:      block -> note                 (campo obligatorio: action = created|updated|state_changed|linked|archived; summary opcional)
part_of:      note -> note
blocked_by:   note -> note | block          (campos: since readonly, reason opcional)
mentions:     note|block -> note|block
```

`derived_from` puede repetirse para el mismo block si sintetiza varios raws del
inbox.

`blocked_by` admite como destino una `note` o un `block` (por ej. bloqueo
referenciando un informe-block concreto). El caso habitual es note→note.

No introducir nuevos edge types sin una razon concreta y aprobacion del usuario.
Si una relacion es ambigua, usar `mentions`.

## `mit_for`: campo top-level en note (ADR-0023)

`mit_for` es un campo indexado de primera clase en `note`, no una clave en
`metadata`. Representa "esta task es la Most Important Task (MIT) para ese dia".

Reglas:

```text
- El USUARIO decide los MITs. El agente propone; el usuario aprueba.
- Convencion ZTD: 1-3 MITs por dia, no mas.
- Formato aceptado: YYYY-MM-DD (se persiste a medianoche UTC) o ISO datetime.
- Mit_for = NONE → la note no es MIT (valor por defecto).
- El campo permanece tras el dia como rastro historico; no se borra automaticamente.
- Al menos 1 MIT deberia estar relacionado con un Objetivo activo (convencion, no enforced).
```

Para marcar un MIT en una propuesta, usa `mit_for` en `note_creates` o
`note_updates` del payload. Para limpiar el MIT de una note existente, usa
`mit_for: null` en `note_updates`.

```text
list_mits_for_date    → MITs activos/pendientes de un dia concreto
```

## Como decidir field vs edge

```text
Si quieres navegarlo: edge.
Si solo quieres leerlo o filtrarlo: field.
Si explica causalidad: edge con metadata.
Si no sabes para que query sirve: no lo metas.
```

Ejemplos:

```text
state = ACTIVE              field
mit_for = 2026-05-23        field (top-level indexado, no metadata)
task part_of project        edge
block derived_from raw      edge
block affects note          edge
```

## Tools disponibles

El flujo antiguo `raw -> clarify -> notes` fue retirado. Usa solo el flujo de
inbox/proposal/commit:

```text
capture                raw ligero al inbox, status=pending
list_inbox             lee raws por status, default pending
set_raw_status         ignored/deferred/processed sin topologia
get_raw                detalle de un raw_capture + records derivados via derived_from

create_proposal        draft visible, no muta el grafo
update_proposal        edita drafts
get_proposal           inspecciona drafts o estado final (preview legible + JSON)
discard_proposal       descarta drafts
commit_proposal        aprobacion del usuario: transaccion atomica, materializa result
get_proposal_changes   cambios exactos de una proposal commiteada (materialized + changefeed + D2 opcional)

list_mits_for_date     notas MIT del dia dado, filtradas por estado
list_notes_by_type     notas por type slug y estado, ordenadas por updated_at

embed_text             genera embedding para texto libre
index_block            persiste embedding en un block
vector_search          busqueda semantica sobre blocks (HNSW cosine)
find_related           blocks semanticamente proximos a un block dado
chunk_markdown         trocea markdown en blocks

query_query            query SurrealQL de lectura (read-only)
```

## Prohibiciones en esta fase

- No topologizar automaticamente sin revision del usuario.
- No reintroducir reports como entidad persistida.
- No reintroducir `commit_clarify`, `generate_report` persistente,
  `note_type:note` o `note_type:report`.
- No introducir `based_on`, `supports`, `refutes` o `authored_by` como objetivo
  inmediato.
- No cambiar schema, edge types o estados por iniciativa propia.
- No usar SurrealQL directo para mutaciones estructurales si existe una tool MCP
  estrecha para hacerlo.

## Antes de implementar schema

Validar el vocabulario con 10 conversaciones:

```text
raws del inbox
sesion de procesamiento
block narrativo
notes afectadas
edges minimos
```

Si un edge o estado de inbox nuevo no aparece varias veces en ejemplos reales,
probablemente es prematuro.
