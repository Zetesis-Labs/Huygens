-- Huygens — seed de NoteType iniciales.
--
-- 8 tipos genéricos. NO incluye "inbox" — Inbox es un estado (NoteState),
-- no un tipo. Una nota capturada vive con type=NONE + state=INBOX.
--
-- Idempotente: UPSERT crea si no existe, actualiza si existe.
-- IDs legibles (note_type:task) para referencia estable en código/prompts.

UPSERT note_type:task SET
  slug = 'task',
  name = 'Task',
  description = 'Acción concreta y ejecutable.';

UPSERT note_type:project SET
  slug = 'project',
  name = 'Project',
  description = 'Outcome multi-paso. Contiene tasks.';

UPSERT note_type:area SET
  slug = 'area',
  name = 'Area',
  description = 'Área de responsabilidad continua, no se termina.';

UPSERT note_type:routine SET
  slug = 'routine',
  name = 'Routine',
  description = 'Algo recurrente. La cadencia se gestiona fuera del schema por ahora.';

UPSERT note_type:note SET
  slug = 'note',
  name = 'Note',
  description = 'Nota libre — pensamientos, observaciones.';

UPSERT note_type:report SET
  slug = 'report',
  name = 'Report',
  description = 'Narrativa que alinea pilares con táctico/operativo.';

UPSERT note_type:person SET
  slug = 'person',
  name = 'Person',
  description = 'Una persona.';

UPSERT note_type:reference SET
  slug = 'reference',
  name = 'Reference',
  description = 'Material de consulta sin acción asociada (URL, libro, paper, ...).';

UPSERT note_type:objetivo SET
  slug = 'objetivo',
  name = 'Objetivo',
  description = 'Meta estratégica a largo plazo. Puede tener target_date o target_range en metadata. Agrupa Projects via part_of.';

UPSERT note_type:idea SET
  slug = 'idea',
  name = 'Idea',
  description = 'Concepto generativo que puede nutrir Tasks/Projects/Objetivos vía edges mentions/supports. Distinto de note (registro libre).';
