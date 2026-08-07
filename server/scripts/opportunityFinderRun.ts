// Opportunity finder — IO entry point (Story 1.3 / ADR-115). Uses the citation monitor's Haiku +
// web_search / Perplexity search path (AR-5, reused via searchEngines.ts — no new engine, no paid
// API) to find recent WA IN-channel threads about cannabis pricing/value, then pairs each candidate
// with an honesty-gated fact from the COMMITTED server/data/derived/*.json (read-only, via Story
// 1.2's factPackager) and writes a short ranked worklist. MEASURE-AND-SURFACE only: it does no
// outreach — a human acts on the worklist. All filter/pair/rank/render logic is pure in
// opportunityFinder.ts; this file is IO.
//
//   Manual run:  cd server ; npx tsx scripts/opportunityFinderRun.ts --topic "cheapest flower" --geo bellingham
//   Dry run:     cd server ; npx tsx scripts/opportunityFinderRun.ts --dry   (no key/cost)
//
// Env:
//   ANTHROPIC_API_KEY / PERPLEXITY_API_KEY - enable the live search engines (else --dry behavior)
//   DERIVED_DIR      - dir to read the derived facts from (default: server/data/derived)
//   OPPORTUNITY_DIR  - dir to write the private worklist to (default: ~/GmaS-data)
//
// OUTPUT is PRIVATE operator work-product (a worklist) — printed to stdout and recorded under
// ~/GmaS-data/ (never committed, never served — ADR-115, mirrors ADR-113/114). On-demand only —
// NOT scheduled (AR-4 not triggered). Fail-soft: an unavailable/empty/unparseable search or a
// missing derived file yields an empty worklist stating the reason, exit 0 — never a crash, never a
// fabricated candidate or number.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { selectEngines, sleep, REQUEST_GAP_MS } from './searchEngines.js'
import { loadPackagerSources, derivedDir } from './factPackagerRun.js'
import {
  parseCandidates,
  buildWorklist,
  renderWorklistMarkdown,
  renderWorklistJson,
  type RawCandidate,
} from './opportunityFinder.js'
import { slugifyForFile } from './factPackager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function outputDir(): string {
  return process.env.OPPORTUNITY_DIR ?? path.join(os.homedir(), 'GmaS-data')
}

interface Args {
  topic: string
  geo: string
  limit: number
  dry: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { topic: '', geo: '', limit: 10, dry: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--topic') args.topic = argv[++i] ?? ''
    else if (a === '--geo') args.geo = argv[++i] ?? ''
    else if (a === '--limit') args.limit = Math.max(1, Number.parseInt(argv[++i] ?? '10', 10) || 10)
    else if (a === '--dry') args.dry = true
  }
  return args
}

// The search prompt (IO layer): instruct the engine to find recent WA IN-channel threads about
// cannabis pricing/value and return ONLY a JSON array of candidates. Parsing is defensive
// (parseCandidates), so wrapping prose / fences are tolerated.
export function buildSearchPrompt(topic: string, geo: string): string {
  const topicClause = topic.trim() ? ` specifically about "${topic.trim()}"` : ''
  const geoClause = geo.trim() ? ` Prefer the ${geo.trim()}, Washington area.` : ''
  return [
    `Find recent (last ~90 days) PUBLIC threads or questions from Washington State cannabis shoppers`,
    `where a price-comparison fact would genuinely help${topicClause}.`,
    `Search IN-channels only: Reddit (e.g. r/CannabisWA, r/Seattle, r/washington and local city subreddits),`,
    `local community forums, local news, and journalist queries.${geoClause}`,
    ``,
    `EXCLUDE weedmaps, leafly, leafbuyer, yelp, and any directory/aggregator site.`,
    `EXCLUDE anything outside Washington State.`,
    ``,
    `Return ONLY a JSON array (no prose) of objects with these fields:`,
    `{"url": string, "title": string, "snippet": string, "topic": string, "geo": string, "postedDate": string}`,
    `- topic = the product/category the thread is about (e.g. "flower", "vape carts", "edibles")`,
    `- geo = the Washington locality if the thread names one, else ""`,
    `- postedDate = the post date (ISO if known) or "" if unknown`,
    `If you find nothing suitable, return [].`,
  ].join('\n')
}

function atomicWrite(filePath: string, contents: string): void {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, contents)
  fs.renameSync(tmp, filePath)
}

// Run the search across the selected engines, collecting parsed candidates. Fail-soft per engine:
// an engine error is logged and skipped, never thrown. Returns candidates + a note when empty.
async function search(topic: string, geo: string, forceDry: boolean): Promise<{ candidates: RawCandidate[]; note: string }> {
  const engines = selectEngines(forceDry)
  const prompt = buildSearchPrompt(topic, geo)
  const candidates: RawCandidate[] = []
  const seen = new Set<string>()
  let first = true
  let anyOk = false

  for (const engine of engines) {
    if (!first) await sleep(REQUEST_GAP_MS)
    first = false
    try {
      const answer = await engine.ask(prompt)
      anyOk = true
      for (const c of parseCandidates(answer.answerText)) {
        if (seen.has(c.url)) continue
        seen.add(c.url)
        candidates.push(c)
      }
    } catch (err) {
      console.warn(`  ! [${engine.name}] search error — ${err instanceof Error ? err.message : err}`)
    }
  }

  const engineNames = engines.map((e) => e.name).join(', ')
  let note = `engines: ${engineNames}`
  if (engines.length === 1 && engines[0].name === 'dry-run') {
    note += ' (no API key — dry run makes no live search; set ANTHROPIC_API_KEY/PERPLEXITY_API_KEY)'
  } else if (!anyOk) {
    note += ' (all engines errored)'
  }
  return { candidates, note }
}

async function main(): Promise<void> {
  const { topic, geo, limit, dry } = parseArgs(process.argv.slice(2))

  const sources = loadPackagerSources(derivedDir())
  const { candidates, note } = await search(topic, geo, dry)

  const worklist = buildWorklist(candidates, sources, { topic, geo, limit })
  const md = renderWorklistMarkdown(worklist)

  // Write the private record (stdout is the deliverable; this is the traceable copy, NFR-3).
  const recDir = outputDir()
  let recordPath = ''
  try {
    fs.mkdirSync(recDir, { recursive: true })
    const base = `opportunities-${slugifyForFile(`${topic}-${geo}`) || 'result'}`
    recordPath = path.join(recDir, `${base}.md`)
    atomicWrite(recordPath, md)
    atomicWrite(path.join(recDir, `${base}.json`), renderWorklistJson(worklist))
  } catch (err) {
    console.warn('WARN: could not write private record —', err instanceof Error ? err.message : err)
  }

  console.log(`=== opportunity finder (topic="${topic}", geo="${geo}") ===`)
  console.log(`  ${note}`)
  console.log(
    `  scanned ${worklist.scanned} candidate(s); ${worklist.kept} matched a gated fact; showing ${worklist.opportunities.length}`,
  )
  if (recordPath) console.log(`  record: ${recordPath}`)
  console.log('')
  console.log(md)
}

// Run only when executed directly (tsx/node), NOT when imported (e.g. tests importing parseArgs /
// buildSearchPrompt) — importing must have no side effects. Mirrors factPackagerRun.ts.
const invokedDirectly =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((err) => {
    // Last-resort fail-soft: never crash on an unexpected error.
    console.error('opportunity finder: unexpected error —', err instanceof Error ? err.message : err)
    process.exitCode = 0
  })
}
