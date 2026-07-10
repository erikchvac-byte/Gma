import { describe, it, expect } from 'vitest'
import {
  buildBrandStoreMatrix,
  type BrandStoreProduct,
  type BrandStoreOption,
} from './brandStoreMatrix.js'

// Small hand-built fixtures only — the live-proof (deriveFactsRun against products.db) is a
// separate sanity check whose counts drift daily.

function prod(over: Partial<BrandStoreProduct> & Pick<BrandStoreProduct, 'dispensaryId'>): BrandStoreProduct {
  return {
    brand: 'Acme',
    matchKey: 'acme|bluedream|hybrid|flower',
    name: 'Blue Dream',
    options: [{ weightGrams: 3.5, price: 30 }],
    ...over,
  }
}

describe('buildBrandStoreMatrix', () => {
  it('availability: two raw spellings normalizing to one key roll up into ONE brand row', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-a', brand: 'Acme', options: [{ weightGrams: 3.5, price: 30 }] }),
      prod({ dispensaryId: 'store-b', brand: 'ACME', options: [{ weightGrams: 1, price: 12 }] }),
    ])
    expect(report.brands).toHaveLength(1)
    const row = report.brands[0]
    expect(row.brandKey).toBe('acme')
    expect(row.displayBrand === 'Acme' || row.displayBrand === 'ACME').toBe(true) // a real raw label, not the key
    expect(row.productCount).toBe(2)
    expect(row.storesCarrying).toEqual(['store-a', 'store-b']) // union of stores, sorted
    expect(row.tiers).toEqual([1, 3.5]) // union of tiers, sorted ascending
    expect(report.totalBrands).toBe(1)
    expect(report.multiStoreBrandCount).toBe(1)
  })

  it('cheapest: a (matchKey, weight) cell at 2 stores emits one winner with correct lowPrice/cheapestStores', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-a', options: [{ weightGrams: 3.5, price: 30 }] }),
      prod({ dispensaryId: 'store-b', options: [{ weightGrams: 3.5, price: 25 }] }),
    ])
    const cells = report.brands[0].cheapestCells
    expect(cells).toHaveLength(1)
    expect(cells[0]).toMatchObject({
      weightGrams: 3.5,
      lowPrice: 25,
      cheapestStores: ['store-b'],
      storesCarrying: 2,
    })
    expect(cells[0].displayName).toBe('Blue Dream') // a real product name, not the match-key
    expect(report.cheapestCellCount).toBe(1)
  })

  it('cheapest: a price tie surfaces BOTH stores in cheapestStores (sorted)', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-b', options: [{ weightGrams: 3.5, price: 20 }] }),
      prod({ dispensaryId: 'store-a', options: [{ weightGrams: 3.5, price: 20 }] }),
    ])
    const cells = report.brands[0].cheapestCells
    expect(cells).toHaveLength(1)
    expect(cells[0].lowPrice).toBe(20)
    expect(cells[0].cheapestStores).toEqual(['store-a', 'store-b'])
    expect(cells[0].storesCarrying).toBe(2)
  })

  it('cheapest: a single-store cell emits NO cell (but availability still records the store)', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-a', options: [{ weightGrams: 3.5, price: 30 }] }),
    ])
    expect(report.brands[0].storesCarrying).toEqual(['store-a'])
    expect(report.brands[0].cheapestCells).toEqual([])
    expect(report.cheapestCellCount).toBe(0)
    expect(report.multiStoreBrandCount).toBe(0)
  })

  it('cheapest: a different-weight offer of the same product does NOT merge into the cell', () => {
    // Same product+brand across 2 stores, but different weights → two separate cells, each
    // single-store → no winner. Weight is part of the cell key (Gate 1 same-weight).
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-a', options: [{ weightGrams: 3.5, price: 30 }] }),
      prod({ dispensaryId: 'store-b', options: [{ weightGrams: 1, price: 12 }] }),
    ])
    expect(report.brands[0].cheapestCells).toEqual([])
    expect(report.brands[0].tiers).toEqual([1, 3.5]) // both still show as availability tiers
  })

  it('Gate 1 / honesty: a null-matchKey product is counted in unmatchedProductCount and absent from every cell, yet its store/tier still appear in availability', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-a', matchKey: null, options: [{ weightGrams: 3.5, price: 8 }] }),
      prod({ dispensaryId: 'store-b', options: [{ weightGrams: 3.5, price: 25 }] }),
    ])
    const row = report.brands[0]
    expect(report.unmatchedProductCount).toBe(1)
    // Availability includes the unmatched product's store — it IS stocked there.
    expect(row.storesCarrying).toEqual(['store-a', 'store-b'])
    expect(row.tiers).toEqual([3.5])
    // But the unmatched $8 offer never enters a cell — store-b's 3.5g cell is single-store → no winner.
    expect(row.cheapestCells).toEqual([])
    expect(report.cheapestCellCount).toBe(0)
  })

  it('two DISTINCT products of one brand each land in their own cell; both can win independently', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-a', matchKey: 'acme|bd', name: 'Blue Dream', options: [{ weightGrams: 3.5, price: 30 }] }),
      prod({ dispensaryId: 'store-b', matchKey: 'acme|bd', name: 'Blue Dream', options: [{ weightGrams: 3.5, price: 28 }] }),
      prod({ dispensaryId: 'store-a', matchKey: 'acme|gg4', name: 'GG4', options: [{ weightGrams: 3.5, price: 35 }] }),
      prod({ dispensaryId: 'store-b', matchKey: 'acme|gg4', name: 'GG4', options: [{ weightGrams: 3.5, price: 40 }] }),
    ])
    const cells = report.brands[0].cheapestCells
    expect(cells).toHaveLength(2)
    const bd = cells.find((c) => c.matchKey === 'acme|bd')!
    const gg4 = cells.find((c) => c.matchKey === 'acme|gg4')!
    expect(bd).toMatchObject({ lowPrice: 28, cheapestStores: ['store-b'], displayName: 'Blue Dream' })
    expect(gg4).toMatchObject({ lowPrice: 35, cheapestStores: ['store-a'], displayName: 'GG4' })
    // sorted by weight then matchKey → bd before gg4
    expect(cells.map((c) => c.matchKey)).toEqual(['acme|bd', 'acme|gg4'])
  })

  it('accounting: null/whitespace-brand products are excluded and counted in nullBrandProductCount', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-a', brand: null }),
      prod({ dispensaryId: 'store-b', brand: '   ' }),
      prod({ dispensaryId: 'store-c', brand: '---' }), // punctuation-only → null key
      prod({ dispensaryId: 'store-d', brand: 'Acme' }),
    ])
    expect(report.nullBrandProductCount).toBe(3)
    expect(report.brands).toHaveLength(1)
    expect(report.brands[0].brandKey).toBe('acme')
    expect(report.totalBrands).toBe(1)
  })

  it('empty input → fully-zeroed report', () => {
    const report = buildBrandStoreMatrix([])
    expect(report).toEqual({
      brands: [],
      totalBrands: 0,
      multiStoreBrandCount: 0,
      cheapestCellCount: 0,
      nullBrandProductCount: 0,
      unmatchedProductCount: 0,
    })
  })

  it('an Edible-style product (no parseable weight → options: []) yields a store in availability but no tier/cell', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 'store-a', brand: 'Wyld', matchKey: 'wyld|gummies', name: 'Raspberry Gummies', options: [] }),
    ])
    const row = report.brands[0]
    expect(row.brandKey).toBe('wyld')
    expect(row.storesCarrying).toEqual(['store-a']) // it IS stocked
    expect(row.tiers).toEqual([]) // but no weight-based claim is possible
    expect(row.cheapestCells).toEqual([])
  })

  it('brands are sorted by brandKey ascending', () => {
    const report = buildBrandStoreMatrix([
      prod({ dispensaryId: 's1', brand: 'Zebra', matchKey: null }),
      prod({ dispensaryId: 's2', brand: 'Acme', matchKey: null }),
      prod({ dispensaryId: 's3', brand: 'Mango', matchKey: null }),
    ])
    expect(report.brands.map((b) => b.brandKey)).toEqual(['acme', 'mango', 'zebra'])
  })

  // Decision F (NFR6): the rate/potency breach must not compile. The narrowed input type exposes
  // ONLY a single reduced `price` per option and no potency — so a discount rate (needs the
  // basePrice/specialPrice pair) and any potency read literally do not typecheck.
  it('decision F: basePrice/specialPrice/potency are unreachable on the narrowed input type', () => {
    const option: BrandStoreOption = { weightGrams: 3.5, price: 25 }
    // @ts-expect-error basePrice is not a field on BrandStoreOption (the price PAIR is hidden — Gate 2)
    void option.basePrice
    // @ts-expect-error specialPrice is not a field on BrandStoreOption (the price PAIR is hidden — Gate 2)
    void option.specialPrice

    const product: BrandStoreProduct = { brand: 'Acme', dispensaryId: 's', matchKey: null, name: 'x', options: [] }
    // @ts-expect-error thc is not a field on BrandStoreProduct (potency hidden — Gate 5)
    void product.thc
    // @ts-expect-error totalTerpenes is not a field on BrandStoreProduct (potency hidden — Gate 5)
    void product.totalTerpenes
    expect(option.price).toBe(25)
  })
})
