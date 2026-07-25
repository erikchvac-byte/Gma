import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import DealFeed from './DealFeed'
import { useDeals } from '../hooks/useDeals'
import { roadDistanceMiles } from '../utils/distance'
import { formatGasCost, roundTripGasCost } from '../utils/gasCost'
import type { ApiDataResponse, Dispensary, UserLocation } from '../types'

// NOTE: unlike DealFeed.test.tsx, this file does NOT mock applyUserDistance — it
// exercises the real transform end-to-end through DealFeed to prove CAP-2/CAP-3.
vi.mock('../hooks/useDeals')
// Stub the additive "Real price drops" child's hook (derivation-3.2) so its on-mount fetch stays
// out of these distance tests; ValueDrops renders nothing with no drops.
vi.mock('../hooks/useValueDrops', () => ({
  useValueDrops: () => ({ drops: [], generatedAt: null, isLoading: false, error: null }),
}))
const mockUseDeals = vi.mocked(useDeals)

const meta = { lastScraperRun: '2026-06-10T07:45:00', gasPrice: 4.1, gasPriceUpdatedAt: '2026-06-10T07:00:00' }

const store = (overrides: Partial<Dispensary> = {}): Dispensary => ({
  id: 'store-1',
  name: 'Store One',
  url: 'https://example.com/store-1',
  lat: 48.0803,
  lng: -122.1862,
  stale: false,
  lastFetchedAt: '2026-06-10T07:00:00',
  deals: [
    { type: 'daily', description: 'A deal', discountPct: 10, startTime: null, endTime: null, daysValid: ['everyday'] },
  ],
  ...overrides,
})

const withData = (dispensaries: Dispensary[]): ApiDataResponse => ({ meta, dispensaries })
const user: UserLocation = { lat: 47.6109, lng: -122.33642, source: 'zip' }

describe('DealFeed — user-relative distance (CAP-2/CAP-3)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('with NO location, shows no distance pill or gas line even on a seed store carrying distanceMiles (CAP-2)', () => {
    // the fixed-origin seed value must not survive (ADR-008/011 retired)
    mockUseDeals.mockReturnValue({ data: withData([store({ distanceMiles: 2.5 })]), isLoading: false, error: null })
    render(<DealFeed mpg={28} location={null} />)

    expect(screen.getByText('A deal')).toBeInTheDocument() // deals still list
    expect(document.querySelector('.gma-distance-pill')).toBeNull()
    expect(document.querySelector('.gma-gas-line')).toBeNull()
  })

  it('with a location and store coords, shows a real user-relative distance pill (CAP-3)', () => {
    mockUseDeals.mockReturnValue({ data: withData([store()]), isLoading: false, error: null })
    render(<DealFeed mpg={28} location={user} />)

    const pill = document.querySelector('.gma-distance-pill')
    expect(pill?.textContent).toMatch(/^\d+\.\d mi$/)
    // Seattle (98101 centroid) → the Tulalip store coords: ~33.2 mi great-circle
    // × 1.3 road factor = 43.1 mi (haversine verified in distance.test.ts)
    expect(pill?.textContent).toBe('43.1 mi')
    expect(document.querySelector('.gma-gas-line')?.textContent).toMatch(/\$\d+\.\d{2}/)
  })

  it('renders gas computed from the REAL road distance — pins the distance→gas wiring (#5)', () => {
    // Every other exact-gas assertion runs under a mocked/hardcoded distance, so
    // a DealFeed wiring regression (great-circle instead of road, one-way instead
    // of round-trip, double 1.3) would still produce a $NN.NN-shaped value and
    // pass. This pins the rendered gas to the road-distance contract end-to-end.
    const mpg = 25
    mockUseDeals.mockReturnValue({ data: withData([store()]), isLoading: false, error: null })
    render(<DealFeed mpg={mpg} location={user} />)

    const miles = roadDistanceMiles(user.lat, user.lng, 48.0803, -122.1862)
    const expected = formatGasCost(roundTripGasCost(miles, meta.gasPrice, mpg) as number)
    // figure renders across styled spans — normalize whitespace (as App.test does)
    const rendered = document.querySelector('.gma-gas-line')?.textContent?.replace(/\s+/g, ' ').trim()
    expect(rendered).toBe(expected)
  })

  it('with a location but a store missing coords, shows no pill or gas for that store', () => {
    const noCoords = store()
    delete noCoords.lat
    delete noCoords.lng
    mockUseDeals.mockReturnValue({ data: withData([{ ...noCoords, distanceMiles: 5 }]), isLoading: false, error: null })
    render(<DealFeed mpg={28} location={user} />)

    expect(screen.getByText('A deal')).toBeInTheDocument()
    expect(document.querySelector('.gma-distance-pill')).toBeNull()
    expect(document.querySelector('.gma-gas-line')).toBeNull()
  })
})
