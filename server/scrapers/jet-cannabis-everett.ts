import type { Deal } from '../../client/src/types/index.js'
import { postScrape } from '../utils/scraperClient.js'
import { dutchieRequest, transformSpecials } from './_dutchie.js'

// Dutchie embed store cName — resolved in the live pass 2026-06-13. Licensed entity
// "THC Connection" / "Jet Cannabis", 13224 Evergreen Way, Everett (canonical id
// JXHb4Chub3or38k4n). The cName slug works directly on the standard embed URL
// dutchie.com/embedded-menu/thc-connection. See live-findings-2026-06-13.md.
const STORE_ID = 'thc-connection'

export default async function scrape(): Promise<Deal[]> {
  try {
    const intercepted = await postScrape(dutchieRequest(STORE_ID))
    return transformSpecials(intercepted)
  } catch (err) {
    console.error('[scraper:jet-cannabis-everett]', err)
    return []
  }
}
