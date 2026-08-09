import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import {
  priceIndexRoute,
  renderPriceIndexHtml,
  PRICE_INDEX_NAME,
  PRICE_INDEX_DESCRIPTION,
  PRICE_INDEX_FAQ,
} from './priceIndexRoute.js'
import {
  EMPTY_DISPARITIES_ENVELOPE,
  EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
} from './valueRoute.js'
import type { DerivedEnvelope } from '../utils/derivedEnvelope.js'
import type { MatchReport } from '../utils/crossStoreValue.js'
import type { DisparityRollupsReport } from '../utils/disparityRollups.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const QUESTIONS_PATH = path.join(__dirname, '../scripts/citation-questions.json')

const app = express()
app.get('/price-index', priceIndexRoute)

// Visible text as a crawler's extractor sees it: scripts/styles removed, tags
// stripped, whitespace collapsed.
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

function extractJsonLdBlocks(html: string): Array<Record<string, unknown>> {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  return blocks.map(([, json]) => JSON.parse(json))
}

// A small deterministic disparities envelope: two real gaps (different spreads) and
// one zero-spread tie. Lets the tests assert sort order + number/store pairing
// without depending on whatever the committed dataset happens to be today.
function fixtureDisparities(generatedAt = '2026-08-08T11:00:10.178Z'): DerivedEnvelope<MatchReport> {
  return {
    data: {
      disparities: [
        {
          matchKey: 'small', displayName: 'Small Gap', category: 'Flower', weightGrams: 3.5,
          lowPrice: 10, highPrice: 20, spread: 10, spreadPct: 1,
          storesCarrying: [
            { dispensaryId: 'cheap-store', price: 10, quantityAvailable: null },
            { dispensaryId: 'pricey-store', price: 20, quantityAvailable: null },
          ],
        },
        {
          matchKey: 'big', displayName: 'Donny Burger', category: 'Flower', weightGrams: 7,
          lowPrice: 14.4, highPrice: 84, spread: 69.6, spreadPct: 4.83,
          storesCarrying: [
            { dispensaryId: 'two-twenty-north', price: 14.4, quantityAvailable: 4 },
            { dispensaryId: 'two-twenty-pacific', price: 84, quantityAvailable: 1 },
          ],
        },
        {
          matchKey: 'tie', displayName: 'Tie Product', category: 'Flower', weightGrams: 1,
          lowPrice: 35, highPrice: 35, spread: 0, spreadPct: 0,
          storesCarrying: [
            { dispensaryId: 'store-a', price: 35, quantityAvailable: null },
            { dispensaryId: 'store-b', price: 35, quantityAvailable: null },
          ],
        },
      ],
      totalRecords: 500, unmatchedCount: 0, excludedFlagCount: 0,
      nonComparableCategoryCount: 0, placedRecords: 3, staleRecords: 0,
    },
    excluded: [], coverage: {}, generatedAt,
  }
}

function fixtureRollups(): DerivedEnvelope<DisparityRollupsReport> {
  return {
    data: {
      byCategory: [
        { category: 'Flower', disparityCount: 383, avgSpreadPct: 0.14, distinctStoresInvolved: 13 },
        { category: 'Pre-Rolls', disparityCount: 90, avgSpreadPct: 0.24, distinctStoresInvolved: 8 },
      ],
      byStore: [
        { dispensaryId: 'cheap-store', lat: null, lng: null, disparityCount: 20, timesCheapest: 12, timesPriciest: 1 },
        { dispensaryId: 'pricey-store', lat: null, lng: null, disparityCount: 20, timesCheapest: 2, timesPriciest: 15 },
      ],
      totalDisparities: 1331, missingGeoCount: 0,
    },
    excluded: [], coverage: { storeCount: 16 }, generatedAt: '2026-08-08T11:00:12.756Z',
  }
}

