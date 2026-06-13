import type { Deal } from '../../client/src/types/index.js'
import remedyTulalipScrape from './remedy-tulalip.js'

export const scrapers: Record<string, () => Promise<Deal[]>> = {
  'remedy-tulalip': remedyTulalipScrape,
  // Dutchie-powered (the-joint-everett, jet-cannabis-everett, kush21-everett-evergreen)
  // are added in Story 4.3 via the Python Scraper microservice.
}
