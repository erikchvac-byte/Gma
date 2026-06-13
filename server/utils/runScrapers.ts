import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { atomicWriteJson } from './atomicWrite.js'
import { withDataLock } from './dataStore.js'
import { scrapers as defaultRegistry } from '../scrapers/index.js'
import type { ApiDataResponse, Deal } from '../../client/src/types/index.js'
import type { LogEntry, LogRun } from '../types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_PATH = path.join(__dirname, '../data/data.json')
const DEFAULT_LOGS_PATH = path.join(__dirname, '../data/logs.json')

export async function runScrapers(
  dataPath: string = DEFAULT_DATA_PATH,
  logsPath: string = DEFAULT_LOGS_PATH,
  registry: Record<string, () => Promise<Deal[]>> = defaultRegistry,
): Promise<void> {
  await withDataLock(async () => {
    const file: ApiDataResponse = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const results: Record<string, LogEntry> = {}

    for (const dispensary of file.dispensaries) {
      const scrape = registry[dispensary.id]
      if (scrape === undefined) {
        results[dispensary.id] = 'error: no scraper registered'
        dispensary.stale = true
        // deals / lastFetchedAt intentionally untouched (AC3)
        continue
      }

      // The success-path update lives inside this try so a scraper that
      // violates the contract (throws, or returns a non-array → deals.length
      // throws) degrades to stale=true for that one dispensary instead of
      // rejecting the whole run and skipping every other source's write.
      try {
        const deals = await scrape()
        if (deals.length > 0) {
          results[dispensary.id] = 'ok'
          dispensary.stale = false
          dispensary.deals = deals
          dispensary.lastFetchedAt = new Date().toISOString()
        } else {
          results[dispensary.id] = 'error: scraper returned no deals'
          dispensary.stale = true
          // deals / lastFetchedAt intentionally untouched (AC3)
        }
      } catch (err) {
        results[dispensary.id] = `error: ${err instanceof Error ? err.message : String(err)}`
        dispensary.stale = true
        // deals / lastFetchedAt intentionally untouched (AC3)
      }
    }

    const runAt = new Date().toISOString()
    file.meta.lastScraperRun = runAt
    atomicWriteJson(dataPath, file)

    const logsFile: { runs: LogRun[] } = JSON.parse(readFileSync(logsPath, 'utf-8'))
    logsFile.runs.push({ runAt, results })
    atomicWriteJson(logsPath, logsFile)
  })
}
