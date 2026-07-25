import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ValueDropStrip from './ValueDropStrip'
import { formatLastUpdated } from '../utils/formatTime'
import type { PriceDropRow } from '../types'

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

describe('ValueDropStrip', () => {
  it('renders nothing when there are no drops', () => {
    const { container } = render(<ValueDropStrip storeId="store-a" drops={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the product name, option-only meta, percent and $ figures (AC4)', () => {
    render(<ValueDropStrip storeId="store-a" drops={[dropRow()]} />)

    // the strip is a plain <div> (not an ARIA region — one landmark per card would flood
    // landmark nav); it is reached via its <h3> heading, so anchor assertions on that.
    expect(screen.getByRole('heading', { name: 'Real price drops', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('Blue Dream')).toBeInTheDocument()
    // the card IS the store, so the meta is the option label ONLY — no store name here
    expect(screen.getByText('1/8 oz')).toBeInTheDocument()
    expect(screen.getByText('19%')).toBeInTheDocument()
    expect(screen.getByText(/below its usual/)).toBeInTheDocument()
    expect(screen.getByText('$32.40 vs $40.00 usual')).toBeInTheDocument()
  })

  it('formats percent as a whole number and dollars to 2dp (Honest Math)', () => {
    render(
      <ValueDropStrip
        storeId="store-a"
        drops={[dropRow({ pctVsMedian: -0.194, currentPrice: 30, medianPrice: 37.2 })]}
      />,
    )
    expect(screen.getByText('19%')).toBeInTheDocument()
    expect(screen.getByText('$30.00 vs $37.20 usual')).toBeInTheDocument()
  })

  it('suppresses a genuine mover whose displayed percent rounds to 0% (Honest Math)', () => {
    const { container } = render(
      <ValueDropStrip storeId="store-a" drops={[dropRow({ pctVsMedian: -0.004 })]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('never surfaces an at/above-median row as a drop (AC4)', () => {
    const { container } = render(
      <ValueDropStrip storeId="store-a" drops={[dropRow({ pctVsMedian: 0.12 })]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('omits the meta line entirely when the option label is empty', () => {
    render(<ValueDropStrip storeId="store-a" drops={[dropRow({ option: '' })]} />)
    // no option → no meta node, no dangling separator
    expect(screen.queryByText('1/8 oz')).not.toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
    // the row still renders its figure
    expect(screen.getByText('19%')).toBeInTheDocument()
  })

  it('never shows a banner discount % or a verdict word (Gate 2 + ADR-009)', () => {
    const { container } = render(<ValueDropStrip storeId="store-a" drops={[dropRow()]} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/great deal|best|steal|deal of the day|you save|% off/i)
    expect(text).toContain('below its usual')
    expect(text).not.toMatch(/\boff\b/i)
  })

  it('exposes a spelled-out accessible name with the full product name and no store clause', () => {
    render(
      <ValueDropStrip storeId="store-a" drops={[dropRow({ name: 'Blue Dream Reserve Cut' })]} />,
    )
    // the card's <h2> announces the store, so the row name drops the "at {store}" clause
    expect(
      screen.getByLabelText(
        'Blue Dream Reserve Cut, 1/8 oz, 19 percent below its usual price, $32.40 versus $40.00 usual.',
      ),
    ).toBeInTheDocument()
  })

  it('is a single local list — not part of any deal feed', () => {
    const { container } = render(<ValueDropStrip storeId="store-a" drops={[dropRow()]} />)
    const strip = container.querySelector('.gma-value-drops') as HTMLElement
    expect(within(strip).getAllByRole('list')).toHaveLength(1)
    expect(within(strip).getAllByRole('listitem')).toHaveLength(1)
  })

  it('renders the same-store explainer note that defines "usual" (Fix 1a/1c)', () => {
    render(<ValueDropStrip storeId="store-a" drops={[dropRow()]} />)
    // "usual" is framed as THIS store's own recent typical price — not cross-store, not MSRP
    expect(screen.getByText(/Below this store's own recent typical price\./)).toBeInTheDocument()
  })

  it('surfaces the drops derive time as an honest freshness clause when present (Fix 1b)', () => {
    // a real past derive time — the date is formatLastUpdated(generatedAt), NOT the deal-scrape time
    const generatedAt = new Date(Date.now() - 60_000).toISOString()
    render(<ValueDropStrip storeId="store-a" drops={[dropRow()]} generatedAt={generatedAt} />)
    expect(
      screen.getByText(
        `Below this store's own recent typical price. Prices as of ${formatLastUpdated(generatedAt)}.`,
      ),
    ).toBeInTheDocument()
  })

  it('omits the freshness clause when no derive time is available (default null)', () => {
    render(<ValueDropStrip storeId="store-a" drops={[dropRow()]} />)
    // explainer still shows; no freshness line, and never a stray date
    expect(screen.getByText(/Below this store's own recent typical price\./)).toBeInTheDocument()
    expect(screen.queryByText(/Prices as of/)).not.toBeInTheDocument()
  })

  it('never renders a 1970 date even if handed the epoch sentinel directly (defense-in-depth)', () => {
    // the hook nulls epoch upstream, but the strip must be safe for any caller
    render(
      <ValueDropStrip
        storeId="store-a"
        drops={[dropRow()]}
        generatedAt="1970-01-01T00:00:00.000Z"
      />,
    )
    expect(screen.getByText(/Below this store's own recent typical price\./)).toBeInTheDocument()
    expect(screen.queryByText(/Prices as of/)).not.toBeInTheDocument()
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument()
  })

  it('omits the freshness clause for a future (clock-skewed) derive time', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    render(<ValueDropStrip storeId="store-a" drops={[dropRow()]} generatedAt={future} />)
    expect(screen.queryByText(/Prices as of/)).not.toBeInTheDocument()
  })

  it('draws a divider above the strip only when it follows a deal grid', () => {
    const { rerender, container } = render(
      <ValueDropStrip storeId="store-a" drops={[dropRow()]} divided />,
    )
    expect(container.querySelector('.gma-value-drops')).toHaveClass('gma-value-drops--divided')

    rerender(<ValueDropStrip storeId="store-a" drops={[dropRow()]} divided={false} />)
    expect(container.querySelector('.gma-value-drops')).not.toHaveClass('gma-value-drops--divided')
  })
})
