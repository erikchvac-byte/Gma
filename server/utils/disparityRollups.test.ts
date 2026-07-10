import { describe, it, expect } from 'vitest'
import { buildDisparityRollups, buildStoreGeoLookup } from './disparityRollups.js'
import type { Disparity } from '../types/index.js'
import type { Dispensary } from '../../client/src/types/index.js'
import type { WeedmapsStore } from '../scrapers/weedmaps-stores.js'

function disparity(overrides: Partial<Disparity> & Pick<Disparity, 'category' | 'storesCarrying'>): Disparity {
  return {
    matchKey: 'k',
    displayName: 'Test Product',
    weightGrams: 1,
    lowPrice: 10,
    highPrice: 20,
    spread: 10,
    spreadPct: 1,
    ...overrides,
  }
}

describe('buildDisparityRollups (derivation-1.4)', () => {
  it('aggregates category rollup as a true average, not a sum', () => {
    const disparities = [
      disparity({
        category: 'Flower',
        spreadPct: 1,
        storesCarrying: [
          { dispensaryId: 'a', price: 10, quantityAvailable: null },
          { dispensaryId: 'b', price: 20, quantityAvailable: null },
        ],
      }),
      disparity({
        category: 'Flower',
        spreadPct: 3,
        storesCarrying: [
          { dispensaryId: 'a', price: 5, quantityAvailable: null },
          { dispensaryId: 'c', price: 20, quantityAvailable: null },
        ],
      }),
    ]
    const report = buildDisparityRollups(disparities, new Map())
    expect(report.byCategory).toHaveLength(1)
    expect(report.byCategory[0]).toMatchObject({
      category: 'Flower',
      disparityCount: 2,
      avgSpreadPct: 2, // (1 + 3) / 2, not 4
      distinctStoresInvolved: 3, // a, b, c
    })
  })

  it('keeps different categories as separate rollup rows (Gate 1: no cross-product merge)', () => {
    const disparities = [
      disparity({
        category: 'Flower',
        storesCarrying: [
          { dispensaryId: 'a', price: 10, quantityAvailable: null },
          { dispensaryId: 'b', price: 20, quantityAvailable: null },
        ],
      }),
      disparity({
        category: 'Concentrate',
        storesCarrying: [
          { dispensaryId: 'a', price: 10, quantityAvailable: null },
          { dispensaryId: 'b', price: 20, quantityAvailable: null },
        ],
      }),
    ]
    const report = buildDisparityRollups(disparities, new Map())
    expect(report.byCategory.map((c) => c.category).sort()).toEqual(['Concentrate', 'Flower'])
    expect(report.byCategory.every((c) => c.disparityCount === 1)).toBe(true)
  })

  it('counts a store as cheapest in one row and priciest in another', () => {
    const disparities = [
      disparity({
        category: 'Flower',
        lowPrice: 10,
        highPrice: 20,
        storesCarrying: [
          { dispensaryId: 'store-x', price: 10, quantityAvailable: null }, // cheapest here
          { dispensaryId: 'b', price: 20, quantityAvailable: null },
        ],
      }),
      disparity({
        category: 'Flower',
        lowPrice: 5,
        highPrice: 30,
        storesCarrying: [
          { dispensaryId: 'c', price: 5, quantityAvailable: null },
          { dispensaryId: 'store-x', price: 30, quantityAvailable: null }, // priciest here
        ],
      }),
    ]
    const report = buildDisparityRollups(disparities, new Map())
    const storeX = report.byStore.find((s) => s.dispensaryId === 'store-x')
    expect(storeX).toMatchObject({ disparityCount: 2, timesCheapest: 1, timesPriciest: 1 })
  })

  it('does not credit cheapest OR priciest on a zero-spread (tie) row, but still counts it in disparityCount', () => {
    // A degenerate "disparity": two stores tied at the same price (lowPrice === highPrice). Both
    // stores' price equals lowPrice AND highPrice — crediting either would count each as both
    // cheapest and priciest, inflating the leaderboard. A tie is not an actionable cheapest/
    // priciest, so it must contribute to neither (review 2026-07-09) — but the row is real, so
    // each store's disparityCount still increments.
    const disparities = [
      disparity({
        category: 'Flower',
        lowPrice: 30,
        highPrice: 30,
        spreadPct: 0,
        storesCarrying: [
          { dispensaryId: 'tied-a', price: 30, quantityAvailable: null },
          { dispensaryId: 'tied-b', price: 30, quantityAvailable: null },
        ],
      }),
    ]
    const report = buildDisparityRollups(disparities, new Map())
    for (const id of ['tied-a', 'tied-b']) {
      expect(report.byStore.find((s) => s.dispensaryId === id)).toMatchObject({
        disparityCount: 1,
        timesCheapest: 0,
        timesPriciest: 0,
      })
    }
  })

  it('resolves store geo from the lookup and counts missing geo without dropping the row', () => {
    const disparities = [
      disparity({
        category: 'Flower',
        storesCarrying: [
          { dispensaryId: 'geo-known', price: 10, quantityAvailable: null },
          { dispensaryId: 'geo-unknown', price: 20, quantityAvailable: null },
        ],
      }),
    ]
    const geoLookup = new Map([
      ['geo-known', { lat: 48.1, lng: -122.1 }],
      ['geo-unknown', null],
    ])
    const report = buildDisparityRollups(disparities, geoLookup)
    expect(report.byStore.find((s) => s.dispensaryId === 'geo-known')).toMatchObject({ lat: 48.1, lng: -122.1 })
    const unknown = report.byStore.find((s) => s.dispensaryId === 'geo-unknown')
    expect(unknown).toMatchObject({ lat: null, lng: null })
    expect(report.missingGeoCount).toBe(1)
  })

  it('treats a dispensaryId entirely absent from the geo lookup the same as an explicit null', () => {
    const disparities = [
      disparity({
        category: 'Flower',
        storesCarrying: [{ dispensaryId: 'never-seen', price: 10, quantityAvailable: null }],
      }),
    ]
    const report = buildDisparityRollups(disparities, new Map())
    expect(report.byStore[0]).toMatchObject({ lat: null, lng: null })
    expect(report.missingGeoCount).toBe(1)
  })

  it('reports totalDisparities and an empty report for zero input', () => {
    const report = buildDisparityRollups([], new Map())
    expect(report).toMatchObject({ byCategory: [], byStore: [], totalDisparities: 0, missingGeoCount: 0 })
  })
})

