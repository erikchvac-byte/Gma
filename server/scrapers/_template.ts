import type { DealScrapeOutcome } from '../types/index.js'

// Contract (ADR-083): never throw; resolve to a DealScrapeOutcome. Set
// `confirmedEmpty: true` ONLY when the source gives positive evidence it has
// zero deals right now (e.g. a successfully-captured empty payload). A failure,
// timeout, or ambiguous empty must stay `confirmedEmpty: false` so downstream
// keeps last-known-good and flags the source stale.
export default async function scrape(): Promise<DealScrapeOutcome> {
  try {
    // TODO: axios.get the dispensary page, parse with cheerio, map to Deal[]
    return { deals: [], confirmedEmpty: false }
  } catch (err) {
    console.error('[scraper:_template]', err)
    return { deals: [], confirmedEmpty: false }
  }
}
