// Citation-ready fact packager — PURE logic (no fs, no network), so it is unit-testable.
// Backlink Measure-and-Surface Tooling, Story 1.2 / ADR-114 (see project_backlink-tooling and
// project_reach-launch-plan). Given a topic + a WA geo, it selects the single most relevant
// HONESTY-GATED fact from the already-derived facts (cross-store disparity, regional price floor,
// price-vs-own-median drop) and renders copy-paste-ready copy with the caveat baked in and a
// source URL to the live gmaslist page that already publishes the fact.
//
// It NEVER re-derives, re-scrapes, re-parses weights, or calls an AI engine (AR-7): the derived
// `data` it consumes already passed every honesty gate upstream (Gate 1 same-product, Gate 2
// own-median, Gate 6 staleness, weight-category gating). This module only adds the SURFACING
// guards that keep a pasted number honest:
//   - a cross-store disparity's HIGH side (the expensive store — the "$84 Donny Burger" trap in
//     FR-6) is NEVER emitted as a citable low; only `lowPrice`, framed as a cross-store low.
//   - a regional floor marked `stale` (freshness unverified) is NEVER citable.
//   - an own-median drop must be a real drop (pctVsMedian < 0) whose displayed whole-number
//     percent is >= 1% (mirrors storeRoute.renderableStoreDrops).
//   - a non-finite / non-positive price is never emitted; the `excluded[]` arrays are never read.
// Copy carries no health/potency claim, no discount-hype ("% off"/"sale"), and never implies
// gmaslist sells product (the positioning line is appended verbatim).
//
// The IO half (reading the committed server/data/derived/*.json, buildApiData for region cities,
// CLI, writing the private record) lives in factPackagerRun.ts.

import type { Disparity } from '../types/index.js'
import type { RegionalFloor } from '../utils/regionalPriceFloor.js'
import type { PriceVsOwnMedianRow } from '../utils/priceVsOwnMedian.js'
import { slugify, type Region } from '../utils/regionModel.js'

export const BASE_URL = 'https://gmaslist.com'

// Appended to every packaged fact — the site's entity-positioning line, mirrored from
// positioningDisclaimer.ts so the copy speaks the same words the live pages do.
export const POSITIONING_LINE = 'Gmas List is an independent information service — not a cannabis seller.'

// US-state / neighboring-locality tokens that signal a NON-WA ask. Pragmatic and extensible: the
// whole dataset is WA-only, so a geo naming one of these is honestly refused rather than answered
// with a WA fact under a non-WA label (FR-4 / AC-1).
export const NON_WA_TOKENS = new Set([
  'or', 'oregon', 'portland', 'eugene', 'salem',
  'id', 'idaho', 'boise', 'coeur',
  'ca', 'california', 'ak', 'alaska',
  'mt', 'montana', 'nv', 'nevada', 'az', 'arizona',
])

// Recognized WA localities (single-token) that are NOT one of the covered named regions. A geo
// naming one of these resolves to `statewide` (a WA fact under a WA label) rather than being
// refused as unrecognized — so the operator can ask for "Seattle" without appending "WA". Shared
// with the opportunity finder (candidateGeoIsWa) so both speak the same WA gazetteer. Ambiguous
// names (e.g. "vancouver" — WA vs BC) are deliberately excluded.
export const WA_LOCALITY_TOKENS = new Set<string>([
  'seattle', 'tacoma', 'spokane', 'olympia', 'everett', 'bellevue', 'kent', 'renton',
  'marysville', 'bellingham', 'yakima', 'redmond', 'kirkland', 'auburn', 'puyallup',
])

// ---- source-reference URLs (the live pages that already publish each fact, AR-7) ----
// Category slug uses regionModel.slugify — byte-identical to compareRoute.categorySlug — so the
// cited /compare URL truly renders the fact. Region slug is the Region.slug from buildRegions.
export function disparityUrl(category: string): string {
  return `${BASE_URL}/compare/${slugify(category)}`
}
export function regionalFloorUrl(category: string, regionSlug: string): string {
  return `${BASE_URL}/compare/${slugify(category)}/${regionSlug}`
}
export function storeUrl(dispensaryId: string): string {
  return `${BASE_URL}/store/${dispensaryId}`
}

// Filesystem-safe slug for the private record's filename (reuses the shared slug rule). Empty
// string when nothing slugs — the runner falls back to a fixed base.
export function slugifyForFile(text: string): string {
  return slugify(text ?? '')
}

