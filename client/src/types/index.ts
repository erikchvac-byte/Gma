export interface Deal {
  type: 'happy_hour' | 'daily'
  description: string
  discountPct: number | null
  startTime: string | null
  endTime: string | null
  daysValid: string[]
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

export interface ApiDataResponse {
  meta: Meta
  dispensaries: Dispensary[]
}
