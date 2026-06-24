import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  applyProductObservations,
  getProduct,
  persistProductObservations,
  readProducts,
} from './productsStore.js'
import type { ProductRecord, ProductsFile } from '../types/index.js'

// One record carrying a single observation, parameterized by base price + time.
function record(over: { productId?: string; basePrice?: number; at?: string } = {}): ProductRecord {
  const { productId = 'p1', basePrice = 8, at = '2026-06-24T00:00:00.000Z' } = over
  return {
    productId,
    dispensaryId: 'kushmart-north',
    name: 'PR 2pk',
    category: 'Pre-Rolls',
    brand: "mama J's",
    strainType: 'Indica',
    packCount: 2,
    flags: [],
    history: [
      {
        observedAt: at,
        special: false,
        options: [
          {
            option: '2g',
            weightGrams: 2,
            basePrice,
            specialPrice: null,
            pricePerGram: basePrice / 2,
            pricePerItem: basePrice / 2,
            specialPricePerGram: null,
            specialPricePerItem: null,
            quantityAvailable: 25,
          },
        ],
      },
    ],
  }
}

describe('applyProductObservations (append-only history, CAP-6)', () => {
  const empty: ProductsFile = { lastUpdated: '', products: {} }

  it('adds a new product on first observation', () => {
    const merged = applyProductObservations(empty, [record()], 'T1')
    expect(merged.lastUpdated).toBe('T1')
    const p = getProduct(merged, 'kushmart-north', 'p1')!
    expect(p.history).toHaveLength(1)
  })

  it('APPENDS subsequent observations rather than overwriting the latest', () => {
    const first = applyProductObservations(empty, [record({ basePrice: 8, at: 'T1' })], 'T1')
    const second = applyProductObservations(first, [record({ basePrice: 6, at: 'T2' })], 'T2')
    const p = getProduct(second, 'kushmart-north', 'p1')!
    expect(p.history).toHaveLength(2) // ≥2 scrape times
    expect(p.history.map((h) => h.options[0].basePrice)).toEqual([8, 6])
  })

  it('makes a price change between two scrapes detectable from stored data', () => {
    const first = applyProductObservations(empty, [record({ basePrice: 8, at: 'T1' })], 'T1')
    const second = applyProductObservations(first, [record({ basePrice: 6, at: 'T2' })], 'T2')
    const hist = getProduct(second, 'kushmart-north', 'p1')!.history
    const prices = hist.map((h) => h.options[0].basePrice)
    expect(prices[0]).not.toBe(prices[1]) // a drop from $8 → $6 is recorded, not lost
    expect(hist[0].observedAt).toBe('T1')
    expect(hist[1].observedAt).toBe('T2')
  })

  it('records an UNCHANGED price too (max granularity — every scrape appends)', () => {
    const first = applyProductObservations(empty, [record({ basePrice: 8, at: 'T1' })], 'T1')
    const second = applyProductObservations(first, [record({ basePrice: 8, at: 'T2' })], 'T2')
    expect(getProduct(second, 'kushmart-north', 'p1')!.history).toHaveLength(2)
  })

  it('keeps separate history per product', () => {
    const merged = applyProductObservations(empty, [record({ productId: 'a' }), record({ productId: 'b' })], 'T1')
    expect(Object.keys(merged.products)).toHaveLength(2)
  })

  it('does not mutate the input dataset', () => {
    const first = applyProductObservations(empty, [record({ at: 'T1' })], 'T1')
    applyProductObservations(first, [record({ basePrice: 99, at: 'T2' })], 'T2')
    expect(getProduct(first, 'kushmart-north', 'p1')!.history).toHaveLength(1) // unchanged
  })

  it('refreshes descriptive identity to the latest scrape while preserving history', () => {
    const first = applyProductObservations(empty, [record({ at: 'T1' })], 'T1')
    const renamed = { ...record({ basePrice: 6, at: 'T2' }), flags: ['weight-mismatch'] }
    const second = applyProductObservations(first, [renamed], 'T2')
    const p = getProduct(second, 'kushmart-north', 'p1')!
    expect(p.flags).toEqual(['weight-mismatch'])
    expect(p.history).toHaveLength(2)
  })
})

describe('readProducts / persistProductObservations (file I/O, CAP-6)', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'products-'))
    file = path.join(dir, 'products.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns an empty dataset when the file does not exist', () => {
    expect(readProducts(file)).toEqual({ lastUpdated: '', products: {} })
  })

  it('returns an empty dataset on a malformed file (fail-soft)', () => {
    writeFileSync(file, 'not json{')
    expect(readProducts(file)).toEqual({ lastUpdated: '', products: {} })
  })

  it('persists appended observations across two scrape runs (round-trip)', async () => {
    await persistProductObservations([record({ basePrice: 8, at: 'T1' })], 'T1', file)
    await persistProductObservations([record({ basePrice: 6, at: 'T2' })], 'T2', file)
    const onDisk = readProducts(file)
    const p = getProduct(onDisk, 'kushmart-north', 'p1')!
    expect(p.history.map((h) => h.options[0].basePrice)).toEqual([8, 6])
    // written as pretty JSON (atomicWriteJson) so the committed dataset diffs cleanly
    expect(readFileSync(file, 'utf-8')).toContain('\n  ')
  })
})
