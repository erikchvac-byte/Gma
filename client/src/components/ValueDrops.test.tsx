import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ValueDrops from './ValueDrops'
import type { Dispensary, PriceDropRow, StoreStatus } from '../types'

// ValueDrops calls useValueDrops() internally; mock it so each test drives the drops directly.
vi.mock('../hooks/useValueDrops', () => ({ useValueDrops: vi.fn() }))
import { useValueDrops } from '../hooks/useValueDrops'
const mockedUseValueDrops = vi.mocked(useValueDrops)

const setDrops = (drops: PriceDropRow[]) =>
  mockedUseValueDrops.mockReturnValue({ drops, isLoading: false, error: null })

const store = (id: string, name: string, status: StoreStatus = 'ok'): Dispensary => ({
  id,
  name,
  url: 'https://example.com',
  stale: false,
  lastFetchedAt: '2026-07-13T07:00:00Z',
  status,
  deals: [],
})

const dropRow = (over: Partial<PriceDropRow> = {}): PriceDropRow => ({
  dispensaryId: 'store-a',
  productId: 'p1',
  name: 'Blue Dream',
  category: 'flower',
  option: '1/8 oz',
  currentPrice: 32.4,
  medianPrice: 40,
  pctVsMedian: -0.19,
  ...over,
})

describe('ValueDrops', () => {
  beforeEach(() => mockedUseValueDrops.mockReset())

  it('renders nothing when there are no drops today', () => {
    setDrops([])
    const { container } = render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the product name, joined store name, option, percent and $ figures (AC3)', () => {
    setDrops([dropRow()])
    render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)

    const region = screen.getByRole('region', { name: 'Real price drops' })
    expect(within(region).getByText('Blue Dream')).toBeInTheDocument()
    // meta line: joined store name · verbatim option label
    expect(within(region).getByText('Green Fields · 1/8 oz')).toBeInTheDocument()
    // whole-number percent, amber magnitude
    expect(within(region).getByText('19%')).toBeInTheDocument()
    expect(within(region).getByText(/below its usual/)).toBeInTheDocument()
    // side-by-side dollars, both 2dp
    expect(within(region).getByText('$32.40 vs $40.00 usual')).toBeInTheDocument()
  })

  it('formats percent as a whole number and dollars to 2dp (Honest Math)', () => {
    // -0.194 rounds to 19; a .0 price still shows two decimals
    setDrops([dropRow({ pctVsMedian: -0.194, currentPrice: 30, medianPrice: 37.2 })])
    render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)
    expect(screen.getByText('19%')).toBeInTheDocument()
    expect(screen.getByText('$30.00 vs $37.20 usual')).toBeInTheDocument()
  })

  it('suppresses a genuine mover whose displayed percent rounds to 0% (Honest Math)', () => {
    // server emits movers down to ±0.01%; a −0.4% drop would render "0% below its usual" — a
    // claimed drop with no visible magnitude, so the whole (only) row is suppressed.
    setDrops([dropRow({ pctVsMedian: -0.004 })])
    const { container } = render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('omits the middot separator when the option label is empty', () => {
    setDrops([dropRow({ option: '' })])
    render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)
    // meta collapses to the bare store name — no dangling "Green Fields · "
    expect(screen.getByText('Green Fields')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('drops a row whose store is absent from the loaded list (AC5)', () => {
    setDrops([dropRow({ dispensaryId: 'gone' })])
    const { container } = render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)
    // its only row dropped → whole section absent
    expect(container).toBeEmptyDOMElement()
  })

  it('drops rows whose store status is failed or stale, keeps ok stores (AC5)', () => {
    setDrops([
      dropRow({ dispensaryId: 'a', productId: 'p1', name: 'Alpha' }),
      dropRow({ dispensaryId: 'b', productId: 'p2', name: 'Bravo' }),
      dropRow({ dispensaryId: 'c', productId: 'p3', name: 'Charlie' }),
    ])
    render(
      <ValueDrops
        dispensaries={[
          store('a', 'Store A', 'ok'),
          store('b', 'Store B', 'stale'),
          store('c', 'Store C', 'failed'),
        ]}
      />,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument()
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
    // count reflects the rendered rows only — never the pre-join total
    expect(screen.getByText('1 today')).toBeInTheDocument()
  })

  it('never shows a banner discount % or a verdict word (Gate 2 + ADR-009)', () => {
    setDrops([dropRow()])
    const { container } = render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)
    const text = container.textContent ?? ''
    // no verdict/marketing language
    expect(text).not.toMatch(/great deal|best|steal|deal of the day|you save|% off/i)
    // the only percent on the surface is the own-median drop, phrased "below its usual"
    expect(text).toContain('below its usual')
    expect(text).not.toMatch(/\boff\b/i)
  })

  it('exposes a spelled-out accessible name carrying the full product name', () => {
    setDrops([dropRow({ name: 'Blue Dream Reserve Cut' })])
    render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)
    expect(
      screen.getByLabelText(
        'Blue Dream Reserve Cut at Green Fields, 1/8 oz, 19 percent below its usual price, $32.40 versus $40.00 usual.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps the store feed uncoupled — its own <ul> region is separate', () => {
    setDrops([dropRow()])
    render(<ValueDrops dispensaries={[store('store-a', 'Green Fields')]} />)
    const region = screen.getByRole('region', { name: 'Real price drops' })
    // exactly one list, holding one row — not nested in any deal feed
    expect(within(region).getAllByRole('list')).toHaveLength(1)
    expect(within(region).getAllByRole('listitem')).toHaveLength(1)
  })
})
