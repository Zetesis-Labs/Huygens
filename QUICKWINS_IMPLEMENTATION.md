# Saved SurrealQL queries — guía de implementación

> Reemplaza el plan original de *quick-wins* (capa de **Filter** declarativo +
> compilador + DSL + vistas). Tras replantearlo, se descartó esa maquinaria en
> favor de **guardar queries SurrealQL directamente**. Esta nota refleja lo que
> realmente está implementado.

## Decisión

La unidad guardada **es la query SurrealQL**, no un filtro declarativo. El
usuario (y el agente) escriben SurrealQL read-only; se guardan con nombre y se
ejecutan como `huygens_reader`.

**Por qué se descartó el plan anterior** (Filter + `compile.ts` + DSL + tablas
`view`/`view_template`/`composes`): era sobreingeniería y rígida (horneaba el
esquema de dominio en enums; un esquema de almacenamiento `SCHEMAFULL` de 3
tablas para lo que es "guardar un string con un nombre"). SurrealDB ya ejecuta
SurrealQL read-only (`query_query`), y el dueño escribe SurrealQL con soltura.
Resultado: menos código, más flexible, y el esquema se simplifica.

## Arquitectura

```
Usuario / Agente
   │  SurrealQL (string)
   ▼
MCP (apps/mcp)  ── save_query · list_queries · run_query · delete_query
   │  run/list → huygens_reader (VIEWER, writes rechazados por SurrealDB)
   ▼
SurrealDB  ──  tabla saved_query (SCHEMALESS)  +  dominio (note/block/edges)
   ▲
Dashboard (apps/dashboard)  ──  /explorer  (caja SurrealQL + guardadas + tabla/grafo)
```

### Schema — `apps/mcp/surreal/schema.surql`
```sql
DEFINE TABLE OVERWRITE saved_query SCHEMALESS;
DEFINE FIELD OVERWRITE updated_at ON saved_query VALUE time::now();
```
SCHEMALESS a propósito: guarda `{ name, query, pinned, … }` libremente; el shape
lo valida la tool en TS, no la BD → evoluciona sin migraciones.

### MCP — `apps/mcp/src/tools/saved-query.ts` (registrado en `server.ts`)
| Tool | Rol | Conexión |
|---|---|---|
| `save_query` | Crea/actualiza `{name, query, pinned}` | root |
| `list_queries` | Lista (filtrable por `pinned`) | reader |
| `run_query` | Carga la query guardada y la ejecuta read-only (reusa `queryQueryImpl`) | reader |
| `delete_query` | Borra | root |

`query_query` (preexistente) sigue siendo el ejecutor ad-hoc read-only.

### Dashboard — `apps/dashboard`
- `src/lib/queries.ts` — cliente MCP por HTTP (`huygens-mcp:3030`), `extractRows`,
  `rowsToTable`, `rowsToFlow` (detección de filas con forma de nodo).
- `src/pages/api/{save-query,delete-query}.ts` — POST de formulario → tool MCP → redirect.
- `src/pages/explorer.astro` — caja SurrealQL + sidebar de guardadas (cargar/borrar) +
  resultados en **Tabla** (siempre) / **Grafo** (cuando las filas traen `id` + `title`/`name`).

## Seguridad (read-only)

`run_query` / `query_query` / `list_queries` corren como **`huygens_reader`**
(rol VIEWER): SurrealDB rechaza `CREATE/UPDATE/DELETE/RELATE` a nivel de BD.
Solo `save_query`/`delete_query` escriben, y únicamente el metadato en
`saved_query` (como root). Verificado: un `CREATE` ejecutado vía `run_query` no
escribe nada.

## Resultados en el dashboard

- **Tabla**: vale para cualquier query (unión de claves como columnas).
- **Grafo**: se ofrece cuando las filas parecen nodos (`id` + un campo de
  etiqueta). Las aristas se dibujan entre filas del set cuando un campo es un
  record-id que apunta a otra fila (p.ej. `->part_of->note AS part_of`).

## Ejemplo — subárbol `part_of` de un área (incl. subáreas)

Todo lo que cuelga de un área (Irontec), a través de subáreas, como árbol
conectado (la raíz se incluye para que el grafo enganche):

```surql
SELECT id, title, type.slug AS type, state, ->part_of->note AS part_of
FROM note
WHERE id = note:159yz12k3mocht8hmssy
   OR ->part_of->note                                              CONTAINS note:159yz12k3mocht8hmssy
   OR ->part_of->note->part_of->note                               CONTAINS note:159yz12k3mocht8hmssy
   OR ->part_of->note->part_of->note->part_of->note                CONTAINS note:159yz12k3mocht8hmssy
   OR ->part_of->note->part_of->note->part_of->note->part_of->note CONTAINS note:159yz12k3mocht8hmssy
ORDER BY type, title;
```
Nota: profundidad acotada por el nº de ramas `OR`. La recursión nativa de
SurrealDB (`note:x.{1..6}(<-part_of<-note)`) en v3.0.5 devuelve solo el terminal
del path, no el subárbol — por eso la cadena `CONTAINS` explícita.

## Estado

Implementado y probado: typecheck (MCP + dashboard) y biome limpios; ciclo
save/list/run/delete end-to-end; read-only verificado; tabla + grafo OK.
**Despliegue vía devcontainer**: `apps/mcp` se reconstruye (`docker compose build
huygens-mcp`); el dashboard (`astro dev`, bind-mount) recoge cambios en caliente.

## Fuera de alcance / futuro

- Profundidad `part_of` ilimitada (recursión nativa robusta) si hace falta.
- Surface más claro del error de permiso cuando una query intenta escribir.
- *Jump-to* espacial/temporal sobre el grafo (ideas QW5/QW6 originales) siguen
  pendientes si se quisieran abordar.
