import type { Disparity } from '../types/index.js'
import type { Dispensary } from '../../client/src/types/index.js'
import type { WeedmapsStore } from '../scrapers/weedmaps-stores.js'

// derivation-1.4 — rollups over the already-computed cross-store disparities (decision A: a
// SEPARATE artifact, never a mutation of disparities.json, so the 1.1 oracle stays valid).
// Pure grouping/counting over `Disparity[]` — no new price-derivation logic (FR11: "not new
// derivation"). Two dimensions only: category (a direct `Disparity` field) and store/geo
// (via `storesCarrying[].dispensaryId`). Brand is deliberately NOT a dimension here — the
// shared brand-key normalizer belongs to Story 1.5/1.6 (decision B); `Disparity` carries no
// brand field, and reverse-parsing it out of `matchKey` would lean on an internal identity-key
// format never intended as a public parse contract (see story Grounding).

export interface CategoryRollup {
  category: string
  disparityCount: number
  avgSpreadPct: number
  distinctStoresInvolved: number
}

export interface StoreRollup {
  dispensaryId: string
  lat: number | null
  lng: number | null
  disparityCount: number
  timesCheapest: number
  timesPriciest: number
}

export interface DisparityRollupsReport {
  byCategory: CategoryRollup[]
  byStore: StoreRollup[]
  totalDisparities: number
  missingGeoCount: number
}

function r2(x: number): number {
  return Math.round(x * 100) / 100
}

// Geo is resolved by the caller (deriveFactsRun.ts merges data.json's public dispensaries with
// the private WEEDMAPS_STORES registry — see buildStoreGeoLookup) and passed in already-built,
// mirroring the 1.2.5 pattern of taking a pre-built lookup/roster rather than importing a
// registry inside the pure fact module (keeps this module trivially unit-testable with a plain
// fixture Map). A `dispensaryId` absent from the map, or mapped to `null`, means "no resolvable
// geo" — never silently defaulted, always counted in `missingGeoCount`.
export type StoreGeoLookup = Map<string, { lat: number; lng: number } | null>

// Merge the two dispensary-geo sources so a rollup's store dimension can carry lat/lng for
// EVERY store that actually carries a disparity — not just the ones in the public data.json
// list. Grounding (story-creation): 7 of the 21 live stores carrying disparities are Weedmaps-
// only private-registry stores absent from data.json entirely (data.json intentionally excludes
// them — see weedmaps-stores.ts's own header). A geo lookup built from data.json alone would
// silently under-cover a third of stores. Precedence: a non-overlap WEEDMAPS_STORES entry's own
// committed coords win; an overlap entry (same physical store already in data.json) has no
// coords of its own by design and falls through to data.json; anything in neither source maps
// to `null` (never omitted, never defaulted to 0,0 — the caller counts nulls in
// `missingGeoCount`).
export function buildStoreGeoLookup(
  dispensaries: Dispensary[],
  weedmapsStores: WeedmapsStore[],
): StoreGeoLookup {
  const byId = new Map<string, { lat: number; lng: number } | null>()
  for (const d of dispensaries) {
    byId.set(d.id, typeof d.lat === 'number' && typeof d.lng === 'number' ? { lat: d.lat, lng: d.lng } : null)
  }
  for (const w of weedmapsStores) {
    if (!w.overlap && typeof w.lat === 'number' && typeof w.lng === 'number') {
      byId.set(w.dispensaryId, { lat: w.lat, lng: w.lng })
    } else if (!byId.has(w.dispensaryId)) {
      byId.set(w.dispensaryId, null)
    }
  }
  return byId
}

export function buildDisparityRollups(
  disparities: Disparity[],
  geoLookup: StoreGeoLookup,
): DisparityRollupsReport {
  const categoryAgg = new Map<
    string,
    { disparityCount: number; spreadPctSum: number; stores: Set<string> }
  >()
  const storeAgg = new Map<
    string,
    { disparityCount: number; timesCheapest: number; timesPriciest: number }
  >()

  for (const d of disparities) {
    const cat = categoryAgg.get(d.category) ?? { disparityCount: 0, spreadPctSum: 0, stores: new Set() }
    cat.disparityCount++
    cat.spreadPctSum += d.spreadPct
    for (const s of d.storesCarrying) cat.stores.add(s.dispensaryId)
    categoryAgg.set(d.category, cat)

    // Only a row with a REAL spread has a meaningful cheapest/priciest. On a zero-spread row
    // (every store tied at one price — 47% of live rows, since the oracle emits a disparity for
    // any ≥2-store group with no spread filter) `price === lowPrice` AND `price === highPrice`
    // are both true, so crediting either would count every tied store as both cheapest AND
    // priciest — inflating the counters up to ~13× and lying about who actually undercut whom
    // (review 2026-07-09). A tie is not an actionable cheapest/priciest, so it counts toward
    // neither; the store still appears in `disparityCount` (it genuinely carries the row).
    const hasSpread = d.highPrice > d.lowPrice
    for (const s of d.storesCarrying) {
      const store = storeAgg.get(s.dispensaryId) ?? { disparityCount: 0, timesCheapest: 0, timesPriciest: 0 }
      store.disparityCount++
      if (hasSpread && s.price === d.lowPrice) store.timesCheapest++
      if (hasSpread && s.price === d.highPrice) store.timesPriciest++
      storeAgg.set(s.dispensaryId, store)
    }
  }

  const byCategory: CategoryRollup[] = [...categoryAgg.entries()].map(([category, agg]) => ({
    category,
    disparityCount: agg.disparityCount,
    avgSpreadPct: r2(agg.spreadPctSum / agg.disparityCount),
    distinctStoresInvolved: agg.stores.size,
  }))

  let missingGeoCount = 0
  const byStore: StoreRollup[] = [...storeAgg.entries()].map(([dispensaryId, agg]) => {
    const geo = geoLookup.get(dispensaryId)
    if (!geo) missingGeoCount++
    return {
      dispensaryId,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      disparityCount: agg.disparityCount,
      timesCheapest: agg.timesCheapest,
      timesPriciest: agg.timesPriciest,
    }
  })

  return { byCategory, byStore, totalDisparities: disparities.length, missingGeoCount }
}
