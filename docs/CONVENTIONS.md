# Huygens — Convenciones para agentes (movido)

> Este documento se consolidó. Las reglas operativas para agentes que usan el MCP
> ya no viven aquí: viven donde el agente las lee en runtime, como **fuente única**.

**Si eres un agente que opera Huygens, lee la doctrina operativa:**

- **Cómo comportarte** (frontera de aprobación, árbol de decisión captura/proceso/
  ritual, disciplina del `kind`, asimetría de iniciativa, reglas de MIT, field-vs-edge,
  prohibiciones) → recurso MCP **`huygens://lore/operating-doctrine`**
  (fuente: [`apps/mcp/src/lore/operating-doctrine.md`](../apps/mcp/src/lore/operating-doctrine.md)).
- **Qué existe** (entidades, edges, ciclo de proposal, superficie de tools) → recurso
  **`huygens://lore/data-model`** ([`apps/mcp/src/lore/data-model.md`](../apps/mcp/src/lore/data-model.md)).
- **Cómo leer el grafo** (recetas SurrealQL read-only) → recurso
  **`huygens://lore/surrealql-cookbook`**.
- **El porqué conceptual** (epistemología de dos planos, tesis del informe-block) →
  [`docs/MODEL.md`](./MODEL.md).

Razón del cambio: las reglas duplicadas en MODEL.md, CONVENTIONS.md y la lore del MCP
driftaban entre sí. La doctrina operativa es ahora el SSOT del comportamiento, servida
por el MCP para que el agente la consuma directamente y no dependa de un doc del repo.
