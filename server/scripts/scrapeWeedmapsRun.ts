import { pathToFileURL } from 'node:url'
import { weedmapsProductScrapers } from '../scrapers/weedmaps-stores.js'
import { normalizeProduct } from '../utils/normalizeProduct.js'
import { persistProductObservations, DEFAULT_PRODUCTS_PATH } from '../utils/productsStore.js'
import { persistObservationsToDb, DEFAULT_PRODUCTS_DB_PATH } from '../utils/productsDb.js'
import type { ProductRecord, RawProduct } from '../types/index.js'

// Commit-back Weedmaps PRODUCT scrape (AI-search Phase 2). The sibling of scrapeProductsRun
// (Dutchie), for the SECOND source: it fetches each Weedmaps store's menu, normalizes every
// product through the UNCHANGED normalizeProduct, APPENDS a timestamped observation to
// products.json via the EXISTING persistProductObservations (one serialized read-modify-write),
// and lets CI commit the file back. The matcher then picks the new source up with zero change.
//
// THROTTLE (gate caveat #2): a ≥2s jittered delay BETWEEN stores keeps the crawl shallow + slow
// + nightly, well under what the cleared scaled-crawl gate validated. Fail-soft per store: an
// empty/failed fetch contributes no records and never aborts the others.

const DEFAULT_MIN_DELAY_MS = 2000
const DEFAULT_JITTER_MS = 1500

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface RunWeedmapsScrapeOptions {
  stores: string[]
  registry?: Record<string, () => Promise<RawProduct[]>>
  productsPath?: string
  now?: string
  minDelayMs?: number
  jitterMs?: number
  // injectable so tests don't actually wait / aren't randomness-dependent
  sleepFn?: (ms: number) => Promise<void>
  rng?: () => number
  // ADR-077 AC7: injectable write sink (defaults to legacy JSON path; CLI wires SQLite append).
  // Return is `unknown` (awaited) so both the async JSON persist and the sync DB append fit.
  persist?: (records: ProductRecord[], now: string) => unknown
}

export interface RunWeedmapsScrapeOutcome {
  ok: boolean
  // per store: number of products observed this run, or 'error'
  results: Record<string, number | 'error'>
  recordsWritten: number
}

export async function runWeedmapsScrape(
  opts: RunWeedmapsScrapeOptions,
): Promise<RunWeedmapsScrapeOutcome> {
  const registry = opts.registry ?? weedmapsProductScrapers
  const productsPath = opts.productsPath ?? DEFAULT_PRODUCTS_PATH
  const now = opts.now ?? new Date().toISOString()
  const minDelay = opts.minDelayMs ?? DEFAULT_MIN_DELAY_MS
  const jitter = opts.jitterMs ?? DEFAULT_JITTER_MS
  const sleep = opts.sleepFn ?? realSleep
  const rng = opts.rng ?? Math.random
  const persist =
    opts.persist ?? ((records: ProductRecord[], n: string) => persistProductObservations(records, n, productsPath))

  if (opts.stores.length === 0) {
    console.error('[weedmapsRun] no stores to scrape')
    return { ok: false, results: {}, recordsWritten: 0 }
  }

  const records: ProductRecord[] = []
  const results: Record<string, number | 'error'> = {}
  let ok = true
  let first = true

  for (const id of opts.stores) {
    const scrape = registry[id]
    if (!scrape) {
      results[id] = 'error'
      ok = false
      console.error(`[weedmapsRun] ${id}: no weedmaps scraper registered`)
      continue
    }
    // Throttle between stores (not before the first). Jittered to avoid a fixed cadence.
    if (!first) await sleep(minDelay + Math.floor(rng() * jitter))
    first = false
    try {
      const raws = await scrape()
      for (const raw of raws) records.push(normalizeProduct(raw, id, now))
      results[id] = raws.length // 0 = empty menu this run (kept soft, not an error)
    } catch (err) {
      results[id] = 'error'
      ok = false
      console.error(`[weedmapsRun] ${id}: scrape failed`, err)
    }
  }

  if (records.length > 0) {
    await persist(records, now)
  }

  return { ok, results, recordsWritten: records.length }
}

// `--store <id>` selects one store; omitted = all registered Weedmaps stores.
export function parseStoreArg(argv: string[]): string | undefined {
  const i = argv.indexOf('--store')
  return i >= 0 ? argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const all = Object.keys(weedmapsProductScrapers)
  let stores: string[]
  if (args.includes('--store')) {
    const storeArg = parseStoreArg(args)
    if (!storeArg) {
      console.error('[weedmapsRun] --store requires a store id')
      process.exit(1)
    }
    if (!all.includes(storeArg)) {
      console.error(`[weedmapsRun] unknown store "${storeArg}". Valid: ${all.join(', ')}`)
      process.exit(1)
    }
    stores = [storeArg]
  } else {
    stores = all
  }

  // ADR-077: append into the local SQLite store (products.json left git). Home path via
  // PRODUCTS_DB_PATH set by the local runner.
  const dbPath = process.env.PRODUCTS_DB_PATH ?? DEFAULT_PRODUCTS_DB_PATH
  const { ok, results, recordsWritten } = await runWeedmapsScrape({
    stores,
    persist: (records, n) => persistObservationsToDb(records, n, dbPath),
  })
  for (const [id, r] of Object.entries(results)) console.log(`[weedmapsRun] ${id}: ${r}`)
  console.log(`[weedmapsRun] ${recordsWritten} observations appended → ${dbPath}`)
  process.exit(ok ? 0 : 1)
}

// CLI only when executed directly (not when imported by tests).
const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error('[weedmapsRun] fatal', err)
    process.exit(1)
  })
}
