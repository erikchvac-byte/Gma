import type { Deal } from '../../client/src/types/index.js'

export const scrapers: Record<string, () => Promise<Deal[]>> = {
  // 'remedy-tulalip': remedyTulalipScrape,  // added in Story 4.2
}
