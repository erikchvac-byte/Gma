import { walkPresenceAwareSeries } from './presenceAwareSeries.js'
import { normalizeBrandKey } from './brandKey.js'

// ADR-077 derivation-1.5 (D2/FR9) — per-brand discount PERSONA from the observation series.
//
// THE HONESTY REFRAME (Gate 2 / fix6 / decision F): a product's specialPrice-vs-basePrice
// discount % is a flat store/brand promo rate with NO per-item signal (fix6-basePrice-verdict),
// and the only honest discount MAGNITUDE is price-vs-the-product's-own-rolling-median — that is
// Epic 2 / D6 / FR13, deliberately out of scope here. So this fact does NOT report any discount
// magnitude. It characterizes a brand by how OFTEN it is on special (`specialDayFraction`, the
// share of its observed product-days flagged special), read purely from the `special` boolean.
//
// Decision F makes that mechanical, not a matter of discipline: the input types below expose
// ONLY brand identity + the per-day `special` boolean — option prices (Gate 2) and potency
// (Gate 5) are not fields here, so a magnitude computation does not compile. The runner projects
// the full ProductRecord DOWN to these types at the call boundary; this module never sees a price.
//
// Gap-tolerant by construction (Gate 3): each product's series is walked with the 1.2 helper, so
// a missing day is a 'gap' and counts as neither special nor non-special — never a fabricated
// "observed, not on special" day.

export interface BrandDaySignal {
  observedAt: string
  special: boolean
}

export interface BrandProductSeries {
  productId: string
  brand: string | null
  history: BrandDaySignal[]
}

// Sample-size floor: a brand needs at least this many OBSERVED product-days (summed across its
// products — a product-day is one product observed on one calendar day) before it is classified;
// below it, 'insufficient-history' rather than a guess. 10 is reachable by every meaningfully-
// present brand in the live ~12-day window (Grounding §5). NOTE: this counts product-days, not
// distinct calendar days — a brand carried at ≥10 stores on a single day also clears the floor, so
// the persona reflects prevalence-across-footprint, not guaranteed longitudinal depth. A distinct-
// calendar-day floor is a deferred refinement (see the story's Review Findings).
export const MIN_OBSERVED_PRODUCT_DAYS = 10
// A brand on special on ≥95% of observed product-days reads as always-on-special; ≤5% as
// never-discounted; the band between is intermittently-discounted. Cutoffs chosen from the live
// distribution (118 always / 39 never / 134 intermittent over 291 classifiable brands).
export const SPECIAL_FRACTION_HIGH = 0.95
export const SPECIAL_FRACTION_LOW = 0.05

export type BrandDiscountPersona =
  | 'always-on-special'
  | 'never-discounted'
  | 'intermittently-discounted'
  | 'insufficient-history'

export interface BrandPersona {
  brandKey: string // normalized identity (normalizeBrandKey)
  displayBrand: string // a real raw brand label from the group — never the key, never fabricated
  productCount: number
  observedProductDays: number
  specialProductDays: number
  specialDayFraction: number | null // null iff insufficient-history (never a magnitude)
  persona: BrandDiscountPersona
}

export interface BrandPersonasReport {
  personas: BrandPersona[]
  totalBrands: number // normalized non-null brands (classifiable + insufficient)
  alwaysOnSpecialCount: number
  neverDiscountedCount: number
  intermittentCount: number
  insufficientHistoryCount: number
  nullBrandProductCount: number // products excluded for a null/empty brand (counted, FR7)
}

interface BrandAcc {
  productCount: number
  observedProductDays: number
  specialProductDays: number
  rawLabelCounts: Map<string, number> // raw spelling → # products, to pick a representative displayBrand
}

