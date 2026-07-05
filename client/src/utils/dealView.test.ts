import { describe, it, expect } from 'vitest'
import {
  dealCategories,
  categoriesPresent,
  filterByCategory,
  storeUrgencyBadge,
  discountTier,
  stripDiscountPrefix,
  stripCrossLocationTag,
  resolveLayeredSale,
  buildDealBlocks,
  areDealsExpired,
  DEAL_EXPIRY_MS,
  type DealView,
} from './dealView'
import type { Deal, Dispensary } from '../types'

const makeDeal = (overrides: Partial<Deal>): Deal => ({
  type: 'daily',
  description: 'A deal',
  discountPct: 10,
  startTime: null,
  endTime: null,
  daysValid: ['everyday'],
  ...overrides,
})

const makeDispensary = (id: string, deals: Deal[]): Dispensary => ({
  id,
  name: `Dispensary ${id}`,
  url: `https://example.com/${id}`,
  distanceMiles: 5,
  stale: false,
  lastFetchedAt: '2026-06-10T07:00:00',
  deals,
})

describe('dealCategories', () => {
  it('maps a deal to its card-glyph categories via the same matcher', () => {
    expect(dealCategories(makeDeal({ description: '20% off vapes and edibles' }))).toEqual([
      'vape',
      'edible',
    ])
  })

  it('collapses every pre-roll pack variant into joint-single', () => {
    expect(dealCategories(makeDeal({ description: '2-pack joints' }))).toEqual(['joint-single'])
    expect(dealCategories(makeDeal({ description: 'triple pre-rolls' }))).toEqual(['joint-single'])
    expect(dealCategories(makeDeal({ description: 'joints' }))).toEqual(['joint-single'])
  })

  it('uses the layered-sale tier subject, matching buildDealBlocks icons', () => {
    expect(
      dealCategories(makeDeal({ description: 'Up to 50% Off Sale - 40% Off Vape Brands' })),
    ).toEqual(['vape'])
  })

  it('returns nothing for a blank description (no icon → no category)', () => {
    expect(dealCategories(makeDeal({ description: '' }))).toEqual([])
  })
})

describe('categoriesPresent', () => {
  it('collects categories across all stores in canonical bar order', () => {
    const stores = [
      makeDispensary('a', [makeDeal({ description: '10% off edibles' })]),
      makeDispensary('b', [makeDeal({ description: '20% off flower and vapes' })]),
    ]
    // bud < vape < edible in CATEGORY_ORDER, regardless of store order
    expect(categoriesPresent(stores)).toEqual(['bud', 'vape', 'edible'])
  })

  it('lists a category once no matter how many deals carry it', () => {
    const stores = [
      makeDispensary('a', [
        makeDeal({ description: '10% off gummies' }),
        makeDeal({ description: '15% off chocolates' }),
      ]),
    ]
    expect(categoriesPresent(stores)).toEqual(['edible'])
  })

  it('returns empty for stores whose deals carry no icons', () => {
    expect(categoriesPresent([makeDispensary('a', [makeDeal({ description: '' })])])).toEqual([])
  })
})

describe('filterByCategory', () => {
  const stores = [
    makeDispensary('a', [
      makeDeal({ description: '20% off vapes' }),
      makeDeal({ description: '10% off gummies' }),
    ]),
    makeDispensary('b', [makeDeal({ description: '30% off flower' })]),
  ]

  it('returns the same array reference for null (pure passthrough)', () => {
    expect(filterByCategory(stores, null)).toBe(stores)
  })

  it('keeps only matching deals and leaves non-carrying stores empty', () => {
    const result = filterByCategory(stores, 'vape')
    expect(result[0].deals.map((d) => d.description)).toEqual(['20% off vapes'])
    // store b has no vape deals → emptied (drops out at grouping time)
    expect(result[1].deals).toEqual([])
  })

  it('matches any pack variant under the collapsed pre-roll category', () => {
    const prStores = [makeDispensary('a', [makeDeal({ description: '25% off 3-pack pre-rolls' })])]
    expect(filterByCategory(prStores, 'joint-single')[0].deals).toHaveLength(1)
  })

  it('does not mutate the input dispensaries', () => {
    filterByCategory(stores, 'vape')
    expect(stores[0].deals).toHaveLength(2)
  })
})

