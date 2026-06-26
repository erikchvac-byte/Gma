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
  it('renders the store header once: name, a pink distance pill, and one gas line', () => {
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
    // Arcade (ADR-041): distance and gas are two separate pink figures
    expect(byFullText('12.4 mi', '.gma-distance-pill')).toBeInTheDocument()
    expect(byFullText('$3.63', '.gma-gas-line')).toBeInTheDocument()
    // gas still renders exactly once (not duplicated onto a deal)
    expect(screen.getAllByText(/\$3\.63/)).toHaveLength(1)
  })

  it('links the store name to its website, opening in a new tab', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ url: 'https://example.com/alpha-greens' })}
        deals={[]}
        gasCostText={null}
      />,
    )

    const link = screen.getByRole('link', { name: /Alpha Greens/ })
    expect(link).toHaveAttribute('href', 'https://example.com/alpha-greens')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // screen-reader-only context switch warning, no visible footprint
    expect(link).toHaveTextContent('opens in new tab')
  })

  it('falls back to plain text when the store has no url', () => {
    render(<DealCard dispensary={makeDispensary({ url: '' })} deals={[]} gasCostText={null} />)

    expect(screen.queryByRole('link', { name: /Alpha Greens/ })).not.toBeInTheDocument()
    expect(screen.getByText('Alpha Greens')).toBeInTheDocument()
  })

  it('falls back to plain text when the url is malformed or non-http(s)', () => {
    render(
      <DealCard dispensary={makeDispensary({ url: 'javascript:alert(1)' })} deals={[]} gasCostText={null} />,
    )

    expect(screen.queryByRole('link', { name: /Alpha Greens/ })).not.toBeInTheDocument()
    expect(screen.getByText('Alpha Greens')).toBeInTheDocument()
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
    // live happy hour → red badge + red countdown reporting soonest end (ADR-009)
    expect(within(card).getByText('Happy hour')).toHaveClass('gma-happy-badge')
    expect(byFullText('ends in 0:30', '.gma-countdown')).toBeInTheDocument()
    // daily deal's metadata line
    expect(within(card).getByText('Daily deal · Active today')).toBeInTheDocument()
    // per-deal discount figure + its quiet "off" companion (gas joins neither)
    expect(within(card).getByText('25%')).toBeInTheDocument()
    expect(within(card).getByText('35%')).toBeInTheDocument()
    expect(within(card).getAllByText('off')).toHaveLength(2)
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
    // distance pill still renders; the gas line is omitted entirely
    expect(byFullText('12.4 mi', '.gma-distance-pill')).toBeInTheDocument()
    expect(container.querySelector('.gma-gas-line')).toBeNull()
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
    expect(byFullText('12.4 mi', '.gma-distance-pill')).toBeInTheDocument()
    expect(byFullText('$1.80', '.gma-gas-line')).toBeInTheDocument()
    expect(container.textContent).not.toContain('null')
    // no discount → no figure, no "% off"
    expect(container.textContent).not.toContain('%')
    expect(container.textContent).not.toContain('off')
  })

  it('formats whole-number distances with one decimal', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ distanceMiles: 12 })}
        deals={[view({}, '9:00 PM – 11:30 PM', '0:30')]}
        gasCostText="$1.80"
      />,
    )

    expect(byFullText('12.0 mi', '.gma-distance-pill')).toBeInTheDocument()
    expect(byFullText('$1.80', '.gma-gas-line')).toBeInTheDocument()
  })

  it('renders no description paragraph when a deal description was suppressed ("")', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ description: '', discountPct: 30 }, '9:00 PM – 11:30 PM', '0:30')]}
        gasCostText="$1.80"
      />,
    )

    // deal still renders discount + window; the deal title falls back to the
    // kind label ('Happy hour') instead of an empty node. Scope to the title so
    // it isn't confused with the red "Happy hour" urgency badge above it.
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(byFullText('Happy hour', '.gma-deal-block__title')).toBeInTheDocument()
    expect(screen.queryByText('Happy hour special')).not.toBeInTheDocument()
  })

  it('drops a trailing cross-location tag from the deal title (Happy Time "PULLMAN")', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({ name: 'Happy Time - Mount Vernon' })}
        deals={[
          view(
            { type: 'daily', description: 'JUNE 2026 SUMMER SALE 30% Off Flower PULLMAN', discountPct: 30, startTime: null, endTime: null },
            'Active today',
            null,
          ),
        ]}
        gasCostText="$3.63"
      />,
    )

    // the badge shows the 30%; the title drops both the "% off" prefix AND the
    // trailing PULLMAN location tag the dispensary baked into its promo name
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(byFullText('JUNE 2026 SUMMER SALE Flower', '.gma-deal-block__title')).toBeInTheDocument()
    expect(container.textContent).not.toContain('PULLMAN')
  })

  it('badges layered "Up to X% Off Sale - Y% Off Brands" tiers by their own Y% (ADR-049)', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ name: 'KushMart North' })}
        deals={[
          // stored discountPct is 50 for ALL three (scraper grabbed the "Up to 50%"
          // headline); the tier badge must show each tier's own figure instead
          view({ type: 'daily', description: 'Up to 50% Off Sale - 50% Off Brands', discountPct: 50, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: 'Up to 50% Off Sale - 40% Off Brands', discountPct: 50, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: 'Up to 50% Off Sale - 30% Off Brands', discountPct: 50, startTime: null, endTime: null }, 'Active today', null),
        ]}
        gasCostText="$3.63"
      />,
    )

    const card = screen.getByRole('article')
    // each tier badges its OWN figure — the 40/30 cards no longer over-promise 50%
    expect(within(card).getByText('50%')).toBeInTheDocument()
    expect(within(card).getByText('40%')).toBeInTheDocument()
    expect(within(card).getByText('30%')).toBeInTheDocument()
    // title is the subject only — no "Up to … Sale" headline, no repeated magnitude
    expect(within(card).getAllByText('Brands', { selector: '.gma-deal-block__title' })).toHaveLength(3)
    expect(card.textContent).not.toContain('Up to')
    expect(card.textContent).not.toContain('Off Brands')
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
    expect(byFullText('12.4 mi', '.gma-distance-pill')).toBeInTheDocument()
    expect(byFullText('$3.63', '.gma-gas-line')).toBeInTheDocument()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
    expect(screen.queryByText(/AM|PM|close|Active today/)).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('NaN')
  })

  it('omits the distance pill (and never crashes) when distanceMiles is absent — ADR-043', () => {
    const noDistance = makeDispensary({})
    delete (noDistance as Partial<Dispensary>).distanceMiles
    const { container } = render(
      <DealCard
        dispensary={noDistance}
        deals={[view({ type: 'daily', description: 'Daily special', discountPct: 35, startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText={null}
      />,
    )

    // store + its deal still render; no distance pill, no gas line, no fake number
    expect(screen.getByText('Alpha Greens')).toBeInTheDocument()
    expect(screen.getByText('Daily special')).toBeInTheDocument()
    expect(container.querySelector('.gma-distance-pill')).toBeNull()
    expect(container.querySelector('.gma-gas-line')).toBeNull()
    expect(container.textContent).not.toContain('mi')
    expect(container.textContent).not.toContain('NaN')
  })

  it('drops the redundant "N% off" title prefix when the percent badge renders it (ADR-046)', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view(
            { type: 'daily', description: '15% Off Edibles + Drinks (Excluding Capsules)', discountPct: 15, startTime: null, endTime: null },
            'Active today',
            null,
          ),
        ]}
        gasCostText="$1.80"
      />,
    )

    // badge still carries the magnitude exactly once
    expect(within(screen.getByRole('article')).getByText('15%')).toBeInTheDocument()
    // title carries only the descriptive remainder — no doubled "15% off" stutter,
    // no dangling "Off"
    expect(byFullText('Edibles + Drinks (Excluding Capsules)', '.gma-deal-block__title')).toBeInTheDocument()
    const title = container.querySelector('.gma-deal-block__title')
    expect(title?.textContent?.startsWith('Off')).toBe(false)
    expect(title?.textContent).not.toContain('15% Off')
  })

  it('keeps a NON-layered multi-tier title whole (guard) rather than mangling it', () => {
    // a 2+-figure title that is NOT the "Up to X% Off Sale - Y% Off …" family
    // (ADR-049 handles that one) — the stripDiscountPrefix multi-tier guard keeps
    // it verbatim rather than collapsing it to nonsense
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view(
            { type: 'daily', description: 'Mix & Match - 25% Off 2, 50% Off 3', discountPct: 50, startTime: null, endTime: null },
            'Active today',
            null,
          ),
        ]}
        gasCostText="$1.80"
      />,
    )

    expect(within(screen.getByRole('article')).getByText('50%')).toBeInTheDocument()
    expect(byFullText('Mix & Match - 25% Off 2, 50% Off 3', '.gma-deal-block__title')).toBeInTheDocument()
    expect(container.textContent).not.toContain('Mix & Match -  ,')
  })

  it('leaves the title intact when NO percent badge renders (badge-anchored — never strip what is shown nowhere else)', () => {
    const description = '50% off Select Brands'
    const deal = { type: 'daily' as const, description, discountPct: null, startTime: null, endTime: null }
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view(deal, 'Active today', null)]}
        gasCostText="$1.80"
      />,
    )

    // discountPct null → discountTier null → no badge → the full description must
    // survive (the figure is shown nowhere else)
    expect(byFullText('50% off Select Brands', '.gma-deal-block__title')).toBeInTheDocument()
    // display-only: the source description is not mutated by rendering
    expect(deal.description).toBe('50% off Select Brands')
  })

  it('falls back to the kind label (never a blank title) when the description is only the percent phrase', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ description: '30% off', discountPct: 30 }, '9:00 PM – 11:30 PM', '0:30')]}
        gasCostText="$1.80"
      />,
    )

    // stripping empties the title → happy_hour kind fallback, not a blank node,
    // and crucially not the raw "30% off" (which would re-introduce the stutter)
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(byFullText('Happy hour', '.gma-deal-block__title')).toBeInTheDocument()
  })

  it('renders the store street address in the header at deal-title size when present (CAP-1)', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ address: '9226 34th Avenue NE, Tulalip, WA 98271' })}
        deals={[view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText="$1.80"
      />,
    )

    const address = screen.getByText('9226 34th Avenue NE, Tulalip, WA 98271')
    // semantic <address> element, styled to deal-title size via .gma-dealcard__address
    expect(address.tagName).toBe('ADDRESS')
    expect(address).toHaveClass('gma-dealcard__address')
  })

  it('omits the address element entirely when the store has no address (ADR-043)', () => {
    const { container } = render(
      <DealCard dispensary={makeDispensary({})} deals={[]} gasCostText={null} />,
    )

    // makeDispensary({}) carries a distance (pill renders) but no address
    expect(container.querySelector('.gma-dealcard__address')).toBeNull()
    expect(byFullText('12.4 mi', '.gma-distance-pill')).toBeInTheDocument()
  })

  it('renders no address line for a blank/whitespace address but still shows the store + deal', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({ address: '   ' })}
        deals={[view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText={null}
      />,
    )

    // address never gates visibility (ADR-043): the store + its deal render, the
    // address element is simply omitted
    expect(screen.getByText('Alpha Greens')).toBeInTheDocument()
    expect(screen.getByText('Daily special')).toBeInTheDocument()
    expect(container.querySelector('.gma-dealcard__address')).toBeNull()
  })

  it('shows the address as the sole header-right element when there is no location (no pill/gas)', () => {
    const noDistance = makeDispensary({ address: '13224 Highway 99, Everett, WA 98204' })
    delete (noDistance as Partial<Dispensary>).distanceMiles
    const { container } = render(
      <DealCard
        dispensary={noDistance}
        deals={[view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText={null}
      />,
    )

    expect(screen.getByText('13224 Highway 99, Everett, WA 98204')).toHaveClass('gma-dealcard__address')
    expect(container.querySelector('.gma-distance-pill')).toBeNull()
    expect(container.querySelector('.gma-gas-line')).toBeNull()
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
    expect(badge).toHaveClass('gma-daily-badge')
    expect(screen.queryByText(/ends in/)).not.toBeInTheDocument()
  })
})
