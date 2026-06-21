import type { StoreStatus } from '../../client/src/types/index.js'

// ADR-034 Goal B (re-scoped post-Goal-C): since the in-process scraper was
// retired, Render no longer has an in-process failure signal — the only honest
// signal is ingest staleness. This derives per-store health purely from the last
// successful ingest timestamp (`lastFetchedAt`), set by applyIngest on a good push.
//
// Freshness window: the scrape-ingest GitHub Actions cron runs hourly, so we
// allow one fully-missed run plus CI duration and clock skew before a store reads
// `stale` — hence 3× the cron interval. Single named constant, documented here.
export const STORE_FRESHNESS_WINDOW_MS = 3 * 60 * 60 * 1000

// Pure status predicate (mirrors the ADR-026 filterActiveDeals pattern): `now` is
// a parameter so the core never reads the clock when injected; the default exists
// only for production callers.
//
// Honest Math (ADR-007/009): a store with no parseable ingest timestamp must read
// `failed`, never silently `ok`. Malformed input (null/undefined/non-string/NaN/
// unparseable date) fails open to `failed` — never `ok`. A future timestamp
// (clock skew) counts as freshly ingested → `ok`.
export function deriveStoreStatus(
  lastFetchedAt: unknown,
  now: Date = new Date(),
): StoreStatus {
  if (typeof lastFetchedAt !== 'string' || lastFetchedAt.trim() === '') return 'failed'
  const fetchedMs = Date.parse(lastFetchedAt)
  if (Number.isNaN(fetchedMs)) return 'failed'
  const ageMs = now.getTime() - fetchedMs
  return ageMs <= STORE_FRESHNESS_WINDOW_MS ? 'ok' : 'stale'
}
