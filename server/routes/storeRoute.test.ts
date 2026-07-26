import { vi, describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})

// The per-store page reads the served price-vs-own-median fact for "Real price drops". Mock the
// reader so these tests never touch the real committed derived file (which would inject
// unpredictable real rows for a real store id like remedy-tulalip). Default: empty → no drops
// section, so every non-drops test renders the deals-only page deterministically.
const { mockReadDrops } = vi.hoisted(() => ({ mockReadDrops: vi.fn() }))
vi.mock('./valueRoute.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./valueRoute.js')>()
  return { ...actual, readPriceVsOwnMedian: mockReadDrops }
})

import { readFileSync } from 'node:fs'
import { storeRoute, renderStoreHtml, buildStoreJsonLd, storeDrops } from './storeRoute.js'
import type { Dispensary } from '../../client/src/types/index.js'
import type { PriceVsOwnMedianRow } from '../utils/priceVsOwnMedian.js'

const mockedReadFileSync = vi.mocked(readFileSync)

const EMPTY_DROPS_ENVELOPE = { data: { rows: [] }, excluded: [], coverage: {}, generatedAt: new Date(0).toISOString() }
function dropsEnvelope(rows: Partial<PriceVsOwnMedianRow>[]) {
  return { ...EMPTY_DROPS_ENVELOPE, data: { rows } }
}

beforeEach(() => {
  mockReadDrops.mockReturnValue(EMPTY_DROPS_ENVELOPE)
})

const app = express()
app.get('/store/:slug', storeRoute)

// Minimal well-formed data.json with two stores: one with active deals + full
// geo/address, one dealless. Written through the mocked readFileSync so buildApiData
// picks it up. lastFetchedAt is fresh so the deals survive filterActiveDeals.
function seedDataJson(overrides: Partial<Dispensary>[] = []) {
  const fresh = new Date().toISOString()
  const stores = overrides.length
    ? overrides
    : [
        {
          id: 'remedy-tulalip',
          name: 'Remedy Tulalip',
          url: 'https://remedytulalip.com/',
          address: '9226 34th Avenue NE, Tulalip, WA 98271',
          lat: 48.0803125,
          lng: -122.1861767,
          distanceMiles: 2.5,
          lastFetchedAt: fresh,
          stale: false,
          deals: [
            { type: 'daily', description: '15% Off Edibles', discountPct: 15, startTime: null, endTime: null, daysValid: ['everyday'] },
          ],
        },
        {
          id: 'dealless-store',
          name: 'Dealless Store',
          url: 'https://example.test/',
          address: '1 Main St, Everett, WA 98201',
          lat: 47.9,
          lng: -122.2,
          distanceMiles: 5,
          lastFetchedAt: fresh,
          stale: false,
          deals: [],
        },
      ]
  mockedReadFileSync.mockReturnValueOnce(
    JSON.stringify({ meta: { lastScraperRun: fresh, gasPrice: 4, gasPriceUpdatedAt: fresh }, dispensaries: stores }),
  )
}

