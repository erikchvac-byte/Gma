import { describe, it, expect } from 'vitest'
import { buildDisparities, buildMatchReport } from './crossStoreValue.js'
import type { ProductRecord, ProductsFile, ProductOptionObservation } from '../types/index.js'

const AT = '2026-06-24T12:00:00.000Z'

function opt(over: Partial<ProductOptionObservation> = {}): ProductOptionObservation {
  return {
    option: '1g',
    weightGrams: 1,
    basePrice: 10,
    specialPrice: null,
    pricePerGram: 10,
    pricePerItem: null,
    specialPricePerGram: null,
    specialPricePerItem: null,
    quantityAvailable: 5,
    ...over,
  }
}

function rec(over: Partial<ProductRecord> = {}, options: ProductOptionObservation[] = [opt()]): ProductRecord {
  return {
    productId: over.productId ?? 'p1',
    dispensaryId: over.dispensaryId ?? 'store-a',
    name: 'Libre Cannabis Flower GG4',
    category: 'Flower',
    brand: 'Libre Cannabis',
    strainType: 'Hybrid',
    packCount: null,
    flags: [],
    history: [{ observedAt: AT, special: false, options }],
    ...over,
  }
}

function file(...records: ProductRecord[]): ProductsFile {
  const products: ProductsFile['products'] = {}
  for (const r of records) products[`${r.dispensaryId}::${r.productId}`] = r
  return { lastUpdated: AT, products }
}

describe('buildDisparities — match + math', () => {
  it('emits a disparity for the same product at two stores with correct spread', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ basePrice: 10 })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ basePrice: 15 })]),
    )
    const ds = buildDisparities(f)
    expect(ds).toHaveLength(1)
    expect(ds[0].lowPrice).toBe(10)
    expect(ds[0].highPrice).toBe(15)
    expect(ds[0].spread).toBe(5)
    expect(ds[0].spreadPct).toBe(0.5)
    expect(ds[0].weightGrams).toBe(1)
    expect(ds[0].storesCarrying.map((s) => s.dispensaryId).sort()).toEqual(['store-a', 'store-b'])
  })

  it('uses specialPrice over basePrice (the real price paid)', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ basePrice: 10, specialPrice: 7 })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ basePrice: 12, specialPrice: 9 })]),
    )
    const ds = buildDisparities(f)
    expect(ds[0].lowPrice).toBe(7)
    expect(ds[0].highPrice).toBe(9)
  })

  it('does NOT emit when only one store carries the product', () => {
    const f = file(rec({ dispensaryId: 'store-a', productId: 'a' }))
    expect(buildDisparities(f)).toHaveLength(0)
  })

  it('requires TWO DISTINCT stores (two listings at one store is not a disparity)', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ basePrice: 10 })]),
      rec({ dispensaryId: 'store-a', productId: 'a2' }, [opt({ basePrice: 20 })]),
    )
    expect(buildDisparities(f)).toHaveLength(0)
  })

  it('takes the lowest offer per store when a store lists the product twice', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ basePrice: 12 })]),
      rec({ dispensaryId: 'store-a', productId: 'a2' }, [opt({ basePrice: 9 })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ basePrice: 15 })]),
    )
    const ds = buildDisparities(f)
    expect(ds).toHaveLength(1)
    expect(ds[0].lowPrice).toBe(9) // store-a's cheaper listing wins
  })
})

