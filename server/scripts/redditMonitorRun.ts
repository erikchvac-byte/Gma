// Reddit mention-monitor — IO entry point (Phase-2 reach, v1 notifier-only). Polls North-Sound
// subreddits' PUBLIC .json, precision-filters + fact-gates each post (via the shared factPackager
// honesty path), and appends freshness-stamped alert rows to a LOCAL JSONL (never committed —
// like products.db / the citation log, this is home-machine measurement state). The served site is
// untouched. A human replies to each alert by hand; nothing here posts to Reddit.
//
//   Manual run:  cd server ; npx tsx scripts/redditMonitorRun.ts
//   Dry run:     cd server ; npx tsx scripts/redditMonitorRun.ts --dry   (no network/API, isolated log)
//
// Env:
//   ANTHROPIC_API_KEY  - enables the Haiku classifier (else survivors are counted but not classified)
//   CITATION_MODEL     - Claude model id (default claude-haiku-4-5, shared with the citation monitor)
//   DERIVED_DIR        - dir to read the committed derived facts from (default: server/data/derived)
//   REDDIT_DATA_DIR    - dir for the private state (default: ~/GmaS-data)
//   REDDIT_LOG_PATH    - explicit mentions-log path; REQUIRED semantics under --dry (isolation)
//   REDDIT_FIXTURE     - optional path to a saved subreddit .json listing, used INSTEAD of the
//                        network (lets --dry exercise the full pipeline offline)
//
// See project_reach-launch-plan (Phase 2), the build-ready brainstorm, and ADR-106.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { sleep, REQUEST_GAP_MS, CITATION_MODEL } from './searchEngines.js'
import { loadPackagerSources, derivedDir } from './factPackagerRun.js'
import { resolveGeo, selectFact, type GeoResolution, type CitableFact } from './factPackager.js'
import { buildApiData } from '../utils/buildApiData.js'
import {
  parseListing,
  preFilter,
  buildClassifyPrompt,
  parseClassification,
  buildAlerts,
  expireSeen,
  precisionLine,
  renderAlertsMarkdown,
  tokenizeInventory,
  CATEGORY_TERMS,
  type RedditPost,
  type ClassifiedCandidate,
  type Classification,
  type AlertRow,
  type SeenMap,
} from './redditMonitor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const USER_AGENT = 'windows:gmaslist-reddit-monitor:v1.0 (local reach tool; contact erikchvac@gmail.com)'

interface Args {
  dry: boolean
  limit?: number
}
export function parseArgs(argv: string[]): Args {
  const args: Args = { dry: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry') args.dry = true
    else if (argv[i] === '--limit') args.limit = Math.max(1, Number.parseInt(argv[++i] ?? '', 10) || 40)
  }
  return args
}

interface SubredditConfig {
  name: string
  tier?: string
}
function loadSubreddits(): { subreddits: SubredditConfig[]; limit: number } {
  const p = path.join(__dirname, 'reddit-subreddits.json')
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as { subreddits?: SubredditConfig[]; limit?: number }
  const subreddits = Array.isArray(parsed.subreddits) ? parsed.subreddits.filter((s) => s && s.name) : []
  return { subreddits, limit: typeof parsed.limit === 'number' ? parsed.limit : 40 }
}

function dataDir(): string {
  return process.env.REDDIT_DATA_DIR ?? path.join(os.homedir(), 'GmaS-data')
}
// Under --dry, BOTH the mentions log and the seen file are isolated so a dry run can NEVER touch
// the real state (the citation-monitor dry-run regression). REDDIT_LOG_PATH wins when set; else a
// temp file. The real paths are only used on a live run.
function mentionsPath(dry: boolean): string {
  if (dry) return process.env.REDDIT_LOG_PATH ?? path.join(os.tmpdir(), 'reddit-mentions.dry.jsonl')
  return process.env.REDDIT_LOG_PATH ?? path.join(dataDir(), 'reddit-mentions.jsonl')
}
function seenPath(dry: boolean): string {
  if (dry) return path.join(path.dirname(mentionsPath(true)), 'reddit-seen.dry.json')
  return path.join(dataDir(), 'reddit-seen.json')
}

function atomicWrite(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, contents)
  fs.renameSync(tmp, filePath)
}

function readSeen(p: string): SeenMap {
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {}
  } catch {
    return {}
  }
}