describe('GET /store/:slug', () => {
  it('renders the store name, address, active deals, and canonical for a known store', async () => {
    seedDataJson()
    const res = await request(app).get('/store/remedy-tulalip')

    expect(res.status).toBe(200)
    expect(res.type).toMatch(/html/)
    expect(res.text).toContain('<h1>Remedy Tulalip</h1>')
    expect(res.text).toContain('9226 34th Avenue NE, Tulalip, WA 98271')
    expect(res.text).toContain('15% Off Edibles')
    expect(res.text).toContain('<link rel="canonical" href="https://gmaslist.com/store/remedy-tulalip" />')
    // Social meta: og:title carries the store name, og:url the canonical.
    expect(res.text).toContain('<meta property="og:title" content="Remedy Tulalip')
    expect(res.text).toContain('<meta property="og:url" content="https://gmaslist.com/store/remedy-tulalip" />')
    expect(res.text).toContain('<meta name="twitter:card" content="summary" />')
  })

  it('emits LocalBusiness JSON-LD with structured address + geo, never Product/Offer', async () => {
    seedDataJson()
    const res = await request(app).get('/store/remedy-tulalip')

    const m = res.text.match(/<script type="application\/ld\+json">(.+?)<\/script>/s)
    expect(m).toBeTruthy()
    const ld = JSON.parse(m![1].replace(/\\u003c/g, '<'))
    expect(ld['@type']).toBe('LocalBusiness')
    expect(ld.address).toMatchObject({
      '@type': 'PostalAddress',
      streetAddress: '9226 34th Avenue NE',
      addressLocality: 'Tulalip',
      addressRegion: 'WA',
      postalCode: '98271',
      addressCountry: 'US',
    })
    expect(ld.geo).toMatchObject({ '@type': 'GeoCoordinates', latitude: 48.0803125, longitude: -122.1861767 })
    expect(ld.sameAs).toEqual(['https://remedytulalip.com/'])
    // Compliance: no seller/commerce schema anywhere on the page.
    expect(res.text).not.toContain('AggregateOffer')
    expect(res.text).not.toContain('"@type":"Offer"')
    expect(res.text).not.toContain('"@type":"Product"')
  })

  it('deliberately omits distance from the crawlable HTML', async () => {
    seedDataJson()
    const res = await request(app).get('/store/remedy-tulalip')

    expect(res.status).toBe(200)
    expect(res.text).not.toMatch(/2\.5\s*mi/i)
    expect(res.text.toLowerCase()).not.toContain('distance')
  })

  it('renders an honest empty state (still 200 + JSON-LD) for a store with no active deals', async () => {
    seedDataJson()
    const res = await request(app).get('/store/dealless-store')

    expect(res.status).toBe(200)
    expect(res.text).toContain('No active deals right now')
    expect(res.text).toContain('"@type":"LocalBusiness"')
  })

  it('404s (short cache) an unknown store slug', async () => {
    seedDataJson()
    const res = await request(app).get('/store/no-such-store')

    expect(res.status).toBe(404)
    expect(res.text).toContain('Store not found')
    expect(res.headers['cache-control']).toContain('max-age=60')
  })

  it('escapes hostile store/deal text so it cannot break out of markup or the JSON-LD script', async () => {
    seedDataJson([
      {
        id: 'evil-store',
        name: 'Evil </script><script>alert(1)</script>',
        url: 'https://evil.test/',
        address: '1 A St, Everett, WA 98201',
        lat: 47.9,
        lng: -122.2,
        lastFetchedAt: new Date().toISOString(),
        stale: false,
        deals: [
          { type: 'daily', description: 'SAVE $$$ <img src=x onerror=alert(1)>', discountPct: null, startTime: null, endTime: null, daysValid: ['everyday'] },
        ],
      } as Partial<Dispensary>,
    ])
    const res = await request(app).get('/store/evil-store')

    expect(res.status).toBe(200)
    expect(res.text).not.toContain('<script>alert(1)</script>')
    expect(res.text).not.toContain('<img src=x onerror=alert(1)>')
    // Escaped forms are present instead.
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('returns 500 (not a misleading 404) when data.json is unreadable', async () => {
    mockedReadFileSync.mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    const res = await request(app).get('/store/remedy-tulalip')

    expect(res.status).toBe(500)
  })
})

describe('buildStoreJsonLd (unit)', () => {
  it('omits geo when coordinates are missing/non-finite (Honest Math)', () => {
    const store = {
      id: 's',
      name: 'S',
      url: 'not-a-url',
      address: 'somewhere unparseable',
      deals: [],
    } as unknown as Dispensary
    const ld = buildStoreJsonLd(store, 'https://gmaslist.com/store/s')

    expect(ld.geo).toBeUndefined()
    expect(ld.sameAs).toBeUndefined() // non-http url dropped
    // Unparseable address falls back to the whole string + WA region.
    expect(ld.address).toMatchObject({ streetAddress: 'somewhere unparseable', addressRegion: 'WA', addressCountry: 'US' })
  })
})

function dropRow(overrides: Partial<PriceVsOwnMedianRow> = {}): PriceVsOwnMedianRow {
  return {
    dispensaryId: 'remedy-tulalip',
    productId: 'p1',
    name: 'Blue Dream 3.5g',
    category: 'Flower',
    option: '3.5g',
    currentPrice: 9,
    medianPrice: 18,
    pctVsMedian: -0.5,
    observedDays: 14,
    ...overrides,
  }
}

describe('GET /store/:slug — real price drops', () => {
  it("renders this store's honest below-median drops as plain prose, never Offer/Product", async () => {
    seedDataJson()
    mockReadDrops.mockReturnValue(
      dropsEnvelope([dropRow(), dropRow({ dispensaryId: 'other-store', name: 'Not Mine' })]),
    )
    const res = await request(app).get('/store/remedy-tulalip')

    expect(res.status).toBe(200)
    expect(res.text).toContain('Real price drops')
    expect(res.text).toContain('Blue Dream 3.5g (3.5g) — 50% below its usual: $9.00 vs $18.00 usual')
    // a drop belonging to another store must never appear on this store's page
    expect(res.text).not.toContain('Not Mine')
    // the honest discount is prose only — still no seller/commerce schema anywhere
    expect(res.text).not.toContain('"@type":"Offer"')
    expect(res.text).not.toContain('"@type":"Product"')
  })

  it('omits the drops section entirely when the store has no renderable drops', async () => {
    seedDataJson()
    mockReadDrops.mockReturnValue(EMPTY_DROPS_ENVELOPE)
    const res = await request(app).get('/store/remedy-tulalip')

    expect(res.status).toBe(200)
    expect(res.text).not.toContain('Real price drops')
  })
})

describe('storeDrops (unit)', () => {
  const store = { id: 'remedy-tulalip', name: 'R', url: 'https://x.test/', deals: [] } as unknown as Dispensary

  it('filters to this store, keeps only renderable drops, and sorts deepest-discount first', () => {
    mockReadDrops.mockReturnValue(
      dropsEnvelope([
        dropRow({ productId: 'a', pctVsMedian: -0.1 }),
        dropRow({ productId: 'b', pctVsMedian: -0.4 }),
        dropRow({ productId: 'c', pctVsMedian: 0.2 }), // above-median premium → dropped
        dropRow({ productId: 'd', pctVsMedian: -0.001 }), // sub-1% display → dropped
        dropRow({ productId: 'e', dispensaryId: 'other-store' }), // another store → dropped
      ]),
    )
    expect(storeDrops(store).map((r) => r.productId)).toEqual(['b', 'a'])
  })

  it('caps the page at 12 drops', () => {
    const many = Array.from({ length: 20 }, (_, i) => dropRow({ productId: `p${i}`, pctVsMedian: -0.1 - i / 100 }))
    mockReadDrops.mockReturnValue(dropsEnvelope(many))
    expect(storeDrops(store)).toHaveLength(12)
  })

  it('returns no drops for a failed or stale store (its current price is untrustworthy)', () => {
    mockReadDrops.mockReturnValue(dropsEnvelope([dropRow()]))
    const stale = { ...store, status: 'stale' } as unknown as Dispensary
    const failed = { ...store, status: 'failed' } as unknown as Dispensary
    expect(storeDrops(stale)).toEqual([])
    expect(storeDrops(failed)).toEqual([])
  })
})

describe('renderStoreHtml (unit)', () => {
  it('renders passed-in drops and applies the sub-1% display gate', () => {
    const store = { id: 'x', name: 'X', url: 'https://x.test/', deals: [] } as unknown as Dispensary
    const html = renderStoreHtml(store, [
      { dispensaryId: 'x', productId: 'p', name: 'Widget', category: 'Flower', option: '1g', currentPrice: 5, medianPrice: 10, pctVsMedian: -0.5, observedDays: 10 },
      { dispensaryId: 'x', productId: 'q', name: 'TooSmall', category: 'Flower', option: '1g', currentPrice: 5, medianPrice: 5, pctVsMedian: -0.001, observedDays: 10 },
    ])
    expect(html).toContain('Real price drops')
    expect(html).toContain('Widget (1g) — 50% below its usual: $5.00 vs $10.00 usual')
    expect(html).not.toContain('TooSmall') // sub-1% display mover suppressed
  })

  it('produces exactly one canonical link and one JSON-LD block', () => {
    const store = {
      id: 'x',
      name: 'X',
      url: 'https://x.test/',
      address: '1 A St, Everett, WA 98201',
      lat: 47.9,
      lng: -122.2,
      deals: [],
    } as unknown as Dispensary
    const html = renderStoreHtml(store)

    expect(html.match(/rel="canonical"/g)).toHaveLength(1)
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1)
  })
})
