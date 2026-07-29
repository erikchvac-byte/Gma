import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import {
  compareIndexRoute,
  compareCategoryRoute,
  renderIndexHtml,
  renderCategoryHtml,
  categorySlug,
  categoriesFrom,
  INDEX_DATASET_NAME,
  INDEX_DATASET_DESCRIPTION,
} from './compareRoute.js'
import {
  EMPTY_DISPARITIES_ENVELOPE,
  EMPTY_DISPARITY_ROLLUPS_ENVELOPE,
} from './valueRoute.js'
import type { DerivedEnvelope } from '../utils/derivedEnvelope.js'
import type { MatchReport } from '../utils/crossStoreValue.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DISPARITIES_PATH = path.join(__dirname, '../data/derived/disparities.json')

const app = express()
app.get('/compare', compareIndexRoute)
app.get('/compare/:category', compareCategoryRoute)

// A real category slug from the committed disparities dataset, so the happy-path
// test asserts against live-shaped data rather than a hard-coded guess.
function aRealCategory(): string {
  const env = JSON.parse(readFileSync(DISPARITIES_PATH, 'utf-8'))
  const cats = categoriesFrom(env.data)
  return cats[0]
}

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

describe('GET /compare (index)', () => {
  it('loads the GA4 tag so its pageviews register in Analytics', async () => {
    const res = await request(app).get('/compare')

    expect(res.text).toContain('googletagmanager.com/gtag/js?id=G-Z3EH6D5C89')
    expect(res.text).toContain("gtag('config', 'G-Z3EH6D5C89')")
    // GA scripts stay out of the crawler-visible text and the Dataset JSON-LD count
    expect(visibleText(res.text)).not.toContain('dataLayer')
    expect(extractJsonLdBlocks(res.text)).toHaveLength(1)
  })

  it('serves plain HTML with no React shell and an hour cache', async () => {
    const res = await request(app).get('/compare')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.headers['cache-control']).toBe('public, max-age=3600')
    expect(res.text).not.toContain('<div id="root">')
  })

  it('includes canonical, title, description and a Dataset JSON-LD whose text matches the page', async () => {
    const res = await request(app).get('/compare')
    expect(res.text).toContain('<link rel="canonical" href="https://gmaslist.com/compare"')
    expect(res.text).toContain('<title>')
    expect(res.text).toContain('<meta name="description"')
    // Open Graph + Twitter Card, url matching the canonical.
    expect(res.text).toContain('<meta property="og:url" content="https://gmaslist.com/compare" />')
    expect(res.text).toContain('<meta property="og:image" content="https://gmaslist.com/og-image.png" />')
    expect(res.text).toContain('<meta name="twitter:card" content="summary_large_image" />')

    const blocks = extractJsonLdBlocks(res.text)
    const dataset = blocks.find((b) => b['@type'] === 'Dataset')
    expect(dataset).toBeTruthy()
    expect(dataset!.name).toBe(INDEX_DATASET_NAME)

    // Schema text must appear verbatim in the visible page text (Google's rule).
    const text = visibleText(res.text)
    expect(text).toContain(INDEX_DATASET_NAME)
    expect(text).toContain(INDEX_DATASET_DESCRIPTION)
    // areaServed is Washington only (WAC 314-55-155).
    expect((dataset!.spatialCoverage as { name: string }).name).toBe('Washington')
  })

  it('links to each category page', async () => {
    const res = await request(app).get('/compare')
    const cat = aRealCategory()
    expect(res.text).toContain(`href="/compare/${categorySlug(cat)}"`)
  })
})

describe('GET /compare/:category', () => {
  it('renders same-product cross-store rows with a category-scoped Dataset', async () => {
    const cat = aRealCategory()
    const res = await request(app).get(`/compare/${categorySlug(cat)}`)
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('<div id="root">')

    const dataset = extractJsonLdBlocks(res.text).find((b) => b['@type'] === 'Dataset')
    expect(dataset).toBeTruthy()
    // schema name/description are on-page verbatim.
    const text = visibleText(res.text)
    expect(text).toContain(dataset!.name as string)
    expect(text).toContain(dataset!.description as string)
    // an honest range row: "$X at Store to $Y at Store across N stores"
    expect(text).toMatch(/\$\d+\.\d{2} at .+ to \$\d+\.\d{2} at .+ across \d+ stores/)
  })

  it('returns 404 for an unknown category and does not leak an indexable page', async () => {
    const res = await request(app).get('/compare/not-a-real-category')
    expect(res.status).toBe(404)
    expect(res.text).toContain('Comparison not found')
    expect(res.text).not.toContain('<div id="root">')
  })
})

