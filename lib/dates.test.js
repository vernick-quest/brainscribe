import { describe, it, expect } from 'vitest'
import { formatLastModified, calendarDaysAgo } from './dates'

// Tuesday 2026-08-04, 3:00 pm local — the day the ambiguity was reported.
const TUE = new Date(2026, 7, 4, 15, 0)

describe('formatLastModified', () => {
  it('says Today for earlier the same day', () => {
    expect(formatLastModified(new Date(2026, 7, 4, 14, 41), TUE)).toBe('Today, 2:41 pm')
  })

  it('says Yesterday', () => {
    expect(formatLastModified(new Date(2026, 7, 3, 20, 56), TUE)).toBe('Yesterday, 8:56 pm')
  })

  // THE BUG: last Wednesday rendered as "WED", which reads as this coming Wednesday, so a
  // correctly-sorted list looked mis-sorted.
  it('never renders a bare weekday for last week — it reads as THIS week', () => {
    // The weekday stays — it is what people recall — but never ALONE.
    const label = formatLastModified(new Date(2026, 6, 29, 13, 44), TUE)
    expect(label).toBe('Wed Jul 29, 1:44 pm')
    expect(label).toMatch(/Jul 29/)   // the part that stops "Wed" meaning two things
  })

  it('orders unambiguously: a newer entry never looks older than an older one', () => {
    const newer = formatLastModified(new Date(2026, 7, 4, 14, 41), TUE)   // Aug 4
    const older = formatLastModified(new Date(2026, 6, 29, 13, 44), TUE)  // Jul 29
    expect(newer).toBe('Today, 2:41 pm')
    expect(older).toMatch(/^Wed Jul 29/)   // weekday AND date — never a bare weekday
  })

  it('counts CALENDAR days, not elapsed hours', () => {
    // 11pm "yesterday" is under 24h before 3pm today, but it is still yesterday.
    expect(formatLastModified(new Date(2026, 7, 3, 23, 0), TUE)).toMatch(/^Yesterday/)
    // 1am today is Today even though something at 11pm yesterday is closer in real time.
    expect(formatLastModified(new Date(2026, 7, 4, 1, 0), TUE)).toMatch(/^Today/)
  })

  it('does not claim Today for a future timestamp (clock skew)', () => {
    expect(formatLastModified(new Date(2026, 7, 6, 9, 0), TUE)).toBe('Thu Aug 6, 9:00 am')
  })

  it('is empty for missing or unparseable input rather than "Invalid Date"', () => {
    expect(formatLastModified(null)).toBe('')
    expect(formatLastModified('not a date')).toBe('')
  })

  it('calendarDaysAgo is calendar-based across a month boundary', () => {
    expect(calendarDaysAgo(new Date(2026, 6, 29), TUE)).toBe(6)
  })
})
