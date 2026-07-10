import { describe, it, expect } from 'vitest'
import { buildSpecialEventsReport } from './specialEvents.js'
import type { ProductRecord, ProductObservation, ProductsFile } from '../types/index.js'

const TODAY = '2026-07-15'

function obs(date: string, special: boolean, timeSuffix = 'T12:00:00.000Z'): ProductObservation {
  return { observedAt: `${date}${timeSuffix}`, special, options: [] }
}

function makeProduct(
  productId: string,
  dispensaryId: string,
  history: ProductObservation[],
  over: Partial<ProductRecord> = {},
): ProductRecord {
  return {
    productId,
    dispensaryId,
    name: 'Test Product',
    category: 'Flower',
    brand: null,
    strainType: null,
    packCount: null,
    flags: [],
    history,
    ...over,
  }
}

function fileFrom(...products: ProductRecord[]): ProductsFile {
  const byKey: Record<string, ProductRecord> = {}
  for (const p of products) byKey[`${p.dispensaryId}::${p.productId}`] = p
  return { lastUpdated: TODAY, products: byKey }
}

// N days before TODAY, UTC-safe.
function daysBefore(n: number): string {
  const d = new Date(`${TODAY}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

describe('buildSpecialEventsReport (derivation-1.3)', () => {
  it('emits special-start when specialPrice appears where none was (false -> true)', () => {
    const p = makeProduct('p1', 'store-a', [obs(daysBefore(1), false), obs(TODAY, true)])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    expect(report.events).toEqual([
      { dispensaryId: 'store-a', productId: 'p1', name: 'Test Product', category: 'Flower', type: 'special-start', date: TODAY },
    ])
    expect(report.startCount).toBe(1)
    expect(report.endCount).toBe(0)
  })

  it('emits special-end when specialPrice disappears (true -> false)', () => {
    const p = makeProduct('p1', 'store-a', [obs(daysBefore(1), true), obs(TODAY, false)])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    expect(report.events).toEqual([
      { dispensaryId: 'store-a', productId: 'p1', name: 'Test Product', category: 'Flower', type: 'special-end', date: TODAY },
    ])
    expect(report.endCount).toBe(1)
    expect(report.startCount).toBe(0)
  })

  it('emits no event and counts gapCount when there is no observation today (Gate 3)', () => {
    const p = makeProduct('p1', 'store-a', [obs(daysBefore(3), false), obs(daysBefore(2), true)])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    expect(report.events).toEqual([])
    expect(report.gapCount).toBe(1)
  })

  it('never emits an event for a gap day even when surrounded by real observations', () => {
    // day-2: false, day-1: gap, today: true (real change vs the LAST REAL day, not a gap-day event)
    const p = makeProduct('p1', 'store-a', [obs(daysBefore(2), false), obs(TODAY, true)])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    // The gap day itself never appears as an event; today correctly resolves to a real
    // changed-after-gap special-start (proves the comparison skips the gap, per 1.2 AC3).
    expect(report.events).toEqual([
      { dispensaryId: 'store-a', productId: 'p1', name: 'Test Product', category: 'Flower', type: 'special-start', date: TODAY },
    ])
  })

  it('emits no event for a product first observed today, even when special is true (AC3)', () => {
    const p = makeProduct('p1', 'store-a', [obs(TODAY, true)])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    expect(report.events).toEqual([])
    expect(report.firstObservationCount).toBe(1)
  })

  it('emits no event when unchanged and counts unchangedCount', () => {
    const p = makeProduct('p1', 'store-a', [obs(daysBefore(1), true), obs(TODAY, true)])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    expect(report.events).toEqual([])
    expect(report.unchangedCount).toBe(1)
  })

  it('dedups same-day duplicate observations: the latest observation of the day wins', () => {
    const p = makeProduct('p1', 'store-a', [
      obs(daysBefore(1), false),
      obs(TODAY, true, 'T08:00:00.000Z'),
      obs(TODAY, false, 'T20:00:00.000Z'),
    ])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    // last observation today is special:false -> no transition from yesterday's false
    expect(report.events).toEqual([])
    expect(report.unchangedCount).toBe(1)
  })

  it('dedups same-day duplicates the other direction and correctly emits a start', () => {
    const p = makeProduct('p1', 'store-a', [
      obs(daysBefore(1), false),
      obs(TODAY, false, 'T08:00:00.000Z'),
      obs(TODAY, true, 'T20:00:00.000Z'),
    ])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    expect(report.events).toEqual([
      { dispensaryId: 'store-a', productId: 'p1', name: 'Test Product', category: 'Flower', type: 'special-start', date: TODAY },
    ])
  })

  it('aggregates totals across multiple products', () => {
    const p1 = makeProduct('p1', 'store-a', [obs(daysBefore(1), false), obs(TODAY, true)])
    const p2 = makeProduct('p2', 'store-a', [obs(daysBefore(1), true), obs(TODAY, false)])
    const p3 = makeProduct('p3', 'store-a', [obs(daysBefore(1), true), obs(TODAY, true)])
    const p4 = makeProduct('p4', 'store-b', [obs(daysBefore(3), true)]) // gap today
    const report = buildSpecialEventsReport(fileFrom(p1, p2, p3, p4), TODAY)
    expect(report.totalProducts).toBe(4)
    expect(report.startCount).toBe(1)
    expect(report.endCount).toBe(1)
    expect(report.unchangedCount).toBe(1)
    expect(report.gapCount).toBe(1)
    expect(report.events).toHaveLength(2)
  })

  it('folds a product whose entire history postdates `today` into gapCount instead of throwing', () => {
    // Simulates clock skew / a bad observedAt / a manual DB repair: every observation is dated
    // AFTER `today`, so walkPresenceAwareSeries' default startDate (the product's own earliest
    // day) lands after endDate and throws internally — this must not abort the whole report.
    const p = makeProduct('p1', 'store-a', [obs(daysBefore(-5), true)])
    const report = buildSpecialEventsReport(fileFrom(p), TODAY)
    expect(report.events).toEqual([])
    expect(report.gapCount).toBe(1)
  })

  it('emitted event objects carry no price/discount field (Gate 2)', () => {
    // Checks BOTH a special-start and a special-end event — a field-leak bug confined to only
    // one event type (e.g. special-end) would slip past a check on events[0] alone.
    const p1 = makeProduct('p1', 'store-a', [obs(daysBefore(1), false), obs(TODAY, true)])
    const p2 = makeProduct('p2', 'store-a', [obs(daysBefore(1), true), obs(TODAY, false)])
    const report = buildSpecialEventsReport(fileFrom(p1, p2), TODAY)
    expect(report.events).toHaveLength(2)
    for (const event of report.events) {
      expect(Object.keys(event).sort()).toEqual(['category', 'date', 'dispensaryId', 'name', 'productId', 'type'])
    }
  })
})