// Read prior mentions to compute the cumulative self-audit precision (fired vs. human-marked acted).
function readMentionsTally(p: string): { fired: number; acted: number } {
  let fired = 0
  let acted = 0
  try {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t) continue
      fired++
      try {
        if ((JSON.parse(t) as { acted?: boolean }).acted === true) acted++
      } catch {
        /* ignore a malformed line in the tally */
      }
    }
  } catch {
    /* no log yet */
  }
  return { fired, acted }
}

// ---- fetch a subreddit's /new.json (public, no auth). Fail-soft per sub. ----
async function fetchListing(name: string, limit: number): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(name)}/new.json?limit=${limit}`
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000), // never let a hung connection stall the daily run
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseListing(await res.text())
}

// ---- Haiku classify (native fetch, NO web_search tool — pure text classification). ----
async function classify(post: RedditPost, prompt: string): Promise<Classification | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CITATION_MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000), // bound the classify call so one hung request can't stall the run
  })
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  return parseClassification(text)
}

// Map a matched-fact kind → the derived envelope's generatedAt (guardrail 2: factAsOf).
function factAsOf(fact: CitableFact, asOf: Record<string, string>): string {
  return asOf[fact.kind] ?? ''
}

async function main(): Promise<void> {
  const { dry, limit: limitArg } = parseArgs(process.argv.slice(2))
  const { subreddits, limit: cfgLimit } = loadSubreddits()
  const limit = limitArg ?? cfgLimit

  // Shared honesty sources + per-kind freshness stamps (read the SAME committed derived envelopes).
  const dir = derivedDir()
  const sources = loadPackagerSources(dir)
  const asOf = loadDerivedGeneratedAt(dir)

  // Inventory vocabulary: store names + brand/product display names from the committed facts.
  const inventoryTokens = buildInventoryTokens(dir)
  const ctx = { regions: sources.regions, inventoryTokens, categoryKeys: CATEGORY_TERMS }

  // 1) Fetch (or read a fixture / skip on dry-without-fixture).
  const posts: RedditPost[] = []
  const fixture = process.env.REDDIT_FIXTURE
  if (fixture) {
    try {
      posts.push(...parseListing(fs.readFileSync(fixture, 'utf8')))
    } catch (err) {
      console.warn(`  ! fixture read failed — ${err instanceof Error ? err.message : err}`)
    }
  } else if (dry) {
    console.log('  (dry run: no network fetch; set REDDIT_FIXTURE to exercise the pipeline offline)')
  } else {
    let first = true
    for (const sub of subreddits) {
      if (!first) await sleep(REQUEST_GAP_MS)
      first = false
      try {
        posts.push(...(await fetchListing(sub.name, limit)))
      } catch (err) {
        console.warn(`  ! [r/${sub.name}] fetch skipped — ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  // 2) Pre-filter → survivors (precision gate, BEFORE any Haiku call).
  const survivors = posts.map((post) => ({ post, pre: preFilter(post, ctx) })).filter((s) => s.pre.passed)
  const survivorIds = new Set(survivors.map((s) => s.post.postId))
  const classifiedIds = new Set<string>() // survivors we actually got a classification for

  // 3) Classify + fact-gate each survivor.
  const candidates: ClassifiedCandidate[] = []
  let first = true
  for (const s of survivors) {
    let classification: Classification | null = null
    if (!dry) {
      if (!first) await sleep(REQUEST_GAP_MS)
      first = false
      try {
        classification = await classify(s.post, buildClassifyPrompt(s.post, s.pre))
      } catch (err) {
        console.warn(`  ! classify skipped for ${s.post.postId} — ${err instanceof Error ? err.message : err}`)
      }
    }
    if (!classification) continue // dry / no-key / transient error → retried next run (not marked seen)
    classifiedIds.add(s.post.postId)

    // Only a product-category term maps to selectFact's category vocabulary. A store/brand token
    // won't match a category, so passing it would suppress the region-floor fact for a store/brand-
    // only thread; fall back to '' so selectFact returns the region's best available floor instead.
    const topic = s.pre.matchedCategory ?? ''
    const geo: GeoResolution = resolveGeo(s.pre.geoTokens[0] ?? '', sources.regions)
    const result = selectFact(topic, geo, sources)
    const fact = result.kind === 'none' ? null : result
    candidates.push({
      post: s.post,
      pre: s.pre,
      classification,
      fact,
      factAsOf: fact ? factAsOf(fact, asOf) : '',
      factFreshness: fact ? 'fresh' : '', // selectFact already excludes stale floors upstream
    })
  }

  // 4) Assemble alerts (threshold + fact-gate + dedup against the seen set).
  const sPath = seenPath(dry)
  const seenMap = expireSeen(readSeen(sPath))
  const seenSet = new Set(Object.keys(seenMap))
  const alerts = buildAlerts(candidates, seenSet, {})

  // 5) Persist: append alert rows, advance the seen set, self-audit line.
  const mPath = mentionsPath(dry)
  const tally = readMentionsTally(mPath)
  if (alerts.length > 0) {
    fs.mkdirSync(path.dirname(mPath), { recursive: true })
    fs.appendFileSync(mPath, alerts.map((a) => JSON.stringify(a)).join('\n') + '\n')
  }
  // Advance the seen set for a post we are done with: a deterministic non-survivor (re-running the
  // gate gives the same drop) OR a survivor we actually classified. A survivor left unclassified
  // (dry / no key / a transient classify error) is deliberately NOT marked seen, so it is retried
  // next run instead of being permanently lost while its thread is still live.
  const now = new Date().toISOString()
  for (const p of posts) {
    if (!survivorIds.has(p.postId) || classifiedIds.has(p.postId)) seenMap[p.postId] = now
  }
  atomicWrite(sPath, JSON.stringify(seenMap, null, 0))

  const line = precisionLine(alerts.length, tally.fired + alerts.length, tally.acted)
  const md = renderAlertsMarkdown(alerts, now)

  console.log(`=== reddit mention-monitor${dry ? ' (dry)' : ''} ===`)
  console.log(
    `  fetched ${posts.length} post(s); ${survivors.length} passed the precision gate; ${alerts.length} alert(s)`,
  )
  console.log(`  ${line}`)
  console.log(`  mentions: ${mPath}`)
  console.log('')
  console.log(md)
  // Marker line the PowerShell runner reads for the Action-Center toast body.
  console.log(`SUMMARY: ${alerts.length} Reddit alert(s) — ${survivors.length} survivor(s) of ${posts.length} fetched`)
}

