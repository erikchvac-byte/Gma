import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DealCard from './DealCard'
import type { Deal, Dispensary } from '../types'

const makeDeal = (overrides: Partial<Deal>): Deal => ({
  type: 'happy_hour',
  description: 'Happy hour special',
  discountPct: 25,
  startTime: '21:00',
  endTime: '23:30',
  daysValid: ['everyday'],
  ...overrides,
})

const makeDispensary = (overrides: Partial<Dispensary>): Dispensary => ({
  id: 'a',
  name: 'Alpha Greens',
  url: 'https://example.com/a',
  distanceMiles: 12.42,
  stale: false,
  lastFetchedAt: '2026-06-10T07:00:00',
  deals: [],
  ...overrides,
})

// Figures (gas, countdown) and the discount now render in their own styled
// <span>s, so a line's text spans multiple nodes. getByText sees only an
// element's direct text nodes, so match on full (nested) textContent instead.
const byFullText = (text: string) =>
  screen.getByText(
    (_content: string, node: Element | null) =>
      node?.textContent?.replace(/\s+/g, ' ').trim() === text,
  )

describe('DealCard', () => {
  it('renders a timed happy hour with window, countdown, and the side-by-side Discount Display', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({})}
        windowText="9:00 PM – 11:30 PM"
        countdown="0:30"
        gasCostText="$3.63"
      />,
    )

    expect(screen.getByText('Alpha Greens')).toBeInTheDocument()
    expect(screen.getByText('12.4 miles')).toBeInTheDocument()
    expect(screen.getByText('Happy hour special')).toBeInTheDocument()
    expect(byFullText('25% off — $3.63 to get there')).toBeInTheDocument()
    expect(screen.getByText('9:00 PM – 11:30 PM')).toBeInTheDocument()
    expect(byFullText('0:30 left')).toBeInTheDocument()
  })

  it('shows an urgent "Happy hour" badge for happy-hour deals', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({})}
        windowText="9:00 PM – 11:30 PM"
        countdown="0:30"
        gasCostText="$3.63"
      />,
    )

    expect(screen.getByText('Happy hour')).toBeInTheDocument()
    expect(screen.queryByText('Daily deal')).not.toBeInTheDocument()
  })

  it('shows a neutral "Daily deal" badge for daily deals', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ type: 'daily', startTime: null, endTime: null })}
        windowText="Active today"
        countdown={null}
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('Daily deal')).toBeInTheDocument()
    expect(screen.queryByText('Happy hour')).not.toBeInTheDocument()
  })

  it('renders an until-close happy hour without a countdown', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ endTime: null })}
        windowText="9:00 PM – close"
        countdown={null}
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('9:00 PM – close')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
  })

  it('renders an all-day happy hour as "Active today" without a countdown', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ startTime: null, endTime: null })}
        windowText="Active today"
        countdown={null}
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('Active today')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
  })

  it('renders a daily deal as "Active today" with the side-by-side Discount Display', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ type: 'daily', description: 'Daily special', discountPct: 35, startTime: null, endTime: null })}
        windowText="Active today"
        countdown={null}
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('Daily special')).toBeInTheDocument()
    expect(byFullText('35% off — $1.80 to get there')).toBeInTheDocument()
    expect(screen.getByText('Active today')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
  })

  it('renders the discount alone when gasCostText is null', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ type: 'daily', discountPct: 35, startTime: null, endTime: null })}
        windowText="Active today"
        countdown={null}
        gasCostText={null}
      />,
    )

    expect(screen.getByText('35% off', { selector: 'span' })).toBeInTheDocument()
    expect(container.textContent).not.toContain('to get there')
    expect(container.textContent).not.toContain('—')
  })

  it('renders gas cost alone (no "null% off") when discountPct is null', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ type: 'daily', description: 'Mystery deal', discountPct: null, startTime: null, endTime: null })}
        windowText="Active today"
        countdown={null}
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('Mystery deal')).toBeInTheDocument()
    expect(byFullText('$1.80 to get there')).toBeInTheDocument()
    expect(container.textContent).not.toContain('null')
    expect(container.textContent).not.toContain('% off')
  })

  it('omits the discount line entirely when both discountPct and gasCostText are null', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ type: 'daily', description: 'Mystery deal', discountPct: null, startTime: null, endTime: null })}
        windowText="Active today"
        countdown={null}
        gasCostText={null}
      />,
    )

    expect(screen.getByText('Mystery deal')).toBeInTheDocument()
    expect(container.textContent).not.toContain('null')
    expect(container.textContent).not.toContain('% off')
    expect(container.textContent).not.toContain('to get there')
  })

  it('formats whole-number distances with one decimal', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ distanceMiles: 12 })}
        deal={makeDeal({})}
        windowText="9:00 PM – 11:30 PM"
        countdown="0:30"
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('12.0 miles')).toBeInTheDocument()
  })

  it('renders no description paragraph when the description was suppressed ("")', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ description: '', discountPct: 30 })}
        windowText="Active today"
        countdown={null}
        gasCostText="$1.80"
      />,
    )

    // deal still renders with badge + discount + window, just no empty <p>
    expect(byFullText('30% off — $1.80 to get there')).toBeInTheDocument()
    expect(container.querySelectorAll('p').length).toBe(1) // only the discount line
  })

  it('renders malformed-time deals without window, countdown, or NaN text', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deal={makeDeal({ startTime: '14:00', endTime: '4pm' })}
        windowText={null}
        countdown={null}
        gasCostText="$3.63"
      />,
    )

    expect(screen.getByText('Alpha Greens')).toBeInTheDocument()
    expect(byFullText('25% off — $3.63 to get there')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
    expect(screen.queryByText(/AM|PM|close|Active today/)).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('NaN')
  })
})
