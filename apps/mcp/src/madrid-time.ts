/**
 * Madrid-calendar helpers for the ritual gate. The doctrine counts rituals per
 * Madrid day / ISO week; SurrealDB has no IANA timezone support, so the
 * boundaries are computed here (DST-correct via Intl) and passed to queries as
 * bound UTC instants. This replaces the old hardcoded `+ 2h` (CEST-only: it
 * shifted the day boundary one hour every winter).
 */

const MADRID_TZ = 'Europe/Madrid'

/** Offset (ms) between the wall clock of `timeZone` and UTC at `date`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  )
  return asUtc - date.getTime()
}

/** `YYYY-MM-DD` of the given instant on the Madrid calendar. */
export function madridDayOf(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(instant)
}

/** UTC instant of Madrid midnight starting the given `YYYY-MM-DD`. */
export function madridMidnightUtc(day: string): Date {
  let ts = Date.parse(`${day}T00:00:00Z`)
  // Converge on the real offset (two passes cover a DST change at the boundary).
  for (let i = 0; i < 2; i++) {
    ts = Date.parse(`${day}T00:00:00Z`) - tzOffsetMs(new Date(ts), MADRID_TZ)
  }
  return new Date(ts)
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** UTC instants [start, end) covering the Madrid calendar day containing `instant`. */
export function madridDayRange(instant: Date): { start: Date; end: Date } {
  const day = madridDayOf(instant)
  return { start: madridMidnightUtc(day), end: madridMidnightUtc(addDays(day, 1)) }
}

/** UTC instants [start, end) covering the Madrid ISO week (Mon–Sun) containing `instant`. */
export function madridWeekRange(instant: Date): { start: Date; end: Date } {
  const day = madridDayOf(instant)
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() // 0=Sun … 6=Sat
  const sinceMonday = (weekday + 6) % 7
  const monday = addDays(day, -sinceMonday)
  return { start: madridMidnightUtc(monday), end: madridMidnightUtc(addDays(monday, 7)) }
}
