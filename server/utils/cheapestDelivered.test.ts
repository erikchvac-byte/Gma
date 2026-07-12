import { describe, it, expect } from 'vitest'
import { buildCheapestDeliveredReport, type DeliveredStoreOffer } from './cheapestDelivered.js'
import type { StoreGeoLookup } from './disparityRollups.js'
import type { Disparity, DisparityStore } from '../types/index.js'

function disparity(over: Partial<Disparity> = {}): Disparity {
  return {
    matchKey: 'acme::blue-dream::flower',
    displayName: 'Blue Dream',
    category: 'Flower',
    weightGrams: 3.5,
    lowPrice: 30,
    highPrice: 40,
    spread: 10,
    spreadPct: 0.3333,
    storesCarrying: [
      { dispensaryId: 'store-a', price: 40, quantityAvailable: null },
      { dispensaryId: 'store-b', price: 30, quantityAvailable: null },
    ],
    ...over,
  }
}

function geo(entries: [string, { lat: number; lng: number } | null][]): StoreGeoLookup {
  return new Map(entries)
}

describe('buildCheapestDeliveredReport (derivation-2.2)', () => {
  it('attaches store coords from the geo lookup onto each offer', () => {
    const report = buildCheapestDeliveredReport(
      [disparity()],
      geo([
        ['store-a', { lat: 47.1, lng: -122.1 }],
        ['store-b', { lat: 48.2, lng: -122.2 }],
      ]),
    )
    expect(report.totalCells).toBe(1)
    const offers = report.cells[0].storeOffers
    const a = offers.find((o) => o.dispensaryId === 'store-a')!
    expect(a).toMatchObject({ price: 40, lat: 47.1, lng: -122.1 })
    expect(report.offersWithGeo).toBe(2)
    expect(report.missingGeoCount).toBe(0)
  })

  it('emits null coords and counts missingGeo when a store is absent from the lookup or maps to null', () => {
    const report = buildCheapestDeliveredReport(
      [disparity()],
      geo([
        ['store-a', { lat: 47.1, lng: -122.1 }],
        ['store-b', null], // present but unresolved
      ]),
    )
    const b = report.cells[0].storeOffers.find((o) => o.dispensaryId === 'store-b')!
    expect(b).toMatchObject({ price: 30, lat: null, lng: null })
    expect(report.missingGeoCount).toBe(1) // store-b maps to null
    expect(report.offersWithGeo).toBe(1)
    expect(report.totalStoreOffers).toBe(2)
    // A store entirely absent from the lookup is also null-geo and counted.
    const report2 = buildCheapestDeliveredReport([disparity()], geo([['store-a', { lat: 47.1, lng: -122.1 }]]))
    expect(report2.missingGeoCount).toBe(1) // store-b absent
  })

  it('a cell whose stores ALL lack geo is still emitted (never dropped)', () => {
    const report = buildCheapestDeliveredReport([disparity()], geo([]))
    expect(report.totalCells).toBe(1)
    expect(report.cells[0].storeOffers).toHaveLength(2)
    expect(report.missingGeoCount).toBe(2)
    expect(report.offersWithGeo).toBe(0)
  })

  it('emits ALL store offers per cell, sorted by price then dispensaryId (not just the cheapest)', () => {
    const report = buildCheapestDeliveredReport(
      [
        disparity({
          storesCarrying: [
            { dispensaryId: 'store-c', price: 50, quantityAvailable: null },
            { dispensaryId: 'store-a', price: 30, quantityAvailable: null },
            { dispensaryId: 'store-b', price: 30, quantityAvailable: null }, // tie → dispensaryId breaks it
          ],
        }),
      ],
      geo([]),
    )
    const offers = report.cells[0].storeOffers
    expect(offers).toHaveLength(3) // every store, not pre-picked
    expect(offers.map((o) => o.dispensaryId)).toEqual(['store-a', 'store-b', 'store-c'])
  })

  it('pricePerGram = price / weightGrams at 4dp; price passes through unrounded', () => {
    const report = buildCheapestDeliveredReport(
      [disparity({ weightGrams: 3, storesCarrying: [
        { dispensaryId: 'store-a', price: 10, quantityAvailable: null },
        { dispensaryId: 'store-b', price: 20, quantityAvailable: null },
      ] })],
      geo([]),
    )
    const a = report.cells[0].storeOffers.find((o) => o.dispensaryId === 'store-a')!
    expect(a.price).toBe(10) // unrounded pass-through
    expect(a.pricePerGram).toBe(3.3333) // 10/3 = 3.3333… → 4dp
  })

  it('cells are sorted by matchKey then weightGrams for stable daily diffs', () => {
    const report = buildCheapestDeliveredReport(
      [
        disparity({ matchKey: 'zeta', weightGrams: 3.5 }),
        disparity({ matchKey: 'alpha', weightGrams: 7 }),
        disparity({ matchKey: 'alpha', weightGrams: 3.5 }),
      ],
      geo([]),
    )
    expect(report.cells.map((c) => `${c.matchKey}:${c.weightGrams}`)).toEqual(['alpha:3.5', 'alpha:7', 'zeta:3.5'])
  })

  it('empty input → empty report', () => {
    const report = buildCheapestDeliveredReport([], geo([]))
    expect(report).toEqual({ cells: [], totalCells: 0, totalStoreOffers: 0, offersWithGeo: 0, missingGeoCount: 0 })
  })

  // FR16 / decision-F gate (NFR6): the input is the shared Disparity/DisparityStore type, which
  // carries no base/special PAIR, no discount rate, and no potency — so a banner-rate or potency
  // read literally does not typecheck (pattern: brandStoreMatrix.test.ts:170-178).
  it('decision F: potency, discount rate, and the base/special price pair are unreachable on the input type', () => {
    const store: DisparityStore = { dispensaryId: 's', price: 25, quantityAvailable: null }
    // @ts-expect-error thc is not a field on DisparityStore (potency hidden — Gate 5)
    void store.thc
    // @ts-expect-error discountPct is not a field on DisparityStore (flat banner rate hidden — fix6)
    void store.discountPct
    // @ts-expect-error basePrice is not a field on DisparityStore (the price PAIR is hidden — Gate 2)
    void store.basePrice
    // @ts-expect-error specialPrice is not a field on DisparityStore (the price PAIR is hidden — Gate 2)
    void store.specialPrice

    const offer: DeliveredStoreOffer = { dispensaryId: 's', price: 25, pricePerGram: 7.1429, lat: null, lng: null }
    // @ts-expect-error thc is not a field on the emitted offer either
    void offer.thc
    expect(store.price).toBe(25)
  })
})
