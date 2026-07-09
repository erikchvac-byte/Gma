import { describe, it, expect } from 'vitest'
import { buildExtractionHealthReport, TRAILING_WINDOW_DAYS, MIN_BASELINE_DAYS, COLLAPSE_RATIO } from './extractionHealth.js'
import type { ProductRecord, ProductObservation, ProductsFile } from '../types/index.js'

const TODAY = '2026-07-15'

function obs(date: string, timeSuffix = 'T12:00:00.000Z'): ProductObservation {
  return { observedAt: `${date}${timeSuffix}`, special: false, options: [] }
}

function makeProduct(productId: string, dispensaryId: string, history: ProductObservation[]): ProductRecord {
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
  }
}

// Builds a store where each entry is [date, count] — `count` distinct products are recorded as
// observed on that date (product ids p0..p_{count-1}, reused across days for realism).
function storeWithDailyCounts(dispensaryId: string, countsByDay: [string, number][]): Record<string, ProductRecord> {
  const maxCount = Math.max(0, ...countsByDay.map(([, c]) => c))
  const products: Record<string, ProductRecord> = {}
  for (let i = 0; i < maxCount; i++) {
    const dates = countsByDay.filter(([, c]) => i < c).map(([d]) => d)
    if (dates.length === 0) continue
    products[`${dispensaryId}::p${i}`] = makeProduct(`p${i}`, dispensaryId, dates.map((d) => obs(d)))
  }
  return products
}

function fileFrom(...productSets: Record<string, ProductRecord>[]): ProductsFile {
  const products: Record<string, ProductRecord> = {}
  for (const set of productSets) Object.assign(products, set)
  return { lastUpdated: TODAY, products }
}

// 14 full trailing days (today-14 .. today-1) all at `count`.
function fullTrailingWindow(count: number): [string, number][] {
  const days: [string, number][] = []
  for (let i = TRAILING_WINDOW_DAYS; i >= 1; i--) {
    const d = new Date(`${TODAY}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() - i)
    days.push([d.toISOString().slice(0, 10), count])
  }
  return days
}

describe('buildExtractionHealthReport (derivation-1.2.5)', () => {
  it('flags collapse-below-threshold: today far below trailing median', () => {
    const store = storeWithDailyCounts('store-collapse', [...fullTrailingWindow(100), [TODAY, 40]])
    const report = buildExtractionHealthReport(fileFrom(store), ['store-collapse'], TODAY)
    expect(report.entries[0]).toMatchObject({
      status: 'suspected-extraction-failure',
      todayCount: 40,
      trailingMedian: 100,
    })
  })

  it('flags gap-today-with-valid-baseline: no observations at all today', () => {
    const store = storeWithDailyCounts('store-gap', fullTrailingWindow(100))
    const report = buildExtractionHealthReport(fileFrom(store), ['store-gap'], TODAY)
    expect(report.entries[0]).toMatchObject({
      status: 'suspected-extraction-failure',
      todayCount: null,
      trailingMedian: 100,
    })
  })

  it('does not flag exactly-at-threshold (todayCount === median * ratio)', () => {
    const store = storeWithDailyCounts('store-exact', [...fullTrailingWindow(100), [TODAY, 50]])
    const report = buildExtractionHealthReport(fileFrom(store), ['store-exact'], TODAY)
    expect(report.entries[0]).toMatchObject({ status: 'ok', todayCount: 50, trailingMedian: 100 })
    expect(50).toBe(100 * COLLAPSE_RATIO)
  })

  it('does not flag just-above-threshold', () => {
    const store = storeWithDailyCounts('store-above', [...fullTrailingWindow(100), [TODAY, 51]])
    const report = buildExtractionHealthReport(fileFrom(store), ['store-above'], TODAY)
    expect(report.entries[0]).toMatchObject({ status: 'ok', todayCount: 51, trailingMedian: 100 })
  })

  it('reports insufficient-history for a zero-history store absent from productsFile.products', () => {
    const report = buildExtractionHealthReport(fileFrom(), ['store-never-observed'], TODAY)
    expect(report.entries[0]).toMatchObject({
      dispensaryId: 'store-never-observed',
      status: 'insufficient-history',
      todayCount: null,
      trailingMedian: null,
      observedDaysInWindow: 0,
    })
    expect(report.insufficientHistoryCount).toBe(1)
  })

  it('treats exactly MIN_BASELINE_DAYS observed trailing days as a valid baseline', () => {
    const days: [string, number][] = []
    for (let i = 2; i <= MIN_BASELINE_DAYS + 1; i++) {
      const d = new Date(`${TODAY}T00:00:00.000Z`)
      d.setUTCDate(d.getUTCDate() - i)
      days.push([d.toISOString().slice(0, 10), 20])
    }
    const store = storeWithDailyCounts('store-boundary', [...days, [TODAY, 20]])
    const report = buildExtractionHealthReport(fileFrom(store), ['store-boundary'], TODAY)
    expect(report.entries[0].observedDaysInWindow).toBe(MIN_BASELINE_DAYS)
    expect(report.entries[0].status).toBe('ok')
  })

  it('treats one fewer than MIN_BASELINE_DAYS as insufficient-history', () => {
    const days: [string, number][] = []
    for (let i = 2; i <= MIN_BASELINE_DAYS; i++) {
      const d = new Date(`${TODAY}T00:00:00.000Z`)
      d.setUTCDate(d.getUTCDate() - i)
      days.push([d.toISOString().slice(0, 10), 20])
    }
    const store = storeWithDailyCounts('store-under-boundary', days)
    const report = buildExtractionHealthReport(fileFrom(store), ['store-under-boundary'], TODAY)
    expect(report.entries[0].observedDaysInWindow).toBe(MIN_BASELINE_DAYS - 1)
    expect(report.entries[0].status).toBe('insufficient-history')
  })

  it('dedups two same-day observations of the same product into one count', () => {
    const baseline = storeWithDailyCounts('store-dedup', fullTrailingWindow(1))
    // Overwrite today's single product with two observations at different timestamps the same day.
    baseline['store-dedup::p0'] = makeProduct('p0', 'store-dedup', [
      ...fullTrailingWindow(1).map(([d]) => obs(d)),
      obs(TODAY, 'T08:00:00.000Z'),
      obs(TODAY, 'T20:00:00.000Z'),
    ])
    const report = buildExtractionHealthReport(fileFrom(baseline), ['store-dedup'], TODAY)
    expect(report.entries[0].todayCount).toBe(1)
  })

  it('aggregates coverage counts across multiple stores', () => {
    const ok = storeWithDailyCounts('store-ok', [...fullTrailingWindow(50), [TODAY, 50]])
    const suspected = storeWithDailyCounts('store-suspected', [...fullTrailingWindow(50), [TODAY, 10]])
    const report = buildExtractionHealthReport(
      fileFrom(ok, suspected),
      ['store-ok', 'store-suspected', 'store-never-observed'],
      TODAY,
    )
    expect(report.totalStores).toBe(3)
    expect(report.okCount).toBe(1)
    expect(report.suspectedCount).toBe(1)
    expect(report.insufficientHistoryCount).toBe(1)
  })
})
