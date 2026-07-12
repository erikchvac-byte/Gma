import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { atomicWriteJson } from './atomicWrite.js'
import { withDataLock } from './dataStore.js'
import { normalizeDeals } from './normalizeDeals.js'
import type { ApiDataResponse } from '../../client/src/types/index.js'
import type { IngestEntry, IngestResult } from '../types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_PATH = path.join(__dirname, '../data/data.json')

// Push-ingest counterpart to runScrapers (ADR-034 Goal A): applies externally
// scraped deals pushed via POST /api/ingest into data.json. Mirrors runScrapers'
// per-dispensary last-known-good semantics — empty/invalid input never overwrites
// good data (the source is only flagged stale) — with ONE exception (ADR-083): an
// entry carrying `confirmedEmpty: true` is positive evidence the store legitimately
// has zero specials, so its deals are CLEARED and freshness advances instead of
// freezing stale forever. Only updates EXISTING dispensaries, matched by id via
// .find (never indexes by a request-supplied key → prototype-pollution safe).
// Serialized against every other data.json writer via withDataLock; published
// atomically.
export async function applyIngest(
  entries: IngestEntry[],
  dataPath: string = DEFAULT_DATA_PATH,
): Promise<Record<string, IngestResult>> {
  return withDataLock(() => {
    const file: ApiDataResponse = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const results: Record<string, IngestResult> = {}
    const now = new Date().toISOString()
    let mutated = 0
    let accepted = 0

    for (const entry of entries) {
      const dispensary = file.dispensaries.find((d) => d.id === entry.dispensaryId)
      if (dispensary === undefined) {
        results[entry.dispensaryId] = 'unknown'
        continue
      }

      // normalize at the ingestion chokepoint (same guard runScrapers uses) so
      // junk never reaches data.json or filterActiveDeals
      const deals = normalizeDeals(entry.deals)
      if (deals.length > 0) {
        dispensary.deals = deals
        dispensary.lastFetchedAt = now
        dispensary.stale = false
        results[entry.dispensaryId] = 'ok'
        accepted++
      } else if (entry.confirmedEmpty === true) {
        // ADR-083: the scraper PROVED the store has zero specials (strict `=== true`
        // — anything else from the wire is not evidence). Clearing is real data:
        // stale deals drop, freshness advances, the store reads `ok` downstream.
        dispensary.deals = []
        dispensary.lastFetchedAt = now
        dispensary.stale = false
        results[entry.dispensaryId] = 'empty'
        accepted++
      } else {
        // never overwrite good data with empty/invalid: deals + lastFetchedAt
        // intentionally untouched, source flagged stale (mirrors runScrapers)
        dispensary.stale = true
        results[entry.dispensaryId] = 'stale'
      }
      mutated++
    }

    if (mutated > 0) {
      // refresh the run marker only when something was actually ingested, so
      // /api/data freshness reflects real data, not a rejected/empty push
      if (accepted > 0) file.meta.lastScraperRun = now
      atomicWriteJson(dataPath, file)
    }
    return results
  })
}
