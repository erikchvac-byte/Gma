import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Intercepted } from '../utils/scraperClient.js'
import {
  DEFAULT_PRODUCT_CATEGORIES,
  dutchieProductsRequest,
  pickProducts,
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

  it('drops out-of-launch-scope categories (Edible / Concentrate)', () => {
    const edible = { _id: 'e1', Name: 'Gummies', type: 'Edible', Options: ['10mg'] }
    const concentrate = { _id: 'c1', Name: 'Wax', type: 'Concentrate', Options: ['1g'] }
    expect(transformProducts([page(edible, concentrate)])).toEqual([])
  })

  it('keeps exactly the three launch categories', () => {
    expect([...DEFAULT_PRODUCT_CATEGORIES]).toEqual(['Pre-Rolls', 'Flower', 'Vaporizers'])
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
})
