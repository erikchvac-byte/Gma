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

  it('drops records with a PRESENT but non-finite or negative distanceMiles', () => {
    expect(normalizeDispensaries([valid({ distanceMiles: null as unknown as number })])).toEqual([])
    expect(normalizeDispensaries([valid({ distanceMiles: NaN })])).toEqual([])
    expect(normalizeDispensaries([valid({ distanceMiles: Infinity })])).toEqual([])
    expect(normalizeDispensaries([valid({ distanceMiles: -3 })])).toEqual([])
    expect(normalizeDispensaries([valid({ distanceMiles: '5' as unknown as number })])).toEqual([])
  })

  it('keeps records with no distanceMiles at all (optional enrichment, ADR-043)', () => {
    const noDistance = valid()
    delete (noDistance as Partial<Dispensary>).distanceMiles
    expect(normalizeDispensaries([noDistance])).toEqual([noDistance])
  })

  it('drops records with a missing or empty id', () => {
    expect(normalizeDispensaries([valid({ id: '' })])).toEqual([])
    const noId = valid()
    delete (noId as Partial<Dispensary>).id
    expect(normalizeDispensaries([noId])).toEqual([])
  })

  it('drops records whose deals is not an array', () => {
    expect(normalizeDispensaries([valid({ deals: undefined as unknown as [] })])).toEqual([])
    expect(normalizeDispensaries([valid({ deals: 'x' as unknown as [] })])).toEqual([])
  })

  it('keeps records with a PRESENT non-empty string address', () => {
    const withAddress = valid({ address: '9226 34th Avenue NE, Tulalip, WA 98271' })
    expect(normalizeDispensaries([withAddress])).toEqual([withAddress])
  })

  it('keeps records with no address at all (optional enrichment, ADR-043)', () => {
    const noAddress = valid()
    expect('address' in noAddress).toBe(false)
    expect(normalizeDispensaries([noAddress])).toEqual([noAddress])
  })

  it('keeps records even when address is empty, whitespace-only, or non-string — address never gates visibility (ADR-043)', () => {
    // a bad address has no math/crash path (DealCard guards typeof + .trim()), so
    // the store and its deals must still render; the card just omits the address.
    const empty = valid({ address: '' })
    const ws = valid({ address: '   ' })
    const num = valid({ address: 123 as unknown as string })
    const nul = valid({ address: null as unknown as string })
    expect(normalizeDispensaries([empty, ws, num, nul])).toEqual([empty, ws, num, nul])
  })

  it('keeps the valid records and drops the malformed ones in a mixed list', () => {
    const good = valid()
    const raw = [good, null, valid({ id: 'bad', distanceMiles: NaN })]
    expect(normalizeDispensaries(raw)).toEqual([good])
  })
})
