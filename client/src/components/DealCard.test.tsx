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
    expect(screen.getByText('25% off — $3.63 to get there')).toBeInTheDocument()
    expect(screen.getByText('9:00 PM – 11:30 PM')).toBeInTheDocument()
    expect(screen.getByText('0:30 left')).toBeInTheDocument()
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
    expect(screen.getByText('35% off — $1.80 to get there')).toBeInTheDocument()
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

    expect(screen.getByText('35% off')).toBeInTheDocument()
    expect(container.textContent).not.toContain('to get there')
    expect(container.textContent).not.toContain('—')
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
    expect(screen.getByText('25% off — $3.63 to get there')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
    expect(screen.queryByText(/AM|PM|close|Active today/)).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('NaN')
  })
})
