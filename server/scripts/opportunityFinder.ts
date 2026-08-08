// Opportunity finder — PURE logic (no fs, no network), so it is unit-testable.
// Backlink Measure-and-Surface Tooling, Story 1.3 / ADR-115 (see project_backlink-tooling and
// project_reach-launch-plan). Given raw candidate threads found by the citation-monitor search
// path (Haiku + web_search / Perplexity — AR-5) plus the already-derived honesty-gated facts, it
// filters candidates to WA + IN-channels (dropping rivals/aggregators and out-of-WA), pairs each
// surviving candidate with the single gated fact that answers it (delegating to Story 1.2's
// factPackager.selectFact — NO new fact math), ranks by fit, and renders a short worklist.
//
// It is MEASURE-AND-SURFACE only: it performs no outreach, no posting. A human does every act of
// outreach. The IO half (the web_search call, reading the derived JSON, writing the private
// report) lives in opportunityFinderRun.ts.
//
// Honesty is inherited wholesale from factPackager (AC-4): a candidate is kept only if selectFact
// returns a CitableFact, so every guard there (disparity LOW side only / never the "$84 Donny
// Burger" high side, stale floors skipped, sub-1%/premium own-median suppressed, non-finite/≤0
// rejected, no potency, no discount-hype, never implies gmaslist sells) applies unchanged. This
// module invents no number and no claim beyond what selectFact returned.

import { urlToDomain } from './citationMonitor.js'
import {
  resolveGeo,
  selectFact,
  topicMatchesCategory,
  renderCopy,
  NON_WA_TOKENS,
  WA_LOCALITY_TOKENS,
  type CitableFact,
  type GeoResolution,
  type PackagerSources,
} from './factPackager.js'
import type { Region } from '../utils/regionModel.js'

// ---- candidate + opportunity shapes ----

// One raw candidate thread as parsed from the search engine's answer (before any filtering).
export interface RawCandidate {
  url: string
  title?: string
  snippet?: string
  topic?: string // the product/category the thread is about (free text → derived category)
  geo?: string // the WA locality if the thread states one
  postedDate?: string // ISO or as-seen date, when the source gives one
}

// One ranked, fact-matched worklist row.
export interface Opportunity {
  url: string
  title: string
  postedDate?: string
  suggestedChannel: string
  fact: CitableFact
  factHeadline: string // compact one-line truthful summary (for the one-screen markdown)
  factCopy: string // the FULL paste-ready copy from factPackager.renderCopy (AC-4)
  factSourceUrl: string // the live gmaslist page that already publishes the fact (NFR-3)
  fitScore: number
}

export interface Worklist {
  topic: string
  geo: string
  generatedAt: string
  scanned: number // raw candidates seen
  kept: number // fact-matched, WA, IN-channel survivors (before the limit cap)
  reason?: string // set when the worklist is empty, explaining why
  opportunities: Opportunity[]
}

export interface BuildOptions {
  topic?: string // run-level topic fallback when a candidate omits one
  geo?: string // run-level geo bias fallback (NOT used to override a candidate's own geo)
  limit?: number // cap the worklist (default 10)
  now?: Date // injectable clock for deterministic recency scoring in tests
}

// ---- rival / OUT-channel list (FR-8, load-bearing) ----
// Directories/aggregators are RIVALS = OUT-channels, NEVER surfaced (the rival-not-distribution
// rule; project_backlink-tooling). Matched on host equality or a `.rival` suffix.
export const RIVAL_DOMAINS = new Set<string>([
  'weedmaps.com',
  'leafly.com',
  'leafbuyer.com',
  'yelp.com',
  'allbud.com',
  'dutchie.com',
  'iheartjane.com',
  'wikileaf.com',
  'cannabis.net',
  'bud.com',
])

// Well-known WA localities treated as a WA signal in free text even when they are not a covered
// region city — shared with the packager's resolveGeo (WA_LOCALITY_TOKENS) so both use one WA
// gazetteer. Deliberately excludes ambiguous names (e.g. "vancouver" — WA vs BC).

// ---- candidate parsing (NFR-1: never throws) ----

