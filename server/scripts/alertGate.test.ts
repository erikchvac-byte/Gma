import { describe, it, expect } from 'vitest'
import { evaluateAlert, FRESH_WINDOW_MS, STALE_ALERT_MS } from './alertGate.js'

const NOW = Date.UTC(2026, 5, 22, 12, 0, 0) // fixed "now"
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const HOUR = 60 * 60 * 1000

const store = (id: string, msAgo: number) => ({ id, lastFetchedAt: iso(msAgo) })

describe('evaluateAlert', () => {
  it('all stores fresh → no alert', () => {
    const v = evaluateAlert([store('a', HOUR), store('b', 10 * 60 * 1000)], NOW)
    expect(v.alert).toBe(false)
    expect(v.freshCount).toBe(2)
    expect(v.totalFailure).toBe(false)
  })

  it('one store empty for a single run stays fresh (recent lastFetchedAt) → no alert', () => {
    // an empty run keeps last-known-good, so the store is still within the window
    const v = evaluateAlert([store('a', HOUR), store('b', 2 * HOUR)], NOW)
    expect(v.alert).toBe(false)
    expect(v.staleStores).toEqual([])
  })

  it('no store fresh → total-failure alert', () => {
    const v = evaluateAlert([store('a', 8 * HOUR), store('b', 9 * HOUR)], NOW)
    expect(v.totalFailure).toBe(true)
    expect(v.alert).toBe(true)
  })

  it('one previously-healthy store stale beyond the alert window → alert (others fresh keep totalFailure false)', () => {
    const v = evaluateAlert([store('fresh', HOUR), store('dark', 7 * HOUR)], NOW)
    expect(v.totalFailure).toBe(false)
    expect(v.staleStores).toEqual(['dark'])
    expect(v.alert).toBe(true)
  })

  it('a store between the fresh window and the stale-alert window does NOT alert (grace band)', () => {
    // 4h ago: older than FRESH (3h) so not counted ok, but younger than STALE_ALERT (6h)
    const v = evaluateAlert([store('fresh', HOUR), store('graceful', 4 * HOUR)], NOW)
    expect(v.staleStores).toEqual([])
    expect(v.alert).toBe(false)
  })

  it('never-ingested (epoch) stores are excluded from the stale check and do not alert on their own', () => {
    const seed = { id: 'dutchie-new', lastFetchedAt: '1970-01-01T00:00:00.000Z' }
    const v = evaluateAlert([store('a', HOUR), seed], NOW)
    expect(v.staleStores).toEqual([]) // epoch store is not "gone dark"
    expect(v.alert).toBe(false) // 'a' is fresh, so not total failure
    expect(v.freshCount).toBe(1)
  })

  it('all stores epoch (never ingested) → total failure (nothing fresh) → alert', () => {
    const v = evaluateAlert(
      [
        { id: 'a', lastFetchedAt: '1970-01-01T00:00:00.000Z' },
        { id: 'b', lastFetchedAt: '1970-01-01T00:00:00.000Z' },
      ],
      NOW,
    )
    expect(v.freshCount).toBe(0)
    expect(v.totalFailure).toBe(true)
    expect(v.alert).toBe(true)
  })

  it('malformed lastFetchedAt is treated as never-ingested (not fresh, not stale-alerting)', () => {
    const v = evaluateAlert([store('a', HOUR), { id: 'bad', lastFetchedAt: 'not-a-date' }], NOW)
    expect(v.staleStores).toEqual([])
    expect(v.alert).toBe(false)
  })

  it('future-skew timestamp counts as fresh, never as stale', () => {
    const v = evaluateAlert([{ id: 'skew', lastFetchedAt: iso(-HOUR) }], NOW) // 1h in the future
    expect(v.freshCount).toBe(1)
    expect(v.alert).toBe(false)
  })

  it('window constants are sane: stale-alert is well beyond fresh', () => {
    expect(STALE_ALERT_MS).toBeGreaterThan(FRESH_WINDOW_MS)
  })
})
