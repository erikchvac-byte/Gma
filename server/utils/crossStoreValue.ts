import { canonicalWeightGrams, deriveMatchKey } from './productMatchKey.js'
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
//  1. Records flagged weight-mismatch / unparseable-weight / unparseable-pack are
//     EXCLUDED entirely — their weight is untrustworthy, so any comparison built on it
//     would lie (AC3/AC5).
//  2. Only the SAME canonical weight is compared (an eighth to an eighth). The engine
//     never compares across weights and never builds a whole-catalog $/gram leaderboard
//     (that structurally surfaces trim every time — forbidden, AC4).
//  3. Price is the real price paid: latest observation's specialPrice ?? basePrice —
//     never a discount %, which fix6 proved carries no per-item signal.
//  4. A reported sold-out offer (quantityAvailable <= 0) is excluded from the price
//     comparison — an unbuyable price must not set the headline low or inflate spread.

// Per-record flags that poison weight-based comparison. A record carrying ANY of these
// is dropped from disparity output (and counted in the report).
export const EXCLUDED_FLAGS = new Set(['weight-mismatch', 'unparseable-weight', 'unparseable-pack'])

function r2(x: number): number {
  return Math.round(x * 100) / 100
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
  // records that contributed ≥1 priced option to a group (whether or not it reached ≥2 stores)
  placedRecords: number
}

// Build the full match report: disparities plus the bookkeeping AC5 requires (every
// record the matcher cannot place is counted, never silently dropped).
export function buildMatchReport(file: ProductsFile): MatchReport {
  const records = Object.values(file.products)
  const groups = new Map<string, Group>()
  let unmatchedCount = 0
  let excludedFlagCount = 0
  let placedRecords = 0

  for (const rec of records) {
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
    placedRecords,
  }
}

// The disparity dataset (AC2). Thin wrapper over buildMatchReport for consumers that
// only need the rows (e.g. the private route).
export function buildDisparities(file: ProductsFile): Disparity[] {
  return buildMatchReport(file).disparities
}
