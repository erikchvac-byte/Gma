import { describe, it, expect, vi } from 'vitest'
import {
  inWaBounds,
  mergeCoords,
  geocode,
  VERIFIED_COORDS,
  EXPECTED_UNCOORDED,
  type HttpGet,
} from './geocodeStores.js'

describe('inWaBounds', () => {
  it('accepts a coordinate inside Washington', () => {
    expect(inWaBounds(48.06, -122.18)).toBe(true) // ~Marysville
    expect(inWaBounds(48.75, -122.49)).toBe(true) // ~Bellingham
  })

  it('rejects a coordinate outside Washington', () => {
    expect(inWaBounds(42.46, -83.13)).toBe(false) // Ferndale, MI — the homonym trap
    expect(inWaBounds(45.0, -122.0)).toBe(false) // just south of the WA border
    expect(inWaBounds(49.5, -122.0)).toBe(false) // into BC
  })
})

describe('VERIFIED_COORDS', () => {
  it('every hand-verified override sits inside WA bounds', () => {
    for (const [id, { lat, lng }] of Object.entries(VERIFIED_COORDS)) {
      expect(inWaBounds(lat, lng), `${id} should be in WA`).toBe(true)
    }
  })
})

describe('mergeCoords', () => {
  it('writes coords onto a record that has none and reports a write', () => {
    const record: { lat?: number; lng?: number } = {}
    expect(mergeCoords(record, { lat: 48.06, lng: -122.18 })).toBe(true)
    expect(record).toEqual({ lat: 48.06, lng: -122.18 })
  })

  it('is idempotent: leaves an already-geocoded record untouched and reports no write', () => {
    const record = { lat: 48.06, lng: -122.18 }
    expect(mergeCoords(record, { lat: 1, lng: 2 })).toBe(false)
    expect(record).toEqual({ lat: 48.06, lng: -122.18 })
  })

  it('re-resolves a record poisoned with a non-finite coord (NaN is not "already geocoded")', () => {
    const record = { lat: NaN, lng: -122.18 }
    expect(mergeCoords(record, { lat: 48.06, lng: -122.18 })).toBe(true)
    expect(record).toEqual({ lat: 48.06, lng: -122.18 })
  })
})

describe('EXPECTED_UNCOORDED', () => {
  it('is empty — every listed store geocodes to a real WA coordinate', () => {
    // liv-ferndale (LIV Cannabis, Ferndale MICHIGAN) was removed 2026-06-22; no
    // store is now knowingly uncoorded. A non-empty set here is a smell: either
    // geocode the store or, if it cannot resolve to WA, it likely does not belong.
    expect(EXPECTED_UNCOORDED.size).toBe(0)
  })
})

describe('geocode', () => {
  it('parses the first Nominatim hit into numeric lat/lng', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ lat: '48.0612', lon: '-122.1771' }],
    }) as unknown as HttpGet
    await expect(geocode('9226 34th Ave NE, Marysville, WA', get)).resolves.toEqual({
      lat: 48.0612,
      lng: -122.1771,
    })
  })

  it('returns null when Nominatim has no results', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] }) as unknown as HttpGet
    await expect(geocode('nowhere at all', get)).resolves.toBeNull()
  })

  it('returns null when the hit has non-numeric coords', async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ lat: 'x', lon: 'y' }] }) as unknown as HttpGet
    await expect(geocode('garbage', get)).resolves.toBeNull()
  })

  it('returns null (no throw) when the first hit is a non-object, e.g. [null]', async () => {
    const get = vi.fn().mockResolvedValue({ data: [null] }) as unknown as HttpGet
    await expect(geocode('weird payload', get)).resolves.toBeNull()
  })

  it('propagates a transport error so the caller can retry/flag it', async () => {
    const get = vi.fn().mockRejectedValue(new Error('429')) as unknown as HttpGet
    await expect(geocode('rate limited', get)).rejects.toThrow('429')
  })
})
