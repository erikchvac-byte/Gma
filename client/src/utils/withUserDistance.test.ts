import { describe, it, expect } from 'vitest'
import { applyUserDistance } from './withUserDistance'
import { roadDistanceMiles } from './distance'
import type { Dispensary, UserLocation } from '../types'

const store = (overrides: Partial<Dispensary> = {}): Dispensary => ({
  id: 'store-1',
  name: 'Store One',
  url: 'https://store.example.com/',
  lat: 48.0803,
  lng: -122.1862,
  stale: false,
  lastFetchedAt: '2026-06-13T00:00:00.000Z',
  deals: [],
  ...overrides,
})

const user: UserLocation = { lat: 47.6109, lng: -122.33642, source: 'zip' }

describe('applyUserDistance', () => {
  it('strips distanceMiles from EVERY store when there is no location (CAP-2)', () => {
    // the seeded fixed-origin value (ADR-008/011) must NOT survive — this is what
    // retires it, not stripping data.json (the cron may re-inject it)
    const seeded = store({ distanceMiles: 2.5 })
    const [out] = applyUserDistance([seeded], null)
    expect('distanceMiles' in out).toBe(false)
  })

  it('computes a user-relative distance = haversine × 1.3 when location and coords exist (CAP-3)', () => {
    const [out] = applyUserDistance([store()], user)
    const expected = roadDistanceMiles(user.lat, user.lng, 48.0803, -122.1862)
    expect(out.distanceMiles).toBeCloseTo(expected, 6)
  })

  it('overrides any seeded distanceMiles with the computed value (never augments)', () => {
    const [out] = applyUserDistance([store({ distanceMiles: 999 })], user)
    expect(out.distanceMiles).not.toBe(999)
    expect(out.distanceMiles).toBeCloseTo(
      roadDistanceMiles(user.lat, user.lng, 48.0803, -122.1862),
      6,
    )
  })

  it('strips distanceMiles for a store with no coordinates even when a location is set', () => {
    const noCoords = store()
    delete noCoords.lat
    delete noCoords.lng
    const [out] = applyUserDistance([{ ...noCoords, distanceMiles: 5 }], user)
    expect('distanceMiles' in out).toBe(false)
  })

  it('does not mutate the input array or its records', () => {
    const input = [store({ distanceMiles: 2.5 })]
    const snapshot = JSON.parse(JSON.stringify(input))
    applyUserDistance(input, user)
    expect(input).toEqual(snapshot)
  })

  it('keeps the store record (id/deals) intact regardless of distance outcome', () => {
    const deals = [{ type: 'daily' as const, description: 'x', discountPct: 10, startTime: null, endTime: null, daysValid: ['everyday'] }]
    const [out] = applyUserDistance([store({ deals })], null)
    expect(out.id).toBe('store-1')
    expect(out.deals).toEqual(deals)
  })
})
