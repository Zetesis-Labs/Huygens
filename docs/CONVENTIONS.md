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

### Mutaciones triviales

Cambios simples y directos pueden aplicarse con menos ceremonia:

```text
marcar task como DONE
cambiar state de una note existente
añadir un dato metadata claro pedido por el usuario
```

Si la operacion implica interpretar una conversacion, crear varias notes o
decidir relaciones, no es trivial.

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
derived_from: block -> raw_capture
about:        block -> note
affects:      block -> note
part_of:      note -> note
blocked_by:   note -> note
mentions:     note|block -> note|block
```

`derived_from` puede repetirse para el mismo block si sintetiza varios raws del
inbox.

No introducir nuevos edge types sin una razon concreta y aprobacion del usuario.
Si una relacion es ambigua, usar `mentions`.

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
mit_for = 2026-05-23        field
task part_of project        edge
block derived_from raw      edge
block affects note          edge
```

## Tools disponibles

El flujo antiguo `raw -> clarify -> notes` fue retirado. Usa solo el flujo de
inbox/proposal/commit:

```text
capture            raw ligero al inbox, status=pending
list_inbox         lee raws por status, default pending
set_raw_status     ignored/deferred/processed sin topologia
create_proposal    draft visible, no muta el grafo
update_proposal    edita drafts
get_proposal       inspecciona drafts o estado final
discard_proposal   descarta drafts
commit_proposal    aprobacion del usuario y commit al grafo
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
