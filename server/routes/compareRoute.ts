import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Request, Response } from 'express'
import type { MatchReport } from '../utils/crossStoreValue.js'
import type { Disparity } from '../types/index.js'
import type { DisparityRollupsReport } from '../utils/disparityRollups.js'
import type { DerivedEnvelope } from '../utils/derivedEnvelope.js'
import type { RegionalFloor } from '../utils/regionalPriceFloor.js'
import {
  readDerived,
  readRegionalPriceFloor,
  EMPTY_DISPARITIES_ENVELOPE,
  EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
} from './valueRoute.js'
// Shared SSR primitives (extracted in price-index-phase-1a). Re-exported below so
// existing importers of these symbols keep working and /compare behavior is unchanged.
import {
  BASE_URL,
  ORG_ID,
  escapeHtml,
  escapeAttr,
  jsonLdScript,
  storeName,
  formatUsd,
  page,
  EPOCH_GENERATED_AT,
  datasetJsonLd,
  isRenderableDisparity,
  disparityEndpoints,
  renderTopCheapest,
  freshnessSentence,
  asOfPhrase,
} from '../utils/ssrPage.js'
import { buildApiData } from '../utils/buildApiData.js'
import {
  buildRegions,
  findRegion,
  floorsForCategory,
  parseCity,
  slugify,
  type Region,
} from '../utils/regionModel.js'
import { areaCodeKeywords, areaCodeNicknameSentence } from '../utils/areaCodes.js'

// Re-export the extracted SSR primitives so any external importer of these
// compareRoute symbols is unaffected by the ssrPage.ts extraction.
export {
  escapeHtml,
  escapeAttr,
  jsonLdScript,
  storeName,
  formatUsd,
  page,
  EPOCH_GENERATED_AT,
  datasetJsonLd,
  isRenderableDisparity,
  asOfPhrase,
}

// Public SEO / AI-search comparison surface (derivation-3.1, epic-derivation-3).
// Server-rendered pages that expose the SHIPPED Epic 1 cross-store price-disparity
// facts as extractable HTML + Dataset JSON-LD, so non-JS crawlers (GPTBot,
// Claude-SearchBot, PerplexityBot) and Google can find and cite gmaslist.com.
// Mirrors the /about SSR pattern (ADR-078). The legal gate is CLOSED (ADR-066).
//
// HONESTY CONTRACT (hard): publish COMPUTED RELATIONAL FACTS (same-product
// cross-store price ranges), never a store's full menu. No banner discount %
// (Gate 2), no whole-catalog leaderboard / same-product only (Gate 1), no potency
// (Gate 5). areaServed is Washington only (WAC 314-55-155).
//
// LOAD-BEARING: reads only the committed derived JSON via readDerived's fail-soft
// envelope — a missing/malformed artifact degrades to a safe page, never a 500,
// never a read of raw product data or the home DB.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DERIVED_DIR = path.join(__dirname, '../data/derived')
const DISPARITIES_PATH = path.join(DERIVED_DIR, 'disparities.json')
const DISPARITY_ROLLUPS_PATH = path.join(DERIVED_DIR, 'disparity-rollups.json')

// Bound category pages as the longitudinal dataset grows (NFR2). Rows are sorted
// by spread desc, so the cap keeps the largest real price gaps and trims the
// least-interesting (zero-spread) tail; a note discloses the truncation.
const MAX_CATEGORY_ROWS = 100

// Single source of truth for the index dataset. The visible <h1>/intro text and
// the Dataset JSON-LD are built from these SAME strings so Google's "schema text
// must match on-page text" holds by construction. Copy rule (as in aboutRoute):
// no & < > in these strings, so the verbatim schema<->HTML match survives escaping.
export const INDEX_DATASET_NAME = 'Washington cannabis cross-store price comparisons'
export const INDEX_DATASET_DESCRIPTION =
  'Same-product price comparisons across licensed Washington cannabis retailers. For each ' +
  'product carried by two or more stores, the lowest and highest shelf price across those ' +
  'stores. These are computed relational facts, not store menus.'

// Category-name → URL slug. Stays in compareRoute (not a generic SSR primitive; it
// is the /compare category-page routing contract, imported by sitemapRoute).
export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ---- render functions (pure over the derived envelopes; exported for tests) ----

