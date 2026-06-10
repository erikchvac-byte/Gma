import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import DealFeed from './DealFeed'
import { useDeals } from '../hooks/useDeals'
import type { ApiDataResponse, Deal, Dispensary } from '../types'

vi.mock('../hooks/useDeals')

const mockUseDeals = vi.mocked(useDeals)

const meta = {
  lastScraperRun: '2026-06-10T07:45:00',
  gasPrice: 4.1,
  nationalMpg: 28,
  gasPriceUpdatedAt: '2026-06-10T07:00:00',
}

const makeDeal = (overrides: Partial<Deal>): Deal => ({
  type: 'daily',
  description: 'A deal',
  discountPct: 10,
  startTime: null,
  endTime: null,
  daysValid: ['everyday'],
  ...overrides,
})

const makeDispensary = (id: string, name: string, deals: Deal[]): Dispensary => ({
  id,
  name,
  url: `https://example.com/${id}`,
  distanceMiles: 5,
  stale: false,
  lastFetchedAt: '2026-06-10T07:00:00',
  deals,
})

const withData = (dispensaries: Dispensary[]): ApiDataResponse => ({ meta, dispensaries })

describe('DealFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 23, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows a loading skeleton without feed or timestamp while loading', () => {
    mockUseDeals.mockReturnValue({ data: null, isLoading: true, error: null })
    render(<DealFeed />)

    expect(screen.getByRole('status', { name: 'Loading deals' })).toBeInTheDocument()
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument()
    expect(screen.queryByText('No active deals right now')).not.toBeInTheDocument()
  })

  it('shows a friendly error message without raw error text or timestamp', () => {
    mockUseDeals.mockReturnValue({
      data: null,
      isLoading: false,
      error: 'Request failed with status 500',
    })
    render(<DealFeed />)

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load deals. Please try again later.")
    expect(screen.queryByText(/Request failed with status 500/)).not.toBeInTheDocument()
    expect(screen.queryByText(/500/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument()
  })

  it('shows the empty state with the formatted timestamp when no deals exist', () => {
    mockUseDeals.mockReturnValue({
      data: withData([makeDispensary('a', 'Dealless Dispensary', [])]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    expect(screen.getByText('No active deals right now')).toBeInTheDocument()
    expect(screen.getByText('Last updated Jun 10, 7:45 AM')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('omits the "Last updated" footer when the timestamp is invalid', () => {
    mockUseDeals.mockReturnValue({
      data: { meta: { ...meta, lastScraperRun: 'not-a-date' }, dispensaries: [] },
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    expect(screen.getByText('No active deals right now')).toBeInTheDocument()
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument()
  })

  it('renders one row per active deal in spec sort order with the timestamp', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [
          makeDeal({ type: 'daily', description: 'daily twenty', discountPct: 20 }),
          makeDeal({ type: 'happy_hour', description: 'overnight HH', startTime: '22:00', endTime: '02:00' }),
        ]),
        makeDispensary('b', 'Bravo Buds', [
          makeDeal({ type: 'happy_hour', description: 'soonest HH', discountPct: 30, startTime: '20:00', endTime: '23:30' }),
          makeDeal({ type: 'happy_hour', description: 'all-day HH', startTime: null, endTime: null }),
          makeDeal({ type: 'daily', description: 'daily thirty-five', discountPct: 35 }),
        ]),
        makeDispensary('c', 'Charlie Cannabis', []),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    const rowTexts = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rowTexts).toEqual([
      'Bravo Buds — soonest HH — 30% off',
      'Alpha Greens — overnight HH — 10% off',
      'Bravo Buds — all-day HH — 10% off',
      'Bravo Buds — daily thirty-five — 35% off',
      'Alpha Greens — daily twenty — 20% off',
    ])
    expect(screen.getByText('Last updated Jun 10, 7:45 AM')).toBeInTheDocument()
    expect(screen.queryByText('Charlie Cannabis')).not.toBeInTheDocument()
    expect(screen.queryByText('No active deals right now')).not.toBeInTheDocument()
  })
})