describe('GET /price-index', () => {
  it('serves plain HTML with no React shell and an hour cache', async () => {
    const res = await request(app).get('/price-index')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
    expect(res.text).not.toContain('<div id="root">')
  })

  it('loads the GA4 tag and emits exactly two JSON-LD blocks (Dataset + FAQPage)', async () => {
    const res = await request(app).get('/price-index')
    expect(res.text).toContain('googletagmanager.com/gtag/js?id=G-Z3EH6D5C89')
    const blocks = extractJsonLdBlocks(res.text)
    expect(blocks).toHaveLength(2)
    expect(blocks.some((b) => b['@type'] === 'Dataset')).toBe(true)
    expect(blocks.some((b) => b['@type'] === 'FAQPage')).toBe(true)
  })

  it('includes canonical, title, a Dataset whose name/description are on-page verbatim, WA-only', async () => {
    const res = await request(app).get('/price-index')
    expect(res.text).toContain('<link rel="canonical" href="https://gmaslist.com/price-index"')
    expect(res.text).toContain('<title>')
    expect(res.text).toContain('<meta property="og:url" content="https://gmaslist.com/price-index" />')

    const dataset = extractJsonLdBlocks(res.text).find((b) => b['@type'] === 'Dataset')!
    expect(dataset.name).toBe(PRICE_INDEX_NAME)
    const text = visibleText(res.text)
    expect(text).toContain(PRICE_INDEX_NAME)
    expect(text).toContain(PRICE_INDEX_DESCRIPTION)
    expect((dataset.spatialCoverage as { name: string }).name).toBe('Washington')
  })
})

describe('hook section (biggest same-product gaps)', () => {
  it('sorts rows by spread desc and pulls each price from the store it names', () => {
    const html = renderPriceIndexHtml(fixtureDisparities(), fixtureRollups())
    const text = visibleText(html)
    // Biggest gap first: Donny Burger appears before Small Gap.
    expect(text.indexOf('Donny Burger')).toBeGreaterThan(-1)
    expect(text.indexOf('Donny Burger')).toBeLessThan(text.indexOf('Small Gap'))
    // Number and store never disagree: $14.40 at the north store, $84.00 at pacific.
    expect(text).toContain('$14.40 at Two Twenty North to $84.00 at Two Twenty Pacific')
    // Both the $ spread and the × multiple render (readiness #3).
    expect(text).toContain('a $69.60 gap, 4.8× the lowest price, across 2 stores')
  })

  it('excludes zero-spread ties from the hook (no gap to show)', () => {
    const html = renderPriceIndexHtml(fixtureDisparities(), fixtureRollups())
    expect(visibleText(html)).not.toContain('Tie Product')
  })

  it('leads the prose with the biggest MULTIPLE anchored by the real price range', () => {
    const text = visibleText(renderPriceIndexHtml(fixtureDisparities(), fixtureRollups()))
    expect(text).toContain('The biggest difference Gmas List sees is 4.8× the lowest price')
    expect(text).toContain('Donny Burger')
    expect(text).toContain('ranges from $14.40 to $84.00')
  })

  it('leads with the biggest MULTIPLE even when a different row has the biggest $ gap', () => {
    // rowA: huge $ gap, small multiple; rowB: small $ gap, huge multiple. The TABLE
    // ranks by $ (rowA first) but the LEDE must feature rowB's dramatic multiple.
    const env = fixtureDisparities()
    env.data.disparities = [
      {
        matchKey: 'bigdollar', displayName: 'Big Dollar', category: 'Flower', weightGrams: 3.5,
        lowPrice: 100, highPrice: 200, spread: 100, spreadPct: 1.0,
        storesCarrying: [
          { dispensaryId: 'lo-a', price: 100, quantityAvailable: null },
          { dispensaryId: 'hi-a', price: 200, quantityAvailable: null },
        ],
      },
      {
        matchKey: 'bigmult', displayName: 'Big Multiple', category: 'Flower', weightGrams: 1,
        lowPrice: 5, highPrice: 50, spread: 45, spreadPct: 9.0,
        storesCarrying: [
          { dispensaryId: 'lo-b', price: 5, quantityAvailable: null },
          { dispensaryId: 'hi-b', price: 50, quantityAvailable: null },
        ],
      },
    ]
    const html = renderPriceIndexHtml(env, fixtureRollups())
    const text = visibleText(html)
    // Lede features the multiple leader (rowB).
    expect(text).toContain('The biggest difference Gmas List sees is 9.0× the lowest price')
    expect(text).toContain('Big Multiple')
    // Table still ranks by $ gap: the Big Dollar row appears before the Big Multiple row.
    expect(text.indexOf('Big Dollar (3.5g):')).toBeLessThan(text.indexOf('Big Multiple (1g):'))
  })

  it('surfaces the category variation table and stores-most-often-cheapest', () => {
    const text = visibleText(renderPriceIndexHtml(fixtureDisparities(), fixtureRollups()))
    // avgSpreadPct 0.14 → 14%, 0.24 → 24%; Pre-Rolls (higher variation) sorts first.
    expect(text).toContain('prices vary about 14% store to store')
    expect(text).toContain('prices vary about 24% store to store')
    expect(text.indexOf('Pre-Rolls')).toBeLessThan(text.indexOf('Flower'))
    expect(text).toContain('Cheap Store — cheapest on 12 of its 20 compared products')
    // real accounting numbers from the envelopes
    expect(text).toContain('1331 same-product comparisons across 16 licensed Washington stores')
    expect(text).toContain('drawn from 500 product listings')
  })
})

