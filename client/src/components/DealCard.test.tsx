import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DealCard, { type DealView } from './DealCard'
import { DEAL_ICON_SRC } from '../utils/dealIconAssets'
import type { Deal, Dispensary, PriceDropRow } from '../types'

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

  it('reserves the gas-line slot (icon only, no cost) when gasCostText is null but a distance exists', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', discountPct: 35, startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText={null}
      />,
    )

    expect(screen.getByText('35%')).toBeInTheDocument()
    // distance pill still renders
    expect(byFullText('12.4 mi', '.gma-distance-pill')).toBeInTheDocument()
    // ADR-090: the slot is reserved (icon present) so a cost resolving after first
    // paint can't shift the deal grid — but it shows NO $ figure yet (Honest Math)
    const gasLine = container.querySelector('.gma-gas-line')
    expect(gasLine).not.toBeNull()
    expect(gasLine?.querySelector('img')).not.toBeNull()
    expect(gasLine?.textContent).not.toContain('$')
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

  it('collapses layered "Up to X% Off Sale - Y% Off Brands" tiers into one Brands block with a Y% range (ADR-049 + tier-collapse)', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ name: 'KushMart North' })}
        deals={[
          // stored discountPct is 50 for ALL three (scraper grabbed the "Up to 50%"
          // headline); the tier figures are 50/40/30 and all title to "Brands", so
          // they collapse to a single block spanning the tier range
          view({ type: 'daily', description: 'Up to 50% Off Sale - 50% Off Brands', discountPct: 50, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: 'Up to 50% Off Sale - 40% Off Brands', discountPct: 50, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: 'Up to 50% Off Sale - 30% Off Brands', discountPct: 50, startTime: null, endTime: null }, 'Active today', null),
        ]}
        gasCostText="$3.63"
      />,
    )

    const card = screen.getByRole('article')
    // three near-clone tiers → one block; the range spans lowest–highest tier figure
    expect(within(card).getByText('30–50%')).toBeInTheDocument()
    // exactly one "Brands" title and one "off" now (not three of each)
    expect(within(card).getAllByText('Brands', { selector: '.gma-deal-block__title' })).toHaveLength(1)
    expect(within(card).getAllByText('off')).toHaveLength(1)
    // no over-promised standalone 50%, no "Up to … Sale" headline
    expect(within(card).queryByText('50%')).not.toBeInTheDocument()
    expect(card.textContent).not.toContain('Up to')
    expect(card.textContent).not.toContain('Off Brands')
  })

  it('renders a BOGO badge (not a "N% off") for a bogo special, keeping the percent in the title', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ name: 'Salish Coast' })}
        deals={[
          view(
            { type: 'daily', description: '40% Off Online Orders Sun,Tues,Thurs Min $80', discountPct: 40, specialType: 'bogo', startTime: null, endTime: null },
            'Active today',
            null,
          ),
        ]}
        gasCostText="$3.63"
      />,
    )

    const card = screen.getByRole('article')
    // the BOGO badge (Erik's art, accessible name "BOGO") replaces the amber "40% off" magnitude…
    const badge = within(card).getByAltText('BOGO')
    expect(badge).toHaveClass('gma-deal-block__bogo')
    expect(card.querySelector('.gma-deal-block__pct')).toBeNull()
    expect(within(card).queryByText('off', { selector: '.gma-deal-block__off' })).toBeNull()
    // …and the percent stays visible in the title text (not stripped)
    expect(byFullText('40% Off Online Orders Sun,Tues,Thurs Min $80', '.gma-deal-block__title')).toBeInTheDocument()
  })

  it('collapses same-title daily tiers (Silvana "Select Products") into one range block', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ name: 'The Vault - Silvana' })}
        deals={[
          view({ type: 'daily', description: '45% off Select Products', discountPct: 45, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: '40% Off Select Products', discountPct: 40, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: '35% Off Select Products', discountPct: 35, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: '25% Off Select Products', discountPct: 25, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: '20% Off All Cannabis Items', discountPct: 20, startTime: null, endTime: null }, 'Active today', null),
        ]}
        gasCostText="$3.63"
      />,
    )

    const card = screen.getByRole('article')
    // four "Select Products" tiers collapse to one 25–45% block; the distinct
    // "All Cannabis Items" deal stays its own block → 2 blocks total
    expect(card.querySelectorAll('.gma-deal-block')).toHaveLength(2)
    expect(within(card).getByText('25–45%')).toBeInTheDocument()
    expect(within(card).getByText('20%')).toBeInTheDocument()
    expect(within(card).getAllByText('Select Products', { selector: '.gma-deal-block__title' })).toHaveLength(1)
    expect(within(card).getByText('All Cannabis Items')).toBeInTheDocument()
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

  it('renders one item glyph per item the deal names, in reading order (accessible name lists them)', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view(
            {
              type: 'daily',
              description: '15% Off Concentrates, Infused Flower, Infused Prerolls and Vapes',
              discountPct: 15,
              startTime: null,
              endTime: null,
            },
            'Active today',
            null,
          ),
        ]}
        gasCostText="$1.80"
      />,
    )

    const row = container.querySelector('.gma-deal-icons')
    expect(row).not.toBeNull()
    // four items named → four glyphs, in the order the text spells them
    expect(row?.querySelectorAll('img')).toHaveLength(4)
    expect(row).toHaveAttribute('aria-label', 'Concentrates, Flower, Pre-rolls, Vapes')
  })

  it('renders rotating-pool srcs for edible and bud glyphs, consumed in block order', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view({ type: 'daily', description: '20% Off Edibles', discountPct: 20, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: '25% Off Gummies and Flower', discountPct: 25, startTime: null, endTime: null }, 'Active today', null),
        ]}
        gasCostText={null}
        rotatingIconSrcs={{ edible: ['pool-edible-a.webp', 'pool-edible-b.webp'], bud: ['pool-bud-a.webp'] }}
      />,
    )

    const srcs = Array.from(container.querySelectorAll('.gma-deal-icon')).map((img) =>
      img.getAttribute('src'),
    )
    // block 1: edible → first edible src; block 2: gummies (edible) then flower
    // (bud) → second edible src, first bud src
    expect(srcs).toEqual(['pool-edible-a.webp', 'pool-edible-b.webp', 'pool-bud-a.webp'])
  })

  it('falls back to the legacy single art when the pool srcs underflow or are absent', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view({ type: 'daily', description: '20% Off Edibles', discountPct: 20, startTime: null, endTime: null }, 'Active today', null),
          view({ type: 'daily', description: '25% Off Gummies', discountPct: 25, startTime: null, endTime: null }, 'Active today', null),
        ]}
        gasCostText={null}
        // only ONE src supplied for TWO edible glyphs; no card renders broken
        rotatingIconSrcs={{ edible: ['pool-edible-a.webp'] }}
      />,
    )

    const srcs = Array.from(container.querySelectorAll('.gma-deal-icon')).map((img) =>
      img.getAttribute('src'),
    )
    expect(srcs[0]).toBe('pool-edible-a.webp')
    // underflow → legacy edible.webp asset, never undefined/broken
    expect(srcs[1]).toBe(DEAL_ICON_SRC.edible)
    expect(srcs[1]).toBeTruthy()
  })

  it('never rotates a non-pool family — vape keeps its dedicated art even with pools supplied', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view({ type: 'daily', description: '30% Off Vapes', discountPct: 30, startTime: null, endTime: null }, 'Active today', null),
        ]}
        gasCostText={null}
        rotatingIconSrcs={{ edible: ['pool-edible-a.webp'], bud: ['pool-bud-a.webp'] }}
      />,
    )

    const img = container.querySelector('.gma-deal-icon')
    expect(img?.getAttribute('src')).toBe(DEAL_ICON_SRC.vape)
  })

  it('tags a deal that names no product with the single special-pricing glyph', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[
          view(
            { type: 'daily', description: '50% off Select Brands', discountPct: 50, startTime: null, endTime: null },
            'Active today',
            null,
          ),
        ]}
        gasCostText="$1.80"
      />,
    )

    const row = container.querySelector('.gma-deal-icons')
    expect(row?.querySelectorAll('img')).toHaveLength(1)
    expect(row).toHaveAttribute('aria-label', 'Special pricing')
  })
})

