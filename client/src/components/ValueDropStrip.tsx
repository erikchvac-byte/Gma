import type { PriceDropRow } from '../types'
import { formatLastUpdated } from '../utils/formatTime'

// derivation-3.3 — the in-card "Real price drops" strip. Renders a store's genuine drops (a product
// priced BELOW its own rolling median; price-vs-own-median, FR13/Gate 2) INSIDE that store's DealCard,
// under its banner deals. It replaces the retired standalone top-of-feed section (3-2): a drop now sits
// next to the store's link, address, distance and deals so all the store's info reads together.
//
// The card IS the store, so — unlike the old standalone rows — the store name is dropped from the row
// meta (only the option label remains) and from the per-row accessible name (the card's <h2> already
// announces the store). Copy, number formats, and honesty gates are otherwise inherited verbatim.

interface ValueDropStripProps {
  // the store this strip belongs to — scopes the heading id so every card's <h3> id is unique
  storeId: string
  // this store's drops (already store-joined + store-status-gated by DealFeed). Sub-1%-display and
  // above-median rows are filtered here too (renderableDrops) so the strip is safe with raw input.
  drops: PriceDropRow[]
  // draw a hairline divider above the strip — true when it follows a banner deal grid, false on a
  // drop-only/expired card where there is no grid to separate from (the "No current deals" line sits
  // above it instead). Purely presentational.
  divided?: boolean
  // the drops fact's OWN derive time (envelope generatedAt via useValueDrops), NOT the deal-scrape
  // time. Shown as an honest freshness clause when present; null/absent → clause omitted, never a
  // wrong date. One value for the whole derive, so it repeats identically across cards by design.
  generatedAt?: string | null
}

// whole-number percent magnitude of the (negative) drop, e.g. -0.19 → 19
function dropPercent(pctVsMedian: number): number {
  return Math.round(Math.abs(pctVsMedian) * 100)
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// Honest freshness label for a derive time, or '' to omit the clause. Defense-in-depth so the strip
// is safe for ANY caller (not only useValueDrops, which already nulls bad values): reject
// absent/empty, unparseable (NaN), the epoch "never derived" sentinel (t ≤ 0 — never a 1970 date),
// and future/clock-skewed times (t > now — a "prices as of" date can't be in the future).
function freshnessLabel(generatedAt: string | null | undefined): string {
  if (!generatedAt) return ''
  const t = Date.parse(generatedAt)
  if (Number.isNaN(t) || t <= 0 || t > Date.now()) return ''
  return formatLastUpdated(generatedAt)
}

// The one render filter: only honest-discount rows (`pctVsMedian < 0`) whose displayed whole-number
// percent is at least 1% survive. A sub-0.5% mover would render "0% below its usual" — a claimed drop
// with no visible magnitude — so it is suppressed (Honest Math). Shared with DealFeed so the decision
// to give a drop-only store a card matches exactly what this strip renders.
export function renderableDrops(rows: PriceDropRow[]): PriceDropRow[] {
  return rows.filter((r) => r.pctVsMedian < 0 && dropPercent(r.pctVsMedian) !== 0)
}

// Screen-reader name — the mono "%"/"vs" can mis-voice, so spell it out; the FULL (untruncated)
// product name goes here even though the visible name may ellipsize. No store clause: the card's
// <h2> already announces the store. The option label folds in only when present (no dangling ", ,").
function accessibleName(d: PriceDropRow): string {
  const optionPart = d.option === '' ? '' : `${d.option}, `
  return `${d.name}, ${optionPart}${dropPercent(d.pctVsMedian)} percent below its usual price, ${money(d.currentPrice)} versus ${money(d.medianPrice)} usual.`
}

export default function ValueDropStrip({
  storeId,
  drops,
  divided = false,
  generatedAt = null,
}: ValueDropStripProps) {
  const rows = renderableDrops(drops)
  // no renderable drops → the strip is absent entirely (DealCard also gates on this, but stay safe)
  if (rows.length === 0) return null

  // Honest freshness (Investigation Fix 1b): '' when there is no sane derive time to show.
  const freshness = freshnessLabel(generatedAt)

  // unique-per-store heading id (spec §Accessibility). The strip is a plain <div>, NOT a
  // labelled <section>: a section with an accessible name is an ARIA `region` landmark, and one
  // per drop-bearing card would flood landmark navigation with N identically-named regions. A
  // screen-reader user reaches the strip via the card's <h2> store name then this <h3> heading.
  const headingId = `value-drops-${storeId}`
  const className = divided ? 'gma-value-drops gma-value-drops--divided' : 'gma-value-drops'

  return (
    <div className={className}>
      {/* strip heading — a child region of the card's <h2> store name, so an <h3> */}
      <h3 id={headingId} className="gma-value-drops__heading">
        Real price drops
      </h3>
      {/* Same-store explainer — defines "usual" as THIS store's own recent typical price (30-day
          median), reusing the wording already shipped in the crawler HTML (storeRoute.ts). A real
          derive time appends the honest freshness clause; absent/epoch → explainer only. */}
      <p className="gma-value-drops__note">
        Below this store's own recent typical price.
        {freshness !== '' && ` Prices as of ${freshness}.`}
      </p>
      <ul className="gma-value-drops__list">
        {rows.map((d) => (
          <li
            key={`${d.dispensaryId}::${d.productId}::${d.option}`}
            className="gma-value-drops__row"
            aria-label={accessibleName(d)}
          >
            {/* The row's aria-label (accessibleName) is the single spoken source; the visual
                children are all aria-hidden so the product name is not announced twice. */}
            <div className="gma-value-drops__identity" aria-hidden="true">
              <span className="gma-value-drops__name" title={d.name}>
                {d.name}
              </span>
              {/* the card already names the store — the meta is the option label only, omitted
                  entirely when the option is empty (no dangling separator) */}
              {d.option !== '' && <span className="gma-value-drops__meta">{d.option}</span>}
            </div>
            <div className="gma-value-drops__figure" aria-hidden="true">
              <span className="gma-value-drops__headline">
                <span className="gma-value-drops__pct">{dropPercent(d.pctVsMedian)}%</span> below its usual
              </span>
              <span className="gma-value-drops__support">
                {money(d.currentPrice)} vs {money(d.medianPrice)} usual
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
