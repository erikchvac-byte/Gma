import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runProductScrape } from './scrapeProductsRun.js'
import { readProducts } from '../utils/productsStore.js'
import type { RawProduct } from '../types/index.js'

function raw(over: Partial<RawProduct> = {}): RawProduct {
  return {
    productId: 'p1',
    name: 'House Sativa - PR 2pk',
    category: 'Pre-Rolls',
    brand: 'House',
    strainType: 'Sativa',
    special: true,
    weightField: 1000,
    netWeightMg: 2000,
    thc: null,
    cbd: null,
    totalTerpenes: null,
    effects: null,
    subcategory: null,
    options: [{ option: '2g', basePrice: 8, specialPrice: 4, quantityAvailable: 25 }],
    ...over,
  }
}

describe('runProductScrape (commit-back scrape, CAP-4/CAP-6)', () => {
  let dir: string
  let productsPath: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'prun-'))
    productsPath = path.join(dir, 'products.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('scrapes, normalizes, and appends one observation per product', async () => {
    const registry = { 'store-a': async () => [raw()] }
    const out = await runProductScrape({
      stores: ['store-a'],
      registry,
      productsPath,
      now: 'T1',
    })
    expect(out.ok).toBe(true)
    expect(out.results).toEqual({ 'store-a': 1 })
    expect(out.recordsWritten).toBe(1)

    const file = readProducts(productsPath)
    const p = file.products['store-a::p1']
    expect(p).toBeDefined()
    expect(p.packCount).toBe(2)
    expect(p.history[0].options[0].pricePerItem).toBe(4) // 8 / 2 joints — normalized
  })

  it('APPENDS across two runs (history grows, CAP-6)', async () => {
    const registry1 = { 'store-a': async () => [raw({ options: [{ option: '2g', basePrice: 8, specialPrice: 4, quantityAvailable: 25 }] })] }
    const registry2 = { 'store-a': async () => [raw({ options: [{ option: '2g', basePrice: 6, specialPrice: 3, quantityAvailable: 25 }] })] }
    await runProductScrape({ stores: ['store-a'], registry: registry1, productsPath, now: 'T1' })
    await runProductScrape({ stores: ['store-a'], registry: registry2, productsPath, now: 'T2' })
    const p = readProducts(productsPath).products['store-a::p1']
    expect(p.history.map((h) => h.options[0].basePrice)).toEqual([8, 6])
  })

  it('keeps other stores soft when one scraper throws', async () => {
    const registry = {
      good: async () => [raw()],
      bad: async () => {
        throw new Error('boom')
      },
    }
    const out = await runProductScrape({ stores: ['good', 'bad'], registry, productsPath, now: 'T1' })
    expect(out.ok).toBe(false)
    expect(out.results.good).toBe(1)
    expect(out.results.bad).toBe('error')
    expect(readProducts(productsPath).products['good::p1']).toBeDefined()
  })

  it('an empty menu is soft (0), not an error', async () => {
    const registry = { 'store-a': async () => [] }
    const out = await runProductScrape({ stores: ['store-a'], registry, productsPath, now: 'T1' })
    expect(out.ok).toBe(true)
    expect(out.results).toEqual({ 'store-a': 0 })
    expect(out.recordsWritten).toBe(0)
  })

  it('flags a missing scraper as error', async () => {
    const out = await runProductScrape({ stores: ['nope'], registry: {}, productsPath, now: 'T1' })
    expect(out.ok).toBe(false)
    expect(out.results.nope).toBe('error')
  })
})
