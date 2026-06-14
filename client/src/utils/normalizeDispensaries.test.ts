import { describe, it, expect } from 'vitest'
import { normalizeDispensaries } from './normalizeDispensaries'
import type { Dispensary } from '../types'

const valid = (overrides: Partial<Dispensary> = {}): Dispensary => ({
  id: 'store-1',
  name: 'Store One',
  url: 'https://store.example.com/',
  distanceMiles: 3.2,
  stale: false,
  lastFetchedAt: '2026-06-13T00:00:00.000Z',
  deals: [],
  ...overrides,
})

describe('normalizeDispensaries', () => {
  it('passes well-formed records through unchanged', () => {
    const records = [valid(), valid({ id: 'store-2', distanceMiles: 0 })]
    expect(normalizeDispensaries(records)).toEqual(records)
  })

  it('returns an empty array for empty input', () => {
    expect(normalizeDispensaries([])).toEqual([])
  })

  it('drops null and non-object elements', () => {
    const good = valid()
    const raw = [null, good, undefined, 'oops', 42]
    expect(normalizeDispensaries(raw)).toEqual([good])
  })

  it('drops records with a non-finite or negative distanceMiles', () => {
    expect(normalizeDispensaries([valid({ distanceMiles: null as unknown as number })])).toEqual([])
    expect(normalizeDispensaries([valid({ distanceMiles: NaN })])).toEqual([])
    expect(normalizeDispensaries([valid({ distanceMiles: Infinity })])).toEqual([])
    expect(normalizeDispensaries([valid({ distanceMiles: -3 })])).toEqual([])
    expect(normalizeDispensaries([valid({ distanceMiles: '5' as unknown as number })])).toEqual([])
  })

  it('drops records whose deals is not an array', () => {
    expect(normalizeDispensaries([valid({ deals: undefined as unknown as [] })])).toEqual([])
    expect(normalizeDispensaries([valid({ deals: 'x' as unknown as [] })])).toEqual([])
  })

  it('keeps the valid records and drops the malformed ones in a mixed list', () => {
    const good = valid()
    const raw = [good, null, valid({ id: 'bad', distanceMiles: NaN })]
    expect(normalizeDispensaries(raw)).toEqual([good])
  })
})
