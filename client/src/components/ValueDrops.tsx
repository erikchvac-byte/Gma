import type { Dispensary, PriceDropRow } from '../types'
import { Card } from './ui'
import { useValueDrops } from '../hooks/useValueDrops'

// derivation-3.2 — the "Real price drops" surface. Renders the one honest discount the engine can
// compute: a product priced BELOW its own rolling median (price-vs-own-median, FR13/Gate 2). It is
// product-keyed and joins to the store list by `dispensaryId`; it never carries a banner discount %
// and never renders a verdict word (ADR-009) — it states the fact and lets the shopper judge.
//
// PURELY ADDITIVE: if there are no drops today, the fetch failed, or every row drops out on the
// store-join, this renders NOTHING (no empty-state line, no skeleton) so it can never imply the
// store feed below it is empty or shift/block it. The store-keyed DealFeed/DealCard are untouched.

interface ValueDropsProps {
  // the already-loaded dispensary list (from useDeals, via DealFeed) — the join source for turning
  // a row's `dispensaryId` into a store name. Passed in rather than re-fetched so there is one
  // /api/data load. Price drops are NOT distance-filtered, so this is the FULL list, unfiltered.
  dispensaries: Dispensary[]
}

interface RenderableDrop extends PriceDropRow {
  storeName: string
}

// whole-number percent magnitude of the (negative) drop, e.g. -0.19 → 19
function dropPercent(pctVsMedian: number): number {
  return Math.round(Math.abs(pctVsMedian) * 100)
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// Screen-reader name — the mono "%"/"vs" can mis-voice, so spell it out; the FULL (untruncated)
// product name goes here even though the visible name may ellipsize. The option label is folded in
// only when present, so an empty option never leaves a dangling ", ," in the spoken name.
function accessibleName(d: RenderableDrop): string {
  const optionPart = d.option === '' ? '' : `${d.option}, `
  return `${d.name} at ${d.storeName}, ${optionPart}${dropPercent(d.pctVsMedian)} percent below its usual price, ${money(d.currentPrice)} versus ${money(d.medianPrice)} usual.`
}

export default function ValueDrops({ dispensaries }: ValueDropsProps) {
  const { drops } = useValueDrops()

  // store-join lookup: id → dispensary (name + status). Built once per render.
  const byId = new Map<string, Dispensary>()
  for (const d of dispensaries) byId.set(d.id, d)

  // AC5 / Honest Math: a row whose store is absent from the loaded list (dropped/renamed), or whose
  // store is failed/stale, is dropped — never rendered against a fabricated or unreliable store name.
  const renderable: RenderableDrop[] = []
  for (const row of drops) {
    // Honest Math: the server emits movers down to ±0.01%, but the headline rounds to a whole
    // number — a sub-0.5% drop would render "0% below its usual", a claimed drop with no visible
    // magnitude. Suppress it: only surface drops whose displayed percent is at least 1%.
    if (dropPercent(row.pctVsMedian) === 0) continue
    const store = byId.get(row.dispensaryId)
    if (store === undefined) continue
    if (store.status === 'failed' || store.status === 'stale') continue
    renderable.push({ ...row, storeName: store.name })
  }

  // No drops today / fetch failed / every row dropped → render nothing (states table). Unlike the
  // deal feed, there is deliberately NO empty-state line: an additive value section must never
  // imply the store feed is empty.
  if (renderable.length === 0) return null

  return (
    <Card as="section" aria-labelledby="value-drops-heading" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="gma-value-drops__head">
        <h2 id="value-drops-heading" className="gma-value-drops__heading">
          Real price drops
        </h2>
        {/* count is the number of rows ACTUALLY shown — never over-states the visible list */}
        <span className="gma-value-drops__count">{renderable.length} today</span>
      </div>
      <ul className="gma-value-drops__list">
        {renderable.map((d) => (
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
              <span className="gma-value-drops__meta">
                {d.option === '' ? d.storeName : `${d.storeName} · ${d.option}`}
              </span>
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
    </Card>
  )
}
