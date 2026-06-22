import { describe, it, expect } from 'vitest'
import { filterByType, storeUrgencyBadge, discountTier, stripDiscountPrefix } from './dealView'
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

describe('filterByType', () => {
  const stores = [
    makeDispensary('a', [
      makeDeal({ type: 'happy_hour', description: 'hh' }),
      makeDeal({ type: 'daily', description: 'd' }),
    ]),
    makeDispensary('b', [makeDeal({ type: 'daily', description: 'only daily' })]),
  ]

  it('returns the same array reference for "all" (pure passthrough)', () => {
    expect(filterByType(stores, 'all')).toBe(stores)
  })

  it('keeps only happy_hour deals and leaves daily-only stores empty', () => {
    const result = filterByType(stores, 'happy_hour')
    expect(result[0].deals.map((d) => d.description)).toEqual(['hh'])
    // store b has no happy hours → emptied (drops out at grouping time)
    expect(result[1].deals).toEqual([])
  })

  it('keeps only daily deals', () => {
    const result = filterByType(stores, 'daily')
    expect(result[0].deals.map((d) => d.description)).toEqual(['d'])
    expect(result[1].deals.map((d) => d.description)).toEqual(['only daily'])
  })

  it('does not mutate the input dispensaries', () => {
    filterByType(stores, 'happy_hour')
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
  // only the remainder
  it.each([
    ['10% off Select Brands', 'Select Brands'],
    ['25% off Select Brands', 'Select Brands'],
    ['50% off Select Brands', 'Select Brands'],
  ])('strips the leading percent-off phrase for any N (%s)', (input, expected) => {
    expect(stripDiscountPrefix(input)).toBe(expected)
  })

  // case-insensitive: live data uses Off/OFF while the badge renders "off". A
  // case-sensitive match would silently no-op on real descriptions.
  it.each([
    ['15% off Edibles + Drinks (Excluding Capsules)', 'Edibles + Drinks (Excluding Capsules)'],
    ['15% Off Edibles + Drinks (Excluding Capsules)', 'Edibles + Drinks (Excluding Capsules)'],
    ['15% OFF Edibles + Drinks (Excluding Capsules)', 'Edibles + Drinks (Excluding Capsules)'],
  ])('matches "off" regardless of casing (%s)', (input, expected) => {
    expect(stripDiscountPrefix(input)).toBe(expected)
  })

  it('consumes the whole phrase — no dangling "Off", no leading space', () => {
    const result = stripDiscountPrefix('15% Off Edibles + Drinks (Excluding Capsules)')
    expect(result).toBe('Edibles + Drinks (Excluding Capsules)')
    expect(result.startsWith('Off')).toBe(false)
    expect(result.startsWith(' ')).toBe(false)
  })

  it('also consumes a trailing separator after the phrase', () => {
    expect(stripDiscountPrefix('30% off · Premium Flower')).toBe('Premium Flower')
    expect(stripDiscountPrefix('30% off - Premium Flower')).toBe('Premium Flower')
  })

  it('leaves a description without a leading percent-off phrase unchanged', () => {
    expect(stripDiscountPrefix('Select Brands')).toBe('Select Brands')
    expect(stripDiscountPrefix('Buy one get one')).toBe('Buy one get one')
    // "$5 off" is a non-percent prefix (deferred) — nothing to dedupe, left intact
    expect(stripDiscountPrefix('$5 off edibles')).toBe('$5 off edibles')
    // "Offers" must not be mistaken for the "off" token
    expect(stripDiscountPrefix('15% Offers inside')).toBe('15% Offers inside')
  })

  it('returns an empty string when the description is nothing but the phrase', () => {
    // caller (dealTitle) treats this as "fall back to the kind label", never a
    // blank title
    expect(stripDiscountPrefix('50% off')).toBe('')
    expect(stripDiscountPrefix('50% OFF')).toBe('')
  })

  it('does not mutate or depend on anything beyond the passed string', () => {
    const input = '50% off Select Brands'
    stripDiscountPrefix(input)
    expect(input).toBe('50% off Select Brands')
  })
})