// ---- selected-fact shapes (discriminated union) ----
export interface DisparityFact {
  kind: 'disparity'
  category: string
  displayName: string
  weightGrams: number
  lowPrice: number
  highPrice: number
  lowStoreId: string
  storeCount: number
  sourceUrl: string
}
export interface RegionalFloorFact {
  kind: 'regional-floor'
  category: string
  displayName: string
  weightGrams: number
  floorPrice: number
  regionLabel: string
  regionSlug: string
  storeCountInCluster: number
  sourceUrl: string
}
export interface OwnMedianFact {
  kind: 'own-median'
  category: string
  name: string
  option: string
  currentPrice: number
  medianPrice: number
  dropPercent: number
  dispensaryId: string
  sourceUrl: string
}
export type CitableFact = DisparityFact | RegionalFloorFact | OwnMedianFact
export interface NoFact {
  kind: 'none'
  reason: string
}
export type FactResult = CitableFact | NoFact

export interface PackagerSources {
  disparities: Disparity[]
  regions: Region[] // already projected via regionModel.buildRegions (floors stale-annotated)
  ownMedianRows: PriceVsOwnMedianRow[]
}

export type GeoResolution =
  | { kind: 'region'; region: Region }
  | { kind: 'statewide' }
  | { kind: 'out-of-wa'; token: string }
  | { kind: 'uncovered'; geo: string }

