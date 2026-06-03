import { useMemo, useState } from 'react'

type DayCount = { day: string; count: number }
type Props = { daysWith: DayCount[]; from?: string | null; to?: string | null }

const WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]
const SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const pad = (n: number): string => String(n).padStart(2, '0')
const key = (y: number, m: number, d: number): string => `${y}-${pad(m + 1)}-${pad(d)}`
const shortText = (day: string): string => {
  const [, m, d] = day.split('-')
  return `${Number(d)} ${SHORT[Number(m) - 1]}`
}
const rangeTag = (from: string, to: string): string =>
  from === to ? shortText(from) : `${shortText(from)}–${shortText(to)}`

// Monday-first cells for a month; leading nulls pad to the first weekday.
function monthCells(y: number, m: number): (string | null)[] {
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(key(y, m, d))
  return cells
}

/**
 * Flight-style date-range picker for the diary. Two months side by side, range
 * highlight with hover preview, days with commits marked. On Apply it navigates to
 * `/?from=<lo>&to=<hi>` (server renders the aggregated range graph). Opens as a
 * popover over the canvas from the "Diario" trigger.
 */
export default function DateRangePicker({ daysWith, from, to }: Props) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState<string | null>(from ?? null)
  const [end, setEnd] = useState<string | null>(to ?? null)
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState(() => {
    const base = from ? new Date(`${from}T12:00:00Z`) : new Date()
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() }
  })

  const counts = useMemo(() => new Map(daysWith.map(d => [d.day, d.count])), [daysWith])
  const active = Boolean(from && to)
  const right = useMemo(() => {
    const d = new Date(Date.UTC(view.y, view.m + 1, 1))
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
  }, [view])

  const shiftMonth = (delta: number): void => {
    const d = new Date(Date.UTC(view.y, view.m + delta, 1))
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  const pick = (day: string): void => {
    if (!start || (start && end)) {
      setStart(day)
      setEnd(null)
    } else if (day >= start) {
      setEnd(day)
    } else {
      setStart(day)
      setEnd(null)
    }
  }

  const apply = (): void => {
    if (!start) return
    const a = start
    const b = end ?? start
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    window.location.href = `/?from=${lo}&to=${hi}`
  }

  const effEnd = end ?? (start ? hover : null)
  const inRange = (day: string): boolean => {
    if (!start || !effEnd) return false
    const [lo, hi] = start <= effEnd ? [start, effEnd] : [effEnd, start]
    return day >= lo && day <= hi
  }
  const isEndpoint = (day: string): boolean => day === start || day === end

  return (
    <>
      <button className={`cal-trigger ${active ? 'on' : ''}`} type="button" onClick={() => setOpen(true)}>
        <span className="cal-tic">📅</span>
        <span>Date review</span>
        {active ? (
          <span className="cal-tag">{rangeTag(from as string, to as string)}</span>
        ) : (
          <span className="cal-chev">▸</span>
        )}
      </button>

      {open && (
        <div
          className="cal-backdrop"
          onClick={() => setOpen(false)}
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close */}
          <div className="cal-pop" onClick={e => e.stopPropagation()}>
            <div className="cal-head">
              <button className="cal-arrow" type="button" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
                ‹
              </button>
              <div className="cal-titles">
                <span className="cal-mtitle">
                  {MONTHS[view.m]} {view.y}
                </span>
                <span className="cal-mtitle">
                  {MONTHS[right.m]} {right.y}
                </span>
              </div>
              <button className="cal-arrow" type="button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
                ›
              </button>
            </div>

            <div className="cal-months">
              {[view, right].map(mo => (
                <div className="cal-month" key={`${mo.y}-${mo.m}`}>
                  <div className="cal-week">
                    {WEEK.map(w => (
                      <span key={w} className="cal-wd">
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="cal-grid">
                    {monthCells(mo.y, mo.m).map((day, idx) =>
                      day == null ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed padding cells
                        <span key={`pad-${idx}`} className="cal-cell pad" />
                      ) : (
                        <button
                          key={day}
                          type="button"
                          className={`cal-cell${inRange(day) ? ' in' : ''}${isEndpoint(day) ? ' end' : ''}${counts.has(day) ? ' has' : ''}`}
                          title={counts.has(day) ? `${counts.get(day)} cambios` : undefined}
                          onMouseEnter={() => setHover(day)}
                          onMouseLeave={() => setHover(null)}
                          onClick={() => pick(day)}
                        >
                          {Number(day.slice(8))}
                          {counts.has(day) && <span className="cal-dot" />}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="cal-foot">
              <span className="cal-range">
                {start ? `desde ${shortText(start)}` : 'elige inicio'}
                {' → '}
                {end ? `hasta ${shortText(end)}` : start ? 'elige fin' : ''}
              </span>
              <span className="cal-actions">
                {active && (
                  <a className="cal-btn ghost" href="/">
                    Limpiar
                  </a>
                )}
                <button className="cal-btn" type="button" disabled={!start} onClick={apply}>
                  Aplicar
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
