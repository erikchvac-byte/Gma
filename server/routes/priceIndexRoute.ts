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
import { readRegions, categorySlug } from './compareRoute.js'
import {
  BASE_URL,
  escapeHtml,
  formatUsd,
  storeName,
  page,
  datasetJsonLd,
  isRenderableDisparity,
  disparityEndpoints,
  renderTopCheapest,
  freshnessSentence,
} from '../utils/ssrPage.js'
import { AGE_NOTICE } from '../utils/renderShellBody.js'

// WA Cannabis Price Index — the flagship citable asset (price-index-phase-1a).
// One server-rendered page that LEADS with the provable, quotable hook ("the same
// product can cost several times more one store over"), answers the 8 questions the
// AI-citation monitor scores in on-page + FAQPage schema form, and is dated +
// staleness-safe. Reuses the /compare SSR primitives (ssrPage.ts) and reads the
// EXISTING committed derived JSON at request time — no derive-pipeline change, no
// new committed data file (see story-price-index.md "Why this scope").
//
// HONESTY CONTRACT (identical to /compare): publish COMPUTED RELATIONAL FACTS
// (same-product cross-store price ranges), never a store's full menu, no banner
// discount % (Gate 2), no whole-catalog leaderboard / same-product only (Gate 1),
// no potency (Gate 5). Coverage is Washington only — the copy says "the licensed
// Washington dispensaries Gmas List tracks", NEVER "statewide" (PRFAQ crack #1).
//
// LOAD-BEARING: reads only the committed derived JSON via readDerived's fail-soft
// envelope — a missing/malformed artifact degrades to a safe page, never a 500.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DERIVED_DIR = path.join(__dirname, '../data/derived')
const DISPARITIES_PATH = path.join(DERIVED_DIR, 'disparities.json')
const DISPARITY_ROLLUPS_PATH = path.join(DERIVED_DIR, 'disparity-rollups.json')

const CANONICAL = `${BASE_URL}/price-index`

// Lead the page with the biggest same-product gaps; cap so the page stays a tight,
// citable summary (the long tail lives on the per-category /compare pages).
const MAX_HOOK_ROWS = 15

// Whole-file freshness (readiness finding #4): disparities.json rows carry NO
// per-row `stale` flag (unlike regional floors), so freshness here is a single
// age check on the artifact's own generatedAt. The pipeline re-derives at least
// weekly; only a genuinely stalled pipeline (no refresh in two weeks) softens the
// wording to "freshness currently unverified" rather than a plain "observed as of".
const PRICE_INDEX_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000

// Single source of truth for the Dataset name/description. The visible <h1> + lede
// and the Dataset JSON-LD are built from these SAME strings so Google's "schema
// text must match on-page text" holds by construction. Copy rule (as in compare/
// aboutRoute): no & < > in these strings, so the verbatim match survives escaping.
export const PRICE_INDEX_NAME = 'Washington cannabis price index'
export const PRICE_INDEX_DESCRIPTION =
  'A daily index of same-product cannabis price gaps across the licensed Washington dispensaries ' +
  'Gmas List tracks. For each product carried by two or more stores, the lowest and highest shelf ' +
  'price and the gap between them. These are computed relational facts, not store menus.'

