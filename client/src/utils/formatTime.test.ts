import { describe, it, expect } from 'vitest'
import { formatCountdown, formatLastUpdated, formatTimeOfDay } from './formatTime'

describe('formatLastUpdated', () => {
  // offset-less ISO strings parse as local time, keeping these assertions
  // timezone-independent
  it('formats a morning ISO timestamp as readable local time', () => {
    expect(formatLastUpdated('2026-06-10T07:45:00')).toBe('Jun 10, 7:45 AM')
  })

  it('formats an evening ISO timestamp with PM and padded minutes', () => {
    expect(formatLastUpdated('2026-12-25T19:05:00')).toBe('Dec 25, 7:05 PM')
  })

  it('returns an empty string for an invalid ISO string', () => {
    expect(formatLastUpdated('not-a-date')).toBe('')
  })

  it('returns an empty string for an empty input', () => {
    expect(formatLastUpdated('')).toBe('')
  })
})

describe('formatTimeOfDay', () => {
  it('formats evening times as 12-hour PM', () => {
    expect(formatTimeOfDay('21:00')).toBe('9:00 PM')
    expect(formatTimeOfDay('23:30')).toBe('11:30 PM')
  })

  it('formats morning times as 12-hour AM with padded minutes', () => {
    expect(formatTimeOfDay('09:05')).toBe('9:05 AM')
    expect(formatTimeOfDay('02:00')).toBe('2:00 AM')
  })

  it('handles midnight and noon', () => {
    expect(formatTimeOfDay('00:00')).toBe('12:00 AM')
    expect(formatTimeOfDay('12:00')).toBe('12:00 PM')
  })

  it('returns null for invalid input', () => {
    expect(formatTimeOfDay('4pm')).toBeNull()
    expect(formatTimeOfDay('')).toBeNull()
    expect(formatTimeOfDay('25:00')).toBeNull()
    expect(formatTimeOfDay('12:75')).toBeNull()
  })
})

describe('formatCountdown', () => {
  it('formats minutes as H:MM', () => {
    expect(formatCountdown(30)).toBe('0:30')
    expect(formatCountdown(185)).toBe('3:05')
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(0)).toBe('0:00')
  })

  it('returns null for negative or NaN input', () => {
    expect(formatCountdown(-1)).toBeNull()
    expect(formatCountdown(NaN)).toBeNull()
  })
})
