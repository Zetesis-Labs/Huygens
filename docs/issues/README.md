# docs/issues

Hallazgos arquitectónicos, bugs latentes y deuda técnica pendiente. No es backlog operativo (eso vive en `note` con type=task) sino registro de problemas estructurales descubiertos durante revisiones.

Cada documento tiene IDs estables (`ARCH-NNN`, `BUG-NNN`, etc.) referenciables desde commits, ADRs o conversación.

## Convención

- Un fichero por revisión o por incidente significativo, fechado: `YYYY-MM-DD-<slug>.md`
- IDs estables dentro de cada documento; no se renumeran al añadir
- Estado por issue: `open` / `triaged` / `in-progress` / `resolved` / `wontfix`
- Cuando un issue se cierra, anotar el commit/PR/ADR que lo resolvió, no borrar

## Documentos

| Fecha | Documento | Issues |
|---|---|---|
| 2026-05-21 | [Architecture review](./2026-05-21-architecture-review.md) | ARCH-001 → ARCH-013 |
