import type { Deal } from '../../client/src/types/index.js'
import { postScrape } from '../utils/scraperClient.js'
import { dutchieRequest, transformSpecials } from './_dutchie.js'

// Dutchie embed store id — confirmed from the live menu page
// (__fixtures__/joint-everett-menu.html: dutchie.com/api/v2/embedded-menu/689cd028ea84b6a605458416.js).
const STORE_ID = '689cd028ea84b6a605458416'

export default async function scrape(): Promise<Deal[]> {
  try {
    const intercepted = await postScrape(dutchieRequest(STORE_ID))
    return transformSpecials(intercepted)
  } catch (err) {
    console.error('[scraper:the-joint-everett]', err)
    return []
  }
}
