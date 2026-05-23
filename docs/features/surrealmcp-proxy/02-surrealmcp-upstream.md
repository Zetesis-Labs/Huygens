# SurrealMCP oficial (upstream)

> Versión objetivo: **v0.4.0** (imagen `surrealdb/surrealmcp:v0.4.0`).
> Repositorio: <https://github.com/surrealdb/surrealmcp>.

## Qué es

`surrealmcp` es el servidor MCP oficial mantenido por SurrealDB. Expone la
superficie de SurrealQL como tools MCP: permite a un cliente compatible
ejecutar `SELECT`, `CREATE`, `UPDATE`, `DELETE`, etc. contra una instancia
SurrealDB sin escribir queries a pelo. En el feature pack lo usamos como
**upstream** detrás de un proxy interno al MCP de Huygens, de modo que el
agente conversacional pueda inspeccionar el grafo en lectura sin que el MCP
de Huygens tenga que reimplementar cada query.

No es un servidor especulativo: se distribuye como imagen Docker oficial y
binario en el repo upstream. La autoridad sobre tools y argumentos vive en
ese repo; este documento es solo el contrato observado para v0.4.0.

## License

Distribuido bajo **BSL 1.1** (Business Source License). Permite uso
personal y single-user sin restricciones; las cláusulas comerciales aplican
a despliegues multi-tenant o servicios gestionados. Huygens es una memoria
estructurada personal de un único usuario, por lo que la licencia no
plantea problema en este contexto. Si algún día Huygens se ofrece como
servicio a terceros habrá que revisar.

## Configuración

### Variables de entorno

| Variable | Descripción | Valor en nuestro setup |
|---|---|---|
| `SURREALDB_URL` | Endpoint del SurrealDB upstream | `ws://surrealdb:8000` |
| `SURREALDB_NS` | Namespace | `huygens` |
| `SURREALDB_DB` | Database | `main` |
| `SURREALDB_USER` | Usuario con permisos limitados | `huygens_reader` |
| `SURREALDB_PASS` | Password del usuario lector | secreto generado, fuera de git |

Las credenciales `root/root` del compose actual **no** deben usarse aquí:
el upstream se autentica con un usuario `VIEWER` dedicado (ver más abajo).

### Argumentos CLI

Por defecto `surrealmcp` arranca en transport **stdio**, pensado para
clientes que lo lanzan como subproceso. Como el proxy de Huygens consume
el upstream por HTTP a través del network del devcontainer, hay que
arrancarlo con el subcomando `start` y un bind address HTTP:

```bash
surrealmcp start --bind-address 0.0.0.0:8080 --auth-disabled
```

### Endpoint final

Dentro del network `default_network` del compose:

```text
http://surrealmcp:8080/mcp
```

El servicio se llamará `surrealmcp` en `docker-compose.yml` y vivirá en
el mismo `default_network` que el resto. No se expone puerto al host por
defecto; el proxy del MCP de Huygens es el único cliente.

## Tools expuestas

Lista observada para v0.4.0. La columna **estado en proxy** describe qué
hace el proxy de Huygens con cada tool cuando arranca con credenciales
`VIEWER`.

| Tool | Tipo | Descripción | Estado en proxy |
|---|---|---|---|
| `query` | read | Ejecuta SurrealQL arbitrario | incluida |
| `select` | read | `SELECT` sobre tabla/range | incluida |
| `create` | write | `CREATE` / `INSERT` record | oculta |
| `update` | write | `UPDATE` parcial o total | oculta |
| `delete` | write | `DELETE` record | oculta |
| `merge` | write | `MERGE` sobre record existente | oculta |
| `patch` | write | `PATCH` (JSON Patch) | oculta |
| `insert` | write | `INSERT` bulk | oculta |
| `relate` | write | Crear edge `RELATE` | oculta |
| `info` | read | Metadatos de la conexión actual | incluida si existe |
| `signin` / `use` | infra | Auth y switch de NS/DB | no expuestas al agente |

Notas:

- **Filtramos por allowlist read-only en el proxy.** El auto-discovery del
  proxy lista todas las tools que el upstream anuncia, pero Huygens solo
  re-expone `query`, `select` e `info` si existen. Las write tools no aparecen
  en `tools/list`.
- El usuario `VIEWER` sigue siendo la defensa real si alguien intenta mutar
  usando `query_query` con SurrealQL crudo.
- `info`, `signin`, `use` están listadas como "probablemente presentes":
  hay que confirmar tras un `tools/list` real contra v0.4.0 y ajustar
  esta tabla si difiere.
- Si una versión futura añade nuevas tools, el proxy las ocultará por defecto
  hasta que revisemos explícitamente si son read-only y deben entrar en la
  allowlist.

## Modelo de auth

El upstream se autentica con un usuario SurrealDB dedicado, `huygens_reader`,
definido a nivel de **DATABASE** (no ROOT, no NAMESPACE) para que su
alcance esté limitado a `huygens/main`. El rol `VIEWER` concede lectura
sobre todas las tablas de esa DB y nada más.

```sql
DEFINE USER IF NOT EXISTS huygens_reader
  ON DATABASE
  PASSWORD '<generated>'
  ROLES VIEWER;
```

Este `DEFINE USER` se incluirá en el script `db:apply` (o equivalente) del
MCP de Huygens, de forma que cualquier entorno que aplique el schema
también cree el usuario lector. El password se inyecta vía variable de
entorno; el valor por defecto en `.env.example` debe ser un placeholder,
no un secreto real.

## Verificación manual (smoke test)

Smoke test sin involucrar al MCP de Huygens, sólo el upstream contra el
SurrealDB del compose. Útil para validar la imagen antes de cablear el
proxy.

Levantar sólo el upstream y la BD:

```bash
docker compose -f .devcontainer/docker-compose.yml up -d surrealdb surrealmcp
```

Listar tools por HTTP:

```bash
curl -sS -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

(asumiendo que se publique el puerto temporalmente para la prueba).

Ejecutar una lectura — debe devolver datos o un array vacío, **no** error
de permisos:

```bash
curl -sS -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"tools/call",
    "params":{
      "name":"query",
      "arguments":{"query":"SELECT * FROM note LIMIT 1"}
    }
  }'
```

Intentar una escritura — debe fallar con un mensaje de tipo
"Not enough permissions" o "IAM error":

```bash
curl -sS -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{
      "name":"create",
      "arguments":{"thing":"note","data":{"title":"smoke"}}
    }
  }'
```

Si la escritura **no** falla, el usuario no está configurado como `VIEWER`
o el upstream está conectado con otras credenciales: parar y revisar.

## Riesgos conocidos y open questions

- **Pinning de versión.** Usar `surrealdb/surrealmcp:v0.4.0` explícito en
  `docker-compose.yml`, nunca `:latest`. El upstream está pre-1.0 y puede
  romper contratos.
- **Drift de tools entre versiones.** El conjunto y firma de tools del
  upstream puede cambiar entre minors. Cada vez que se suba la versión,
  re-correr el smoke test y revisar la tabla de tools de este documento.
- **Health check.** Verificar si v0.4.0 expone un endpoint tipo
  `/health` o `/ready`. Si no, definir un healthcheck que haga un
  `tools/list` HEAD/POST mínimo, o resignarse a `service_started`.
- **Comportamiento si SurrealDB no está disponible al boot.** Investigar:
  el contenedor probablemente sale con error y `restart: unless-stopped`
  lo reintenta. Confirmar antes de cablear `depends_on` con condición.
- **Bind address.** `0.0.0.0:8080` dentro del contenedor; no exponer
  puerto al host en producción del devcontainer salvo para smoke testing.
- **Lista real de tools en v0.4.0.** La tabla de este documento se basa
  en la superficie típica del upstream; confirmar contra `tools/list`
  real y actualizar antes de cerrar el feature.

Para chequeos futuros, la fuente canónica es el repo upstream:
<https://github.com/surrealdb/surrealmcp>.