// ---- small pure guards ----
function positivePrice(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

// Whole-number percent magnitude of a (negative) own-median drop, e.g. -0.19 → 19.
export function dropPercent(pctVsMedian: number): number {
  return Math.round(Math.abs(pctVsMedian) * 100)
}

// Common operator shorthand → the derived category it means. Keyed by the category's lowercased
// name (the derived `category` values: Flower, Vaporizers, Concentrate, Edible, ...). Lets a topic
// like "vape" or "carts" match "Vaporizers" where a bare substring test would miss.
const CATEGORY_ALIASES: Record<string, string[]> = {
  vaporizers: ['vape', 'vapes', 'vaporizer', 'cart', 'carts', 'cartridge', 'cartridges', 'disposable'],
  flower: ['flower', 'bud', 'buds', 'eighth', 'eighths', 'ounce', 'oz'],
  concentrate: ['concentrate', 'concentrates', 'dab', 'dabs', 'rosin', 'resin', 'wax', 'hash', 'shatter'],
  edible: ['edible', 'edibles', 'gummy', 'gummies', 'chocolate'],
  prerolls: ['preroll', 'prerolls', 'pre-roll', 'joint', 'joints'],
}

// Does the operator's free-text topic match a derived category? Case-insensitive; empty topic
// matches anything. Substring both ways ("cheapest flower" → "Flower") plus a small alias map
// ("vape"/"carts" → "Vaporizers").
export function topicMatchesCategory(topic: string, category: string): boolean {
  const t = (topic ?? '').trim().toLowerCase()
  const c = (category ?? '').trim().toLowerCase()
  if (!t) return true
  if (!c) return false
  if (c === t) return true
  // Whole-word / stem match per topic token, so "credible" never matches "edible" and "amazon"
  // never matches the "oz" alias (the old two-way substring test did). Plurals and 4+char prefixes
  // still match ("flowers"→flower, "concentrates"→concentrate, "flow"→flower, "vape"→Vaporizers).
  const wordMatches = (word: string, key: string): boolean =>
    word === key ||
    word === `${key}s` ||
    key === `${word}s` ||
    (key.length >= 4 && word.startsWith(key)) ||
    (word.length >= 4 && key.startsWith(word))
  const keys = [c, ...(CATEGORY_ALIASES[c] ?? [])]
  const topicTokens = t.split(/[^a-z0-9]+/).filter(Boolean)
  return topicTokens.some((w) => keys.some((k) => wordMatches(w, k)))
}

// Map the operator's geo string to a covered WA Region (by slug / label / member city), a
// statewide sentinel, an explicit out-of-WA refusal, or an uncovered-WA-area result. WA-only
// dataset invariant: everything emitted is WA by construction — this gate exists to honestly
// refuse an out-of-state ask, not to filter data.
export function resolveGeo(geoInput: string, regions: Region[]): GeoResolution {
  const g = (geoInput ?? '').trim().toLowerCase()
  if (!g) return { kind: 'uncovered', geo: geoInput ?? '' }

  const gslug = slugify(g)
  for (const r of regions) {
    if (r.slug === gslug) return { kind: 'region', region: r }
    if (r.label.trim().toLowerCase() === g) return { kind: 'region', region: r }
    if (r.cities.some((c) => c.trim().toLowerCase() === g)) return { kind: 'region', region: r }
  }

  const tokens = g.split(/[^a-z0-9]+/).filter(Boolean)
  if (g === 'wa' || g === 'washington' || tokens.includes('statewide')) return { kind: 'statewide' }
  const nonWa = tokens.find((t) => NON_WA_TOKENS.has(t))
  if (nonWa) return { kind: 'out-of-wa', token: nonWa }
  // A WA-signalled ask for an area we don't cover as a named region → serve statewide.
  if (tokens.includes('wa') || tokens.includes('washington')) return { kind: 'statewide' }
  // A recognized WA locality (not a covered region) → serve statewide facts under a WA label.
  if (tokens.some((t) => WA_LOCALITY_TOKENS.has(t))) return { kind: 'statewide' }
  return { kind: 'uncovered', geo: geoInput }
}

// The cheapest non-stale regional floor in this region matching the topic (geo + category
// specific — the strongest fact). null when none qualifies.
function bestRegionalFloor(topic: string, region: Region): RegionalFloorFact | null {
  const cands = (Array.isArray(region.floors) ? region.floors : []).filter(
    (f): f is RegionalFloor =>
      !!f && topicMatchesCategory(topic, f.category) && f.stale !== true && positivePrice(f.floorPrice),
  )
  if (cands.length === 0) return null
  cands.sort(
    (a, b) =>
      a.floorPrice - b.floorPrice ||
      a.displayName.localeCompare(b.displayName) ||
      a.weightGrams - b.weightGrams,
  )
  const f = cands[0]
  return {
    kind: 'regional-floor',
    category: f.category,
    displayName: f.displayName,
    weightGrams: f.weightGrams,
    floorPrice: f.floorPrice,
    regionLabel: region.label,
    regionSlug: region.slug,
    storeCountInCluster: f.storeCountInCluster,
    sourceUrl: regionalFloorUrl(f.category, region.slug),
  }
}

// The statewide cross-store disparity with the largest honest gap for the topic. Emits the LOW
// side only; the HIGH side is carried purely as the contrast ceiling. null when none qualifies.
function bestDisparity(topic: string, disparities: Disparity[]): DisparityFact | null {
  const cands = (Array.isArray(disparities) ? disparities : []).filter(
    (d): d is Disparity =>
      !!d &&
      topicMatchesCategory(topic, d.category) &&
      positivePrice(d.lowPrice) &&
      positivePrice(d.highPrice) &&
      d.highPrice > d.lowPrice && // real gap only — never render "$X … up to $X … a real price gap"
      Array.isArray(d.storesCarrying) &&
      d.storesCarrying.length >= 2,
  )
  if (cands.length === 0) return null
  cands.sort(
    (a, b) => b.spreadPct - a.spreadPct || a.lowPrice - b.lowPrice || a.displayName.localeCompare(b.displayName),
  )
  const d = cands[0]
  const lowStore = [...d.storesCarrying].sort((a, b) => a.price - b.price)[0]
  return {
    kind: 'disparity',
    category: d.category,
    displayName: d.displayName,
    weightGrams: d.weightGrams,
    lowPrice: d.lowPrice,
    highPrice: d.highPrice,
    lowStoreId: lowStore?.dispensaryId ?? '',
    storeCount: d.storesCarrying.length,
    sourceUrl: disparityUrl(d.category),
  }
}

// The deepest own-median drop for the topic (constrained to stores in `region` when given, else
// any store statewide). Applies the same display-honesty gate as the /store page. null when none.
function bestOwnMedianDrop(
  topic: string,
  rows: PriceVsOwnMedianRow[],
  region?: Region,
): OwnMedianFact | null {
  const inGeo = region ? new Set(region.memberDispensaryIds) : null
  const cands = (Array.isArray(rows) ? rows : []).filter(
    (r): r is PriceVsOwnMedianRow =>
      !!r &&
      r.pctVsMedian < 0 &&
      dropPercent(r.pctVsMedian) >= 1 &&
      positivePrice(r.currentPrice) &&
      positivePrice(r.medianPrice) &&
      topicMatchesCategory(topic, r.category) &&
      (!inGeo || inGeo.has(r.dispensaryId)),
  )
  if (cands.length === 0) return null
  cands.sort((a, b) => a.pctVsMedian - b.pctVsMedian || a.name.localeCompare(b.name))
  const r = cands[0]
  return {
    kind: 'own-median',
    category: r.category,
    name: r.name,
    option: r.option,
    currentPrice: r.currentPrice,
    medianPrice: r.medianPrice,
    dropPercent: dropPercent(r.pctVsMedian),
    dispensaryId: r.dispensaryId,
    sourceUrl: storeUrl(r.dispensaryId),
  }
}

// Pick the single most relevant gated fact for a topic + resolved geo (ranking in Dev Notes):
// geo+category regional floor > statewide cross-store disparity > store-in-geo own-median drop.
// An out-of-WA geo is refused; an uncovered WA area falls through to statewide facts.
export function selectFact(topic: string, geo: GeoResolution, sources: PackagerSources): FactResult {
  if (geo.kind === 'out-of-wa') {
    return {
      kind: 'none',
      reason: `geo is outside Washington ("${geo.token}") — this tool only packages facts for licensed WA retailers`,
    }
  }

  // WA-allowlist refusal (AC-1): a NON-EMPTY geo that resolves to nothing recognized as WA is
  // refused rather than being quietly served a statewide WA fact under an out-of-state label. An
  // EMPTY geo (kind 'uncovered', geo '') is the operator's "any WA fact" path and still falls
  // through to statewide. Append "WA" to force statewide for an unlisted WA town.
  if (geo.kind === 'uncovered' && (geo.geo ?? '').trim() !== '') {
    return {
      kind: 'none',
      reason: `geo "${geo.geo.trim()}" is not a recognized Washington region or locality — this tool only packages facts for WA (append "WA" to force a statewide fact)`,
    }
  }

  const region = geo.kind === 'region' ? geo.region : undefined

  if (region) {
    const floor = bestRegionalFloor(topic, region)
    if (floor) return floor
  }

  const disparity = bestDisparity(topic, sources.disparities)
  if (disparity) return disparity

  const drop = bestOwnMedianDrop(topic, sources.ownMedianRows, region)
  if (drop) return drop

  const scope = region
    ? `in the ${region.label} area`
    : geo.kind === 'uncovered'
      ? `for "${geo.geo}"`
      : 'statewide'
  const forTopic = topic && topic.trim() ? ` for topic "${topic.trim()}"` : ''
  return { kind: 'none', reason: `no honesty-gated fact available ${scope}${forTopic}` }
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// Render copy-paste-ready copy for a citable fact: the number, its plain-English caveat (mirrored
// verbatim from the live SSR routes), the source URL, and the positioning line. Deliberately
// contains no "% off"/"sale" hype, no potency/health claim, and never implies gmaslist sells.
export function renderCopy(fact: CitableFact, channel?: string): string {
  const ch = channel && channel.trim() ? channel.trim() : 'an IN-channel thread'
  const lines: string[] = [`Citation-ready fact for ${ch}:`, '']

  if (fact.kind === 'disparity') {
    lines.push(
      `${fact.displayName} (${fact.weightGrams}g ${fact.category}) is available for as low as ` +
        `${money(fact.lowPrice)} across licensed Washington retailers — the same product at the same ` +
        `weight runs up to ${money(fact.highPrice)} elsewhere, a real cross-store price gap.`,
    )
    lines.push('')
    lines.push(
      `Caveat: Same product at the same weight — a per-product low across ${fact.storeCount} stores, ` +
        `not a discount or a category ranking. Prices are shelf prices, not discounts. Verify in store.`,
    )
  } else if (fact.kind === 'regional-floor') {
    lines.push(
      `In the ${fact.regionLabel}, WA area, the lowest observed shelf price for ${fact.displayName} ` +
        `(${fact.weightGrams}g ${fact.category}) is ${money(fact.floorPrice)} among licensed retailers that carry it.`,
    )
    lines.push('')
    lines.push(
      `Caveat: Same product at the same weight — a per-product low, not a discount or a category ` +
        `ranking. Prices are shelf prices, not discounts. Verify in store.`,
    )
  } else {
    lines.push(
      `${fact.name}${fact.option ? ` (${fact.option})` : ''} is currently ${fact.dropPercent}% below ` +
        `its own recent typical price at a licensed Washington retailer: ${money(fact.currentPrice)} ` +
        `vs ${money(fact.medianPrice)} usual.`,
    )
    lines.push('')
    lines.push(
      `Caveat: Priced below its own recent typical price at this store, based on observed price ` +
        `history — a genuine drop against the item's own history, not a banner promo. Verify in store.`,
    )
  }

  lines.push('')
  lines.push(`Source: ${fact.sourceUrl}`)
  lines.push(POSITIONING_LINE)
  return lines.join('\n')
}

// Render the explicit "nothing citable" refusal (FR-6). Never a number, never a fabricated fact.
export function renderNoFact(topic: string, geo: string, reason: string): string {
  const t = topic && topic.trim() ? topic.trim() : '(any)'
  const g = geo && geo.trim() ? geo.trim() : '(unspecified)'
  return [
    `Nothing citable for topic "${t}", geo "${g}".`,
    '',
    `Reason: ${reason}.`,
    '',
    `No number was emitted — the derivation engine has no honesty-gated fact that answers this ` +
      `query right now. Do not pitch a figure the engine cannot vouch for.`,
    POSITIONING_LINE,
  ].join('\n')
}

// Render whatever selectFact returned (fact copy or refusal) — the single entry the runner prints.
export function renderResult(result: FactResult, topic: string, geo: string, channel?: string): string {
  return result.kind === 'none' ? renderNoFact(topic, geo, result.reason) : renderCopy(result, channel)
}
