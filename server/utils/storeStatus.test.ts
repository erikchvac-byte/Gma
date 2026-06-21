import { describe, it, expect } from 'vitest'
import { deriveStoreStatus, STORE_FRESHNESS_WINDOW_MS } from './storeStatus.js'

// Fixed reference instant so every case is deterministic (the predicate takes
// `now` as a parameter and never reads the clock when injected).
const NOW = new Date('2026-06-21T12:00:00.000Z')
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()

describe('deriveStoreStatus', () => {
  describe('ok — ingested within the freshness window', () => {
    it('returns ok when ingested just now', () => {
      expect(deriveStoreStatus(NOW.toISOString(), NOW)).toBe('ok')
    })

    it('returns ok well inside the window', () => {
      expect(deriveStoreStatus(at(STORE_FRESHNESS_WINDOW_MS / 2), NOW)).toBe('ok')
    })

    it('returns ok exactly at the window boundary (<= is inclusive)', () => {
      expect(deriveStoreStatus(at(STORE_FRESHNESS_WINDOW_MS), NOW)).toBe('ok')
    })

    it('returns ok for a future timestamp (clock skew counts as fresh, never stale/failed)', () => {
      const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString()
      expect(deriveStoreStatus(future, NOW)).toBe('ok')
    })
  })

  describe('stale — valid timestamp older than the window', () => {
    it('returns stale one millisecond past the window', () => {
      expect(deriveStoreStatus(at(STORE_FRESHNESS_WINDOW_MS + 1), NOW)).toBe('stale')
    })

    it('returns stale for a long-aged timestamp', () => {
      expect(deriveStoreStatus(at(24 * 60 * 60 * 1000), NOW)).toBe('stale')
    })
  })

  describe('failed — never ingested / malformed (fail-open, never ok)', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace-only string', '   '],
      ['number', 1718971200000],
      ['object', {}],
      ['boolean', true],
      ['unparseable date string', 'not-a-date'],
      ['NaN-yielding garbage', 'NaN'],
    ])('returns failed for %s', (_label, value) => {
      expect(deriveStoreStatus(value, NOW)).toBe('failed')
    })

    it('never returns ok for malformed input even when "now" is the epoch', () => {
      expect(deriveStoreStatus('garbage', new Date(0))).toBe('failed')
    })
  })

  it('is deterministic for the same input and the same now', () => {
    const ts = at(1000)
    expect(deriveStoreStatus(ts, NOW)).toBe(deriveStoreStatus(ts, NOW))
  })
})
