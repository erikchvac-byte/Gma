import type { Dispensary } from '../types'

// The three chip filters map to the real Deal.type field (ADR-030 has no
// product-category field). 'all' is the default and a pure passthrough.
export type DealTypeSelection = 'all' | 'happy_hour' | 'daily'

// Discount magnitude is encoded with the single amber discount accent (ADR-041)
// at a stepped font-weight — these tiers drive that, never a second hue.
export type DiscountTier = 'high' | 'mid' | 'low'

// In-memory filter mirroring DealFeed's distance filter — zero network.
// Returns each store with its deals narrowed to the selection; empty stores
// drop out downstream when groupDealsByStore yields no group for them.
export function filterByType(dispensaries: Dispensary[], sel: DealTypeSelection): Dispensary[] {
  if (sel === 'all') return dispensaries
  return dispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => deal.type === sel),
  }))
}

// One store-level urgency badge (ADR-009: reports time, never a verdict).
// Deals arrive pre-sorted soonest-first, so the first with a live countdown is
// the most urgent. No live countdown → the store is daily/all-day → "active today".
export function storeUrgencyBadge(
  deals: ReadonlyArray<{ countdown: string | null }>,
): { variant: 'urgent' | 'neutral'; text: string } {
  const live = deals.find((deal) => deal.countdown !== null)
  return live
    ? { variant: 'urgent', text: `ends in ${live.countdown}` }
    : { variant: 'neutral', text: 'active today' }
}

// Counts distinct "N%" figures in a title. 2+ means a layered sale string
// ("Up to 50% Off Sale - 40% Off Brands") where removing the badge's magnitude
// leaves dangling connectives ("Up to … Sale -") — worse than the stutter. We
// keep those whole (the guard below) rather than mangle them.
const PERCENT_FIGURE = /\d+(?:\.\d+)?\s*%/g

// Separators that orphan when a magnitude is removed from the head/tail of a
// title ("Dabstract - 50% off" → "Dabstract -" → "Dabstract").
const EDGE_SEPARATORS = /^[·:•–—*\s-]+|[·:•–—*\s-]+$/g

// Qualifiers that grammatically govern the magnitude right after them ("Up to
// 50% off", "Save 20% off"). On a single-figure title the multi-tier guard does
// not fire, so removing the magnitude would orphan the qualifier into a
// meaningless lead-in ("Up to Sale"). When one survives at the head of the
// result we keep the whole original instead — same spirit as the multi-tier
// guard. Scoped to the English copy these WA dispensary feeds use.
const DANGLING_QUALIFIER = /^(?:up to|save|spend|get|extra)\b/i

// Escapes regex metacharacters so a magnitude that stringifies with one (a
// decimal point, or an exotic exponent form) can never corrupt the pattern.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Display-only: drops the magnitude the percent badge already shows so the card
// doesn't stutter it (ADR-046, generalized). Badge-anchored to the deal's EXACT
// discountPct — wherever it appears, not just the start — so a *different* number
// in the title (e.g. a "30% THC" when the discount is 50%) is never touched.
// `off` is optional because real rows carry the figure without it ("40% ONLINE
// ORDERS") yet still derive a discountPct. Multi-tier and dangling-qualifier
// titles are returned whole (guards). Never mutates input; an empty result means
// the title was nothing but the phrase — the caller (dealTitle) falls back to
// the kind label.
export function stripDiscountPrefix(title: string, discountPct: number): string {
  // Defensive: the caller only passes a positive finite pct, but a bad value
  // would build a nonsense pattern — no-op rather than mangle.
  if (!Number.isFinite(discountPct)) return title

  // Guard: layered sale → leave the whole title, don't collapse it to nonsense.
  const figures = title.match(PERCENT_FIGURE)
  if (figures && figures.length >= 2) return title

  // Anchor to the badge's own magnitude. `\b` before the number stops `5` from
  // biting into "45%"; the literal "%" stops it from matching year digits.
  const badgeMagnitude = new RegExp(
    `\\b${escapeRegExp(String(discountPct))}\\s*%\\s*(?:off\\b)?[\\s·:•–—*-]*`,
    'gi',
  )

  const stripped = title
    .replace(badgeMagnitude, ' ') // space, not '', so "2026 40% Off Ounces" → "2026 Ounces"
    .replace(/\s{2,}/g, ' ')
    .replace(EDGE_SEPARATORS, '')
    .trim()

  // Stripping orphaned a governing qualifier ("Up to 50% Off Sale" → "Up to
  // Sale") — keep the readable original rather than emit the fragment.
  if (DANGLING_QUALIFIER.test(stripped)) return title

  return stripped
}

