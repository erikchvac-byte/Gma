import type { Deal } from '../../client/src/types/index.js'
import { postScrape } from '../utils/scraperClient.js'
import { dutchieRequest, transformSpecials } from './_dutchie.js'

// Dutchie embed store id — UNRESOLVED. Jet embeds Dutchie inside a nested Wix
// HTML-component iframe (licensed entity "THC Connection", dutchie.com/dispensary/
// thc-connection), so the id is not in the captured host HTML. Resolve during the
// deferred live pass via the service /discover endpoint or a host-page lookup, then
// drop it in here. See the 4.3 spec "Deferred to the live pass". Until then this
// store reports stale (graceful degradation by design).
const STORE_ID = '' // unresolved — deferred

export default async function scrape(): Promise<Deal[]> {
  if (!STORE_ID) {
    console.error('[scraper:jet-cannabis-everett] embed store id unresolved — skipping (deferred)')
    return []
  }
  try {
    const intercepted = await postScrape(dutchieRequest(STORE_ID))
    return transformSpecials(intercepted)
  } catch (err) {
    console.error('[scraper:jet-cannabis-everett]', err)
    return []
  }
}
