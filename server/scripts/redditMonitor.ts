// Reddit mention-monitor — PURE logic (no fs, no network), so it is unit-testable.
// Phase-2 reach tool (v1 notifier-only). See project_reach-launch-plan (Phase 2) and the
// build-ready brainstorm (_bmad-output/brainstorming/brainstorming-session-2026-08-09-reddit-
// monitoring.md, ADR-106 / Epic-backlink-1 local-only mold).
//
// The machine (parameters locked in the brainstorm's Morphological Analysis):
//   fetch subreddit .json (IO) → preFilter (precision-biased regex+geo+inventory, THIS module) →
//   Haiku classify survivors (IO) → parseClassification (THIS module) → buildAlerts (fact-gate at
//   capture via factPackager.selectFact result + 0.7 confidence threshold + seen-dedup, THIS
//   module) → append freshness-stamped rows + toast (IO).
//
// Honesty is inherited wholesale from factPackager (Model-2 composition): an alert exists only if a
// gated fact answers the thread. This module invents no number and no claim. It is MEASURE-AND-
// SURFACE only — a human replies by hand; nothing here posts to Reddit.
//
// The IO half (the .json fetch, the Haiku call, reading the derived JSON + inventory, writing the
// private seen/mentions state, the toast) lives in redditMonitorRun.ts.

import { looseJsonArray } from './opportunityFinder.js'
import type { CitableFact } from './factPackager.js'
import type { Region } from '../utils/regionModel.js'

// ---- the 6 actionable intents → routed tool/fact (brainstorm Technique 1) ----
export interface IntentRoute {
  label: string
  routedTool: string
}
export const INTENT_ROUTES: Record<number, IntentRoute> = {
  1: { label: "where's it cheapest near me", routedTool: 'opportunity-finder (regional-floor)' },
  2: { label: 'anyone tried [brand]?', routedTool: 'unlinked-mention-finder' },
  3: { label: 'prices are insane', routedTool: 'opportunity-finder (price-spread)' },
  4: { label: 'worth the drive to save $X? (flagship)', routedTool: 'cheapest-delivered fact' },
  5: { label: 'is this deal still live?', routedTool: 'freshness-gated status' },
  6: { label: 'which store carries [brand] cheapest', routedTool: 'brand→store matrix' },
}
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7
export const SEEN_EXPIRY_DAYS = 360

// Product-category terms the pre-filter accepts as an inventory signal (guardrail 3a). Mirrors the
// spirit of factPackager's CATEGORY_ALIASES but is owned here so factPackager stays a read-only
// import. Keeps intent #3 ("prices are insane") reachable when a gripe names a category but no
// specific store/brand.
export const CATEGORY_TERMS: string[] = [
  'flower', 'bud', 'eighth', 'eighths', 'ounce',
  'vape', 'vapes', 'vaporizer', 'cart', 'carts', 'cartridge', 'disposable',
  'concentrate', 'concentrates', 'dab', 'dabs', 'rosin', 'wax', 'hash', 'shatter',
  'edible', 'edibles', 'gummy', 'gummies', 'chocolate',
  'preroll', 'prerolls', 'joint', 'joints',
]

// ---- shapes ----

// One post as parsed from a subreddit's public .json listing (before any filtering).
export interface RedditPost {
  postId: string // Reddit fullname, e.g. "t3_abc123"
  subreddit: string // without the "r/" prefix
  title: string
  selftext: string
  url: string // the human permalink (https://www.reddit.com/r/.../comments/...)
  createdUtc: number // epoch seconds, 0 when unknown
}

export interface PreFilterResult {
  passed: boolean
  reason?: string // set when dropped, for the self-audit / debug line
  geoTokens: string[] // the hard North-Sound tokens found (never bare "wa"/"washington")
  matchedBrand?: string // a store/brand/product token present in the post, if any
  matchedCategory?: string // a product-category term present, if any
}

// Haiku's classification of a survivor (parsed from its JSON answer).
export interface Classification {
  intent: number // 1..6
  geoConfidence: number // 0..1
  matchedStore: string
  matchedBrand: string
  routedTool: string
}

// A survivor carried through classify + fact-gate, ready for buildAlerts to accept or reject.
export interface ClassifiedCandidate {
  post: RedditPost
  pre: PreFilterResult
  classification: Classification
  fact: CitableFact | null // factPackager.selectFact result (null = no gated fact → no alert)
  factAsOf: string // derived-envelope generatedAt for the fact's kind ('' when no fact)
  factFreshness: '' | 'fresh' | 'stale'
}