// ---- FAQ (the GEO element) --------------------------------------------------
// Questions mirror server/scripts/citation-questions.json VERBATIM (the 8 queries
// the AI-citation monitor scores). Kept as a server-side literal (not imported from
// the JSON) so: (1) no tsconfig resolveJsonModule change; (2) the schema-text ==
// on-page-text invariant can never be silently broken by a monitor-question edit —
// if that file changes, update BOTH here and there. HARD copy rule: no & < > in any
// question or answer string, so the verbatim schema<->HTML match survives escaping.
// Answers are honesty-safe: WA-only, never "statewide", no discount %, no potency,
// and no single "best store" verdict (Gate 1 — we surface which stores are most
// often cheapest on like-for-like items, not a crowned winner).
export const PRICE_INDEX_FAQ: { q: string; a: string }[] = [
  {
    q: 'What are the best cannabis deals near Marysville, Washington right now?',
    a:
      'Gmas List tracks daily deals and same-product price gaps at the licensed dispensaries it follows across Washington, including the Marysville and Snohomish County area. Compare the current cross-store prices on this price index to see which nearby store is cheapest on the exact product you want.',
  },
  {
    q: 'Where can I find the cheapest ounce of cannabis flower in Washington state?',
    a:
      'Rather than crown one cheapest ounce, Gmas List compares the same flower product at the same weight across the Washington stores it tracks, so you see the real low and high shelf price for that exact item. The Flower comparisons show where the widest gaps are right now.',
  },
  {
    q: 'How do cannabis prices compare between dispensaries in Bellingham, WA?',
    a:
      'Gmas List computes same-product price differences across the licensed Bellingham-area dispensaries it tracks and shows the lowest and highest shelf price for each item. See the Bellingham area comparison page for the current cross-store gaps.',
  },
  {
    q: 'How can I tell if a Washington dispensary deal is actually a good price and not a fake discount?',
    a:
      'A banner percentage off can be measured against an inflated list price, so Gmas List ignores advertised discounts and instead compares the same product actual shelf price across stores. If one store price is well below the others for the identical item, that is a real gap rather than a marketing claim.',
  },
  {
    q: 'How can I compare cannabis prices for the same product across different Washington dispensaries?',
    a:
      'Gmas List matches identical products at the same weight across the Washington dispensaries it tracks and reports the lowest and highest price for each. This price index leads with the biggest same-product gaps so you can compare like for like.',
  },
  {
    q: 'What cannabis deals are available near Everett, Washington today?',
    a:
      'Gmas List tracks current deals and same-product price gaps at licensed dispensaries in the Everett area and across the rest of Washington it follows. Use this price index and the Everett area page to see which store is cheapest on a specific product today.',
  },
  {
    q: 'Where can I find real cannabis price drops at licensed Washington dispensaries?',
    a:
      'Gmas List flags a real price drop only when a product falls below its own recent typical price at that store, never from an advertised percentage off. That keeps a drop honest instead of a discount off an inflated list price.',
  },
  {
    q: 'What is the best value cannabis dispensary in Snohomish County, Washington?',
    a:
      'Gmas List does not crown a single best dispensary; it shows which of the Washington stores it tracks are most often the cheapest on the same products compared head to head. Check the stores-most-often-cheapest list on this price index for the Snohomish County area and beyond.',
  },
]

// FAQPage JSON-LD built from the SAME array the visible section renders.
function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: PRICE_INDEX_FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

// Visible "Common questions" section — the SAME Q/A strings the FAQPage schema uses,
// so the schema-text == on-page-text invariant holds (no & < > → escape is identity).
function faqSectionHtml(): string {
  const items = PRICE_INDEX_FAQ.map(
    ({ q, a }) => `        <h3>${escapeHtml(q)}</h3>\n        <p>${escapeHtml(a)}</p>`,
  ).join('\n')
  return `      <h2>Common questions</h2>\n${items}`
}

// Whole-file staleness (readiness #4): disparities.json has no per-row stale flag, so
// freshness is a single age check on the artifact's own generatedAt. Feeds the shared
// freshnessSentence(); epoch/invalid dates parse to non-finite → treated as fresh, and
// the shared helper prints no date for them (a populated file is never epoch here).
function isArtifactStale(generatedAt: string): boolean {
  const t = Date.parse(generatedAt)
  return Number.isFinite(t) && Date.now() - t > PRICE_INDEX_STALE_AFTER_MS
}

// spreadPct = spread / lowPrice → the gap as a multiple/fraction of the cheapest price.
// Show "N×" for a real multiple; a sub-0.1 ratio would round to "0.0×" (reads as no
// gap), so fall back to a percent — always an honest, non-empty figure (review #5).
function multiplePhrase(spreadPct: number): string {
  return spreadPct >= 0.1
    ? `${spreadPct.toFixed(1)}× the lowest price`
    : `${Math.round(spreadPct * 100)}% of the lowest price`
}

// ---- render (pure over the derived envelopes; exported for tests) -----------

