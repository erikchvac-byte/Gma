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
//   REDDIT_FETCH_GAP_MS - ms between subreddit .rss fetches (default 4000; raise if Reddit 429s)
//   REDDIT_LOG_PATH    - explicit mentions-log path; REQUIRED semantics under --dry (isolation)
//   REDDIT_FIXTURE     - optional path to a saved subreddit .json listing, honored ONLY under
//                        --dry (survivors get a stub classification so the full pipeline —
//                        gate → selectFact → alerts → isolated log — runs offline; a live run
//                        ignores the fixture and warns)
//
// See project_reach-launch-plan (Phase 2), the build-ready brainstorm, and ADR-106.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { sleep, REQUEST_GAP_MS, CITATION_MODEL } from './searchEngines.js'
import { loadPackagerSources, derivedDir } from './factPackagerRun.js'
import { resolveGeo, selectFact, type GeoResolution, type CitableFact, type PackagerSources } from './factPackager.js'
import { buildApiData } from '../utils/buildApiData.js'
import { atomicWriteJson } from '../utils/atomicWrite.js'
import {
  parseListing,
  parseRssListing,
  preFilter,
  buildClassifyPrompt,
  parseClassification,
  buildAlerts,
  expireSeen,
  precisionLine,
  renderAlertsMarkdown,
  tokenizeInventory,
  factConcernsBrand,
  factFreshnessFrom,
  BRAND_SPECIFIC_INTENTS,
  CATEGORY_TERMS,
  INTENT_ROUTES,
  type RedditPost,
  type ClassifiedCandidate,
  type Classification,
  type AlertRow,
  type SeenMap,
} from './redditMonitor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const USER_AGENT = 'windows:gmaslist-reddit-monitor:v1.0 (local reach tool; contact erikchvac@gmail.com)'

// Gap between successive subreddit .rss fetches. Reddit rate-limits the unauthenticated Atom feed
// (429s under a burst), so pace fetches wider than the shared Anthropic REQUEST_GAP_MS. Tunable via
// REDDIT_FETCH_GAP_MS if a daily run ever shows persistent all-sub 429s (else the fallback is the
// OAuth API — see ADR-118). Only ~9 subs/day, so a few seconds each is negligible wall-time.
const REDDIT_FETCH_GAP_MS = Math.max(0, Number.parseInt(process.env.REDDIT_FETCH_GAP_MS ?? '', 10) || 4000)

interface Args {
  dry: boolean
  limit?: number
}
export function parseArgs(argv: string[]): Args {
  const args: Args = { dry: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry') args.dry = true
    else if (argv[i] === '--limit') {
      // Only consume a REAL value — `--limit --dry` must not swallow the flag (a swallowed --dry
      // is an accidental live run). A bad/missing value leaves limit unset → the config default.
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        i++
        const n = Number.parseInt(next, 10)
        if (Number.isFinite(n) && n > 0) args.limit = n
      }
    }
  }
  return args
}

