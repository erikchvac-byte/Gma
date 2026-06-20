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
const byFullText = (text: string) =>
  screen.getByText(
    (_content: string, node: Element | null) =>
      node?.textContent?.replace(/\s+/g, ' ').trim() === text,
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
    expect(screen.getByText('12.4 miles')).toBeInTheDocument()
    // gas is per-store: rendered exactly once even with two deals
    expect(byFullText('$3.63 to get there')).toBeInTheDocument()
    expect(screen.getAllByText(/to get there/)).toHaveLength(1)
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
    // per-deal badges
    expect(within(card).getByText('Happy hour')).toBeInTheDocument()
    expect(within(card).getByText('Daily deal')).toBeInTheDocument()
    // per-deal discount (gas no longer joins it)
    expect(within(card).getByText('25% off')).toBeInTheDocument()
    expect(within(card).getByText('35% off')).toBeInTheDocument()
    // per-deal window + countdown
    expect(within(card).getByText('9:00 PM – 11:30 PM')).toBeInTheDocument()
    expect(byFullText('0:30 left')).toBeInTheDocument()
    expect(within(card).getByText('Active today')).toBeInTheDocument()
  })

  it('marks the card urgent when any deal is a happy hour, neutral when none are', () => {
    const { rerender } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText="$1.80"
      />,
    )
    expect(screen.getByText('Daily deal')).toBeInTheDocument()
    expect(screen.queryByText('Happy hour')).not.toBeInTheDocument()

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
    expect(screen.getByText('Happy hour')).toBeInTheDocument()
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

    expect(screen.getByText('35% off')).toBeInTheDocument()
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
    expect(byFullText('$1.80 to get there')).toBeInTheDocument()
    expect(container.textContent).not.toContain('null')
    expect(container.textContent).not.toContain('% off')
  })

  it('formats whole-number distances with one decimal', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ distanceMiles: 12 })}
        deals={[view({}, '9:00 PM – 11:30 PM', '0:30')]}
        gasCostText="$1.80"
      />,
    )

    expect(screen.getByText('12.0 miles')).toBeInTheDocument()
  })

  it('renders no description paragraph when a deal description was suppressed ("")', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ description: '', discountPct: 30 }, '9:00 PM – 11:30 PM', '0:30')]}
        gasCostText="$1.80"
      />,
    )

    // deal still renders badge + discount + window, just no empty description <p>
    expect(screen.getByText('30% off')).toBeInTheDocument()
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
    expect(screen.getByText('25% off')).toBeInTheDocument()
    expect(byFullText('$3.63 to get there')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
    expect(screen.queryByText(/AM|PM|close|Active today/)).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('NaN')
  })
})
