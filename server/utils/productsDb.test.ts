import { describe, it, expect } from 'vitest'
import {
  openProductsDb,
  importProductsFile,
  appendObservations,
  readProductsFile,
  countRecords,
  countObservations,
} from './productsDb.js'
import { buildMatchReport } from './crossStoreValue.js'
import type { ProductRecord, ProductsFile, ProductObservation } from '../types/index.js'

// ADR-077 Phase 1 substrate tests. The load-bearing claim is that the DB round-trip is
// byte-faithful to the derivation functions' INPUT, so buildMatchReport produces an
// IDENTICAL report whether fed the in-memory ProductsFile or the DB reconstruction. That
// equivalence is what lets the pure functions stay untouched (AC3) and is the AC8 parity gate.

function obs(
  observedAt: string,
  option: string,
  basePrice: number,
  extra: Partial<ProductObservation['options'][number]> = {},
): ProductObservation {
  return {
    observedAt,
    special: extra.specialPrice != null,
    options: [
      {
        option,
        weightGrams: null,
        basePrice,
        specialPrice: null,
        pricePerGram: null,
        pricePerItem: null,
        specialPricePerGram: null,
        specialPricePerItem: null,
        quantityAvailable: null,
        ...extra,
      },
    ],
  }
}

function rec(over: Partial<ProductRecord> & Pick<ProductRecord, 'productId' | 'dispensaryId'>): ProductRecord {
  return {
    name: 'Blue Dream',
    category: 'Flower',
    brand: 'Acme',
    strainType: 'hybrid',
    packCount: null,
    flags: [],
    history: [obs('2026-07-01T00:00:00.000Z', '3.5g', 40)],
    ...over,
  }
}

// A fixture exercising a real disparity (two stores, same 3.5g Flower), an excluded-flag
// record (gate 1), a non-weight category (gate 5), multi-observation history + potency
// (optional JSON round-trip), and fix6 special pricing.
function fixture(): ProductsFile {
  const products: Record<string, ProductRecord> = {}
  const add = (r: ProductRecord) => {
    products[`${r.dispensaryId}::${r.productId}`] = r
  }
  // disparity pair @ 3.5g
  add(rec({ productId: 'bd', dispensaryId: 'store-a', history: [obs('2026-07-01T00:00:00.000Z', '3.5g', 40)] }))
  add(
    rec({
      productId: 'bd',
      dispensaryId: 'store-b',
      // multi-observation history: latest (specialPrice 30) is the one the matcher uses
      thc: { unit: '%', low: 20, high: 24 },
      effects: { relaxed: 3, happy: 2 },
      subcategory: null,
      history: [
        obs('2026-07-01T00:00:00.000Z', '3.5g', 50),
        obs('2026-07-02T00:00:00.000Z', '3.5g', 50, { specialPrice: 30 }),
      ],
    }),
  )
  // excluded flag (gate 1)
  add(rec({ productId: 'flagged', dispensaryId: 'store-a', name: 'Sour D', flags: ['weight-mismatch'] }))
  // non-weight category (gate 5)
  add(rec({ productId: 'gummy', dispensaryId: 'store-a', name: 'Gummies', category: 'Edible' }))
  return { lastUpdated: '2026-07-02T00:00:00.000Z', products }
}

