import { describe, it, expect } from 'vitest'
import { sortDeals } from './sortDeals'
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

  it('treats missing or malformed endTime as all-day tier without crashing', () => {
    const dispensaries = [
      makeDispensary('a', [
        makeDeal({ type: 'daily', description: 'daily 50', discountPct: 50 }),
        makeDeal({ type: 'happy_hour', description: 'no endTime key', startTime: null, endTime: undefined as unknown as null }),
        makeDeal({ type: 'happy_hour', description: 'malformed endTime', startTime: '14:00', endTime: '4pm' }),
        makeDeal({ type: 'happy_hour', description: 'timed HH', startTime: '20:00', endTime: '23:30' }),
      ]),
    ]

    const rows = sortDeals(dispensaries, at2300)
    expect(rows.map((r) => r.deal.description)).toEqual([
      'timed HH',
      'no endTime key',
      'malformed endTime',
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
