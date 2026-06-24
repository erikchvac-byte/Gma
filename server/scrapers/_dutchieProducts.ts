import { postScrape, type Intercepted, type ScrapeRequest } from '../utils/scraperClient.js'
import { dutchieEmbedUrl } from './_dutchie.js'
import type { RawProduct, RawProductOption } from '../types/index.js'

// Decoupled Dutchie PRODUCT / menu-pricing scraper (SPEC-dutchie-product-pricing,
// ADR-053). This module is ADDITIVE and fully separate from the specials/deals path
// in _dutchie.ts: it issues its OWN scrape request waiting on the FilteredProducts op
// (not GetSpecialMenuCards), and produces RawProduct[] (not Deal[]). It imports only
// `dutchieEmbedUrl` from _dutchie.ts — it never calls dutchieRequest / pickSpecials /
// transformSpecials, so the hardened deals pipeline is untouched.
//
// Shape verified by a live capture 2026-06-24 (see
// _bmad-output/implementation-artifacts/investigations/menu-pricing-source-inventory.md
// and the real fixture __fixtures__/dutchie-products.json).

// Launch scope is three weight/pack-based categories (spec Assumptions). Anything
// else (Edible, Concentrate) is dropped at extraction — out of launch scope.
export const DEFAULT_PRODUCT_CATEGORIES = ['Pre-Rolls', 'Flower', 'Vaporizers'] as const

// Request preset for the PRODUCT menu: same browser tier + GraphQL interception as
// the specials request, but waits specifically for the FilteredProducts op. Like the
// specials op, FilteredProducts can fire before its products array populates (an
// empty-products race, not a wall — see investigation), so the wait + retry-on-empty
// discipline mirrors scrapeDutchieSpecials. The intercept pattern is broad enough to
// catch the op on whichever api-N host serves it (api-0/api-3/api-4 all carry graphql).
// scroll_after_wait=true makes the service scroll AFTER the op fires so the full
// paginated menu loads (the menu arrives as many FilteredProducts pages, not one) —
// the deals request leaves this off, so its timing is unchanged.
export function dutchieProductsRequest(storeId: string): ScrapeRequest {
  return {
    url: dutchieEmbedUrl(storeId),
    intercept_pattern: 'dutchie\\.com.*graphql',
    wait_for_pattern: 'FilteredProducts',
    tier: 'browser',
    headless: true,
    timeout: 45000,
    scroll_after_wait: true,
  }
}

// Coerce an unknown to a finite number or null (prices/quantities arrive as numbers
// but stay defensive against nulls / drift).
function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

// Minimal shapes we read off a FilteredProducts product (everything optional/defensive
// so a live drift degrades to skipped fields / fewer products, never a throw).
interface PosChild {
  option?: string
  price?: number | null
  quantityAvailable?: number | null
}
interface RawDutchieProduct {
  _id?: string
  id?: string
  Name?: string
  type?: string
  brandName?: string
  brand?: { name?: string }
  strainType?: string | null
  special?: boolean
  weight?: number
  measurements?: { netWeight?: { unit?: string; values?: number[] } }
  Options?: string[]
  recSpecialPrices?: (number | null)[]
  POSMetaData?: { children?: PosChild[] }
}

// Collect EVERY FilteredProducts response's products[] and assemble the full menu
// across paginated responses (CAP-3). The menu arrives as multiple FilteredProducts
// pages (~10-50 each), not one payload, so we concat all matching intercepts and
// dedupe by product id (first wins). Defensive at each hop → [] on any miss.
export function pickProducts(intercepted: Intercepted[]): RawDutchieProduct[] {
  const byId = new Map<string, RawDutchieProduct>()
  for (const entry of intercepted) {
    if (!/FilteredProducts/i.test(entry.url)) continue
    const data = entry.data as
      | { data?: { filteredProducts?: { products?: unknown } } }
      | undefined
    const products = data?.data?.filteredProducts?.products
    if (!Array.isArray(products)) continue
    for (const p of products as RawDutchieProduct[]) {
      const id = (p?._id ?? p?.id ?? '').toString()
      if (id && !byId.has(id)) byId.set(id, p)
    }
  }
  return [...byId.values()]
}

