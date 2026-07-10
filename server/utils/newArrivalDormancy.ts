import { walkPresenceAwareSeries, toCalendarDay } from './presenceAwareSeries.js'
import type { ProductObservation, ProductsFile } from '../types/index.js'
import type { StoreHealthStatus } from './extractionHealth.js'

// ADR-077 derivation-1.7 (D3/FR10, Gate 4) — the LAST and MOST DANGEROUS Tier-1 fact. A per-run
// catalog-presence feed of genuinely-new SKUs (first-ever observation today) and newly-DORMANT SKUs
// (absent from a store's recent scrape-runs). It is a CATALOG-PRESENCE fact only: identity + event
// dates. There is deliberately NO price / specialPrice / basePrice / discount / thc / weight field
// anywhere in the output (Gates 1/2/5 satisfied by omission) — this reports THAT a SKU appeared or
// went quiet, never how good a deal it is or whether it was truly removed.
//
// Two honesty guards make an absence→delisting read safe (a naive version is a liability — the live
// data during story-creation had an active ~2-day Dutchie outage that a naive feed would have
// mis-read as ~2,765 SKUs "delisted"):
//   1. STORE-HEALTH GATE (AC2, consumes 1.2.5) — dormancy is computed ONLY for stores whose
//      extraction-health status is `ok`. A `suspected-extraction-failure` or `insufficient-history`
//      store contributes ZERO dormant SKUs; its absent SKUs are suppressed and counted. This module
//      does NOT re-derive health — the caller passes in the already-computed statuses. This also
//      self-protects against the "derived before today's scrape finished" race: an un-scraped store
//      is not `ok`, so its SKUs are suppressed, not false-fired.
//   2. ≥2-RUN DORMANCY FLOOR + PERMANENT AMBIGUITY FLAG (AC1, Gate 4) — a single absent run is
//      overwhelmingly churn (live-measured 29.4% "back tomorrow"), so dormancy needs absence from
//      the store's DORMANCY_MIN_ABSENT_RUNS most-recent scrape-RUNS (counted in runs the store
//      actually produced data on, NOT calendar days — robust to store holes), and every emitted
//      DormantSku carries `missedScrapeAmbiguity: true`. The fact reports SUSPECTED dormancy, never
//      asserts removal.
//
// Per-SKU, gap-tolerant via the 1.2 helper (Gate 3), structurally the sibling of specialEvents.ts:
// a store-wide extraction gap shows up as 'gap' for every affected product, never a fabricated new
// arrival, and a product whose entire history postdates `today` is treated as a gap (same try/catch).

// The dormancy floor: a SKU must be absent from the store's >=2 most-recent scrape-runs before it is
// emitted dormant. Grounded on the live reappearance split (measured 2026-07-10 on the healthy
// window): of present->absent gap-starts, 29.4% reappear after just 1 absent day, +6.7% after 2 —
// so a 1-run absence is dominated by churn, and >=2 clears that bucket. Named + tunable (a more
// conservative 3 trades latency for fewer, higher-confidence dormancies).
export const DORMANCY_MIN_ABSENT_RUNS = 2

// Identity + event only — NO price/discount/potency/weight field (Gates 1/2/5 by omission).
export interface NewArrival {
  dispensaryId: string
  productId: string
  name: string
  category: string
  firstSeen: string // === today
}

export interface DormantSku {
  dispensaryId: string
  productId: string
  name: string
  category: string
  lastSeen: string // date of its last real observation
  absentRuns: number // # of the store's most-recent scrape-runs it is missing from (>= DORMANCY_MIN_ABSENT_RUNS)
  missedScrapeAmbiguity: true // ALWAYS true — never a certain-delisting claim (Gate 4, AC1)
}

export interface NewArrivalDormancyReport {
  newArrivals: NewArrival[] // sorted by dispensaryId, then productId
  dormant: DormantSku[] // sorted by dispensaryId, then productId
  totalProducts: number
  newArrivalCount: number
  dormantCount: number
  suppressedUnhealthyStoreCount: number // SKUs absent-today at a non-ok store, NOT emitted (AC2, FR7)
  belowThresholdCount: number // SKUs absent < DORMANCY_MIN_ABSENT_RUNS at an ok store (churn), NOT emitted (AC1, FR7)
  onboardingStoreArrivalCount: number // first-today SKUs suppressed as store-onboarding (AC3, FR7)
}

// Distinct calendar days each store produced >=1 observation, ascending. This is the store's
// "scrape-run" axis: a day with no store data is NOT a run and must never count as a confirmed
// SKU absence (the calendar-vs-runs distinction the ≥2-run floor depends on).
function buildStoreActiveDays(productsFile: ProductsFile): Map<string, string[]> {
  const daysByStore = new Map<string, Set<string>>()
  for (const rec of Object.values(productsFile.products)) {
    let set = daysByStore.get(rec.dispensaryId)
    if (!set) {
      set = new Set<string>()
      daysByStore.set(rec.dispensaryId, set)
    }
    for (const obs of rec.history) set.add(toCalendarDay(obs.observedAt))
  }
  const sorted = new Map<string, string[]>()
  for (const [id, set] of daysByStore) sorted.set(id, [...set].sort())
  return sorted
}

