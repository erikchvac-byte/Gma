import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  extractMenuItems,
  transformWeedmapsProducts,
  normalizeCategory,
  brandFromSlug,
  fetchWeedmapsMenu,
} from './_weedmaps.js'
import { normalizeProduct } from '../utils/normalizeProduct.js'
import { deriveMatchKey } from '../utils/productMatchKey.js'
import type { RawProduct } from '../types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The fixture is the real captured __NEXT_DATA__ JSON object (provenance: live no-browser
// fetch of western-bud-skagit-valley-wa 2026-06-28, weedmaps-source-data-inventory.md) plus
// a few confirmed cross-store items from the same inventory/findings — wrapped here in the
// page's <script id="__NEXT_DATA__"> tag exactly as the live HTML carries it.
const fixtureJson = readFileSync(
  path.join(__dirname, '__fixtures__', 'weedmaps-western-bud.json'),
  'utf-8',
)
const fixtureHtml = `<!doctype html><html><body><div id="root"></div><script id="__NEXT_DATA__" type="application/json">${fixtureJson}</script></body></html>`

function items() {
  return extractMenuItems(fixtureHtml)
}

describe('extractMenuItems (__NEXT_DATA__ → menuItems[])', () => {
  it('extracts every menuItems object across all dehydrated queries', () => {
    expect(items()).toHaveLength(5) // 3 in query 1 + 2 in query 2 (incl. the edible)
  })

  it('degrades to [] when no __NEXT_DATA__ script is present (e.g. a bot-challenge page)', () => {
    expect(extractMenuItems('<html><body>Access Denied</body></html>')).toEqual([])
  })

  it('degrades to [] on an unparseable / empty blob', () => {
    expect(
      extractMenuItems('<script id="__NEXT_DATA__">{not valid json}</script>'),
    ).toEqual([])
    expect(extractMenuItems('')).toEqual([])
  })

  it('degrades to [] when the menuItems path is absent', () => {
    expect(
      extractMenuItems('<script id="__NEXT_DATA__">{"props":{}}</script>'),
    ).toEqual([])
  })
})

describe('normalizeCategory (Weedmaps edgeCategory → Dutchie vocabulary, AC3)', () => {
  it('maps a Flower ancestor (sub "Big Buds") to Flower', () => {
    expect(normalizeCategory({ name: 'Big Buds', slug: 'big-buds', ancestors: [{ name: 'Flower', slug: 'flower' }] })).toBe('Flower')
  })
  it('maps a Pre-Roll ancestor to Pre-Rolls (before Flower)', () => {
    expect(normalizeCategory({ name: 'Joints', slug: 'joints', ancestors: [{ name: 'Pre-Roll', slug: 'pre-roll' }] })).toBe('Pre-Rolls')
  })
  it('maps a Vape/Cartridge ancestor to Vaporizers', () => {
    expect(normalizeCategory({ name: 'Cartridges', slug: 'cartridges', ancestors: [{ name: 'Vape', slug: 'vape-pens' }] })).toBe('Vaporizers')
  })
  it('returns null for out-of-vocab (Edibles) and for empty', () => {
    expect(normalizeCategory({ name: 'Gummies', slug: 'gummies', ancestors: [{ name: 'Edibles', slug: 'edibles' }] })).toBeNull()
    expect(normalizeCategory(undefined)).toBeNull()
  })
})

describe('brandFromSlug (conservative slug recovery, Open Q4)', () => {
  it('recovers the brand prefix before the category token', () => {
    expect(brandFromSlug('phat-panda-flower-golden-pineapple-burl-ec6ed95b', 'flower')).toBe('Phat Panda')
  })
  it('returns null when the category token is absent (not confident)', () => {
    expect(brandFromSlug('golden-pineapple-burl', 'flower')).toBeNull()
  })
  it('returns null when there is no prefix before the category token', () => {
    expect(brandFromSlug('flower-golden-pineapple', 'flower')).toBeNull()
  })
  it('returns null for an empty slug or missing category token', () => {
    expect(brandFromSlug('', 'flower')).toBeNull()
    expect(brandFromSlug('phat-panda-flower-x', null)).toBeNull()
  })
})

