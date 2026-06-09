import { type InformeRow, listInformes } from './surreal'

// The Bitácora: a chronological reader of the ritual informes — `day` (la
// jornada: the single daily ritual that settles pending and orients the day)
// and `week` (the weekly maintenance review) — grouped week → day, newest
// first. It's the "over time" counterpart to the MITs view's "now": you read
// your jornadas as a continuous thread. Pure projection over listInformes().
// The legacy split kinds (plan_day/review_day/…) keep rendering on historic data.

export type BitacoraEntry = InformeRow & { kindLabel: string; kindIcon: string }
export type BitacoraDay = { day: string; label: string; entries: BitacoraEntry[] }
export type BitacoraWeek = { weekStart: string; label: string; days: BitacoraDay[] }

const KIND_META: Record<string, { label: string; icon: string }> = {
  day: { label: 'Jornada', icon: '☀️' },
  week: { label: 'Revisión de la semana', icon: '🔁' },
  // Legacy kinds (pre single-ritual model): historic blocks only.
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

export type RitualNudge = { kind: 'day' | 'week'; message: string }

/**
 * The doctrine's "invitation" given a runtime: the agent can't initiate
 * conversations, so the dashboard nudges instead (USE-002). A nudge is an
 * invitation, never an artifact — committing the ritual stays a deliberate,
 * user-approved act in conversation.
 */
export async function ritualNudges(todayMadrid: string): Promise<RitualNudge[]> {
  const informes = await listInformes()
  const nudges: RitualNudge[] = []

  const dayKinds = new Set(['day', 'plan_day', 'review_day'])
  if (!informes.some(r => r.day === todayMadrid && dayKinds.has(r.kind))) {
    nudges.push({
      kind: 'day',
      message: 'No hay jornada de hoy — pídesela al agente: asentar lo pendiente y orientar el día.'
    })
  }

  // Weekly nudge only on Sunday/Monday, and only if no weekly review landed in
  // the last 7 days (so a Sunday review doesn't re-nudge on Monday).
  const weekday = new Date(`${todayMadrid}T00:00:00Z`).getUTCDay() // 0=Sun, 1=Mon
  if (weekday === 0 || weekday === 1) {
    const cutoff = new Date(`${todayMadrid}T00:00:00Z`)
    cutoff.setUTCDate(cutoff.getUTCDate() - 7)
    const cutoffDay = cutoff.toISOString().slice(0, 10)
    const weekKinds = new Set(['week', 'plan_week', 'review_week'])
    if (!informes.some(r => weekKinds.has(r.kind) && r.day >= cutoffDay)) {
      nudges.push({
        kind: 'week',
        message: 'La semana no tiene revisión — WAITING, deadlines entrantes, SOMEDAY e inbox diferido esperan.'
      })
    }
  }

  return nudges
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