describe('productsDb — import + reconstruction fidelity (ADR-077 AC1/AC2/AC3)', () => {
  it('imports the exact record + observation counts, and is re-runnable (idempotent)', () => {
    const file = fixture()
    const db = openProductsDb(':memory:')

    const c1 = importProductsFile(db, file)
    expect(c1.records).toBe(Object.keys(file.products).length)
    const srcObs = Object.values(file.products).reduce((n, r) => n + r.history.length, 0)
    expect(c1.observations).toBe(srcObs)
    expect(countRecords(db)).toBe(c1.records)
    expect(countObservations(db)).toBe(c1.observations)

    // re-import (drop-and-recreate) yields identical counts — no accumulation
    const c2 = importProductsFile(db, file)
    expect(c2).toEqual(c1)
    expect(countObservations(db)).toBe(srcObs)
  })

  it('reconstructs a ProductsFile that produces a byte-identical MatchReport (parity seam)', () => {
    const file = fixture()
    const db = openProductsDb(':memory:')
    importProductsFile(db, file)

    const fromJson = buildMatchReport(file)
    const fromDb = buildMatchReport(readProductsFile(db))

    expect(fromDb).toEqual(fromJson)
    // the fixture must actually exercise a disparity, else the parity claim is vacuous
    expect(fromJson.disparities.length).toBeGreaterThanOrEqual(1)
    expect(fromJson.excludedFlagCount).toBe(1)
    expect(fromJson.nonComparableCategoryCount).toBe(1)
  })

  it('preserves history order so history.at(-1) is the true latest (fix6 special picked)', () => {
    const file = fixture()
    const db = openProductsDb(':memory:')
    importProductsFile(db, file)
    const reread = readProductsFile(db)
    const storeB = reread.products['store-b::bd']
    expect(storeB.history).toHaveLength(2)
    expect(storeB.history.at(-1)!.observedAt).toBe('2026-07-02T00:00:00.000Z')
    expect(storeB.history.at(-1)!.options[0].specialPrice).toBe(30)
    // the disparity low price is store-b's special (30), not its base (50)
    const d = buildMatchReport(reread).disparities[0]
    expect(d.lowPrice).toBe(30)
    expect(d.highPrice).toBe(40)
  })

  it('round-trips optional potency/effects JSON fields', () => {
    const file = fixture()
    const db = openProductsDb(':memory:')
    importProductsFile(db, file)
    const storeB = readProductsFile(db).products['store-b::bd']
    expect(storeB.thc).toEqual({ unit: '%', low: 20, high: 24 })
    expect(storeB.effects).toEqual({ relaxed: 3, happy: 2 })
  })
})

describe('productsDb — append-only feed path (ADR-077 AC7)', () => {
  it('appends a new observation and refreshes identity for an existing product', () => {
    const db = openProductsDb(':memory:')
    importProductsFile(db, fixture())
    const before = countObservations(db)

    const incoming: ProductRecord[] = [
      rec({
        productId: 'bd',
        dispensaryId: 'store-a',
        name: 'Blue Dream (renamed)',
        history: [obs('2026-07-03T00:00:00.000Z', '3.5g', 38)],
      }),
    ]
    const res = appendObservations(db, incoming, '2026-07-03T00:00:00.000Z')
    expect(res.observationsAppended).toBe(1)
    expect(countObservations(db)).toBe(before + 1)

    const reread = readProductsFile(db)
    const p = reread.products['store-a::bd']
    expect(p.name).toBe('Blue Dream (renamed)') // identity refreshed
    expect(p.history.at(-1)!.observedAt).toBe('2026-07-03T00:00:00.000Z') // appended latest
  })

  it('is idempotent — re-appending the same (product, observedAt) is a no-op', () => {
    const db = openProductsDb(':memory:')
    importProductsFile(db, fixture())
    const incoming: ProductRecord[] = [
      rec({ productId: 'bd', dispensaryId: 'store-a', history: [obs('2026-07-05T00:00:00.000Z', '3.5g', 41)] }),
    ]
    appendObservations(db, incoming, '2026-07-05T00:00:00.000Z')
    const mid = countObservations(db)
    const again = appendObservations(db, incoming, '2026-07-05T00:00:00.000Z')
    expect(again.observationsAppended).toBe(0)
    expect(countObservations(db)).toBe(mid)
  })

  it('adds a wholly new product on append', () => {
    const db = openProductsDb(':memory:')
    importProductsFile(db, fixture())
    const beforeRecs = countRecords(db)
    appendObservations(
      db,
      [rec({ productId: 'new', dispensaryId: 'store-c', name: 'Gelato', history: [obs('2026-07-04T00:00:00.000Z', '3.5g', 45)] })],
      '2026-07-04T00:00:00.000Z',
    )
    expect(countRecords(db)).toBe(beforeRecs + 1)
    expect(readProductsFile(db).products['store-c::new'].name).toBe('Gelato')
  })
})
