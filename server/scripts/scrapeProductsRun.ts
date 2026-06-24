import { pathToFileURL } from 'node:url'
import { dutchieProductScrapers } from '../scrapers/dutchie-stores.js'
import { normalizeProduct } from '../utils/normalizeProduct.js'
import { persistProductObservations, DEFAULT_PRODUCTS_PATH } from '../utils/productsStore.js'
import type { ProductRecord, RawProduct } from '../types/index.js'

// Commit-back product-price scrape (SPEC-dutchie-product-pricing CAP-4/CAP-6, ADR-053).
// The CI counterpart to ingestRun, but for PRODUCTS: it scrapes each store's menu,
// normalizes every product to unit economics, APPENDS a timestamped observation to
// products.json, and lets CI commit the file back to the repo. It writes the dataset
// directly (no HTTP push) because the durable store is the git-tracked file — Render's
// disk is ephemeral, so a server-written file would lose history every deploy.
//
// Runs at a LOWER frequency than the hourly deals cron (prices move slowly, payload is
// heavy). Fail-soft per store: an empty/failed scrape contributes no records and never
// aborts the others; a store that returns products gets its observation appended.

export interface RunProductScrapeOptions {
  stores: string[]
  registry?: Record<string, () => Promise<RawProduct[]>>
  productsPath?: string
  now?: string
}

export interface RunProductScrapeOutcome {
  ok: boolean
  // per store: number of products observed this run, or 'error'
  results: Record<string, number | 'error'>
  recordsWritten: number
}

export async function runProductScrape(
  opts: RunProductScrapeOptions,
): Promise<RunProductScrapeOutcome> {
  const registry = opts.registry ?? dutchieProductScrapers
  const productsPath = opts.productsPath ?? DEFAULT_PRODUCTS_PATH
  const now = opts.now ?? new Date().toISOString()

  if (opts.stores.length === 0) {
    console.error('[productsRun] no stores to scrape')
    return { ok: false, results: {}, recordsWritten: 0 }
  }

  const records: ProductRecord[] = []
  const results: Record<string, number | 'error'> = {}
  let ok = true

  for (const id of opts.stores) {
    const scrape = registry[id]
    if (!scrape) {
      results[id] = 'error'
      ok = false
      console.error(`[productsRun] ${id}: no product scraper registered`)
      continue
    }
    try {
      const raws = await scrape()
      for (const raw of raws) records.push(normalizeProduct(raw, id, now))
      results[id] = raws.length // 0 = empty menu this run (not an error — kept soft)
    } catch (err) {
      results[id] = 'error'
      ok = false
      console.error(`[productsRun] ${id}: scrape failed`, err)
    }
  }

  // Append every observation in one serialized read-modify-write.
  if (records.length > 0) {
    await persistProductObservations(records, now, productsPath)
  }

  return { ok, results, recordsWritten: records.length }
}

// `--store <id>` selects one store; omitted = all registered product stores.
export function parseStoreArg(argv: string[]): string | undefined {
  const i = argv.indexOf('--store')
  return i >= 0 ? argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const all = Object.keys(dutchieProductScrapers)
  let stores: string[]
  if (args.includes('--store')) {
    const storeArg = parseStoreArg(args)
    if (!storeArg) {
      console.error('[productsRun] --store requires a store id')
      process.exit(1)
    }
    if (!all.includes(storeArg)) {
      console.error(`[productsRun] unknown store "${storeArg}". Valid: ${all.join(', ')}`)
      process.exit(1)
    }
    stores = [storeArg]
  } else {
    stores = all
  }

  const { ok, results, recordsWritten } = await runProductScrape({ stores })
  for (const [id, r] of Object.entries(results)) console.log(`[productsRun] ${id}: ${r}`)
  console.log(`[productsRun] ${recordsWritten} observations appended`)
  process.exit(ok ? 0 : 1)
}

// CLI only when executed directly (not when imported by tests).
const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error('[productsRun] fatal', err)
    process.exit(1)
  })
}
