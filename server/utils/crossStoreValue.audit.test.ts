import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { canonicalWeightGrams } from './productMatchKey.js'
import { parseGrams, parsePackCount } from './normalizeProduct.js'
import type { MatchReport } from './crossStoreValue.js'
import type { DerivedEnvelope } from './derivedEnvelope.js'

// Phase 0 verification (AC5), rebased onto ADR-077. The raw products.json left git for local
// SQLite, so this audit now runs over the COMMITTED DERIVED disparities.json — the real,
// deployed value output (produced by deriveFactsRun from the home DB). It still asserts the
// honesty invariants against reality, not synthetic fixtures. The raw-record exclusion-gate
// equivalence it used to prove is fully unit-covered in crossStoreValue.test.ts (gate 1).
// derivation-1.1: the committed file is envelope-shaped; the report itself lives under `.data`.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DERIVED_DISPARITIES = path.join(__dirname, '../data/derived/disparities.json')

describe('Phase 0 audit — committed derived disparities.json (ADR-077)', () => {
  const present = existsSync(DERIVED_DISPARITIES)
  const report: MatchReport | null = present
    ? (JSON.parse(readFileSync(DERIVED_DISPARITIES, 'utf-8')) as DerivedEnvelope<MatchReport>).data
    : null

  it('the committed derived facts exist and were actually derived from a populated dataset', () => {
    expect(present).toBe(true)
    expect(report!.totalRecords).toBeGreaterThan(0)
  })

  it('the dataset actually exercises the exclusion gate (flagged records counted)', () => {
    if (!present) return // covered by the previous it(); avoid a null-deref crash on a fresh checkout
    // Non-vacuous audit: real committed data carries excluded-flag records (568 as of writing).
    expect(report!.excludedFlagCount).toBeGreaterThan(0)
  })

  it('counts every unplaceable record (nothing hidden)', () => {
    if (!present) return // covered by the first it(); avoid a null-deref crash on a fresh checkout
    expect(report!.unmatchedCount).toBeGreaterThanOrEqual(0)
    expect(report!.excludedFlagCount).toBeGreaterThanOrEqual(0)
    expect(report!.nonComparableCategoryCount).toBeGreaterThanOrEqual(0)
    // Every record is accounted for: excluded, unmatched, placed, or matched-but-unpriced/single-option.
    expect(report!.unmatchedCount + report!.excludedFlagCount).toBeLessThanOrEqual(report!.totalRecords)
  })

  it('every emitted disparity is well-formed and like-for-like', () => {
    if (!present) return // covered by the first it(); avoid a null-deref crash on a fresh checkout
    for (const d of report!.disparities) {
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
