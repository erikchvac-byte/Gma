import type { Deal, Dispensary } from '../types'
import { Card, Icon } from './ui'
import { discountTier, storeUrgencyBadge, stripCrossLocationTag, stripDiscountPrefix } from '../utils/dealView'

// One deal plus its upstream-computed display strings. windowText/countdown are
// computed in DealFeed (null means "render nothing" — e.g. malformed times).
export interface DealView {
  deal: Deal
  windowText: string | null
  countdown: string | null
}

export interface DealCardProps {
  dispensary: Dispensary
  // all of this store's active deals, already sorted; rendered in one card
  deals: DealView[]
  // pre-formatted '$X.XX' from gasCost.ts; per-store (the trip), shown once.
  // null → distance-only trip chip
  gasCostText: string | null
}

// title falls back to the deal's kind when ingest suppressed its description
// (sanitizeDescription can blank non-compliant retailer copy to ''). Daily
// deals are already labelled by their meta ('Daily deal · …'), so a blank one
// omits the title rather than doubling the label; happy hours keep the label
// because their meta is only a time window.
//
// badgeRendering: when the percent badge is showing this deal's magnitude, drop
// any leading "N% off" phrase the scraped description embeds so the card doesn't
// stutter it (ADR-046). Badge-anchored — never strip when nothing else shows the
// figure. If stripping empties the title, fall through to the kind fallback
// (NOT the raw description — that would re-introduce the stutter).
function dealTitle(deal: Deal, badgeRendering: boolean): string | null {
  const kindFallback = deal.type === 'happy_hour' ? 'Happy hour' : null
  if (!deal.description || deal.description.trim() === '') return kindFallback
  // badgeRendering ⇒ discountTier(discountPct) !== null ⇒ a positive finite pct,
  // so the strip can anchor to the exact magnitude the badge is showing. When no
  // badge renders we keep the percent figure (it's the only place it shows).
  const base = badgeRendering
    ? stripDiscountPrefix(deal.description, deal.discountPct as number)
    : deal.description
  // Then drop any trailing cross-location tag a chain baked into the title (e.g.
  // Happy Time's "PULLMAN" on its Mount Vernon menu). Applied in both branches so
  // the tag never survives, badge or not.
  const cleaned = stripCrossLocationTag(base)
  return cleaned !== '' ? cleaned : kindFallback
}

// metadata line: the happy-hour window, or a daily label + status. null when a
// happy hour has no parseable window (then only the title renders).
function dealMeta(deal: Deal, windowText: string | null): string | null {
  if (deal.type === 'happy_hour') return windowText
  return `Daily deal · ${windowText ?? 'Active today'}`
}

// Purely presentational: receives data and computed values as props.
// No fetching, no intervals, no hooks.
export default function DealCard({ dispensary, deals, gasCostText }: DealCardProps) {
  // one store-level urgency badge — reports time, never a verdict (ADR-009).
  // The card's accent border is driven from the same signal so border and
  // badge can never disagree (urgent only when a live countdown exists).
  const urgency = storeUrgencyBadge(deals)
  // The trip is split into two figures (ADR-040): a distance pill ("how far") in
  // the header and a gas line ("what it costs") below it. Both describe the one
  // drive to the store (ADR-038). distanceMiles is optional (ADR-043): when it is
  // absent/non-finite the pill is omitted entirely — Honest Math, never a faked
  // or zero distance (the gas line is already suppressed by a null gasCostText).
  const distanceText =
    typeof dispensary.distanceMiles === 'number' && Number.isFinite(dispensary.distanceMiles)
      ? `${dispensary.distanceMiles.toFixed(1)} mi`
      : null

  return (
    <Card as="article" urgent={urgency.variant === 'urgent'} style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <div className="gma-dealcard__head">
          <h2 className="gma-dealcard__name">{dispensary.name}</h2>
          {distanceText !== null && <span className="gma-distance-pill">{distanceText}</span>}
        </div>
        {/* gas line — omitted entirely when round-trip cost can't be computed */}
        {gasCostText !== null && (
          <span className="gma-gas-line"><Icon name="fuel" size={13} /> {gasCostText}</span>
        )}
        {/* status: live happy hour → red pulse badge + countdown; else neutral */}
        <div className="gma-dealcard__status">
          {urgency.variant === 'urgent' ? (
            <>
              <span className="gma-happy-badge">
                <span className="gma-pulse-dot" aria-hidden="true" />
                Happy hour
              </span>
              <span className="gma-countdown">{urgency.text}</span>
            </>
          ) : (
            <span className="gma-daily-badge">{urgency.text}</span>
          )}
        </div>
      </div>
      {/* deals are plain divs, not list items: the feed keeps one listitem per
          STORE (the card), so nesting <li> here would inflate that count */}
      <div className="gma-deal-grid">
        {deals.map(({ deal, windowText }, i) => {
          const tier = discountTier(deal.discountPct)
          // badge-anchored: pass whether the percent badge is rendering so the
          // title only drops the "N% off" prefix the badge is already showing.
          const title = dealTitle(deal, tier !== null)
          const meta = dealMeta(deal, windowText)
          return (
            // index keeps the key unique even when sanitize blanks two
            // same-window/same-type deals' descriptions to ''
            <div
              key={`${deal.type}|${deal.description}|${deal.startTime ?? ''}|${deal.endTime ?? ''}|${i}`}
              className="gma-deal-block"
            >
              {/* discount magnitude in the amber discount accent (ADR-041: full
                  opacity, weight-only ramp); null discount → no figure / no "off" */}
              {tier !== null && (
                <>
                  <span className={`gma-deal-block__pct gma-deal-block__pct--${tier}`}>{`${deal.discountPct}%`}</span>
                  <span className="gma-deal-block__off">off</span>
                </>
              )}
              <div className="gma-deal-block__body">
                {title !== null && <span className="gma-deal-block__title">{title}</span>}
                {meta !== null && meta !== '' && (
                  <span className="gma-deal-block__meta">{meta}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
