import { describe, it, expect } from 'vitest'
import { sortDeals, groupDealsByStore } from './sortDeals'
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

const makeDispensary = (id: string, deals: Deal[], distanceMiles = 5): Dispensary => ({
  id,
  name: `Dispensary ${id}`,
  url: `https://example.com/${id}`,
  distanceMiles,
  stale: false,
  lastFetchedAt: '2026-06-10T07:00:00Z',
  deals,
})

// fixed clock: 23:00 local time
const at2300 = new Date(2026, 5, 10, 23, 0)

describe('sortDeals', () => {
  it('sorts active happy hours by minutes-until-end, soonest first', () => {
    const dispensaries = [
      makeDispensary('a', [
        makeDeal({ type: 'happy_hour', description: 'ends 23:45', startTime: '20:00', endTime: '23:45' }),
        makeDeal({ type: 'happy_hour', description: 'ends 23:30', startTime: '20:00', endTime: '23:30' }),
      ]),
    ]

    const rows = sortDeals(dispensaries, at2300)
    expect(rows.map((r) => r.deal.description)).toEqual(['ends 23:30', 'ends 23:45'])
  })

  it('wraps overnight windows past midnight (23:30 beats 02:00 at 23:00)', () => {
    const dispensaries = [
      makeDispensary('a', [
        makeDeal({ type: 'happy_hour', description: 'overnight to 02:00', startTime: '22:00', endTime: '02:00' }),
        makeDeal({ type: 'happy_hour', description: 'ends 23:30', startTime: '20:00', endTime: '23:30' }),
      ]),
    ]

    const rows = sortDeals(dispensaries, at2300)
    expect(rows.map((r) => r.deal.description)).toEqual(['ends 23:30', 'overnight to 02:00'])
  })

  it('places null-window happy hours after timed ones and before daily deals', () => {
    const dispensaries = [
      makeDispensary('a', [
        makeDeal({ type: 'daily', description: 'daily 50', discountPct: 50 }),
        makeDeal({ type: 'happy_hour', description: 'all-day HH', startTime: null, endTime: null }),
        makeDeal({ type: 'happy_hour', description: 'timed HH', startTime: '20:00', endTime: '23:30' }),
      ]),
    ]

    const rows = sortDeals(dispensaries, at2300)
    expect(rows.map((r) => r.deal.description)).toEqual(['timed HH', 'all-day HH', 'daily 50'])
  })

  it('sorts daily deals by discountPct descending', () => {
    const dispensaries = [
      makeDispensary('a', [makeDeal({ description: 'daily 15', discountPct: 15 })]),
      makeDispensary('b', [
        makeDeal({ description: 'daily 35', discountPct: 35 }),
        makeDeal({ description: 'daily 20', discountPct: 20 }),
      ]),
    ]

    const rows = sortDeals(dispensaries, at2300)
    expect(rows.map((r) => r.deal.description)).toEqual(['daily 35', 'daily 20', 'daily 15'])
  })

  it('skips dispensaries with empty deals arrays without blocking other rows', () => {
    const dispensaries = [
      makeDispensary('empty', []),
      makeDispensary('full', [makeDeal({ description: 'daily 10', discountPct: 10 })]),
    ]

    const rows = sortDeals(dispensaries, at2300)
    expect(rows).toHaveLength(1)
    expect(rows[0].dispensary.id).toBe('full')
  })

  it('treats missing or malformed times as all-day tier without crashing', () => {
    const dispensaries = [
      makeDispensary('a', [
        makeDeal({ type: 'daily', description: 'daily 50', discountPct: 50 }),
        makeDeal({ type: 'happy_hour', description: 'no endTime key', startTime: null, endTime: undefined as unknown as null }),
        makeDeal({ type: 'happy_hour', description: 'malformed endTime', startTime: '14:00', endTime: '4pm' }),
        makeDeal({ type: 'happy_hour', description: 'malformed startTime', startTime: '9pm', endTime: '23:45' }),
        makeDeal({ type: 'happy_hour', description: 'timed HH', startTime: '20:00', endTime: '23:30' }),
      ]),
    ]

    const rows = sortDeals(dispensaries, at2300)
    expect(rows.map((r) => r.deal.description)).toEqual([
      'timed HH',
      'no endTime key',
      'malformed endTime',
      'malformed startTime',
      'daily 50',
    ])
  })

  it('returns an empty array when every dispensary is dealless', () => {
    const rows = sortDeals([makeDispensary('a', []), makeDispensary('b', [])], at2300)
    expect(rows).toEqual([])
  })

  it('pairs each deal with its own dispensary when flattening', () => {
    const dispensaries = [
      makeDispensary('a', [makeDeal({ description: 'from a', discountPct: 10 })]),
      makeDispensary('b', [makeDeal({ description: 'from b', discountPct: 30 })]),
    ]

    const rows = sortDeals(dispensaries, at2300)
    expect(rows.map((r) => [r.dispensary.id, r.deal.description])).toEqual([
      ['b', 'from b'],
      ['a', 'from a'],
    ])
  })
})

