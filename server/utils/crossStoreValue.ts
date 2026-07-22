import { canonicalWeightGrams, deriveMatchKey } from './productMatchKey.js'
import { WEIGHT_BASED_CATEGORIES } from './normalizeProduct.js'
import type {
  Disparity,
  DisparityStore,
  ProductsFile,
} from '../types/index.js'

// Cross-store disparity engine (SPEC ai-search-data-strategy, Tier A item A1). A pure,
// read-only consumer of the committed ProductsFile: it groups products by (identity,
// canonical weight) and emits a price-disparity fact for every like-for-like group
// carried by ≥2 distinct stores. Never mutates anything, never touches Deal/data.json.
//
// HONESTY GATES (the integrity that IS the product's moat — value-analysis §4, fix6):
//  1. Records flagged weight-mismatch / unparseable-weight / unparseable-pack /
//     unreconciled-pack are EXCLUDED entirely — their weight is untrustworthy, so any
//     comparison built on it would lie (AC3/AC5). 'unreconciled-pack' marks a multi-option
//     pack whose per-unit vs total weight could not be reconciled (audit 2026-07-05 Finding 2).
//  2. Only the SAME canonical weight is compared (an eighth to an eighth). The engine
//     never compares across weights and never builds a whole-catalog $/gram leaderboard
//     (that structurally surfaces trim every time — forbidden, AC4).
//  3. Price is the real price paid: latest observation's specialPrice ?? basePrice —
//     never a discount %, which fix6 proved carries no per-item signal.
//  4. A reported sold-out offer (quantityAvailable <= 0) is excluded from the price
//     comparison — an unbuyable price must not set the headline low or inflate spread.
//  5. Non-weight-based categories (Edible) never enter weight-keyed groups: their option
//     labels state mg-THC, not product weight, so a "weightGrams" row built from them
//     would lie. Counted, never silent (spec-category-expansion; $/mg is derivation work).
//  6. FRESHNESS (oracle-freshness-gate, promoted from the derivation-2 retro): a record whose
//     LATEST observation is stale relative to the freshest scrape in the dataset is excluded.
//     A store that silently stopped being scraped — a persistent outage (happy-time-mt-vernon),
//     a recurring Dutchie extraction failure, or a SKU that just dropped off the menu — leaves a
//     prior-day price as its latest observation. Without this gate that stale price sets a
//     cross-store low, inflates a spread, or becomes a regional floor, engine-wide (every
//     disparity-derived fact reads report.disparities). The anchor is the GLOBAL max observed
//     day in the dataset, NOT wall-clock today — that is seam-proof (a derive just after 00:00
//     UTC cannot flag the whole fleet stale) and correctly catches a store lagging the fleet
//     (its own latest < the fleet max). FRESHNESS_MAX_LAG_DAYS tolerates ordinary 1-day scrape
//     jitter while catching multi-day staleness. Excluded and counted (staleRecords), never
//     silent. Note this catches a DIFFERENT population than gate 4: a silently-vanished SKU is
//     not flagged quantityAvailable<=0, it simply stops being observed.

// Per-record flags that poison weight-based comparison. A record carrying ANY of these
// is dropped from disparity output (and counted in the report).
export const EXCLUDED_FLAGS = new Set([
  'weight-mismatch',
  'unparseable-weight',
  'unparseable-pack',
  'unreconciled-pack',
])

function r2(x: number): number {
  return Math.round(x * 100) / 100
}

// Gate 6 default: how many days a record's latest observation may lag the freshest scrape in the
// dataset before it is treated as stale. 1 = tolerate ordinary one-day scrape jitter (a SKU that
// missed a single run) while excluding the multi-day staleness that a real outage produces.
// Ratified by Erik 2026-07-21 (oracle-freshness-gate dev-start).
export const FRESHNESS_MAX_LAG_DAYS = 1

// The calendar day (YYYY-MM-DD) of an ISO timestamp, or null if it is not a parseable date.
// A record whose freshness cannot be established is treated as stale (gate 6) — an unprovable
// price must not set a headline. The shape regex alone is not enough: a value like "2026-13-45"
// matches YYYY-MM-DD but is not a real date, and would lexically out-sort every valid day (poisoning
// the anchor) or read as "fresh". So we also require the day to round-trip through a real UTC Date
// (review-hardening 2026-07-21).
function observedDay(iso: string): string | null {
  if (typeof iso !== 'string' || iso.length < 10) return null
  const day = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const d = new Date(`${day}T00:00:00.000Z`)
  // Invalid dates are NaN; a valid-but-normalized date (e.g. "2026-02-31" → Mar 3) must equal its
  // own input, so an impossible calendar day is rejected rather than silently shifted.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day ? day : null
}

