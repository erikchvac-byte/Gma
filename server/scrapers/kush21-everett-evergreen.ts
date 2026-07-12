import type { DealScrapeOutcome } from '../types/index.js'
import { scrapeDutchieSpecials } from './_dutchie.js'

// Dutchie embed store cName — resolved in the live pass 2026-06-13. Kush21 also
// runs a Dutchie-Plus custom domain (everettshop.kush21.com, dispensaryId
// E8KjW8WozhMFiMan9), but the cName slug resolves on the STANDARD embed URL
// dutchie.com/embedded-menu/kush21-everett, so the shared request preset suffices
// (no custom-domain handling needed). See live-findings-2026-06-13.md.
const STORE_ID = 'kush21-everett'

export default function scrape(): Promise<DealScrapeOutcome> {
  return scrapeDutchieSpecials(STORE_ID, { label: 'kush21-everett-evergreen' })
}
