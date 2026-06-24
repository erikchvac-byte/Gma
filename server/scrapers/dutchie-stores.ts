import type { Deal } from '../../client/src/types/index.js'
import type { RawProduct } from '../types/index.js'
import { scrapeDutchieSpecials } from './_dutchie.js'
import { scrapeDutchieProducts } from './_dutchieProducts.js'

// Config-driven Dutchie store registration (batch-resolved 2026-06-21). Every
// entry here is a standard Dutchie embed whose store id IS its embed cName, so it
// reuses the shared _dutchie request preset + transform and the scraperClient
// boundary exactly like the hand-written Dutchie store files. Adding a store is a
// one-line diff to this array (ADR-034 Goal D intent).
//
// The three original Dutchie stores (the-joint-everett, jet-cannabis-everett,
// kush21-everett-evergreen) keep their dedicated files — their ids diverge from
// their embed cNames for historical reasons (resolved in the 4.3 live pass).
export const DUTCHIE_STORE_IDS = [
  'happy-time-mt-vernon',
  'cannazone-old-hwy-99',
  'sweet-relief-mt-vernon',
  'cannazone-mt-vernon',
  'the-vault-silvana',
  'bud-hut-camano-island',
  'kushmart-north',
  'local-roots-everett-128th',
  'kushmans-everett-evergreen-way',
  'hangar-420-everett',
  'hangar-420-west',
  'evolve-cannabis-bellingham',
  'cannazone-bellingham',
  '2020-solutions-north-bellingham',
  '2020-solutions-pacific-highway',
  'starbuds-bellingham',
  'salish-coast-cannabis',
] as const

// Build a Dutchie scrape() for one store id. Mirrors the per-store files: scrape via
// the Python service and transform the GetSpecialMenuCards intercept through the shared
// retry-on-empty helper (ADR-051) — it never throws, returning [] so the source degrades
// to stale rather than crashing the run. Here storeId === the readable dispensary id, so
// no label override is needed.
function makeDutchieScraper(storeId: string): () => Promise<Deal[]> {
  return () => scrapeDutchieSpecials(storeId)
}

export const dutchieScrapers: Record<string, () => Promise<Deal[]>> = Object.fromEntries(
  DUTCHIE_STORE_IDS.map((id) => [id, makeDutchieScraper(id)]),
)

// PRODUCT-pricing scrapers (SPEC-dutchie-product-pricing, ADR-053) — a SEPARATE
// registry from dutchieScrapers above, returning RawProduct[] (not Deal[]). Same
// batch-resolved stores where id === embed cName; the three original Dutchie stores
// (the-joint/jet/kush21) whose ids diverge from their cNames are NOT included pending
// their embed-id wiring. The product scrape is decoupled from the deals scrape and runs
// on a lower-frequency commit-back schedule.
export const dutchieProductScrapers: Record<string, () => Promise<RawProduct[]>> =
  Object.fromEntries(DUTCHIE_STORE_IDS.map((id) => [id, () => scrapeDutchieProducts(id)]))
