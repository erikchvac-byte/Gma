import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import {
  compareSegmentRoute,
  compareCategoryRegionRoute,
  renderRegionIndexHtml,
  renderRegionCategoryHtml,
} from './compareRoute.js'
import type { Region } from '../utils/regionModel.js'
import type { RegionalFloor } from '../utils/regionalPriceFloor.js'

// Integration app mirrors the production registration order (index.ts): the
// two-segment geo route before the single-segment dispatcher.
const app = express()
app.get('/compare/:category/:region', compareCategoryRegionRoute)
app.get('/compare/:category', compareSegmentRoute)

const GENERATED_AT = '2026-07-28T11:00:13.684Z'

function floor(over: Partial<RegionalFloor> = {}): RegionalFloor {
  return {
    matchKey: over.matchKey ?? 'mk',
    displayName: over.displayName ?? 'Product',
    category: over.category ?? 'Concentrate',
    weightGrams: over.weightGrams ?? 1,
    floorPrice: over.floorPrice ?? 10,
    floorDispensaryIds: over.floorDispensaryIds ?? ['star-buds-bellingham'],
    storeCountInCluster: over.storeCountInCluster ?? 1,
  }
}

// A synthetic region so the render tests are deterministic (independent of the
// committed derived artifact).
function bellingham(over: Partial<Region> = {}): Region {
  return {
    slug: 'bellingham',
    label: 'Bellingham',
    cities: ['Bellingham'],
    clusterId: '2020-solutions-north-bellingham',
    memberDispensaryIds: ['2020-solutions-north-bellingham', 'star-buds-bellingham'],
    storeCount: 5,
    floors: over.floors ?? [
      floor({ displayName: 'Cheap Wax', floorPrice: 8, floorDispensaryIds: ['a', 'b'] }),
      floor({ displayName: 'Mid Rosin', floorPrice: 20 }),
      floor({ displayName: 'Flower Nug', category: 'Flower', floorPrice: 5 }),
    ],
    categories: over.categories ?? [
      { category: 'Concentrate', slug: 'concentrate', floorCount: 2 },
      { category: 'Flower', slug: 'flower', floorCount: 1 },
    ],
    ...over,
  }
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

function jsonLd(html: string): Record<string, unknown> {
  return JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1])
}

// Prices in the order they appear in <li> rows.
function liPrices(html: string): number[] {
  return [...html.matchAll(/<li>[^$]*\$(\d+\.\d{2})/g)].map((m) => Number(m[1]))
}

describe('renderRegionCategoryHtml (the long-tail answer page)', () => {
  const html = renderRegionCategoryHtml(bellingham(), 'Concentrate', GENERATED_AT, new Map())

  it('leads with the geo + category + "cheapest" framing a long-tail query targets', () => {
    const text = visibleText(html)
    expect(text).toContain('Cheapest Concentrate in the Bellingham, WA area')
    expect(html).toContain('<link rel="canonical" href="https://gmaslist.com/compare/concentrate/bellingham" />')
  })

  it('frames results as per-product lows, NOT a category leaderboard (Gate 1)', () => {
    const text = visibleText(html)
    // The honest framing must be present...
    expect(text).toContain('Same-product prices only, not a category ranking')
    expect(text).toContain('a per-product low, not a discount or a category ranking')
    // ...and the dishonest single-number category claim must NOT be.
    expect(text).not.toMatch(/the cheapest concentrate is \$/i)
  })

  it('lists each product floor cheapest-first with the store named', () => {
    expect(liPrices(html)).toEqual([8, 20]) // Flower ($5) excluded; sorted ascending
    const text = visibleText(html)
    expect(text).toContain('Cheap Wax (1g) — $8.00')
    // ties across stores are joined, not crowned to one; unknown ids title-case via
    // the storeName fallback (nameById is empty here)
    expect(text).toContain('$8.00 at A and B')
  })

  it('emits a Dataset with a local Place inside Washington and the artifact date', () => {
    const ld = jsonLd(html)
    expect(ld['@type']).toBe('Dataset')
    expect(ld.dateModified).toBe(GENERATED_AT)
    expect(ld.spatialCoverage).toMatchObject({
      '@type': 'Place',
      name: 'Bellingham, Washington',
      containedInPlace: { '@type': 'State', name: 'Washington' },
    })
  })

  it('shows the Pacific "as of" date, and omits it on the never-derived epoch', () => {
    expect(visibleText(html)).toContain('as of July 28, 2026')
    const epoch = renderRegionCategoryHtml(bellingham(), 'Concentrate', new Date(0).toISOString(), new Map())
    expect(visibleText(epoch)).not.toContain('as of')
    expect(jsonLd(epoch).dateModified).toBeUndefined()
  })

  it('degrades to a safe empty state when a category has no floors here', () => {
    const empty = renderRegionCategoryHtml(bellingham({ floors: [] }), 'Concentrate', GENERATED_AT, new Map())
    expect(visibleText(empty)).toContain('No concentrate comparisons are available in this area')
  })
})

describe('renderRegionIndexHtml (region landing)', () => {
  const html = renderRegionIndexHtml(bellingham(), GENERATED_AT)
  it('links to each category page for the region and discloses coverage', () => {
    expect(html).toContain('<link rel="canonical" href="https://gmaslist.com/compare/bellingham" />')
    expect(html).toContain('href="/compare/concentrate/bellingham"')
    expect(visibleText(html)).toContain('Covers Bellingham.')
  })

  it('carries the not-a-seller positioning disclaimer (shared page() footer)', () => {
    expect(html).toContain('not a cannabis seller')
    expect(html).toContain('href="/about"')
    // region category page shares the same footer
    expect(renderRegionCategoryHtml(bellingham(), 'Concentrate', GENERATED_AT, new Map())).toContain(
      'not a cannabis seller',
    )
  })
})

describe('GET /compare/:category dispatcher + /compare/:category/:region', () => {
  it('serves the region landing page for a region slug', async () => {
    const res = await request(app).get('/compare/bellingham')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
    expect(res.text).not.toContain('<div id="root">')
    expect(visibleText(res.text)).toContain('Cheapest cannabis prices in the Bellingham, WA area')
  })

  it('serves the cheapest-in-area page for a real category+region', async () => {
    const res = await request(app).get('/compare/concentrate/bellingham')
    expect(res.status).toBe(200)
    expect(visibleText(res.text)).toContain('Cheapest Concentrate in the Bellingham, WA area')
    // cheapest-first: rendered <li> prices are non-decreasing
    const prices = liPrices(res.text)
    expect(prices.length).toBeGreaterThan(0)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
  })

  it('falls through to the category page for a category slug (not a region)', async () => {
    const res = await request(app).get('/compare/flower')
    expect(res.status).toBe(200)
    // the category page, not a region landing
    expect(visibleText(res.text)).not.toContain('Cheapest cannabis prices in the')
  })

  it('404s an unknown region, an unknown category-in-region, and a bogus single slug', async () => {
    expect((await request(app).get('/compare/concentrate/nowhere-wa')).status).toBe(404)
    expect((await request(app).get('/compare/not-a-category/bellingham')).status).toBe(404)
    expect((await request(app).get('/compare/zzz-not-anything')).status).toBe(404)
  })
})
