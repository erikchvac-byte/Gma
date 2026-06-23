import { pathToFileURL } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { scrapers, storeIds } from '../scrapers/index.js'
import { normalizeDeals } from '../utils/normalizeDeals.js'
import type { Deal } from '../../client/src/types/index.js'
import type { IngestEntry, IngestResult } from '../types/index.js'

// Push counterpart to runScrapers (ADR-034 Goal D). Run by the GitHub Actions cron
// (one store per matrix job). For each store it runs the SAME pipeline runScrapers
// uses — scrape() -> normalizeDeals — then POSTs the batch to /api/ingest instead of
// writing data.json.
//
// Exit semantics (ADR-034 §6, amended): an empty scrape ('stale') is NOT a failure —
// the server keeps last-known-good, and a store legitimately having no specials this
// hour is normal. Only a genuine error flips ok=false: a scrape throw, a POST failure,
// an 'unknown' dispensary, or a missing scraper. Even so, a single store's red is no
// longer the alert — the workflow runs this per-store with continue-on-error and a
// separate alert-gate job (alertGate.ts) raises the actual alert only on a TOTAL
// failure or a store that stays stale for several runs.

export type PostFn = (
  url: string,
  body: { stores: IngestEntry[] },
  secret: string,
) => Promise<Record<string, IngestResult>>

// Default transport: POST to /api/ingest with the shared-secret header. Throws on
// non-2xx (axios default) or a response missing `results`, so runIngest marks the
// run failed rather than silently reporting success.
export const defaultPostFn: PostFn = async (url, body, secret) => {
  const res = await axios.post(url, body, {
    headers: { 'content-type': 'application/json', 'x-ingest-secret': secret },
    timeout: 60000,
  })
  const results = (res.data as { results?: Record<string, IngestResult> })?.results
  if (!results || typeof results !== 'object' || Array.isArray(results)) {
    throw new Error(`ingest response missing/invalid results: ${JSON.stringify(res.data)}`)
  }
  return results
}

// Backstop timeout around a single scrape so one hung connection can't pin the CI
// job until GitHub's 6h runner timeout. Sits above scraperClient's own 50s axios
// timeout; the timer is cleared on settle so it never keeps the process alive.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: scrape timed out after ${ms}ms`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

// Backstop budget for a single store's scrape(). A Dutchie scrape() now makes up to 3
// retry-on-empty attempts (ADR-051), each bounded by scraperClient's own 50s axios
// timeout, so the worst case (~150s) must fit under this ceiling — empties return fast,
// so the budget is rarely approached, but it must not abort a legitimate retry sequence.
const SCRAPE_TIMEOUT_MS = 180000

export interface RunIngestOptions {
  stores: string[]
  ingestUrl: string
  secret: string
  registry?: Record<string, () => Promise<Deal[]>>
  postFn?: PostFn
  // ADR-047: when set, each scraped IngestEntry is additionally written to
  // <emitDir>/<dispensaryId>.json BEFORE the POST. These artifacts are the
  // commit-back seed source (uploaded by CI, merged via applyIngest). Emitting
  // before POST means a POST failure — the deploy-cutover race this story fixes —
  // still leaves a good on-disk scrape for the seed. Additive: unset = today's
  // behavior, no files written.
  emitDir?: string
}

export interface RunIngestOutcome {
  ok: boolean
  results: Record<string, IngestResult | 'error'>
}

export async function runIngest(opts: RunIngestOptions): Promise<RunIngestOutcome> {
  const registry = opts.registry ?? scrapers
  const postFn = opts.postFn ?? defaultPostFn

  if (opts.stores.length === 0) {
    console.error('[ingestRun] no stores to scrape')
    return { ok: false, results: {} }
  }

  const entries: IngestEntry[] = []
  const results: Record<string, IngestResult | 'error'> = {}
  let ok = true

  for (const id of opts.stores) {
    const scrape = registry[id]
    if (!scrape) {
      results[id] = 'error'
      ok = false
      console.error(`[ingestRun] ${id}: no scraper registered`)
      continue
    }
    try {
      // normalize at the same chokepoint runScrapers/applyIngest use. An empty
      // result is still POSTed: the server flags it stale and keeps last-known-good.
      // An empty/'stale' result is NOT treated as a failure here (see exit semantics).
      const deals = normalizeDeals(await withTimeout(scrape(), SCRAPE_TIMEOUT_MS, id))
      entries.push({ dispensaryId: id, deals })
    } catch (err) {
      results[id] = 'error'
      ok = false
      console.error(`[ingestRun] ${id}: scrape failed`, err)
    }
  }

  // Emit the scraped entries as seed artifacts before POSTing (see emitDir doc).
  if (opts.emitDir && entries.length > 0) {
    mkdirSync(opts.emitDir, { recursive: true })
    for (const entry of entries) {
      const file = path.join(opts.emitDir, `${entry.dispensaryId}.json`)
      writeFileSync(file, JSON.stringify(entry))
    }
  }

  if (entries.length > 0) {
    try {
      const posted = await postFn(opts.ingestUrl, { stores: entries }, opts.secret)
      for (const entry of entries) {
        const r = posted[entry.dispensaryId] ?? 'error'
        results[entry.dispensaryId] = r
        // 'stale' (empty scrape, last-known-good kept) is acceptable — not a hard
        // failure. Only 'unknown'/'error' (and a missing key, defaulted to 'error')
        // flip ok=false.
        if (r !== 'ok' && r !== 'stale') ok = false
      }
    } catch (err) {
      ok = false
      for (const entry of entries) results[entry.dispensaryId] = 'error'
      console.error('[ingestRun] POST failed', err)
    }
  }

  return { ok, results }
}

// `--store <id>` selects one store (matrix isolation); omitted = all registered.
export function parseStoreArg(argv: string[]): string | undefined {
  const i = argv.indexOf('--store')
  return i >= 0 ? argv[i + 1] : undefined
}

// `--emit <dir>` (or env INGEST_EMIT_DIR) writes seed artifacts; flag wins.
export function parseEmitDir(argv: string[], env: NodeJS.ProcessEnv): string | undefined {
  const i = argv.indexOf('--emit')
  if (i >= 0 && argv[i + 1]) return argv[i + 1]
  return env.INGEST_EMIT_DIR || undefined
}

async function main(): Promise<void> {
  const ingestUrl = process.env.INGEST_URL
  const secret = process.env.INGEST_SECRET
  if (!ingestUrl || !secret) {
    console.error('[ingestRun] INGEST_URL and INGEST_SECRET must both be set')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const storeArg = parseStoreArg(args)
  let stores: string[]
  if (args.includes('--store')) {
    // flag present but value missing/empty → error rather than silently run all
    if (!storeArg) {
      console.error('[ingestRun] --store requires a store id')
      process.exit(1)
    }
    if (!storeIds.includes(storeArg)) {
      console.error(`[ingestRun] unknown store "${storeArg}". Valid: ${storeIds.join(', ')}`)
      process.exit(1)
    }
    stores = [storeArg]
  } else {
    stores = storeIds
  }

  const emitDir = parseEmitDir(args, process.env)
  const { ok, results } = await runIngest({ stores, ingestUrl, secret, emitDir })
  for (const [id, r] of Object.entries(results)) console.log(`[ingestRun] ${id}: ${r}`)
  process.exit(ok ? 0 : 1)
}

// Run as a CLI only when executed directly (not when imported by tests).
const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error('[ingestRun] fatal', err)
    process.exit(1)
  })
}