// The locked row shape — the notifier payload AND the v2 draft-reply seed.
export interface AlertRow {
  ts: string
  subreddit: string
  postId: string
  url: string
  title: string
  intent: number
  intentLabel: string
  confidence: number
  geoTokens: string[]
  matchedStore: string
  matchedBrand: string
  routedTool: string
  suggestedFact: string // compact truthful one-liner of the gated fact
  factSourceUrl: string // the live gmaslist page that already publishes the fact
  factAsOf: string
  factFreshness: '' | 'fresh' | 'stale'
}

// ---- listing parse (NFR: never throws) ----

interface RedditChild {
  kind?: string
  data?: Record<string, unknown>
}

// Parse a subreddit .json listing body into RedditPosts. Tolerates a raw object, a JSON string, or
// junk (→ []). Only t3 (link/self post) children with an id are kept.
export function parseListing(body: unknown): RedditPost[] {
  let root: unknown = body
  if (typeof body === 'string') {
    try {
      root = JSON.parse(body)
    } catch {
      return []
    }
  }
  const children = (root as { data?: { children?: unknown } })?.data?.children
  if (!Array.isArray(children)) return []

  const out: RedditPost[] = []
  for (const child of children as RedditChild[]) {
    const d = child?.data
    if (!d || typeof d !== 'object') continue
    const id = typeof d.id === 'string' ? d.id : ''
    if (!id) continue
    const name = typeof d.name === 'string' && d.name ? d.name : `t3_${id}`
    const permalink = typeof d.permalink === 'string' ? d.permalink : ''
    const url = permalink ? `https://www.reddit.com${permalink}` : typeof d.url === 'string' ? d.url : ''
    out.push({
      postId: name,
      subreddit: typeof d.subreddit === 'string' ? d.subreddit : '',
      title: typeof d.title === 'string' ? d.title : '',
      selftext: typeof d.selftext === 'string' ? d.selftext : '',
      url,
      createdUtc: typeof d.created_utc === 'number' ? d.created_utc : 0,
    })
  }
  return out
}

// ---- inventory tokenization (pure; IO feeds it dispensary + brand names) ----

const STOP_WORDS = new Set([
  'the', 'and', 'of', 'a', 'an', 'in', 'at', 'on', 'for', 'to', 'llc', 'inc', 'co', 'cannabis',
  'marijuana', 'weed', 'dispensary', 'dispensaries', 'store', 'shop', 'i', 'ii', 'og', 'wa',
])

// Turn store / brand / product display names into a Set of significant lowercased word tokens
// (>=3 chars, non-stopword) plus each full normalized phrase. Used by preFilter to test inventory
// presence in a post. Pure so it is deterministic in tests.
export function tokenizeInventory(names: string[]): Set<string> {
  const set = new Set<string>()
  for (const raw of names) {
    const norm = (raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!norm) continue
    if (norm.length >= 3) set.add(norm) // full phrase (e.g. "remedy tulalip")
    for (const w of norm.split(' ')) {
      if (w.length >= 3 && !STOP_WORDS.has(w)) set.add(w)
    }
  }
  return set
}

// ---- pre-filter (guardrail 3a: precision over recall, runs BEFORE Haiku) ----

// Whole-word phrase presence with word boundaries, so "kent" never matches "kentucky" and a
// multi-word place like "mount vernon" matches spaced prose. Mirrors opportunityFinder.
function phrasePresent(normText: string, place: string): boolean {
  const p = place.replace(/[^a-z0-9]+/g, ' ').trim()
  return p.length > 0 && normText.includes(` ${p} `)
}

export interface PreFilterContext {
  regions: Region[]
  inventoryTokens: Set<string>
  categoryKeys: string[] // product-category terms (flower, vape, edible, ...) from factPackager aliases
}