describe('storeUrgencyBadge', () => {
  it('reports the first live countdown as an urgent badge (deals pre-sorted)', () => {
    expect(
      storeUrgencyBadge([{ countdown: '0:42' }, { countdown: '2:00' }, { countdown: null }]),
    ).toEqual({ variant: 'urgent', text: 'ends in 0:42' })
  })

  it('falls back to a neutral "active today" badge when no deal has a countdown', () => {
    expect(storeUrgencyBadge([{ countdown: null }, { countdown: null }])).toEqual({
      variant: 'neutral',
      text: 'active today',
    })
  })

  it('treats an all-day happy hour (no countdown) as "active today"', () => {
    expect(storeUrgencyBadge([{ countdown: null }])).toEqual({
      variant: 'neutral',
      text: 'active today',
    })
  })
})

describe('discountTier', () => {
  it.each([null, NaN, Infinity, -5, 0])(
    'returns null for %s (renders no figure)',
    (pct) => {
      expect(discountTier(pct)).toBeNull()
    },
  )

  it.each([
    [30, 'high'],
    [55, 'high'],
    [29, 'mid'],
    [15, 'mid'],
    [14, 'low'],
    [1, 'low'],
  ])('buckets %i as %s', (pct, tier) => {
    expect(discountTier(pct)).toBe(tier)
  })
})

describe('stripDiscountPrefix', () => {
  // any N, not a hardcoded 50 — the badge shows the figure, the title carries
  // only the remainder. Second arg is the badge's exact discountPct.
  it.each([
    ['10% off Select Brands', 10, 'Select Brands'],
    ['25% off Select Brands', 25, 'Select Brands'],
    ['50% off Select Brands', 50, 'Select Brands'],
  ])('strips the leading percent-off phrase for any N (%s)', (input, pct, expected) => {
    expect(stripDiscountPrefix(input, pct)).toBe(expected)
  })

  // case-insensitive: live data uses Off/OFF while the badge renders "off". A
  // case-sensitive match would silently no-op on real descriptions.
  it.each([
    ['15% off Edibles + Drinks (Excluding Capsules)', 'Edibles + Drinks (Excluding Capsules)'],
    ['15% Off Edibles + Drinks (Excluding Capsules)', 'Edibles + Drinks (Excluding Capsules)'],
    ['15% OFF Edibles + Drinks (Excluding Capsules)', 'Edibles + Drinks (Excluding Capsules)'],
  ])('matches "off" regardless of casing (%s)', (input, expected) => {
    expect(stripDiscountPrefix(input, 15)).toBe(expected)
  })

  // generalized past the start anchor: the badge magnitude is stripped wherever
  // it sits — behind a sale banner, a brand/day prefix, or at the very end.
  it.each([
    ['JUNE 2026 SUMMER SALE 30% Off Flower PULLMAN', 30, 'JUNE 2026 SUMMER SALE Flower PULLMAN'],
    ['STOREWIDE 30% OFF', 30, 'STOREWIDE'],
    ['Dabstract - 50% off', 50, 'Dabstract'],
    ['2026 40% Off Ounces', 40, '2026 Ounces'],
  ])('strips the badge magnitude mid/trailing and cleans the seam (%s)', (input, pct, expected) => {
    expect(stripDiscountPrefix(input, pct)).toBe(expected)
  })

  // real rows carry the figure without an "off" yet still derive a discountPct
  it.each([
    ['40% ONLINE ORDERS', 40, 'ONLINE ORDERS'],
    ['JUNE 2026 SUMMER SALE 20% ALL Pre-Rolls PULLMAN', 20, 'JUNE 2026 SUMMER SALE ALL Pre-Rolls PULLMAN'],
  ])('treats "off" as optional (%s)', (input, pct, expected) => {
    expect(stripDiscountPrefix(input, pct)).toBe(expected)
  })

  // multi-tier guard: 2+ percent figures → a layered sale; stripping mangles it
  // ("Up to Sale - Brands"), so the whole title is kept verbatim.
  it.each([
    ['Up to 50% Off Sale - 50% Off Brands', 50],
    ['Up to 50% Off Sale - 40% Off Brands', 50],
  ])('keeps a multi-tier title whole (%s)', (input, pct) => {
    expect(stripDiscountPrefix(input, pct)).toBe(input)
  })

  // single-figure titles whose qualifier governs the magnitude: stripping would
  // orphan the lead-in ("Up to Sale"), so the whole title is kept (review patch).
  it.each([
    ['Up to 50% Off Sale', 50],
    ['Save 20% off, 2026 deals', 20],
    ['Get 30% off everything', 30],
  ])('keeps a title whole when stripping would orphan a governing qualifier (%s)', (input, pct) => {
    expect(stripDiscountPrefix(input, pct)).toBe(input)
  })

  it('no-ops on a non-finite pct instead of building a nonsense pattern', () => {
    expect(stripDiscountPrefix('50% off Select Brands', NaN)).toBe('50% off Select Brands')
  })

  it('leaves a *different* percentage than the badge untouched', () => {
    // badge shows 50% off; the 30% is a THC figure, not the discount → no-op
    expect(stripDiscountPrefix('Contains 30% THC blend', 50)).toBe('Contains 30% THC blend')
  })

  it('leaves a description with no percentage unchanged (no stutter to remove)', () => {
    expect(stripDiscountPrefix('Join the Joint: Savings!', 20)).toBe('Join the Joint: Savings!')
    expect(stripDiscountPrefix('Select Brands', 25)).toBe('Select Brands')
    // "$5 off" is a non-percent prefix (deferred) — nothing to dedupe, left intact
    expect(stripDiscountPrefix('$5 off edibles', 50)).toBe('$5 off edibles')
  })

  it('does not let the badge number bite into a larger number ("5" vs "45%")', () => {
    expect(stripDiscountPrefix('45% off Select Products', 5)).toBe('45% off Select Products')
  })

  it('returns an empty string when the description is nothing but the phrase', () => {
    // caller (dealTitle) treats this as "fall back to the kind label", never a
    // blank title
    expect(stripDiscountPrefix('50% off', 50)).toBe('')
    expect(stripDiscountPrefix('50% OFF', 50)).toBe('')
  })

  it('does not mutate or depend on anything beyond the passed string', () => {
    const input = '50% off Select Brands'
    stripDiscountPrefix(input, 50)
    expect(input).toBe('50% off Select Brands')
  })
})