// Subtract whole days from a YYYY-MM-DD string, UTC-safe (setUTCDate handles month/year rollover).
function subtractDaysUTC(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// The freshest scrape day present anywhere in the dataset = the max over every record's LATEST
// observation day (history is append-only chronological, so `at(-1)` is each record's newest).
// This is the gate-6 anchor: seam-proof (data-derived, not wall-clock) and fleet-relative, so a
// store lagging the fleet is caught. Null when no record has a parseable observation.
//
// Future-day guard (review-hardening 2026-07-21): a single future-dated observation — clock skew
// or a bad scrape — would otherwise become the max and push the stale threshold past EVERY real
// store's latest day, silently emptying every disparity/floor/rollup (and the zero-collapse guard
// would not catch it, since totalRecords stays pre-gate). So days strictly after `today` (UTC) are
// ignored when picking the max. This is only an UPPER bound: it never touches AC6's lower-seam
// behavior (a just-after-00:00-UTC derive still cannot flag the fleet stale). `today` is a param so
// tests are deterministic; the runner uses the wall-clock default.
export function globalMaxObservedDay(
  file: ProductsFile,
  today: string = new Date().toISOString().slice(0, 10),
): string | null {
  let max: string | null = null
  for (const rec of Object.values(file.products)) {
    const latest = rec.history.at(-1)
    if (!latest) continue
    const day = observedDay(latest.observedAt)
    if (day !== null && day <= today && (max === null || day > max)) max = day
  }
  return max
}

// One store's candidate offer for a (identity, weight) group before per-store reduction.
interface Candidate {
  dispensaryId: string
  price: number
  quantityAvailable: number | null
  name: string
  category: string
}

interface Group {
  weightGrams: number
  candidates: Candidate[]
}

export interface MatchReport {
  disparities: Disparity[]
  totalRecords: number
  unmatchedCount: number
  excludedFlagCount: number
  // records whose category has no honest weight axis (Edible) — collected but never
  // weight-compared (gate 5)
  nonComparableCategoryCount: number
  // records that contributed ≥1 priced option to a group (whether or not it reached ≥2 stores)
  placedRecords: number
  // records excluded by gate 6 because their latest observation is stale (see header)
  staleRecords: number
}

export interface MatchReportOptions {
  // Gate 6 anchor: the "freshest scrape day" a record's latest observation is measured against.
  // Defaults to globalMaxObservedDay(file) — the ratified data-derived, seam-proof anchor. The
  // runner passes it explicitly so the gate is never accidentally off; callers may omit it.
  freshnessAnchor?: string
  // Days of lag tolerated before staleness. Defaults to FRESHNESS_MAX_LAG_DAYS.
  maxLagDays?: number
}

// Build the full match report: disparities plus the bookkeeping AC5 requires (every
// record the matcher cannot place is counted, never silently dropped).
export function buildMatchReport(file: ProductsFile, opts: MatchReportOptions = {}): MatchReport {
  const records = Object.values(file.products)
  const groups = new Map<string, Group>()
  let unmatchedCount = 0
  let excludedFlagCount = 0
  let nonComparableCategoryCount = 0
  let placedRecords = 0
  let staleRecords = 0

  // Gate 6 anchor. When no anchor is given, self-derive the global max observed day — so the
  // gate is ALWAYS active (never silently off), even for a one-arg caller. staleThreshold is the
  // oldest day still considered fresh; a latest-observation day strictly before it is stale.
  //
  // Both option inputs are validated before any date arithmetic (review-hardening 2026-07-21): an
  // explicit freshnessAnchor that is not a real calendar day falls back to the self-derived anchor
  // (rather than crashing subtractDaysUTC with an Invalid Date), and maxLagDays is coerced to a
  // non-negative integer — a NaN would throw in setUTCDate, and a negative value would push the
  // threshold into the future and silently flag the whole fleet stale.
  const explicitAnchor =
    opts.freshnessAnchor === undefined ? null : observedDay(opts.freshnessAnchor)
  const anchor = explicitAnchor ?? globalMaxObservedDay(file)
  const rawLag = opts.maxLagDays ?? FRESHNESS_MAX_LAG_DAYS
  const maxLagDays = Number.isFinite(rawLag) ? Math.max(0, Math.trunc(rawLag)) : FRESHNESS_MAX_LAG_DAYS
  const staleThreshold = anchor === null ? null : subtractDaysUTC(anchor, maxLagDays)

  for (const rec of records) {
    // Gate 5: no honest weight axis for this category (see header). Checked first —
    // it is a scope statement about the category, not a data-quality defect.
    if (!WEIGHT_BASED_CATEGORIES.has(rec.category)) {
      nonComparableCategoryCount++
      continue
    }
    // Gate 1: drop records whose weight is flagged untrustworthy.
    if (rec.flags.some((f) => EXCLUDED_FLAGS.has(f))) {
      excludedFlagCount++
      continue
    }
    const mk = deriveMatchKey(rec)
    if ('unmatched' in mk) {
      unmatchedCount++
      continue
    }
    const latest = rec.history.at(-1)
    if (!latest) continue

    // Gate 6 (freshness): drop a record whose latest observation is stale relative to the
    // dataset's freshest scrape (see header). An unparseable observedAt cannot be proven fresh,
    // so it is treated as stale. Excluded and counted, never silent.
    if (staleThreshold !== null) {
      const day = observedDay(latest.observedAt)
      if (day === null || day < staleThreshold) {
        staleRecords++
        continue
      }
    }

    let placed = false
    for (const opt of latest.options) {
      const weightGrams = canonicalWeightGrams(opt.option) // Gate 2: same-weight only
      if (weightGrams === null) continue
      // Gate 4 (honesty): a known sold-out offer is not a buyable price. Dropping it
      // stops a $0-stock listing from setting a phantom lowPrice and inflating the
      // spread — a disparity must describe savings a shopper can actually act on.
      // quantityAvailable null = unknown stock (scraper didn't report it) and is kept;
      // only a reported quantityAvailable <= 0 is excluded.
      if (opt.quantityAvailable !== null && opt.quantityAvailable <= 0) continue
      const price = opt.specialPrice ?? opt.basePrice // Gate 3: real price paid
      if (price === null || !Number.isFinite(price) || price <= 0) continue

      const key = `${mk.key}@${weightGrams}g`
      const group = groups.get(key) ?? { weightGrams, candidates: [] }
      group.candidates.push({
        dispensaryId: rec.dispensaryId,
        price,
        quantityAvailable: opt.quantityAvailable,
        name: rec.name,
        category: rec.category,
      })
      groups.set(key, group)
      placed = true
    }
    if (placed) placedRecords++
  }

  const disparities: Disparity[] = []
  for (const [key, group] of groups) {
    // Reduce to the cheapest offer per store, then require ≥2 DISTINCT stores.
    const perStore = new Map<string, Candidate>()
    for (const c of group.candidates) {
      const cur = perStore.get(c.dispensaryId)
      if (!cur || c.price < cur.price) perStore.set(c.dispensaryId, c)
    }
    if (perStore.size < 2) continue

    const stores = [...perStore.values()].sort((a, b) => a.price - b.price)
    const lowPrice = stores[0].price
    const highPrice = stores[stores.length - 1].price
    const storesCarrying: DisparityStore[] = stores.map((s) => ({
      dispensaryId: s.dispensaryId,
      price: s.price,
      quantityAvailable: s.quantityAvailable,
    }))

    disparities.push({
      matchKey: key,
      displayName: stores[0].name,
      category: stores[0].category,
      weightGrams: group.weightGrams,
      lowPrice,
      highPrice,
      spread: r2(highPrice - lowPrice),
      spreadPct: r2((highPrice - lowPrice) / lowPrice),
      storesCarrying,
    })
  }

  // Widest relative gap first — the most actionable cross-store savings on top.
  disparities.sort((a, b) => b.spreadPct - a.spreadPct)

  return {
    disparities,
    totalRecords: records.length,
    unmatchedCount,
    excludedFlagCount,
    nonComparableCategoryCount,
    placedRecords,
    staleRecords,
  }
}

// The disparity dataset (AC2). Thin wrapper over buildMatchReport for consumers that
// only need the rows (e.g. the private route).
export function buildDisparities(file: ProductsFile): Disparity[] {
  return buildMatchReport(file).disparities
}
