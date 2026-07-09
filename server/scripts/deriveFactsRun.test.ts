import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deriveFacts } from './deriveFactsRun.js'
import { openProductsDb, importProductsFile } from '../utils/productsDb.js'
import type { ProductRecord, ProductsFile } from '../types/index.js'

function rec(over: Partial<ProductRecord> & Pick<ProductRecord, 'productId' | 'dispensaryId'>): ProductRecord {
  return {
    name: 'Blue Dream',
    category: 'Flower',
    brand: 'Acme',
    strainType: 'hybrid',
    packCount: null,
    flags: [],
    history: [
      {
        observedAt: '2026-07-01T00:00:00.000Z',
        special: false,
        options: [
          {
            option: '3.5g',
            weightGrams: null,
            basePrice: 40,
            specialPrice: null,
            pricePerGram: null,
            pricePerItem: null,
            specialPricePerGram: null,
            specialPricePerItem: null,
            quantityAvailable: null,
          },
        ],
      },
    ],
    ...over,
  }
}

function populatedFile(): ProductsFile {
  return {
    lastUpdated: '2026-07-01T00:00:00.000Z',
    products: {
      'store-a::bd': rec({ productId: 'bd', dispensaryId: 'store-a' }),
      'store-b::bd': rec({ productId: 'bd', dispensaryId: 'store-b' }),
    },
  }
}

describe('deriveFacts (ADR-077 Phase 1 regression guard)', () => {
  let dir: string
  let dbPath: string
  let derivedDir: string
  let dataPath: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'derive-'))
    dbPath = path.join(dir, 'products.db')
    derivedDir = path.join(dir, 'derived')
    dataPath = path.join(dir, 'data.json')
    writeFileSync(dataPath, JSON.stringify({ dispensaries: [] }), 'utf-8')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writes derived facts from a populated DB, envelope-shaped (derivation-1.1)', () => {
    const db = openProductsDb(dbPath)
    importProductsFile(db, populatedFile())
    db.close()

    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    expect(outcome.totalRecords).toBe(2)

    const written = JSON.parse(readFileSync(outcome.disparitiesPath, 'utf-8'))
    expect(written.data.totalRecords).toBe(2)
    expect(Array.isArray(written.excluded)).toBe(true)
    expect(typeof written.coverage).toBe('object')
    expect(typeof written.generatedAt).toBe('string')

    const dealScopeWritten = JSON.parse(readFileSync(outcome.dealScopePath, 'utf-8'))
    expect(typeof dealScopeWritten.data.totalDeals).toBe('number')
    expect(Array.isArray(dealScopeWritten.excluded)).toBe(true)
    expect(typeof dealScopeWritten.coverage).toBe('object')
    expect(typeof dealScopeWritten.generatedAt).toBe('string')

    const extractionHealthWritten = JSON.parse(readFileSync(outcome.extractionHealthPath, 'utf-8'))
    expect(Array.isArray(extractionHealthWritten.data.entries)).toBe(true)
    expect(typeof extractionHealthWritten.data.totalStores).toBe('number')
    expect(Array.isArray(extractionHealthWritten.excluded)).toBe(true)
    expect(typeof extractionHealthWritten.coverage).toBe('object')
    expect(typeof extractionHealthWritten.generatedAt).toBe('string')
    // store-a/store-b (this fixture's dispensaryIds) aren't in the real product-scraper
    // roster, so every entry in the real roster is a zero-history store here — proving a
    // roster store absent from productsFile.products degrades to insufficient-history, not a
    // throw (derivation-1.2.5 AC1/AC5).
    expect(extractionHealthWritten.data.entries.length).toBeGreaterThan(0)
    expect(extractionHealthWritten.data.entries.every((e: { status: string }) => e.status === 'insufficient-history')).toBe(true)
  })

  it('refuses to overwrite a previously-populated disparities.json with a zero-record result', () => {
    const db = openProductsDb(dbPath)
    importProductsFile(db, populatedFile())
    db.close()
    deriveFacts({ dbPath, dataPath, derivedDir }) // seeds a real, populated disparities.json (envelope-shaped)

    // Simulate a misconfigured/wrong PRODUCTS_DB_PATH: a fresh, empty DB at a different path.
    const emptyDbPath = path.join(dir, 'empty.db')
    openProductsDb(emptyDbPath).close()

    expect(() => deriveFacts({ dbPath: emptyDbPath, dataPath, derivedDir })).toThrow(/refusing to write/)

    // The previously-written (good) envelope must be untouched — the guard must correctly read
    // `.data.totalRecords` off the new envelope shape, not the old flat shape.
    const stillGood = JSON.parse(readFileSync(path.join(derivedDir, 'disparities.json'), 'utf-8'))
    expect(stillGood.data.totalRecords).toBe(2)
  })

  it('a genuinely empty DB with no prior derived file is not blocked (first-ever run)', () => {
    openProductsDb(dbPath).close()
    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    expect(outcome.totalRecords).toBe(0)
  })

  it('extraction-health reaches ok/suspected-extraction-failure through the real wiring (derivation-1.2.5)', () => {
    // 'kush21-everett-evergreen' is a real id in the product-scraper roster (dutchie-stores.ts) —
    // using it here (rather than a fixture-only id) proves the runner's roster + `today`
    // computation reach a real non-insufficient-history verdict, not just the pure function in
    // isolation (extractionHealth.test.ts already covers that).
    const today = new Date().toISOString().slice(0, 10)
    const dayMs = 24 * 60 * 60 * 1000
    const dayStr = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10)

    const products: Record<string, ProductRecord> = {}
    // 14 trailing days at 20 distinct products/day (baseline).
    for (let p = 0; p < 20; p++) {
      const history = []
      for (let i = 14; i >= 1; i--) {
        history.push({ observedAt: `${dayStr(-i)}T12:00:00.000Z`, special: false, options: [] })
      }
      products[`kush21-everett-evergreen::p${p}`] = rec({
        productId: `p${p}`,
        dispensaryId: 'kush21-everett-evergreen',
        history,
      })
    }
    // Today: only 5 of those 20 products observed (75% drop — well past the 50% threshold).
    for (let p = 0; p < 5; p++) {
      products[`kush21-everett-evergreen::p${p}`].history.push({
        observedAt: `${today}T12:00:00.000Z`,
        special: false,
        options: [],
      })
    }

    const db = openProductsDb(dbPath)
    importProductsFile(db, { lastUpdated: today, products })
    db.close()

    const outcome = deriveFacts({ dbPath, dataPath, derivedDir })
    expect(outcome.suspectedCount).toBeGreaterThanOrEqual(1)

    const written = JSON.parse(readFileSync(outcome.extractionHealthPath, 'utf-8'))
    const entry = written.data.entries.find((e: { dispensaryId: string }) => e.dispensaryId === 'kush21-everett-evergreen')
    expect(entry).toMatchObject({ status: 'suspected-extraction-failure', todayCount: 5, trailingMedian: 20 })
  })
})
