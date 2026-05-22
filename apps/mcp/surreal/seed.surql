-- Huygens — seed de NoteType iniciales.
--
-- Tipos mínimos v2.1-lite. NO incluye "inbox", "note" ni "report".
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
  description = 'Concepto generativo que puede nutrir Tasks/Projects/Objetivos vía mentions o blocks narrativos.';

DELETE note_type:note;
DELETE note_type:report;
