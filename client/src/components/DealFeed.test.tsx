import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import DealFeed from './DealFeed'
import { useDeals } from '../hooks/useDeals'
import type { ApiDataResponse, Deal, Dispensary } from '../types'

vi.mock('../hooks/useDeals')

const mockUseDeals = vi.mocked(useDeals)

// Figures and the discount now render in their own styled <span>s, so a line's
// text spans multiple nodes. getByText sees only an element's direct text
// nodes, so match on full (nested) textContent for those lines.
const hasText = (text: string) => (_content: string, node: Element | null) =>
  node?.textContent?.replace(/\s+/g, ' ').trim() === text

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
    localStorage.clear()
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
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument()
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
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument()
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

  it('renders one card per store, deals grouped inside, stores in best-deal order', () => {
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

    // one listitem per STORE (Charlie is dealless → omitted); Bravo's soonest HH
    // (ends 23:30) beats Alpha's overnight HH (ends 02:00) → Bravo first
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Bravo Buds')).toBeInTheDocument()
    expect(within(items[1]).getByText('Alpha Greens')).toBeInTheDocument()

    // Bravo card: header shows distance + a single gas line (5 mi × 2 × 4.1/28 = $1.46);
    // all three of its deals are grouped inside, in sort order
    expect(within(items[0]).getByText('5.0 miles')).toBeInTheDocument()
    expect(within(items[0]).getByText(hasText('$1.46 to get there'))).toBeInTheDocument()
    expect(within(items[0]).getAllByText(/to get there/)).toHaveLength(1)
    expect(within(items[0]).getByText('30% off')).toBeInTheDocument()
    expect(within(items[0]).getByText('8:00 PM – 11:30 PM')).toBeInTheDocument()
    expect(within(items[0]).getByText(hasText('0:30 left'))).toBeInTheDocument()
    expect(within(items[0]).getByText('all-day HH')).toBeInTheDocument()
    expect(within(items[0]).getByText('35% off')).toBeInTheDocument()
    const bravoText = items[0].textContent ?? ''
    expect(bravoText.indexOf('soonest HH')).toBeLessThan(bravoText.indexOf('all-day HH'))
    expect(bravoText.indexOf('all-day HH')).toBeLessThan(bravoText.indexOf('daily thirty-five'))

    // Alpha card: overnight HH active at 23:00 (countdown 3:00), then daily twenty
    expect(within(items[1]).getByText('10:00 PM – 2:00 AM')).toBeInTheDocument()
    expect(within(items[1]).getByText(hasText('3:00 left'))).toBeInTheDocument()
    expect(within(items[1]).getByText('20% off')).toBeInTheDocument()

    expect(screen.getByText('Last updated Jun 10, 7:45 AM')).toBeInTheDocument()
    expect(screen.queryByText('Charlie Cannabis')).not.toBeInTheDocument()
    expect(screen.queryByText('No active deals right now')).not.toBeInTheDocument()
  })

  it('computes each card from its own dispensary distance', () => {
    const near = makeDispensary('near', 'Near Greens', [
      makeDeal({ type: 'daily', description: 'near deal', discountPct: 20 }),
    ])
    const far = { ...makeDispensary('far', 'Far Buds', [
      makeDeal({ type: 'daily', description: 'far deal', discountPct: 30 }),
    ]), distanceMiles: 12.4 }
    mockUseDeals.mockReturnValue({ data: withData([near, far]), isLoading: false, error: null })
    render(<DealFeed />)

    // gas now lives in each store's header, separate from the per-deal discount
    expect(screen.getByText(hasText('$3.63 to get there'))).toBeInTheDocument()
    expect(screen.getByText(hasText('$1.46 to get there'))).toBeInTheDocument()
  })

  it('uses the national average for gas cost when no vehicle mpg is provided', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [makeDeal({ type: 'daily', description: 'a deal', discountPct: 10 })]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    // 5 mi × 2 × 4.1/28 = $1.46
    expect(screen.getByText(hasText('$1.46 to get there'))).toBeInTheDocument()
  })

  it('uses the provided vehicle mpg for gas cost', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [makeDeal({ description: 'a deal', discountPct: 30 })]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed mpg={20} />)

    // 5 mi × 2 × 4.1/20 = $2.05
    expect(screen.getByText(hasText('$2.05 to get there'))).toBeInTheDocument()
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

  it('orders a malformed-start deal after the valid timed one within the store card', () => {
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

    // one store → one card; valid timed deal outranks the degenerate one (tier 0 vs 1)
    const item = screen.getByRole('listitem')
    const text = item.textContent ?? ''
    expect(text.indexOf('valid timed HH')).toBeLessThan(text.indexOf('bad start HH'))
    expect(within(item).getByText('valid timed HH')).toBeInTheDocument()
    expect(within(item).getByText('bad start HH')).toBeInTheDocument()
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
    expect(within(item).getByText(hasText('$1.46 to get there'))).toBeInTheDocument()
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

    expect(screen.getByText(hasText('0:30 left'))).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60000)
    })

    expect(screen.getByText(hasText('0:29 left'))).toBeInTheDocument()
    expect(screen.queryByText(hasText('0:30 left'))).not.toBeInTheDocument()
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

  it('shows the discount alone when gasPrice is invalid', () => {
    mockUseDeals.mockReturnValue({
      data: {
        meta: { ...meta, gasPrice: 0 },
        dispensaries: [makeDispensary('a', 'Alpha Greens', [makeDeal({ discountPct: 35 })])],
      },
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    const item = screen.getByRole('listitem')
    expect(within(item).getByText('35% off', { selector: 'span' })).toBeInTheDocument()
    expect(item.textContent).not.toContain('to get there')
  })

  describe('distance filter', () => {
    const atDistance = (id: string, name: string, distanceMiles: number): Dispensary => ({
      ...makeDispensary(id, name, [makeDeal({ description: `${name} deal` })]),
      distanceMiles,
    })

    // mirrors the seed data spread: 2.5 / 9.8 / 10.5 / 12.5
    const fourDispensaries = () =>
      withData([
        atDistance('a', 'Closest', 2.5),
        atDistance('b', 'Near', 9.8),
        atDistance('c', 'Mid', 10.5),
        atDistance('d', 'Far', 12.5),
      ])

    it('defaults to 50 miles and shows all dispensaries', () => {
      mockUseDeals.mockReturnValue({ data: fourDispensaries(), isLoading: false, error: null })
      render(<DealFeed />)

      const slider = screen.getByRole('slider', { name: 'Within' })
      expect(slider).toHaveValue('50')
      expect(slider).toHaveAttribute('aria-valuetext', '50 miles')
      expect(screen.getAllByRole('listitem')).toHaveLength(4)
    })

    it('narrows the feed instantly on slider change without any network request', () => {
      const fetchSpy = vi.spyOn(window, 'fetch')
      mockUseDeals.mockReturnValue({ data: fourDispensaries(), isLoading: false, error: null })
      render(<DealFeed />)

      fireEvent.change(screen.getByRole('slider'), { target: { value: '10' } })

      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(screen.getByText('Closest deal')).toBeInTheDocument()
      expect(screen.getByText('Near deal')).toBeInTheDocument()
      expect(screen.queryByText('Mid deal')).not.toBeInTheDocument()
      expect(screen.queryByText('Far deal')).not.toBeInTheDocument()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(localStorage.getItem('gma_distance_miles')).toBe('10')
    })

    it('includes a dispensary at exactly the selected distance', () => {
      localStorage.setItem('gma_distance_miles', '10')
      mockUseDeals.mockReturnValue({
        data: withData([atDistance('edge', 'Edge', 10)]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getByText('Edge deal')).toBeInTheDocument()
    })

    it('shows all coverage-zone dispensaries at the 50-mile maximum', () => {
      localStorage.setItem('gma_distance_miles', '50')
      mockUseDeals.mockReturnValue({
        data: withData([atDistance('a', 'Closest', 2.5), atDistance('z', 'Farthest', 50)]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })

    it('reads a persisted gma_distance_miles of 30 on load and filters with it', () => {
      localStorage.setItem('gma_distance_miles', '30')
      mockUseDeals.mockReturnValue({
        data: withData([atDistance('d', 'Far', 12.5), atDistance('x', 'Out of range', 35)]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getByRole('slider', { name: 'Within' })).toHaveValue('30')
      expect(screen.getByText('Far deal')).toBeInTheDocument()
      expect(screen.queryByText('Out of range deal')).not.toBeInTheDocument()
    })

    it.each(['abc', '0', '-5', '75', 'null', '"30"', '12.5'])(
      'falls back to 50 when gma_distance_miles holds %s',
      (stored) => {
        localStorage.setItem('gma_distance_miles', stored)
        // "Out of range" sits beyond the 50-mi default so the fallback still excludes it
        mockUseDeals.mockReturnValue({
          data: withData([atDistance('d', 'Far', 12.5), atDistance('x', 'Out of range', 55)]),
          isLoading: false,
          error: null,
        })
        render(<DealFeed />)

        expect(screen.getByRole('slider', { name: 'Within' })).toHaveValue('50')
        expect(screen.getByText('Far deal')).toBeInTheDocument()
        expect(screen.queryByText('Out of range deal')).not.toBeInTheDocument()
      },
    )

    it.each([
      ['1', '1 mile'],
      ['50', '50 miles'],
    ])('accepts the persisted boundary value %s', (stored, valueText) => {
      localStorage.setItem('gma_distance_miles', stored)
      mockUseDeals.mockReturnValue({ data: fourDispensaries(), isLoading: false, error: null })
      render(<DealFeed />)

      const slider = screen.getByRole('slider', { name: 'Within' })
      expect(slider).toHaveValue(stored)
      expect(slider).toHaveAttribute('aria-valuetext', valueText)
    })

    it('keeps the slider visible and usable when filtering empties the feed', () => {
      localStorage.setItem('gma_distance_miles', '1')
      mockUseDeals.mockReturnValue({
        data: withData([atDistance('a', 'Closest', 2.5)]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getByText('No active deals right now')).toBeInTheDocument()
      const slider = screen.getByRole('slider', { name: 'Within' })

      fireEvent.change(slider, { target: { value: '25' } })

      expect(screen.getByText('Closest deal')).toBeInTheDocument()
      expect(screen.queryByText('No active deals right now')).not.toBeInTheDocument()
    })
  })

  describe('stale source indicator', () => {
    const named = (id: string, name: string, overrides: Partial<Dispensary> = {}): Dispensary => ({
      ...makeDispensary(id, name, [makeDeal({ description: `${name} deal` })]),
      ...overrides,
    })

    it('shows no "unavailable" text when every dispensary is fresh', () => {
      mockUseDeals.mockReturnValue({
        data: withData([named('a', 'Alpha'), named('b', 'Bravo')]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument()
    })

    it('omits a stale dispensary and shows the singular count', () => {
      mockUseDeals.mockReturnValue({
        data: withData([
          named('a', 'Alpha'),
          named('b', 'Bravo'),
          named('c', 'Charlie'),
          named('d', 'Delta', { stale: true }),
        ]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expect(screen.queryByText('Delta deal')).not.toBeInTheDocument()
      expect(screen.getByText('1 source unavailable')).toBeInTheDocument()
    })

    it('omits two of four stale dispensaries and shows "2 sources unavailable" with the list intact (AC2)', () => {
      mockUseDeals.mockReturnValue({
        data: withData([
          named('a', 'Alpha'),
          named('b', 'Bravo', { stale: true }),
          named('c', 'Charlie'),
          named('d', 'Delta', { stale: true }),
        ]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(screen.queryByText('Bravo deal')).not.toBeInTheDocument()
      expect(screen.queryByText('Delta deal')).not.toBeInTheDocument()
      expect(screen.getByText('2 sources unavailable')).toBeInTheDocument()
    })

    it('treats a missing stale property as fresh', () => {
      const noStaleField = named('m', 'Missing')
      delete (noStaleField as Partial<Dispensary>).stale
      mockUseDeals.mockReturnValue({ data: withData([noStaleField]), isLoading: false, error: null })
      render(<DealFeed />)

      expect(screen.getByText('Missing deal')).toBeInTheDocument()
      expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument()
    })

    it('counts several stale sources with plural copy and keeps only fresh ones', () => {
      mockUseDeals.mockReturnValue({
        data: withData([
          named('a', 'Alpha', { stale: true }),
          named('b', 'Bravo', { stale: true }),
          named('c', 'Charlie', { stale: true }),
          named('d', 'Delta'),
          named('e', 'Echo'),
        ]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(screen.getByText('3 sources unavailable')).toBeInTheDocument()
    })

    it('shows the empty state together with the indicator when all sources are stale', () => {
      mockUseDeals.mockReturnValue({
        data: withData([named('a', 'Alpha', { stale: true }), named('b', 'Bravo', { stale: true })]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getByText('No active deals right now')).toBeInTheDocument()
      expect(screen.getByText('2 sources unavailable')).toBeInTheDocument()
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    })

    it('keeps the count independent of the distance filter', () => {
      localStorage.setItem('gma_distance_miles', '10')
      mockUseDeals.mockReturnValue({
        data: withData([
          named('near', 'Near', { distanceMiles: 5 }),
          named('far-stale', 'Far Stale', { distanceMiles: 40, stale: true }),
        ]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.getByText('Near deal')).toBeInTheDocument()
      expect(screen.getByText('1 source unavailable')).toBeInTheDocument()
    })

    it.each([['"true"', '"true"'], ['1', '1'], ['null', 'null']])(
      'treats a garbage stale value (%s) as not stale',
      (_label, raw) => {
        const garbage = named('g', 'Garbage')
        // simulate an out-of-contract payload value reaching the client
        ;(garbage as unknown as Record<string, unknown>).stale = JSON.parse(raw)
        mockUseDeals.mockReturnValue({
          data: withData([garbage]),
          isLoading: false,
          error: null,
        })
        render(<DealFeed />)

        expect(screen.getByText('Garbage deal')).toBeInTheDocument()
        expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument()
      },
    )
  })
})
