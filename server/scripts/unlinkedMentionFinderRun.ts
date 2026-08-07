// Unlinked-mention finder — IO entry point (Story 1.4 / ADR-116). Uses the citation monitor's
// Haiku + web_search / Perplexity search path (AR-5, reused via searchEngines.ts — no new engine,
// no paid API) to find public pages that mention "gmaslist" / "gma's list" without linking to
// gmaslist.com, cross-checks against a manual GSC "Top linking sites" export, dedupes against a
// persisted monotonic known-mention ledger, and writes a chase list of the NEW-since-last-run
// unlinked mentions. MEASURE-AND-SURFACE only: it does no outreach — a human acts on the chase
// list. All filter/dedup/render logic is pure in unlinkedMentionFinder.ts; this file is IO.
//
//   Manual run:  cd server ; npx tsx scripts/unlinkedMentionFinderRun.ts
//   Dry run:     cd server ; npx tsx scripts/unlinkedMentionFinderRun.ts --dry   (no key/cost)
//   Cap display: cd server ; npx tsx scripts/unlinkedMentionFinderRun.ts --limit 15
//
// Env:
//   ANTHROPIC_API_KEY / PERPLEXITY_API_KEY - enable the live search engines (else --dry behavior)
//   GSC_LINKS_EXPORT - manual GSC "Top linking sites" CSV (default: ~/GmaS-data/gsc-links-export.csv)
//   MENTIONS_DIR     - dir to read/write the ledger + chase list (default: ~/GmaS-data)
//
// OUTPUT is PRIVATE operator work-product — printed to stdout and recorded under ~/GmaS-data/
// (never committed, never served — ADR-116, mirrors ADR-113/114/115). Runs on demand AND, once
// wired by scripts/ai-citation-local.ps1 (AR-4 go-ahead granted for Story 1.4), on the weekly
// Mon 05:00 Task after the monitor + share tracker. Fail-soft: an unavailable/empty/unparseable
// search, a missing GSC export, or a corrupt ledger yields an empty/partial chase list stating the
// reason, exit 0 — never a crash, never a fabricated mention.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { selectEngines, sleep, REQUEST_GAP_MS } from './searchEngines.js'
import { TARGET_DOMAIN } from './citationMonitor.js'
import { looseJsonArray } from './opportunityFinder.js'
import {
  buildChaseList,
  mentionsBrand,
  normalizeGscDomains,
  renderChaseListMarkdown,
  renderChaseListJson,
  renderKnownSetJson,
  type RawMention,
  type KnownMentionSet,
} from './unlinkedMentionFinder.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function mentionsDir(): string {
  return process.env.MENTIONS_DIR ?? path.join(os.homedir(), 'GmaS-data')
}

function gscExportPath(): string {
  return process.env.GSC_LINKS_EXPORT ?? path.join(os.homedir(), 'GmaS-data', 'gsc-links-export.csv')
}

interface Args {
  limit?: number
  dry: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { dry: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--limit') {
      const n = Number.parseInt(argv[++i] ?? '', 10)
      if (Number.isFinite(n) && n > 0) args.limit = n
    } else if (a === '--dry') {
      args.dry = true
    }
  }
  return args
}

// The search prompt (IO layer): instruct the engine to find public pages mentioning the brand that
// do NOT link to gmaslist.com and return ONLY a JSON array. Parsing is defensive, so wrapping prose
// / fences are tolerated.
export function buildSearchPrompt(): string {
  return [
    `Find recent PUBLIC web pages that mention the WA cannabis price-comparison site "gmaslist"`,
    `(also written "gma's list", the site gmaslist.com) but that do NOT hyperlink to gmaslist.com.`,
    `Prefer pages that name the brand in text without linking it — blog posts, local news, Reddit`,
    `and community threads, journalist pages, forums.`,
    ``,
    `EXCLUDE gmaslist.com's own pages.`,
    `EXCLUDE weedmaps, leafly, leafbuyer, yelp, and any directory/aggregator site.`,
    ``,
    `Return ONLY a JSON array (no prose) of objects with these fields:`,
    `{"url": string, "title": string, "snippet": string, "context": string, "linksToTarget": boolean, "postedDate": string}`,
    `- context = the sentence or phrase around the "gmaslist" mention`,
    `- linksToTarget = true if the page hyperlinks gmaslist.com, false if it only names it in text`,
    `- postedDate = the page/post date (ISO if known) or "" if unknown`,
    `If you find nothing suitable, return [].`,
  ].join('\n')
}

function atomicWrite(filePath: string, contents: string): void {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, contents)
  fs.renameSync(tmp, filePath)
}

// Read + normalize the manual GSC linking-sites export. Fail-soft: absent/unreadable → empty set +
// a stated reason (the finder then relies on the engine's per-page link signal alone).
function loadGscDomains(): { domains: Set<string>; note: string } {
  const p = gscExportPath()
  if (!fs.existsSync(p)) {
    return { domains: new Set(), note: `no GSC export at ${p} — using the engine link signal only` }
  }
  try {
    const domains = normalizeGscDomains(fs.readFileSync(p, 'utf8'))
    return { domains, note: `GSC export: ${domains.size} linking domain(s) cross-checked` }
  } catch (err) {
    return {
      domains: new Set(),
      note: `GSC export unreadable (${err instanceof Error ? err.message : err}) — using the engine link signal only`,
    }
  }
}