// The valid category set is derived from the disparities that actually exist, so a
// category page renders iff it has rows (stable, no thin/empty indexable pages).
export function categoriesFrom(disparities: MatchReport): string[] {
  // Defensive: a parseable-but-shapeless envelope must not throw (never a 500).
  const list = Array.isArray(disparities?.disparities) ? disparities.disparities : []
  const seen = new Set<string>()
  for (const d of list) seen.add(d.category)
  return [...seen].sort((a, b) => a.localeCompare(b))
}

export function renderIndexHtml(
  rollupsEnv: DerivedEnvelope<DisparityRollupsReport>,
  disparitiesEnv: DerivedEnvelope<MatchReport> = EMPTY_DISPARITIES_ENVELOPE,
): string {
  const canonical = `${BASE_URL}/compare`
  const jsonLd = datasetJsonLd({
    id: `${canonical}#dataset`,
    url: canonical,
    name: INDEX_DATASET_NAME,
    description: INDEX_DATASET_DESCRIPTION,
    generatedAt: rollupsEnv.generatedAt,
  })

  // Defensive reads: a parseable-but-shapeless envelope degrades to empty, never a 500.
  // Also drop rows missing the string/numeric fields they're rendered/sorted through
  // (category → categorySlug/escapeHtml, dispensaryId → storeName, counts → sort/text).
  const byCategory = (Array.isArray(rollupsEnv.data?.byCategory) ? rollupsEnv.data.byCategory : [])
    .filter(
      (c) =>
        !!c &&
        typeof c.category === 'string' &&
        Number.isFinite(c.disparityCount) &&
        Number.isFinite(c.distinctStoresInvolved),
    )
  const byStore = (Array.isArray(rollupsEnv.data?.byStore) ? rollupsEnv.data.byStore : []).filter(
    (s) =>
      !!s &&
      typeof s.dispensaryId === 'string' &&
      Number.isFinite(s.timesCheapest) &&
      Number.isFinite(s.disparityCount),
  )
  const totalDisparities =
    typeof rollupsEnv.data?.totalDisparities === 'number' ? rollupsEnv.data.totalDisparities : 0

  let body: string
  if (totalDisparities === 0 || byCategory.length === 0) {
    body = `      <h1>${escapeHtml(INDEX_DATASET_NAME)}</h1>
      <p class="lede">${escapeHtml(INDEX_DATASET_DESCRIPTION)}</p>
      <p>No comparison data is available right now. Please check back later.</p>`
  } else {
    const categoryList = byCategory
      .slice()
      .sort((a, b) => b.disparityCount - a.disparityCount)
      .map(
        (c) =>
          `        <li><a href="/compare/${categorySlug(c.category)}">${escapeHtml(c.category)}</a> — ` +
          `${c.disparityCount} same-product comparisons across ${c.distinctStoresInvolved} stores</li>`,
      )
      .join('\n')

    // Honest "which stores are most often the cheapest" fact (byStore.timesCheapest).
    const topCheapest = renderTopCheapest(byStore)

    const storeCount =
      (rollupsEnv.coverage as { storeCount?: number } | undefined)?.storeCount ?? byStore.length

    // Real exclusion counts (Inspectability, AC3) — sourced from the disparities
    // envelope's own accounting, not described qualitatively.
    const d = disparitiesEnv.data
    const totalRecords = typeof d?.totalRecords === 'number' ? d.totalRecords : 0
    const nonComparable =
      typeof d?.nonComparableCategoryCount === 'number' ? d.nonComparableCategoryCount : 0
    const flagged = typeof d?.excludedFlagCount === 'number' ? d.excludedFlagCount : 0
    const unmatched = typeof d?.unmatchedCount === 'number' ? d.unmatchedCount : 0

    body = `      <h1>${escapeHtml(INDEX_DATASET_NAME)}</h1>
      <p class="lede">${escapeHtml(INDEX_DATASET_DESCRIPTION)}</p>

      <h2>Compare by category</h2>
      <ul>
${categoryList}
      </ul>

      <h2>Stores most often cheapest</h2>
      <ul>
${topCheapest}
      </ul>

      <p class="accounting">Based on ${totalDisparities} same-product comparisons across ${storeCount} licensed Washington stores, drawn from ${totalRecords} product listings. A product is compared only when two or more stores carry the same item at the same weight. Excluded from comparison: ${nonComparable} non-comparable (different category or weight), ${flagged} flagged by data quality, ${unmatched} unmatched.</p>`
  }

  return page({
    title: `Compare cannabis prices across Washington stores | Gmas List`,
    description: INDEX_DATASET_DESCRIPTION,
    canonical,
    jsonLd,
    bodyHtml: body,
  })
}

