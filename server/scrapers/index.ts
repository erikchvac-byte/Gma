import type { Deal } from '../../client/src/types/index.js'
import remedyTulalipScrape from './remedy-tulalip.js'
import theJointEverettScrape from './the-joint-everett.js'
import jetCannabisEverettScrape from './jet-cannabis-everett.js'
import kush21EverettEvergreenScrape from './kush21-everett-evergreen.js'
import { dutchieScrapers } from './dutchie-stores.js'

export const scrapers: Record<string, () => Promise<Deal[]>> = {
  'remedy-tulalip': remedyTulalipScrape,
  // Dutchie-powered (Story 4.3) — route through the Python Scraper microservice.
  // the-joint-everett ships with a confirmed embed id; jet + kush21 report stale
  // until their embed ids are resolved in the deferred live pass.
  'the-joint-everett': theJointEverettScrape,
  'jet-cannabis-everett': jetCannabisEverettScrape,
  'kush21-everett-evergreen': kush21EverettEvergreenScrape,
  // Batch-resolved Dutchie stores (2026-06-21), id === embed cName. See
  // dutchie-stores.ts. Each needs a matching dispensary record in data.json.
  ...dutchieScrapers,
}

// Single source of truth for the CI scrape matrix (ADR-034 Goal D). The Actions
// workflow's `prepare` job emits these ids (via scripts/printStores.ts) into a
// matrix, so adding a store is a one-line diff to the registry above.
export const storeIds: string[] = Object.keys(scrapers)
