import type { Deal, Dispensary } from '../types'
import { Card, Icon } from './ui'
import {
  discountTier,
  resolveLayeredSale,
  storeUrgencyBadge,
  stripCrossLocationTag,
  stripDiscountPrefix,
} from '../utils/dealView'
import { dealIcons, DEAL_ICON_LABEL } from '../utils/dealIcons'
import { DEAL_ICON_SRC } from '../utils/dealIconAssets'

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
          // Layered "Up to X% Off Sale - Y% Off <subject>" tiers (ADR-049) badge the
          // TIER figure Y, not the stored discountPct (the headline X), and title
          // the subject only. Takes precedence over the percent/multi-tier strip.
          const layered = resolveLayeredSale(deal.description)
          const pct = layered ? layered.pct : deal.discountPct
          const tier = discountTier(pct)
          // badge-anchored: pass whether the percent badge is rendering so the
          // title only drops the "N% off" prefix the badge is already showing.
          const title = layered ? layered.title : dealTitle(deal, tier !== null)
          const meta = dealMeta(deal, windowText)
          // One glyph per "item" the deal names (Erik's model: the text spells
          // the item, the icon mirrors it). Driven by the subject text — the
          // layered tier's subject when present, else the full description.
          const icons = dealIcons(layered ? layered.title : deal.description)
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
                  <span className={`gma-deal-block__pct gma-deal-block__pct--${tier}`}>{`${pct}%`}</span>
                  <span className="gma-deal-block__off">off</span>
                </>
              )}
              <div className="gma-deal-block__body">
                {title !== null && <span className="gma-deal-block__title">{title}</span>}
                {meta !== null && meta !== '' && (
                  <span className="gma-deal-block__meta">{meta}</span>
                )}
              </div>
              {/* one tag per item named in the deal (Erik's sale-tag art), to the
                  right of the text; the row's accessible name lists them so a
                  screen-reader gets what the pictures say */}
              {icons.length > 0 && (
                <span
                  className="gma-deal-icons"
                  role="img"
                  aria-label={icons.map((n) => DEAL_ICON_LABEL[n]).join(', ')}
                >
                  {icons.map((name) => (
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
          )
        })}
      </div>
    </Card>
  )
}
