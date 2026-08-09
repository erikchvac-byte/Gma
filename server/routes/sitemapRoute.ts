import type { Request, Response } from 'express'
import type { DisparityRollupsReport } from '../utils/disparityRollups.js'
import { readDerived, EMPTY_DISPARITY_ROLLUPS_ENVELOPE } from './valueRoute.js'
import { categorySlug, readRegions } from './compareRoute.js'
import { EPOCH_GENERATED_AT } from '../utils/ssrPage.js'
import { ENTITY_DESCRIPTION } from './aboutRoute.js'
import { buildApiData } from '../utils/buildApiData.js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Phase 1 technical-SEO foundation (docs/seo-ai-crawler-visibility-plan.md): the
// robots.txt + sitemap.xml that make the two shipped server-rendered surfaces
// (/about — ADR-078, /compare + /compare/:category — ADR-079) discoverable to
// crawlers instead of relying on the internal /about->/compare link alone.
//
// Both are served as Express routes (NOT static files in client/public) so the
// sitemap can enumerate /compare/<category> URLs from the SAME derived source the
// /compare index links from — an index link and a sitemap entry can never disagree.
// They MUST be registered before the production SPA fallback (index.ts), or the
// `/^(?!\/api).*/` catch-all would return the React shell for these paths.
//
// LOAD-BEARING: reads only the committed derived rollups via readDerived's
// fail-soft envelope — a missing/malformed artifact degrades to a sitemap of just
// the static URLs, never a 500.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DISPARITY_ROLLUPS_PATH = path.join(__dirname, '../data/derived/disparity-rollups.json')

const BASE_URL = 'https://gmaslist.com'

// robots.txt: allow the whole site to every crawler, keep the JSON API out of the
// index (thin, non-page content), and advertise the sitemap. Phase 3 of the plan
// settled on "allow all crawlers" (citation-search AND training).
//
// The `*` group already permits every agent, but some AI tools read the ABSENCE of
// a dedicated group conservatively (e.g. Gemini's browser reported a bogus
// Google-Extended opt-out). So each AI/citation crawler gets an EXPLICIT Allow
// group — un-misreadable as an opt-out. A named group is self-contained (a crawler
// that matches it ignores `*`), so each must repeat `Disallow: /api/`.
const AI_CRAWLER_AGENTS = [
  // AI training / model-usage tokens
  'Google-Extended',
  'GPTBot',
  'ClaudeBot',
  'Applebot-Extended',
  'CCBot',
  'Meta-ExternalAgent',
  // AI citation / live-answer crawlers
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User',
  'Bingbot',
]

const aiCrawlerGroups = AI_CRAWLER_AGENTS.map(
  (agent) => `User-agent: ${agent}\nAllow: /\nDisallow: /api/\n`,
).join('\n')

export const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /api/

${aiCrawlerGroups}
Sitemap: ${BASE_URL}/sitemap.xml
`

// Stable, crawlable pages that always exist regardless of derived-data state.
// Per-store /store/<id> URLs are added dynamically below (Phase 1a). Per-DEAL
// URLs remain deliberately absent (deals churn hourly, no stable per-deal page).
const STATIC_PATHS = ['/', '/about', '/compare', '/price-index']

// Data-backed static pages stamped with the derived artifact's generatedAt as
// lastmod (their honest "last changed" signal); the other statics get none.
const DATA_BACKED_STATIC = new Set(['/compare', '/price-index'])

// sitemaps.org requires XML-escaping of loc values; our paths are ASCII and
// category slugs are already [a-z0-9-] (categorySlug), but escape defensively so a
// future path with an & or query can never emit malformed XML.
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function urlEntry(loc: string, lastmod?: string): string {
  // Never stamp the epoch sentinel (a never-derived artifact's generatedAt) as a real
  // lastmod — that would advertise a false 1970 freshness date to crawlers (review #6).
  const stamp = lastmod && lastmod !== EPOCH_GENERATED_AT ? lastmod : undefined
  const lastmodLine = stamp ? `\n    <lastmod>${escapeXml(stamp)}</lastmod>` : ''
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodLine}\n  </url>`
}