describe('buildDisparities — honesty gates', () => {
  it('EXCLUDES records carrying weight-mismatch from output (AC3/AC5)', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a', flags: ['weight-mismatch'] }, [opt({ basePrice: 10 })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ basePrice: 15 })]),
    )
    // store-a is excluded → only store-b remains → no ≥2-store disparity
    expect(buildDisparities(f)).toHaveLength(0)
  })

  it('compares like-for-like only: different weights never form one disparity (AC4)', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ option: '1g', basePrice: 10 }), opt({ option: '3.5g', basePrice: 30 })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ option: '1g', basePrice: 12 }), opt({ option: '3.5g', basePrice: 28 })]),
    )
    const ds = buildDisparities(f)
    // two separate rows: one for 1g, one for 3.5g — never 1g-vs-3.5g
    expect(ds).toHaveLength(2)
    const byWeight = Object.fromEntries(ds.map((d) => [d.weightGrams, d]))
    expect(byWeight[1].lowPrice).toBe(10)
    expect(byWeight[1].highPrice).toBe(12)
    expect(byWeight[3.5].lowPrice).toBe(28)
    expect(byWeight[3.5].highPrice).toBe(30)
  })

  it('unifies an eighth across label formats: 1/8oz at one store, 3.5g at another', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ option: '1/8oz', basePrice: 35 })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ option: '3.5g', basePrice: 30 })]),
    )
    const ds = buildDisparities(f)
    expect(ds).toHaveLength(1)
    expect(ds[0].weightGrams).toBe(3.5)
    expect(ds[0].lowPrice).toBe(30)
  })

  it('skips options with no usable price (both base and special null)', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ basePrice: null, specialPrice: null })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ basePrice: 15 })]),
    )
    expect(buildDisparities(f)).toHaveLength(0)
  })

  it('excludes a sold-out offer (quantityAvailable 0) so it cannot set a phantom low', () => {
    const f = file(
      // store-a's $10 is sold out → must not become the headline lowPrice
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ basePrice: 10, quantityAvailable: 0 })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ basePrice: 15, quantityAvailable: 4 })]),
    )
    // only store-b's buyable offer survives → no ≥2-store disparity
    expect(buildDisparities(f)).toHaveLength(0)
  })

  it('uses the cheapest IN-STOCK offer for the low price, ignoring sold-out listings', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ basePrice: 8, quantityAvailable: 0 })]), // sold out
      rec({ dispensaryId: 'store-a', productId: 'a2' }, [opt({ basePrice: 11, quantityAvailable: 3 })]), // buyable
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ basePrice: 15, quantityAvailable: 2 })]),
    )
    const ds = buildDisparities(f)
    expect(ds).toHaveLength(1)
    expect(ds[0].lowPrice).toBe(11) // $8 sold-out listing is ignored, not the low
  })

  it('keeps an offer with UNKNOWN stock (quantityAvailable null) — only reported zero is dropped', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a' }, [opt({ basePrice: 10, quantityAvailable: null })]),
      rec({ dispensaryId: 'store-b', productId: 'b' }, [opt({ basePrice: 15, quantityAvailable: null })]),
    )
    const ds = buildDisparities(f)
    expect(ds).toHaveLength(1)
    expect(ds[0].lowPrice).toBe(10)
  })
})

describe('buildMatchReport — counts (AC5)', () => {
  it('counts unmatched and excluded-flag records, never hides them', () => {
    const f = file(
      rec({ dispensaryId: 'store-a', productId: 'a', brand: null, name: '3.5g' }), // unmatched
      rec({ dispensaryId: 'store-b', productId: 'b', flags: ['weight-mismatch'] }), // excluded
      rec({ dispensaryId: 'store-c', productId: 'c' }), // matched, placed
    )
    const report = buildMatchReport(f)
    expect(report.totalRecords).toBe(3)
    expect(report.unmatchedCount).toBe(1)
    expect(report.excludedFlagCount).toBe(1)
    expect(report.nonComparableCategoryCount).toBe(0)
  })
})

describe('buildMatchReport — non-weight-based categories (spec-category-expansion)', () => {
  // An edible's option label states mg-THC, not product weight — normalizeProduct
  // leaves weightGrams null, and the matcher must not re-parse "100mg" into a
  // phantom 0.1g weight bucket.
  const edibleOpt = opt({ option: '100mg', weightGrams: null, basePrice: 25, pricePerGram: null })
  const edible = (dispensaryId: string, productId: string) =>
    rec({ dispensaryId, productId, category: 'Edible', name: 'Wyld Raspberry Gummies', brand: 'Wyld' }, [edibleOpt])

  it('emits NO disparity for the same edible at two stores; counts both records', () => {
    const f = file(edible('store-a', 'a'), edible('store-b', 'b'))
    const report = buildMatchReport(f)
    expect(report.disparities).toHaveLength(0)
    expect(report.nonComparableCategoryCount).toBe(2)
  })

  it('a FLAGGED edible counts as non-comparable, not excluded-flag (gate 5 before gate 1)', () => {
    // Gate order is a scope statement: the record's category disqualifies it before
    // its data quality is ever judged. A future reordering must not double-count.
    const flagged = rec(
      { dispensaryId: 'store-a', productId: 'a', category: 'Edible', flags: ['weight-mismatch'] },
      [edibleOpt],
    )
    const report = buildMatchReport(file(flagged))
    expect(report.nonComparableCategoryCount).toBe(1)
    expect(report.excludedFlagCount).toBe(0)
    expect(report.totalRecords).toBe(1)
  })

  it('a Concentrate IS weight-compared like any weight-based category', () => {
    const conc = (dispensaryId: string, productId: string, basePrice: number) =>
      rec(
        { dispensaryId, productId, category: 'Concentrate', name: 'GG4 Live Resin', brand: 'Oleum' },
        [opt({ option: '1g', basePrice })],
      )
    const ds = buildDisparities(file(conc('store-a', 'a', 30), conc('store-b', 'b', 24)))
    expect(ds).toHaveLength(1)
    expect(ds[0].category).toBe('Concentrate')
    expect(ds[0].lowPrice).toBe(24)
    expect(ds[0].weightGrams).toBe(1)
  })
})
