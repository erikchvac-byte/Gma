import type { Request, Response } from 'express'
import type { Dispensary } from '../../client/src/types/index.js'
import type { PriceVsOwnMedianRow } from '../utils/priceVsOwnMedian.js'
import { buildApiData } from '../utils/buildApiData.js'
import { readPriceVsOwnMedian } from './valueRoute.js'
import { AGE_NOTICE } from '../utils/renderShellBody.js'
import { GA_HEAD_SNIPPET } from './gaSnippet.js'
import { socialMetaTags } from '../utils/socialMeta.js'

// Per-store SEO / AI-search pages (SEO plan Phase 1a / CAP-3 + CAP-4). One stable,
// crawlable URL per licensed WA retailer — /store/<id> — server-rendered from the
// SAME buildApiData() payload the homepage/feed use, so non-JS crawlers (GPTBot,
// Claude-SearchBot, PerplexityBot) and Google get a focused page for queries like
// "Remedy Tulalip deals" or "dispensary deals Tulalip WA", plus LocalBusiness
// JSON-LD (name/address/geo) that powers local entity understanding. Mirrors the
// /about (ADR-078) and /compare (ADR-079) SSR pattern; registered before the SPA
// fallback so crawlers get real HTML, not the empty React shell.
//
// HONESTY / COMPLIANCE:
// - LocalBusiness only — NEVER Product/Offer/AggregateOffer schema. Those imply a
//   seller/advertiser (WAC 314-55-155); we describe the store as a place that
//   exists, not a menu of priced offers. (Erik, 2026-07-24.)
// - Distance is user-relative (no fixed number for a crawler with no location), so
//   it is deliberately OMITTED from this page. (Erik, 2026-07-24.)
// - Deals shown are the CURRENT active set (buildApiData already filtered them).
//   No fabricated validity dates — "active today" framing only; deals churn hourly.
// - geo is emitted only when lat/lng are real finite numbers (Honest Math).
// - "Real price drops" (price-vs-own-median, FR13/Gate 2) are the ONE honest discount the
//   engine computes — a SKU priced below its OWN rolling median, NOT a banner/promo % (which
//   carries no per-item signal). Rendered as plain prose only, never Offer/Product schema.
//   Same gates as the in-app card (ValueDropStrip / DealFeed): a failed/stale store carries
//   NO drops (its current price — the drop's numerator — is itself untrustworthy), and a
//   sub-1%-display mover is suppressed. Fail-soft: a missing artifact yields no drops section.

const BASE_URL = 'https://gmaslist.com'

// ---- small pure helpers (mirror aboutRoute.ts / compareRoute.ts) ----

// Text-node escaping only (& < >). Store/deal text is scraped, hostile-by-premise.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Attribute-context escaping: also neutralize the double-quote that breaks out of
// content="…" / href="…".
function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

// JSON-LD lives inside a <script> element; escape < so page/store text can never
// terminate the script element. < is valid JSON and parses back to "<".
function jsonLdScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function isHttpUrl(u: unknown): u is string {
  return typeof u === 'string' && /^https?:\/\//i.test(u)
}

// ---- price-drop helpers (mirror client/src/components/ValueDropStrip.tsx verbatim) ----

// At most this many drops on one page — deepest discounts first. A store can carry dozens of
// movers after full-menu capture; the page shows the biggest honest drops, not an exhaustive list.
const MAX_STORE_DROPS = 12

