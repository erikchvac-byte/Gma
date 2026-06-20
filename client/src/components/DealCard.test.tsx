import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DealCard, { type DealView } from './DealCard'
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

const view = (deal: Partial<Deal>, windowText: string | null, countdown: string | null): DealView => ({
  deal: makeDeal(deal),
  windowText,
  countdown,
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

// figures (gas, countdown) render in their own styled <span>s, so a line's text
// spans multiple nodes. getByText sees only an element's direct text nodes, so
// match on full (nested) textContent instead.
const byFullText = (text: string, selector?: string) =>
  screen.getByText(
    (_content: string, node: Element | null) =>
      node?.textContent?.replace(/\s+/g, ' ').trim() === text,
    selector ? { selector } : undefined,
  )

describe('DealCard', () => {
  it('renders the store header once: name, distance, and a single gas line', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view({ description: 'Happy hour special' }, '9:00 PM – 11:30 PM', '0:30'),
          view({ type: 'daily', description: 'Daily special', discountPct: 35, startTime: null, endTime: null }, 'Active today', null),
        ]}
        gasCostText="$3.63"
      />,
    )

    expect(screen.getByText('Alpha Greens')).toBeInTheDocument()
    // distance + gas render once, together, in the header trip chip (ADR-038)
    expect(byFullText('12.4 mi · $3.63')).toBeInTheDocument()
    expect(screen.getAllByText(/\$3\.63/)).toHaveLength(1)
  })

  it('lists every deal of the store inside one card', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view({ description: 'Happy hour special' }, '9:00 PM – 11:30 PM', '0:30'),
          view({ type: 'daily', description: 'Daily special', discountPct: 35, startTime: null, endTime: null }, 'Active today', null),
        ]}
        gasCostText="$3.63"
      />,
    )

    const card = screen.getByRole('article')
    expect(within(card).getByText('Happy hour special')).toBeInTheDocument()
    expect(within(card).getByText('Daily special')).toBeInTheDocument()
    // store-level urgency badge reports the soonest live countdown (ADR-009)
    expect(byFullText('ends in 0:30', '.gma-badge')).toBeInTheDocument()
    // daily deal's metadata line
    expect(within(card).getByText('Daily deal · Active today')).toBeInTheDocument()
    // per-deal discount figure (gas no longer joins it)
    expect(within(card).getByText('25%')).toBeInTheDocument()
    expect(within(card).getByText('35%')).toBeInTheDocument()
    // happy-hour window stays per deal
    expect(within(card).getByText('9:00 PM – 11:30 PM')).toBeInTheDocument()
  })

  it('marks the card urgent when any deal is a happy hour, neutral when none are', () => {
    const { rerender } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText="$1.80"
      />,
    )
    expect(screen.getByText('Daily deal · Active today')).toBeInTheDocument()
    expect(screen.getByRole('article')).not.toHaveClass('gma-card--urgent')

    rerender(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null),
          view({ description: 'Happy hour special' }, '9:00 PM – 11:30 PM', '0:30'),
        ]}
        gasCostText="$1.80"
      />,
    )
    expect(screen.getByText('Happy hour special')).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveClass('gma-card--urgent')
  })

  it('renders an until-close happy hour without a countdown', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ endTime: null }, '9:00 PM – close', null)]}
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('9:00 PM – close')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
  })

  it('omits the gas line entirely when gasCostText is null', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', discountPct: 35, startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText={null}
      />,
    )

    expect(screen.getByText('35%')).toBeInTheDocument()
    // trip chip falls back to distance-only when gas is unavailable
    expect(byFullText('12.4 mi')).toBeInTheDocument()
    expect(container.textContent).not.toContain('to get there')
    // guard against re-introducing the old "discount — gas" joined line
    expect(container.textContent).not.toContain('—')
  })

  it('renders gas in the header (no "null% off") when a deal has no discount', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', description: 'Mystery deal', discountPct: null, startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('Mystery deal')).toBeInTheDocument()
    expect(byFullText('12.4 mi · $1.80')).toBeInTheDocument()
    expect(container.textContent).not.toContain('null')
    expect(container.textContent).not.toContain('%')
  })

  it('formats whole-number distances with one decimal', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ distanceMiles: 12 })}
        deals={[view({}, '9:00 PM – 11:30 PM', '0:30')]}
        gasCostText="$1.80"
      />,
    )

    expect(byFullText('12.0 mi · $1.80')).toBeInTheDocument()
  })

  it('renders no description paragraph when a deal description was suppressed ("")', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ description: '', discountPct: 30 }, '9:00 PM – 11:30 PM', '0:30')]}
        gasCostText="$1.80"
      />,
    )

    // deal still renders discount + window; title falls back to the kind label
    // ('Happy hour') instead of an empty node
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('Happy hour')).toBeInTheDocument()
    expect(screen.queryByText('Happy hour special')).not.toBeInTheDocument()
  })

  it('renders a malformed-time deal without window, countdown, or NaN text', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ startTime: '14:00', endTime: '4pm' }, null, null)]}
        gasCostText="$3.63"
      />,
    )

    expect(screen.getByText('Alpha Greens')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(byFullText('12.4 mi · $3.63')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
    expect(screen.queryByText(/AM|PM|close|Active today/)).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('NaN')
  })

  it('shows a neutral "active today" badge for a daily-only store (no countdown)', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText="$1.80"
      />,
    )

    const badge = screen.getByText('active today')
    expect(badge).toHaveClass('gma-badge--neutral')
    expect(screen.queryByText(/ends in/)).not.toBeInTheDocument()
  })
})
