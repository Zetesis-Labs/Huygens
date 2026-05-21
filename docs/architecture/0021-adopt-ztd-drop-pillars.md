# ADR-0021: Adoptar ZTD como filosofía operativa y dropear los Pilares Estratégicos

**Status**: Accepted
**Date**: 2026-05-20
**Decision-makers**: Rubén, Claude (asistente IA en sesión de diseño)
**Tags**: vision, data-model

## Context

Huygens nació apoyado en **GTD** + **Pilares Estratégicos** (`PATHOS_SOMA`, `ETHOS`, `TELOS`, `SOPHIA`) como dimensiones ortogonales para clasificar cada nota. Dos observaciones empujan al pivote:

1. **GTD canónico es operacionalmente pesado**. Rubén se autodefine como "creativo y caótico, débil en operativa". Horizontes de foco y weekly reviews exhaustivas piden más disciplina de la que está dispuesto a sostener.

2. **Los Pilares estaban infrautilizados**. Conceptualmente ricos pero implementados solo como `array<string>` por nota. Las funciones que justificarían su existencia — eje narrativo de reports, brújula de balance, slice estratégico — **no estaban construidas**. Mientras tanto, el agente cargaba con asignarlos en cada captura: coste cognitivo real, valor dudoso.

**Zen to Done** (Leo Babauta, 2007) es una simplificación de GTD orientada a hábitos: capturar todo inmediatamente, procesar la inbox a diario, planificar con **MITs** (1-3 por día) y **rocas** semanales, ejecutar con foco. Operativa real, no ontología.

## Decision

**Adoptar ZTD como filosofía operativa del agente y dropear los Pilares Estratégicos del modelo de datos.**

Cambios concretos:

- **`pillars: array<string>`** se elimina de `note` y `block`. El agente deja de razonar sobre ellos.
- La función "dimensión estratégica" pasa a **Objetivos** (ver ADR-0022): notas de tipo `objetivo` con fecha opcional, agrupables por temática y navegables vía edges.

**Por qué dropear y no diferir**: dejar el campo opcional ignorado introduce ruido en el schema y deja al agente con un campo "a ignorar" en el prompt. El alivio cognitivo solo se materializa si se elimina. Si los Pilares reaparecen, hay una **Opción C** documentada abajo.

## Funciones perdidas y cómo se compensan

| Función original de los Pilares | Compensación post-ZTD |
|---|---|
| Eje narrativo de Reports | Reports se organizan por **Objetivos activos** (no por dimensión abstracta) |
| Brújula de balance ("¿descuido alguna dimensión?") | Distribución de Objetivos activos: si todos son de un solo área temática, se ve |
| Slice estratégico ("todo lo de Sophia") | Traversal del grafo: navega desde un Objetivo hacia sus Projects y Tasks vía `part_of` |
| Permanencia de dimensiones a lo largo de años | Se acepta la pérdida — los Objetivos cambian con el tiempo, no son atemporales |

## Consequences

- **Positivas**:
  - Agente con **menos decisiones por captura**: ya no clasifica en 4 dimensiones cada nota.
  - **Alivio cognitivo** inmediato para Rubén: menos campos mentales que rellenar.
  - Modelo más cercano a la operativa real ZTD (capturar → procesar → MIT → ejecutar).
  - Opciones futuras (Opción C) documentadas: puerta abierta sin coste presente.
- **Negativas**:
  - Pérdida temporal de las cuatro funciones de Pilares descritas arriba.
  - Recuperarlos en el futuro requiere migración: re-clasificar Objetivos existentes con `pillar`.
- **Neutrales**:
  - La filosofía griega de los Pilares queda como pieza histórica del pensamiento desde el que el proyecto nació, aunque no esté implementada.

## Future evolution: Opción C (sketch para el Rubén futuro)

Si los Pilares vuelven en v2+, la forma recomendada **no** es reintroducirlos como `array<string>` por nota. La forma elegante es **como taxonomía de Objetivos**:

```surql
DEFINE TABLE pillar SCHEMAFULL;
DEFINE FIELD slug ON pillar TYPE string;
DEFINE FIELD name ON pillar TYPE string;
DEFINE FIELD description ON pillar TYPE string;
-- Seed: pillar:pathos_soma, pillar:ethos, pillar:telos, pillar:sophia

DEFINE TABLE belongs_to_pillar TYPE RELATION FROM note TO pillar SCHEMAFULL;
DEFINE INDEX belongs_to_pillar_one_per_objetivo ON belongs_to_pillar FIELDS in UNIQUE;
-- Cada Objetivo tiene UN pillar (uniqueness sobre `in`)
```

Pillars como **entidades navegables**, edge únicamente desde `note` de tipo `objetivo`. El agente solo razonaría sobre `pillar` al crear UN Objetivo (raro), no por captura (frecuente). Recupera las cuatro funciones perdidas vía traversal (Objetivo → `belongs_to_pillar` → `pillar`, descendiendo a Projects y Tasks vía `part_of`).

## Alternatives considered

| Alternativa | Pros | Cons | Por qué se rechazó |
|---|---|---|---|
| Mantener GTD + Pilares (status quo) | Coherencia con visión inicial | Pesado operativamente, Pilares infrautilizados | Tensión real con autoperfil del usuario |
| Diferir Pilares (campo opcional ignorado) | Reversible | Ruido en schema, agente con campo a "ignorar" | Compromiso peor que decisión clara |
| Adoptar Bullet Journal | Tan simple como ZTD | Más papel-físico, menos ajustable a sistema digital agéntico | ZTD encaja mejor con agente |
| ZTD completo (drop Pilares) | Limpio, alivio cognitivo | Pérdida de la dimensión filosófica del proyecto | Aceptable — documentado como pivote consciente |
| ZTD + Opción C ahora | Lo mejor de ambos mundos | Schema más complejo + más conceptos para el agente | Reservar para v2 cuando haya tracción real |

## Related

- [ADR-0010](./0010-pillars-and-state-as-enums.md) — esta decisión **supersede la parte de Pilares**; la parte de `NoteState` enum (validado con `ASSERT`) sigue válida
- [ADR-0022](./0022-objetivo-and-idea-types.md) — los Objetivos absorben parte de la función de Pilares
- [ADR-0023](./0023-mit-field.md) — otra pieza del paquete ZTD (campo MIT en `note`)

## Notes

ZTD se adopta como **filosofía, no como dogma**. Las prácticas (MITs, foco diario, rocas semanales, monotarea) viven como heurísticas del agente. Si con uso real Rubén necesita un eje estratégico permanente, la Opción C está sketcheada arriba — ~50 líneas de schema y cuatro registros de seed.

El pivote es consciente: se cierra una puerta filosófica para abrir una puerta operativa. La puerta cerrada queda documentada, no enterrada.