// whole-number percent magnitude of the (negative) drop, e.g. -0.19 → 19
function dropPercent(pctVsMedian: number): number {
  return Math.round(Math.abs(pctVsMedian) * 100)
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// The one render filter (mirrors ValueDropStrip.renderableDrops): only honest-discount rows
// (`pctVsMedian < 0`) whose displayed whole-number percent is at least 1% survive. A sub-0.5%
// mover would render "0% below its usual" — a claimed drop with no visible magnitude — so it is
// suppressed (Honest Math).
export function renderableStoreDrops(rows: PriceVsOwnMedianRow[]): PriceVsOwnMedianRow[] {
  return rows.filter((r) => r.pctVsMedian < 0 && dropPercent(r.pctVsMedian) !== 0)
}

// This store's honest price drops, read fail-soft and gated exactly like the in-app card:
// a failed/stale store carries NO drops (mirrors DealFeed's status gate), otherwise the served
// price-vs-own-median rows are filtered to this store, kept only if renderable, sorted
// deepest-discount-first, and capped. A missing/malformed artifact → [] (readPriceVsOwnMedian
// already fail-softs), so this never throws and the section simply doesn't render.
export function storeDrops(store: Dispensary): PriceVsOwnMedianRow[] {
  if (store.status === 'failed' || store.status === 'stale') return []
  const report = readPriceVsOwnMedian()
  const rows = Array.isArray(report.data?.rows) ? report.data.rows : []
  return renderableStoreDrops(rows.filter((r) => r.dispensaryId === store.id))
    .sort((a, b) => a.pctVsMedian - b.pctVsMedian)
    .slice(0, MAX_STORE_DROPS)
}

// Parse "9226 34th Avenue NE, Tulalip, WA 98271" into a schema.org PostalAddress.
// Our committed addresses follow "STREET, CITY, ST ZIP" (geocodeStores.ts), so the
// strict match handles them; anything else fails soft to the whole string as
// streetAddress. addressRegion falls back to WA — the WA-only invariant guarantees
// it — and country is always US.
function buildPostalAddress(address: string): Record<string, string> {
  const m = address.match(/^\s*(.+?),\s*(.+?),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/)
  if (m) {
    return {
      '@type': 'PostalAddress',
      streetAddress: m[1].trim(),
      addressLocality: m[2].trim(),
      addressRegion: m[3].toUpperCase(),
      postalCode: m[4],
      addressCountry: 'US',
    }
  }
  return {
    '@type': 'PostalAddress',
    streetAddress: address.trim(),
    addressRegion: 'WA',
    addressCountry: 'US',
  }
}

// LocalBusiness JSON-LD for one store. `url` is THIS page (the canonical page
// describing the store); the store's own website goes in `sameAs` to link the two
// as the same real-world entity.
export function buildStoreJsonLd(store: Dispensary, canonicalUrl: string): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${canonicalUrl}#store`,
    name: store.name,
    url: canonicalUrl,
    areaServed: { '@type': 'State', name: 'Washington' },
  }
  if (typeof store.address === 'string' && store.address.length > 0) {
    jsonLd.address = buildPostalAddress(store.address)
  }
  if (isFiniteNum(store.lat) && isFiniteNum(store.lng)) {
    jsonLd.geo = { '@type': 'GeoCoordinates', latitude: store.lat, longitude: store.lng }
  }
  if (isHttpUrl(store.url)) {
    jsonLd.sameAs = [store.url]
  }
  return jsonLd
}

const PAGE_STYLE = `body {
        margin: 0;
        background: #0E1417;
        color: #e6edf0;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        line-height: 1.6;
      }
      main { max-width: 680px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
      h1 { font-size: 1.6rem; line-height: 1.3; }
      h2 { font-size: 1.2rem; margin-top: 2.25rem; }
      a { color: #35c2a0; }
      .addr { color: #b6c2c6; }
      .notice { margin-top: 2.5rem; font-size: 0.85rem; color: #8a9aa0; }`

