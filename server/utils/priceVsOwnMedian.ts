import { walkPresenceAwareSeries } from './presenceAwareSeries.js'

// ADR-077 derivation-2.1 (D6/FR13) — the fix6 keystone: each SKU's CURRENT effective price
// compared against its OWN rolling median from history.
//
// THE HONESTY REFRAME (Gate 2 / fix6): a product's specialPrice-vs-basePrice discount % is a flat
// store/brand promo rate with NO per-item signal (investigations/fix6-basePrice-verdict.md). The
// ONLY honest discount magnitude is price-vs-the-product's-own-rolling-median — that is this fact.
// So the banner/product-special % is NOT an input here: the effective price
// (`specialPrice ?? basePrice`) is single-reduced at the runner boundary, and the base/special PAIR
// never reaches this module. Decision F makes that mechanical, not a matter of discipline: the input
// types below expose ONLY an already-reduced `effectivePrice` per option-day — no pair, no discount
// %, no potency — so a banner-rate or potency computation does not compile.
//
// Consequence worth stating plainly: an always-on-special SKU's median already reflects the special,
// so its "deal" honestly reads ≈ 0% vs its own median — that is fix6's entire point, not an error.
//
// SERIES KEY = (product, option label verbatim), NOT canonical weight. This fact makes no $/gram and
// no cross-product claim — it compares one listing's price to ITSELF — so the weight parser is
// deliberately NOT imported (it would drag in the "100mg"→0.1g mg-bogosity hazard this fact
// structurally avoids). Edibles/mg-labelled options are honestly comparable to their own history.
//
// Gap-tolerant by construction (Gate 3): each series is walked with the 1.2 helper, so a missing day
// is a 'gap' — never a fabricated "observed, unchanged" day, and never a value in the median.
//
// MEDIAN is over ALL observed days in the window INCLUDING today (today's price is part of its own
// window — simplest, stable). The window is the last ROLLING_WINDOW_DAYS calendar days ending today.

// --- Ratified constants (Erik, dev-start 2026-07-11) ---
// Rolling window each SKU's median is computed over. 30: with ~18 days of live history today it
// covers all of it (nothing discarded) and becomes a true rolling window once accrual passes day 30.
export const ROLLING_WINDOW_DAYS = 30
// Distinct-calendar-day floor per series (NOT product-days — 1.5-review fold-in). A series below the
// floor is suppressed and counted, never guessed. 7 ≈ one week of real presence.
export const MIN_OBSERVED_DAYS = 7

// Narrowed input (decision F). An option-day price point, already reduced to a single effective
// price at the runner boundary. `effectivePrice` may be null/unusable — the pure fn owns the
// usable-price gate + count so the envelope's `noUsablePrice` number is never invented elsewhere.
export interface PriceEntry {
  observedAt: string
  option: string
  effectivePrice: number | null
}

// Narrowed input (decision F): identity + the option-day price points. NO basePrice/specialPrice
// pair, NO discount %, NO potency, NO flags — the breach does not compile.
export interface PriceProductSeries {
  productId: string
  dispensaryId: string
  name: string
  category: string
  entries: PriceEntry[]
}

export interface PriceVsOwnMedianRow {
  dispensaryId: string
  productId: string
  name: string
  category: string
  option: string
  currentPrice: number
  medianPrice: number
  // (current − median) / median. Negative = below own median = the honest discount; positive =
  // premium above own median. Rounded to 4dp for diff-stable daily output.
  pctVsMedian: number
  observedDays: number
}

export interface PriceVsOwnMedianReport {
  rows: PriceVsOwnMedianRow[]
  totalProducts: number
  totalSeries: number
  comparedCount: number
  belowMedianCount: number
  aboveMedianCount: number
  atMedianCount: number
  belowFloorCount: number
  noObservationTodayCount: number
  noUsablePriceCount: number
}

// 4dp rounding for diff-stable committed output (prices + pct). Kept local; no cross-product claim
// needs the shared price helpers.
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