// Extract the model's JSON array of candidates from free-text answer output. Tolerates ```json
// fences, surrounding prose, a single object instead of an array, and junk — returns [] rather
// than throwing on anything unparseable. Only entries with a non-empty string `url` are kept.
// Extract the model's loose JSON from free-text answer output and normalize it to an array.
// Tolerates ```json fences, surrounding prose, a single object instead of an array, and junk —
// returns [] rather than throwing on anything unparseable (NFR-1). Shared by the opportunity
// finder (parseCandidates, below) and the unlinked-mention finder (parseMentions) so the one
// tolerant-extraction cascade has a single source of truth.
export function looseJsonArray(answerText: string): unknown[] {
  const text = (answerText ?? '').trim()
  if (!text) return []

  const tryParse = (raw: string): unknown => {
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  }

  // 1) whole thing; 2) inside a ```json ... ``` (or bare ```) fence; 3) the widest [ ... ] slice;
  // 4) the widest { ... } slice.
  let parsed: unknown = tryParse(text)
  if (parsed === undefined) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence?.[1]) parsed = tryParse(fence[1].trim())
  }
  if (parsed === undefined) {
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start !== -1 && end > start) parsed = tryParse(text.slice(start, end + 1))
  }
  if (parsed === undefined) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) parsed = tryParse(text.slice(start, end + 1))
  }
  if (parsed === undefined) return []

  return Array.isArray(parsed) ? parsed : [parsed]
}

export function parseCandidates(answerText: string): RawCandidate[] {
  const out: RawCandidate[] = []
  for (const item of looseJsonArray(answerText)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const url = typeof o.url === 'string' ? o.url.trim() : ''
    if (!url) continue
    out.push({
      url,
      title: typeof o.title === 'string' ? o.title : undefined,
      snippet: typeof o.snippet === 'string' ? o.snippet : undefined,
      topic: typeof o.topic === 'string' ? o.topic : undefined,
      geo: typeof o.geo === 'string' ? o.geo : undefined,
      postedDate: typeof o.postedDate === 'string' ? o.postedDate : undefined,
    })
  }
  return out
}

// ---- filters (FR-8) ----

// True when the URL resolves to a rival/aggregator OUT-channel, OR does not parse at all (a
// candidate with no verifiable link is not surfaced — AC-2 / NFR-3).
export function isRivalOrOutChannel(url: string): boolean {
  const host = urlToDomain(url) // '' for an unparseable URL
  if (!host) return true
  if (RIVAL_DOMAINS.has(host)) return true
  for (const rival of RIVAL_DOMAINS) {
    if (host.endsWith(`.${rival}`)) return true
  }
  return false
}

// True when the candidate is WA-relevant. Strong signals win: a geo that resolves to a covered
// region or the statewide sentinel is WA; an explicit out-of-WA geo is not. With only an
// uncovered/empty geo, inspect the title+snippet: keep on a clear WA signal with no non-WA signal,
// otherwise DROP (conservative — better to miss than to surface an out-of-state thread).
export function candidateGeoIsWa(candidate: RawCandidate, regions: Region[]): boolean {
  const geoRes = resolveGeo(candidate.geo ?? '', regions)
  if (geoRes.kind === 'out-of-wa') return false
  if (geoRes.kind === 'region' || geoRes.kind === 'statewide') return true

  const text = `${candidate.title ?? ''} ${candidate.snippet ?? ''} ${candidate.geo ?? ''}`.toLowerCase()
  // Whole-word phrase presence (word-boundary), so "kent" never matches "kentucky", "or" never
  // matches the conjunction, and a multi-word place like "mount vernon" matches spaced prose.
  const norm = ` ${text.replace(/[^a-z0-9]+/g, ' ').trim()} `
  const hasPhrase = (place: string): boolean => {
    const p = place.replace(/[^a-z0-9]+/g, ' ').trim()
    return p.length > 0 && norm.includes(` ${p} `)
  }

  // A non-WA signal only from UNAMBIGUOUS full place names (>=3 chars) — never the 2-letter state
  // abbreviations (or/id/ca/…), which collide with common English words in prose.
  const hasNonWa = [...NON_WA_TOKENS].some((t) => t.length >= 3 && hasPhrase(t))

  const waPlaces = new Set<string>(WA_LOCALITY_TOKENS)
  for (const r of regions) {
    for (const c of r.cities) waPlaces.add(c.toLowerCase())
    waPlaces.add(r.slug.toLowerCase())
    waPlaces.add(r.label.toLowerCase())
  }
  const hasWa = hasPhrase('wa') || hasPhrase('washington') || [...waPlaces].some((p) => hasPhrase(p))

  return hasWa && !hasNonWa
}

