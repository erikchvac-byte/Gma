import type { CSSProperties } from 'react'
import type { Deal, Dispensary } from '../types'
import { Badge, Card, Icon } from './ui'

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
  // null → no gas line at all
  gasCostText: string | null
}

const figure: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums slashed-zero',
}

// Purely presentational: receives data and computed values as props.
// No fetching, no intervals, no hooks.
export default function DealCard({ dispensary, deals, gasCostText }: DealCardProps) {
  // accent border when the store has any happy hour among its deals
  const hasHappyHour = deals.some(({ deal }) => deal.type === 'happy_hour')
  return (
    <Card as="article" urgent={hasHappyHour} style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)' }}>{dispensary.name}</h2>
          <span style={{ ...figure, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {dispensary.distanceMiles.toFixed(1)} miles
          </span>
        </div>
        {/* gas cost is a property of the trip to the store, so it lives in the
            header and renders once per card (null → omit entirely) */}
        {gasCostText !== null && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            <span style={figure}>{gasCostText}</span> to get there
          </p>
        )}
      </div>
      {/* deals are plain divs, not list items: the feed keeps one listitem per
          STORE (the card), so nesting <li> here would inflate that count */}
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {deals.map(({ deal, windowText, countdown }, i) => {
          const isHappyHour = deal.type === 'happy_hour'
          return (
            // index keeps the key unique even when sanitize blanks two
            // same-window/same-type deals' descriptions to ''
            <div
              key={`${deal.type}|${deal.description}|${deal.startTime ?? ''}|${deal.endTime ?? ''}|${i}`}
              style={{ display: 'grid', gap: 'var(--space-1)' }}
            >
              <div>
                {isHappyHour ? (
                  <Badge variant="urgent"><Icon name="clock" size={12} /> Happy hour</Badge>
                ) : (
                  <Badge variant="neutral">Daily deal</Badge>
                )}
              </div>
              {/* description may be '' when ingest suppressed non-compliant
                  retailer copy (see server sanitizeDescription) — render nothing
                  rather than an empty <p>. Trim-guard also covers whitespace-only
                  / undefined copy from any path that bypasses the sanitizer. */}
              {deal.description && deal.description.trim() !== '' && (
                <p style={{ color: 'var(--text-body)' }}>{deal.description}</p>
              )}
              {/* discount stays per-deal (gas moved to the store header). Render
                  only when present. */}
              {deal.discountPct !== null && (
                <p style={{ fontWeight: 'var(--weight-medium)' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 'var(--weight-semibold)' }}>
                    {deal.discountPct}% off
                  </span>
                </p>
              )}
              {(windowText !== null || countdown !== null) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                  {windowText !== null && (
                    <span style={{ ...figure, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{windowText}</span>
                  )}
                  {countdown !== null && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 'var(--text-sm)',
                        fontWeight: 'var(--weight-semibold)',
                        color: 'var(--text-urgent)',
                      }}
                    >
                      <Icon name="clock" size={14} />
                      <span style={figure}>{countdown}</span> left
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
