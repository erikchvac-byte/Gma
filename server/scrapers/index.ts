import type { Deal } from '../../client/src/types/index.js'
import remedyTulalipScrape from './remedy-tulalip.js'
import theJointEverettScrape from './the-joint-everett.js'
import jetCannabisEverettScrape from './jet-cannabis-everett.js'
import kush21EverettEvergreenScrape from './kush21-everett-evergreen.js'

export const scrapers: Record<string, () => Promise<Deal[]>> = {
  'remedy-tulalip': remedyTulalipScrape,
  // Dutchie-powered (Story 4.3) — route through the Python Scraper microservice.
  // the-joint-everett ships with a confirmed embed id; jet + kush21 report stale
  // until their embed ids are resolved in the deferred live pass.
  'the-joint-everett': theJointEverettScrape,
  'jet-cannabis-everett': jetCannabisEverettScrape,
  'kush21-everett-evergreen': kush21EverettEvergreenScrape,
}
