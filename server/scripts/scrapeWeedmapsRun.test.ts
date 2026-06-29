import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runWeedmapsScrape } from './scrapeWeedmapsRun.js'
import { readProducts } from '../utils/productsStore.js'
import type { RawProduct } from '../types/index.js'

// A Weedmaps-shaped RawProduct (null per-tier stock, no weightField — the matcher keeps these).
function raw(over: Partial<RawProduct> = {}): RawProduct {
  return {
    productId: 'phat-panda-flower-golden-pineapple',
    name: 'Golden Pineapple',
    category: 'Flower',
    brand: 'Phat Panda',
    strainType: 'Indica',
    special: false,
    weightField: null,
    netWeightMg: 3500,
    options: [{ option: '1/8 oz', basePrice: 50, specialPrice: null, quantityAvailable: null }],
    ...over,
  }
}

const noWait = async () => {}

describe('runWeedmapsScrape (throttled commit-back, Phase 2)', () => {
  let dir: string
  let productsPath: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'wmrun-'))
    productsPath = path.join(dir, 'products.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('scrapes, normalizes through the SHARED normalizer, and appends one observation', async () => {
    const registry = { 'western-bud-burlington': async () => [raw()] }
    const out = await runWeedmapsScrape({
      stores: ['western-bud-burlington'],
      registry,
      productsPath,
      now: 'T1',
      sleepFn: noWait,
    })
    expect(out.ok).toBe(true)
    expect(out.results).toEqual({ 'western-bud-burlington': 1 })
    const p = readProducts(productsPath).products['western-bud-burlington::phat-panda-flower-golden-pineapple']
    expect(p).toBeDefined()
    // normalizeProduct computed $/gram from the 1/8oz label (3.54g) — proof of reuse
    expect(p.history[0].options[0].pricePerGram).toBeCloseTo(50 / 3.54, 1)
    expect(p.history[0].options[0].quantityAvailable).toBeNull()
  })

  it('throttles BETWEEN stores but not before the first (≥minDelay, jittered)', async () => {
    const delays: number[] = []
    const registry = {
      a: async () => [raw({ productId: 'a1' })],
      b: async () => [raw({ productId: 'b1' })],
      c: async () => [raw({ productId: 'c1' })],
    }
    await runWeedmapsScrape({
      stores: ['a', 'b', 'c'],
      registry,
      productsPath,
      now: 'T1',
      minDelayMs: 2000,
      jitterMs: 1000,
      rng: () => 0.5,
      sleepFn: async (ms) => {
        delays.push(ms)
      },
    })
    expect(delays).toHaveLength(2) // one gap between each of the 3 stores
    expect(delays.every((d) => d >= 2000 && d <= 3000)).toBe(true)
  })

  it('keeps other stores soft when one scraper throws', async () => {
    const registry = {
      good: async () => [raw()],
      bad: async () => {
        throw new Error('challenge page')
      },
    }
    const out = await runWeedmapsScrape({ stores: ['good', 'bad'], registry, productsPath, now: 'T1', sleepFn: noWait })
    expect(out.ok).toBe(false)
    expect(out.results.good).toBe(1)
    expect(out.results.bad).toBe('error')
  })

  it('an empty menu is soft (0), not an error', async () => {
    const registry = { 'store-a': async () => [] }
    const out = await runWeedmapsScrape({ stores: ['store-a'], registry, productsPath, now: 'T1', sleepFn: noWait })
    expect(out.ok).toBe(true)
    expect(out.results).toEqual({ 'store-a': 0 })
    expect(out.recordsWritten).toBe(0)
  })

  it('flags a missing scraper as error', async () => {
    const out = await runWeedmapsScrape({ stores: ['nope'], registry: {}, productsPath, now: 'T1', sleepFn: noWait })
    expect(out.ok).toBe(false)
    expect(out.results.nope).toBe('error')
  })
})
