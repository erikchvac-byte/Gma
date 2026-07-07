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
})