// measurements.netWeight → total milligrams (or null). Unit is explicit in the
// payload, so honor it rather than guessing.
function netWeightMg(p: RawDutchieProduct): number | null {
  const nw = p.measurements?.netWeight
  const v = num(nw?.values?.[0])
  if (v === null) return null
  const unit = (nw?.unit ?? '').toUpperCase()
  if (unit === 'MILLIGRAMS') return v
  if (unit === 'GRAMS') return v * 1000
  return null
}

// FilteredProducts intercepts → RawProduct[] (CAP-1/CAP-2). For each option:
//   base price  ← POSMetaData.children matched by `option` (self-describing; children
//                 can be SHORTER than Options[] when an option is below threshold, so
//                 we match by option value, NOT by index — ADR-053).
//   special     ← positional recSpecialPrices[i] (no special price lives in children).
// Index alignment Options[i] ↔ recSpecialPrices[i] is the load-bearing invariant for
// special prices. Products outside the launch categories are dropped.
export function transformProducts(
  intercepted: Intercepted[],
  categories: readonly string[] = DEFAULT_PRODUCT_CATEGORIES,
): RawProduct[] {
  const allowed = new Set(categories)
  const out: RawProduct[] = []
  for (const p of pickProducts(intercepted)) {
    const productId = (p?._id ?? p?.id ?? '').toString()
    const name = (p?.Name ?? '').toString().replace(/\s+/g, ' ').trim()
    const category = (p?.type ?? '').toString()
    if (!productId || !name || !allowed.has(category)) continue
    if (!Array.isArray(p.Options) || p.Options.length === 0) continue

    const children = Array.isArray(p.POSMetaData?.children) ? p.POSMetaData!.children! : []
    const childByOption = new Map<string, PosChild>()
    for (const c of children) if (typeof c?.option === 'string') childByOption.set(c.option, c)
    const special = Boolean(p.special)
    const recSpecial = Array.isArray(p.recSpecialPrices) ? p.recSpecialPrices : []

    const options: RawProductOption[] = p.Options.map((option, i) => {
      const child = childByOption.get(option)
      return {
        option: String(option),
        basePrice: num(child?.price),
        specialPrice: special ? num(recSpecial[i]) : null,
        quantityAvailable: num(child?.quantityAvailable),
      }
    })

    out.push({
      productId,
      name,
      category,
      brand: (p.brandName ?? p.brand?.name ?? null) || null,
      strainType: (p.strainType ?? null) || null,
      special,
      weightField: num(p.weight),
      netWeightMg: netWeightMg(p),
      options,
    })
  }
  return out
}

// Default attempt budget (1 try + 2 retries), matching scrapeDutchieSpecials.
const DEFAULT_ATTEMPTS = 3

export interface ScrapeProductsOptions {
  attempts?: number
  postFn?: typeof postScrape
  categories?: readonly string[]
  label?: string
}

// Scrape + extract one store's product menu, RETRYING while the menu comes back empty
// (CAP-1/CAP-3) — same rationale as scrapeDutchieSpecials: an early read can catch
// FilteredProducts before products populate, indistinguishable downstream from a real
// empty menu. Never throws; a thrown attempt counts as empty and the caller degrades
// to [].
//
// PAGINATION: dutchieProductsRequest sets scroll_after_wait, so after FilteredProducts
// fires the service scrolls to trigger the rest of the menu's pages; pickProducts then
// assembles + dedupes across every captured FilteredProducts response. The scroll is
// opt-in, so the deals scrape (which omits it) is timing-unchanged. See ADR-053.
export async function scrapeDutchieProducts(
  storeId: string,
  opts: ScrapeProductsOptions = {},
): Promise<RawProduct[]> {
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_ATTEMPTS)
  const post = opts.postFn ?? postScrape
  const label = opts.label ?? storeId
  let products: RawProduct[] = []
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      products = transformProducts(await post(dutchieProductsRequest(storeId)), opts.categories)
    } catch (err) {
      console.error(`[products:${label}] attempt ${attempt}/${attempts}`, err)
      products = []
    }
    if (products.length > 0) return products
  }
  return products
}