// ---- fact pairing (FR-7, delegates to factPackager — AC-4) ----

// The single gated fact that answers this candidate, or null if none does. Topic/geo fall back to
// the run-level values only when the candidate omits its own.
export function matchFact(
  candidate: RawCandidate,
  sources: PackagerSources,
  defaults: { topic?: string; geo?: string } = {},
): CitableFact | null {
  const topic = (candidate.topic ?? defaults.topic ?? '').trim()
  const geoStr = (candidate.geo ?? defaults.geo ?? '').trim()
  const resolved = resolveGeo(geoStr, sources.regions)
  // candidateGeoIsWa already established WA-relevance upstream, so an unrecognized locality string
  // must NOT now trip factPackager's WA-allowlist refusal — fall back to a statewide lookup.
  const geo: GeoResolution =
    resolved.kind === 'region' || resolved.kind === 'statewide' ? resolved : { kind: 'statewide' }
  const fact = selectFact(topic, geo, sources)
  return fact.kind === 'none' ? null : fact
}

// ---- channel suggestion ----

// A human IN-channel label derived from the candidate's source host. Never an OUT-channel (those
// are filtered out upstream).
export function suggestChannel(candidate: RawCandidate): string {
  const host = urlToDomain(candidate.url)
  if (host === 'reddit.com' || host.endsWith('.reddit.com')) {
    const sub = candidate.url.match(/reddit\.com\/(r\/[A-Za-z0-9_]+)/)
    return sub ? `Reddit reply (${sub[1]})` : 'Reddit reply'
  }
  if (host.includes('news') || host.endsWith('.gov') || host.includes('times') || host.includes('herald')) {
    return 'Local-news tip / comment'
  }
  if (host.endsWith('.edu')) return 'Community/forum reply'
  return 'IN-channel reply'
}

// ---- fit scoring + ranking (FR-9) ----

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000
}

// Compact, truthful one-liner for a matched fact (mirrors factPackager.renderCopy's lead sentence,
// low-side only). Used in the one-screen markdown; the full paste-ready copy is renderCopy().
export function factHeadline(fact: CitableFact): string {
  const money = (n: number) => `$${n.toFixed(2)}`
  if (fact.kind === 'disparity') {
    return (
      `${fact.displayName} (${fact.weightGrams}g ${fact.category}) — as low as ${money(fact.lowPrice)} ` +
      `across WA licensed retailers (up to ${money(fact.highPrice)} elsewhere; same product, same weight)`
    )
  }
  if (fact.kind === 'regional-floor') {
    return (
      `${fact.displayName} (${fact.weightGrams}g ${fact.category}) — lowest observed ${money(fact.floorPrice)} ` +
      `in the ${fact.regionLabel}, WA area`
    )
  }
  return (
    `${fact.name}${fact.option ? ` (${fact.option})` : ''} — ${fact.dropPercent}% below its own recent typical ` +
    `price (${money(fact.currentPrice)} vs ${money(fact.medianPrice)}) at a WA retailer`
  )
}

