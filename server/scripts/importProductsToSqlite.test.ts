import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runImport } from './importProductsToSqlite.js'
import { openProductsDb, appendObservations, countObservations } from '../utils/productsDb.js'
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

function sourceFile(): ProductsFile {
  return {
    lastUpdated: '2026-07-01T00:00:00.000Z',
    products: { 'store-a::bd': rec({ productId: 'bd', dispensaryId: 'store-a' }) },
  }
}

describe('runImport --force guard (ADR-077 Phase 1 accrual-safety)', () => {
  let dir: string
  let sourcePath: string
  let dbPath: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'import-'))
    sourcePath = path.join(dir, 'products.json')
    dbPath = path.join(dir, 'products.db')
    writeFileSync(sourcePath, JSON.stringify(sourceFile()), 'utf-8')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('imports normally against a fresh/empty DB, no --force needed', () => {
    const result = runImport(sourcePath, dbPath)
    expect(result.match).toBe(true)
    expect(result.dbRecords).toBe(1)
  })

  it('refuses to re-run against a DB that has since accrued observations, without --force', () => {
    runImport(sourcePath, dbPath)

    // Simulate nightly accrual since the source snapshot was taken.
    const db = openProductsDb(dbPath)
    appendObservations(
      db,
      [rec({ productId: 'new-product', dispensaryId: 'store-c', history: sourceFile().products['store-a::bd'].history })],
      '2026-07-05T00:00:00.000Z',
    )
    const observationsBeforeReimport = countObservations(db)
    db.close()
    expect(observationsBeforeReimport).toBe(2)

    expect(() => runImport(sourcePath, dbPath)).toThrow(/refusing to import/)

    // The accrued observation must still be there — the destructive DROP never ran.
    const dbAfter = openProductsDb(dbPath)
    expect(countObservations(dbAfter)).toBe(observationsBeforeReimport)
    dbAfter.close()
  })

  it('allows the destructive re-import when --force is explicitly passed', () => {
    runImport(sourcePath, dbPath)
    const db = openProductsDb(dbPath)
    appendObservations(
      db,
      [rec({ productId: 'new-product', dispensaryId: 'store-c', history: sourceFile().products['store-a::bd'].history })],
      '2026-07-05T00:00:00.000Z',
    )
    db.close()

    const result = runImport(sourcePath, dbPath, { force: true })
    expect(result.match).toBe(true)
    expect(result.dbRecords).toBe(1) // back to exactly the source snapshot — accrual wiped, as forced
  })
})
