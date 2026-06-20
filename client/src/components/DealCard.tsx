import type { Deal, Dispensary } from '../types'
import { Card, Icon } from './ui'
import { discountTier, storeUrgencyBadge } from '../utils/dealView'

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
function dealTitle(deal: Deal): string | null {
  if (deal.description && deal.description.trim() !== '') return deal.description
  return deal.type === 'happy_hour' ? 'Happy hour' : null
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
  // Synthwave splits the trip into two figures (ADR-040): a cyan distance pill
  // ("how far") in the header and a cyan gas line ("what it costs") below it.
  // Both still describe the one drive to the store (ADR-038).
  const distanceText = `${dispensary.distanceMiles.toFixed(1)} mi`

  return (
    <Card as="article" urgent={urgency.variant === 'urgent'} style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <div className="gma-dealcard__head">
          <h2 className="gma-dealcard__name">{dispensary.name}</h2>
          <span className="gma-distance-pill">{distanceText}</span>
        </div>
        {/* gas line — omitted entirely when round-trip cost can't be computed */}
        {gasCostText !== null && (
          <span className="gma-gas-line"><Icon name="fuel" size={13} /> {gasCostText}</span>
        )}
        {/* status: live happy hour → pink pulse badge + countdown; else neutral */}
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
          const title = dealTitle(deal)
          const meta = dealMeta(deal, windowText)
          return (
            // index keeps the key unique even when sanitize blanks two
            // same-window/same-type deals' descriptions to ''
            <div
              key={`${deal.type}|${deal.description}|${deal.startTime ?? ''}|${deal.endTime ?? ''}|${i}`}
              className="gma-deal-block"
            >
              {/* discount magnitude in the cyan value accent (ADR-037/040);
                  null discount → no figure and no "off" at all */}
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
