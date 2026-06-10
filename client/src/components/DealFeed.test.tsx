import { render, screen, within, act } from '@testing-library/react'
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

  it('renders one card per active deal in spec sort order with the timestamp', () => {
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

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
    const order = ['soonest HH', 'overnight HH', 'all-day HH', 'daily thirty-five', 'daily twenty']
    order.forEach((description, index) => {
      expect(within(items[index]).getByText(description)).toBeInTheDocument()
    })

    // timed HH card: name, distance, discount, 12-hour window, countdown
    expect(within(items[0]).getByText('Bravo Buds')).toBeInTheDocument()
    expect(within(items[0]).getByText('5.0 miles')).toBeInTheDocument()
    expect(within(items[0]).getByText('30% off')).toBeInTheDocument()
    expect(within(items[0]).getByText('8:00 PM – 11:30 PM')).toBeInTheDocument()
    expect(within(items[0]).getByText('0:30 left')).toBeInTheDocument()

    // overnight HH at 23:00: active, countdown 3:00
    expect(within(items[1]).getByText('10:00 PM – 2:00 AM')).toBeInTheDocument()
    expect(within(items[1]).getByText('3:00 left')).toBeInTheDocument()

    // all-day HH and daily deals: "Active today", no countdown
    expect(within(items[2]).getByText('Active today')).toBeInTheDocument()
    expect(within(items[2]).queryByText(/left/)).not.toBeInTheDocument()
    expect(within(items[3]).getByText('Active today')).toBeInTheDocument()
    expect(within(items[3]).queryByText(/left/)).not.toBeInTheDocument()

    expect(screen.getByText('Last updated Jun 10, 7:45 AM')).toBeInTheDocument()
    expect(screen.queryByText('Charlie Cannabis')).not.toBeInTheDocument()
    expect(screen.queryByText('No active deals right now')).not.toBeInTheDocument()
  })

  it('drops deals that ended earlier today (startTime-aware expiry)', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [
          makeDeal({ type: 'happy_hour', description: 'ended afternoon HH', startTime: '14:00', endTime: '16:00' }),
          makeDeal({ type: 'happy_hour', description: 'active HH', startTime: '20:00', endTime: '23:30' }),
        ]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    expect(screen.getByText('active HH')).toBeInTheDocument()
    expect(screen.queryByText('ended afternoon HH')).not.toBeInTheDocument()
  })

  it('derives "– close" for start-only deals: no countdown, never expires', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [
          makeDeal({ type: 'happy_hour', description: 'until close HH', startTime: '21:00', endTime: null }),
        ]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    const item = screen.getByRole('listitem')
    expect(within(item).getByText('9:00 PM – close')).toBeInTheDocument()
    expect(within(item).queryByText(/left/)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(120 * 60000) // 01:00 next morning
    })
    expect(screen.getByText('until close HH')).toBeInTheDocument()
  })

  it('derives "Until X" for end-only deals: no countdown, never expires (server mirror)', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [
          makeDeal({ type: 'happy_hour', description: 'end-only HH', startTime: null, endTime: '23:30' }),
        ]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    const item = screen.getByRole('listitem')
    expect(within(item).getByText('Until 11:30 PM')).toBeInTheDocument()
    expect(within(item).queryByText(/left/)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60 * 60000) // past 23:30
    })
    expect(screen.getByText('end-only HH')).toBeInTheDocument()
  })

  it('keeps malformed-start deals out of the urgent tier and shows no countdown', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [
          makeDeal({ type: 'happy_hour', description: 'bad start HH', startTime: '9pm', endTime: '23:30' }),
          makeDeal({ type: 'happy_hour', description: 'valid timed HH', startTime: '20:00', endTime: '23:45' }),
        ]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    const items = screen.getAllByRole('listitem')
    // valid timed deal outranks the degenerate one (tier 0 vs tier 1)
    expect(within(items[0]).getByText('valid timed HH')).toBeInTheDocument()
    expect(within(items[1]).getByText('bad start HH')).toBeInTheDocument()
    expect(within(items[1]).queryByText(/left/)).not.toBeInTheDocument()
  })

  it('renders malformed-time deals without window, countdown, or NaN text', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [
          makeDeal({ type: 'happy_hour', description: 'malformed HH', startTime: '14:00', endTime: '4pm' }),
        ]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    const item = screen.getByRole('listitem')
    expect(within(item).getByText('malformed HH')).toBeInTheDocument()
    expect(within(item).getByText('10% off')).toBeInTheDocument()
    expect(within(item).queryByText(/left/)).not.toBeInTheDocument()
    expect(within(item).queryByText(/AM|PM|close|Active today/)).not.toBeInTheDocument()
    expect(item.textContent).not.toContain('NaN')
  })

  it('decreases the countdown after 60 seconds without a reload', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [
          makeDeal({ type: 'happy_hour', description: 'soonest HH', startTime: '20:00', endTime: '23:30' }),
        ]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    expect(screen.getByText('0:30 left')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60000)
    })

    expect(screen.getByText('0:29 left')).toBeInTheDocument()
    expect(screen.queryByText('0:30 left')).not.toBeInTheDocument()
  })

  it('removes an expired deal on tick and shows the empty state with the timestamp', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [
          makeDeal({ type: 'happy_hour', description: 'soonest HH', startTime: '20:00', endTime: '23:30' }),
        ]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    expect(screen.getByRole('listitem')).toBeInTheDocument()

    // advance past 23:30 — the deal's window closes while the tab stays open
    act(() => {
      vi.advanceTimersByTime(31 * 60000)
    })

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByText('No active deals right now')).toBeInTheDocument()
    expect(screen.getByText('Last updated Jun 10, 7:45 AM')).toBeInTheDocument()
  })
})
