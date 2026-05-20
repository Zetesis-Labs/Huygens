# ADR-0009: Notes compuestas de Blocks markdown

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: data-model

## Context

Una vez aceptada la topología como primaria (ADR-0008), había que decidir la granularidad del payload markdown sobre cada nodo. Tres opciones se evaluaron:

1. **Markdown monolítico** (`note.content: string`): una nota es un único campo de texto.
2. **Bloques atómicos tipo Notion/Anytype**: cada paragraph/heading es un block, anidados en árbol con tipos discretos.
3. **Bloques markdown auto-contenidos (estilo Zettelkasten)**: una nota es composición ordenada de blocks, cada uno markdown completo, 50-500 palabras, con ID propio.

El criterio fue qué granularidad permite Zettelkasten-trails (referencias a un detalle específico) sin pagar el coste de un editor block-based completo, y qué se vectoriza con qué unidad.

## Decision

Cada `Note` es una **composición ordenada de Blocks**, donde cada Block es un trozo de markdown auto-contenido con ID propio. La nota mantiene `block_order: array<record<block>>` que dicta presentación.

Consecuencia técnica inmediata: el campo `note.content` se elimina; la tabla `note_chunk` (chunks separados para vectorización) desaparece porque el block ES el chunk. El índice HNSW vive directamente sobre `block.embedding`.

## Consequences

- **Positivas**:
  - Cada block es Zettel: unidad de pensamiento auto-contenida, direccionable.
  - La topología (edges) apunta a blocks específicos (`blocked_by` a un detalle, no a una nota entera).
  - Vectorización directa por block — sin tabla `note_chunk` duplicada.
  - Markdown sigue siendo source-of-truth: el agente lo lee y escribe nativamente, sin árbol JSON.
  - `promote-block-to-note` (mover un block a una nota nueva) es una operación natural.
- **Negativas**:
  - Renderizar una page requiere fetch + sort por `block_order` en código aplicación — no es un único SELECT.
  - Más rows: 1 nota con 5 ideas → 1 note + 5 blocks (vs 1 documento monolítico).
- **Neutrales**:
  - El usuario edita markdown plano; la división en blocks la sugiere el agente o un parser por `---` / headings. Decisión de UX, no de schema.

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Markdown monolítico (`note.content`) | Simplísimo, una sola tabla | Topología solo a nivel de nota entera; vectorización requiere `note_chunk` separada; sin granularidad para Zettel-trails | Perdíamos referencias finas justo cuando la topología es primaria |
| Bloques atómicos tipo Notion (árbol JSON tipado) | Granularidad máxima, queryable | Complejidad inmensa: parser, editor, schema por tipo de block, anidamiento; rompe el contrato markdown plano | Sobreingeniería para una memoria personal; pierde la naturaleza markdown-first |
| Zettelkasten blocks (elegido) | Granularidad útil + markdown plano + vectorización directa | Render multi-step | Mejor balance entre simplicidad y poder expresivo |

## Related

- ADRs: `ADR-0008` (topología primaria), `ADR-0011` (edges admiten `note | block`), `ADR-0015` (BGE-M3 embeddings)
- Research: [docs/research/03-data-model/note-model.md](../research/03-data-model/note-model.md)
- Código: `apps/mcp/surreal/schema.surql` (tabla `block`)

## Notes

La metáfora Zettelkasten (Niklas Luhmann) encaja deliberadamente: cada block es una ficha, la nota es la secuencia de fichas que el usuario eligió presentar juntas, y los edges son los hilos que tejen el grafo de pensamiento entre fichas — independientemente de en qué nota viven.