interface SubredditConfig {
  name: string
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

// ---- fetch a subreddit's /new.rss (public Atom feed, no auth). Fail-soft per sub. ----
// Reddit 403s the unauthenticated /new.json path from many IPs (verified 2026-08-10); the .rss
// Atom feed stays public, so it is the ingestion source. See ADR-118 / parseRssListing.
async function fetchListing(name: string, limit: number): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(name)}/new.rss?limit=${limit}`
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/atom+xml, application/xml;q=0.9, text/xml;q=0.8' },
    signal: AbortSignal.timeout(15_000), // never let a hung connection stall the daily run
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseRssListing(await res.text(), name)
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

async function main(): Promise<void> {
  const { dry, limit: limitArg } = parseArgs(process.argv.slice(2))
  const { subreddits, limit: cfgLimit } = loadSubreddits()
  const limit = limitArg ?? cfgLimit

  // Shared honesty sources + per-kind freshness stamps (read the SAME committed derived envelopes).
  const dir = derivedDir()
  const sources = loadPackagerSources(dir)
  const asOf = loadDerivedGeneratedAt(dir)

  // Inventory vocabulary: store names + brand/product display names from the committed facts.
  const inventoryTokens = buildInventoryTokens(sources)
  const ctx = { regions: sources.regions, inventoryTokens, categoryKeys: CATEGORY_TERMS }
  // With no regions (or an empty inventory vocabulary) the gate's drops are a symptom of degraded
  // inputs, not the posts — loadPackagerSources fail-softs to empty on a bad file. The seen set
  // must NOT advance on such a run or still-live threads are buried forever.
  const sourcesHealthy = sources.regions.length > 0 && inventoryTokens.size > 0
  if (!sourcesHealthy) console.warn('  ! derived sources look empty/degraded — gate results are unreliable this run')

  // 1) Fetch (or read a fixture under --dry / skip on dry-without-fixture). A fixture is ONLY
  // honored on a dry run: a lingering REDDIT_FIXTURE env var must never silently replace the real
  // poll on a live run (stale alerts into real state, real API spend on dead threads).
  const posts: RedditPost[] = []
  const fixture = process.env.REDDIT_FIXTURE
  if (fixture && !dry) {
    console.warn('  ! REDDIT_FIXTURE is set but this is a LIVE run — ignoring the fixture and polling Reddit')
  }
  if (fixture && dry) {
    try {
      const rawFixture = fs.readFileSync(fixture, 'utf8')
      // Accept either a saved .rss Atom feed (the live source) or a legacy .json listing fixture.
      const parsed = rawFixture.trimStart().startsWith('<') ? parseRssListing(rawFixture) : parseListing(rawFixture)
      posts.push(...parsed)
    } catch (err) {
      console.warn(`  ! fixture read failed — ${err instanceof Error ? err.message : err}`)
    }
  } else if (dry) {
    console.log('  (dry run: no network fetch; set REDDIT_FIXTURE to exercise the pipeline offline)')
  } else {
    let first = true
    for (const sub of subreddits) {
      if (!first) await sleep(REDDIT_FETCH_GAP_MS)
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
  const irrelevantIds = new Set<string>() // classified intent 0 (definitively not a shopping post)

  // 3) Classify + fact-gate each survivor.
  const candidates: ClassifiedCandidate[] = []
  let first = true
  for (const s of survivors) {
    let classification: Classification | null = null
    if (dry) {
      // A dry run must exercise the FULL pipeline offline (fixture → gate → selectFact → alert →
      // isolated log), so survivors get a deterministic stub instead of a Haiku call.
      classification = { intent: 1, geoConfidence: 1, matchedStore: '', matchedBrand: '', routedTool: INTENT_ROUTES[1].routedTool }
    } else {
      if (!first) await sleep(REQUEST_GAP_MS)
      first = false
      try {
        classification = await classify(s.post, buildClassifyPrompt(s.post, s.pre))
      } catch (err) {
        console.warn(`  ! classify skipped for ${s.post.postId} — ${err instanceof Error ? err.message : err}`)
      }
    }
    if (!classification) continue // no-key / transient error → retried next run (not marked seen)
    if (classification.intent === 0) {
      irrelevantIds.add(s.post.postId) // done with it: never alertable, safe to mark seen
      continue
    }

    // Only a product-category term maps to selectFact's category vocabulary. A store/brand token
    // won't match a category, so passing it would suppress the region-floor fact for a store/brand-
    // only thread; fall back to '' so selectFact returns the region's best available floor instead.
    const topic = s.pre.matchedCategory ?? ''
    const geo: GeoResolution = resolveGeo(s.pre.geoTokens[0] ?? '', sources.regions)
    const result = selectFact(topic, geo, sources)
    let fact: CitableFact | null = result.kind === 'none' ? null : result

    // Brand-specific intents ("anyone tried X?", "which store carries X cheapest") must not be
    // "answered" by a fact about an unrelated product — suppress honestly instead.
    const brand = classification.matchedBrand || s.pre.matchedBrand || ''
    if (fact && BRAND_SPECIFIC_INTENTS.has(classification.intent) && brand && !factConcernsBrand(fact, brand)) {
      fact = null
    }

    const factTs = fact ? (asOf[fact.kind] ?? '') : ''
    candidates.push({
      post: s.post,
      pre: s.pre,
      classification,
      fact,
      factAsOf: factTs,
      // Envelope-age freshness: selectFact's stale gate only covers regional floors, so a
      // disparity/own-median fact from a stalled derive must be stamped 'stale', never asserted fresh.
      factFreshness: fact ? factFreshnessFrom(factTs) : '',
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
  // Advance the seen set ONLY for posts we are truly done with: deterministic non-survivors
  // (re-running the gate gives the same drop), alerted posts, and classified-irrelevant (intent 0)
  // posts. A survivor whose alert was suppressed by a TIME-VARYING gate (no gated fact yet,
  // confidence jitter, transient classify error) is NOT marked seen — it is retried while the
  // thread stays in /new instead of being permanently lost the first bad day. And none of this
  // runs on degraded sources, where "non-survivor" is meaningless.
  const now = new Date().toISOString()
  if (sourcesHealthy) {
    const alertedIds = new Set(alerts.map((a) => a.postId))
    for (const p of posts) {
      if (!survivorIds.has(p.postId) || alertedIds.has(p.postId) || irrelevantIds.has(p.postId)) {
        seenMap[p.postId] = now
      }
    }
    fs.mkdirSync(path.dirname(sPath), { recursive: true })
    atomicWriteJson(sPath, seenMap)
  } else {
    console.warn('  ! seen set NOT advanced (degraded sources) — every post is retried next run')
  }

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
// brand/product display names from the already-loaded packager sources — no second parse of the
// derived files, no untyped envelope navigation to drift from the real shape.
function buildInventoryTokens(sources: PackagerSources): Set<string> {
  const names: string[] = []
  try {
    for (const d of buildApiData().dispensaries) if (d.name) names.push(d.name)
  } catch {
    /* no data.json → geo/category signals still work */
  }
  for (const d of sources.disparities) if (d?.displayName) names.push(d.displayName)
  for (const r of sources.regions) {
    for (const f of Array.isArray(r.floors) ? r.floors : []) if (f?.displayName) names.push(f.displayName)
  }
  return tokenizeInventory(names)
}

// Run only when executed directly (tsx/node), NOT when imported by tests (importing must have no
// side effects). Mirrors opportunityFinderRun.ts.
const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((err) => {
    // A FATAL error must be visible to the wrapper (heartbeat gate, '(errored)' toast, Task
    // Scheduler retry). Per-item failures are already fail-soft above; exiting 0 here would let
    // a permanently broken monitor advance the dead-man heartbeat forever.
    console.error('reddit mention-monitor: unexpected error —', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
