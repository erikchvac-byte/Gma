import * as cheerio from 'cheerio'
import type { Deal } from '../../client/src/types/index.js'
import type { DealScrapeOutcome } from '../types/index.js'
import { postScrapeHtml, type ScrapeRequest } from '../utils/scraperClient.js'
import { scrapeDutchieSpecials } from './_dutchie.js'

// PROTOTYPE (2026-07-17, sibling of happy-time-mt-vernon). Star Buds - Bellingham
// runs NO Dutchie GetSpecialMenuCards specials — its online menu is the SAME embed
// our shared Dutchie deals path already scrapes (`dutchie.com/embedded-menu/
// starbuds-bellingham/`), which returns a confirmed-empty `menuCards: []`. That is
// exactly WHY the store rendered no card (zero deals → dropped by DealFeed). The
// store's `/specials/` page is only a store-selector that routes back to that empty
// Dutchie menu, so it carries no deal HTML. The ONLY off-Dutchie, server-rendered
// offer anywhere on the site is a single standing line on the Bellingham store page:
// "Shop Star Buds online for 10% off". This scraper reads that one line into the
// SAME dispensary record (id `starbuds-bellingham`), rescuing the store from total
// invisibility → one card, one honest standing deal. Wired as a post-
// `...dutchieScrapers` override in index.ts; the Dutchie PRODUCT-pricing scrape for
// this id is untouched.
//
// FETCH: the store page is standard WordPress/Elementor HTML (no Vercel challenge
// like happytimeweed.com), but we still read it through the Playwright service for
// one reason — the discount line is server-rendered but the page also mounts an
// age-gate overlay; the browser-tier raw_html path returns the settled DOM exactly
// as the ingest already does for happy-time. Any blocked/failed/changed fetch
// degrades to [] → the Dutchie floor (never throws, never regresses).
const URL = 'https://starbud.com/star-buds-recreational-marijuana-dispensary-bellingham/'

// Browser-tier request that yields raw_html (see happy-time-mt-vernon.ts for the
// EMPTY intercept/wait_for rationale — no API capture, so `_run_browser` returns
// page.content(); the load + scroll + settle path serializes the hydrated DOM).
function pageRequest(): ScrapeRequest {
  return {
    url: URL,
    intercept_pattern: '',
    wait_for_pattern: '',
    tier: 'browser',
    headless: true,
    timeout: 45000,
  }
}

// Matches an online-ordering discount within a single element's text, tolerant of
// word order: "...online for 10% off" OR "10% off ... online orders". The {0,40}
// proximity window keeps "online" and the percent in the same clause so unrelated
// copy elsewhere on the page can't be stitched into a false positive.
const ONLINE_DISCOUNT =
  /online[\s\S]{0,40}?(\d{1,2})\s*%\s*off|(\d{1,2})\s*%\s*off[\s\S]{0,40}?online/i

// Parse the store's single online-order discount into Deal[]. We scope the parser
// precisely to the online-ordering offer (not any "N% off" text) because that is the
// one concrete, honest promo the site advertises — a whole-order discount, not a
// per-item Dutchie signal (fix6). The description is normalized to "N% Off Online
// Orders" so the existing text-derived scope system (dealIcons ORDER_SCOPE) badges
// it with the honest `online-order` glyph; discountPct is the parsed number. Distinct
// percents are de-duplicated (the `<a>` and its wrapping `<p>` both carry the text),
// so a single offer yields a single deal. No match → [] (→ Dutchie floor). Never throws.
export function parse(html: string): Deal[] {
  const $ = cheerio.load(html)
  const pcts = new Set<number>()

  $('a, p, li, span, h1, h2, h3, h4').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    if (!/online/i.test(text)) return
    const m = ONLINE_DISCOUNT.exec(text)
    if (!m) return
    const pct = parseInt(m[1] ?? m[2], 10)
    if (Number.isFinite(pct) && pct > 0) pcts.add(pct)
  })

  return [...pcts].map((pct) => ({
    type: 'daily' as const,
    description: `${pct}% Off Online Orders`,
    discountPct: pct,
    startTime: null,
    endTime: null,
    daysValid: ['everyday'],
  }))
}

// Scrape the store's own site, with the Dutchie specials feed as a SAFETY FLOOR —
// identical contract to happy-time-mt-vernon.ts. The website scrape can only IMPROVE
// on today's behavior (add the one online-order deal); on any non-productive result
// (service down / page changed / no discount line) we fall back to the store's Dutchie
// GetSpecialMenuCards scrape, which returns the honest confirmed-empty ok/empty that is
// the store's status today. Net: website works → one card shows; website fails or the
// line is gone → today's invisible-but-honest behavior, no stale regression. HTML
// scraping has no positive no-deals signal, so a website empty is never itself treated
// as confirmed — only the Dutchie floor can confirm emptiness.
export default async function scrape(): Promise<DealScrapeOutcome> {
  const { html } = await postScrapeHtml(pageRequest())
  if (html !== null) {
    const deals = parse(html)
    if (deals.length > 0) return { deals, confirmedEmpty: false }
  }
  return scrapeDutchieSpecials('starbuds-bellingham')
}
