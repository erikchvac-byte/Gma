import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Intercepted } from '../utils/scraperClient.js'
import {
  DEFAULT_PRODUCT_CATEGORIES,
  dutchieProductsRequest,
  effectsMap,
  pickProducts,
  potency,
  scrapeDutchieProducts,
  transformProducts,
} from './_dutchieProducts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// The products fixture is a BARE product object ({ product: {...} }), not an
// { intercepted: [...] } envelope like the specials fixture — wrap it in a
// FilteredProducts intercept for these tests.
const fixtureProduct = (
  JSON.parse(
    readFileSync(path.join(__dirname, '__fixtures__', 'dutchie-products.json'), 'utf-8'),
  ) as { product: Record<string, unknown> }
).product

// Wrap product objects in a single FilteredProducts intercept (one page).
function page(...products: Record<string, unknown>[]): Intercepted {
  return {
    url: 'https://dutchie.com/api-4/graphql?operationName=FilteredProducts',
    status: 200,
    data: { data: { filteredProducts: { products } } },
  }
}

// Multi-option flower built from the investigation's documented Space Kush values —
// the single-option fixture CANNOT catch cross-weight mis-mapping, which is CAP-2's
// whole point. Options ["1g","3.5g"], Prices [11,35], recSpecialPrices [5.5,17.5],
// children [{1g,$11},{3.5g,$35}].
const spaceKush = {
  _id: 'space-kush-1',
  Name: 'Space Kush Flower',
  type: 'Flower',
  brandName: 'Galaxy',
  strainType: 'Hybrid',
  special: true,
  weight: 1000,
  Options: ['1g', '3.5g'],
  Prices: [11, 35],
  recSpecialPrices: [5.5, 17.5],
  POSMetaData: {
    children: [
      { option: '1g', price: 11, quantityAvailable: 4 },
      { option: '3.5g', price: 35, quantityAvailable: 2 },
    ],
  },
}

describe('dutchieProductsRequest', () => {
  it('waits for the FilteredProducts op (not GetSpecialMenuCards) on the embed', () => {
    const req = dutchieProductsRequest('abc123')
    expect(req.url).toBe('https://dutchie.com/embedded-menu/abc123')
    expect(req.wait_for_pattern).toBe('FilteredProducts')
    expect(req.tier).toBe('browser')
    expect(req.intercept_pattern).toMatch(/graphql/)
  })

  it('requests the numbered-pagination walk over all five categories at perPage 100', () => {
    // The embed menu is NUMBERED pages, not infinite scroll — `paginate` tells the
    // service to walk every page of every category in-page (ADR-089). This replaces
    // the old scroll_after_wait no-op, which never pulled pages 2..N.
    const req = dutchieProductsRequest('abc123')
    expect(req.paginate).toEqual({ types: [...DEFAULT_PRODUCT_CATEGORIES], per_page: 100 })
    expect('scroll_after_wait' in req).toBe(false)
  })

  it('threads a narrowed category list into the paginate walk', () => {
    const req = dutchieProductsRequest('abc123', ['Flower'])
    expect(req.paginate?.types).toEqual(['Flower'])
  })
})

describe('deals-path regression (AC-6): the specials preset is untouched by pagination', () => {
  it('the deals request never carries a paginate walk (its timing is unchanged)', async () => {
    const { dutchieRequest } = await import('./_dutchie.js')
    const deals = dutchieRequest('abc123')
    expect(deals.paginate).toBeUndefined()
    expect(deals.wait_for_pattern).toBe('GetSpecialMenuCards')
  })
})

