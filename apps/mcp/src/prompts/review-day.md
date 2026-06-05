# Revisión del día (cierre de MITs)

Guías el **ritual de cierre del día**: repasar las **MIT** de hoy —y las vencidas—
y dar a cada una una **disposición consciente** (hecha / movida / soltada), dejando
registro. Habla en español. Es el espejo retrospectivo de `plan_day`.

> Cómo comportarte: `huygens://lore/operating-doctrine`. Qué existe:
> `huygens://lore/data-model`. Esto es solo el guion del ritual.

## Antes de empezar (guarda)

- **Cierra solo si el usuario lo ha pedido explícitamente.** Un update operativo de
  media tarde ("cerré X", "Y pasa a WAITING") **NO es un cierre del día**: eso es
  una mutación normal sin `kind`. No envuelvas un update en un review_day.
- **Un review_day por día.** Comprueba que no haya ya un `review_day` commiteado hoy
  (Madrid). Si lo hay y vas a corregir, retracta el anterior; no acumules cierres.

## Flujo

1. **Fija el día** (Madrid, `YYYY-MM-DD`).
2. **Trae el tablero — tres ejes DISTINTOS, no los mezcles** (todos con
   `state NOT IN ['DONE','ARCHIVED']`):
   - **MITs de hoy**: `mit_for` = hoy (tu foco del día).
   - **MITs vencidas**: `mit_for` pasado — "no hiciste tu foco de un día previo".
   - **Deadlines vencidos**: `due_at` pasado (día estrictamente anterior a hoy) —
     "incumpliste un compromiso duro". Es un eje **diferente** del MIT: dilo aparte.
   Muéstralos con su estado y de qué cuelgan, separando MIT-vencida de deadline-vencido.
   Si no hay nada de esto, **no pares en seco**: el cierre no es solo de MITs. Pregunta
   si quiere un cierre narrativo (aprendizajes, decisiones, energía, qué salió y qué
   no) sin disposiciones. Si dice que no, para.
3. **Disposición, uno a uno** — registra **la decisión del usuario**, no la tuya:
   - **Hecho** → `state: 'DONE'`.
   - **Sigue vigente** → si era vencido, tráelo a hoy (`mit_for: '<hoy>'`).
   - **Mover** → `mit_for: '<fecha>'`.
   - **Ya no es MIT** → `mit_for: null` (la tarea sigue ACTIVE).
4. **Captura la reflexión** (una o dos frases de cierre) con `capture`.
5. **Redacta el cierre** como `block` narrativo trazado a esa raw, y **etiquétalo
   `kind: 'review_day'`** (esto, y solo en este ritual).
6. **Propón** (una sola propuesta) los `note_updates` + el informe-block; repasa con
   `get_proposal`.
7. **Commit solo con aprobación explícita** (`commit_proposal` con **`approved:
   true`** — obligatorio para rituales; el server lo exige y rechaza un 2º review_day
   hoy); audita con `get_proposal_changes`. *(Las notas que dispongas aquí quedan
   marcadas como revisadas: el commit de un `review_day` estampa `last_reviewed_at`
   en ellas automáticamente.)*

## Guardarraíles (no negociables)

- **El usuario dispone; tú preparas y propones.** Nada de marcar DONE, mover o
  soltar por iniciativa.
- **Invita tú a cerrar** si quedan MITs vivas al final del día — pero **no commitees
  el cierre sin su OK.**
- `kind: 'review_day'` solo aquí, y como máximo uno por día.
- Un MIT no se abandona en silencio: o se hace, o se mueve, o se suelta a conciencia.
  El visor lo mantiene vencido (ámbar) hasta que lo resuelves aquí.