export function renderCategoryHtml(
  category: string,
  disparitiesEnv: DerivedEnvelope<MatchReport>,
): string {
  const slug = categorySlug(category)
  const canonical = `${BASE_URL}/compare/${slug}`
  const label = category
  const name = `${label} price comparisons across Washington cannabis retailers`
  const description =
    `Same-product ${label.toLowerCase()} price comparisons across licensed Washington retailers. ` +
    `The lowest and highest shelf price for each item carried by two or more stores.`

  const jsonLd = datasetJsonLd({
    id: `${canonical}#dataset`,
    url: canonical,
    name,
    description,
    generatedAt: disparitiesEnv.generatedAt,
  })

  // Defensive: a parseable-but-shapeless envelope must not throw (never a 500).
  // Drop rows missing the fields we render/reduce through (isRenderableDisparity)
  // so one broken row is skipped, not a 500; the count below reflects renderable rows.
  const all = Array.isArray(disparitiesEnv.data?.disparities) ? disparitiesEnv.data.disparities : []
  const rows: Disparity[] = all
    .filter((d) => d.category === category && isRenderableDisparity(d))
    .sort((a, b) => b.spread - a.spread)
  const shown = rows.slice(0, MAX_CATEGORY_ROWS)

  let body: string
  if (rows.length === 0) {
    body = `      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <p>No comparisons are available in this category right now.</p>`
  } else {
    const items = shown
      .map((d) => {
        const n = d.storesCarrying.length
        const label = `${escapeHtml(d.displayName)} (${d.weightGrams}g)`
        // Shared endpoints: null on a tie (every store at one price) → state it plainly
        // rather than naming a single store as both cheapest and priciest.
        const ep = disparityEndpoints(d)
        if (!ep) {
          return `        <li>${label}: ${formatUsd(d.lowPrice)} at all ${n} stores</li>`
        }
        return (
          `        <li>${label}: ` +
          `${formatUsd(ep.cheapest.price)} at ${escapeHtml(storeName(ep.cheapest.dispensaryId))} to ` +
          `${formatUsd(ep.priciest.price)} at ${escapeHtml(storeName(ep.priciest.dispensaryId))} across ${n} stores</li>`
        )
      })
      .join('\n')

    const capNote =
      rows.length > shown.length
        ? ` Showing the ${shown.length} largest price gaps of ${rows.length}.`
        : ''

    body = `      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <ul>
${items}
      </ul>
      <p class="accounting">${rows.length} same-product comparisons.${capNote} Each row is the same product at the same weight sold at two or more stores; prices are shelf prices, not discounts. Verify in store.</p>`
  }

  return page({
    title: `${label} price comparison across Washington cannabis stores | Gmas List`,
    description,
    canonical,
    jsonLd,
    bodyHtml: body,
  })
}

// 404 body for an unknown category slug — minimal, non-indexable content so
// crawlers never mint thin pages for arbitrary slugs.
function notFoundHtml(): string {
  return page({
    title: 'Comparison not found | Gmas List',
    description: 'This price comparison category was not found.',
    canonical: `${BASE_URL}/compare`,
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Comparison not found' },
    bodyHtml: `      <h1>Comparison not found</h1>
      <p>That category is not available. <a href="/compare">See all price comparisons.</a></p>`,
  })
}

// ==== geo-scoped citable pages (ADR-107) ==================================
// /compare/<region> and /compare/<category>/<region> answer long-tail geo queries
// ("cheapest concentrate deals Bellingham WA today") from the already-derived
// regional-price-floor fact. Same SSR/fail-soft posture as the category pages.

