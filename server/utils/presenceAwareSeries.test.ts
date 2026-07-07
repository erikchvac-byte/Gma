import { describe, it, expect } from 'vitest'
import { walkPresenceAwareSeries, toCalendarDay } from './presenceAwareSeries.js'

interface Obs {
  observedAt: string
  price: number
}

const iso = (day: string) => `${day}T12:00:00.000Z`
const item = (day: string, price: number): Obs => ({ observedAt: iso(day), price })

describe('toCalendarDay', () => {
  it('extracts the UTC YYYY-MM-DD portion of an ISO timestamp', () => {
    expect(toCalendarDay('2026-07-01T23:59:00.000Z')).toBe('2026-07-01')
  })
})

describe('walkPresenceAwareSeries', () => {
  it('returns [] for empty input', () => {
    expect(walkPresenceAwareSeries<Obs, number>([], { getObservedAt: (o) => o.observedAt, getValue: (d) => d[0].price })).toEqual([])
  })

  it('marks a missing calendar day between two observed days as a gap', () => {
    const items = [item('2026-07-01', 10), item('2026-07-03', 10)]
    const result = walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => d[0].price,
    })
    expect(result).toEqual([
      { date: '2026-07-01', status: 'first', value: 10 },
      { date: '2026-07-02', status: 'gap' },
      { date: '2026-07-03', status: 'unchanged', value: 10 },
    ])
  })

  it('marks an observed day with the same value as the prior observed day as unchanged', () => {
    const items = [item('2026-07-01', 10), item('2026-07-02', 10)]
    const result = walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => d[0].price,
    })
    expect(result[1]).toEqual({ date: '2026-07-02', status: 'unchanged', value: 10 })
  })

  it('reports changed after a gap by comparing to the last real observation, not the gap', () => {
    const items = [item('2026-07-01', 10), item('2026-07-04', 15)]
    const result = walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => d[0].price,
    })
    expect(result).toEqual([
      { date: '2026-07-01', status: 'first', value: 10 },
      { date: '2026-07-02', status: 'gap' },
      { date: '2026-07-03', status: 'gap' },
      { date: '2026-07-04', status: 'changed', value: 15, previousValue: 10 },
    ])
  })

  it('reports unchanged after a gap when the value reverts to/stays at the last real observation', () => {
    const items = [item('2026-07-01', 10), item('2026-07-04', 10)]
    const result = walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => d[0].price,
    })
    expect(result).toEqual([
      { date: '2026-07-01', status: 'first', value: 10 },
      { date: '2026-07-02', status: 'gap' },
      { date: '2026-07-03', status: 'gap' },
      { date: '2026-07-04', status: 'unchanged', value: 10 },
    ])
  })

  it('steps correctly across a month boundary', () => {
    const items = [item('2026-01-31', 1), item('2026-02-01', 2)]
    const result = walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => d[0].price,
    })
    expect(result).toEqual([
      { date: '2026-01-31', status: 'first', value: 1 },
      { date: '2026-02-01', status: 'changed', value: 2, previousValue: 1 },
    ])
  })

  it('throws when startDate is after endDate', () => {
    const items = [item('2026-07-02', 10)]
    expect(() =>
      walkPresenceAwareSeries(items, {
        getObservedAt: (o) => o.observedAt,
        getValue: (d) => d[0].price,
        startDate: '2026-07-05',
        endDate: '2026-07-01',
      }),
    ).toThrow(/startDate.*must not be after endDate/)
  })

  it('reports the earliest observed day as first, never changed or unchanged', () => {
    const items = [item('2026-07-05', 20)]
    const result = walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => d[0].price,
    })
    expect(result).toEqual([{ date: '2026-07-05', status: 'first', value: 20 }])
  })

  it('extends the walked range beyond real data via explicit startDate/endDate, emitting extra gaps', () => {
    const items = [item('2026-07-02', 10)]
    const result = walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => d[0].price,
      startDate: '2026-06-30',
      endDate: '2026-07-04',
    })
    expect(result).toEqual([
      { date: '2026-06-30', status: 'gap' },
      { date: '2026-07-01', status: 'gap' },
      { date: '2026-07-02', status: 'first', value: 10 },
      { date: '2026-07-03', status: 'gap' },
      { date: '2026-07-04', status: 'gap' },
    ])
  })

  it('uses a custom equals for structural/object value comparison', () => {
    const items = [
      { observedAt: iso('2026-07-01'), tags: ['a', 'b'] },
      { observedAt: iso('2026-07-02'), tags: ['a', 'b'] },
      { observedAt: iso('2026-07-03'), tags: ['a', 'c'] },
    ]
    const result = walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => d[0].tags,
      equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
    })
    expect(result[0]).toEqual({ date: '2026-07-01', status: 'first', value: ['a', 'b'] })
    expect(result[1]).toEqual({ date: '2026-07-02', status: 'unchanged', value: ['a', 'b'] })
    expect(result[2]).toEqual({ date: '2026-07-03', status: 'changed', value: ['a', 'c'], previousValue: ['a', 'b'] })
  })

  it('passes same-day items to getValue in original input order, never re-sorted', () => {
    const items = [item('2026-07-01', 1), item('2026-07-01', 2), item('2026-07-01', 3)]
    const seenOrders: number[][] = []
    walkPresenceAwareSeries(items, {
      getObservedAt: (o) => o.observedAt,
      getValue: (d) => {
        seenOrders.push(d.map((o) => o.price))
        return d.at(-1)!.price
      },
    })
    expect(seenOrders).toEqual([[1, 2, 3]])
  })
})
