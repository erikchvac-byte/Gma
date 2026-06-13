import type { Deal } from '../../client/src/types/index.js'
import { postScrape } from '../utils/scraperClient.js'
import { dutchieRequest, transformSpecials } from './_dutchie.js'

// Dutchie embed store id — UNRESOLVED. Kush21 serves its menu from the Dutchie-
// powered subdomain everettshop.kush21.com; the embed id was not captured in 4.2.
// Resolve during the deferred live pass via the service /discover endpoint or a
// host-page lookup, then drop it in here. See the 4.3 spec "Deferred to the live
// pass". Until then this store reports stale (graceful degradation by design).
const STORE_ID = '' // unresolved — deferred

export default async function scrape(): Promise<Deal[]> {
  if (!STORE_ID) {
    console.error('[scraper:kush21-everett-evergreen] embed store id unresolved — skipping (deferred)')
    return []
  }
  try {
    const intercepted = await postScrape(dutchieRequest(STORE_ID))
    return transformSpecials(intercepted)
  } catch (err) {
    console.error('[scraper:kush21-everett-evergreen]', err)
    return []
  }
}