describe('stripCrossLocationTag', () => {
  // the real Happy Time / Mount Vernon descriptions (post percent-strip) — the
  // trailing "PULLMAN" tag the dispensary baked into its shared promo titles
  it.each([
    ['JUNE 2026 SUMMER SALE Flower PULLMAN', 'JUNE 2026 SUMMER SALE Flower'],
    ['JUNE 2026 SUMMER SALE ALL Pre-Rolls PULLMAN', 'JUNE 2026 SUMMER SALE ALL Pre-Rolls'],
    ['MAY 2026 MEMORIAL DAY SALE Concentrates PULLMAN', 'MAY 2026 MEMORIAL DAY SALE Concentrates'],
  ])('drops the trailing cross-location tag and cleans the seam (%s)', (input, expected) => {
    expect(stripCrossLocationTag(input)).toBe(expected)
  })

  // case-insensitive: a chain may type it any way; all forms must be caught
  it.each([
    ['Flower PULLMAN', 'Flower'],
    ['Flower Pullman', 'Flower'],
    ['Flower pullman', 'Flower'],
  ])('matches the tag regardless of casing (%s)', (input, expected) => {
    expect(stripCrossLocationTag(input)).toBe(expected)
  })

  it('only strips the tag at the END of the title, never mid-string', () => {
    // a (hypothetical) mid-title occurrence is left intact — trailing-only by design
    expect(stripCrossLocationTag('PULLMAN exclusive Flower')).toBe('PULLMAN exclusive Flower')
  })

  it('whole-word only: a longer word merely ending in the tag is untouched', () => {
    expect(stripCrossLocationTag('Flower SPULLMAN')).toBe('Flower SPULLMAN')
  })

  it('leaves a title with no cross-location tag unchanged', () => {
    expect(stripCrossLocationTag('JUNE 2026 SUMMER SALE Flower')).toBe('JUNE 2026 SUMMER SALE Flower')
    expect(stripCrossLocationTag('Daily special')).toBe('Daily special')
  })

  it('returns an empty string when the title is nothing but the tag', () => {
    // caller (dealTitle) treats this as "fall back to the kind label"
    expect(stripCrossLocationTag('PULLMAN')).toBe('')
    expect(stripCrossLocationTag('  PULLMAN  ')).toBe('')
  })

  it('does not mutate the passed string', () => {
    const input = 'Flower PULLMAN'
    stripCrossLocationTag(input)
    expect(input).toBe('Flower PULLMAN')
  })
})