// Pure page builder (exported for tests). `drops` are this store's honest price drops (already
// store-filtered + status-gated by the caller); renderableStoreDrops is re-applied here so a
// direct caller (test) still gets the display-honesty gate. Defaults to none so the deals-only
// page is unchanged when the price-vs-own-median fact is empty.
export function renderStoreHtml(store: Dispensary, drops: PriceVsOwnMedianRow[] = []): string {
  const canonicalUrl = `${BASE_URL}/store/${store.id}`
  const title = `${store.name} — Cannabis Deals & Location | Gmas List`
  const description =
    `Current publicly available cannabis deals and the location of ${store.name}, a licensed ` +
    `Washington retailer. See what is on special today and decide whether it is worth the drive. ` +
    `Gmas List is an independent information service, not a cannabis seller.`

  const addressHtml =
    typeof store.address === 'string' && store.address.length > 0
      ? `<p class="addr">${escapeHtml(store.address)}</p>`
      : ''

  const siteLinkHtml = isHttpUrl(store.url)
    ? `<p><a href="${escapeAttr(store.url)}" rel="nofollow noopener" target="_blank">Visit the store's website</a></p>`
    : ''

  // buildApiData already filtered deals to the active set; render them plainly.
  const dealsHtml =
    store.deals.length > 0
      ? `<ul>${store.deals
          .map((deal) => `<li>${escapeHtml(String(deal.description ?? ''))}</li>`)
          .join('')}</ul>`
      : `<p>No active deals right now. Deals are set by each retailer and change throughout the day — check back later or view the store's website.</p>`

  // "Real price drops" — the one honest, per-item discount (below this SKU's own rolling median).
  // Plain prose only; NEVER Offer/Product schema. Rendered only when this store has renderable drops.
  const renderableDrops = renderableStoreDrops(drops)
  const dropsHtml =
    renderableDrops.length > 0
      ? `<h2>Real price drops</h2>
      <p>Products currently priced below their own recent typical price at this store, based on observed price history:</p>
      <ul>${renderableDrops
        .map((drop) => {
          const optionPart = drop.option ? ` (${escapeHtml(drop.option)})` : ''
          return `<li>${escapeHtml(drop.name)}${optionPart} — ${dropPercent(drop.pctVsMedian)}% below its usual: ${money(drop.currentPrice)} vs ${money(drop.medianPrice)} usual</li>`
        })
        .join('')}</ul>`
      : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0E1417" />
    ${GA_HEAD_SNIPPET}
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
    ${socialMetaTags({ title, description, url: canonicalUrl })}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script type="application/ld+json">${jsonLdScript(buildStoreJsonLd(store, canonicalUrl))}</script>
    <style>
      ${PAGE_STYLE}
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">&larr; Back to the deals</a></p>

      <h1>${escapeHtml(store.name)}</h1>
      ${addressHtml}
      ${siteLinkHtml}

      <h2>Deals active today</h2>
      ${dealsHtml}

      ${dropsHtml}

      <p class="notice">${escapeHtml(AGE_NOTICE)}</p>
      <p class="notice">
        Gmas List is an independent information service — not a cannabis seller. It organizes
        publicly available deals from licensed Washington retailers so shoppers can decide whether a
        deal is <a href="/about">worth the drive</a>. See <a href="/compare">cross-store price
        comparisons</a>.
      </p>
    </main>
  </body>
</html>
`
}

function notFoundHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Store not found | Gmas List</title>
  </head>
  <body>
    <main style="max-width:680px;margin:0 auto;padding:2.5rem 1.25rem;font-family:system-ui,sans-serif">
      <h1>Store not found</h1>
      <p>We do not have a page for that store. <a href="/">Back to the deals</a>.</p>
    </main>
  </body>
</html>
`
}

// GET /store/:slug — per-store page + LocalBusiness JSON-LD.
export function storeRoute(req: Request, res: Response) {
  let data
  try {
    data = buildApiData()
  } catch (err) {
    // data.json unreadable/malformed is a transient server fault, not a missing
    // store — 500 (mirrors dataRoute), never a misleading 404.
    console.error('[storeRoute]', err)
    res
      .status(500)
      .type('html')
      .send('<!doctype html><meta charset="utf-8"><title>Gmas List</title><p>Temporarily unavailable.</p>')
    return
  }

  const slug = String(req.params.slug ?? '').toLowerCase()
  const store = data.dispensaries.find((d) => d.id.toLowerCase() === slug)

  if (!store) {
    // Short cache: a store could be added in a later deploy.
    res.status(404).set('Cache-Control', 'public, max-age=60').type('html').send(notFoundHtml())
    return
  }

  // Deals churn hourly, so keep this short-lived — long enough to absorb crawl
  // bursts, short enough that the "active today" list never goes badly stale.
  res.set('Cache-Control', 'public, max-age=300')
  res.type('html').send(renderStoreHtml(store, storeDrops(store)))
}
