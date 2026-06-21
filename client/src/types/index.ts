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
  // Optional enrichment, NOT a visibility gate (ADR-043). A store renders on its
  // own validity; distance/gas only appear when this is a finite number. The 4
  // seed stores carry a fixed-origin value (ADR-008, retired in Deliverable 2);
  // push-ingested Dutchie stores have none until D2 geocodes them.
  distanceMiles?: number
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
  nationalMpg: number
  gasPriceUpdatedAt: string
}

export interface ApiDataResponse {
  meta: Meta
  dispensaries: Dispensary[]
}
