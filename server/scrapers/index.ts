import type { DealScrapeOutcome } from '../types/index.js'
import remedyTulalipScrape from './remedy-tulalip.js'
import theJointEverettScrape from './the-joint-everett.js'
import jetCannabisEverettScrape from './jet-cannabis-everett.js'
import kush21EverettEvergreenScrape from './kush21-everett-evergreen.js'
import happyTimeMtVernonScrape from './happy-time-mt-vernon.js'
import starbudsBellinghamScrape from './starbuds-bellingham.js'
import { dutchieScrapers } from './dutchie-stores.js'

// Registry contract (ADR-083): scrape() never throws and resolves to a
// DealScrapeOutcome — `confirmedEmpty: true` only on positive zero-specials
// evidence; failure-shaped empties stay unconfirmed (→ stale downstream).
export const scrapers: Record<string, () => Promise<DealScrapeOutcome>> = {
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
  // OVERRIDE (prototype 2026-07-17): happy-time-mt-vernon runs no Dutchie specials
  // (confirmed-empty menuCards), so its DEALS come from the store's own site
  // instead of the empty Dutchie specials path. Placed AFTER the spread so this
  // key wins. Its Dutchie PRODUCT-pricing scrape (dutchie-stores.ts) is untouched.
  'happy-time-mt-vernon': happyTimeMtVernonScrape,
  // OVERRIDE (prototype 2026-07-17): starbuds-bellingham's online menu IS the same
  // confirmed-empty Dutchie embed the shared path scrapes, so the store showed no
  // card. Its one off-Dutchie offer ("Shop online for 10% off") lives only on the
  // store's own page. Placed AFTER the spread so this key wins; falls back to the
  // Dutchie floor when the site yields nothing. Its Dutchie PRODUCT scrape is untouched.
  'starbuds-bellingham': starbudsBellinghamScrape,
}

// Single source of truth for the CI scrape matrix (ADR-034 Goal D). The Actions
// workflow's `prepare` job emits these ids (via scripts/printStores.ts) into a
// matrix, so adding a store is a one-line diff to the registry above.
export const storeIds: string[] = Object.keys(scrapers)
