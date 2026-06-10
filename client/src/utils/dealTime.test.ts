import { describe, it, expect } from 'vitest'
import { hasValidTimedWindow, isDealActive, minutesUntilEnd, parseTimeToMinutes } from './dealTime'
import type { Deal } from '../types'

const makeDeal = (overrides: Partial<Deal>): Deal => ({
  type: 'happy_hour',
  description: 'A deal',
  discountPct: 10,
  startTime: null,
  endTime: null,
  daysValid: ['everyday'],
  ...overrides,
})

const at = (hours: number, minutes = 0) => new Date(2026, 5, 10, hours, minutes)

describe('parseTimeToMinutes', () => {
  it('parses 24-hour strings to minutes since midnight', () => {
    expect(parseTimeToMinutes('21:00')).toBe(1260)
    expect(parseTimeToMinutes('00:00')).toBe(0)
    expect(parseTimeToMinutes('09:05')).toBe(545)
    expect(parseTimeToMinutes('9:05')).toBe(545)
  })

  it('returns NaN for malformed strings', () => {
    expect(parseTimeToMinutes('4pm')).toBeNaN()
    expect(parseTimeToMinutes('')).toBeNaN()
    expect(parseTimeToMinutes('21')).toBeNaN()
    expect(parseTimeToMinutes('21:0')).toBeNaN()
  })

  it('returns NaN for out-of-range hours or minutes', () => {
    expect(parseTimeToMinutes('25:00')).toBeNaN()
    expect(parseTimeToMinutes('12:75')).toBeNaN()
  })
})

describe('minutesUntilEnd', () => {
  it('returns minutes remaining for a same-day end time', () => {
    expect(minutesUntilEnd('23:30', at(23, 0))).toBe(30)
  })

  it('wraps past midnight for overnight windows', () => {
    expect(minutesUntilEnd('02:00', at(23, 0))).toBe(180)
  })

  it('returns NaN for a malformed end time', () => {
    expect(minutesUntilEnd('4pm', at(23, 0))).toBeNaN()
  })
})

describe('isDealActive', () => {
  it('is active inside a same-day window', () => {
    const deal = makeDeal({ startTime: '21:00', endTime: '23:30' })
    expect(isDealActive(deal, at(23, 0))).toBe(true)
    expect(isDealActive(deal, at(21, 0))).toBe(true) // inclusive start
  })

  it('drops a deal that ended earlier today (startTime-aware, no overnight wrap)', () => {
    const deal = makeDeal({ startTime: '14:00', endTime: '16:00' })
    expect(isDealActive(deal, at(17, 0))).toBe(false)
  })

  it('is inactive before the start time and at the exact end time', () => {
    const deal = makeDeal({ startTime: '21:00', endTime: '23:30' })
    expect(isDealActive(deal, at(20, 0))).toBe(false)
    expect(isDealActive(deal, at(23, 30))).toBe(false) // exclusive end
  })

  it('keeps overnight windows active across midnight and expires them after the end', () => {
    const deal = makeDeal({ startTime: '22:00', endTime: '02:00' })
    expect(isDealActive(deal, at(23, 0))).toBe(true)
    expect(isDealActive(deal, at(1, 59))).toBe(true)
    expect(isDealActive(deal, at(2, 0))).toBe(false)
    expect(isDealActive(deal, at(12, 0))).toBe(false)
    expect(isDealActive(deal, at(21, 59))).toBe(false)
  })

  it('never expires until-close deals (start with null end)', () => {
    const deal = makeDeal({ startTime: '21:00', endTime: null })
    expect(isDealActive(deal, at(23, 50))).toBe(true)
    expect(isDealActive(deal, at(3, 0))).toBe(true)
  })

  it('keeps all-day deals (both times null) active', () => {
    expect(isDealActive(makeDeal({}), at(12, 0))).toBe(true)
    expect(isDealActive(makeDeal({ type: 'daily' }), at(12, 0))).toBe(true)
  })

  it('treats a missing endTime key (undefined) as never expiring', () => {
    const deal = makeDeal({ startTime: '21:00', endTime: undefined as unknown as null })
    expect(isDealActive(deal, at(3, 0))).toBe(true)
  })

  it('never expires end-only deals (server mirror: any null time is day-long-active)', () => {
    const deal = makeDeal({ startTime: null, endTime: '16:00' })
    expect(isDealActive(deal, at(15, 0))).toBe(true)
    expect(isDealActive(deal, at(17, 0))).toBe(true)
    expect(isDealActive(makeDeal({ startTime: null, endTime: '00:00' }), at(12, 0))).toBe(true)
  })

  it('never drops deals with unparseable times (no valid expiry evidence)', () => {
    expect(isDealActive(makeDeal({ startTime: '14:00', endTime: '4pm' }), at(23, 0))).toBe(true)
    expect(isDealActive(makeDeal({ startTime: '2pm', endTime: '16:00' }), at(23, 0))).toBe(true)
    expect(isDealActive(makeDeal({ startTime: '2pm', endTime: '4pm' }), at(23, 0))).toBe(true)
  })
})

describe('hasValidTimedWindow', () => {
  it('is true only when both times are present and parseable', () => {
    expect(hasValidTimedWindow(makeDeal({ startTime: '21:00', endTime: '23:30' }))).toBe(true)
  })

  it('is false for null, missing, partial, and malformed times', () => {
    expect(hasValidTimedWindow(makeDeal({}))).toBe(false)
    expect(hasValidTimedWindow(makeDeal({ startTime: '21:00', endTime: null }))).toBe(false)
    expect(hasValidTimedWindow(makeDeal({ startTime: null, endTime: '16:00' }))).toBe(false)
    expect(hasValidTimedWindow(makeDeal({ startTime: '21:00', endTime: undefined as unknown as null }))).toBe(false)
    expect(hasValidTimedWindow(makeDeal({ startTime: '2pm', endTime: '23:30' }))).toBe(false)
    expect(hasValidTimedWindow(makeDeal({ startTime: '21:00', endTime: '4pm' }))).toBe(false)
  })
})
