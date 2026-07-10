import { normalizeBrandKey } from './brandKey.js'

// ADR-077 derivation-1.6 (D5/FR12) — the brand→store availability matrix, with an honest
// like-for-like cheapest facet.
//
// TWO HONESTY TIERS — keep them apart (the crux of this fact):
//  1. AVAILABILITY (pure grouping, NO price claim): for each normalized brand, the set of
//     stores that carry it and the set of weight tiers it is offered at. "Does store S stock
//     brand B" is true regardless of which product, so this needs no join precision — every
//     product counts here, matched and unmatched alike.
//  2. CHEAPEST (like-for-like ONLY, Gate 1 / match-key precision): a cheapest winner is emitted
//     ONLY for a (brandKey, product-identity matchKey, canonical weight) cell carried by ≥2
//     DISTINCT stores — the exact same-product+same-weight join the disparity engine
//     (crossStoreValue.ts) already uses. Grouping by BRAND ALONE never asserts a cross-store
//     price winner: a naive "cheapest store for brand X" would compare a $8 brand-X pre-roll
//     against a $45 brand-X eighth and crown a false winner across different products. Products
//     with no usable matchKey are excluded from every cell and COUNTED (unmatchedProductCount);
//     they still appear in availability. Single-store cells emit no winner.
//
// NO discount magnitude anywhere: `lowPrice` is the real absolute price paid (the disparity
// engine's Gate 3 value, `specialPrice ?? basePrice`, already reduced at the runner boundary) —
// never a discount %/rate/depth. Honest discount magnitude (price vs the product's own rolling
// median) is Epic 2 / D6 / FR13, deliberately not here. Decision F makes this structural, not a
// matter of discipline: the input types below expose ONLY a single reduced `price` per option —
// the basePrice/specialPrice PAIR (from which a rate could be computed, Gate 2/fix6) and potency
// (thc/cbd/totalTerpenes, Gate 5) are not fields here, so that breach does not compile.
//
// CROSS-SECTIONAL: this reads the latest observation only (the runner projects `history.at(-1)`
// into `options`), exactly like crossStoreValue.ts — no gap logic, no 1.2 presence-aware helper,
// no `today`. "At what tiers / cheapest" is a point-in-time question.

// A single already-reduced price offer for one weight of one product. `price` is the real price
// paid — NOT a basePrice/specialPrice pair (decision F). Weight is the canonical grams from
// `canonicalWeightGrams` (non-null; mg-labelled Edible options carry no weight, so the runner
// drops them at the boundary — an Edible-only product arrives with `options: []`).
export interface BrandStoreOption {
  weightGrams: number
  price: number
}

// A product projected DOWN to only what the matrix needs: brand identity, its store, its
// weight-free product-identity match-key (or null when the product carries no usable identity
// signal), a real display label, and its reduced per-weight offers. Carries NO price pair and
// NO potency — the runner drops those at the projection boundary (decision F, Gates 2/5).
export interface BrandStoreProduct {
  brand: string | null
  dispensaryId: string
  matchKey: string | null
  name: string
  options: BrandStoreOption[]
}

// A like-for-like cheapest winner: one (matchKey, weightGrams) cell carried by ≥2 distinct
// stores. `lowPrice` is the real absolute low price paid (never a discount magnitude).
export interface CheapestCell {
  matchKey: string
  displayName: string // a real product name from the cell (never the match-key, never fabricated)
  weightGrams: number
  lowPrice: number
  cheapestStores: string[] // dispensaryIds tied at lowPrice (sorted)
  storesCarrying: number // distinct stores in the cell (>= 2)
}

export interface BrandStoreRow {
  brandKey: string // normalized identity (normalizeBrandKey)
  displayBrand: string // a real raw brand label from the group — never the key, never fabricated
  productCount: number
  storesCarrying: string[] // sorted distinct dispensaryIds carrying the brand (availability)
  tiers: number[] // sorted distinct canonical weights the brand is offered at (availability)
  cheapestCells: CheapestCell[] // like-for-like ≥2-store cells (Gate 1); [] when none
}

export interface BrandStoreMatrixReport {
  brands: BrandStoreRow[] // sorted by brandKey ascending
  totalBrands: number // normalized non-null brands
  multiStoreBrandCount: number // brands carried at ≥2 stores
  cheapestCellCount: number // total ≥2-store cheapest cells across all brands
  nullBrandProductCount: number // products excluded for a null/empty brand (counted, FR7)
  unmatchedProductCount: number // products with a null match-key, excluded from cheapest (counted, FR7)
}

// One store's cheapest offer within a cell, plus the product label to surface for it.
interface StoreOffer {
  price: number
  name: string
}

interface CellAcc {
  matchKey: string
  weightGrams: number
  perStore: Map<string, StoreOffer> // dispensaryId → its cheapest offer in this cell
}

interface BrandAcc {
  productCount: number
  stores: Set<string>
  tiers: Set<number>
  rawLabelCounts: Map<string, number> // raw spelling → # products, to pick a representative label
  cells: Map<string, CellAcc> // `${matchKey}@${weightGrams}` → cell
}

