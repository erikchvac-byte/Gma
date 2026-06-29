import { describe, it, expect } from 'vitest'
import { buildDisparities, buildMatchReport } from './crossStoreValue.js'
import { canonicalWeightGrams } from './productMatchKey.js'
import { parseGrams, parsePackCount } from './normalizeProduct.js'
import { readProducts } from './productsStore.js'
import type { ProductsFile } from '../types/index.js'

// Phase 0 verification (AC5). Runs the real matcher over the COMMITTED products.json
// and proves the honesty gates hold on live data — the integrity of this output is the
// product's moat, so it is asserted against reality, not just synthetic fixtures.

const EXCLUDED_FLAGS = new Set(['weight-mismatch', 'unparseable-weight', 'unparseable-pack'])

describe('Phase 0 audit — committed products.json', () => {
  const file = readProducts()
  const report = buildMatchReport(file)

  it('the dataset actually exercises the exclusion gate (flagged records exist)', () => {
    // Guards against a vacuous audit: if the committed data carried no excluded flags
    // the equivalence check below would pass trivially. (427 weight-mismatch as of writing.)
    expect(report.excludedFlagCount).toBeGreaterThan(0)
  })

  it('produces ZERO disparity rows influenced by an excluded-flag record', () => {
    // Excluded-flag records must have NO effect on output. Build disparities once from
    // the full file and once from a file with every excluded record removed; identical
    // output proves no flagged input ever reached a disparity row.
    const cleanProducts = Object.fromEntries(
      Object.entries(file.products).filter(([, r]) => !r.flags.some((f) => EXCLUDED_FLAGS.has(f))),
    )
    const clean: ProductsFile = { ...file, products: cleanProducts }
    expect(buildDisparities(file)).toEqual(buildDisparities(clean))
  })

  it('counts every unplaceable record (nothing hidden)', () => {
    expect(report.totalRecords).toBe(Object.keys(file.products).length)
    expect(report.unmatchedCount).toBeGreaterThanOrEqual(0)
    expect(report.excludedFlagCount).toBeGreaterThanOrEqual(0)
    // Every record is accounted for: excluded, unmatched, placed, or matched-but-unpriced/single-option.
    expect(report.unmatchedCount + report.excludedFlagCount).toBeLessThanOrEqual(report.totalRecords)
  })

  it('every emitted disparity is well-formed and like-for-like', () => {
    for (const d of report.disparities) {
      expect(d.storesCarrying.length).toBeGreaterThanOrEqual(2)
      const ids = d.storesCarrying.map((s) => s.dispensaryId)
      expect(new Set(ids).size).toBe(ids.length) // distinct stores
      expect(d.weightGrams).toBeGreaterThan(0)
      expect(d.lowPrice).toBeGreaterThan(0)
      expect(d.highPrice).toBeGreaterThanOrEqual(d.lowPrice)
      expect(d.spread).toBeCloseTo(d.highPrice - d.lowPrice, 2)
      // every store offer sits within [low, high] at the SAME canonical weight
      for (const s of d.storesCarrying) {
        expect(s.price).toBeGreaterThanOrEqual(d.lowPrice)
        expect(s.price).toBeLessThanOrEqual(d.highPrice)
      }
    }
  })
})

describe('parse contract regression lock (ADR-054 + pack count)', () => {
  it.each([
    ['1/8oz', 3.54],
    ['1/4oz', 7.09],
    ['1/2oz', 14.17],
    ['1oz', 28.35],
    ['3.5g', 3.5],
    ['1g', 1],
  ])('parseGrams(%j) === %j', (label, grams) => {
    expect(parseGrams(label)).toBe(grams)
  })

  it.each([
    ['1/8oz', 3.5],
    ['3.5g', 3.5],
    ['1/4oz', 7],
    ['28g', 28],
    ['1oz', 28],
  ])('canonicalWeightGrams(%j) snaps to %jg', (label, grams) => {
    expect(canonicalWeightGrams(label)).toBe(grams)
  })

  it.each([
    ['Mama J\'s: Alien Rock Candy - PR 2pk', 2],
    ['Blue Dream 5-pack', 5],
    ['Single Flower 1g', null],
  ])('parsePackCount(%j) === %j', (name, count) => {
    expect(parsePackCount(name)).toBe(count)
  })
})
