import {
  Bookmark,
  Compass,
  FileText,
  FolderKanban,
  Inbox,
  Lightbulb,
  ListTodo,
  type LucideIcon,
  Square,
  Target,
  User,
  Wrench
} from 'lucide-react'

// Shared presentation tokens for the change graph, used by the node/edge
// components and by the legend so they never drift apart.

/** Icon + colour by note type (the node's identity). `_` is the fallback. */
export const TYPE_STYLE: Record<string, { Icon: LucideIcon; color: string; bg: string }> = {
  area: { Icon: Compass, color: '#0d9488', bg: '#e6f7f4' },
  objective: { Icon: Target, color: '#dc2626', bg: '#fdeaea' },
  project: { Icon: FolderKanban, color: '#7c3aed', bg: '#f1eafe' },
  task: { Icon: ListTodo, color: '#2563eb', bg: '#eaf1fe' },
  idea: { Icon: Lightbulb, color: '#ca8a04', bg: '#fdf8e3' },
  reference: { Icon: Bookmark, color: '#475569', bg: '#eef1f5' },
  agent: { Icon: User, color: '#db2777', bg: '#fceaf3' },
  tool: { Icon: Wrench, color: '#0891b2', bg: '#e5f6fb' },
  raw: { Icon: Inbox, color: '#5b6b8c', bg: '#f0f2f5' },
  block: { Icon: FileText, color: '#5b6b8c', bg: '#f0f2f5' },
  _: { Icon: Square, color: '#5b6b8c', bg: '#f4f4f6' }
}

/** Human label by note type, for the legend. */
export const TYPE_LABEL: Record<string, string> = {
  area: 'Área',
  objective: 'Objetivo',
  project: 'Proyecto',
  task: 'Tarea',
  idea: 'Idea',
  reference: 'Referencia',
  agent: 'Agente',
  tool: 'Herramienta',
  raw: 'Captura',
  block: 'Bloque'
}

// Colour + width by relation KIND: part_of is the structural backbone (thick,
// strong), blocked_by / depends_on are dependencies (medium), owned_by is
// responsibility, relates_to the weak fallback (thin, faint) that replaced
// mentions, duplicates a redundancy marker.
export const KIND_STYLE: Record<string, { stroke: string; strokeWidth: number }> = {
  part_of: { stroke: '#4338ca', strokeWidth: 2.6 },
  blocked_by: { stroke: '#dc2626', strokeWidth: 2 },
  depends_on: { stroke: '#ea580c', strokeWidth: 2 },
  owned_by: { stroke: '#0d9488', strokeWidth: 1.75 },
  relates_to: { stroke: '#94a3b8', strokeWidth: 1.25 },
  duplicates: { stroke: '#a855f7', strokeWidth: 1.5 }
}
export const FALLBACK_EDGE = { stroke: '#5b6b8c', strokeWidth: 1.5 }

/** Human label by relation kind, for the legend. */
export const KIND_LABEL: Record<string, string> = {
  part_of: 'Pertenece a',
  blocked_by: 'Bloqueado por',
  depends_on: 'Depende de',
  owned_by: 'Responsable',
  relates_to: 'Relacionado con',
  duplicates: 'Duplica'
}

/** Dot colour by ZTD note state, for the legend's state filter. */
export const STATE_COLOR: Record<string, string> = {
  ACTIVE: '#2e7d32',
  WAITING: '#d97706',
  SOMEDAY: '#8a93a6',
  DONE: '#9aa3b2',
  ARCHIVED: '#c3cbe0'
}

/** Human label by note state, for the legend. */
export const STATE_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  WAITING: 'En espera',
  SOMEDAY: 'Algún día',
  DONE: 'Hecho',
  ARCHIVED: 'Archivado'
}
