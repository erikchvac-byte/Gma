import { describe, it, expect } from 'vitest'
import { buildNewArrivalDormancyReport, DORMANCY_MIN_ABSENT_RUNS } from './newArrivalDormancy.js'
import type { StoreHealthStatus } from './extractionHealth.js'
import type { ProductObservation, ProductRecord, ProductsFile } from '../types/index.js'

const TODAY = '2026-07-10'

function obs(date: string): ProductObservation {
  return { observedAt: `${date}T12:00:00.000Z`, special: false, options: [] }
}

// Presence-only fixture: identity + the days this SKU was observed on. options intentionally empty —
// this fact never reads a price.
function prod(
  dispensaryId: string,
  productId: string,
  days: string[],
  over: Partial<ProductRecord> = {},
): ProductRecord {
  return {
    productId,
    dispensaryId,
    name: `${productId} name`,
    category: 'Flower',
    brand: 'Acme',
    strainType: 'hybrid',
    packCount: null,
    flags: [],
    history: days.map(obs),
    ...over,
  }
}

function file(records: ProductRecord[]): ProductsFile {
  const products: Record<string, ProductRecord> = {}
  for (const r of records) products[`${r.dispensaryId}::${r.productId}`] = r
  return { lastUpdated: `${TODAY}T00:00:00.000Z`, products }
}

const status = (entries: Array<[string, StoreHealthStatus]>) => new Map<string, StoreHealthStatus>(entries)

