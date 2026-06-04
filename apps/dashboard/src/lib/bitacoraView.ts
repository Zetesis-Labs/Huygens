import { type InformeRow, listInformes } from './surreal'

// The Bitácora: a chronological reader of the planning/review informes (plan_day,
// review_day, plan_week, review_week), grouped week → day, newest first. It's the
// "over time" counterpart to the MITs view's "now": you read your intentions and
// reflections as a continuous thread. Pure projection over listInformes().

export type BitacoraEntry = InformeRow & { kindLabel: string; kindIcon: string }
export type BitacoraDay = { day: string; label: string; entries: BitacoraEntry[] }
export type BitacoraWeek = { weekStart: string; label: string; days: BitacoraDay[] }

const KIND_META: Record<string, { label: string; icon: string }> = {
  plan_day: { label: 'Plan del día', icon: '🎯' },
  review_day: { label: 'Cierre del día', icon: '🔄' },
  plan_week: { label: 'Plan de la semana', icon: '🗓️' },
  review_week: { label: 'Revisión de la semana', icon: '🔁' }
}

/** Monday (UTC) of the ISO week a 'YYYY-MM-DD' day falls in, as 'YYYY-MM-DD'. */
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
}

function weekLabel(weekStart: string): string {
  return `Semana del ${new Date(`${weekStart}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
}

/**
 * Build the Bitácora feed: weeks (newest first) → days (newest first) → informes
 * (newest first within the day). Insertion order is preserved from the
 * already-sorted listInformes(), so Maps keep the descending order. Empty array
 * when there are no kinded informes yet.
 */
export async function buildBitacora(): Promise<BitacoraWeek[]> {
  const informes = await listInformes()
  const weeks = new Map<string, Map<string, BitacoraEntry[]>>()

  for (const r of informes) {
    const wk = mondayOf(r.day)
    const days = weeks.get(wk) ?? new Map<string, BitacoraEntry[]>()
    if (!weeks.has(wk)) weeks.set(wk, days)
    const entries = days.get(r.day) ?? []
    if (!days.has(r.day)) days.set(r.day, entries)
    const meta = KIND_META[r.kind] ?? { label: r.kind, icon: '📄' }
    entries.push({ ...r, kindLabel: meta.label, kindIcon: meta.icon })
  }

  return [...weeks].map(([weekStart, days]) => ({
    weekStart,
    label: weekLabel(weekStart),
    days: [...days].map(([day, entries]) => ({ day, label: dayLabel(day), entries }))
  }))
}