// Pure builder (exported for tests). `categories` are the raw category names from
// the rollups; each becomes a /compare/<slug> URL. `generatedAt` is the derived
// artifact's own timestamp — used as lastmod ONLY for the data-backed /compare
// URLs, since that is the honest "last changed" signal for them. Static entity
// pages (/, /about) get no lastmod rather than a fabricated one.
export function buildSitemapXml(
  categories: string[],
  generatedAt: string,
  storeSlugs: string[] = [],
  regionPaths: { path: string; lastmod?: string }[] = [],
): string {
  const staticEntries = STATIC_PATHS.map((p) => {
    // Data-backed statics (/compare, /price-index) are stamped with the artifact's
    // generatedAt too; static entity pages (/, /about) get no fabricated lastmod.
    const lastmod = DATA_BACKED_STATIC.has(p) ? generatedAt : undefined
    return urlEntry(`${BASE_URL}${p}`, lastmod)
  })

  const categoryEntries = categories
    .map((c) => categorySlug(c))
    .filter((slug) => slug.length > 0)
    // De-dupe: two category names could collide to one slug; a sitemap must not
    // list the same URL twice.
    .filter((slug, i, arr) => arr.indexOf(slug) === i)
    .sort()
    .map((slug) => urlEntry(`${BASE_URL}/compare/${slug}`, generatedAt))

  // One /store/<id> per store. No lastmod: deals churn hourly, so there is no
  // honest single "last changed" timestamp for the page (like /, /about).
  const storeEntries = storeSlugs
    .filter((slug) => typeof slug === 'string' && slug.length > 0)
    .filter((slug, i, arr) => arr.indexOf(slug) === i)
    .sort()
    .map((slug) => urlEntry(`${BASE_URL}/store/${slug}`))

  // Geo-scoped citable pages (ADR-107): /compare/<region> and
  // /compare/<category>/<region>. De-duped; stamped with the regional-floor
  // artifact's own generatedAt (its honest "last changed" signal).
  const regionEntries = regionPaths
    .filter((r) => typeof r?.path === 'string' && r.path.length > 0)
    .filter((r, i, arr) => arr.findIndex((x) => x.path === r.path) === i)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((r) => urlEntry(`${BASE_URL}${r.path}`, r.lastmod))

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...categoryEntries, ...regionEntries, ...storeEntries].join('\n')}
</urlset>
`
}

// Store ids for the sitemap, read fail-soft: an unreadable/malformed data.json
// degrades to no /store URLs rather than throwing (mirrors the derived readDerived
// posture). Kept out of buildSitemapXml so that builder stays pure/testable.
function readStoreSlugs(): string[] {
  try {
    return buildApiData().dispensaries.map((d) => d.id)
  } catch {
    return []
  }
}

// Geo region + region-category paths for the sitemap, read fail-soft from the SAME
// readRegions() source the /compare/<region> pages use (so a listed URL always
// resolves). Each region also gets one path per category present. Stamped lastmod is
// the regional-floor artifact's generatedAt. Degrades to [] on any read failure.
function readRegionPaths(): { path: string; lastmod?: string }[] {
  try {
    const { regions, generatedAt } = readRegions()
    const paths: { path: string; lastmod?: string }[] = []
    for (const r of regions) {
      paths.push({ path: `/compare/${r.slug}`, lastmod: generatedAt })
      for (const c of r.categories) {
        paths.push({ path: `/compare/${c.slug}/${r.slug}`, lastmod: generatedAt })
      }
    }
    return paths
  } catch {
    return []
  }
}

// {id, name} per store for llms.txt (needs the display name for the link text, not
// just the slug). Same fail-soft posture as readStoreSlugs.
function readStores(): { id: string; name: string }[] {
  try {
    return buildApiData().dispensaries.map((d) => ({ id: d.id, name: d.name }))
  } catch {
    return []
  }
}

// Pure builder (exported for tests). llms.txt (https://llmstxt.org/) is the
// LLM-crawler counterpart to sitemap.xml: a Markdown file with a required H1,
// a blockquote summary, and H2 sections of links. Before this route existed the
// SPA fallback served index.html at /llms.txt, which Lighthouse's
// agentic-browsing audit failed (no H1, no links). Category links come from the
// SAME rollups source as the sitemap, so the two surfaces can never disagree.
export function buildLlmsTxt(
  categories: string[],
  stores: { id: string; name: string }[] = [],
): string {
  const categoryLines = categories
    .map((c) => ({ name: c, slug: categorySlug(c) }))
    .filter(({ slug }) => slug.length > 0)
    // De-dupe on slug, same rule as the sitemap: one URL, one line.
    .filter(({ slug }, i, arr) => arr.findIndex((x) => x.slug === slug) === i)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(
      ({ name, slug }) =>
        `- [${name} price comparison](${BASE_URL}/compare/${slug}): Cross-store ${name} price disparities observed at licensed Washington retailers`,
    )

  const comparisonSection =
    categoryLines.length > 0 ? `\n## Price comparisons\n\n${categoryLines.join('\n')}\n` : ''

  // Per-store profiles — the richest citable entity surface (each /store/<id> is a
  // real HTML page with LocalBusiness JSON-LD, current deals, and location). The
  // sitemap already lists these; llms.txt omitted them, hiding the store pages from
  // LLM agents that read this file as the site guide. `[` / `]` are stripped from
  // the link text so a store name can never break the Markdown link syntax.
  const storeLines = stores
    .filter((s) => typeof s?.id === 'string' && s.id.length > 0 && typeof s?.name === 'string')
    .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      ({ id, name }) =>
        `- [${name.replace(/[[\]]/g, '')}](${BASE_URL}/store/${id}): Current publicly available deals and location for ${name.replace(/[[\]]/g, '')}, a licensed Washington retailer`,
    )

  const storesSection = storeLines.length > 0 ? `\n## Stores\n\n${storeLines.join('\n')}\n` : ''

  return `# Gmas List

> ${ENTITY_DESCRIPTION}

## Pages

- [Deal feed](${BASE_URL}/): Live cannabis deal feed from licensed Washington retailers, compared by savings, distance, and gas cost
- [About Gmas List](${BASE_URL}/about): What Gmas List is, how it works, and frequently asked questions
- [Compare prices](${BASE_URL}/compare): Cross-store price-disparity comparisons derived from observed menu prices
- [Washington cannabis price index](${BASE_URL}/price-index): The biggest same-product cannabis price gaps across licensed Washington retailers, with answers to common price questions
${comparisonSection}${storesSection}
## Notes

- Deals are set by each retailer and may change without notice — verify in store.
- Gmas List serves Washington State only.
`
}