// Walk one product's special series, gap-tolerant. Returns observed-day and special-day counts;
// a missing interior day is a 'gap' counted as neither (Gate 3). Bounded with `endDate: today`
// exactly like specialEvents.ts, so a future-dated / clock-skewed observation is not counted as a
// real special-day and the walked span can never run past today. Wrapped defensively: a product
// whose history can't be walked (e.g. a malformed observedAt, or an all-future history whose
// earliest day lands after today) is treated as fully-gapped rather than aborting the derive run.
function countSpecialDays(history: BrandDaySignal[], today: string): { observed: number; special: number } {
  let walk
  try {
    walk = walkPresenceAwareSeries(history, {
      getObservedAt: (o: BrandDaySignal) => o.observedAt,
      getValue: (dayItems: BrandDaySignal[]) => dayItems.at(-1)!.special,
      endDate: today,
    })
  } catch {
    return { observed: 0, special: 0 }
  }
  let observed = 0
  let special = 0
  for (const entry of walk) {
    if (entry.status === 'gap') continue
    observed++
    if (entry.value === true) special++
  }
  return { observed, special }
}

// The raw brand spelling carried by the most products (tie → lexicographically smallest, for a
// deterministic pick) — a genuine label a human recognizes, distinct from the normalized key.
// Trimmed so a raw variant with surrounding whitespace (e.g. the live "Hustler's Ambition ")
// doesn't surface a ragged label; the raw always has ≥1 alphanumeric here (its brandKey is
// non-null), so the trimmed result is never empty.
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

export function buildBrandPersonas(products: BrandProductSeries[], today: string): BrandPersonasReport {
  const byBrand = new Map<string, BrandAcc>()
  let nullBrandProductCount = 0

  for (const product of products) {
    const brandKey = normalizeBrandKey(product.brand)
    if (brandKey === null) {
      nullBrandProductCount++
      continue
    }
    let acc = byBrand.get(brandKey)
    if (!acc) {
      acc = { productCount: 0, observedProductDays: 0, specialProductDays: 0, rawLabelCounts: new Map() }
      byBrand.set(brandKey, acc)
    }
    const { observed, special } = countSpecialDays(product.history, today)
    acc.productCount++
    acc.observedProductDays += observed
    acc.specialProductDays += special
    // product.brand is non-null here (normalizeBrandKey returned a key), but narrow for the type.
    const raw = product.brand ?? ''
    acc.rawLabelCounts.set(raw, (acc.rawLabelCounts.get(raw) ?? 0) + 1)
  }

  const personas: BrandPersona[] = []
  let alwaysOnSpecialCount = 0
  let neverDiscountedCount = 0
  let intermittentCount = 0
  let insufficientHistoryCount = 0

  for (const [brandKey, acc] of byBrand) {
    let persona: BrandDiscountPersona
    let specialDayFraction: number | null
    if (acc.observedProductDays < MIN_OBSERVED_PRODUCT_DAYS) {
      persona = 'insufficient-history'
      specialDayFraction = null
      insufficientHistoryCount++
    } else {
      specialDayFraction = acc.specialProductDays / acc.observedProductDays
      if (specialDayFraction >= SPECIAL_FRACTION_HIGH) {
        persona = 'always-on-special'
        alwaysOnSpecialCount++
      } else if (specialDayFraction <= SPECIAL_FRACTION_LOW) {
        persona = 'never-discounted'
        neverDiscountedCount++
      } else {
        persona = 'intermittently-discounted'
        intermittentCount++
      }
    }
    personas.push({
      brandKey,
      displayBrand: pickDisplayBrand(acc.rawLabelCounts),
      productCount: acc.productCount,
      observedProductDays: acc.observedProductDays,
      specialProductDays: acc.specialProductDays,
      specialDayFraction,
      persona,
    })
  }

  // Stable output for clean diffs across daily runs.
  personas.sort((a, b) => (a.brandKey < b.brandKey ? -1 : a.brandKey > b.brandKey ? 1 : 0))

  return {
    personas,
    totalBrands: personas.length,
    alwaysOnSpecialCount,
    neverDiscountedCount,
    intermittentCount,
    insufficientHistoryCount,
    nullBrandProductCount,
  }
}