// Operator-maintained set of cross-location tags some chains append to a
// special's display name when they author ONE promo list shared across stores.
// Happy Time runs the same six specials at its Pullman and Mount Vernon shops and
// types "PULLMAN" into each title (proven: description ← menuDisplayName verbatim,
// server/scrapers/_dutchie.ts) — so the Mount Vernon store's cards all read
// "… Pre-Rolls PULLMAN". This is the dispensary's own text, not anything our code
// adds; neither sanitizeDescription (compliance) nor stripDiscountPrefix (percent)
// touches a location word. Add a tag here only when a real listing warrants it —
// same operator-tuned philosophy as DESCRIPTION_BLOCKLIST.
export const CROSS_LOCATION_TAGS: readonly string[] = ['PULLMAN']

// Matches one cross-location tag pinned to the END of the title, plus the
// separator/space that precedes it ("Flower PULLMAN" → "Flower", not "Flower ").
// Trailing-only + whole-word (\b) + case-insensitive keeps it surgical: it can't
// bite a tag that legitimately appears mid-title, nor a longer word that merely
// ends in one. Empty list ⇒ never-matching pattern (the `(?!)` fail-fast).
const CROSS_LOCATION_TAG = CROSS_LOCATION_TAGS.length
  ? new RegExp(
      `[\\s·:•–—*-]*\\b(?:${CROSS_LOCATION_TAGS.map(escapeRegExp).join('|')})\\b\\s*$`,
      'i',
    )
  : /(?!)/

// Display-only: drops a trailing cross-location tag (see CROSS_LOCATION_TAGS) so a
// Mount Vernon card stops reading "… PULLMAN". Never mutates input. An empty result
// means the title was nothing but the tag — the caller (dealTitle) falls back to
// the kind label, never to the raw description.
export function stripCrossLocationTag(title: string): string {
  return title.replace(CROSS_LOCATION_TAG, '').replace(EDGE_SEPARATORS, '').trim()
}

// Layered "Up to X% Off Sale - Y% Off <subject>" tier cards (ADR-049). Three WA
// stores (KushMart North, Local Roots 128th, Kushman's Evergreen) post ONE card per
// brand-tier under a shared "Up to 50% Off Sale" headline: "… - 50% Off Brands",
// "… - 40% Off Brands", "… - 30% Off Brands". Two faults result: (1) the scraper's
// parsePercent grabs the FIRST figure ("Up to 50%"), so the 40%/30% tiers all badge
// 50% — an over-promise; (2) stripDiscountPrefix's multi-tier guard (2+ figures →
// keep whole) preserves the title verbatim, stuttering the magnitude the badge
// already shows. Operator-confirmed these are genuine tiers (shoppers get Y% on
// those brands), so the card must badge the TIER figure Y (bound to the product) and
// title the subject only. This MUST run BEFORE discountTier/stripDiscountPrefix in
// the caller — it takes precedence over the multi-tier guard that would otherwise
// keep the whole string. Returns null when the title isn't this exact pattern.
const LAYERED_SALE =
  /^\s*up to\s+\d+(?:\.\d+)?\s*%\s*off\s+sale\s*[-–—]\s*(\d+(?:\.\d+)?)\s*%\s*off\s+(.+?)\s*$/i
export function resolveLayeredSale(
  description: string | null | undefined,
): { pct: number; title: string } | null {
  if (!description) return null
  const m = description.match(LAYERED_SALE)
  if (!m) return null
  const pct = Number(m[1])
  // Defensive: the regex guarantees a numeric group, but a non-positive/non-finite
  // tier would badge nonsense — bail to the normal path rather than show "0% off".
  if (!Number.isFinite(pct) || pct <= 0) return null
  return { pct, title: m[2].trim() }
}

// Magnitude bucket for the discount figure. null / non-finite / non-positive
// (not parseable, or out-of-contract data reaching the client boundary
// unvalidated) → no figure renders at all, never "NaN%" or "-5%".
export function discountTier(pct: number | null): DiscountTier | null {
  if (pct === null || !Number.isFinite(pct) || pct <= 0) return null
  if (pct >= 30) return 'high'
  if (pct >= 15) return 'mid'
  return 'low'
}
