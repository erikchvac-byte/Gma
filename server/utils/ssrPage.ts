import type { Disparity, DisparityStore } from '../types/index.js'
import type { StoreRollup } from './disparityRollups.js'
import { socialMetaTags } from './socialMeta.js'
import { GA_HEAD_SNIPPET } from '../routes/gaSnippet.js'
import { positioningDisclaimerHtml } from './positioningDisclaimer.js'

// Shared server-rendered-page primitives for the public SEO / AI-search surfaces
// (/compare, /price-index). Extracted from compareRoute.ts (behavior-preserving —
// the /compare route re-imports these, and compareRoute.test.ts proves no change)
// so the flagship /price-index page (price-index-phase-1a) can reuse the exact same
// escaping, JSON-LD, page shell, freshness and fail-soft helpers rather than forking
// a second, drift-prone copy.

export const BASE_URL = 'https://gmaslist.com'
export const ORG_ID = `${BASE_URL}/#organization`

// ---- small pure helpers (mirror aboutRoute.ts) ----

// Text-node escaping only (& < >).
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Attribute-context escaping: also neutralize the double-quote that would break
// out of content="…". Used for any data-derived text placed into an attribute.
export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

// JSON-LD lives in a <script> element; < is escaped so page copy can never
// terminate the script element. < is valid JSON and parses back to "<".
export function jsonLdScript(obj: unknown): string {
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

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

// A single JSON-LD object (a schema.org node). `page()` accepts one or a list.
export type JsonLd = Record<string, unknown>

// Assemble a full HTML document with the shared dark styling + a JSON-LD block.
// `jsonLd` accepts either one object (a single <script>) or an array (one <script>
// per entry) so a page can emit both a Dataset and a FAQPage without a bespoke shell.
// Typed as JsonLd|JsonLd[] (not `unknown`) and falsy entries are dropped, so a builder
// that returns undefined on bad input can never emit the literal text "undefined"
// inside a <script type="application/ld+json"> (an invalid block crawlers reject).
export function page(opts: {
  title: string
  description: string
  canonical: string
  jsonLd: JsonLd | JsonLd[]
  bodyHtml: string
}): string {
  const jsonLdBlocks = (Array.isArray(opts.jsonLd) ? opts.jsonLd : [opts.jsonLd])
    .filter((ld): ld is JsonLd => !!ld)
    .map((ld) => `<script type="application/ld+json">${jsonLdScript(ld)}</script>`)
    .join('\n    ')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0E1417" />
    ${GA_HEAD_SNIPPET}
    <title>${escapeHtml(opts.title)}</title>
    <meta name="description" content="${escapeAttr(opts.description)}" />
    <link rel="canonical" href="${opts.canonical}" />
    ${socialMetaTags({ title: opts.title, description: opts.description, url: opts.canonical })}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    ${jsonLdBlocks}
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
      .disclaimer { color: #9fb0b5; font-size: 0.9rem; margin-top: 2.5rem; border-top: 1px solid #223; padding-top: 1.25rem; }
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">&larr; Back to the deals</a></p>
${opts.bodyHtml}
      ${positioningDisclaimerHtml('disclaimer')}
    </main>
  </body>
</html>
`
}

// ---- JSON-LD builders ----

// The fail-soft EMPTY_* envelopes carry a fixed epoch `generatedAt` (see
// valueRoute EMPTY_GENERATED_AT) meaning "never derived" — do NOT publish it as a
// real Dataset.dateModified, or crawlers ingest a false 1970 freshness date.
export const EPOCH_GENERATED_AT = new Date(0).toISOString()

export function datasetJsonLd(opts: {
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
export function isRenderableDisparity(d: Disparity): boolean {
  return (
    !!d &&
    typeof d.displayName === 'string' &&
    Number.isFinite(d.weightGrams) &&
    Number.isFinite(d.spread) &&
    // spreadPct is rendered by /price-index (`.toFixed(1)`); guard it too so a
    // shapeless row with a missing/NaN spreadPct is skipped, not a 500. /compare
    // doesn't render spreadPct, so this only tightens (never loosens) its filter.
    Number.isFinite(d.spreadPct) &&
    Number.isFinite(d.lowPrice) &&
    Number.isFinite(d.highPrice) &&
    Array.isArray(d.storesCarrying) &&
    d.storesCarrying.length > 0 &&
    d.storesCarrying.every(
      (s) => !!s && typeof s.dispensaryId === 'string' && Number.isFinite(s.price),
    )
  )
}

// The honest endpoints of a cross-store disparity: the cheapest and priciest store
// objects (price pulled from the SAME object we name, so the number and the store can
// never disagree). Returns null for a zero-spread tie (every store at one price) — a
// caller must then state "one price across N stores", never name a store as both ends.
export function disparityEndpoints(
  d: Disparity,
): { cheapest: DisparityStore; priciest: DisparityStore } | null {
  if (d.highPrice === d.lowPrice) return null
  const cheapest = d.storesCarrying.reduce((lo, s) => (s.price < lo.price ? s : lo))
  const priciest = d.storesCarrying.reduce((hi, s) => (s.price > hi.price ? s : hi))
  return { cheapest, priciest }
}

// "Stores most often cheapest" <li> list (top `limit` by timesCheapest), shared by the
// /compare index and /price-index so the wording + cap stay single-sourced. `byStore`
// is assumed already shape-filtered; copied before sort so the caller's array is intact.
export function renderTopCheapest(byStore: StoreRollup[], limit = 5): string {
  return byStore
    .slice()
    .filter((s) => s.timesCheapest > 0)
    .sort((a, b) => b.timesCheapest - a.timesCheapest)
    .slice(0, limit)
    .map(
      (s) =>
        `        <li>${escapeHtml(storeName(s.dispensaryId))} — cheapest on ${s.timesCheapest} of its ${s.disparityCount} compared products</li>`,
    )
    .join('\n')
}

// Freshness sentence shared by every citable SSR surface (ADR-111 honesty language,
// single-sourced). `stale` is the caller's own verdict (region floors all dark, or a
// whole-file age check). Epoch/invalid generatedAt → no date is ever printed.
export function freshnessSentence(generatedAt: string, stale: boolean): string {
  const asOf = asOfPhrase(generatedAt)
  if (stale) {
    return asOf
      ? ` Prices last observed as of ${escapeHtml(asOf)}; freshness currently unverified.`
      : ' Freshness of these prices is currently unverified.'
  }
  return asOf ? ` Prices observed as of ${escapeHtml(asOf)}.` : ''
}

// "as of Month D, YYYY" in Pacific (the app's TZ). Empty string on the epoch
// sentinel (never-derived) so no page ever prints a false 1970 date.
export function asOfPhrase(generatedAt: string): string {
  if (!generatedAt || generatedAt === EPOCH_GENERATED_AT) return ''
  const d = new Date(generatedAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })
}
