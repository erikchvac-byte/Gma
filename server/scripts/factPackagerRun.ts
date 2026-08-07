// Citation-ready fact packager — IO entry point (Story 1.2 / ADR-114). Reads the COMMITTED
// derived facts (the SAME server/data/derived/*.json served on SSR /compare/* + /store/*),
// resolves the operator's geo against the region model, selects the single most relevant
// honesty-gated fact, and prints copy-paste-ready copy with the caveat + source URL baked in.
// Makes NO engine calls and NO re-derivation — it only re-renders what the engine already
// produced (AR-7). All selection/render/guard logic is pure in factPackager.ts; this file is IO.
//
//   Manual run:  cd server ; npx tsx scripts/factPackagerRun.ts --topic Flower --geo bellingham
//                cd server ; npx tsx scripts/factPackagerRun.ts --topic Vaporizers --geo wa
//                cd server ; npx tsx scripts/factPackagerRun.ts --geo "Portland OR"   (WA reject)
//
// INPUT is the committed derived JSON (read-only), so the source URL the copy cites truly renders
// the fact. OUTPUT is PRIVATE operator work-product (pitch copy) — printed to stdout and also
// recorded under ~/GmaS-data/ (never committed, never served — ADR-114, mirrors ADR-113). Env:
//   DERIVED_DIR    - dir to read the derived facts from (default: server/data/derived)
//   FACT_PACK_DIR  - dir to write the private record to  (default: ~/GmaS-data)
//
// On-demand only — NOT scheduled (AR-4 not triggered). Fail-soft: a missing/empty/malformed
// derived file yields a "nothing citable" result stating the reason, exit 0 — never a crash,
// never a fabricated number.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import type { MatchReport } from '../utils/crossStoreValue.js'
import type { PriceVsOwnMedianReport } from '../utils/priceVsOwnMedian.js'
import type { RegionalPriceFloorReport } from '../utils/regionalPriceFloor.js'
import { buildRegions, parseCity, type Region } from '../utils/regionModel.js'
import { buildApiData } from '../utils/buildApiData.js'
import {
  readDerived,
  EMPTY_DISPARITIES_ENVELOPE,
  EMPTY_PRICE_VS_OWN_MEDIAN_ENVELOPE,
  EMPTY_REGIONAL_PRICE_FLOOR_ENVELOPE,
} from '../routes/valueRoute.js'
import { resolveGeo, selectFact, renderResult, slugifyForFile, type PackagerSources } from './factPackager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function derivedDir(): string {
  return process.env.DERIVED_DIR ?? path.join(__dirname, '../data/derived')
}
function outputDir(): string {
  return process.env.FACT_PACK_DIR ?? path.join(os.homedir(), 'GmaS-data')
}

interface Args {
  topic: string
  geo: string
  channel?: string
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { topic: '', geo: '', channel: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--topic') args.topic = argv[++i] ?? ''
    else if (a === '--geo') args.geo = argv[++i] ?? ''
    else if (a === '--channel') args.channel = argv[++i]
  }
  return args
}

// Project the regional-price-floor report into named Regions using the store→city map from
// buildApiData (the SAME source /store + /compare use, so region slugs match the cited URLs).
// Fail-soft: any read failure → [] regions, so statewide facts still work.
//
// Deliberately does NOT pass a store→status map. buildRegions' status overlay is the REQUEST-TIME
// 3h freshness gate (storeStatus), whose input is buildApiData's data.json lastFetchedAt. On this
// LOCAL checkout data.json can be hours old (ingest→commit-back→pull lag), which would falsely
// mark EVERY store stale and suppress every regional floor — even though the live site is fresh.
// Per ADR-111 the committed floors are freshness-invariant: the /compare page always renders them
// (with an "as of / freshness unverified" caveat, never dropped), and DERIVE-time Gate 6 already
// excluded genuinely stale records upstream. So the packager cites the committed floor exactly as
// the live page publishes it; the pure-layer `stale` guard still honors any floor pre-marked stale.
function loadRegions(floorReport: RegionalPriceFloorReport): Region[] {
  try {
    const data = buildApiData()
    const cityById = new Map<string, string | null>()
    for (const d of data.dispensaries) cityById.set(d.id, parseCity(d.address))
    return buildRegions(floorReport, cityById)
  } catch {
    return []
  }
}

function atomicWrite(filePath: string, contents: string): void {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, contents)
  fs.renameSync(tmp, filePath)
}

// Read the three committed derived facts (the SAME server/data/derived/*.json served on SSR
// /compare/* + /store/*) and project the region model into a PackagerSources — the single source of
// truth for BOTH the fact packager (Story 1.2) and the opportunity finder (Story 1.3), so the
// load-bearing freshness-overlay omission in loadRegions lives in ONE place. Fail-soft: a missing/
// empty/malformed file yields empty arrays via the exported empty envelopes; region projection
// wrapped in try/catch → [] (statewide facts still work).
export function loadPackagerSources(dir: string): PackagerSources {
  const disparities = readDerived<MatchReport>(
    path.join(dir, 'disparities.json'),
    EMPTY_DISPARITIES_ENVELOPE,
  )
  const floors = readDerived<RegionalPriceFloorReport>(
    path.join(dir, 'regional-price-floor.json'),
    EMPTY_REGIONAL_PRICE_FLOOR_ENVELOPE,
  )
  const ownMedian = readDerived<PriceVsOwnMedianReport>(
    path.join(dir, 'price-vs-own-median.json'),
    EMPTY_PRICE_VS_OWN_MEDIAN_ENVELOPE,
  )
  return {
    disparities: Array.isArray(disparities.data.disparities) ? disparities.data.disparities : [],
    regions: loadRegions(floors.data),
    ownMedianRows: Array.isArray(ownMedian.data.rows) ? ownMedian.data.rows : [],
  }
}

function main(): void {
  const { topic, geo, channel } = parseArgs(process.argv.slice(2))
  const dir = derivedDir()

  const sources = loadPackagerSources(dir)
  const geoRes = resolveGeo(geo, sources.regions)
  const result = selectFact(topic, geoRes, sources)

  const copy = renderResult(result, topic, geo, channel)

  // Write the private record (stdout is the deliverable; this is the traceable copy, NFR-3).
  const recDir = outputDir()
  let recordPath = ''
  try {
    fs.mkdirSync(recDir, { recursive: true })
    const base = `fact-pack-${slugifyForFile(`${topic}-${geo}`) || 'result'}`
    recordPath = path.join(recDir, `${base}.md`)
    atomicWrite(recordPath, copy + '\n')
    atomicWrite(path.join(recDir, `${base}.json`), JSON.stringify({ topic, geo, channel, result }, null, 2) + '\n')
  } catch (err) {
    console.warn('WARN: could not write private record —', err instanceof Error ? err.message : err)
  }

  console.log(`=== citation-ready fact packager (topic="${topic}", geo="${geo}") ===`)
  console.log(`selected: ${result.kind}${result.kind === 'none' ? ` (${result.reason})` : ''}`)
  if (recordPath) console.log(`record: ${recordPath}`)
  console.log('')
  console.log(copy)
}

// Run only when executed directly (tsx/node), NOT when imported (e.g. tests importing parseArgs) —
// importing must have no side effects. Mirrors citationShareRun.ts.
const invokedDirectly =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  try {
    main()
  } catch (err) {
    // Last-resort fail-soft: never crash on an unexpected error.
    console.error('citation-ready fact packager: unexpected error —', err instanceof Error ? err.message : err)
    process.exitCode = 0
  }
}
