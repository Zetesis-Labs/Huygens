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
| 2026-06-09 | [Doctrina: enforcement sin señalizar y copias con drift](./2026-06-09-doctrine-enforcement-and-drift.md) | DOCT-001 → DOCT-006 |
| 2026-06-09 | [Modelo de uso: el sistema real ya no es el documentado](./2026-06-09-usage-model-review.md) | USE-001 → USE-005 |