describe('resolveLayeredSale', () => {
  // the real KushMart / Local Roots / Kushman's tier strings — badge the TIER
  // figure (Y, bound to the product), title the subject only
  it.each([
    ['Up to 50% Off Sale - 50% Off Brands', 50, 'Brands'],
    ['Up to 50% Off Sale - 40% Off Brands', 40, 'Brands'],
    ['Up to 50% Off Sale - 30% Off Brands', 30, 'Brands'],
  ])('resolves the tier figure + subject (%s)', (input, pct, title) => {
    expect(resolveLayeredSale(input)).toEqual({ pct, title })
  })

  it('matches the en/em-dash separator forms too', () => {
    expect(resolveLayeredSale('Up to 50% Off Sale – 40% Off Brands')).toEqual({ pct: 40, title: 'Brands' })
    expect(resolveLayeredSale('Up to 50% Off Sale — 30% Off Edibles')).toEqual({ pct: 30, title: 'Edibles' })
  })

  it('is case-insensitive on the headline/tier copy', () => {
    expect(resolveLayeredSale('UP TO 50% OFF SALE - 40% OFF BRANDS')).toEqual({ pct: 40, title: 'BRANDS' })
  })

  it.each([
    'Dabstract - 50% off',
    '40% Off Cookies Vapes June 2026',
    '50% off - Evergreen Ounces',
    'Up to 50% Off Sale', // no tier clause → not this pattern
    'JUNE 2026 SUMMER SALE 30% Off Flower',
    '',
  ])('returns null for non-layered titles (%s)', (input) => {
    expect(resolveLayeredSale(input)).toBeNull()
  })

  it('returns null on null/undefined input', () => {
    expect(resolveLayeredSale(null)).toBeNull()
    expect(resolveLayeredSale(undefined)).toBeNull()
  })
})

