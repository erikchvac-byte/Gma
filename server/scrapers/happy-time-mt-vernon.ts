import * as cheerio from 'cheerio'
import type { Deal } from '../../client/src/types/index.js'
import type { DealScrapeOutcome } from '../types/index.js'
import { postScrapeHtml, type ScrapeRequest } from '../utils/scraperClient.js'
import { scrapeDutchieSpecials } from './_dutchie.js'

// PROTOTYPE (Option-1, 2026-07-17). Happy Time - Mount Vernon runs NO Dutchie
// GetSpecialMenuCards specials — the live embed returns a confirmed-empty
// `menuCards: []` on both the recreational AND medical menus. Its promotions live
// ONLY as hand-authored marketing on the store's own site, so the shared Dutchie
// deals path (dutchie-stores.ts) can never surface them. This store-specific
// scraper reads those cards from the menu page and writes them into the SAME
// dispensary record (id `happy-time-mt-vernon`), so the store keeps its single
// card — only the deal SOURCE differs. The Dutchie PRODUCT-pricing scrape for this
// id is untouched (that menu is real and useful); this overrides the DEALS scrape
// alone, wired as a post-`...dutchieScrapers` override in index.ts.
//
// FETCH: happytimeweed.com sits behind a Vercel "Security Checkpoint" — a JS
// challenge that returns HTTP 429 to any non-JS client. axios/curl fail even from a
// residential IP (verified 2026-07-17), so the page must be read through the
// Playwright service (ADR-017), which runs a real browser, clears the challenge,
// and returns the settled DOM. The deals are SSR'd (9 `.deal-card` blocks) and the
// age-gate is a client overlay, so the returned HTML carries them regardless. A
// blocked/failed/changed fetch degrades to [] → stale (never throws).
const URL = 'https://happytimeweed.com/mount-vernon-menu'

// Browser-tier request that yields raw_html. EMPTY intercept_pattern means the
// service captures no API payloads, so `_run_browser` returns page.content() as
// raw_html (the post-challenge, hydrated DOM). EMPTY wait_for_pattern selects the
// load + scroll + settle path, giving the Vercel challenge time to redirect to the
// real page before the DOM is serialized.
function menuRequest(): ScrapeRequest {
  return {
    url: URL,
    intercept_pattern: '',
    wait_for_pattern: '',
    tier: 'browser',
    headless: true,
    timeout: 45000,
  }
}

// First whole-number percent in the text ("30% Off All Flower" → 30), else null.
function parseDiscount(text: string): number | null {
  const m = text.match(/(\d+)\s*%/)
  return m ? parseInt(m[1], 10) : null
}

// Parse the store's `.deal-card` blocks into Deal[]. Each card is
//   <div class="deal-card">
//     <span class="deal-cat">July Deals</span>
//     <h3 class="deal-title">30% Off All Flower</h3>
//     <p class="deal-desc">July 1–31 …: 30% off all flower — …</p>
//   </div>
// These are month-long, category-wide flat promos with no time window, so each
// maps to a `daily` / `everyday` deal. The visible title IS the offer ("30% Off
// All Flower"), so it becomes `description`; discountPct is parsed from it. The
// title's percent is an unconditional category discount the store itself
// advertises (not the ambiguous per-item Dutchie signal fix6 flagged), so badging
// it is honest — the remedy-tulalip precedent. Cards with no usable title are
// skipped; never throws. The "50% OFF … STOREWIDE" banner is deliberately NOT
// scraped here: it is fragile ad markup and "selected products" would make a flat
// 50% badge overstate the deal (an Ask-First call — see the response notes).
export function parse(html: string): Deal[] {
  const $ = cheerio.load(html)
  const deals: Deal[] = []

  $('.deal-card').each((_, el) => {
    const title = $(el).find('.deal-title').text().replace(/\s+/g, ' ').trim()
    if (!title) return // skip malformed / titleless cards

    deals.push({
      type: 'daily',
      description: title,
      discountPct: parseDiscount(title),
      startTime: null,
      endTime: null,
      daysValid: ['everyday'],
    })
  })

  return deals
}

// Scrape the store's own site, with the Dutchie specials feed as a SAFETY FLOOR.
//
// The website scrape only ever IMPROVES on today's behavior — it can add the 9
// category deals — but must never make the store worse. The risk: the Playwright
// service is proven to beat the Vercel challenge from a residential IP, but the
// production ingest runs on a GitHub Actions datacenter IP where that is unverified.
// If the website fetch fails there (challenge unbeaten / service down / non-2xx),
// a bare `{ deals: [], confirmedEmpty: false }` would flip the store to STALE —
// re-opening the exact mt-vernon-goes-stale problem ADR-083 closed, and risking an
// alert-gate red. So on any non-productive website result we FALL BACK to the
// store's Dutchie GetSpecialMenuCards scrape, which returns the honest confirmed-
// empty outcome (ok/empty) that is the store's status today. Net: website works →
// deals show; website fails or is genuinely dealless → today's behavior, no
// regression. HTML scraping has no positive no-deals signal, so a website empty is
// never itself treated as confirmed — only the Dutchie floor can confirm emptiness.
export default async function scrape(): Promise<DealScrapeOutcome> {
  const { html } = await postScrapeHtml(menuRequest())
  if (html !== null) {
    const deals = parse(html)
    if (deals.length > 0) return { deals, confirmedEmpty: false }
  }
  // Website unreachable or carried no deal cards → defer to the Dutchie floor
  // (id === embed cName), preserving the honest confirmed-empty ok/empty status.
  return scrapeDutchieSpecials('happy-time-mt-vernon')
}
