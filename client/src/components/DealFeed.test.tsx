import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import DealFeed from './DealFeed'
import { useDeals } from '../hooks/useDeals'
import type { ApiDataResponse, Deal, Dispensary } from '../types'

vi.mock('../hooks/useDeals')

// applyUserDistance is unit-tested in withUserDistance.test.ts. Here it is mocked
// to an identity so these tests can inject `distanceMiles` directly and focus on
// the filter / nearest-first sort / pill / gas-line behavior DOWNSTREAM of the
// transform. The transform's location gating (CAP-2: no location → no distance;
// CAP-3: user-relative compute) is covered in DealFeed.distance.test.tsx.
vi.mock('../utils/withUserDistance', () => ({
  applyUserDistance: (dispensaries: unknown) => dispensaries,
}))

const mockUseDeals = vi.mocked(useDeals)

// Figures and the discount now render in their own styled <span>s, so a line's
// text spans multiple nodes. getByText sees only an element's direct text
// nodes, so match on full (nested) textContent for those lines.
const hasText = (text: string) => (_content: string, node: Element | null) =>
  node?.textContent?.replace(/\s+/g, ' ').trim() === text

const meta = {
  lastScraperRun: '2026-06-10T07:45:00',
  gasPrice: 4.1,
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

  it('renders one card per store, deals grouped inside, equidistant stores in best-deal order', () => {
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
    // mpg supplied → gas lines render (no national-average fallback anymore)
    render(<DealFeed mpg={28} />)

    // one listitem per STORE (Charlie is dealless → omitted); both stores are
    // equidistant (5 mi), so the best-deal tie-break decides: Bravo's soonest HH
    // (ends 23:30) beats Alpha's overnight HH (ends 02:00) → Bravo first
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Bravo Buds')).toBeInTheDocument()
    expect(within(items[1]).getByText('Alpha Greens')).toBeInTheDocument()

    // Bravo card header: cyan distance pill + cyan gas line (5 mi × 2 ×
    // 4.1/28 = $1.46); all three of its deals are grouped inside, in sort order
    expect(within(items[0]).getByText(hasText('5.0 mi'), { selector: '.gma-distance-pill' })).toBeInTheDocument()
    expect(within(items[0]).getByText(hasText('$1.46'), { selector: '.gma-gas-line' })).toBeInTheDocument()
    expect(within(items[0]).getAllByText(/\$1\.46/)).toHaveLength(1)
    expect(within(items[0]).getByText('30%')).toBeInTheDocument()
    expect(within(items[0]).getByText('8:00 PM – 11:30 PM')).toBeInTheDocument()
    // store-level urgency = soonest live countdown (HH ending 23:30), shown pink
    expect(within(items[0]).getByText(hasText('ends in 0:30'), { selector: '.gma-countdown' })).toBeInTheDocument()
    expect(within(items[0]).getByText('all-day HH')).toBeInTheDocument()
    expect(within(items[0]).getByText('35%')).toBeInTheDocument()
    const bravoText = items[0].textContent ?? ''
    expect(bravoText.indexOf('soonest HH')).toBeLessThan(bravoText.indexOf('all-day HH'))
    expect(bravoText.indexOf('all-day HH')).toBeLessThan(bravoText.indexOf('daily thirty-five'))

    // Alpha card: overnight HH active at 23:00 (countdown 3:00), then daily twenty
    expect(within(items[1]).getByText('10:00 PM – 2:00 AM')).toBeInTheDocument()
    expect(within(items[1]).getByText(hasText('ends in 3:00'), { selector: '.gma-countdown' })).toBeInTheDocument()
    expect(within(items[1]).getByText('20%')).toBeInTheDocument()

    expect(screen.getByText('Last updated Jun 10, 7:45 AM')).toBeInTheDocument()
    expect(screen.queryByText('Charlie Cannabis')).not.toBeInTheDocument()
    expect(screen.queryByText('No active deals right now')).not.toBeInTheDocument()
  })

  it('orders store cards by distance, nearest first, regardless of deal priority', () => {
    const far = { ...makeDispensary('far', 'Far Buds', [
      makeDeal({ type: 'happy_hour', description: 'far soonest HH', startTime: '20:00', endTime: '23:30' }),
    ]), distanceMiles: 12 }
    const near = { ...makeDispensary('near', 'Near Greens', [
      makeDeal({ type: 'daily', description: 'near weak daily', discountPct: 15 }),
    ]), distanceMiles: 5 }
    mockUseDeals.mockReturnValue({ data: withData([far, near]), isLoading: false, error: null })
    render(<DealFeed />)

    // Near Greens is closer, so its card comes first even though Far Buds has the
    // higher-priority deal
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Near Greens')).toBeInTheDocument()
    expect(within(items[1]).getByText('Far Buds')).toBeInTheDocument()
  })

  it('computes each card from its own dispensary distance', () => {
    const near = makeDispensary('near', 'Near Greens', [
      makeDeal({ type: 'daily', description: 'near deal', discountPct: 20 }),
    ])
    const far = { ...makeDispensary('far', 'Far Buds', [
      makeDeal({ type: 'daily', description: 'far deal', discountPct: 30 }),
    ]), distanceMiles: 12.4 }
    mockUseDeals.mockReturnValue({ data: withData([near, far]), isLoading: false, error: null })
    render(<DealFeed mpg={28} />)

    // each store's header carries its own distance pill + gas line
    expect(screen.getByText(hasText('12.4 mi'), { selector: '.gma-distance-pill' })).toBeInTheDocument()
    expect(screen.getByText(hasText('$3.63'), { selector: '.gma-gas-line' })).toBeInTheDocument()
    expect(screen.getByText(hasText('5.0 mi'), { selector: '.gma-distance-pill' })).toBeInTheDocument()
    expect(screen.getByText(hasText('$1.46'), { selector: '.gma-gas-line' })).toBeInTheDocument()
  })

  it('shows no gas line when no vehicle mpg is provided, but keeps the distance pill', () => {
    mockUseDeals.mockReturnValue({
      data: withData([
        makeDispensary('a', 'Alpha Greens', [makeDeal({ type: 'daily', description: 'a deal', discountPct: 10 })]),
      ]),
      isLoading: false,
      error: null,
    })
    render(<DealFeed />)

    // CAP-4: the hardcoded national-average MPG was removed — no vehicle → no gas
    // figure (Honest Math), but distance still shows from distanceMiles alone.
    const item = screen.getByRole('listitem')
    expect(item.querySelector('.gma-gas-line')).toBeNull()
    expect(within(item).getByText(hasText('5.0 mi'), { selector: '.gma-distance-pill' })).toBeInTheDocument()
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
    expect(screen.getByText(hasText('$2.05'), { selector: '.gma-gas-line' })).toBeInTheDocument()
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
    render(<DealFeed mpg={28} />)

    const item = screen.getByRole('listitem')
    expect(within(item).getByText('malformed HH')).toBeInTheDocument()
    expect(within(item).getByText('10%')).toBeInTheDocument()
    expect(within(item).getByText(hasText('5.0 mi'), { selector: '.gma-distance-pill' })).toBeInTheDocument()
    expect(within(item).getByText(hasText('$1.46'), { selector: '.gma-gas-line' })).toBeInTheDocument()
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

    expect(screen.getByText(hasText('ends in 0:30'), { selector: '.gma-countdown' })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60000)
    })

    expect(screen.getByText(hasText('ends in 0:29'), { selector: '.gma-countdown' })).toBeInTheDocument()
    expect(screen.queryByText(hasText('ends in 0:30'), { selector: '.gma-countdown' })).not.toBeInTheDocument()
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
    expect(within(item).getByText('35%', { selector: 'span' })).toBeInTheDocument()
    expect(item.textContent).not.toContain('to get there')
  })

  describe('category icon filter bar', () => {
    const mixed = () =>
      withData([
        makeDispensary('vape', 'Vape Only', [makeDeal({ description: '20% off vapes' })]),
        makeDispensary('edible', 'Edible Only', [makeDeal({ description: '10% off gummies' })]),
        makeDispensary('both', 'Both Kinds', [
          makeDeal({ description: '20% off vape carts' }),
          makeDeal({ description: '15% off edibles' }),
        ]),
      ])

    it('shows only the icons of categories present on the page, none pressed by default', () => {
      mockUseDeals.mockReturnValue({ data: mixed(), isLoading: false, error: null })
      render(<DealFeed />)

      const bar = screen.getByRole('group', { name: 'Filter deals by category' })
      expect(within(bar).getAllByRole('button')).toHaveLength(2)
      expect(within(bar).getByRole('button', { name: 'Vapes' })).toHaveAttribute('aria-pressed', 'false')
      expect(within(bar).getByRole('button', { name: 'Edibles' })).toHaveAttribute('aria-pressed', 'false')
      // no store carries flower → no bud icon in the bar
      expect(within(bar).queryByRole('button', { name: 'Flower' })).not.toBeInTheDocument()
      // the old Deal.type chips are gone
      expect(screen.queryByRole('button', { name: 'All deals' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })

    it('filters to the clicked category, dropping non-carrying stores, with no network request', () => {
      const fetchSpy = vi.spyOn(window, 'fetch')
      mockUseDeals.mockReturnValue({ data: mixed(), isLoading: false, error: null })
      render(<DealFeed />)

      fireEvent.click(screen.getByRole('button', { name: 'Vapes' }))

      expect(screen.getByRole('button', { name: 'Vapes' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(screen.getByText('Vape Only')).toBeInTheDocument()
      expect(screen.getByText('Both Kinds')).toBeInTheDocument()
      expect(screen.queryByText('Edible Only')).not.toBeInTheDocument()
      // the mixed store hides its edible deal under the vape selection
      // (the title renders as 'edibles' once the badge strips its '15% off')
      expect(screen.queryByText('edibles')).not.toBeInTheDocument()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('keeps every icon in the bar while one is pressed (presence is pre-filter)', () => {
      mockUseDeals.mockReturnValue({ data: mixed(), isLoading: false, error: null })
      render(<DealFeed />)

      fireEvent.click(screen.getByRole('button', { name: 'Vapes' }))

      // the edible icon must not vanish just because vape is selected
      expect(screen.getByRole('button', { name: 'Edibles' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('restores the full feed when the pressed icon is clicked again', () => {
      mockUseDeals.mockReturnValue({ data: mixed(), isLoading: false, error: null })
      render(<DealFeed />)

      fireEvent.click(screen.getByRole('button', { name: 'Vapes' }))
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      fireEvent.click(screen.getByRole('button', { name: 'Vapes' }))
      expect(screen.getByRole('button', { name: 'Vapes' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })

    it('renders no bar at all when no active deal carries a category tag', () => {
      mockUseDeals.mockReturnValue({
        data: withData([makeDispensary('a', 'Dealless Dispensary', [])]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      expect(screen.queryByRole('group', { name: 'Filter deals by category' })).not.toBeInTheDocument()
    })

    it('clears a selection whose category leaves the page (icon gone → full feed, not stuck-empty)', () => {
      // the vape deal's happy hour ends at 23:30; the fixed clock starts at 23:00
      mockUseDeals.mockReturnValue({
        data: withData([
          makeDispensary('vape', 'Vape Only', [
            makeDeal({ type: 'happy_hour', description: '20% off vapes', startTime: '20:00', endTime: '23:30' }),
          ]),
          makeDispensary('edible', 'Edible Only', [makeDeal({ description: '10% off gummies' })]),
        ]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      fireEvent.click(screen.getByRole('button', { name: 'Vapes' }))
      expect(screen.getAllByRole('listitem')).toHaveLength(1)

      // tick past the happy hour's end — the page's last vape deal expires
      act(() => {
        vi.advanceTimersByTime(45 * 60 * 1000)
      })

      // its icon left the bar and the selection is treated as cleared
      expect(screen.queryByRole('button', { name: 'Vapes' })).not.toBeInTheDocument()
      expect(screen.getByText('Edible Only')).toBeInTheDocument()

      // the category returns (a refetch lands an all-day vape deal) — the
      // CLEARED selection must not resurrect and silently re-narrow the feed
      mockUseDeals.mockReturnValue({
        data: withData([
          makeDispensary('vape', 'Vape Only', [makeDeal({ description: '20% off vapes' })]),
          makeDispensary('edible', 'Edible Only', [makeDeal({ description: '10% off gummies' })]),
        ]),
        isLoading: false,
        error: null,
      })
      act(() => {
        vi.advanceTimersByTime(60 * 1000) // one useNow tick → re-render on new data
      })

      expect(screen.getByRole('button', { name: 'Vapes' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
      expect(screen.getByText('Edible Only')).toBeInTheDocument()
    })
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

    it('never drops a store that has no distance, even at the narrowest slider (ADR-043)', () => {
      localStorage.setItem('gma_distance_miles', '1')
      const noDistance = makeDispensary('nd', 'No Distance', [makeDeal({ description: 'No Distance deal' })])
      delete (noDistance as Partial<Dispensary>).distanceMiles
      mockUseDeals.mockReturnValue({
        data: withData([atDistance('far', 'Far', 40), noDistance]),
        isLoading: false,
        error: null,
      })
      render(<DealFeed />)

      // 1-mile radius excludes the 40-mi store but the undistanced store stays —
      // the filter only narrows stores that actually have a distance to compare
      expect(screen.queryByText('Far deal')).not.toBeInTheDocument()
      expect(screen.getByText('No Distance deal')).toBeInTheDocument()
      // and it renders without a distance pill or gas line
      const item = screen.getByRole('listitem')
      expect(item.querySelector('.gma-distance-pill')).toBeNull()
      expect(item.querySelector('.gma-gas-line')).toBeNull()
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

// CAP-1 + CAP-2: a non-stale store whose lastFetchedAt is older than DEAL_EXPIRY_MS
// (24h) has its cached deals treated as expired. It is NOT dropped — it renders in
// place with "No current deals", keeping its distance position, while a fresh store
// is unaffected. System time is 2026-06-10 23:00 (see beforeEach).
describe('DealFeed — stale deal expiry (CAP-1/CAP-2)', () => {
  // own fake-timer setup (sibling describe → does not inherit the main one). Pins
  // "now" to 2026-06-10 23:00 so the lastFetchedAt ages below are deterministic.
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 23, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('expires a >24h-old store to "No current deals" while a fresh store shows its deal', () => {
    const expired: Dispensary = {
      ...makeDispensary('old', 'Stale Cannabis', [makeDeal({ description: 'OLD JUNE SALE', discountPct: 40 })]),
      lastFetchedAt: '2026-06-08T07:00:00', // ~2.7 days old → expired
    }
    const fresh: Dispensary = {
      ...makeDispensary('new', 'Fresh Cannabis', [makeDeal({ description: 'Fresh Daily Deal', discountPct: 20 })]),
      lastFetchedAt: '2026-06-10T20:00:00', // 3h old → live
    }
    mockUseDeals.mockReturnValue({ data: withData([expired, fresh]), isLoading: false, error: null })
    render(<DealFeed />)

    // expired store still present, but its cached deal is suppressed
    expect(screen.getByText('No current deals')).toBeInTheDocument()
    expect(screen.queryByText('OLD JUNE SALE')).not.toBeInTheDocument()
    // fresh store unaffected
    expect(screen.getByText('Fresh Daily Deal')).toBeInTheDocument()
    // neither store dropped: both cards render
    expect(screen.getByRole('link', { name: /Stale Cannabis/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fresh Cannabis/ })).toBeInTheDocument()
  })

  it('keeps an expired store in its nearest-first distance position (not sorted lower)', () => {
    const nearExpired: Dispensary = {
      ...makeDispensary('near', 'Near Expired', [makeDeal({ description: 'gone' })]),
      lastFetchedAt: '2026-06-01T07:00:00',
      distanceMiles: 2,
    }
    const farFresh: Dispensary = {
      ...makeDispensary('far', 'Far Fresh', [makeDeal({ description: 'here' })]),
      lastFetchedAt: '2026-06-10T20:00:00',
      distanceMiles: 40,
    }
    mockUseDeals.mockReturnValue({ data: withData([farFresh, nearExpired]), isLoading: false, error: null })
    render(<DealFeed />)

    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    // nearer expired store still sorts first despite having no current deals
    expect(names[0]).toMatch(/Near Expired/)
    expect(names[1]).toMatch(/Far Fresh/)
  })

  // Ask-First decision D-chip: expired "No current deals" cards are shown only in
  // the unfiltered feed; a category selection narrows to active deals of that
  // category, which an expired store by definition has none of.
  it('hides expired cards while a category icon is selected', () => {
    const expired: Dispensary = {
      ...makeDispensary('old', 'Stale Cannabis', [makeDeal({ description: 'OLD SALE' })]),
      lastFetchedAt: '2026-06-01T07:00:00',
    }
    const fresh: Dispensary = {
      ...makeDispensary('new', 'Fresh Cannabis', [makeDeal({ description: '20% off vapes' })]),
      lastFetchedAt: '2026-06-10T20:00:00',
    }
    mockUseDeals.mockReturnValue({ data: withData([expired, fresh]), isLoading: false, error: null })
    render(<DealFeed />)

    // unfiltered: the expired card shows
    expect(screen.getByText('No current deals')).toBeInTheDocument()
    // select the vape icon → expired store drops, only the fresh match remains
    fireEvent.click(screen.getByRole('button', { name: 'Vapes' }))
    expect(screen.queryByText('No current deals')).not.toBeInTheDocument()
    expect(screen.queryByText(/Stale Cannabis/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fresh Cannabis/ })).toBeInTheDocument()
  })

  it('does not surface a store with NO cached deals as an empty "No current deals" card', () => {
    const neverIngested: Dispensary = {
      // stale:false but never ingested (empty deals, epoch-ish timestamp) — nothing
      // to expire, so it must stay invisible exactly as before this feature
      ...makeDispensary('ghost', 'Ghost Cannabis', []),
      lastFetchedAt: '2026-06-01T07:00:00',
    }
    mockUseDeals.mockReturnValue({ data: withData([neverIngested]), isLoading: false, error: null })
    render(<DealFeed />)

    expect(screen.queryByText('No current deals')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ghost Cannabis/ })).not.toBeInTheDocument()
    expect(screen.getByText('No active deals right now')).toBeInTheDocument()
  })

  // AC3: a store already flagged stale:true stays in the "sources unavailable"
  // count and is NEVER rendered as a "No current deals" card (the stale drop runs
  // before the expiry split — pins that ordering against future refactors).
  it('keeps a stale:true store in the unavailable count, not as a "No current deals" card', () => {
    const staleStore: Dispensary = {
      ...makeDispensary('down', 'Down Cannabis', [makeDeal({ description: 'old deal' })]),
      stale: true,
      lastFetchedAt: '2026-06-01T07:00:00',
    }
    mockUseDeals.mockReturnValue({ data: withData([staleStore]), isLoading: false, error: null })
    render(<DealFeed />)

    expect(screen.queryByText('No current deals')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Down Cannabis/ })).not.toBeInTheDocument()
    expect(screen.getByText('1 source unavailable')).toBeInTheDocument()
  })
})
