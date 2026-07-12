import type { DealScrapeOutcome } from '../types/index.js'
import { scrapeDutchieSpecials } from './_dutchie.js'

// Dutchie embed store id — confirmed from the live menu page
// (__fixtures__/joint-everett-menu.html: dutchie.com/api/v2/embedded-menu/689cd028ea84b6a605458416.js).
const STORE_ID = '689cd028ea84b6a605458416'

export default function scrape(): Promise<DealScrapeOutcome> {
  return scrapeDutchieSpecials(STORE_ID, { label: 'the-joint-everett' })
}