// ---- derived-envelope readers (freshness + inventory) ----

// Read each committed derived file's envelope `generatedAt` into a fact-kind → timestamp map, using
// the SAME envelope readers the served routes use (fail-soft to the fixed epoch on a missing file).
function loadDerivedGeneratedAt(dir: string): Record<string, string> {
  const read = (file: string): string => {
    try {
      const env = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as { generatedAt?: string }
      return typeof env.generatedAt === 'string' ? env.generatedAt : ''
    } catch {
      return ''
    }
  }
  return {
    disparity: read('disparities.json'),
    'regional-floor': read('regional-price-floor.json'),
    'own-median': read('price-vs-own-median.json'),
  }
}

// Build the inventory token set: dispensary names (from the SAME data.json the site serves) plus
// brand/product display names from the committed disparities + regional-floor facts.
function buildInventoryTokens(dir: string): Set<string> {
  const names: string[] = []
  try {
    for (const d of buildApiData().dispensaries) if (d.name) names.push(d.name)
  } catch {
    /* no data.json → geo/category signals still work */
  }
  const pushDisplayNames = (file: string, pick: (o: unknown) => string[]): void => {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
      names.push(...pick(parsed))
    } catch {
      /* fail-soft */
    }
  }
  pushDisplayNames('disparities.json', (o) => {
    const arr = (o as { data?: { disparities?: Array<{ displayName?: string }> } })?.data?.disparities
    return Array.isArray(arr) ? arr.map((d) => d?.displayName ?? '').filter(Boolean) : []
  })
  pushDisplayNames('regional-price-floor.json', (o) => {
    const clusters = (o as { data?: { clusters?: Array<{ floors?: Array<{ displayName?: string }> }> } })?.data?.clusters
    if (!Array.isArray(clusters)) return []
    return clusters.flatMap((c) => (Array.isArray(c?.floors) ? c.floors.map((f) => f?.displayName ?? '') : [])).filter(Boolean)
  })
  return tokenizeInventory(names)
}

// Run only when executed directly (tsx/node), NOT when imported by tests (importing must have no
// side effects). Mirrors opportunityFinderRun.ts.
const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((err) => {
    // Last-resort fail-soft: never crash on an unexpected error.
    console.error('reddit mention-monitor: unexpected error —', err instanceof Error ? err.message : err)
    process.exitCode = 0
  })
}
