import { canonicalWeightGrams } from './productMatchKey.js'
import { EXCLUDED_FLAGS } from './crossStoreValue.js'
import { isDealActive } from './filterActiveDeals.js'
import type {
  DealScope,
  DealScopeLink,
  DealScopeReport,
  ProductRecord,
  ProductsFile,
  ScrapedCategory,
} from '../types/index.js'
import type { Deal, Dispensary } from '../../client/src/types/index.js'

// Deal→SKU scope bridge (deal-sku-bridge story). A pure, read-only THIRD consumer that
// JOINS the two deliberately decoupled pipelines (ADR-043/053): free-text Deal banners
// (data.json) and ProductRecords (products.json). It infers which SKUs a banner covers
// and when — modelled EXACTLY on crossStoreValue.ts: read both files, mutate neither,
// count everything it cannot place (never silently drop, never fan out on ambiguity).
//
// HONESTY GATES (the integrity that IS the product's moat — fix6-basePrice-verdict.md):
//  1. A banner `discountPct` is a flat storewide/brand promo rate with NO per-item
//     signal. This bridge NEVER multiplies a % onto a product to claim a saving. A link
//     is EXPLANATORY + TEMPORAL ("this banner covers these SKUs, on these days"), full
//     stop. `deal.discountPct` is deliberately NOT read here.
//  2. The observed `specialPrice` on a ProductRecord stays the price-of-record. The
//     bridge sits beside it — it does not replace, recompute, or reconcile it.
//  3. Ambiguous scope resolves to `unresolved`, NEVER silently to storewide. Banners
//     targeting out-of-catalog categories (Edibles/Drinks/…) are `unsupported-category`,
//     counted, linked to nothing (value-analysis §4: catalog is Flower/Vapes/Pre-Rolls).
//  4. On a WEIGHT-qualified scope, records whose weight is untrustworthy (excluded flags)
//     are not linked — mirrors crossStoreValue's EXCLUDED_FLAGS discipline.

// Per-record flags that poison weight-based matching. Reused from crossStoreValue.ts so
// the honesty set stays single-sourced. Applied ONLY to weight-qualified scopes (AC4b) —
// a bare category / storewide banner still covers a flag-carrying record, its weight just
// isn't asserted.

// Out-of-catalog category cues. A banner naming any of these targets products we do NOT
// scrape (value-analysis §4) → classified `unsupported-category`, counted, linked to
// nothing. This wins even over a storewide word ("all edibles" is edibles-scoped, not
// storewide) so we never fan an out-of-catalog banner across the whole flower menu.
const UNSUPPORTED_CUES: RegExp[] = [
  /\bedibles?\b/,
  /\bgummies?\b/,
  /\bgummy\b/,
  /\bchocolates?\b/,
  /\bdrinks?\b/,
  /\bbeverages?\b/,
  /\bsodas?\b/,
  /\btopicals?\b/,
  /\btinctures?\b/,
  /\bcapsules?\b/,
  /\btablets?\b/,
]

// Explicit storewide signals (AC1). Ambiguity is NOT one of these — a banner with no
// signal falls through to `unresolved`, never to storewide.
const STOREWIDE_CUES: RegExp[] = [
  /store[-\s]?wide/,
  /entire (menu|store|order)/,
  /whole (store|menu)/,
  /\beverything\b/,
  /all (products|items|online orders|orders)/,
]

