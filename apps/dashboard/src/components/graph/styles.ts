import {
  Bookmark,
  Compass,
  FileText,
  FolderKanban,
  Inbox,
  Lightbulb,
  ListTodo,
  type LucideIcon,
  Repeat,
  Square,
  Target,
  User
} from 'lucide-react'

// Shared presentation tokens for the change graph, used by the node/edge
// components and by the legend so they never drift apart.

/** Icon + colour by note type (the node's identity). `_` is the fallback. */
export const TYPE_STYLE: Record<string, { Icon: LucideIcon; color: string; bg: string }> = {
  task: { Icon: ListTodo, color: '#2563eb', bg: '#eaf1fe' },
  project: { Icon: FolderKanban, color: '#7c3aed', bg: '#f1eafe' },
  area: { Icon: Compass, color: '#0d9488', bg: '#e6f7f4' },
  routine: { Icon: Repeat, color: '#d97706', bg: '#fdf0e3' },
  idea: { Icon: Lightbulb, color: '#ca8a04', bg: '#fdf8e3' },
  reference: { Icon: Bookmark, color: '#475569', bg: '#eef1f5' },
  person: { Icon: User, color: '#db2777', bg: '#fceaf3' },
  objetivo: { Icon: Target, color: '#dc2626', bg: '#fdeaea' },
  raw: { Icon: Inbox, color: '#5b6b8c', bg: '#f0f2f5' },
  block: { Icon: FileText, color: '#5b6b8c', bg: '#f0f2f5' },
  _: { Icon: Square, color: '#5b6b8c', bg: '#f4f4f6' }
}

/** Human label by note type, for the legend. */
export const TYPE_LABEL: Record<string, string> = {
  task: 'Tarea',
  project: 'Proyecto',
  area: 'Área',
  routine: 'Rutina',
  idea: 'Idea',
  reference: 'Referencia',
  person: 'Persona',
  objetivo: 'Objetivo',
  raw: 'Captura',
  block: 'Bloque'
}

// Colour + width by relation KIND: part_of is the structural backbone (thick,
// strong), blocked_by a dependency (medium), mentions the weak fallback (thin,
// faint).
export const KIND_STYLE: Record<string, { stroke: string; strokeWidth: number }> = {
  part_of: { stroke: '#4338ca', strokeWidth: 2.6 },
  blocked_by: { stroke: '#dc2626', strokeWidth: 2 },
  mentions: { stroke: '#94a3b8', strokeWidth: 1.25 }
}
export const FALLBACK_EDGE = { stroke: '#5b6b8c', strokeWidth: 1.5 }

/** Human label by relation kind, for the legend. */
export const KIND_LABEL: Record<string, string> = {
  part_of: 'Pertenece a',
  blocked_by: 'Bloqueado por',
  mentions: 'Menciona'
}
