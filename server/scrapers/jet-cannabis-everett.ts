import type { DealScrapeOutcome } from '../types/index.js'
import { scrapeDutchieSpecials } from './_dutchie.js'

// Dutchie embed store cName — resolved in the live pass 2026-06-13. Licensed entity
// "THC Connection" / "Jet Cannabis", 13224 Evergreen Way, Everett (canonical id
// JXHb4Chub3or38k4n). The cName slug works directly on the standard embed URL
// dutchie.com/embedded-menu/thc-connection. See live-findings-2026-06-13.md.
const STORE_ID = 'thc-connection'

export default function scrape(): Promise<DealScrapeOutcome> {
  return scrapeDutchieSpecials(STORE_ID, { label: 'jet-cannabis-everett' })
}
