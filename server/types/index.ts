import type { Deal } from '../../client/src/types/index.js'

export type ScraperResult = Deal[]

// Push-ingest contract (ADR-034 Goal A). One store's scraped result, POSTed to
// /api/ingest by the GitHub Actions runner. `IngestResult` is the per-store
// outcome surfaced back: 'ok' (deals applied), 'stale' (empty/invalid — good
// data kept), 'unknown' (no such dispensary in data.json).
export interface IngestEntry {
  dispensaryId: string
  deals: Deal[]
}

export type IngestResult = 'ok' | 'stale' | 'unknown'

export type LogEntry = string // "ok" | `error: ${string}`

export interface LogRun {
  runAt: string
  results: Record<string, LogEntry>
}