// The window-start calendar day: `today` minus (ROLLING_WINDOW_DAYS − 1) days, so the window is
// inclusive of both today and the start day (ROLLING_WINDOW_DAYS days total). Exported so the runner
// computes the DB read's `sinceIso` from the SAME source of truth as the walk's lower bound.
export function windowStartDay(today: string): string {
  const d = new Date(`${today}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - (ROLLING_WINDOW_DAYS - 1))
  return d.toISOString().slice(0, 10)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const usablePrice = (p: number | null): p is number => p !== null && Number.isFinite(p) && p > 0

// Walk one series' usable price points, gap-tolerant and window-bounded. Returns the observed-day
// values (today's included) and today's value if observed. Wrapped defensively like specialEvents/
// brandPersonas: a series whose history can't be walked (malformed observedAt, all-future dates
// landing past today) is treated as fully-gapped rather than aborting the derive run.
function walkSeries(
  entries: PriceEntry[],
  startDay: string,
  today: string,
): { observedValues: number[]; todayValue: number | null } {
  let walk
  try {
    walk = walkPresenceAwareSeries(entries, {
      getObservedAt: (e: PriceEntry) => e.observedAt,
      // Entries are pre-filtered to usable prices, so the day's chosen entry always carries a real
      // value. Within a day the TIME-LATEST usable observation wins — sorted by observedAt here
      // because the helper buckets by day but preserves caller order inside a bucket, so a bare
      // `.at(-1)` would be input-order-dependent (duplicate option labels within one observation
      // arrive unsorted even on the ORDER BY runner path).
      getValue: (dayItems: PriceEntry[]) =>
        [...dayItems]
          .sort((a, b) => (a.observedAt < b.observedAt ? -1 : a.observedAt > b.observedAt ? 1 : 0))
          .at(-1)!.effectivePrice as number,
      startDate: startDay,
      endDate: today,
    })
  } catch {
    return { observedValues: [], todayValue: null }
  }
  const observedValues: number[] = []
  let todayValue: number | null = null
  for (const entry of walk) {
    if (entry.status === 'gap') continue
    observedValues.push(entry.value)
    if (entry.date === today) todayValue = entry.value
  }
  return { observedValues, todayValue }
}

export function buildPriceVsOwnMedianReport(
  products: PriceProductSeries[],
  today: string,
): PriceVsOwnMedianReport {
  const startDay = windowStartDay(today)

  const rows: PriceVsOwnMedianRow[] = []
  let totalSeries = 0
  let comparedCount = 0
  let belowMedianCount = 0
  let aboveMedianCount = 0
  let atMedianCount = 0
  let belowFloorCount = 0
  let noObservationTodayCount = 0
  let noUsablePriceCount = 0

  for (const product of products) {
    // Group this product's entries into per-option-label series; drop + count unusable prices here
    // (the envelope's noUsablePrice restates THIS counter — never invented at the runner).
    // UNIT NOTE: noUsablePrice counts ENTRIES; every other excluded[] reason counts SERIES. A series
    // whose every price is unusable never materializes below, so it is absent from totalSeries —
    // which is why `totalSeries = belowFloor + noObservationToday + compared` holds by construction.
    const seriesByOption = new Map<string, PriceEntry[]>()
    for (const entry of product.entries) {
      if (!usablePrice(entry.effectivePrice)) {
        noUsablePriceCount++
        continue
      }
      const bucket = seriesByOption.get(entry.option)
      if (bucket) bucket.push(entry)
      else seriesByOption.set(entry.option, [entry])
    }

    for (const [option, entries] of seriesByOption) {
      totalSeries++
      const { observedValues, todayValue } = walkSeries(entries, startDay, today)

      // (b) distinct observed days must clear the floor — checked first so a below-floor series is
      // counted as belowFloor even when it also lacks a today observation (matches §Grounding).
      if (observedValues.length < MIN_OBSERVED_DAYS) {
        belowFloorCount++
        continue
      }
      // (a) must have an observed value on today to compare.
      if (todayValue === null) {
        noObservationTodayCount++
        continue
      }

      const med = round4(median(observedValues))
      const current = todayValue
      // med > 0 always today (usablePrice admits only finite positives); the 0-guard is pure defense
      // against a future loosening of that gate, not a reachable branch.
      const pctVsMedian = med === 0 ? 0 : round4((current - med) / med)

      // Classification and the emit gate use the ROUNDED pct — the same value the row carries — so a
      // move smaller than half of 1e-4 (~0.005%) rounds to 0 and lands in atOwnMedian: an implicit
      // deadband, accepted for diff-stable committed output.
      comparedCount++
      if (pctVsMedian < 0) belowMedianCount++
      else if (pctVsMedian > 0) aboveMedianCount++
      else atMedianCount++

      // Emit rule (ratified): movers only. An at-own-median series is COUNTED (atMedianCount →
      // envelope excluded[] as `atOwnMedian`) but not emitted, keeping the artifact bounded.
      if (pctVsMedian !== 0) {
        rows.push({
          dispensaryId: product.dispensaryId,
          productId: product.productId,
          name: product.name,
          category: product.category,
          option,
          currentPrice: round4(current),
          medianPrice: med,
          pctVsMedian,
          observedDays: observedValues.length,
        })
      }
    }
  }

  // Stable output for clean daily diffs: deepest honest discount first, then a deterministic tiebreak.
  rows.sort(
    (a, b) =>
      a.pctVsMedian - b.pctVsMedian ||
      (a.dispensaryId < b.dispensaryId ? -1 : a.dispensaryId > b.dispensaryId ? 1 : 0) ||
      (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0) ||
      (a.option < b.option ? -1 : a.option > b.option ? 1 : 0),
  )

  return {
    rows,
    totalProducts: products.length,
    totalSeries,
    comparedCount,
    belowMedianCount,
    aboveMedianCount,
    atMedianCount,
    belowFloorCount,
    noObservationTodayCount,
    noUsablePriceCount,
  }
}
