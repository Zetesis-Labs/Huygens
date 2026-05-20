# ADR-0003: Devcontainer-first development

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: infra

## Context

El host de desarrollo es macOS (Apple Silicon). El target de despliegue es Linux (Docker/Kubernetes). Bun, SurrealDB y futuras dependencias nativas pueden divergir entre host y target — distintas versiones, distintos binarios, distintos comportamientos en filesystem. ZetesisPortal ya impuso la disciplina devcontainer-first y ha eliminado clases enteras de bugs "en mi máquina funciona". Huygens replica la disciplina.

## Decision

**Todo el desarrollo se ejecuta dentro de un devcontainer Docker.** Cero comandos JS/TS o de BBDD en el host. La imagen base del servicio `app` es `oven/bun:1-debian`. SurrealDB y un init container (chown del volumen para que SurrealDB corra rootless como uid 65532) se levantan como servicios hermanos vía Docker Compose.

Convención operativa: desde el host, los comandos se invocan con `docker exec devcontainer-app-1 <cmd>`. Desde dentro del IDE (Cursor/VS Code conectado al devcontainer), se usa el shell del contenedor directamente.

## Consequences

- **Positivas**:
  - La versión de Bun la fija la imagen, no el host
  - Reproducibilidad: lo que corre en dev es lo que correrá en CI y en prod (misma imagen base)
  - Multi-servicio trivial (app + SurrealDB + init container) vía un único `docker compose up`
  - Cero contaminación del host con runtimes/binarios de proyecto
  - Onboarding instantáneo: `git clone` + abrir en Dev Containers
- **Negativas**:
  - Overhead inicial de Docker Desktop (RAM, disco)
  - IO entre host y contenedor más lento en macOS (mitigable con bind mounts cacheados o named volumes)
  - Hay que recordar prefijar comandos con `docker exec` cuando se trabaja desde el host
- **Neutrales**:
  - El proyecto deja de funcionar sin Docker corriendo; deja de ser una herramienta opcional

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Desarrollo nativo en macOS | Sin overhead Docker, IO máximo | Divergencia con prod (Linux), SurrealDB instalado en host, "funciona aquí" | Anula la reproducibilidad que justifica el resto del stack |
| VM / Vagrant | Aislamiento total | Pesado, lento de arrancar, sin integración con IDE moderna | Docker Compose ofrece lo mismo con menos peso |
| Nix dev shell | Reproducible y declarativo | Curva de aprendizaje alta, no resuelve servicios (SurrealDB) sin más capas | El payoff no justifica la complejidad para un proyecto single-user |

## Related

- ADRs: `ADR-0001` (Bun), `ADR-0006` (SurrealDB rootless vía init container)
- Research: [docs/research/02-architecture/devcontainer-and-services.md](../research/02-architecture/devcontainer-and-services.md)
- Código afectado: `.devcontainer/devcontainer.json`, `.devcontainer/docker-compose.yml`

## Notes

El project name de Docker Compose depende de la herramienta que abra el devcontainer (VS Code suele usar `devcontainer`, Cursor a veces `huygens_devcontainer`). Los nombres de contenedor (`devcontainer-app-1` vs `huygens_devcontainer-app-1`) cambian en consecuencia — confirmar con `docker ps` antes de invocar `docker exec`.
