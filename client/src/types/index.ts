export interface Deal {
  type: 'happy_hour' | 'daily'
  description: string
  discountPct: number | null
  startTime: string | null
  endTime: string | null
  daysValid: string[]
  // The provider's special "kind" when it is NOT the default flat `sale` (Dutchie
  // GetSpecialMenuCards.specialType). Currently only `bogo` (buy-one-get-one) is
  // acted on — it renders a distinct BOGO badge instead of a flat "N% off" that
  // would over-state the deal. Omitted for plain sales and non-Dutchie sources.
  specialType?: string
  // Raw provider-authored body text (Dutchie GetSpecialMenuCards.menuDisplayDescription),
  // sanitized like `description` but NOT displayed yet — captured to study how often /
  // what stores populate it before deciding to surface it (investigation 2026-07-02).
  // Omitted when the provider left it empty (the overwhelming majority of cards).
  providerNote?: string
}

// Per-store ingest health (ADR-034 Goal B), derived server-side from
// `lastFetchedAt` relative to now (see server/utils/storeStatus.ts):
//   ok     — ingested within the freshness window
//   stale  — last ingest is older than the window
//   failed — never successfully ingested (missing/malformed timestamp)
// Distinct from the `stale` boolean below, which flags an empty/rejected push
// (ADR-026); `status` reflects ingest recency. Honest Math (ADR-007/009): a
// store that has never ingested must read `failed`, never `ok`.
export type StoreStatus = 'ok' | 'stale' | 'failed'

export interface Dispensary {
  id: string
  name: string
  url: string
  // Real store street address, committed into data.json (sourced from the cited
  // geocodeStores.ts STORE_ADDRESSES map). Additive optional enrichment like
  // `lat`/`lng`/`status` — NOT a visibility gate (ADR-043): rendered only when a
  // non-empty string is present, never fabricated (Honest Math, ADR-007/009).
  address?: string
  // Optional enrichment, NOT a visibility gate (ADR-043). A store renders on its
  // own validity; distance/gas only appear when this is a finite number. The 4
  // seed stores carry a fixed-origin value (ADR-008, retired in Deliverable 2);
  // push-ingested Dutchie stores have none until D2 geocodes them.
  distanceMiles?: number
  // Real store coordinates, populated by the dev-time geocode script
  // (server/scripts/geocodeStores.ts, OpenStreetMap Nominatim) and committed
  // into data.json. Additive optional enrichment like `status` — no consumer
  // reads them yet; deferred #3 (live user-relative distance/sort) and #4
  // (centroid cold-start) are the consumers. Absent until geocoded. (ADR-044)
  lat?: number
  lng?: number
  stale: boolean
  lastFetchedAt: string
  // Always emitted by GET /api/data; optional so pre-Goal-B fixtures/payloads
  // (and the client, which does not yet consume it) remain type-compatible.
  status?: StoreStatus
  deals: Deal[]
}

export interface Meta {
  lastScraperRun: string
  gasPrice: number
  gasPriceUpdatedAt: string
}

// Resolved user location, persisted in localStorage (`gma_location`) and
// validated at the use site (useLocation) — mirrors the `gma_vehicle_mpg`
// pattern. `source` records how it was set: one-tap device GPS (exact, any
// coords) or a recognized WA ZIP centroid. Distance/gas are computed only when
// a valid location is present (Honest Math, ADR-007/009) — there is no
// fixed-origin fallback (ADR-008/011 retired).
export interface UserLocation {
  lat: number
  lng: number
  source: 'gps' | 'zip'
  // the 5-digit ZIP the user entered (source 'zip' only) so the UI can echo the
  // active area back — makes a wrong/auto-filled ZIP visible. Optional for
  // backward compatibility with already-stored locations.
  zip?: string
}

export interface ApiDataResponse {
  meta: Meta
  dispensaries: Dispensary[]
}

// derivation-3.2 — one row of the price-vs-own-median flagship fact, as consumed by the in-app
// "Real price drops" surface. Mirrors server/utils/priceVsOwnMedian.ts `PriceVsOwnMedianRow` (the
// client validates the served envelope into this shape). `pctVsMedian` = (current − median) /
// median; NEGATIVE = below the SKU's own rolling median = the one honest discount the engine can
// compute (Gate 2). There is NO banner/product discount % on this row by construction — a flat
// promo rate carries no per-item signal and must never reach this surface. The row carries only
// `dispensaryId`; the store display name is joined from the loaded dispensary list at render.
export interface PriceDropRow {
  dispensaryId: string
  productId: string
  name: string
  category: string
  option: string
  currentPrice: number
  medianPrice: number
  pctVsMedian: number
}