// Read the persisted known-mention ledger. Fail-soft: absent → empty; corrupt → empty + a warning
// (a corrupt ledger must not crash, nor silently re-flag the whole world as "new" without a stated
// reason). Mirrors citationShareRun.readExistingDatapoints.
function loadKnownSet(filePath: string): { known: KnownMentionSet; warn?: string } {
  const empty: KnownMentionSet = { generatedAt: '', targetDomain: TARGET_DOMAIN, mentions: [] }
  if (!fs.existsSync(filePath)) return { known: empty }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<KnownMentionSet>
    const mentions = Array.isArray(parsed.mentions)
      ? parsed.mentions.filter(
          (m): m is { key: string; url: string; firstSeen: string } =>
            Boolean(m) && typeof m.key === 'string' && typeof m.url === 'string',
        )
      : []
    return { known: { generatedAt: parsed.generatedAt ?? '', targetDomain: TARGET_DOMAIN, mentions } }
  } catch {
    return {
      known: empty,
      warn: 'existing unlinked-mentions-known.json is unreadable — treating as empty (this run may re-report prior mentions as new)',
    }
  }
}

// Parse the mention-shaped objects out of one engine answer, reusing the shared tolerant extraction
// (fences/prose/single-object/garbage → []). Only entries with a non-empty string url are kept.
function parseMentions(answerText: string): RawMention[] {
  const out: RawMention[] = []
  for (const item of looseJsonArray(answerText)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const url = typeof o.url === 'string' ? o.url.trim() : ''
    if (!url) continue
    out.push({
      url,
      title: typeof o.title === 'string' ? o.title : undefined,
      snippet: typeof o.snippet === 'string' ? o.snippet : undefined,
      context: typeof o.context === 'string' ? o.context : undefined,
      linksToTarget: typeof o.linksToTarget === 'boolean' ? o.linksToTarget : undefined,
      postedDate: typeof o.postedDate === 'string' ? o.postedDate : undefined,
    })
  }
  return out
}

// Run the search across the selected engines, collecting parsed + brand-verified mentions. Fail-soft
// per engine: an engine error is logged and skipped, never thrown. Dedups by URL across engines.
async function search(forceDry: boolean): Promise<{ mentions: RawMention[]; note: string }> {
  const engines = selectEngines(forceDry)
  const prompt = buildSearchPrompt()
  const mentions: RawMention[] = []
  const seen = new Set<string>()
  let first = true
  let anyOk = false

  for (const engine of engines) {
    if (!first) await sleep(REQUEST_GAP_MS)
    first = false
    try {
      const answer = await engine.ask(prompt)
      anyOk = true
      for (const m of parseMentions(answer.answerText)) {
        if (seen.has(m.url)) continue
        seen.add(m.url)
        mentions.push(m)
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
  // Keep only mentions whose text actually names the brand (drop off-topic engine results early).
  const branded = mentions.filter((m) => mentionsBrand(m))
  return { mentions: branded, note }
}

async function main(): Promise<void> {
  const { limit, dry } = parseArgs(process.argv.slice(2))
  const dir = mentionsDir()
  const knownPath = path.join(dir, 'unlinked-mentions-known.json')

  const { known, warn } = loadKnownSet(knownPath)
  if (warn) console.warn(`WARN: ${warn}`)
  const { domains: gscDomains, note: gscNote } = loadGscDomains()
  const { mentions, note } = await search(dry)

  const { chaseList, updatedKnown } = buildChaseList(mentions, known, { limit, gscDomains })
  const md = renderChaseListMarkdown(chaseList)

  // Write the private records (stdout is the deliverable; these are the traceable copies, NFR-3).
  let chasePath = ''
  try {
    fs.mkdirSync(dir, { recursive: true })
    chasePath = path.join(dir, 'unlinked-mentions.md')
    atomicWrite(chasePath, md)
    atomicWrite(path.join(dir, 'unlinked-mentions.json'), renderChaseListJson(chaseList))
    atomicWrite(knownPath, renderKnownSetJson(updatedKnown))
  } catch (err) {
    console.warn('WARN: could not write private record —', err instanceof Error ? err.message : err)
  }

  console.log('=== unlinked-mention finder ===')
  console.log(`  ${note}`)
  console.log(`  ${gscNote}`)
  console.log(
    `  scanned ${chaseList.scanned} candidate(s); ${chaseList.newCount} new unlinked mention(s); ${chaseList.knownCount} known total`,
  )
  if (chasePath) console.log(`  record: ${chasePath}`)
  console.log('')
  console.log(md)
}

// Run only when executed directly (tsx/node), NOT when imported (e.g. tests importing parseArgs /
// buildSearchPrompt) — importing must have no side effects. Mirrors opportunityFinderRun.ts.
const invokedDirectly =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((err) => {
    // Last-resort fail-soft: never crash on an unexpected error.
    console.error('unlinked-mention finder: unexpected error —', err instanceof Error ? err.message : err)
    process.exitCode = 0
  })
}