// ---- route handlers ----

// GET /robots.txt
export function robotsRoute(_req: Request, res: Response) {
  res.set('Cache-Control', 'public, max-age=3600')
  res.type('text/plain').send(ROBOTS_TXT)
}

// GET /sitemap.xml — static entity pages + one URL per live /compare category.
export function sitemapRoute(_req: Request, res: Response) {
  const rollups = readDerived<DisparityRollupsReport>(
    DISPARITY_ROLLUPS_PATH,
    EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
  )
  // Same source the /compare index links from (rollups.byCategory), so every
  // sitemap /compare/<slug> URL is a page compareCategoryRoute actually serves.
  const categories = (Array.isArray(rollups.data?.byCategory) ? rollups.data.byCategory : []).map(
    (c) => c.category,
  )
  res.set('Cache-Control', 'public, max-age=3600')
  res
    .type('application/xml')
    .send(buildSitemapXml(categories, rollups.generatedAt, readStoreSlugs(), readRegionPaths()))
}

// GET /llms.txt — Markdown site guide for LLM crawlers/agents. Same fail-soft
// posture as the sitemap: a missing derived artifact degrades to the static
// pages section, never a 500.
export function llmsTxtRoute(_req: Request, res: Response) {
  const rollups = readDerived<DisparityRollupsReport>(
    DISPARITY_ROLLUPS_PATH,
    EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
  )
  const categories = (Array.isArray(rollups.data?.byCategory) ? rollups.data.byCategory : []).map(
    (c) => c.category,
  )
  res.set('Cache-Control', 'public, max-age=3600')
  // text/plain (not text/markdown): maximally compatible, and what llms.txt
  // consumers expect from a .txt path.
  res.type('text/plain').send(buildLlmsTxt(categories, readStores()))
}
