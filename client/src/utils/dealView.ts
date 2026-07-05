import type { Deal, Dispensary } from '../types'
import { dealIcons, type DealIconName } from './dealIcons'

// Discount magnitude is encoded with the single amber discount accent (ADR-041)
// at a stepped font-weight — these tiers drive that, never a second hue.
export type DiscountTier = 'high' | 'mid' | 'low'

// A filter-bar category: the card glyph vocabulary (dealIcons) with the three
// pre-roll pack variants collapsed into one — pack count is deal-level detail,
// not a shoppable category. Scope tags (store-wide / price-drop /
// special-pricing) ARE categories here, per Erik's explicit call.
export type DealCategory = Exclude<DealIconName, 'joint-double' | 'joint-triple'>

// Fixed canonical bar order, so the bar never reshuffles as deals come and go.
// Record-typed (like DEAL_ICON_LABEL) so adding a DealIconName without slotting
// it here fails the build — an unlisted category would otherwise be silently
// unfilterable, since categoriesPresent filters through this list. Insertion
// order of non-numeric string keys is spec-guaranteed, so the Record IS the order.
const CATEGORY_POSITION: Record<DealCategory, null> = {
  bud: null,
  'joint-single': null,
  concentrate: null,
  dabs: null,
  shatter: null,
  diamond: null,
  vape: null,
  edible: null,
  drink: null,
  tincture: null,
  glass: null,
  'store-wide': null,
  'price-drop': null,
  'special-pricing': null,
}
export const CATEGORY_ORDER = Object.keys(CATEGORY_POSITION) as readonly DealCategory[]

// Collapse a card glyph to its bar category (pre-roll pack variants → one).
function toCategory(name: DealIconName): DealCategory {
  return name === 'joint-double' || name === 'joint-triple' ? 'joint-single' : name
}

// The categories one deal carries — the SAME matcher (dealIcons) on the SAME
// subject text buildDealBlocks uses (layered-sale title when present), so the
// filter bar and the card tags can never disagree. De-duped after collapsing.
export function dealCategories(deal: Deal): DealCategory[] {
  const subject = resolveLayeredSale(deal.description)?.title ?? deal.description
  const categories: DealCategory[] = []
  for (const name of dealIcons(subject)) {
    const category = toCategory(name)
    if (!categories.includes(category)) categories.push(category)
  }
  return categories
}

// Categories present anywhere in the page's active deals, in canonical order.
// Drives which icons the filter bar renders — an icon only shows when at least
// one on-page store carries a deal in that category.
export function categoriesPresent(dispensaries: Dispensary[]): DealCategory[] {
  const present = new Set<DealCategory>()
  for (const dispensary of dispensaries)
    for (const deal of dispensary.deals)
      for (const category of dealCategories(deal)) present.add(category)
  return CATEGORY_ORDER.filter((category) => present.has(category))
}

// The scope tags — deal-level qualifiers, not products. Everything else in
// DealCategory names a shoppable product family.
const SCOPE_TAGS: readonly DealCategory[] = ['store-wide', 'price-drop', 'special-pricing']

