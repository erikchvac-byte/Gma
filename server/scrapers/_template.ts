import type { Deal } from '../../client/src/types/index.js'

export default async function scrape(): Promise<Deal[]> {
  try {
    // TODO: axios.get the dispensary page, parse with cheerio, map to Deal[]
    return []
  } catch (err) {
    console.error('[scraper:_template]', err)
    return []
  }
}