describe('transformWeedmapsProducts (menuItems → RawProduct, AC2)', () => {
  const products = transformWeedmapsProducts(items())
  const byName = (n: string) => products.find((p) => p.name === n)

  it('drops out-of-vocab products (the WYLD edible)', () => {
    expect(byName('Marionberry Gummies')).toBeUndefined()
    expect(products).toHaveLength(4) // golden pineapple, og chem, galactic glue, limonada
  })

  it('strips the "| Sub-Category" suffix down to the strain name', () => {
    expect(byName('Golden Pineapple')).toBeDefined()
    expect(byName('OG Chem')).toBeDefined()
  })

  it('recovers brand from the slug when JSON brand is null', () => {
    expect(byName('Golden Pineapple')?.brand).toBe('Phat Panda')
    expect(byName('OG Chem')?.brand).toBe('Phat Panda')
  })

  it('uses the JSON brand field when present (no slug guess)', () => {
    expect(byName('Galactic Glue')?.brand).toBe('Artizen Cannabis')
  })

  it('maps strain type from the (mislabeled) Weedmaps category field', () => {
    expect(byName('Golden Pineapple')?.strainType).toBe('Indica')
    expect(byName('OG Chem')?.strainType).toBe('Hybrid')
  })

  it('maps every weight tier to an option (base = originalPrice, no sale → special null)', () => {
    expect(byName('Golden Pineapple')?.options).toEqual([
      { option: '1/8 oz', basePrice: 50, specialPrice: null, quantityAvailable: null },
    ])
  })

  it('maps an on-sale tier to specialPrice and flags the product special', () => {
    const ogChem = byName('OG Chem')!
    expect(ogChem.special).toBe(true)
    expect(ogChem.options).toEqual([
      { option: '2g', basePrice: 14, specialPrice: 8.4, quantityAvailable: null },
    ])
  })

  it('keeps multiple tiers per product (Galactic Glue 1g + 1oz)', () => {
    expect(byName('Galactic Glue')?.options.map((o) => o.option)).toEqual(['1g', '1 oz'])
  })

  it('returns [] for a non-array input (never throws)', () => {
    // @ts-expect-error deliberately wrong input
    expect(transformWeedmapsProducts(null)).toEqual([])
  })
})

describe('cross-source match-key equality (AC3 — the wiring proof)', () => {
  it('a Weedmaps and a Dutchie OG Chem produce the SAME deriveMatchKey', () => {
    const now = '2026-06-29T00:00:00.000Z'
    const wmRaw = transformWeedmapsProducts(items()).find((p) => p.name === 'OG Chem')!
    const dutchieRaw: RawProduct = {
      productId: 'dutchie-og-chem',
      name: 'OG Chem',
      category: 'Flower',
      brand: 'Phat Panda',
      strainType: 'Hybrid',
      special: false,
      weightField: null,
      netWeightMg: null,
      thc: null,
      cbd: null,
      totalTerpenes: null,
      effects: null,
      subcategory: null,
      options: [{ option: '2g', basePrice: 14, specialPrice: null, quantityAvailable: 6 }],
    }
    const wmKey = deriveMatchKey(normalizeProduct(wmRaw, 'western-bud-burlington', now))
    const dKey = deriveMatchKey(normalizeProduct(dutchieRaw, 'kushmart-north', now))
    expect('key' in wmKey && 'key' in dKey).toBe(true)
    expect(wmKey).toEqual(dKey)
  })
})

describe('fetchWeedmapsMenu (throttled static GET, injected, fail-soft)', () => {
  it('parses the landing page and returns mapped products', async () => {
    const getFn = async () => ({ data: fixtureHtml })
    const products = await fetchWeedmapsMenu('western-bud-skagit-valley-wa', {
      getFn,
      categorySlugs: [],
    })
    expect(products.length).toBe(4)
  })

  it('dedupes products across landing + category subpages (by productId)', async () => {
    const getFn = async () => ({ data: fixtureHtml })
    const products = await fetchWeedmapsMenu('western-bud-skagit-valley-wa', {
      getFn,
      categorySlugs: ['flower'], // same fixture served twice → still 4 unique
    })
    expect(products.length).toBe(4)
  })

  it('degrades to [] when every page throws (network/challenge), never throws', async () => {
    const getFn = async () => {
      throw new Error('403 / PerimeterX')
    }
    await expect(
      fetchWeedmapsMenu('blocked-store', { getFn, categorySlugs: [] }),
    ).resolves.toEqual([])
  })

  it('keeps the products from pages that succeed when one page fails', async () => {
    let n = 0
    const getFn = async () => {
      n++
      if (n === 1) throw new Error('landing timeout')
      return { data: fixtureHtml }
    }
    const products = await fetchWeedmapsMenu('partial', { getFn, categorySlugs: ['flower'] })
    expect(products.length).toBe(4)
  })
})