// A post passes only with BOTH a hard North-Sound geo token (a covered region's city/slug/label —
// NEVER bare "wa"/"washington"/"statewide") AND an inventory signal (store name, brand/product
// token, or product-category term). Precision-biased by design (a missed thread is unmeasurable; a
// false alert costs the scarcest resource — attention).
export function preFilter(post: RedditPost, ctx: PreFilterContext): PreFilterResult {
  const text = `${post.title} ${post.selftext}`.toLowerCase()
  const norm = ` ${text.replace(/[^a-z0-9]+/g, ' ').trim()} `

  // Hard local geo tokens: region cities + slug + label. Explicitly exclude the statewide words.
  const geoTokens: string[] = []
  for (const r of ctx.regions) {
    const candidates = [...r.cities.map((c) => c.toLowerCase()), r.slug.toLowerCase(), r.label.toLowerCase()]
    for (const place of candidates) {
      if (place === 'wa' || place === 'washington' || place === 'statewide') continue
      if (phrasePresent(norm, place) && !geoTokens.includes(place)) geoTokens.push(place)
    }
  }
  if (geoTokens.length === 0) {
    return { passed: false, reason: 'no hard North-Sound geo token', geoTokens: [] }
  }

  // Inventory signal: store/brand token, else a product-category term.
  let matchedBrand: string | undefined
  for (const tok of ctx.inventoryTokens) {
    if (phrasePresent(norm, tok)) {
      matchedBrand = tok
      break
    }
  }
  let matchedCategory: string | undefined
  if (!matchedBrand) {
    for (const key of ctx.categoryKeys) {
      if (phrasePresent(norm, key)) {
        matchedCategory = key
        break
      }
    }
  }
  if (!matchedBrand && !matchedCategory) {
    return { passed: false, reason: 'geo token but no inventory/category signal', geoTokens }
  }

  return { passed: true, geoTokens, matchedBrand, matchedCategory }
}

// ---- classification prompt + parse ----

// Instruct Haiku to classify a survivor into one intent + a geo-confidence + the store/brand it
// names. NO web_search — the retrieval already happened via the .json fetch; this is pure text
// classification returning a single JSON object.
export function buildClassifyPrompt(post: RedditPost, pre: PreFilterResult): string {
  const intents = Object.entries(INTENT_ROUTES)
    .map(([n, r]) => `  ${n} = ${r.label}`)
    .join('\n')
  return [
    `You classify a Reddit post from a Washington State cannabis shopper. The post already passed a`,
    `North-Sound geo + inventory pre-filter (geo tokens: ${pre.geoTokens.join(', ') || 'none'}).`,
    ``,
    `Post subreddit: r/${post.subreddit}`,
    `Title: ${post.title}`,
    `Body: ${post.selftext.slice(0, 800)}`,
    ``,
    `Pick the SINGLE best-matching shopper intent:`,
    intents,
    ``,
    `Return ONLY a JSON object (no prose): {"intent": <1-6>, "geoConfidence": <0.0-1.0>,`,
    `"matchedStore": "<store named or empty>", "matchedBrand": "<brand/product named or empty>"}`,
    `geoConfidence = how sure you are the poster is asking about the North-Sound WA area specifically`,
    `(Everett/Snohomish/Whatcom/Skagit/Bellingham/Marysville/Mount Vernon/Ferndale), not broad WA.`,
  ].join('\n')
}

// Parse Haiku's JSON answer into a Classification, or null if unusable. Tolerant of fences/prose
// (reuses opportunityFinder.looseJsonArray). Clamps confidence to [0,1] and intent to 1..6; the
// routedTool is derived from the intent (never trusted from the model).
export function parseClassification(answerText: string): Classification | null {
  const first = looseJsonArray(answerText)[0]
  if (!first || typeof first !== 'object') return null
  const o = first as Record<string, unknown>

  const intentRaw = typeof o.intent === 'number' ? o.intent : Number.parseInt(String(o.intent ?? ''), 10)
  if (!Number.isFinite(intentRaw)) return null
  const intent = Math.trunc(intentRaw)
  if (!INTENT_ROUTES[intent]) return null

  const confRaw = typeof o.geoConfidence === 'number' ? o.geoConfidence : Number.parseFloat(String(o.geoConfidence ?? ''))
  const geoConfidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0

  return {
    intent,
    geoConfidence,
    matchedStore: typeof o.matchedStore === 'string' ? o.matchedStore.trim() : '',
    matchedBrand: typeof o.matchedBrand === 'string' ? o.matchedBrand.trim() : '',
    routedTool: INTENT_ROUTES[intent].routedTool,
  }
}

// ---- compact truthful fact one-liner (mirrors factPackager copy, low-side only) ----
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
    `${fact.name}${fact.option ? ` (${fact.option})` : ''} — ${fact.dropPercent}% below its own recent ` +
    `typical price (${money(fact.currentPrice)} vs ${money(fact.medianPrice)}) at a WA retailer`
  )
}

// ---- alert assembly (fact-gate + 0.7 threshold + seen-dedup) ----