// Infer a banner's product scope from its (already-sanitized) description (AC1). Pure
// over the Deal — no product/price/discount input, so scope can never encode a saving.
export function parseDealScope(deal: Deal): DealScope {
  const d = deal.description.toLowerCase()

  // 1. Out-of-catalog target wins first (honest: don't fan Edibles across Flower).
  for (const re of UNSUPPORTED_CUES) {
    const m = d.match(re)
    if (m) return { kind: 'unsupported-category', targeted: m[0] }
  }

  // 2. Scraped category. Pre-roll BEFORE flower (an "infused pre-roll" banner must not
  //    fall through to Flower — mirrors _weedmaps.ts CATEGORY_RULES ordering).
  if (/pre[-\s]?roll/.test(d)) return { kind: 'category', category: 'Pre-Rolls', weightGrams: null }
  // "cart" abbreviates cartridge in most promo banners, but "your cart" / "in your cart"
  // is the shopping-cart sense — guard it out so a whole-order banner isn't misread as a
  // Vaporizers deal. Only "cart" is ambiguous ("cartridge" is matched separately and is
  // never a false friend). This guard is dealScope-only: _weedmaps' identical cue runs on
  // structured category taxonomy where the shopping-cart sense cannot appear.
  const cartIsShopping = /\b(?:in\s+)?your\s+cart\b/.test(d)
  if (/vape|vapor|cartridge|\bpen/.test(d) || (/\bcart\b/.test(d) && !cartIsShopping)) {
    return { kind: 'category', category: 'Vaporizers', weightGrams: null }
  }
  // Flower family. "ounce/oz" ⇒ Flower @ 28g, "eighth/1/8" ⇒ Flower @ 3.5g, both imply
  // Flower even without the word. Weights come from parseGrams/canonicalWeightGrams
  // (never re-implemented) so the ADR-054 fractional-oz snap is inherited.
  const isOunce = /\bounces?\b|\boz\b/.test(d)
  const isEighth = /\beighths?\b|1\s*\/\s*8/.test(d)
  if (isOunce || isEighth || /\bflower\b/.test(d)) {
    // Eighth BEFORE ounce: "1/8 oz" is a genuine eighth (3.5g) whose "oz" also trips
    // the ounce cue — the more specific fraction must win so it isn't snapped to 28g.
    const weightGrams = isEighth
      ? canonicalWeightGrams('1/8oz')
      : isOunce
        ? canonicalWeightGrams('1oz')
        : null
    return { kind: 'category', category: 'Flower', weightGrams }
  }

  // 3. Storewide — explicit signal only.
  if (STOREWIDE_CUES.some((re) => re.test(d))) return { kind: 'storewide' }

  // 4. Brand — DEFERRED stub (Task 1). We recognize an explicit "brand" cue and defer;
  //    we never attempt to identify WHICH brand or match it. "brand new" is a false
  //    friend, guarded out. Deferring (count, link nothing) is the safe direction.
  if (/\bbrands?\b(?!\s+new)/.test(d)) return { kind: 'brand' }

  // 5. No confident scope — counted, never guessed into storewide.
  return { kind: 'unresolved' }
}

// The real price paid for an option (fix6 gate 2): specialPrice ?? basePrice. Used only
// to decide a record is "priced" — never combined with a banner %.
function hasPricedOption(rec: ProductRecord): boolean {
  const latest = rec.history.at(-1)
  if (!latest) return false
  return latest.options.some((o) => {
    const price = o.specialPrice ?? o.basePrice
    return price !== null && Number.isFinite(price) && price > 0
  })
}

// True when the record carries a priced option at the given canonical weight (AC2 weight-
// qualified match). Weight snapping reuses canonicalWeightGrams (ADR-054), never reinvented.
function hasPricedOptionAtWeight(rec: ProductRecord, weightGrams: number): boolean {
  const latest = rec.history.at(-1)
  if (!latest) return false
  return latest.options.some((o) => {
    if (canonicalWeightGrams(o.option) !== weightGrams) return false
    const price = o.specialPrice ?? o.basePrice
    return price !== null && Number.isFinite(price) && price > 0
  })
}