export function renderPriceIndexHtml(
  disparitiesEnv: DerivedEnvelope<MatchReport> = EMPTY_DISPARITIES_ENVELOPE,
  rollupsEnv: DerivedEnvelope<DisparityRollupsReport> = EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
  regionLinks: { slug: string; label: string }[] = [],
): string {
  // Stamp the Dataset with the hook data source's own generatedAt (the disparities
  // artifact). datasetJsonLd omits dateModified on the epoch sentinel.
  const jsonLd = [
    datasetJsonLd({
      id: `${CANONICAL}#dataset`,
      url: CANONICAL,
      name: PRICE_INDEX_NAME,
      description: PRICE_INDEX_DESCRIPTION,
      generatedAt: disparitiesEnv.generatedAt,
    }),
    faqJsonLd(),
  ]

  // Defensive reads: a parseable-but-shapeless envelope degrades to empty, never a
  // 500. Drop rows missing rendered/reduced fields (isRenderableDisparity) and
  // zero-spread ties (highPrice === lowPrice) — a tie has no cross-store gap to show.
  const allRows = Array.isArray(disparitiesEnv.data?.disparities)
    ? disparitiesEnv.data.disparities
    : []
  const hookRows: Disparity[] = allRows
    // One pass: renderable AND a real cross-store gap (ties have nothing to show).
    .filter((d) => isRenderableDisparity(d) && d.highPrice > d.lowPrice)
    .sort((a, b) => b.spread - a.spread)
    .slice(0, MAX_HOOK_ROWS)

  // .filter() already returns a fresh array, so sort it in place (no extra .slice()).
  const byCategory = (Array.isArray(rollupsEnv.data?.byCategory) ? rollupsEnv.data.byCategory : [])
    .filter(
      (c) =>
        !!c &&
        typeof c.category === 'string' &&
        Number.isFinite(c.avgSpreadPct) &&
        Number.isFinite(c.disparityCount) &&
        Number.isFinite(c.distinctStoresInvolved),
    )
    .sort((a, b) => b.avgSpreadPct - a.avgSpreadPct)

  const byStore = (Array.isArray(rollupsEnv.data?.byStore) ? rollupsEnv.data.byStore : []).filter(
    (s) =>
      !!s &&
      typeof s.dispensaryId === 'string' &&
      Number.isFinite(s.timesCheapest) &&
      Number.isFinite(s.disparityCount),
  )

  let body: string
  if (hookRows.length === 0) {
    // Never-derived / empty / all-tie artifact — a safe page, still schema-bearing.
    body = `      <h1>${escapeHtml(PRICE_INDEX_NAME)}</h1>
      <p class="lede">${escapeHtml(PRICE_INDEX_DESCRIPTION)}</p>
      <p>No price comparison data is available right now. Please check back later.</p>
${faqSectionHtml()}`
  } else {
    const hookItems = hookRows
      .map((d) => {
        // Shared endpoints: price pulled from the SAME store object we name (number and
        // store can never disagree). ties are pre-filtered above, so ep is non-null, but
        // guard so a slipped-through tie skips the row rather than crashing.
        const ep = disparityEndpoints(d)
        if (!ep) return ''
        const n = d.storesCarrying.length
        const label = `${escapeHtml(d.displayName)} (${d.weightGrams}g)`
        // Render both the $ spread and the multiple/percent of the lowest price (#3/#5).
        return (
          `        <li>${label}: ` +
          `${formatUsd(ep.cheapest.price)} at ${escapeHtml(storeName(ep.cheapest.dispensaryId))} to ` +
          `${formatUsd(ep.priciest.price)} at ${escapeHtml(storeName(ep.priciest.dispensaryId))} — ` +
          `a ${formatUsd(d.spread)} gap, ${multiplePhrase(d.spreadPct)}, across ${n} stores</li>`
        )
      })
      .filter((s) => s !== '')
      .join('\n')

    const categoryItems = byCategory
      .map((c) => {
        const pct = Math.round(c.avgSpreadPct * 100)
        // Link each category into its existing /compare long-tail page (funnels crawlers
        // deeper). Use the exported categorySlug (the /compare routing contract) so these
        // links can never drift from the slugs compareCategoryRoute serves (review #3).
        const slug = categorySlug(c.category)
        const link = slug
          ? `<a href="/compare/${slug}">${escapeHtml(c.category)}</a>`
          : escapeHtml(c.category)
        return (
          `        <li>${link} prices vary about ${pct}% store to store on average, ` +
          `across ${c.disparityCount} same-product comparisons at ${c.distinctStoresInvolved} stores</li>`
        )
      })
      .join('\n')

    const topCheapest = renderTopCheapest(byStore)

    // Accounting counts. Prefer the rollups' own totals; when the rollups artifact is
    // missing/empty (but disparities are present), recover honest figures from the
    // disparities artifact itself rather than printing "across 0 stores" / over-counting
    // broken rows (review #2/#4). Ties ARE real same-product comparisons, so they count
    // toward totalDisparities; only non-renderable (shapeless) rows are excluded.
    const coverageStoreCount = (rollupsEnv.coverage as { storeCount?: number } | undefined)
      ?.storeCount
    let storeCount = coverageStoreCount ?? byStore.length
    let totalDisparities =
      typeof rollupsEnv.data?.totalDisparities === 'number' ? rollupsEnv.data.totalDisparities : 0
    // A falsy count here (rollups missing, or the EMPTY fallback whose totals are 0)
    // while we DO have hook rows is the degraded state — recover honest figures from
    // the disparities artifact rather than print "0 comparisons" / "across 0 stores".
    if (!storeCount || !totalDisparities) {
      const seen = new Set<string>()
      let renderable = 0
      for (const row of allRows) {
        if (!isRenderableDisparity(row)) continue
        renderable++
        for (const s of row.storesCarrying) seen.add(s.dispensaryId)
      }
      if (!storeCount) storeCount = seen.size
      if (!totalDisparities) totalDisparities = renderable
    }

    const d = disparitiesEnv.data
    const totalRecords = typeof d?.totalRecords === 'number' ? d.totalRecords : 0

    // Lead the prose with the most DRAMATIC multiple (readiness #3 — "lead with the ×
    // so the copy matches the PRFAQ hook"), not the top-by-$ row: live, the biggest $
    // gap can be a low multiple (e.g. $100 → $200 = 1.0×) while the quotable hook is a
    // smaller-$ but far larger multiple ($14 → $84 = 4.8×). The TABLE still ranks by $;
    // only the headline features the max spreadPct among the shown rows. Anchored by the
    // real price range so the multiple is never an untethered claim.
    const topByMultiple = hookRows.reduce((hi, d) => (d.spreadPct > hi.spreadPct ? d : hi))
    const hookLede =
      `Right now the same product can cost far more at one store than another. The biggest difference ` +
      `Gmas List sees is ${multiplePhrase(topByMultiple.spreadPct)} — ${escapeHtml(topByMultiple.displayName)} ` +
      `ranges from ${formatUsd(topByMultiple.lowPrice)} to ${formatUsd(topByMultiple.highPrice)}.`

    // Category-list section is optional (present only when rollups have categories).
    const categorySection =
      categoryItems.length > 0
        ? `

      <h2>How much prices vary by category</h2>
      <ul>
${categoryItems}
      </ul>`
        : ''

    const cheapestSection =
      topCheapest.length > 0
        ? `

      <h2>Stores most often cheapest</h2>
      <ul>
${topCheapest}
      </ul>`
        : ''

    // Region funnel: link the flagship into the existing geo /compare/<region> hubs
    // (readRegions() at request time; [] in tests / on read failure → the /compare
    // hub link alone still funnels crawlers into the long tail).
    const regionItems = regionLinks
      .filter((r) => r.slug.length > 0)
      .map(
        (r) =>
          `        <li><a href="/compare/${escapeHtml(r.slug)}">Cannabis prices in the ${escapeHtml(r.label)} area</a></li>`,
      )
      .join('\n')
    const regionSection =
      regionItems.length > 0
        ? `

      <h2>Compare by area</h2>
      <ul>
${regionItems}
      </ul>`
        : ''

    body = `      <h1>${escapeHtml(PRICE_INDEX_NAME)}</h1>
      <p class="lede">${escapeHtml(PRICE_INDEX_DESCRIPTION)}</p>
      <p>${hookLede}</p>

      <h2>Biggest same-product price gaps right now</h2>
      <ul>
${hookItems}
      </ul>${categorySection}${cheapestSection}${regionSection}

      <p><a href="/compare">See all cross-store price comparisons</a>.</p>

${faqSectionHtml()}

      <p>${escapeHtml(AGE_NOTICE)}</p>

      <p class="accounting">Based on ${totalDisparities} same-product comparisons across ${storeCount} licensed Washington stores, drawn from ${totalRecords} product listings. A product is compared only when two or more stores carry the same item at the same weight; prices are shelf prices, not discounts.${freshnessSentence(disparitiesEnv.generatedAt, isArtifactStale(disparitiesEnv.generatedAt))} Verify in store.</p>`
  }

  return page({
    title: `Washington cannabis price index — same-product price gaps | Gmas List`,
    description: PRICE_INDEX_DESCRIPTION,
    canonical: CANONICAL,
    jsonLd,
    bodyHtml: body,
  })
}

// ---- route handler ----------------------------------------------------------

// GET /price-index — the flagship citable asset. Reads the committed derived JSON
// at request time (mirror compareIndexRoute); fail-soft to a safe page.
export function priceIndexRoute(_req: Request, res: Response) {
  const disparities = readDerived<MatchReport>(DISPARITIES_PATH, EMPTY_DISPARITIES_ENVELOPE)
  const rollups = readDerived<DisparityRollupsReport>(
    DISPARITY_ROLLUPS_PATH,
    EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
  )
  // Region hubs for the "Compare by area" funnel. readRegions() is itself fail-soft
  // (returns [] regions on any read failure) — the same direct call compareSegmentRoute
  // makes, so no extra try/catch is warranted here (review #10).
  const regionLinks = readRegions().regions.map((r) => ({ slug: r.slug, label: r.label }))
  res.set('Cache-Control', 'public, max-age=3600')
  res.type('html').send(renderPriceIndexHtml(disparities, rollups, regionLinks))
}