describe('FAQ (GEO element) — schema text matches on-page text', () => {
  it('emits a FAQPage with all 8 questions and answers present verbatim in the page body', () => {
    const html = renderPriceIndexHtml(fixtureDisparities(), fixtureRollups())
    const faq = extractJsonLdBlocks(html).find((b) => b['@type'] === 'FAQPage')!
    const entities = faq.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>
    expect(entities).toHaveLength(8)
    const text = visibleText(html)
    for (const { name, acceptedAnswer } of entities) {
      // Every schema question AND answer string appears verbatim in the visible page.
      expect(text).toContain(name)
      expect(text).toContain(acceptedAnswer.text)
    }
  })

  it('mirrors server/scripts/citation-questions.json verbatim (kept in sync)', () => {
    const monitor = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf-8')) as {
      questions: { text: string }[]
    }
    const faqQuestions = new Set(PRICE_INDEX_FAQ.map((f) => f.q))
    for (const { text } of monitor.questions) {
      expect(faqQuestions.has(text)).toBe(true)
    }
  })

  it('keeps no & < > in any question or answer (protects the verbatim escape match)', () => {
    for (const { q, a } of PRICE_INDEX_FAQ) {
      expect(q).not.toMatch(/[&<>]/)
      expect(a).not.toMatch(/[&<>]/)
    }
  })
})

describe('honesty / legal invariants', () => {
  it('never says "statewide" (WA-only, PRFAQ crack #1)', () => {
    const html = renderPriceIndexHtml(fixtureDisparities(), fixtureRollups())
    expect(html.toLowerCase()).not.toContain('statewide')
  })

  it('never presents a discount percentage', () => {
    const text = visibleText(renderPriceIndexHtml(fixtureDisparities(), fixtureRollups()))
    expect(text).not.toMatch(/%\s*off/i)
    expect(text).not.toMatch(/\d+\s*%\s*(off|discount|savings?)/i)
  })

  it('renders the WA age notice and the not-a-seller disclaimer', () => {
    const html = renderPriceIndexHtml(fixtureDisparities(), fixtureRollups())
    expect(html).toContain('intoxicating effects')
    expect(html).toContain('not a cannabis seller')
    expect(html).toContain('class="disclaimer"')
  })
})

describe('freshness posture (whole-file, readiness #4)', () => {
  it('states "observed as of" for a recent artifact', () => {
    const recent = new Date().toISOString()
    const text = visibleText(renderPriceIndexHtml(fixtureDisparities(recent), fixtureRollups()))
    expect(text).toContain('Prices observed as of')
    expect(text).not.toContain('freshness currently unverified')
  })

  it('softens to "freshness currently unverified" for a long-stale artifact', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const text = visibleText(renderPriceIndexHtml(fixtureDisparities(old), fixtureRollups()))
    expect(text).toContain('freshness currently unverified')
  })
})