// The raw brand spelling carried by the most products (tie → lexicographically smallest, for a
// deterministic pick), trimmed so a variant with surrounding whitespace (e.g. the live
// "Hustler's Ambition ") does not surface a ragged label. Mirrors brandPersonas.pickDisplayBrand
// (kept self-contained per the story, not shared). The raw always has ≥1 alphanumeric here (its
// brandKey is non-null), so the trimmed result is never empty.
function pickDisplayBrand(rawLabelCounts: Map<string, number>): string {
  let best = ''
  let bestCount = -1
  for (const [label, count] of rawLabelCounts) {
    if (count > bestCount || (count === bestCount && label < best)) {
      best = label
      bestCount = count
    }
  }
  return best.trim()
}

export function buildBrandStoreMatrix(products: BrandStoreProduct[]): BrandStoreMatrixReport {
  const byBrand = new Map<string, BrandAcc>()
  let nullBrandProductCount = 0
  let unmatchedProductCount = 0

  for (const product of products) {
    const brandKey = normalizeBrandKey(product.brand)
    if (brandKey === null) {
      nullBrandProductCount++
      continue
    }
    let acc = byBrand.get(brandKey)
    if (!acc) {
      acc = { productCount: 0, stores: new Set(), tiers: new Set(), rawLabelCounts: new Map(), cells: new Map() }
      byBrand.set(brandKey, acc)
    }

    // Availability facet (pure grouping): every product counts, matched or not.
    acc.productCount++
    acc.stores.add(product.dispensaryId)
    for (const opt of product.options) acc.tiers.add(opt.weightGrams)
    // product.brand is non-null here (normalizeBrandKey returned a key), but narrow for the type.
    const raw = product.brand ?? ''
    acc.rawLabelCounts.set(raw, (acc.rawLabelCounts.get(raw) ?? 0) + 1)

    // Cheapest facet (Gate 1): only products with a usable match-key contribute cells; a
    // null-match-key product is counted and excluded — it still counted toward availability above.
    if (product.matchKey === null) {
      unmatchedProductCount++
      continue
    }
    for (const opt of product.options) {
      // `@` can never appear inside a matchKey (deriveMatchKey normalizes to alphanumerics,
      // spaces and `|` only), so distinct (matchKey, weightGrams) pairs never collide into one cell.
      const cellKey = `${product.matchKey}@${opt.weightGrams}g`
      let cell = acc.cells.get(cellKey)
      if (!cell) {
        cell = { matchKey: product.matchKey, weightGrams: opt.weightGrams, perStore: new Map() }
        acc.cells.set(cellKey, cell)
      }
      const cur = cell.perStore.get(product.dispensaryId)
      if (!cur || opt.price < cur.price) {
        cell.perStore.set(product.dispensaryId, { price: opt.price, name: product.name })
      }
    }
  }

  const brands: BrandStoreRow[] = []
  let multiStoreBrandCount = 0
  let cheapestCellCount = 0

  for (const [brandKey, acc] of byBrand) {
    const storesCarrying = [...acc.stores].sort()
    if (storesCarrying.length >= 2) multiStoreBrandCount++

    const cheapestCells: CheapestCell[] = []
    for (const cell of acc.cells.values()) {
      if (cell.perStore.size < 2) continue // single-store cell — no honest cross-store winner
      const offers = [...cell.perStore.entries()] // [dispensaryId, {price, name}]
      const lowPrice = Math.min(...offers.map(([, o]) => o.price))
      const cheapestStores = offers
        .filter(([, o]) => o.price === lowPrice)
        .map(([id]) => id)
        .sort()
      // A real product label from the cheapest offer (tie → lexicographically smallest store id),
      // deterministic regardless of input order; mirrors crossStoreValue picking the low store's name.
      const displayName = offers
        .slice()
        .sort((a, b) => a[1].price - b[1].price || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][1].name
      cheapestCells.push({
        matchKey: cell.matchKey,
        displayName,
        weightGrams: cell.weightGrams,
        lowPrice,
        cheapestStores,
        storesCarrying: cell.perStore.size,
      })
    }
    // Deterministic order: by weight, then match-key.
    cheapestCells.sort((a, b) => a.weightGrams - b.weightGrams || (a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : 0))
    cheapestCellCount += cheapestCells.length

    brands.push({
      brandKey,
      displayBrand: pickDisplayBrand(acc.rawLabelCounts),
      productCount: acc.productCount,
      storesCarrying,
      tiers: [...acc.tiers].sort((a, b) => a - b),
      cheapestCells,
    })
  }

  // Stable output for clean diffs across daily runs.
  brands.sort((a, b) => (a.brandKey < b.brandKey ? -1 : a.brandKey > b.brandKey ? 1 : 0))

  return {
    brands,
    totalBrands: brands.length,
    multiStoreBrandCount,
    cheapestCellCount,
    nullBrandProductCount,
    unmatchedProductCount,
  }
}