describe('groupDealsByStore', () => {
  it('collapses a store with multiple deals into a single group, deals in sort order', () => {
    const dispensaries = [
      makeDispensary('a', [
        makeDeal({ type: 'daily', description: 'daily 20', discountPct: 20 }),
        makeDeal({ type: 'happy_hour', description: 'timed HH', startTime: '20:00', endTime: '23:30' }),
        makeDeal({ type: 'daily', description: 'daily 40', discountPct: 40 }),
      ]),
    ]

    const groups = groupDealsByStore(dispensaries, at2300)
    expect(groups).toHaveLength(1)
    expect(groups[0].dispensary.id).toBe('a')
    // within a store: timed HH (tier 0), then dailies by discount desc
    expect(groups[0].deals.map((d) => d.description)).toEqual(['timed HH', 'daily 40', 'daily 20'])
  })

  it('orders stores by distance ascending even when a farther store has the better deal', () => {
    const dispensaries = [
      // far store with the highest-priority deal (soonest HH)
      makeDispensary('far', [
        makeDeal({ type: 'happy_hour', description: 'far HH ends 23:30', startTime: '20:00', endTime: '23:30' }),
      ], 12),
      // near store with a weaker daily deal
      makeDispensary('near', [
        makeDeal({ type: 'daily', description: 'near daily 15', discountPct: 15 }),
      ], 5),
    ]

    const groups = groupDealsByStore(dispensaries, at2300)
    // closest store wins the card order regardless of deal priority
    expect(groups.map((g) => g.dispensary.id)).toEqual(['near', 'far'])
  })

  it('keeps best-deal order as the tie-break when stores are equidistant', () => {
    const dispensaries = [
      // both default to distanceMiles 5 → tie → best-deal order decides
      makeDispensary('a', [
        makeDeal({ type: 'daily', description: 'a daily 15', discountPct: 15 }),
        makeDeal({ type: 'happy_hour', description: 'a HH ends 23:45', startTime: '20:00', endTime: '23:45' }),
      ]),
      makeDispensary('b', [
        makeDeal({ type: 'happy_hour', description: 'b HH ends 23:30', startTime: '20:00', endTime: '23:30' }),
        makeDeal({ type: 'daily', description: 'b daily 50', discountPct: 50 }),
      ]),
    ]

    const groups = groupDealsByStore(dispensaries, at2300)
    // b's best deal (HH ending 23:30) outranks a's (HH ending 23:45) → b first
    expect(groups.map((g) => g.dispensary.id)).toEqual(['b', 'a'])
    expect(groups[0].deals.map((d) => d.description)).toEqual(['b HH ends 23:30', 'b daily 50'])
    expect(groups[1].deals.map((d) => d.description)).toEqual(['a HH ends 23:45', 'a daily 15'])
  })

  it('omits stores left with no active deals and returns [] when all are dealless', () => {
    expect(groupDealsByStore([makeDispensary('a', []), makeDispensary('b', [])], at2300)).toEqual([])

    const groups = groupDealsByStore(
      [makeDispensary('empty', []), makeDispensary('full', [makeDeal({ description: 'only deal' })])],
      at2300,
    )
    expect(groups.map((g) => g.dispensary.id)).toEqual(['full'])
  })
})