// At most this many floor rows on one region-category page — cheapest first, so the
// cap keeps the lowest observed prices (the answer to "cheapest") and trims the tail.
const MAX_REGION_CATEGORY_ROWS = 100

// Read the derived regional floors + join store cities/names from data.json, then
// project into named regions. One source for the dispatcher, the geo pages, AND the
// sitemap, so an index link and a sitemap entry can never disagree (sitemap discipline).
// Fail-soft throughout: an unreadable data.json degrades to empty cityById (regions
// with no nameable city drop out), never a throw.
export function readRegions(): {
  regions: Region[]
  generatedAt: string
  nameById: Map<string, string>
} {
  const env = readRegionalPriceFloor()
  const cityById = new Map<string, string | null>()
  const nameById = new Map<string, string>()
  const statusById = new Map<string, string>()
  try {
    for (const d of buildApiData().dispensaries) {
      cityById.set(d.id, parseCity(d.address))
      if (typeof d.name === 'string' && d.name.length > 0) nameById.set(d.id, d.name)
      if (typeof d.status === 'string') statusById.set(d.id, d.status)
    }
  } catch {
    // no city/name/status join available → buildRegions drops un-nameable clusters → []
  }
  return {
    regions: buildRegions(env.data, cityById, statusById),
    generatedAt: env.generatedAt,
    nameById,
  }
}

// Real store display name (from data.json) when known, else the title-cased slug —
// so a floor row never shows a raw dispensary id.
function displayStoreName(id: string, nameById: Map<string, string>): string {
  return nameById.get(id) ?? storeName(id)
}

// Human list: "A, B and C".
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function regionDatasetJsonLd(opts: {
  id: string
  url: string
  name: string
  description: string
  label: string
  regionSlug: string
  generatedAt: string
}) {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': opts.id,
    url: opts.url,
    name: opts.name,
    description: opts.description,
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', '@id': ORG_ID, name: 'Gmas List', url: `${BASE_URL}/` },
    // A Place (the metro area) WITHIN Washington — honest about the local scope
    // while keeping the WA-only areaServed invariant (WAC 314-55-155).
    spatialCoverage: {
      '@type': 'Place',
      name: `${opts.label}, Washington`,
      containedInPlace: { '@type': 'State', name: 'Washington' },
    },
    variableMeasured: ['Lowest observed shelf price'],
    // Area-code handles ("425", "the 425") are appended as colloquial locality KEYWORDS
    // only — never as areaServed/telephone (an NPA is a phone prefix, not a service area).
    keywords: [
      'cannabis price comparison',
      opts.label,
      'Washington',
      'cheapest cannabis deals',
      ...areaCodeKeywords(opts.regionSlug),
    ],
  }
  if (opts.generatedAt && opts.generatedAt !== EPOCH_GENERATED_AT) {
    ld.dateModified = opts.generatedAt
  }
  return ld
}

