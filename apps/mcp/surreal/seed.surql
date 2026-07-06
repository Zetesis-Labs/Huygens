-- Huygens — seed de NoteType iniciales.
--
-- Tipos mínimos Huygens 2. NO incluye "inbox", "note" ni "report".
--
-- Idempotente: UPSERT crea si no existe, actualiza si existe.
-- IDs legibles (note_type:task) para referencia estable en código/prompts.

UPSERT note_type:area SET
  slug = 'area',
  name = 'Area',
  description = 'Ámbito estable de responsabilidad continua; no se termina.';

UPSERT note_type:objective SET
  slug = 'objective',
  name = 'Objective',
  description = 'Resultado deseado que orienta proyectos y tareas.';

UPSERT note_type:project SET
  slug = 'project',
  name = 'Project',
  description = 'Outcome multi-paso con cierre claro. Contiene tasks.';

UPSERT note_type:task SET
  slug = 'task',
  name = 'Task',
  description = 'Acción concreta y ejecutable.';

UPSERT note_type:idea SET
  slug = 'idea',
  name = 'Idea',
  description = 'Concepto generativo sin compromiso operativo inmediato.';

UPSERT note_type:reference SET
  slug = 'reference',
  name = 'Reference',
  description = 'Material de consulta sin acción asociada (URL, libro, paper, ...).';

UPSERT note_type:agent SET
  slug = 'agent',
  name = 'Agent',
  description = 'Persona, equipo, institución o agente IA que puede poseer trabajo o contexto.';

UPSERT note_type:tool SET
  slug = 'tool',
  name = 'Tool',
  description = 'Herramienta, sistema o capacidad operacional reusable.';

DELETE note_type:routine;
DELETE note_type:person;
DELETE note_type:objetivo;
DELETE note_type:note;
DELETE note_type:report;