describe('fail-soft (missing / malformed / empty artifact)', () => {
  it('renders a safe, schema-bearing page when both envelopes are empty', () => {
    const html = renderPriceIndexHtml(EMPTY_DISPARITIES_ENVELOPE, EMPTY_DISPARITY_ROLLUPS_ENVELOPE)
    expect(html).toContain('No price comparison data is available')
    expect(html).not.toContain('<div id="root">')
    const blocks = extractJsonLdBlocks(html)
    expect(blocks.some((b) => b['@type'] === 'Dataset')).toBe(true)
    expect(blocks.some((b) => b['@type'] === 'FAQPage')).toBe(true)
    // epoch (never-derived) generatedAt is never published as a real dateModified
    const dataset = blocks.find((b) => b['@type'] === 'Dataset')!
    expect(dataset.dateModified).toBeUndefined()
    // …and never printed as a false 1970 date
    expect(visibleText(html)).not.toContain('1970')
  })

  it('skips a broken row instead of throwing', () => {
    const env = fixtureDisparities()
    // A shapeless row (no storesCarrying / bad price) must be dropped, not crash.
    ;(env.data.disparities as unknown[]).push({ displayName: 'Broken', category: 'Flower' })
    expect(() => renderPriceIndexHtml(env, fixtureRollups())).not.toThrow()
    const text = visibleText(renderPriceIndexHtml(env, fixtureRollups()))
    expect(text).not.toContain('Broken')
  })

  it('defaults its args so a call with no data is still a valid page', () => {
    expect(() => renderPriceIndexHtml()).not.toThrow()
    expect(renderPriceIndexHtml()).toContain('No price comparison data is available')
  })
})

describe('review fixes', () => {
  it('#1: drops a row with a missing/NaN spreadPct instead of throwing a 500', () => {
    const env = fixtureDisparities()
    // Valid on every field the old guard checked, but spreadPct is NaN (a shapeless
    // committed row). Before the fix, d.spreadPct.toFixed(1) would throw → 500.
    env.data.disparities.push({
      matchKey: 'nopct', displayName: 'No Pct Product', category: 'Flower', weightGrams: 3.5,
      lowPrice: 5, highPrice: 50, spread: 45, spreadPct: NaN,
      storesCarrying: [
        { dispensaryId: 'a-store', price: 5, quantityAvailable: null },
        { dispensaryId: 'b-store', price: 50, quantityAvailable: null },
      ],
    })
    expect(() => renderPriceIndexHtml(env, fixtureRollups())).not.toThrow()
    expect(visibleText(renderPriceIndexHtml(env, fixtureRollups()))).not.toContain('No Pct Product')
  })

  it('#2/#4: recovers store count and comparison count from disparities when rollups are empty', () => {
    // disparities present, rollups missing/empty → must NOT print "across 0 stores" and
    // must count only renderable rows (ties count; broken rows do not).
    const text = visibleText(renderPriceIndexHtml(fixtureDisparities(), EMPTY_DISPARITY_ROLLUPS_ENVELOPE))
    expect(text).not.toContain('across 0 licensed Washington stores')
    // 2 gaps + 1 tie = 3 renderable comparisons; 6 distinct stores across them.
    expect(text).toContain('Based on 3 same-product comparisons across 6 licensed Washington stores')
  })

  it('#5: small-ratio rows render a percent, never a self-contradicting "0.0×"', () => {
    const env = fixtureDisparities()
    env.data.disparities = [
      {
        matchKey: 'tiny', displayName: 'Tiny Gap', category: 'Flower', weightGrams: 3.5,
        lowPrice: 100, highPrice: 103, spread: 3, spreadPct: 0.03,
        storesCarrying: [
          { dispensaryId: 'lo-store', price: 100, quantityAvailable: null },
          { dispensaryId: 'hi-store', price: 103, quantityAvailable: null },
        ],
      },
    ]
    const text = visibleText(renderPriceIndexHtml(env, fixtureRollups()))
    expect(text).toContain('a $3.00 gap, 3% of the lowest price, across 2 stores')
    expect(text).not.toContain('0.0×')
  })
})