// CAP-2: an expired store is handed an EMPTY deals list by DealFeed. It must keep
// its identity/trip info but show "No current deals" instead of stale deal blocks.
describe('DealCard — expired store (no current deals)', () => {
  it('shows "No current deals" and keeps name, link, address, and distance pill', () => {
    render(
      <DealCard
        dispensary={makeDispensary({ address: '123 Main St, Marysville' })}
        deals={[]}
        gasCostText="$3.63"
      />,
    )

    expect(screen.getByText('No current deals')).toBeInTheDocument()
    // trip/identity preserved
    expect(screen.getByRole('link', { name: /Alpha Greens/ })).toHaveAttribute(
      'href',
      'https://example.com/a',
    )
    expect(screen.getByText('123 Main St, Marysville')).toBeInTheDocument()
    expect(byFullText('12.4 mi')).toBeInTheDocument()
  })

  it('renders no deal blocks, no discount figure, and no "active today" status', () => {
    const { container } = render(
      <DealCard dispensary={makeDispensary({})} deals={[]} gasCostText={null} />,
    )

    expect(container.querySelector('.gma-deal-grid')).toBeNull()
    expect(container.querySelector('.gma-deal-block')).toBeNull()
    expect(screen.queryByText('active today')).not.toBeInTheDocument()
  })
})

