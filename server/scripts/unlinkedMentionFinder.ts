// Unlinked-mention finder — PURE logic (no fs, no network), so it is unit-testable.
// Backlink Measure-and-Surface Tooling, Story 1.4 / ADR-116 (see project_backlink-tooling and
// project_reach-launch-plan). The fourth and last of the four backlink tools. Given raw brand
// mentions found by the citation-monitor search path (Haiku + web_search / Perplexity — AR-5) and,
// optionally, the set of domains that a manual GSC "Top linking sites" export says already link to
// gmaslist.com, it filters mentions to real chase-worthy sources (drop rivals/aggregators, our own
// domain, pages that already link, and linkless URLs), dedupes against a persisted monotonic
// known-mention set, and renders a short chase list of the NEW-since-last-run unlinked mentions.
//
// It is MEASURE-AND-SURFACE only: it performs no outreach, no posting, no link placement. A human
// does every act of outreach. It reads NO derived facts and does NOT call factPackager — this is
// about mentions of the brand, not price facts, so there is no fact-pairing / honesty-inheritance /
// freshness path here (unlike Story 1.3). The IO half (the web_search call, reading the GSC CSV +
// the known-mention JSON, writing the private report) lives in unlinkedMentionFinderRun.ts.

import { TARGET_DOMAIN, urlToDomain } from './citationMonitor.js'
import { isRivalOrOutChannel, suggestChannel, looseJsonArray } from './opportunityFinder.js'

// ---- shapes ----

// One raw mention as parsed from the search engine's answer (before any filtering).
export interface RawMention {
  url: string
  title?: string
  snippet?: string
  context?: string // the sentence/phrase around the brand mention, when the source gives one
  linksToTarget?: boolean // does the page hyperlink gmaslist.com? (engine-reported signal)
  postedDate?: string // ISO or as-seen date, when the source gives one
}

// One chase-list row (a NEW unlinked mention).
export interface Mention {
  url: string
  title: string
  context: string
  postedDate?: string
  suggestedChannel: string
  key: string // normalized dedup identity (see mentionKey)
}

// One entry in the persisted monotonic known-mention ledger.
export interface KnownMention {
  key: string
  url: string
  firstSeen: string // ISO timestamp of the run that first surfaced this mention
}

export interface KnownMentionSet {
  generatedAt: string
  targetDomain: string
  mentions: KnownMention[]
}

// The report a run produces: only the NEW-since-last-run unlinked mentions.
export interface ChaseList {
  generatedAt: string
  scanned: number // raw mentions seen
  newCount: number // NEW unlinked mentions surfaced this run (after any --limit display cap)
  knownCount: number // size of the known ledger AFTER this run
  reason?: string // set when the chase list is empty, explaining why
  mentions: Mention[]
}

export interface BuildOptions {
  limit?: number // cap the DISPLAYED chase list (default: no cap — show all new)
  now?: Date // injectable clock for deterministic firstSeen/generatedAt in tests
  gscDomains?: Set<string> // domains GSC says already link to us (cross-check exclusion)
}

// ---- brand matching (FR-10) ----

// The brand needles, normalized so apostrophes/spaces don't matter: "gmaslist", "gma's list",
// "gmas list", "gma s list" all reduce to the same token stream. We compare on a collapsed form.
const BRAND_FORMS = ['gmaslist', 'gmas list', 'gma s list']