// Accept a classified candidate into an AlertRow only when: it is unseen, above the confidence
// threshold, and carries a gated fact (Model-2). Everything else is dropped silently.
export function buildAlerts(
  cands: ClassifiedCandidate[],
  seen: Set<string>,
  opts: { threshold?: number; now?: Date } = {},
): AlertRow[] {
  const threshold = opts.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const now = opts.now ?? new Date()
  const out: AlertRow[] = []
  const emitted = new Set<string>() // within-run dedup (a crosspost/dup id must not fire twice)
  for (const c of cands) {
    if (seen.has(c.post.postId) || emitted.has(c.post.postId)) continue // dedup (cross-run + in-run)
    if (!c.fact) continue // Model-2 fact-gate
    if (c.classification.geoConfidence < threshold) continue // 0.7 gate
    emitted.add(c.post.postId)
    const route = INTENT_ROUTES[c.classification.intent]
    out.push({
      ts: now.toISOString(),
      subreddit: c.post.subreddit,
      postId: c.post.postId,
      url: c.post.url,
      title: c.post.title,
      intent: c.classification.intent,
      intentLabel: route?.label ?? '',
      confidence: c.classification.geoConfidence,
      geoTokens: c.pre.geoTokens,
      matchedStore: c.classification.matchedStore || '',
      matchedBrand: c.classification.matchedBrand || c.pre.matchedBrand || '',
      routedTool: c.classification.routedTool,
      suggestedFact: factHeadline(c.fact),
      factSourceUrl: c.fact.sourceUrl,
      factAsOf: c.factAsOf,
      factFreshness: c.factFreshness,
    })
  }
  return out
}

// ---- seen-state expiry (guardrail: expire seen IDs > 360 days) ----

export type SeenMap = Record<string, string> // postId -> last-seen ISO timestamp

// Drop seen entries older than maxDays; keep undated/future entries (fail-open — a malformed ts
// never resurfaces a post). Returns a NEW map (pure).
export function expireSeen(seen: SeenMap, now: Date = new Date(), maxDays: number = SEEN_EXPIRY_DAYS): SeenMap {
  const cutoff = now.getTime() - maxDays * 86_400_000
  const out: SeenMap = {}
  for (const [id, ts] of Object.entries(seen)) {
    const t = Date.parse(ts)
    if (Number.isFinite(t) && t < cutoff) continue // expired
    out[id] = ts
  }
  return out
}

// ---- self-audit precision line (guardrail 3b) ----

// "alerts fired / acted-on" — firedThisRun for the run, plus cumulative fired/acted so drift is
// visible. actedOn is the count of prior mentions the human marked `acted:true`.
export function precisionLine(firedThisRun: number, cumulativeFired: number, cumulativeActed: number): string {
  const pct = cumulativeFired > 0 ? Math.round((cumulativeActed / cumulativeFired) * 100) : 0
  return (
    `self-audit: ${firedThisRun} alert(s) this run; ${cumulativeActed}/${cumulativeFired} lifetime ` +
    `acted-on (${pct}% precision). Retune the geo/inventory gate if precision drifts low.`
  )
}

// ---- render (one-screen markdown) ----

export function renderAlertsMarkdown(alerts: AlertRow[], generatedAt: string): string {
  const lines: string[] = ['# Reddit mention alerts', '', `Generated ${generatedAt}. ${alerts.length} alert(s).`, '']
  if (alerts.length === 0) {
    lines.push('No alerts this run — no fresh North-Sound thread survived the precision gate with a gated fact.')
    return lines.join('\n') + '\n'
  }
  alerts.forEach((a, i) => {
    const age = a.factAsOf ? ` (fact as of ${a.factAsOf}${a.factFreshness ? `, ${a.factFreshness}` : ''})` : ''
    lines.push(`## ${i + 1}. r/${a.subreddit} — ${a.title}`)
    lines.push(`- Thread: ${a.url}`)
    lines.push(`- Intent ${a.intent} (${a.intentLabel}) → ${a.routedTool} · confidence ${a.confidence.toFixed(2)}`)
    lines.push(`- Suggested fact: ${a.suggestedFact}${age}`)
    lines.push(`- Fact source: ${a.factSourceUrl}`)
    lines.push('')
  })
  lines.push('---')
  lines.push('Notifier only — you reply by hand. Confirm every number on the source page before posting; verify fact freshness.')
  return lines.join('\n') + '\n'
}
