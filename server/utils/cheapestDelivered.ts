import type { Disparity } from '../types/index.js'
import type { StoreGeoLookup } from './disparityRollups.js'

// derivation-2.2 — cheapest-DELIVERED INPUT fact (D7 / FR14). The structural twin of 1.4
// (disparityRollups.ts): a PURE consumer of the already-computed disparity oracle
// (`report.disparities` from buildMatchReport) plus the already-built `StoreGeoLookup`. It does
// NO new derivation — no product grouping, no match-key derivation, no weight parsing, no price
// reduction (FR14: "not new derivation"). All of that ran once, upstream, inside buildMatchReport.
//
// WHY INPUTS, NOT A WINNER (ADR-057): cheapest-*delivered* depends on where the shopper is — a
// farther store with a lower shelf price may or may not win once round-trip gas is added — so this
// layer MUST NOT pre-pick a winner or bake in any origin/distance/gas. It emits every qualifying
// store's real price + that store's committed coordinates, per like-for-like cell; the client
// composes the delivered comparison downstream with the existing `roundTripGasCost` against the
// user's own location (client/src/utils/gasCost.ts — NEVER imported or called here).
//
// GATES ARE INHERITED, NOT RE-IMPLEMENTED. A `Disparity` is BY CONSTRUCTION a same-product,
// same-canonical-weight, ≥2-distinct-store cell whose per-store `price` is the reduced
// `specialPrice ?? basePrice` with reported-sold-out already excluded (crossStoreValue.ts gates
// 1–5, EXCLUDED_FLAGS, canonicalWeightGrams mg/count protection). Consuming that output means Gate
// 1, the weight gates, and the sold-out drop all hold by inheritance — this module imports NO
// weight parser and re-parses NO option label. `pricePerGram` is honest ONLY because `weightGrams`
// is the upstream-gated canonical weight that already survived WEIGHT_BASED_CATEGORIES +
// EXCLUDED_FLAGS + canonicalWeightGrams (the exact inverse of 2.1, which avoided the parser because
// it made no weight claim; 2.2 relies on the parser's output but only through the gated field).
//
// FR16 type-gate is satisfied STRUCTURALLY by reusing the shared `Disparity`/`DisparityStore`
// type: it carries no base/special pair, no discount %, no potency — the decision-F narrowing was
// done once, upstream. A compile-level @ts-expect-error test asserts those fields are unreachable.

export interface DeliveredStoreOffer {
  dispensaryId: string
  price: number
  pricePerGram: number
  lat: number | null
  lng: number | null
}

export interface DeliveredCell {
  matchKey: string
  displayName: string
  category: string
  weightGrams: number
  storeOffers: DeliveredStoreOffer[]
}

export interface CheapestDeliveredReport {
  cells: DeliveredCell[]
  totalCells: number
  totalStoreOffers: number
  offersWithGeo: number
  missingGeoCount: number
}

// 4dp keeps $/gram diff-stable across daily runs without lying about precision. Only pricePerGram
// is rounded here; `price` is passed through from the Disparity unchanged so 2.2's numbers
// reconcile byte-for-byte against disparities.json.
function r4(x: number): number {
  return Math.round(x * 10000) / 10000
}

export function buildCheapestDeliveredReport(
  disparities: Disparity[],
  geoLookup: StoreGeoLookup,
): CheapestDeliveredReport {
  let totalStoreOffers = 0
  let offersWithGeo = 0
  let missingGeoCount = 0

  const cells: DeliveredCell[] = disparities.map((d) => {
    const storeOffers: DeliveredStoreOffer[] = d.storesCarrying.map((s) => {
      const geo = geoLookup.get(s.dispensaryId)
      totalStoreOffers++
      if (geo) offersWithGeo++
      else missingGeoCount++
      return {
        dispensaryId: s.dispensaryId,
        price: s.price, // verbatim reduced specialPrice ?? basePrice (Gate 3, sold-out already dropped)
        pricePerGram: r4(s.price / d.weightGrams), // weightGrams > 0 by construction; the divisor is the already-gated canonical weight
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      }
    })
    // Cheapest-shelf-first ordering is a deterministic-diff convenience ONLY — it carries NO
    // delivered-winner claim (the delivered winner is user-location-dependent; that is the fact).
    storeOffers.sort((a, b) => a.price - b.price || a.dispensaryId.localeCompare(b.dispensaryId))
    return {
      matchKey: d.matchKey,
      displayName: d.displayName,
      category: d.category,
      weightGrams: d.weightGrams,
      storeOffers,
    }
  })

  cells.sort((a, b) => a.matchKey.localeCompare(b.matchKey) || a.weightGrams - b.weightGrams)

  return { cells, totalCells: cells.length, totalStoreOffers, offersWithGeo, missingGeoCount }
}