// Fit score (higher = better): fact strength (regional-floor > disparity > own-median), a bonus for
// a larger honest cross-store gap, a bonus when the candidate's topic actually named the matched
// category, and a recency bonus for a dated item (undated sinks below dated at the same base).
function fitScore(candidate: RawCandidate, fact: CitableFact, now: Date): number {
  let score = fact.kind === 'regional-floor' ? 300 : fact.kind === 'disparity' ? 200 : 100

  if (fact.kind === 'disparity' && fact.lowPrice > 0) {
    const gapPct = ((fact.highPrice - fact.lowPrice) / fact.lowPrice) * 100
    score += Math.min(Math.max(gapPct, 0), 100) // cap the gap contribution at +100
  }

  const topic = (candidate.topic ?? '').trim()
  if (topic && topicMatchesCategory(topic, fact.category)) score += 50

  if (candidate.postedDate) {
    const d = new Date(candidate.postedDate)
    if (!Number.isNaN(d.getTime())) score += Math.max(0, 40 - daysBetween(now, d) * 0.4)
  }
  return score
}

// ---- worklist assembly (FR-7/8/9) ----

// Filter → pair → rank → cap. Pure; `opts.now` makes recency deterministic in tests.
export function buildWorklist(
  rawCandidates: RawCandidate[],
  sources: PackagerSources,
  opts: BuildOptions = {},
): Worklist {
  const now = opts.now ?? new Date()
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 10
  const topic = (opts.topic ?? '').trim()
  const geo = (opts.geo ?? '').trim()
  const scanned = rawCandidates.length

  const kept: Opportunity[] = []
  for (const c of rawCandidates) {
    if (isRivalOrOutChannel(c.url)) continue // AC-2: rival/out-channel or no verifiable link
    if (!candidateGeoIsWa(c, sources.regions)) continue // AC-2: out-of-WA
    const fact = matchFact(c, sources, { topic, geo }) // AC-1: pair or discard
    if (!fact) continue
    kept.push({
      url: c.url,
      title: (c.title ?? c.url).trim() || c.url,
      postedDate: c.postedDate,
      suggestedChannel: suggestChannel(c),
      fact,
      factHeadline: factHeadline(fact),
      factCopy: renderCopy(fact),
      factSourceUrl: fact.sourceUrl,
      fitScore: fitScore(c, fact, now),
    })
  }

  kept.sort((a, b) => b.fitScore - a.fitScore || a.url.localeCompare(b.url))
  const opportunities = kept.slice(0, limit)

  const reason =
    opportunities.length === 0
      ? scanned === 0
        ? 'the search returned no candidate threads'
        : 'no candidate survived the WA + IN-channel filter with a gated fact that answers it'
      : undefined

  return {
    topic,
    geo,
    generatedAt: now.toISOString(),
    scanned,
    kept: kept.length,
    reason,
    opportunities,
  }
}

// ---- rendering (FR-9) ----

export function renderWorklistMarkdown(worklist: Worklist): string {
  const lines: string[] = []
  const t = worklist.topic || '(any)'
  const g = worklist.geo || '(statewide)'
  lines.push(`# Opportunity worklist — topic "${t}", geo "${g}"`)
  lines.push('')
  lines.push(
    `Generated ${worklist.generatedAt}. Scanned ${worklist.scanned} candidate(s); ` +
      `${worklist.kept} matched a gated fact; showing ${worklist.opportunities.length}.`,
  )
  lines.push('')

  if (worklist.opportunities.length === 0) {
    lines.push(`No opportunities this run — ${worklist.reason ?? 'nothing qualified'}.`)
    lines.push('')
    lines.push('No thread was surfaced without a gated fact that answers it. Nothing to act on.')
    return lines.join('\n') + '\n'
  }

  worklist.opportunities.forEach((o, i) => {
    lines.push(`## ${i + 1}. ${o.title}`)
    lines.push(`- Thread: ${o.url}${o.postedDate ? ` (${o.postedDate})` : ''}`)
    lines.push(`- Suggested channel: ${o.suggestedChannel}`)
    lines.push(`- Matched fact: ${o.factHeadline}`)
    lines.push(`- Fact source: ${o.factSourceUrl}`)
    lines.push('')
  })
  lines.push('---')
  lines.push('Paste-ready copy for each row is in the companion .json (factCopy). MEASURE-AND-SURFACE only — you do the outreach; confirm every number on the source page before posting.')
  return lines.join('\n') + '\n'
}

export function renderWorklistJson(worklist: Worklist): string {
  return JSON.stringify(worklist, null, 2) + '\n'
}
