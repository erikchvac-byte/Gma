import { describe, it, expect } from 'vitest'
import { filterByType, storeUrgencyBadge, discountTier } from './dealView'
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