// GET /compare/<region> — region landing: coverage + links to each category page.
export function renderRegionIndexHtml(region: Region, generatedAt: string): string {
  const canonical = `${BASE_URL}/compare/${region.slug}`
  const name = `Cheapest cannabis prices in the ${region.label}, WA area`
  const description =
    `The lowest observed shelf prices on cannabis products across ${region.storeCount} licensed ` +
    `retailers in the ${region.label}, Washington area. Compare same-product prices by category to ` +
    `find the cheapest option and decide whether it is worth the drive.`

  const jsonLd = regionDatasetJsonLd({
    id: `${canonical}#dataset`,
    url: canonical,
    name,
    description,
    label: region.label,
    regionSlug: region.slug,
    generatedAt,
  })

  const coverage =
    region.cities.length > 0
      ? `Covers ${joinNames(region.cities.map(escapeHtml))}.`
      : ''
  // Colloquial area-code handle ("locals call it the 360") — a visible, crawlable token so
  // this page answers "…in the 360" phrasing. '' when the region has no mapped NPA.
  const nickname = escapeHtml(areaCodeNicknameSentence(region.slug, region.label))

  let body: string
  if (region.categories.length === 0) {
    body = `      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <p>No comparison data is available for this area right now. Please check back later.</p>`
  } else {
    const catList = region.categories
      .map(
        (c) =>
          `        <li><a href="/compare/${c.slug}/${region.slug}">Cheapest ${escapeHtml(c.category)} in ${escapeHtml(region.label)}</a> — ` +
          `${c.floorCount} same-product price${c.floorCount === 1 ? '' : 's'} compared</li>`,
      )
      .join('\n')

    // If every floor in the region is currently stale (all member stores dark), the
    // whole landing is last-known data (ADR-111) — caveat it rather than imply freshness.
    const allStale = region.floors.length > 0 && region.floors.every((f) => f.stale)
    // Shared honesty-freshness sentence (ADR-111); allStale is this surface's verdict.
    const asOfSentence = freshnessSentence(generatedAt, allStale)
    body = `      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${escapeHtml(description)}</p>

      <h2>Compare by category</h2>
      <ul>
${catList}
      </ul>

      <p class="accounting">${coverage}${nickname ? ` ${nickname}` : ''} Based on the lowest observed shelf price for each product carried by ${region.storeCount} licensed ${escapeHtml(region.label)}-area stores.${asOfSentence} Prices are shelf prices, not discounts, and can change without notice. Verify in store.</p>`
  }

  return page({
    title: `Cheapest cannabis deals in ${region.label}, WA | Gmas List`,
    description,
    canonical,
    jsonLd,
    bodyHtml: body,
  })
}

// GET /compare/<category>/<region> — the canonical long-tail answer page: this
// area's lowest observed price on each product in one category, cheapest first.
export function renderRegionCategoryHtml(
  region: Region,
  category: string,
  generatedAt: string,
  nameById: Map<string, string>,
): string {
  const catSlug = slugify(category)
  const canonical = `${BASE_URL}/compare/${catSlug}/${region.slug}`
  const name = `Cheapest ${category} in the ${region.label}, WA area`
  // HONESTY: frame as the lowest price on EACH product, never "the cheapest
  // <category> is $X" (that would be a Gate-1 category leaderboard). Each row is a
  // same-product min.
  const description =
    `The lowest observed shelf price on each ${category.toLowerCase()} product carried by two or ` +
    `more licensed retailers in the ${region.label}, Washington area. Same-product prices only, ` +
    `not a category ranking — decide which deal is worth the drive.`

  const jsonLd = regionDatasetJsonLd({
    id: `${canonical}#dataset`,
    url: canonical,
    name,
    description,
    label: region.label,
    regionSlug: region.slug,
    generatedAt,
  })

  const nickname = escapeHtml(areaCodeNicknameSentence(region.slug, region.label))
  const all = floorsForCategory(region, category)
  const shown = all.slice(0, MAX_REGION_CATEGORY_ROWS)

  let body: string
  if (all.length === 0) {
    body = `      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <p>No ${escapeHtml(category.toLowerCase())} comparisons are available in this area right now.</p>`
  } else {
    const items = shown
      .map((f: RegionalFloor) => {
        const stores = joinNames(
          f.floorDispensaryIds.map((id) => escapeHtml(displayStoreName(id, nameById))),
        )
        // A row whose every tied store has a stale/failed extraction is a last-known
        // price (ADR-111): keep it (URL durability) but never present it as currently
        // verified — mark it so no stale low reads as a fresh low (honesty inheritance).
        const staleMark = f.stale ? ' — freshness unverified' : ''
        return `        <li>${escapeHtml(f.displayName)} (${f.weightGrams}g) — ${formatUsd(f.floorPrice)} at ${stores}${staleMark}</li>`
      })
      .join('\n')

    const capNote =
      all.length > shown.length ? ` Showing the ${shown.length} lowest-priced of ${all.length}.` : ''
    // When EVERY shown row is stale the whole page is last-known data — say so at the
    // page level (Ruling A(b)); a mixed page keeps the normal "observed as of" line and
    // relies on the per-row marker above. Epoch (never-derived) → no date to print.
    const allStale = shown.length > 0 && shown.every((f) => f.stale)
    // Shared honesty-freshness sentence (ADR-111); allStale is this surface's verdict.
    const asOfSentence = freshnessSentence(generatedAt, allStale)
    const coverage =
      region.cities.length > 0 ? ` Covers ${joinNames(region.cities.map(escapeHtml))}.` : ''

    body = `      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <ul>
${items}
      </ul>
      <p class="accounting">${all.length} same-product ${escapeHtml(category.toLowerCase())} comparison${all.length === 1 ? '' : 's'} across ${region.storeCount} licensed ${escapeHtml(region.label)}-area stores.${coverage}${nickname ? ` ${nickname}` : ''}${capNote} Each row is the lowest observed shelf price for that exact product and weight among the area stores that carry it — a per-product low, not a discount or a category ranking.${asOfSentence} Verify in store.</p>`
  }

  return page({
    title: `Cheapest ${category} in ${region.label}, WA | Gmas List`,
    description,
    canonical,
    jsonLd,
    bodyHtml: body,
  })
}

