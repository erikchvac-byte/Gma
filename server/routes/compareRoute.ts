import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Request, Response } from 'express'
import type { MatchReport } from '../utils/crossStoreValue.js'
import type { Disparity } from '../types/index.js'
import type { DisparityRollupsReport } from '../utils/disparityRollups.js'
import type { DerivedEnvelope } from '../utils/derivedEnvelope.js'
import {
  readDerived,
  EMPTY_DISPARITIES_ENVELOPE,
  EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
} from './valueRoute.js'

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

const BASE_URL = 'https://gmaslist.com'
const ORG_ID = `${BASE_URL}/#organization`

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

// ---- small pure helpers (mirror aboutRoute.ts) ----

// Text-node escaping only (& < >).
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Attribute-context escaping: also neutralize the double-quote that would break
// out of content="…". Used for any data-derived text placed into an attribute.
function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

// JSON-LD lives in a <script> element; < is escaped so page copy can never
// terminate the script element. < is valid JSON and parses back to "<".
function jsonLdScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

// dispensaryId slugs are derived from store names, so title-casing recovers a
// readable name with no data.json coupling (a-greener-today-lynnwood -> "A
// Greener Today Lynnwood").
export function storeName(dispensaryId: string): string {
  return dispensaryId
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

// Assemble a full HTML document with the shared dark styling + a JSON-LD block.
function page(opts: {
  title: string
  description: string
  canonical: string
  jsonLd: unknown
  bodyHtml: string
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0E1417" />
    <title>${escapeHtml(opts.title)}</title>
    <meta name="description" content="${escapeAttr(opts.description)}" />
    <link rel="canonical" href="${opts.canonical}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script type="application/ld+json">${jsonLdScript(opts.jsonLd)}</script>
    <style>
      body {
        margin: 0;
        background: #0E1417;
        color: #e6edf0;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        line-height: 1.6;
      }
      main { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
      h1 { font-size: 1.6rem; line-height: 1.3; }
      h2 { font-size: 1.2rem; margin-top: 2.25rem; }
      a { color: #35c2a0; }
      .lede { border-left: 3px solid #35c2a0; padding-left: 1rem; }
      ul { padding-left: 1.1rem; }
      li { margin: 0.35rem 0; }
      .accounting { color: #9fb0b5; font-size: 0.9rem; margin-top: 2.5rem; }
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">&larr; Back to the deals</a></p>
${opts.bodyHtml}
    </main>
  </body>
</html>
`
}

// ---- JSON-LD builders ----

// The fail-soft EMPTY_* envelopes carry a fixed epoch `generatedAt` (see
// valueRoute EMPTY_GENERATED_AT) meaning "never derived" — do NOT publish it as a
// real Dataset.dateModified, or crawlers ingest a false 1970 freshness date.
const EPOCH_GENERATED_AT = new Date(0).toISOString()

function datasetJsonLd(opts: {
  id: string
  url: string
  name: string
  description: string
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
    spatialCoverage: { '@type': 'State', name: 'Washington' },
    variableMeasured: ['Lowest shelf price', 'Highest shelf price', 'Cross-store price spread'],
    keywords: ['cannabis price comparison', 'Washington', 'cross-store', 'cannabis deals'],
  }
  // Omit dateModified on the epoch sentinel (fail-soft / never-derived state).
  if (opts.generatedAt && opts.generatedAt !== EPOCH_GENERATED_AT) {
    ld.dateModified = opts.generatedAt
  }
  return ld
}

// Fail-soft goes deeper than the envelope: isEnvelope validates only the four
// top-level keys, so a parseable-but-shapeless artifact can still carry a broken
// row. Guard the fields a row is rendered/reduced through so one bad row degrades
// (is skipped) instead of throwing a 500 (empty storesCarrying → seedless reduce,
// undefined dispensaryId/displayName → .split/.replace throw, NaN price → "$NaN").
function isRenderableDisparity(d: Disparity): boolean {
  return (
    !!d &&
    typeof d.displayName === 'string' &&
    Number.isFinite(d.weightGrams) &&
    Number.isFinite(d.spread) &&
    Number.isFinite(d.lowPrice) &&
    Number.isFinite(d.highPrice) &&
    Array.isArray(d.storesCarrying) &&
    d.storesCarrying.length > 0 &&
    d.storesCarrying.every(
      (s) => !!s && typeof s.dispensaryId === 'string' && Number.isFinite(s.price),
    )
  )
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
    const topCheapest = byStore
      .slice()
      .filter((s) => s.timesCheapest > 0)
      .sort((a, b) => b.timesCheapest - a.timesCheapest)
      .slice(0, 5)
      .map(
        (s) =>
          `        <li>${escapeHtml(storeName(s.dispensaryId))} — cheapest on ${s.timesCheapest} of its ${s.disparityCount} compared products</li>`,
      )
      .join('\n')

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
        const stores = d.storesCarrying
        const n = stores.length
        const label = `${escapeHtml(d.displayName)} (${d.weightGrams}g)`
        // All stores at one price → no cross-store spread. State it plainly rather
        // than naming a single store as both cheapest and priciest (a tie would make
        // both argmin/argmax return the first store: "$35 at X to $35 at X").
        if (d.highPrice === d.lowPrice) {
          return `        <li>${label}: ${formatUsd(d.lowPrice)} at all ${n} stores</li>`
        }
        // Pull the price from the SAME store object we name, so the number and the
        // store can never disagree.
        const cheapest = stores.reduce((lo, s) => (s.price < lo.price ? s : lo))
        const priciest = stores.reduce((hi, s) => (s.price > hi.price ? s : hi))
        return (
          `        <li>${label}: ` +
          `${formatUsd(cheapest.price)} at ${escapeHtml(storeName(cheapest.dispensaryId))} to ` +
          `${formatUsd(priciest.price)} at ${escapeHtml(storeName(priciest.dispensaryId))} across ${n} stores</li>`
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
