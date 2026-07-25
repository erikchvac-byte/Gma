import { vi, describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})

import { readFileSync } from 'node:fs'
import { storeRoute, renderStoreHtml, buildStoreJsonLd } from './storeRoute.js'
import type { Dispensary } from '../../client/src/types/index.js'

const mockedReadFileSync = vi.mocked(readFileSync)

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

describe('renderStoreHtml (unit)', () => {
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