// ---- route handlers ----

// GET /compare — index over all cross-store price-disparity categories.
export function compareIndexRoute(_req: Request, res: Response) {
  const rollups = readDerived<DisparityRollupsReport>(
    DISPARITY_ROLLUPS_PATH,
    EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
  )
  const disparities = readDerived<MatchReport>(DISPARITIES_PATH, EMPTY_DISPARITIES_ENVELOPE)
  res.set('Cache-Control', 'public, max-age=3600')
  res.type('html').send(renderIndexHtml(rollups, disparities))
}

// GET /compare/:category — per-category same-product cross-store comparisons.
export function compareCategoryRoute(req: Request, res: Response) {
  const slug = String(req.params.category ?? '').toLowerCase()
  // Validate against the SAME category source the index links from (rollups
  // byCategory), so an index link can never point at a slug this route 404s.
  const rollups = readDerived<DisparityRollupsReport>(
    DISPARITY_ROLLUPS_PATH,
    EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
  )
  const categories = (Array.isArray(rollups.data?.byCategory) ? rollups.data.byCategory : []).map(
    (c) => c.category,
  )
  const match = categories.find((c) => categorySlug(c) === slug)

  if (!match) {
    // Short cache: a slug invalid now may become valid when a fresh artifact lands.
    res.status(404).set('Cache-Control', 'public, max-age=60').type('html').send(notFoundHtml())
    return
  }

  const disparities = readDerived<MatchReport>(DISPARITIES_PATH, EMPTY_DISPARITIES_ENVELOPE)
  res.set('Cache-Control', 'public, max-age=3600')
  res.type('html').send(renderCategoryHtml(match, disparities))
}

// GET /compare/:category — single-segment dispatcher. The one path segment is
// EITHER a geo region (bellingham) OR a price-disparity category (concentrate);
// the two slug sets are disjoint. A region slug renders the region landing page,
// anything else falls through to the existing category behavior (which 404s an
// unknown slug). Registered in place of compareCategoryRoute so both live at one
// route pattern.
export function compareSegmentRoute(req: Request, res: Response) {
  const slug = String(req.params.category ?? '').toLowerCase()
  const { regions, generatedAt } = readRegions()
  const region = findRegion(regions, slug)
  if (region) {
    res.set('Cache-Control', 'public, max-age=3600')
    res.type('html').send(renderRegionIndexHtml(region, generatedAt))
    return
  }
  compareCategoryRoute(req, res)
}

// GET /compare/:category/:region — this area's cheapest same-product prices in one
// category. Both segments are validated against readRegions() (the SAME source the
// region index links from), so an index link can never point at a slug this 404s.
export function compareCategoryRegionRoute(req: Request, res: Response) {
  const regionSlug = String(req.params.region ?? '').toLowerCase()
  const catSlug = String(req.params.category ?? '').toLowerCase()
  const { regions, generatedAt, nameById } = readRegions()

  const region = findRegion(regions, regionSlug)
  const category = region?.categories.find((c) => c.slug === catSlug)?.category

  if (!region || !category) {
    // Short cache: a slug invalid now may become valid when a fresh artifact lands.
    res.status(404).set('Cache-Control', 'public, max-age=60').type('html').send(notFoundHtml())
    return
  }

  res.set('Cache-Control', 'public, max-age=3600')
  res.type('html').send(renderRegionCategoryHtml(region, category, generatedAt, nameById))
}
