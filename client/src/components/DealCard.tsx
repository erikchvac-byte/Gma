import type { Dispensary } from '../types'
import { Card, Icon } from './ui'
import { buildDealBlocks, storeUrgencyBadge, type DealView } from '../utils/dealView'
import { DEAL_ICON_LABEL } from '../utils/dealIcons'
import { DEAL_ICON_SRC, BOGO_BADGE_SRC } from '../utils/dealIconAssets'

export type { DealView }

export interface DealCardProps {
  dispensary: Dispensary
  // all of this store's active deals, already sorted; rendered in one card
  deals: DealView[]
  // pre-formatted '$X.XX' from gasCost.ts; per-store (the trip), shown once.
  // null → distance-only trip chip
  gasCostText: string | null
}

// url is a required field but not validated upstream (scraped/ingested data) —
// only render it as a link when it's a well-formed http(s) address, never a
// javascript:/data: URI or malformed string.
function isLinkableUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

// Purely presentational: receives data and computed values as props.
// No fetching, no intervals, no hooks.
export default function DealCard({ dispensary, deals, gasCostText }: DealCardProps) {
  // CAP-2: an expired store (its cached deals timed out per DEAL_EXPIRY_MS,
  // signalled by DealFeed passing an empty deals list) keeps its identity and
  // trip info but shows a "No current deals" state instead of stale deal blocks —
  // never silently dropped. Its urgency/border stay neutral (no live countdown).
  const isExpired = deals.length === 0
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
  // Address is optional enrichment (ADR-043): rendered only when present and
  // non-empty, never fabricated (Honest Math). It anchors the top-right of the
  // header at deal-title size; the distance pill tucks beneath it. With no
  // location (no pill) the address is the sole top-right element.
  const addressText =
    typeof dispensary.address === 'string' && dispensary.address.trim() !== ''
      ? dispensary.address
      : null

  return (
    <Card as="article" urgent={urgency.variant === 'urgent'} style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <div className="gma-dealcard__head">
          <h2 className="gma-dealcard__name">
            {isLinkableUrl(dispensary.url) ? (
              <a
                href={dispensary.url}
                target="_blank"
                rel="noopener noreferrer"
                className="gma-dealcard__name-link"
              >
                {dispensary.name}
                <span className="gma-sr-only"> (opens in new tab)</span>
              </a>
            ) : (
              dispensary.name
            )}
          </h2>
          {(addressText !== null || distanceText !== null) && (
            <div className="gma-dealcard__head-right">
              {addressText !== null && (
                <address className="gma-dealcard__address">{addressText}</address>
              )}
              {distanceText !== null && <span className="gma-distance-pill">{distanceText}</span>}
            </div>
          )}
        </div>
        {/* gas line — omitted entirely when round-trip cost can't be computed */}
        {gasCostText !== null && (
          <span className="gma-gas-line"><Icon name="fuel" size={13} /> {gasCostText}</span>
        )}
        {/* status: expired store → neutral "No current deals"; live happy hour →
            red pulse badge + countdown; else neutral "active today" */}
        <div className="gma-dealcard__status">
          {isExpired ? (
            <span className="gma-daily-badge">No current deals</span>
          ) : urgency.variant === 'urgent' ? (
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
          STORE (the card), so nesting <li> here would inflate that count.
          Suppressed entirely for an expired store — its status line already
          says "No current deals" and there are no deals to render (CAP-2). */}
      {!isExpired && (
      <div className="gma-deal-grid">
        {/* deals that resolve to the same title + meta collapse into one block;
            a collapsed block's pctLabel is a "min–max%" range (buildDealBlocks) */}
        {buildDealBlocks(deals).map((block) => (
          <div key={block.key} className="gma-deal-block">
            {/* BOGO renders its own badge instead of a percent (a bogo shown as a flat
                "N% off" over-states it); the percent, if any, stays in the title text.
                The badge is Erik's BOGO art; alt keeps the accessible name "BOGO". */}
            {block.isBogo && (
              <img
                className="gma-deal-block__bogo"
                src={BOGO_BADGE_SRC}
                alt="BOGO"
                width={28}
                height={28}
              />
            )}
            {/* discount magnitude in the amber discount accent (ADR-041: full
                opacity, weight-only ramp); null discount → no figure / no "off".
                pctLabel is "N%" for a single tier, "min–max%" when collapsed. */}
            {!block.isBogo && block.pctLabel !== null && block.tier !== null && (
              <>
                <span className={`gma-deal-block__pct gma-deal-block__pct--${block.tier}`}>
                  {block.pctLabel}
                </span>
                <span className="gma-deal-block__off">off</span>
              </>
            )}
            <div className="gma-deal-block__body">
              {block.title !== null && <span className="gma-deal-block__title">{block.title}</span>}
              {block.meta !== null && block.meta !== '' && (
                <span className="gma-deal-block__meta">{block.meta}</span>
              )}
            </div>
            {/* one tag per item named in the deal (Erik's sale-tag art), to the
                right of the text; the row's accessible name lists them so a
                screen-reader gets what the pictures say */}
            {block.icons.length > 0 && (
              <span
                className="gma-deal-icons"
                role="img"
                aria-label={block.icons.map((n) => DEAL_ICON_LABEL[n]).join(', ')}
              >
                {block.icons.map((name) => (
                  <img
                    key={name}
                    className="gma-deal-icon"
                    src={DEAL_ICON_SRC[name]}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
      )}
    </Card>
  )
}