describe('pickProducts (pagination assembly, CAP-3)', () => {
  it('finds the FilteredProducts intercept and returns its products', () => {
    expect(pickProducts([page(fixtureProduct)])).toHaveLength(1)
  })

  it('assembles products across multiple paginated FilteredProducts responses', () => {
    const a = { _id: 'a', Name: 'A' }
    const b = { _id: 'b', Name: 'B' }
    const c = { _id: 'c', Name: 'C' }
    const assembled = pickProducts([page(a, b), page(c)])
    expect(assembled.map((p) => p._id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('dedupes the same product id appearing across pages (first wins)', () => {
    const p1 = { _id: 'dup', Name: 'First' }
    const p2 = { _id: 'dup', Name: 'Second' }
    const assembled = pickProducts([page(p1), page(p2)])
    expect(assembled).toHaveLength(1)
    expect(assembled[0].Name).toBe('First')
  })

  it('returns [] when no FilteredProducts intercept is present', () => {
    const other: Intercepted[] = [
      { url: 'graphql?operationName=GetSpecialMenuCards', status: 200, data: {} },
    ]
    expect(pickProducts(other)).toEqual([])
  })

  it('returns [] for an empty intercepted array', () => {
    expect(pickProducts([])).toEqual([])
  })

  it('returns [] when the products path is missing/wrong-shaped', () => {
    const bad: Intercepted[] = [
      { url: 'graphql?operationName=FilteredProducts', status: 200, data: { data: {} } },
    ]
    expect(pickProducts(bad)).toEqual([])
  })
})

describe('transformProducts (extraction + price alignment, CAP-1/CAP-2)', () => {
  it('extracts the live pre-roll fixture with category and weight-keyed pricing', () => {
    const [prod] = transformProducts([page(fixtureProduct)])
    expect(prod.category).toBe('Pre-Rolls')
    expect(prod.name).toBe("Mama J's: Alien Rock Candy - PR 2pk")
    expect(prod.brand).toBe("mama J's")
    expect(prod.special).toBe(true)
    expect(prod.weightField).toBe(1000)
    expect(prod.netWeightMg).toBe(2000) // measurements.netWeight 2000 MILLIGRAMS
    expect(prod.options).toEqual([
      { option: '2g', basePrice: 8, specialPrice: 4, quantityAvailable: 25 },
    ])
  })

  it('aligns every option base↔special across a MULTI-option product (no mis-map)', () => {
    const [prod] = transformProducts([page(spaceKush)])
    // base price from POSMetaData.children (self-describing), special from positional
    // recSpecialPrices[i] — verified per the investigation's Space Kush values.
    expect(prod.options).toEqual([
      { option: '1g', basePrice: 11, specialPrice: 5.5, quantityAvailable: 4 },
      { option: '3.5g', basePrice: 35, specialPrice: 17.5, quantityAvailable: 2 },
    ])
  })

  it('reads base from children by OPTION match when children are shorter than Options', () => {
    // 3.5g option is below threshold → absent from children. Base must come back null
    // for it (not the 1g price), while special stays positional.
    const thresholded = {
      ...spaceKush,
      POSMetaData: { children: [{ option: '1g', price: 11, quantityAvailable: 4 }] },
    }
    const [prod] = transformProducts([page(thresholded)])
    expect(prod.options[0]).toMatchObject({ option: '1g', basePrice: 11, specialPrice: 5.5 })
    expect(prod.options[1]).toMatchObject({ option: '3.5g', basePrice: null, specialPrice: 17.5 })
  })

  it('yields null special prices when the product is not on special', () => {
    const noSpecial = { ...spaceKush, special: false }
    const [prod] = transformProducts([page(noSpecial)])
    expect(prod.options.every((o) => o.specialPrice === null)).toBe(true)
    expect(prod.options[0].basePrice).toBe(11)
  })

  it('keeps Edible and Concentrate products (spec-category-expansion)', () => {
    // Live-shaped per the capture's field table: type is singular, options carry
    // an mg label (Edible) / true-weight label (Concentrate).
    const edible = {
      _id: 'e1',
      Name: 'Wyld Raspberry Gummies 100mg',
      type: 'Edible',
      brandName: 'Wyld',
      Options: ['100mg'],
      POSMetaData: { children: [{ option: '100mg', price: 25, quantityAvailable: 10 }] },
    }
    const concentrate = {
      _id: 'c1',
      Name: 'GG4 Live Resin',
      type: 'Concentrate',
      brandName: 'Oleum',
      Options: ['1g'],
      POSMetaData: { children: [{ option: '1g', price: 30, quantityAvailable: 6 }] },
    }
    const products = transformProducts([page(edible, concentrate)])
    expect(products.map((p) => p.category).sort()).toEqual(['Concentrate', 'Edible'])
    // option labels come through VERBATIM — nothing is parsed away at extraction
    expect(products.find((p) => p.category === 'Edible')!.options).toEqual([
      { option: '100mg', basePrice: 25, specialPrice: null, quantityAvailable: 10 },
    ])
    expect(products.find((p) => p.category === 'Concentrate')!.options).toEqual([
      { option: '1g', basePrice: 30, specialPrice: null, quantityAvailable: 6 },
    ])
  })

  it('still drops categories outside the collection scope (never confirmed in payload)', () => {
    const topical = { _id: 't1', Name: 'CBD Balm', type: 'Topicals', Options: ['1oz'] }
    expect(transformProducts([page(topical)])).toEqual([])
  })

  it('keeps exactly the five collected categories', () => {
    expect([...DEFAULT_PRODUCT_CATEGORIES]).toEqual([
      'Pre-Rolls',
      'Flower',
      'Vaporizers',
      'Edible',
      'Concentrate',
    ])
  })

  it('skips products with no id, no name, or no options (never throws)', () => {
    const noId = { Name: 'X', type: 'Flower', Options: ['1g'] }
    const noName = { _id: 'n', type: 'Flower', Options: ['1g'] }
    const noOptions = { _id: 'o', Name: 'O', type: 'Flower', Options: [] }
    expect(transformProducts([page(noId, noName, noOptions)])).toEqual([])
  })

  it('returns [] for no intercepts', () => {
    expect(transformProducts([])).toEqual([])
  })
})

describe('potency (ProductPotency → PotencyRange, spec-potency-extraction)', () => {
  it('maps a two-point range with its verbatim unit', () => {
    expect(potency({ unit: 'PERCENTAGE', range: [21, 22] })).toEqual({
      unit: 'PERCENTAGE',
      low: 21,
      high: 22,
    })
  })

  it('collapses a single-point range to low === high', () => {
    expect(potency({ unit: 'PERCENTAGE', range: [18] })).toEqual({
      unit: 'PERCENTAGE',
      low: 18,
      high: 18,
    })
  })

  it('normalizes a reversed range to min/max', () => {
    expect(potency({ unit: 'PERCENTAGE', range: [22, 21] })).toEqual({
      unit: 'PERCENTAGE',
      low: 21,
      high: 22,
    })
  })

  it('stores a non-percentage unit VERBATIM, never converted', () => {
    expect(potency({ unit: 'MILLIGRAMS', range: [100] })).toEqual({
      unit: 'MILLIGRAMS',
      low: 100,
      high: 100,
    })
  })

  it('is null when the payload field is absent or null', () => {
    expect(potency(null)).toBeNull()
    expect(potency(undefined)).toBeNull()
  })

  it('is null for a valid range WITHOUT a unit — a number stripped of its unit lies', () => {
    expect(potency({ range: [20, 21] })).toBeNull()
    expect(potency({ unit: '  ', range: [20, 21] })).toBeNull()
    expect(potency({ unit: null, range: [20, 21] })).toBeNull()
  })

  it('is null when the range is missing, empty, non-array, or carries a non-finite entry', () => {
    expect(potency({ unit: 'PERCENTAGE' })).toBeNull()
    expect(potency({ unit: 'PERCENTAGE', range: [] })).toBeNull()
    expect(potency({ unit: 'PERCENTAGE', range: '21-22' })).toBeNull()
    expect(potency({ unit: 'PERCENTAGE', range: ['high', null] })).toBeNull()
    expect(potency({ unit: 'PERCENTAGE', range: [21, NaN] })).toBeNull()
  })

  it('trims the stored unit so downstream comparisons cannot split on whitespace', () => {
    expect(potency({ unit: ' PERCENTAGE ', range: [21] })).toEqual({
      unit: 'PERCENTAGE',
      low: 21,
      high: 21,
    })
  })

  it('is null when any range entry is negative — impossible potency under any unit', () => {
    expect(potency({ unit: 'PERCENTAGE', range: [-3] })).toBeNull()
    expect(potency({ unit: 'PERCENTAGE', range: [21, -1] })).toBeNull()
  })
})

describe('effectsMap (spec-potency-extraction)', () => {
  it('keeps finite-valued entries verbatim and drops junk values', () => {
    expect(effectsMap({ relaxed: 9, sleepy: 8, vibe: 'chill', gap: null })).toEqual({
      relaxed: 9,
      sleepy: 8,
    })
  })

  it('is null when absent, non-object, or nothing usable survives', () => {
    expect(effectsMap(null)).toBeNull()
    expect(effectsMap(undefined)).toBeNull()
    expect(effectsMap({})).toBeNull()
    expect(effectsMap({ vibe: 'chill' })).toBeNull()
  })

  it('stores a JSON-sourced __proto__ key instead of silently swallowing it', () => {
    // JSON.parse makes '__proto__' an OWN property; a plain `out[k] =` assignment
    // would invoke the prototype setter and drop the entry without trace.
    const raw = JSON.parse('{"__proto__": 9, "relaxed": 8}') as Record<string, unknown>
    const mapped = effectsMap(raw)!
    expect(Object.getOwnPropertyDescriptor(mapped, '__proto__')?.value).toBe(9)
    expect(mapped.relaxed).toBe(8)
  })
})

describe('transformProducts potency/effects/subcategory extraction', () => {
  it('extracts the live fixture enrichment fields', () => {
    const [prod] = transformProducts([page(fixtureProduct)])
    expect(prod.thc).toEqual({ unit: 'PERCENTAGE', low: 21, high: 22 })
    expect(prod.cbd).toEqual({ unit: 'PERCENTAGE', low: 0.04, high: 0.05 })
    expect(prod.effects).toEqual({ relaxed: 9, painRelief: 7, sleepy: 8, happy: 8, euphoric: 8 })
    expect(prod.subcategory).toBe('singles')
    expect(prod.totalTerpenes).toBeNull() // null in the fixture — stays null, never guessed
  })

  it('degrades every enrichment field to null on a product without them (never throws)', () => {
    const [prod] = transformProducts([page(spaceKush)])
    expect(prod.thc).toBeNull()
    expect(prod.cbd).toBeNull()
    expect(prod.totalTerpenes).toBeNull()
    expect(prod.effects).toBeNull()
    expect(prod.subcategory).toBeNull()
  })

  it('coerces subcategory and totalTerpenes defensively', () => {
    const enriched = { ...spaceKush, subcategory: '  ', totalTerpenes: 1.5 }
    const [prod] = transformProducts([page(enriched)])
    expect(prod.subcategory).toBeNull() // whitespace-only is not a subcategory
    expect(prod.totalTerpenes).toBe(1.5)
  })
})

describe('full pipeline: transform → normalize → merge (AC2, spec-potency-extraction)', () => {
  it('carries fixture potency end-to-end into a merged record with intact history', async () => {
    const { normalizeProduct } = await import('../utils/normalizeProduct.js')
    const { applyProductObservations, getProduct } = await import('../utils/productsStore.js')

    const [rawProd] = transformProducts([page(fixtureProduct)])
    const rec = normalizeProduct(rawProd, 'kushmart-north', '2026-07-03T00:00:00.000Z')

    // Prior committed state: same product, pre-potency schema (fields absent), one observation.
    const { thc: _t, cbd: _c, totalTerpenes: _tt, effects: _e, subcategory: _s, ...prePotency } = {
      ...rec,
      history: [{ ...rec.history[0], observedAt: '2026-07-02T00:00:00.000Z' }],
    }
    const prior = applyProductObservations({ lastUpdated: '', products: {} }, [prePotency], 'T1')

    const merged = applyProductObservations(prior, [rec], 'T2')
    const p = getProduct(merged, 'kushmart-north', rec.productId)!
    expect(p.thc).toEqual({ unit: 'PERCENTAGE', low: 21, high: 22 })
    expect(p.cbd).toEqual({ unit: 'PERCENTAGE', low: 0.04, high: 0.05 })
    expect(p.subcategory).toBe('singles')
    expect(p.history).toHaveLength(2) // prior observation preserved, new one appended
  })
})

describe('scrapeDutchieProducts (retry-on-empty, CAP-1/CAP-3)', () => {
  const EMPTY: Intercepted[] = [page()] // FilteredProducts present, zero products

  function queuedPost(batches: Intercepted[][]) {
    const calls = { n: 0 }
    const postFn = async () => {
      const batch = batches[Math.min(calls.n, batches.length - 1)]
      calls.n++
      return batch
    }
    return { postFn, calls }
  }

  it('returns products on the first non-empty attempt without retrying', async () => {
    const { postFn, calls } = queuedPost([[page(spaceKush)]])
    const products = await scrapeDutchieProducts('store-x', { postFn })
    expect(products).toHaveLength(1)
    expect(calls.n).toBe(1)
  })

  it('retries past empty captures until the menu populates', async () => {
    const { postFn, calls } = queuedPost([EMPTY, EMPTY, [page(spaceKush)]])
    const products = await scrapeDutchieProducts('store-x', { postFn })
    expect(products).toHaveLength(1)
    expect(calls.n).toBe(3)
  })

  it('returns [] after exhausting attempts on an empty menu', async () => {
    const { postFn, calls } = queuedPost([EMPTY])
    const products = await scrapeDutchieProducts('store-x', { postFn, attempts: 3 })
    expect(products).toEqual([])
    expect(calls.n).toBe(3)
  })

  it('treats a thrown attempt as empty and keeps retrying', async () => {
    let n = 0
    const postFn = async () => {
      n++
      if (n === 1) throw new Error('service unreachable')
      return [page(spaceKush)]
    }
    const products = await scrapeDutchieProducts('store-x', { postFn })
    expect(products).toHaveLength(1)
    expect(n).toBe(2)
  })

  it('forwards its category scope into the paginate walk request', async () => {
    let seen: string[] | undefined
    const postFn = async (req: { paginate?: { types: string[] } }) => {
      seen = req.paginate?.types
      return [page(spaceKush)]
    }
    await scrapeDutchieProducts('store-x', {
      postFn: postFn as unknown as typeof import('../utils/scraperClient.js').postScrape,
      categories: ['Flower', 'Concentrate'],
    })
    expect(seen).toEqual(['Flower', 'Concentrate'])
  })
})
