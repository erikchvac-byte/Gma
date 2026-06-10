import { describe, it, expect } from 'vitest'
import { formatLastUpdated } from './formatTime'

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
