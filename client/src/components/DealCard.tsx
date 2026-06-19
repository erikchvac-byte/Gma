import type { CSSProperties } from 'react'
import type { Deal, Dispensary } from '../types'
import { Badge, Card, Icon } from './ui'

export interface DealCardProps {
  dispensary: Dispensary
  deal: Deal
  // computed upstream (DealFeed): null means "render nothing" — e.g. malformed times
  windowText: string | null
  countdown: string | null
  // pre-formatted '$X.XX' from gasCost.ts; null → discount renders alone
  gasCostText: string | null
}

const figure: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums slashed-zero',
}

// Purely presentational: receives data and computed values as props.
// No fetching, no intervals, no hooks.
export default function DealCard({ dispensary, deal, windowText, countdown, gasCostText }: DealCardProps) {
  const isHappyHour = deal.type === 'happy_hour'
  return (
    <Card as="article" urgent={isHappyHour} style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)' }}>{dispensary.name}</h2>
        <span style={{ ...figure, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {dispensary.distanceMiles.toFixed(1)} miles
        </span>
      </div>
      <div>
        {isHappyHour ? (
          <Badge variant="urgent"><Icon name="clock" size={12} /> Happy hour</Badge>
        ) : (
          <Badge variant="neutral">Daily deal</Badge>
        )}
      </div>
      {/* description may be '' when ingest suppressed non-compliant retailer copy
          (see server sanitizeDescription) — render nothing rather than an empty <p>.
          Trim-guard also covers whitespace-only / undefined copy from any path that
          bypasses the ingest sanitizer (e.g. legacy seed data). */}
      {deal.description && deal.description.trim() !== '' && (
        <p style={{ color: 'var(--text-body)' }}>{deal.description}</p>
      )}
      {/* side-by-side Discount Display (ADR-009): discount in green, gas figure in mono,
          joined by an em dash. Either half may be null — render only what's present. */}
      {(deal.discountPct !== null || gasCostText !== null) && (
        <p style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>
          {deal.discountPct !== null && (
            <span style={{ color: 'var(--green-700)', fontWeight: 'var(--weight-semibold)' }}>
              {deal.discountPct}% off
            </span>
          )}
          {deal.discountPct !== null && gasCostText !== null && ' — '}
          {gasCostText !== null && (
            <>
              <span style={figure}>{gasCostText}</span> to get there
            </>
          )}
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
    </Card>
  )
}