describe('buildNewArrivalDormancyReport', () => {
  it('emits a SKU absent from the store’s 2 most-recent runs at an ok store (>=floor, ambiguity-flagged)', () => {
    // ok-store scrape-runs: 07-08, 07-09, 07-10 (anchor keeps the store alive on all three). dormant-sku
    // last present 07-08, absent from the two most-recent runs (07-09, 07-10).
    const report = buildNewArrivalDormancyReport(
      file([
        prod('ok-store', 'anchor', ['2026-07-08', '2026-07-09', '2026-07-10']),
        prod('ok-store', 'dormant-sku', ['2026-07-08']),
      ]),
      status([['ok-store', 'ok']]),
      TODAY,
    )

    expect(report.dormant).toHaveLength(1)
    expect(report.dormant[0]).toEqual({
      dispensaryId: 'ok-store',
      productId: 'dormant-sku',
      name: 'dormant-sku name',
      category: 'Flower',
      lastSeen: '2026-07-08',
      absentRuns: 2,
      missedScrapeAmbiguity: true,
    })
    expect(report.dormant[0].absentRuns).toBeGreaterThanOrEqual(DORMANCY_MIN_ABSENT_RUNS)
    expect(report.dormantCount).toBe(1)
    expect(report.belowThresholdCount).toBe(0)
    expect(report.suppressedUnhealthyStoreCount).toBe(0)
    expect(report.newArrivals).toHaveLength(0)
  })

  it('does NOT emit a single-run absence — counts it in belowThresholdCount (Gate 4 core honesty)', () => {
    // sku present on the most-recent-but-one run (07-09), absent only from today's run. 1 absent run < floor.
    const report = buildNewArrivalDormancyReport(
      file([
        prod('ok-store', 'anchor', ['2026-07-09', '2026-07-10']),
        prod('ok-store', 'sku', ['2026-07-09']),
      ]),
      status([['ok-store', 'ok']]),
      TODAY,
    )

    expect(report.dormant).toHaveLength(0)
    expect(report.belowThresholdCount).toBe(1)
  })

  it('store-health gate: an identical absent SKU at suspected AND insufficient stores is suppressed, never dormant (AC2)', () => {
    const report = buildNewArrivalDormancyReport(
      file([
        // Both stores have >=2 recent runs and a SKU absent from both — a naive read would emit both.
        prod('suspected-store', 'anchor', ['2026-07-08', '2026-07-09', '2026-07-10']),
        prod('suspected-store', 'sku', ['2026-07-08']),
        prod('insufficient-store', 'anchor', ['2026-07-08', '2026-07-09', '2026-07-10']),
        prod('insufficient-store', 'sku', ['2026-07-08']),
      ]),
      status([
        ['suspected-store', 'suspected-extraction-failure'],
        ['insufficient-store', 'insufficient-history'],
      ]),
      TODAY,
    )

    expect(report.dormant).toHaveLength(0)
    expect(report.suppressedUnhealthyStoreCount).toBe(2)
    expect(report.belowThresholdCount).toBe(0)
  })

  it('counts absent store-RUNS not calendar days — intervening no-data days don’t over-count (AC1 robustness)', () => {
    // Store runs on 07-06, 07-08, 07-10 only; 07-07 and 07-09 are HOLES (no store data at all).
    // sku last present 07-06, absent from the 2 real runs since (07-08, 07-10). Calendar days absent
    // would be 4 (07-07..07-10); the honest run count is exactly 2.
    const report = buildNewArrivalDormancyReport(
      file([
        prod('ok-store', 'anchor', ['2026-07-06', '2026-07-08', '2026-07-10']),
        prod('ok-store', 'sku', ['2026-07-06']),
      ]),
      status([['ok-store', 'ok']]),
      TODAY,
    )

    expect(report.dormant).toHaveLength(1)
    expect(report.dormant[0].absentRuns).toBe(2) // runs, not the 4 calendar days
    expect(report.dormant[0].lastSeen).toBe('2026-07-06')
  })

  it('new arrival: first-ever obs today at an established store emits; the same at an onboarding store is suppressed (AC3)', () => {
    const report = buildNewArrivalDormancyReport(
      file([
        // established store: prior history (anchor from 07-08), plus a genuinely-new SKU first-seen today.
        prod('established', 'anchor', ['2026-07-08', '2026-07-09', '2026-07-10']),
        prod('established', 'new-sku', ['2026-07-10']),
        // fresh store: its earliest day IS today ⇒ every SKU is 'first' ⇒ store-onboarding wave.
        prod('fresh', 'onboarded-sku', ['2026-07-10']),
      ]),
      status([['established', 'ok']]),
      TODAY,
    )

    expect(report.newArrivals).toEqual([
      {
        dispensaryId: 'established',
        productId: 'new-sku',
        name: 'new-sku name',
        category: 'Flower',
        firstSeen: TODAY,
      },
    ])
    expect(report.newArrivalCount).toBe(1)
    expect(report.onboardingStoreArrivalCount).toBe(1)
  })

  it('a store-wide gap today never fabricates a new arrival (Gate 3)', () => {
    // Every SKU present earlier but absent today (store-wide extraction gap). No storeStatus entry ⇒
    // dormancy candidates suppress; the point is that a 'gap' today is never read as 'first'.
    const report = buildNewArrivalDormancyReport(
      file([
        prod('dark-store', 'a', ['2026-07-08', '2026-07-09']),
        prod('dark-store', 'b', ['2026-07-08', '2026-07-09']),
      ]),
      status([]),
      TODAY,
    )

    expect(report.newArrivals).toHaveLength(0)
    expect(report.newArrivalCount).toBe(0)
    expect(report.suppressedUnhealthyStoreCount).toBe(2) // gap SKUs at an unknown-health store
  })

  it('emits presence-only shapes — no price/potency/weight key anywhere', () => {
    const report = buildNewArrivalDormancyReport(
      file([
        prod('ok-store', 'anchor', ['2026-07-08', '2026-07-09', '2026-07-10']),
        prod('ok-store', 'dormant-sku', ['2026-07-08']),
        prod('ok-store', 'new-sku', ['2026-07-10']),
      ]),
      status([['ok-store', 'ok']]),
      TODAY,
    )

    expect(Object.keys(report.newArrivals[0]).sort()).toEqual(
      ['category', 'dispensaryId', 'firstSeen', 'name', 'productId'].sort(),
    )
    expect(Object.keys(report.dormant[0]).sort()).toEqual(
      ['absentRuns', 'category', 'dispensaryId', 'lastSeen', 'missedScrapeAmbiguity', 'name', 'productId'].sort(),
    )
    const forbidden = ['price', 'basePrice', 'specialPrice', 'discountPct', 'thc', 'weightGrams']
    for (const key of forbidden) {
      expect(report.newArrivals[0]).not.toHaveProperty(key)
      expect(report.dormant[0]).not.toHaveProperty(key)
    }
  })

  it('empty input yields a fully-zeroed report', () => {
    const report = buildNewArrivalDormancyReport(file([]), status([]), TODAY)
    expect(report).toEqual({
      newArrivals: [],
      dormant: [],
      totalProducts: 0,
      newArrivalCount: 0,
      dormantCount: 0,
      suppressedUnhealthyStoreCount: 0,
      belowThresholdCount: 0,
      onboardingStoreArrivalCount: 0,
    })
  })

  it('a product whose entire history postdates today is treated as a gap — no throw, counted nowhere', () => {
    const report = buildNewArrivalDormancyReport(
      file([prod('ok-store', 'future', ['2026-07-15'])]),
      status([['ok-store', 'ok']]),
      TODAY,
    )
    expect(report.newArrivalCount).toBe(0)
    expect(report.dormantCount).toBe(0)
    expect(report.suppressedUnhealthyStoreCount).toBe(0)
    expect(report.belowThresholdCount).toBe(0)
    expect(report.totalProducts).toBe(1)
  })

  it('sorts newArrivals and dormant by dispensaryId then productId', () => {
    const report = buildNewArrivalDormancyReport(
      file([
        prod('store-b', 'anchor', ['2026-07-08', '2026-07-09', '2026-07-10']),
        prod('store-b', 'zeta', ['2026-07-08']),
        prod('store-b', 'alpha', ['2026-07-08']),
        prod('store-a', 'anchor', ['2026-07-08', '2026-07-09', '2026-07-10']),
        prod('store-a', 'omega', ['2026-07-08']),
      ]),
      status([
        ['store-a', 'ok'],
        ['store-b', 'ok'],
      ]),
      TODAY,
    )
    expect(report.dormant.map((d) => `${d.dispensaryId}/${d.productId}`)).toEqual([
      'store-a/omega',
      'store-b/alpha',
      'store-b/zeta',
    ])
  })
})