describe('buildDealBlocks', () => {
  const daily = (description: string, discountPct: number | null): DealView => ({
    deal: makeDeal({ type: 'daily', description, discountPct, startTime: null, endTime: null }),
    windowText: 'Active today',
    countdown: null,
  })

  it('collapses same-title daily tiers into one "min–max%" block (Silvana)', () => {
    const blocks = buildDealBlocks([
      daily('45% off Select Products', 45),
      daily('40% Off Select Products', 40),
      daily('35% Off Select Products', 35),
      daily('25% Off Select Products', 25),
      daily('20% Off All Cannabis Items', 20),
    ])
    // four "Select Products" tiers → one block; "All Cannabis Items" → its own
    expect(blocks).toHaveLength(2)
    expect(blocks[0].title).toBe('Select Products')
    expect(blocks[0].pctLabel).toBe('25–45%')
    expect(blocks[0].tier).toBe('high') // ramp follows the max (45)
    expect(blocks[1].title).toBe('All Cannabis Items')
    expect(blocks[1].pctLabel).toBe('20%')
  })

  it('shows a plain "N%" for a lone tier (no range)', () => {
    const blocks = buildDealBlocks([daily('40% Off Your Entire Order!', 40)])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].pctLabel).toBe('40%')
  })

  it('dedupes exact-duplicate tiers to a single "N%" block', () => {
    const blocks = buildDealBlocks([
      daily('25% Off Select Products', 25),
      daily('25% Off Select Products', 25),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].pctLabel).toBe('25%')
  })

  it('does NOT merge deals with different titles', () => {
    const blocks = buildDealBlocks([
      daily('30% Off Flower', 30),
      daily('30% Off Edibles', 30),
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks.map((b) => b.title)).toEqual(['Flower', 'Edibles'])
  })

  it('collapses layered "…- Y% Off Brands" tiers into one Brands range block', () => {
    const blocks = buildDealBlocks([
      daily('Up to 50% Off Sale - 50% Off Brands', 50),
      daily('Up to 50% Off Sale - 40% Off Brands', 50),
      daily('Up to 50% Off Sale - 30% Off Brands', 50),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].title).toBe('Brands')
    expect(blocks[0].pctLabel).toBe('30–50%')
  })

  it('does not merge a daily and a happy hour that share a title (meta differs)', () => {
    const blocks = buildDealBlocks([
      daily('20% Off Storewide', 20),
      {
        deal: makeDeal({ type: 'happy_hour', description: '20% Off Storewide', discountPct: 20, startTime: '07:00', endTime: '08:00' }),
        windowText: '7:00 AM – 8:00 AM',
        countdown: null,
      },
    ])
    expect(blocks).toHaveLength(2)
  })

  it('renders no figure (pctLabel null) when the group has no parseable discount', () => {
    const blocks = buildDealBlocks([daily('Mystery deal', null)])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].pctLabel).toBeNull()
    expect(blocks[0].tier).toBeNull()
  })

  it('carries item icons derived from the (shared) subject text', () => {
    const blocks = buildDealBlocks([
      daily('45% Off Flower', 45),
      daily('25% Off Flower', 25),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].icons.length).toBeGreaterThan(0)
  })

  it('flags a BOGO: no percent badge, and the title KEEPS its percent text', () => {
    const bogo: DealView = {
      deal: makeDeal({
        type: 'daily',
        description: '40% Off Online Orders Sun,Tues,Thurs Min $80',
        discountPct: 40,
        specialType: 'bogo',
      }),
      windowText: 'Active today',
      countdown: null,
    }
    const [block] = buildDealBlocks([bogo])
    expect(block.isBogo).toBe(true)
    expect(block.pctLabel).toBeNull() // numeric badge suppressed → "BOGO" renders instead
    expect(block.tier).toBeNull()
    // percent stays in the title since the badge no longer shows it
    expect(block.title).toBe('40% Off Online Orders Sun,Tues,Thurs Min $80')
  })

  it('does not collapse a BOGO into a same-titled flat sale', () => {
    const mk = (specialType?: string): DealView => ({
      deal: makeDeal({ type: 'daily', description: '40% Off Storewide', discountPct: 40, specialType }),
      windowText: 'Active today',
      countdown: null,
    })
    const blocks = buildDealBlocks([mk('bogo'), mk(undefined)])
    expect(blocks).toHaveLength(2)
    expect(blocks.some((b) => b.isBogo)).toBe(true)
    expect(blocks.some((b) => !b.isBogo)).toBe(true)
  })

  it('non-BOGO blocks report isBogo false', () => {
    const [block] = buildDealBlocks([daily('40% Off Your Entire Order!', 40)])
    expect(block.isBogo).toBe(false)
  })
})

// CAP-1: display-only store-level expiry derived from lastFetchedAt. The three
// required cases (just-inside kept, just-outside expired, never-ingested expired)
// plus the boundary, malformed, and clock-skew rows from the spec's I/O matrix.
describe('areDealsExpired', () => {
  const now = new Date('2026-07-02T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  it('keeps a store just INSIDE the threshold (age = 24h − 1min)', () => {
    expect(areDealsExpired(ago(DEAL_EXPIRY_MS - 60_000), now)).toBe(false)
  })

  it('expires a store just OUTSIDE the threshold (age = 24h + 1min)', () => {
    expect(areDealsExpired(ago(DEAL_EXPIRY_MS + 60_000), now)).toBe(true)
  })

  it('expires a never-ingested store (missing/empty/non-string timestamp)', () => {
    expect(areDealsExpired('', now)).toBe(true)
    expect(areDealsExpired(undefined, now)).toBe(true)
    expect(areDealsExpired(null, now)).toBe(true)
    expect(areDealsExpired(12345, now)).toBe(true)
  })

  it('keeps a store EXACTLY at the threshold (inclusive-kept, mirrors deriveStoreStatus)', () => {
    expect(areDealsExpired(ago(DEAL_EXPIRY_MS), now)).toBe(false)
  })

  it('expires a malformed (unparseable) timestamp — fail-open', () => {
    expect(areDealsExpired('not-a-date', now)).toBe(true)
  })

  it('keeps a future timestamp (clock skew) — treated as fresh', () => {
    expect(areDealsExpired(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(false)
  })

  it('DEAL_EXPIRY_MS is 24h and independent of the 3h freshness window', () => {
    expect(DEAL_EXPIRY_MS).toBe(24 * 60 * 60 * 1000)
  })
})