describe('honesty contract', () => {
  it('never presents a discount percentage on any comparison page', async () => {
    const cat = aRealCategory()
    const index = visibleText((await request(app).get('/compare')).text)
    const category = visibleText((await request(app).get(`/compare/${categorySlug(cat)}`)).text)
    // Gate 2 targets DISCOUNT phrasing ("N% off"). A bare "%" digit is allowed:
    // it can legitimately appear inside a verbatim product displayName (e.g.
    // "Blue Dream 20% CBD"), which is the product's name, not a discount claim.
    for (const text of [index, category]) {
      expect(text).not.toMatch(/%\s*off/i)
      expect(text).not.toMatch(/\d+\s*%\s*(off|discount|savings?)/i)
    }
  })

  it('surfaces real numeric exclusion counts on the index (Inspectability, AC3)', async () => {
    const text = visibleText((await request(app).get('/compare')).text)
    expect(text).toMatch(/\d+ non-comparable/)
    expect(text).toMatch(/\d+ product listings/)
  })

  // A tie (all stores at one price) must NOT name a single store as both cheapest
  // and priciest — it states one price across N stores. A real spread renders the
  // price from the same store object it names.
  it('renders tied vs spread rows honestly', () => {
    const env: DerivedEnvelope<MatchReport> = {
      data: {
        disparities: [
          {
            matchKey: 'tie', displayName: 'Tie Product', category: 'Flower', weightGrams: 3.5,
            lowPrice: 35, highPrice: 35, spread: 0, spreadPct: 0,
            storesCarrying: [
              { dispensaryId: 'store-a', price: 35, quantityAvailable: null },
              { dispensaryId: 'store-b', price: 35, quantityAvailable: null },
            ],
          },
          {
            matchKey: 'gap', displayName: 'Gap Product', category: 'Flower', weightGrams: 1,
            lowPrice: 10, highPrice: 20, spread: 10, spreadPct: 1,
            storesCarrying: [
              { dispensaryId: 'cheap-store', price: 10, quantityAvailable: null },
              { dispensaryId: 'pricey-store', price: 20, quantityAvailable: null },
            ],
          },
        ],
        totalRecords: 2, unmatchedCount: 0, excludedFlagCount: 0,
        nonComparableCategoryCount: 0, placedRecords: 2, staleRecords: 0,
      },
      excluded: [], coverage: {}, generatedAt: '2026-07-10T00:00:00.000Z',
    }
    const html = renderCategoryHtml('Flower', env)
    expect(html).toContain('$35.00 at all 2 stores')
    expect(html).not.toContain('$35.00 at Store A to $35.00 at Store A')
    expect(html).toContain(
      '$10.00 at Cheap Store to $20.00 at Pricey Store across 2 stores',
    )
  })
})

describe('fail-soft (missing/malformed artifact)', () => {
  it('renders a safe empty index instead of throwing when rollups are empty', () => {
    const html = renderIndexHtml(EMPTY_DISPARITY_ROLLUPS_ENVELOPE)
    expect(html).toContain('No comparison data is available')
    // still a valid, schema-bearing page
    expect(extractJsonLdBlocks(html).some((b) => b['@type'] === 'Dataset')).toBe(true)
    expect(html).not.toContain('<div id="root">')
  })

  it('renders a safe empty category page when disparities are empty', () => {
    const html = renderCategoryHtml('Flower', EMPTY_DISPARITIES_ENVELOPE)
    expect(html).toContain('No comparisons are available')
    expect(html).not.toContain('<div id="root">')
  })
})

describe('positioning disclaimer (shared page() footer)', () => {
  // Every /compare surface routes through page(); assert the negation footer on the
  // index and category renderers (region variants share page() — covered in
  // compareRegionRoute.test.ts). Present even on the fail-soft empty pages.
  it('appends the not-a-seller disclaimer to the index page', () => {
    const html = renderIndexHtml(EMPTY_DISPARITY_ROLLUPS_ENVELOPE)
    expect(html).toContain('not a cannabis seller')
    expect(html).toContain('href="/about"')
    expect(html).toContain('class="disclaimer"')
  })

  it('appends the not-a-seller disclaimer to a category page', () => {
    const html = renderCategoryHtml('Flower', EMPTY_DISPARITIES_ENVELOPE)
    expect(html).toContain('not a cannabis seller')
  })
})