export function buildNewArrivalDormancyReport(
  productsFile: ProductsFile,
  storeStatus: Map<string, StoreHealthStatus>,
  today: string,
): NewArrivalDormancyReport {
  const storeActiveDays = buildStoreActiveDays(productsFile)

  const newArrivals: NewArrival[] = []
  const dormant: DormantSku[] = []
  let suppressedUnhealthyStoreCount = 0
  let belowThresholdCount = 0
  let onboardingStoreArrivalCount = 0

  for (const rec of Object.values(productsFile.products)) {
    let walk
    try {
      walk = walkPresenceAwareSeries(rec.history, {
        // Presence-only: the value is irrelevant (we only read 'gap' vs 'first' vs observed), so a
        // constant keeps every non-first day 'unchanged'. Gate 3 comes from the helper: a missing
        // day is 'gap', never a fabricated observation.
        getObservedAt: (o: ProductObservation) => o.observedAt,
        getValue: () => true,
        endDate: today,
      })
    } catch {
      // Entire history postdates `today` (clock skew / bad observedAt) → the helper's default
      // startDate lands after endDate and throws. Treat as a gap: count nothing, don't abort the
      // run (same guard specialEvents.ts uses).
      continue
    }

    // The product's own observed days within [earliest .. today], ascending. Empty ⇒ no presence at
    // or before today (empty history) ⇒ nothing to say.
    const observedDays = walk.filter((e) => e.status !== 'gap').map((e) => e.date)
    if (observedDays.length === 0) continue

    const todayEntry = walk.find((e) => e.date === today)

    // NEW ARRIVAL — first-EVER observation is today ('first' at the today entry). The one noise
    // source is store onboarding: on a store's first day in our dataset every SKU is 'first'.
    if (todayEntry?.status === 'first') {
      const storeDays = storeActiveDays.get(rec.dispensaryId) ?? []
      const storeEarliest = storeDays[0]
      // Store observed on some day BEFORE today ⇒ a genuine per-SKU new arrival at an established
      // store. Store's earliest day IS today ⇒ store-onboarding wave, suppressed and counted (AC3).
      if (storeEarliest !== undefined && storeEarliest < today) {
        newArrivals.push({
          dispensaryId: rec.dispensaryId,
          productId: rec.productId,
          name: rec.name,
          category: rec.category,
          firstSeen: today,
        })
      } else {
        onboardingStoreArrivalCount++
      }
      continue
    }

    // Observed today but not first ⇒ an established, still-present SKU. No event.
    if (todayEntry && todayEntry.status !== 'gap') continue

    // DORMANCY CANDIDATE — not observed today, and (observedDays non-empty ⇒) has >=1 prior
    // observation. Store-health gate first: only `ok` stores may contribute dormancy (AC2).
    if (storeStatus.get(rec.dispensaryId) !== 'ok') {
      suppressedUnhealthyStoreCount++
      continue
    }

    // Count absent store-RUNS (not calendar days): walk the store's most-recent scrape-runs ending
    // at today, backwards, until the run where this SKU was last present. For an `ok` store today is
    // always a run (extraction-health flags a null-today store suspected, so it never reaches here).
    const runs = (storeActiveDays.get(rec.dispensaryId) ?? []).filter((d) => d <= today)
    const productDays = new Set(observedDays)
    let absentRuns = 0
    for (let i = runs.length - 1; i >= 0; i--) {
      if (productDays.has(runs[i])) break
      absentRuns++
    }

    if (absentRuns >= DORMANCY_MIN_ABSENT_RUNS) {
      dormant.push({
        dispensaryId: rec.dispensaryId,
        productId: rec.productId,
        name: rec.name,
        category: rec.category,
        lastSeen: observedDays[observedDays.length - 1],
        absentRuns,
        missedScrapeAmbiguity: true,
      })
    } else {
      // Absent from fewer than the floor's worth of runs (dominant one-run churn) — counted, not
      // emitted (AC1, Gate 4).
      belowThresholdCount++
    }
  }

  const byStoreThenProduct = <T extends { dispensaryId: string; productId: string }>(a: T, b: T) =>
    a.dispensaryId === b.dispensaryId
      ? a.productId < b.productId
        ? -1
        : a.productId > b.productId
          ? 1
          : 0
      : a.dispensaryId < b.dispensaryId
        ? -1
        : 1
  newArrivals.sort(byStoreThenProduct)
  dormant.sort(byStoreThenProduct)

  return {
    newArrivals,
    dormant,
    totalProducts: Object.keys(productsFile.products).length,
    newArrivalCount: newArrivals.length,
    dormantCount: dormant.length,
    suppressedUnhealthyStoreCount,
    belowThresholdCount,
    onboardingStoreArrivalCount,
  }
}