// Collapse text for brand matching: lowercase, strip apostrophes, collapse any run of non-alnum to
// a single space. "Gma's List" → "gma s list"; "GMASLIST.com" → "gmaslist com".
function collapseForBrand(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// True when the mention's own text actually names the brand (guards against the engine returning
// irrelevant results — AC-1 "text actually mentions the brand").
export function mentionsBrand(m: RawMention): boolean {
  const hay = collapseForBrand(`${m.title ?? ''} ${m.snippet ?? ''} ${m.context ?? ''}`)
  return BRAND_FORMS.some((form) => hay.includes(form))
}

// ---- dedup identity (FR-11) ----

// Normalized dedup key for a mention: registrable-ish host (lowercased, www-stripped) + normalized
// path (lowercased, trailing slash trimmed, query + fragment dropped). www/case/trailing-slash/
// query differences collapse to ONE key so the same page is never re-reported as new. Returns ''
// for an unparseable URL (caller drops it).
export function mentionKey(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (!host) return ''
  let pathPart = parsed.pathname.toLowerCase()
  if (pathPart.length > 1) pathPart = pathPart.replace(/\/+$/, '')
  if (pathPart === '/') pathPart = ''
  return `${host}${pathPart}`
}

// ---- GSC cross-check (AR-6) ----

// Parse a manual GSC "Top linking sites" CSV export into a set of linking domains (www-stripped,
// lowercased). Tolerant: pulls the first domain-like token from each row, ignoring header/blank/
// garbage rows. Returns an empty set on unparseable input (fail-soft — the caller then relies on
// the engine's per-page link signal alone).
export function normalizeGscDomains(csvText: string): Set<string> {
  const out = new Set<string>()
  for (const line of (csvText ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Split on comma/tab/semicolon; inspect each cell for a domain-like token.
    for (const rawCell of trimmed.split(/[,\t;]/)) {
      const cell = rawCell.trim().replace(/^["']|["']$/g, '')
      if (!cell) continue
      // Accept a bare host (a.b.com) or a URL (https://a.b.com/...). Reject header words.
      let host = ''
      if (/^https?:\/\//i.test(cell)) {
        host = urlToDomain(cell)
      } else if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cell)) {
        host = cell.toLowerCase().replace(/^www\./, '')
      }
      if (host) {
        out.add(host)
        break // one domain per row is enough
      }
    }
  }
  return out
}

// True when the mention should be treated as already linking to gmaslist.com: either the engine
// reported the page links, OR the source's domain appears in the GSC linking-sites export. The GSC
// check is conservative (a domain can have both linking and non-linking pages) — that is the SAFE
// direction for a chase list: never chase a domain that already links to us.
export function alreadyLinks(m: RawMention, gscDomains: Set<string>): boolean {
  if (m.linksToTarget === true) return true
  const host = urlToDomain(m.url)
  return host.length > 0 && gscDomains.has(host)
}

// ---- chase-list assembly (FR-10/11/12) ----

// Filter → dedup against the known ledger → return the NEW rows + the grown ledger. Pure;
// `opts.now` makes firstSeen/generatedAt deterministic in tests.
//
// Known-set growth vs --limit: by default there is NO cap (unlinked brand mentions are rare for a
// ~0-backlink brand, and every real one is a distinct opportunity). When `opts.limit` truncates the
// DISPLAYED list, only the displayed rows are folded into the ledger, so the overflow resurfaces
// next run rather than being silently swallowed (SM-C1: don't pad; but don't lose either).
export function buildChaseList(
  rawMentions: RawMention[],
  known: KnownMentionSet,
  opts: BuildOptions = {},
): { chaseList: ChaseList; updatedKnown: KnownMentionSet } {
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const gscDomains = opts.gscDomains ?? new Set<string>()
  const scanned = rawMentions.length

  const knownKeys = new Set(known.mentions.map((k) => k.key))
  const seenThisRun = new Set<string>()
  const fresh: Mention[] = []

  for (const m of rawMentions) {
    if (isRivalOrOutChannel(m.url)) continue // rival/OUT-channel or unparseable/linkless URL
    const host = urlToDomain(m.url)
    if (host === TARGET_DOMAIN || host.endsWith(`.${TARGET_DOMAIN}`)) continue // never our own page
    if (!mentionsBrand(m)) continue // must actually name the brand
    if (alreadyLinks(m, gscDomains)) continue // already a backlink — nothing to chase

    const key = mentionKey(m.url)
    if (!key) continue // unparseable → not verifiable (NFR-3)
    if (knownKeys.has(key) || seenThisRun.has(key)) continue // dedup: prior run or within this run
    seenThisRun.add(key)

    fresh.push({
      url: m.url,
      title: (m.title ?? m.url).trim() || m.url,
      context: (m.context ?? m.snippet ?? '').trim(),
      postedDate: m.postedDate,
      suggestedChannel: suggestChannel({ url: m.url }),
      key,
    })
  }

  // Stable order: dated-newest first, then by URL. Undated sink below dated.
  fresh.sort((a, b) => {
    const ad = a.postedDate ? Date.parse(a.postedDate) : NaN
    const bd = b.postedDate ? Date.parse(b.postedDate) : NaN
    const av = Number.isNaN(ad) ? -Infinity : ad
    const bv = Number.isNaN(bd) ? -Infinity : bd
    return bv - av || a.url.localeCompare(b.url)
  })

  const limit = opts.limit && opts.limit > 0 ? opts.limit : undefined
  const shown = limit ? fresh.slice(0, limit) : fresh

  // Monotonic ledger: union the existing known set with ONLY the shown new mentions.
  const updatedMentions: KnownMention[] = [...known.mentions]
  for (const m of shown) {
    updatedMentions.push({ key: m.key, url: m.url, firstSeen: nowIso })
  }
  const updatedKnown: KnownMentionSet = {
    generatedAt: nowIso,
    targetDomain: TARGET_DOMAIN,
    mentions: updatedMentions,
  }

  const reason =
    shown.length === 0
      ? scanned === 0
        ? 'the search returned no candidate mentions'
        : 'no new unlinked mention survived the filters (all were rivals/self, already-linked, or already known)'
      : undefined

  const chaseList: ChaseList = {
    generatedAt: nowIso,
    scanned,
    newCount: shown.length,
    knownCount: updatedMentions.length,
    reason,
    mentions: shown,
  }

  return { chaseList, updatedKnown }
}

// ---- rendering (FR-12) ----

export function renderChaseListMarkdown(chaseList: ChaseList): string {
  const lines: string[] = []
  lines.push('# Unlinked-mention chase list')
  lines.push('')
  lines.push(
    `Generated ${chaseList.generatedAt}. Scanned ${chaseList.scanned} candidate(s); ` +
      `${chaseList.newCount} NEW unlinked mention(s) this run; ${chaseList.knownCount} known in total.`,
  )
  lines.push('')

  if (chaseList.mentions.length === 0) {
    lines.push(`No new unlinked mentions this run — ${chaseList.reason ?? 'nothing qualified'}.`)
    lines.push('')
    lines.push('Nothing new to chase. (Already-linked, rival, and previously-seen mentions are not re-listed.)')
    return lines.join('\n') + '\n'
  }

  chaseList.mentions.forEach((m, i) => {
    lines.push(`## ${i + 1}. ${m.title}`)
    lines.push(`- Source: ${m.url}${m.postedDate ? ` (${m.postedDate})` : ''}`)
    if (m.context) lines.push(`- Context: ${m.context}`)
    lines.push(`- Suggested channel: ${m.suggestedChannel}`)
    lines.push('')
  })
  lines.push('---')
  lines.push('MEASURE-AND-SURFACE only — you do the outreach. These pages mention gmaslist without linking; confirm each on the source page before reaching out.')
  return lines.join('\n') + '\n'
}

export function renderChaseListJson(chaseList: ChaseList): string {
  return JSON.stringify(chaseList, null, 2) + '\n'
}

export function renderKnownSetJson(known: KnownMentionSet): string {
  return JSON.stringify(known, null, 2) + '\n'
}
