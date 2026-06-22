import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { applyIngest } from '../utils/applyIngest.js'
import type { IngestEntry, IngestResult } from '../types/index.js'

// ADR-047: build the committed seed by merging the per-store scrape artifacts
// (emitted by ingestRun --emit, uploaded/downloaded by CI) into the checked-out
// server/data/data.json — using the SAME applyIngest the live server uses, so the
// committed file is byte-equivalent to what prod would hold. CI then commits the
// result back to master, making Render's ephemeral-disk reset land on recent data.
//
// CRITICAL (AC1): the seed is built here from the raw scraped Deal[] artifacts, NOT
// from GET /api/data. dataRoute pipes deals through filterActiveDeals (a time-of-
// request projection that drops out-of-window / wrong-weekday deals), so sourcing
// the seed from /api/data would progressively delete real deals. applyIngest's
// last-known-good semantics (empty scrape → stale flag, deals untouched) are what
// guarantee AC2 (no active deal lost across a commit-back cycle).

// Read every <store>.json artifact in `inDir` into IngestEntry[]. Malformed or
// non-conforming files are logged and skipped (never throw — a single bad artifact
// must not abort the whole seed refresh).
export function readEntries(inDir: string): IngestEntry[] {
  if (!existsSync(inDir)) {
    console.log(`[commitBackSeed] artifact dir "${inDir}" does not exist — nothing to merge`)
    return []
  }
  const files = readdirSync(inDir).filter((f) => f.endsWith('.json'))
  const entries: IngestEntry[] = []
  for (const f of files) {
    const full = path.join(inDir, f)
    try {
      const parsed = JSON.parse(readFileSync(full, 'utf-8')) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as IngestEntry).dispensaryId === 'string' &&
        Array.isArray((parsed as IngestEntry).deals)
      ) {
        entries.push(parsed as IngestEntry)
      } else {
        console.warn(`[commitBackSeed] ${f}: not a valid IngestEntry — skipped`)
      }
    } catch (err) {
      console.warn(`[commitBackSeed] ${f}: failed to parse — skipped`, err)
    }
  }
  return entries
}

// Merge artifacts into the seed. dataPath defaults (via applyIngest) to the
// checked-out server/data/data.json. Returns the per-store merge results.
export async function commitBackSeed(
  inDir: string,
  dataPath?: string,
): Promise<Record<string, IngestResult>> {
  const entries = readEntries(inDir)
  if (entries.length === 0) {
    console.log('[commitBackSeed] no entries to merge — data.json left unchanged')
    return {}
  }
  const results = await applyIngest(entries, dataPath)
  for (const [id, r] of Object.entries(results)) console.log(`[commitBackSeed] ${id}: ${r}`)
  return results
}

function parseInDir(argv: string[]): string | undefined {
  const i = argv.indexOf('--in')
  return i >= 0 ? argv[i + 1] : undefined
}

function parseDataPath(argv: string[]): string | undefined {
  const i = argv.indexOf('--data')
  return i >= 0 ? argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const inDir = parseInDir(argv)
  if (!inDir) {
    console.error('[commitBackSeed] --in <dir> is required')
    process.exit(1)
  }
  await commitBackSeed(inDir, parseDataPath(argv))
  // Always exit 0: an empty/unknown dir is not a failure, and the CI job only
  // commits if data.json actually changed. Surfacing failures is the workflow's job.
  process.exit(0)
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error('[commitBackSeed] fatal', err)
    process.exit(1)
  })
}
