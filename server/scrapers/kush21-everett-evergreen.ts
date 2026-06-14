import type { Deal } from '../../client/src/types/index.js'
import { postScrape } from '../utils/scraperClient.js'
import { dutchieRequest, transformSpecials } from './_dutchie.js'

// Dutchie embed store cName — resolved in the live pass 2026-06-13. Kush21 also
// runs a Dutchie-Plus custom domain (everettshop.kush21.com, dispensaryId
// E8KjW8WozhMFiMan9), but the cName slug resolves on the STANDARD embed URL
// dutchie.com/embedded-menu/kush21-everett, so the shared request preset suffices
// (no custom-domain handling needed). See live-findings-2026-06-13.md.
const STORE_ID = 'kush21-everett'

export default async function scrape(): Promise<Deal[]> {
  try {
    const intercepted = await postScrape(dutchieRequest(STORE_ID))
    return transformSpecials(intercepted)
  } catch (err) {
    console.error('[scraper:kush21-everett-evergreen]', err)
    return []
  }
}
