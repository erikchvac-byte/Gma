import { describe, it, expect } from 'vitest'
import {
  evaluateAlert,
  evaluateRunFreshness,
  FRESH_WINDOW_MS,
  STALE_ALERT_MS,
  DERIVE_FRESH_WINDOW_MS,
  DERIVE_STALE_ALERT_MS,
  DERIVE_MAX_FUTURE_SKEW_MS,
} from './alertGate.js'

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

describe('evaluateRunFreshness', () => {
  // derivation-1.8: freshness of the DAILY derive run, read off the honesty envelope's
  // generatedAt. Same red-only-on-real-staleness discipline as evaluateAlert, scaled to a
  // 24h cadence (default fresh ~28h / stale-alert ~50h → one late run is fine, two missed
  // days red). Inject windows to pin behavior without wall-clock coupling.
  const EPOCH = '1970-01-01T00:00:00.000Z' // EMPTY_GENERATED_AT sentinel (never derived)

  it('a run derived a moment ago → fresh, no alert', () => {
    const v = evaluateRunFreshness(iso(HOUR), NOW)
    expect(v.alert).toBe(false)
    expect(v.fresh).toBe(true)
    expect(v.stale).toBe(false)
    expect(v.neverDerived).toBe(false)
  })

  it('a late/next-wake run in the grace band (older than fresh, younger than stale-alert) → no alert', () => {
    // 40h ago: past the 28h fresh window but short of the 50h stale-alert window
    const v = evaluateRunFreshness(iso(40 * HOUR), NOW)
    expect(v.fresh).toBe(false) // diagnostic band: late-but-graceful, not fresh
    expect(v.stale).toBe(false)
    expect(v.alert).toBe(false)
    expect(v.neverDerived).toBe(false)
  })

  it('a run exactly AT the stale-alert window → not stale (strict >)', () => {
    const v = evaluateRunFreshness(iso(DERIVE_STALE_ALERT_MS), NOW)
    expect(v.stale).toBe(false)
    expect(v.alert).toBe(false)
  })

  it('a run past the stale-alert window (~two missed daily runs) → alert', () => {
    const v = evaluateRunFreshness(iso(55 * HOUR), NOW)
    expect(v.stale).toBe(true)
    expect(v.alert).toBe(true)
    expect(v.neverDerived).toBe(false)
  })

  it('the epoch sentinel (empty fallback, never derived) → alert flagged neverDerived', () => {
    const v = evaluateRunFreshness(EPOCH, NOW)
    expect(v.neverDerived).toBe(true)
    expect(v.alert).toBe(true)
    expect(v.stale).toBe(false) // reported distinctly from a merely-stale run
  })

  it('small future-skew generatedAt counts as fresh, never stale', () => {
    const v = evaluateRunFreshness(iso(-HOUR), NOW) // 1h in the future, within the skew cap
    expect(v.ageMs).toBeLessThan(0)
    expect(v.fresh).toBe(true)
    expect(v.stale).toBe(false)
    expect(v.futureSkew).toBe(false)
    expect(v.alert).toBe(false)
    expect(v.neverDerived).toBe(false)
  })

  it('implausible future-skew (beyond the cap) → alert flagged futureSkew, not stale', () => {
    // 10h in the future: past the 6h plausibility cap — a fast clock could otherwise
    // mask a dead pipeline for days
    const v = evaluateRunFreshness(iso(-10 * HOUR), NOW)
    expect(v.futureSkew).toBe(true)
    expect(v.alert).toBe(true)
    expect(v.fresh).toBe(false)
    expect(v.stale).toBe(false)
    expect(v.neverDerived).toBe(false)
  })

  it('malformed generatedAt is treated as never-derived → alert', () => {
    const v = evaluateRunFreshness('not-a-date', NOW)
    expect(v.neverDerived).toBe(true)
    expect(v.alert).toBe(true)
  })

  it('injected windows override the defaults', () => {
    // with a tiny stale-alert window, a 2h-old run is stale
    const stale = evaluateRunFreshness(iso(2 * HOUR), NOW, { staleAlertMs: HOUR })
    expect(stale.stale).toBe(true)
    expect(stale.alert).toBe(true)
    // with a tiny fresh window, a 2h-old run drops out of the fresh band (no alert)
    const banded = evaluateRunFreshness(iso(2 * HOUR), NOW, { freshWindowMs: HOUR })
    expect(banded.fresh).toBe(false)
    expect(banded.alert).toBe(false)
    // with a raised never-derived baseline, a 2021 timestamp reads as never-derived
    const baselined = evaluateRunFreshness('2021-06-01T00:00:00.000Z', NOW, {
      neverDerivedBaselineMs: Date.UTC(2022, 0, 1),
    })
    expect(baselined.neverDerived).toBe(true)
    expect(baselined.alert).toBe(true)
    // with a tiny skew cap, a 2h-future run is a futureSkew anomaly
    const skewed = evaluateRunFreshness(iso(-2 * HOUR), NOW, { maxFutureSkewMs: HOUR })
    expect(skewed.futureSkew).toBe(true)
    expect(skewed.alert).toBe(true)
  })

  it('window constants are sane: derive stale-alert is well beyond derive fresh; skew cap positive', () => {
    expect(DERIVE_STALE_ALERT_MS).toBeGreaterThan(DERIVE_FRESH_WINDOW_MS)
    expect(DERIVE_MAX_FUTURE_SKEW_MS).toBeGreaterThan(0)
  })
})
