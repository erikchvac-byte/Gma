import type { Dispensary, PriceDropRow } from '../types'
import { Card } from './ui'
import gasPumpArt from '../assets/location-icons/gas-pump.webp'
import { buildDealBlocks, storeUrgencyBadge, type DealView } from '../utils/dealView'
import { DEAL_ICON_LABEL, type DealIconName } from '../utils/dealIcons'
import { DEAL_ICON_SRC, BOGO_BADGE_SRC } from '../utils/dealIconAssets'
import { ROTATING_ICON_POOLS, type RotatingIconName, type RotatingIconSrcs } from '../utils/dealIconPools'
import ValueDropStrip, { renderableDrops } from './ValueDropStrip'
import { trackStoreClick } from '../utils/analytics'

// a family rotates iff it has a pool; non-pool names keep their single art
const isRotating = (name: DealIconName): name is RotatingIconName => name in ROTATING_ICON_POOLS

export type { DealView }

export interface DealCardProps {
  dispensary: Dispensary
  // all of this store's active deals, already sorted; rendered in one card
  deals: DealView[]
  // pre-formatted '$X.XX' from gasCost.ts; per-store (the trip), shown once.
  // null → distance-only trip chip
  gasCostText: string | null
  // rotation-pool srcs for this card's rotating glyphs (edible, bud), one per
  // occurrence in block reading order (assigned feed-wide by DealFeed so the
  // no-repeat cycle spans cards). Consumed in order; underflow falls back to
  // the family's legacy single art rather than a broken img.
  rotatingIconSrcs?: RotatingIconSrcs
  // derivation-3.3: this store's genuine "real price drops" (product priced below its own rolling
  // median), already store-joined + store-status-gated by DealFeed. Rendered as a labeled strip
  // UNDER the deal grid so the drop reads together with this store's link/address/deals. Default [].
  drops?: PriceDropRow[]
  // the drops fact's own derive time (from useValueDrops), forwarded to the strip for its honest
  // freshness clause. One value for all cards; null/absent → no freshness line. Default null.
  dropsGeneratedAt?: string | null
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
export default function DealCard({ dispensary, deals, gasCostText, rotatingIconSrcs = {}, drops = [], dropsGeneratedAt = null }: DealCardProps) {
  // next unconsumed pool src per family; render-scoped so every render replays
  // the same assignment (the srcs themselves are stable — DealFeed derives them
  // from a per-mount seed)
  const nextRotating: Partial<Record<RotatingIconName, number>> = {}
  const iconSrc = (name: DealIconName): string => {
    if (isRotating(name)) {
      const i = nextRotating[name] ?? 0
      nextRotating[name] = i + 1
      const src = rotatingIconSrcs[name]?.[i]
      if (src !== undefined) return src
    }
    return DEAL_ICON_SRC[name]
  }
  // CAP-2: an expired store (its cached deals timed out per DEAL_EXPIRY_MS,
  // signalled by DealFeed passing an empty deals list) keeps its identity and
  // trip info but shows a "No current deals" state instead of stale deal blocks —
  // never silently dropped. Its urgency/border stay neutral (no live countdown).
  const isExpired = deals.length === 0
  // derivation-3.3: this store's renderable price drops (sub-1%/above-median already filtered). When
  // present they render as a strip below the deal grid; a store with ONLY drops (no banner deals) is
  // an expired/"No current deals" card that still carries the strip so the drop is never lost.
  const dropRows = renderableDrops(drops)
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
                onClick={() =>
                  trackStoreClick({ id: dispensary.id, name: dispensary.name, url: dispensary.url })
                }
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
        {/* gas line — the icon slot renders whenever the store has a distance, so a
            round-trip cost that resolves a beat AFTER first paint (vehicle/fuel-price
            async) fills in the text without shifting the deal grid below it. That
            deal-grid reflow was 100% of past-gate mobile CLS once the font FOUT was
            fixed (ADR-090). Suppressed only when there's no distance at all — no trip
            to price, so no gas line ever appears and there's nothing to reserve. When
            present-but-unresolved the icon shows alone; it asserts no cost (Honest
            Math), and its fixed 40px box holds the height whether or not $-text is in. */}
        {distanceText !== null && (
          <span className="gma-gas-line">
            <img src={gasPumpArt} alt="" width={40} height={40} className="gma-gas-line__icon" />
            {gasCostText}
          </span>
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
                    src={iconSrc(name)}
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
      {/* derivation-3.3: the store's "Real price drops" strip, UNDER the deal grid. A hairline
          divider separates it from the banner deals; on a drop-only/expired card there is no grid
          to separate from, so the divider is omitted (the "No current deals" line sits above). */}
      {dropRows.length > 0 && (
        <ValueDropStrip storeId={dispensary.id} drops={dropRows} divided={!isExpired} generatedAt={dropsGeneratedAt} />
      )}
    </Card>
  )
}
