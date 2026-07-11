import type { Request, Response } from 'express'
import type { DisparityRollupsReport } from '../utils/disparityRollups.js'
import { readDerived, EMPTY_DISPARITY_ROLLUPS_ENVELOPE } from './valueRoute.js'
import { categorySlug } from './compareRoute.js'
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
// settled on "allow all crawlers" (citation-search AND training), so no per-agent
// blocks here.
export const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${BASE_URL}/sitemap.xml
`

// Stable, crawlable pages that always exist regardless of derived-data state.
// Per-deal / per-store URLs are deliberately absent (deals churn hourly; per-store
// routes are Phase 1a, not built yet).
const STATIC_PATHS = ['/', '/about', '/compare']

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
  const lastmodLine = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ''
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodLine}\n  </url>`
}

// Pure builder (exported for tests). `categories` are the raw category names from
// the rollups; each becomes a /compare/<slug> URL. `generatedAt` is the derived
// artifact's own timestamp — used as lastmod ONLY for the data-backed /compare
// URLs, since that is the honest "last changed" signal for them. Static entity
// pages (/, /about) get no lastmod rather than a fabricated one.
export function buildSitemapXml(categories: string[], generatedAt: string): string {
  const staticEntries = STATIC_PATHS.map((p) => {
    // /compare is data-backed → stamp it with the artifact's generatedAt too.
    const lastmod = p === '/compare' ? generatedAt : undefined
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...categoryEntries].join('\n')}
</urlset>
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
  res.type('application/xml').send(buildSitemapXml(categories, rollups.generatedAt))
}
