import type { Deal } from '../../client/src/types/index.js'
import { postScrape } from '../utils/scraperClient.js'
import { dutchieRequest, transformSpecials } from './_dutchie.js'

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

// Build a Dutchie scrape() for one store id. Mirrors the per-store files: scrape
// via the Python service, transform the GetSpecialMenuCards intercept, and never
// throw — a failure logs and returns [] so the source degrades to stale, never
// crashes the run.
function makeDutchieScraper(storeId: string): () => Promise<Deal[]> {
  return async () => {
    try {
      return transformSpecials(await postScrape(dutchieRequest(storeId)))
    } catch (err) {
      console.error(`[scraper:${storeId}]`, err)
      return []
    }
  }
}

export const dutchieScrapers: Record<string, () => Promise<Deal[]>> = Object.fromEntries(
  DUTCHIE_STORE_IDS.map((id) => [id, makeDutchieScraper(id)]),
)