// The SKUs a resolved scope covers WITHIN one store (AC2). Same-store only — the caller
// passes just this store's records. Returns productIds; empty ⇒ caller flags zero-match.
function matchStoreProducts(scope: DealScope, storeProducts: ProductRecord[]): string[] {
  if (scope.kind === 'storewide') {
    // All of the store's priced SKUs. Flag-carrying records ARE included: a storewide
    // banner covers them, we just don't assert their weight (AC4b is weight-scoped only).
    return storeProducts.filter(hasPricedOption).map((r) => r.productId)
  }
  if (scope.kind === 'category') {
    const inCategory = storeProducts.filter((r) => r.category === (scope.category as ScrapedCategory))
    if (scope.weightGrams === null) {
      return inCategory.filter(hasPricedOption).map((r) => r.productId)
    }
    const w = scope.weightGrams
    // Weight-qualified: drop untrustworthy-weight records (AC4b), then require a priced
    // option at the canonical weight.
    return inCategory
      .filter((r) => !r.flags.some((f) => EXCLUDED_FLAGS.has(f)))
      .filter((r) => hasPricedOptionAtWeight(r, w))
      .map((r) => r.productId)
  }
  // unsupported-category / brand / unresolved link to nothing (counted by the caller).
  return []
}

// Build the full deal→SKU link set plus AC5 bookkeeping. Read-only over both files; the
// `data` param is narrowed to the one field used so fixtures stay light. Degrades to
// empty links for a store with no products (or no deals) — never throws (AC decoupling).
export function buildDealScopeLinks(
  data: { dispensaries: Dispensary[] },
  products: ProductsFile,
): DealScopeReport {
  // Group products by store once (crossStoreValue-style pre-grouping).
  const byStore = new Map<string, ProductRecord[]>()
  for (const rec of Object.values(products.products)) {
    const arr = byStore.get(rec.dispensaryId) ?? []
    arr.push(rec)
    byStore.set(rec.dispensaryId, arr)
  }

  const links: DealScopeLink[] = []
  let totalDeals = 0
  let storewideCount = 0
  let categoryCount = 0
  let unsupportedCategoryCount = 0
  let brandCount = 0
  let unresolvedCount = 0
  let zeroMatchCount = 0
  let linkedSkuCount = 0

  for (const store of data.dispensaries) {
    const storeProducts = byStore.get(store.id) ?? []
    store.deals.forEach((deal, dealIndex) => {
      totalDeals++
      const scope = parseDealScope(deal)

      // Count the classification (every deal lands in exactly one scope-class counter).
      switch (scope.kind) {
        case 'storewide':
          storewideCount++
          break
        case 'category':
          categoryCount++
          break
        case 'unsupported-category':
          unsupportedCategoryCount++
          return // linked to nothing (AC4c)
        case 'brand':
          brandCount++
          return
        case 'unresolved':
          unresolvedCount++
          return
      }

      const productIds = matchStoreProducts(scope, storeProducts)
      if (productIds.length === 0) {
        // Scope resolved but nothing to link — distinct from unresolved (AC4d). Counted,
        // no empty link emitted.
        zeroMatchCount++
        return
      }

      linkedSkuCount += productIds.length
      links.push({
        dispensaryId: store.id,
        dealIndex,
        dealDescription: deal.description,
        scope,
        productIds,
        daysValid: deal.daysValid,
        startTime: deal.startTime,
        endTime: deal.endTime,
      })
    })
  }

  return {
    links,
    totalDeals,
    storewideCount,
    categoryCount,
    linkedSkuCount,
    unsupportedCategoryCount,
    brandCount,
    unresolvedCount,
    zeroMatchCount,
  }
}

// "Is this SKU on a banner deal RIGHT NOW" (AC3). Delegates to the SHARED isDealActive
// (filterActiveDeals.ts) so the day/time-window logic — overnight windows, the 'everyday'
// rule — lives in exactly one place and cannot drift from /api/data. The link carries the
// temporal fields it inherited from its deal, which is all isDealActive reads.
export function isDealScopeLinkActive(link: DealScopeLink, now: Date = new Date()): boolean {
  return isDealActive(link, now)
}