// derivation-3.3: the "Real price drops" strip renders INSIDE the store's card, under its deals.
describe('DealCard — real price drops strip', () => {
  const dropRow = (over: Partial<PriceDropRow> = {}): PriceDropRow => ({
    dispensaryId: 'a',
    productId: 'p1',
    name: 'Blue Dream',
    category: 'flower',
    option: '1/8 oz',
    currentPrice: 32.4,
    medianPrice: 40,
    pctVsMedian: -0.19,
    ...over,
  })

  it('renders the strip under the store deals, divided from them by a hairline', () => {
    render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', description: 'Daily special', discountPct: 20, startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText={null}
        drops={[dropRow()]}
      />,
    )

    const card = screen.getByRole('article')
    // the store's banner deal AND its price drop both render inside the one card
    expect(within(card).getByText('Daily special')).toBeInTheDocument()
    // the strip is a plain <div> (no ARIA region landmark), reached via its <h3> heading
    expect(within(card).getByRole('heading', { name: 'Real price drops', level: 3 })).toBeInTheDocument()
    const strip = card.querySelector('.gma-value-drops') as HTMLElement
    expect(within(strip).getByText('Blue Dream')).toBeInTheDocument()
    expect(within(strip).getByText('19%')).toBeInTheDocument()
    // strip comes AFTER the deal grid, with the divider (follows a grid)
    expect(strip).toHaveClass('gma-value-drops--divided')
    const grid = card.querySelector('.gma-deal-grid')
    expect(grid && grid.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no strip when the store has no drops (byte-for-byte the old card)', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText={null}
      />,
    )
    expect(container.querySelector('.gma-value-drops')).toBeNull()
  })

  it('surfaces a drop-only store (no banner deals) as a "No current deals" card that still shows the strip, no divider', () => {
    const { container } = render(
      <DealCard dispensary={makeDispensary({})} deals={[]} gasCostText={null} drops={[dropRow()]} />,
    )

    // drop-only card = the expired shell + the strip so the drop is not lost
    expect(screen.getByText('No current deals')).toBeInTheDocument()
    expect(container.querySelector('.gma-deal-grid')).toBeNull()
    const strip = container.querySelector('.gma-value-drops') as HTMLElement
    expect(within(strip).getByText('Blue Dream')).toBeInTheDocument()
    // no deal grid above it → no divider
    expect(strip).not.toHaveClass('gma-value-drops--divided')
  })

  it('keeps the feed a11y contract: the strip adds NO listitem to the card article', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[view({ type: 'daily', description: 'Daily special', startTime: null, endTime: null }, 'Active today', null)]}
        gasCostText={null}
        drops={[dropRow(), dropRow({ productId: 'p2', name: 'Gelato', option: '1 g' })]}
      />,
    )
    // the two drop rows live in the strip's OWN local <ul> — the card itself is not a list, and
    // DealFeed (not tested here) keeps one <li> per store. The strip's list holds exactly its rows.
    const strip = container.querySelector('.gma-value-drops') as HTMLElement
    expect(within(strip).getAllByRole('listitem')).toHaveLength(2)
  })

  it('drops sub-1%/above-median rows before deciding to show the strip', () => {
    const { container } = render(
      <DealCard
        dispensary={makeDispensary({})}
        deals={[]}
        gasCostText={null}
        // only a sub-0.5% mover → nothing renderable → no strip, no phantom drop-only card content
        drops={[dropRow({ pctVsMedian: -0.004 })]}
      />,
    )
    expect(container.querySelector('.gma-value-drops')).toBeNull()
  })
})