describe('buildStoreGeoLookup (derivation-1.4)', () => {
  function dispensary(id: string, lat?: number, lng?: number): Dispensary {
    return {
      id,
      name: id,
      url: 'https://example.com',
      stale: false,
      lastFetchedAt: '2026-07-09T00:00:00.000Z',
      deals: [],
      ...(lat !== undefined ? { lat, lng } : {}),
    }
  }

  it('resolves a plain Dutchie-only store (data.json only, absent from WEEDMAPS_STORES)', () => {
    const lookup = buildStoreGeoLookup([dispensary('dutchie-only', 47.9, -122.2)], [])
    expect(lookup.get('dutchie-only')).toEqual({ lat: 47.9, lng: -122.2 })
  })

  it('resolves a non-overlap Weedmaps-only store using its own committed coords', () => {
    const weedmapsStores: WeedmapsStore[] = [
      { slug: 'wm-store', dispensaryId: 'weedmaps-only', overlap: false, lat: 48.2, lng: -122.6 },
    ]
    const lookup = buildStoreGeoLookup([], weedmapsStores)
    expect(lookup.get('weedmaps-only')).toEqual({ lat: 48.2, lng: -122.6 })
  })

  it('an overlap entry has no coords of its own and inherits data.json coords by shared id', () => {
    const dispensaries = [dispensary('shared-store', 47.5, -122.3)]
    const weedmapsStores: WeedmapsStore[] = [{ slug: 'wm-shared', dispensaryId: 'shared-store', overlap: true }]
    const lookup = buildStoreGeoLookup(dispensaries, weedmapsStores)
    expect(lookup.get('shared-store')).toEqual({ lat: 47.5, lng: -122.3 })
  })

  it('a dispensaryId in neither source resolves to null (never omitted, never defaulted to 0,0)', () => {
    const lookup = buildStoreGeoLookup([dispensary('known', 47, -122)], [])
    expect(lookup.has('unknown-store')).toBe(false)
    expect(lookup.get('unknown-store')).toBeUndefined()
  })
})
