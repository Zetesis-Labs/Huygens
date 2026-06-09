import { describe, expect, test } from 'bun:test'
import { madridDayOf, madridDayRange, madridMidnightUtc, madridWeekRange } from '../src/madrid-time'

/**
 * The ritual gate counts per Madrid day / ISO week. These helpers replaced a
 * hardcoded `+ 2h` that was only correct in summer (CEST): in winter (CET =
 * UTC+1) it shifted the day boundary one hour, so a 23:30 jornada counted for
 * the next day. Pin both regimes and the DST transitions.
 */
describe('madrid-time — DST-correct boundaries', () => {
  test('summer (CEST, UTC+2): Madrid midnight is 22:00Z of the previous day', () => {
    expect(madridMidnightUtc('2026-06-10').toISOString()).toBe('2026-06-09T22:00:00.000Z')
  })

  test('winter (CET, UTC+1): Madrid midnight is 23:00Z of the previous day', () => {
    expect(madridMidnightUtc('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z')
  })

  test('the winter 23:30 Madrid bug: it belongs to the same Madrid day, not the next', () => {
    // 2026-01-15 23:30 Madrid = 22:30Z. The old `+ 2h` formatted it as 00:30 → next day.
    const instant = new Date('2026-01-15T22:30:00.000Z')
    expect(madridDayOf(instant)).toBe('2026-01-15')
    const { start, end } = madridDayRange(instant)
    expect(instant >= start && instant < end).toBe(true)
    expect(start.toISOString()).toBe('2026-01-14T23:00:00.000Z')
    expect(end.toISOString()).toBe('2026-01-15T23:00:00.000Z')
  })

  test('a day range spans exactly the Madrid day across the spring DST change', () => {
    // Spring forward 2026: Sun 2026-03-29, 02:00 CET → 03:00 CEST (23h day).
    const { start, end } = madridDayRange(new Date('2026-03-29T12:00:00.000Z'))
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z') // CET midnight
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z') // CEST midnight
  })

  test('week range is ISO (Monday-start) on the Madrid calendar', () => {
    // 2026-06-10 is a Wednesday → week is Mon 2026-06-08 .. Mon 2026-06-15.
    const { start, end } = madridWeekRange(new Date('2026-06-10T10:00:00.000Z'))
    expect(start.toISOString()).toBe('2026-06-07T22:00:00.000Z') // Mon 08 00:00 CEST
    expect(end.toISOString()).toBe('2026-06-14T22:00:00.000Z') // Mon 15 00:00 CEST
  })

  test('Sunday late-night Madrid still belongs to the closing week, not the next', () => {
    // Sun 2026-06-14 23:30 Madrid = 21:30Z — inside the week that ends Mon 00:00.
    const instant = new Date('2026-06-14T21:30:00.000Z')
    const { start, end } = madridWeekRange(instant)
    expect(start.toISOString()).toBe('2026-06-07T22:00:00.000Z')
    expect(end.toISOString()).toBe('2026-06-14T22:00:00.000Z')
    expect(instant >= start && instant < end).toBe(true)
  })
})