// In-memory filter mirroring DealFeed's distance filter — zero network.
// null = passthrough (no category selected). Returns each store with its deals
// narrowed to those matching the selection; empty stores drop out downstream
// when groupDealsByStore yields no group for them.
// Store-wide WILDCARD (Erik, 2026-07-05): a "25% off everything" deal applies
// to every product the store sells, so it matches under any PRODUCT selection
// — otherwise a store whose only deal is store-wide would vanish when the user
// presses Vapes, hiding a deal that does discount vapes. Scope selections
// (store-wide / price-drop / special-pricing) stay exact: pressing Price drop
// must not surface percent-off-everything deals.
export function filterByCategory(
  dispensaries: Dispensary[],
  sel: DealCategory | null,
): Dispensary[] {
  if (sel === null) return dispensaries
  const wildcardApplies = !SCOPE_TAGS.includes(sel)
  return dispensaries.map((dispensary) => ({
    ...dispensary,
    deals: dispensary.deals.filter((deal) => {
      const categories = dealCategories(deal)
      return categories.includes(sel) || (wildcardApplies && categories.includes('store-wide'))
    }),
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

// Display-only time bound on ADR-026 last-known-good. `lastFetchedAt` is refreshed
// (by applyIngest/runScrapers) ONLY on a non-empty scrape, so a store whose most
// recent good ingest is older than this has almost certainly ended its promotion —
// re-serving its cached deals as active would be an Honest-Math violation (ADR-007/009;
// investigation 2026-07-02: Happy Time - Mount Vernon showed a June sale on Jul 2, ~37h
// after its last good scrape, provider now serving zero specials). 24h ⇒ a full day of
// empty/failed scrapes. This is a PRESENTATION bound only — the cached deals stay in
// data.json and reappear on the next good scrape. Deliberately independent of
// STORE_FRESHNESS_WINDOW_MS (3h, ok|stale display) and the alertGate persistent-stale
// window (6h, ops alert); tune the display-expiry boundary here alone.
export const DEAL_EXPIRY_MS = 24 * 60 * 60 * 1000

// True when a store's cached deals should be treated as EXPIRED and NOT rendered as
// active (CAP-1). The display twin of server deriveStoreStatus: same defensive parse
// and fail-open — a missing/empty/malformed/never-ingested timestamp has no evidence
// of a fresh menu, so it expires (returns true). A future timestamp (clock skew) is
// treated as fresh. Boundary is inclusive-kept (`age <= DEAL_EXPIRY_MS` renders as
// today), mirroring deriveStoreStatus's `<=`, so exactly-at-threshold is not expired.
export function areDealsExpired(lastFetchedAt: unknown, now: Date = new Date()): boolean {
  if (typeof lastFetchedAt !== 'string' || lastFetchedAt.trim() === '') return true
  const fetchedMs = Date.parse(lastFetchedAt)
  if (Number.isNaN(fetchedMs)) return true
  return now.getTime() - fetchedMs > DEAL_EXPIRY_MS
}

// One deal plus its upstream-computed display strings. windowText/countdown are
// computed in DealFeed (null means "render nothing" — e.g. malformed times).
export interface DealView {
  deal: Deal
  windowText: string | null
  countdown: string | null
}

// title falls back to the deal's kind when ingest suppressed its description
// (sanitizeDescription can blank non-compliant retailer copy to ''). Daily deals
// are already labelled by their meta ('Daily deal · …'), so a blank one omits the
// title rather than doubling the label; happy hours keep the label because their
// meta is only a time window. badgeRendering: when the percent badge shows this
// deal's magnitude, drop any leading "N% off" the scraped description embeds so
// the card doesn't stutter it (ADR-046). Badge-anchored — never strip when nothing
// else shows the figure. If stripping empties the title, fall through to the kind
// fallback (NOT the raw description — that would re-introduce the stutter).
export function dealTitle(deal: Deal, badgeRendering: boolean): string | null {
  const kindFallback = deal.type === 'happy_hour' ? 'Happy hour' : null
  if (!deal.description || deal.description.trim() === '') return kindFallback
  const base = badgeRendering
    ? stripDiscountPrefix(deal.description, deal.discountPct as number)
    : deal.description
  const cleaned = stripCrossLocationTag(base)
  return cleaned !== '' ? cleaned : kindFallback
}

// metadata line: the happy-hour window, or a daily label + status. null when a
// happy hour has no parseable window (then only the title renders).
export function dealMeta(deal: Deal, windowText: string | null): string | null {
  if (deal.type === 'happy_hour') return windowText
  return `Daily deal · ${windowText ?? 'Active today'}`
}

// One rendered row in a store card. Deals that resolve to the SAME title + meta
// collapse into one block (see buildDealBlocks): pctLabel is then a range.
export interface DealBlock {
  // 'N%' (single tier / exact-dup) | 'min–max%' (collapsed tiers) | null (no discount
  // figure, OR a BOGO — which renders its own badge instead of a percent)
  pctLabel: string | null
  // font-weight ramp, taken from the group's MAX percent
  tier: DiscountTier | null
  title: string | null
  meta: string | null
  icons: DealIconName[]
  // Buy-one-get-one (Dutchie specialType 'bogo'): renders a distinct "BOGO" badge in
  // place of the flat "N% off" magnitude, which would over-state the deal. The percent
  // (if any) stays in the title text since the numeric badge is suppressed.
  isBogo: boolean
  // stable React key
  key: string
}

// Resolve a store's deals into render-ready blocks, COLLAPSING deals that share a
// title + meta into one (ADR: Silvana "redundant Select Products" cleanup). A store
// commonly posts several "N% Off Select Products" tiers — or a layered "…- Y% Off
// Brands" set — that differ only in percent; stacked verbatim they read as near-clone
// rows. We group by the computed display identity (type + title + meta, so a daily
// never merges with a happy hour and different windows stay apart) and show the
// spread as one "min–max%" figure. A single tier still shows "N%"; exact duplicates
// dedupe to one. Group order follows first appearance (deals arrive pre-sorted).
export function buildDealBlocks(views: DealView[]): DealBlock[] {
  interface Group {
    title: string | null
    meta: string | null
    iconSubject: string
    pcts: number[]
    isBogo: boolean
    keyBits: string
  }
  const order: Group[] = []
  const byKey = new Map<string, Group>()
  for (const { deal, windowText } of views) {
    // A BOGO renders a "BOGO" badge, not a flat percent — so its title keeps the
    // percent (badgeRendering=false) since no numeric badge will show it.
    const isBogo = deal.specialType === 'bogo'
    // Layered "Up to X% Off Sale - Y% Off <subject>" tiers (ADR-049) badge the TIER
    // figure Y and title the subject only — resolve it before title/tier so it takes
    // precedence over the multi-tier strip guard.
    const layered = resolveLayeredSale(deal.description)
    const pct = layered ? layered.pct : deal.discountPct
    const tier = discountTier(pct)
    const title = layered ? layered.title : dealTitle(deal, !isBogo && tier !== null)
    const meta = dealMeta(deal, windowText)
    const iconSubject = layered ? layered.title : deal.description
    // isBogo joins the identity so a bogo never collapses into a same-titled flat sale.
    const groupKey = `${deal.type}|${isBogo ? 'bogo' : 'sale'}|${title ?? ''}|${meta ?? ''}`
    let group = byKey.get(groupKey)
    if (!group) {
      group = {
        title,
        meta,
        iconSubject,
        pcts: [],
        isBogo,
        keyBits: `${deal.type}|${deal.description}|${deal.startTime ?? ''}|${deal.endTime ?? ''}`,
      }
      byKey.set(groupKey, group)
      order.push(group)
    }
    // only positive finite percents contribute a figure (matches discountTier); a BOGO
    // suppresses the numeric badge entirely, so its percent never joins the label.
    if (!isBogo && typeof pct === 'number' && Number.isFinite(pct) && pct > 0) group.pcts.push(pct)
  }
  return order.map((group, i) => {
    const distinct = [...new Set(group.pcts)].sort((a, b) => b - a) // high → low
    const max = distinct[0]
    const min = distinct[distinct.length - 1]
    const pctLabel =
      distinct.length === 0 ? null : distinct.length === 1 ? `${max}%` : `${min}–${max}%`
    return {
      pctLabel,
      tier: discountTier(max ?? null),
      title: group.title,
      meta: group.meta,
      icons: dealIcons(group.iconSubject),
      isBogo: group.isBogo,
      key: `${group.keyBits}|${i}`,
    }
  })
}
