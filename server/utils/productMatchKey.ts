import { parseGrams } from './normalizeProduct.js'
import type { ProductRecord } from '../types/index.js'

// Cross-store identity key (SPEC ai-search-data-strategy, Tier A item A1). This is
// the keystone the cheapest-delivered index / brand matrix / AI-search surfacing all
// compose from: it makes the SAME product sold at different stores collapse to one
// stable key while keeping CLEARLY different products apart.
//
// The key is weight-FREE product identity (brand + strain signature + strainType +
// category). Weight is canonicalized separately by `canonicalWeightGrams` and combined
// into the per-option comparison key by the disparity engine, because one ProductRecord
// carries many weight options (1g, 1/8oz, 1/4oz…) — each a separate like-for-like row.
//
// DESIGN NOTE (deliberate, vs the story's literal "name token only where brand is
// null"): the strain/name token is included ALWAYS. Brand+strainType+category alone
// collides distinct strains (e.g. "Libre / Hybrid / Flower / 3.5g" would merge GG4 with
// Blue Dream and emit a FALSE disparity). AC1's own "clearly different products do not
// produce the same key" clause and the story's integrity mandate require the strain
// signature in the key. Differing store name formats only ever cause UNDER-matching
// (a safe false-negative), which is exactly the bias Open-Question 2 chose.

export type MatchKeyResult = { key: string } | { unmatched: string }

// Standard cannabis weights in grams. Ounce fractions parse to exact-gram values
// (1/8oz → 3.54g via 28.3495 g/oz) while many stores label the same physical quantity
// in round grams (3.5g). Snapping both to one canonical bucket is the only honest way
// to compare an eighth to an eighth regardless of label. Tolerance is tight (2%) so
// genuinely different weights (3.6g vs the 3.5g eighth, 2.9% apart) stay distinct.
const STANDARD_GRAMS = [
  0.35, 0.5, 0.7, 0.75, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 7, 10, 14, 28,
]
const SNAP_TOLERANCE = 0.02

// Form/packaging words that describe HOW a product is sold, not WHICH product it is.
// Stripped from the strain signature so "Banana OG Cartridge" matches "Banana OG 1g
// Cartridge" across stores.
const FILLER_TOKENS = new Set([
  'flower', 'preroll', 'prerolls', 'pre', 'roll', 'rolls', 'vape', 'vapes',
  'cartridge', 'cartridges', 'cart', 'carts', 'infused', 'joint', 'joints',
  'disposable', 'disp', 'pk', 'pack', 'packs', 'ct', 'count', 'oz', 'ounce',
  'g', 'gram', 'grams', 'mg', 'by',
])

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Canonical total grams for an option label, snapped to the nearest standard cannabis
// weight when within tolerance, else the exact parsed grams (2dp). Reuses `parseGrams`
// (incl. the fractional-oz fix, ADR-054) — never reinvents weight parsing. Returns null
// when the label carries no usable weight (caller excludes the option).
export function canonicalWeightGrams(option: string): number | null {
  const g = parseGrams(option)
  if (g === null || !Number.isFinite(g) || g <= 0) return null
  let best: number | null = null
  let bestDelta = SNAP_TOLERANCE
  for (const s of STANDARD_GRAMS) {
    const d = Math.abs(g - s) / s
    if (d <= bestDelta) {
      bestDelta = d
      best = s
    }
  }
  return best ?? Math.round(g * 100) / 100
}

// The strain/product signature: the record name with brand tokens, form/packaging
// filler, and any weight/size/pack numerics removed, then alphabetically sorted so
// store-specific word order ("OG Chem" vs "Chem OG") does not split a match. Empty
// string when the name carries no distinctive token.
export function strainToken(rec: ProductRecord): string {
  const brandTokens = new Set(norm(rec.brand).split(' ').filter(Boolean))
  return norm(rec.name)
    .split(' ')
    .filter((t) => {
      if (!t) return false
      if (brandTokens.has(t)) return false
      if (FILLER_TOKENS.has(t)) return false
      if (/^\d/.test(t)) return false // weight/size/pack numerics: "1g", "3.5", "2pk"
      return true
    })
    .sort()
    .join(' ')
}

// Derive the weight-free identity key for a record, or place it in the explicit
// unmatched bucket when it carries neither a brand nor a usable name signal (never
// silently dropped or mis-grouped — AC1).
export function deriveMatchKey(rec: ProductRecord): MatchKeyResult {
  const brand = norm(rec.brand)
  const token = strainToken(rec)
  if (!brand && !token) {
    return { unmatched: 'no brand and no usable name signal' }
  }
  const key = [brand, token, norm(rec.strainType), norm(rec.category)].join('|')
  return { key }
}
