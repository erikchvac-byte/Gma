import { describe, it, expect } from 'vitest'
import { normalizeDeals } from './normalizeDeals.js'
import type { Deal } from '../../client/src/types/index.js'

const valid = (overrides: Partial<Deal> = {}): Deal => ({
  type: 'happy_hour',
  description: 'Happy hour',
  discountPct: 20,
  startTime: '15:00',
  endTime: '18:00',
  daysValid: ['friday'],
  ...overrides,
})

describe('normalizeDeals', () => {
  it('passes a clean deal list through unchanged', () => {
    const deals = [valid(), valid({ startTime: null, endTime: null, daysValid: ['everyday'] })]
    expect(normalizeDeals(deals)).toEqual(deals)
  })

  it('returns an empty array for empty input', () => {
    expect(normalizeDeals([])).toEqual([])
  })

  it('rejects a zero-length window (startTime === endTime)', () => {
    expect(normalizeDeals([valid({ startTime: '16:00', endTime: '16:00' })])).toEqual([])
  })

  it('rejects unparseable times', () => {
    expect(normalizeDeals([valid({ startTime: '9am', endTime: '18:00' })])).toEqual([])
    expect(normalizeDeals([valid({ startTime: '15:00', endTime: '25:00' })])).toEqual([])
    expect(normalizeDeals([valid({ startTime: '15:00', endTime: '15:60' })])).toEqual([])
  })

  it('keeps an overnight window (end < start)', () => {
    const overnight = valid({ startTime: '22:00', endTime: '02:00' })
    expect(normalizeDeals([overnight])).toEqual([overnight])
  })

  it('keeps a one-sided window when the present time parses', () => {
    const startOnly = valid({ startTime: '15:00', endTime: null })
    const endOnly = valid({ startTime: null, endTime: '18:00' })
    expect(normalizeDeals([startOnly, endOnly])).toEqual([startOnly, endOnly])
  })

  it('rejects a one-sided window when the present time is unparseable', () => {
    expect(normalizeDeals([valid({ startTime: 'noon', endTime: null })])).toEqual([])
  })

  it('keeps an all-day window (both times null)', () => {
    const allDay = valid({ startTime: null, endTime: null, daysValid: ['everyday'] })
    expect(normalizeDeals([allDay])).toEqual([allDay])
  })

  it('rejects deals with bad daysValid vocabulary', () => {
    expect(normalizeDeals([valid({ daysValid: ['Mon'] })])).toEqual([]) // abbreviation
    expect(normalizeDeals([valid({ daysValid: ['Friday'] })])).toEqual([]) // capitalized
    expect(normalizeDeals([valid({ daysValid: [] })])).toEqual([]) // empty
    expect(normalizeDeals([valid({ daysValid: 'monday' as unknown as string[] })])).toEqual([]) // not an array
  })

  it('drops only the bad deals, keeping the valid ones', () => {
    const good = valid()
    const bad = valid({ startTime: '16:00', endTime: '16:00' })
    expect(normalizeDeals([good, bad, valid({ daysValid: ['nope'] })])).toEqual([good])
  })

  it('drops null / non-object elements', () => {
    const good = valid()
    const deals = [null, good, 'oops' as unknown] as unknown as Deal[]
    expect(normalizeDeals(deals)).toEqual([good])
  })

  it('sanitizes the description of surviving deals (strips markup)', () => {
    const [result] = normalizeDeals([valid({ description: 'Top-shelf <b>flower</b> 🔥' })])
    expect(result.description).toBe('Top-shelf flower')
  })

  it('suppresses a non-compliant description but KEEPS the deal (never trips stale)', () => {
    const result = normalizeDeals([valid({ description: 'cures anxiety, kid-approved' })])
    expect(result).toHaveLength(1) // deal kept — only the copy is blanked
    expect(result[0].description).toBe('')
  })
})
