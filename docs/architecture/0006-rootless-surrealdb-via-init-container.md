# ADR-0006: SurrealDB rootless vía init container

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: infra, database

## Context

La imagen oficial `surrealdb/surrealdb:latest` es **distroless** y corre como `nonroot` (uid 65532). Al montar un Docker named volume en `/data/db`, Docker lo crea con propiedad `root:root`; el proceso SurrealDB no puede escribir y RocksDB falla con `Permission denied` — restart loop al primer `docker compose up`.

Las soluciones obvias tienen costes: correr como root asienta mala práctica que arrastraría a prod; la imagen es distroless (sin shell, sin `chown`), así que no podemos meter un entrypoint que ajuste permisos; un bind mount con permisos pre-set en el host rompe portabilidad (uids distintos macOS vs Linux).

## Decision

Añadir un servicio **`surrealdb-init`** (BusyBox, una-sola-ejecución) al `docker-compose.yml` del devcontainer. Corre como `root`, hace `chown -R 65532:65532 /data/db && chmod 700 /data/db` sobre el volumen compartido, y termina. El servicio `surrealdb` declara `depends_on: surrealdb-init: condition: service_completed_successfully` para asegurar el orden.

```yaml
surrealdb-init:
  image: busybox:latest
  user: "0:0"
  command: ["sh", "-c", "chown -R 65532:65532 /data/db && chmod 700 /data/db"]
  volumes: [surrealdb_data:/data/db]
  restart: "no"
```

`surrealdb` corre sin `user:` override — usa el `nonroot` (65532) de la propia imagen.

## Consequences

- **Positivas**:
  - SurrealDB rootless también en local — higiene de permisos consistente con prod
  - Sin imagen custom; nos beneficiamos de updates de la oficial automáticamente
  - Idempotente: re-ejecutar `compose up` es no-op sobre volumen ya correcto
  - Compose-only, sin scripts host — portabilidad total macOS/Linux
- **Negativas**: un contenedor extra; ~5s extra en el primer arranque (BusyBox pull + chown del volumen vacío)
- **Neutrales**: el servicio init aparece como `Exited (0)` en `docker ps -a` (esperado)

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| SurrealDB como root | Una línea menos | Mala higiene; arrastra el patrón a prod | Coste operacional supera la simplicidad |
| Imagen custom con entrypoint chown | Init invisible | Dockerfile que mantener; perdemos updates automáticos de la oficial | Mantenimiento perpetuo por un problema one-time |
| Bind mount con permisos pre-set en host | Sin contenedor extra | Rompe portabilidad (uids macOS vs Linux) | Devcontainer-first: setup debe ser `compose up` y nada más |

## Related

- ADRs: `ADR-0003` (devcontainer-first development), `ADR-0005` (SurrealDB sobre MongoDB)
- Código afectado: `.devcontainer/docker-compose.yml`

## Notes

El patrón init-container-para-chown es estándar en Kubernetes (`initContainers`) y se traduce 1-a-1 a Compose vía `depends_on.condition: service_completed_successfully`. Si en el futuro empaquetamos para Helm/K8s, este servicio se promueve a `initContainers` del Pod de SurrealDB sin cambios conceptuales.
