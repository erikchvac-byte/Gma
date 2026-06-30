import type { IconName } from '../components/ui/Icon'

// The glyphs a deal can carry — one per "item" named in its "X% off ___" blank
// (Erik's model: the text always spells the item; every item gets its icon, in
// the order the text names them). A subset of IconName so each maps 1:1 to an
// <Icon name>. Honest Math (ADR-007/009): we only emit an icon for an item the
// description actually names — never a guess. A multi-item deal yields multiple
// icons; a deal that names no product yields the catch-all 'special-pricing';
// a blank description yields nothing.
export type DealIconName =
  | 'bud'
  | 'joint-single'
  | 'joint-double'
  | 'joint-triple'
  | 'concentrate'
  | 'dabs'
  | 'diamond'
  | 'vape'
  | 'edible'
  | 'drink'
  | 'tincture'
  | 'store-wide'
  | 'price-drop'
  | 'special-pricing'

// Compile-time proof every DealIconName is a real Icon (a typo here fails the
// build, not silently renders nothing).
const _assertIcons: Record<DealIconName, IconName> = {
  bud: 'bud',
  'joint-single': 'joint-single',
  'joint-double': 'joint-double',
  'joint-triple': 'joint-triple',
  concentrate: 'concentrate',
  dabs: 'dabs',
  diamond: 'diamond',
  vape: 'vape',
  edible: 'edible',
  drink: 'drink',
  tincture: 'tincture',
  'store-wide': 'store-wide',
  'price-drop': 'price-drop',
  'special-pricing': 'special-pricing',
}
void _assertIcons

// Human label per glyph, for the accessible name of the icon row (a sighted
// scanner reads the picture; a screen-reader user gets the words).
export const DEAL_ICON_LABEL: Record<DealIconName, string> = {
  bud: 'Flower',
  'joint-single': 'Pre-rolls',
  'joint-double': 'Pre-rolls (2-pack)',
  'joint-triple': 'Pre-rolls (3-pack)',
  concentrate: 'Concentrates',
  dabs: 'Dabs',
  diamond: 'Diamonds',
  vape: 'Vapes',
  edible: 'Edibles',
  drink: 'Drinks',
  tincture: 'Tinctures',
  'store-wide': 'Store-wide',
  'price-drop': 'Price drop',
  'special-pricing': 'Special pricing',
}

// Phrases that contain a category word but are NOT that category — a brand or
// program name. "Join the Joint" is a membership ("Join the Joint: Savings for
// Everyone!"), not a pre-roll; "Cookies" is a brand, not an edible. We blank
// these out of the working copy before matching so the stray word can't fire.
// Operator-maintained, same spirit as dealView's DESCRIPTION_BLOCKLIST.
const FALSE_FRIENDS: readonly RegExp[] = [
  /join the joint/gi,
  /\bcookies\b/gi, // the brand; an actual cookie edible would read "cookie"/"brownie"
]

// Exclusion clauses negate what follows ("(Excluding Capsules)", "excludes
// edibles") — matching the named item there would be a lie. Strip the clause
// (to end of a parenthetical, or to the next comma/period) before scanning.
const EXCLUSION_CLAUSE = /\((?:excl|exclud)[^)]*\)|\b(?:excluding|excludes|excl\.?|not valid on)\b[^,.;)]*/gi

// A category family: the icon it emits and the words that name it. Order within
// `concentrateFamilies` matters (most specific first) so "live resin" → diamond,
// not the generic concentrate. Pre-rolls are resolved separately (pack count).
interface Family {
  name: DealIconName
  re: RegExp
}

// Concentrate sub-forms, most-specific first — only ONE concentrate glyph emits.
const CONCENTRATE_FAMILIES: readonly Family[] = [
  { name: 'diamond', re: /\bdiamonds?\b|\blive resin\b|\bresin\b/i },
  { name: 'dabs', re: /\bdabs?\b|\bshatter\b|\bwax\b|\bbudder\b|\bbadder\b|\bsauce\b|\bsugar\b|\brosin\b/i },
  { name: 'concentrate', re: /\bconcentrates?\b|\bextracts?\b|\brso\b/i },
]

// Non-pre-roll, non-concentrate product families.
const PRODUCT_FAMILIES: readonly Family[] = [
  { name: 'bud', re: /\bflowers?\b|\bbuds?\b|\bounces?\b|\boz\b|\b\d+\s?g\b|\beighths?\b|\bsmalls\b|\bpopcorn\b/i },
  { name: 'vape', re: /\bvapes?\b|\bcarts?\b|\bcartridges?\b|\bdispos?\b|\bdisposables?\b/i },
  { name: 'edible', re: /\bedibles?\b|\bgummies\b|\bgummy\b|\bchocolates?\b|\blollipops?\b|\bbrownies?\b|\bchews?\b/i },
  { name: 'drink', re: /\bdrinks?\b|\bbeverages?\b|\bsodas?\b|\bseltzers?\b|\blemonade\b/i },
  { name: 'tincture', re: /\btinctures?\b|\btopicals?\b|\bcapsules?\b|\bsalves?\b|\bbalms?\b/i },
]

// Whole-store scope — exclusive: when a deal is the whole store, listing each
// product would contradict it. Wins over every product family.
const STORE_WIDE = /\bstore\s?wide\b|\bentire (?:order|purchase|store)\b|\ball (?:cannabis|products|items)\b|\beverything\b|\bwhole store\b|\bsite\s?wide\b/i

// Pre-roll presence and its pack-count variant.
const PRE_ROLL = /\bpre.?rolls?\b|\bjoints?\b/i
const PACK_TRIPLE = /\btriple\b|\b3\s?-?\s?(?:pk|pack)\b/i
const PACK_DOUBLE = /\bdouble\b|\b2\s?-?\s?(?:pk|pack)\b/i

// A fixed-dollar price on the item ("$50 Ounce") rather than a percent — Erik's
// "Price Drop". Guarded against spend THRESHOLDS ("Greater Than $100", "spend
// $75", "orders over $50"), which price nothing.
const DOLLAR_PRICE = /\$\s?\d/
const DOLLAR_THRESHOLD = /\b(?:than|over|above|greater|spend|min(?:imum)?|orders?\s+(?:over|above|of))\b[^$]{0,15}\$\s?\d/i

// Returns the ordered, de-duplicated icons for a deal description. Empty array
// when the description is blank (the card already falls back to a kind label).
export function dealIcons(description: string | null | undefined): DealIconName[] {
  if (!description || description.trim() === '') return []

  // Working copy: drop exclusion clauses and false-friend brand/program names so
  // their stray category words can't fire. Lower-cased matching is handled by the
  // case-insensitive patterns; we keep the text for index ordering.
  let text = description.replace(EXCLUSION_CLAUSE, ' ')
  for (const ff of FALSE_FRIENDS) text = text.replace(ff, ' ')

  // Whole-store deals are exclusive.
  if (STORE_WIDE.test(text)) return ['store-wide']

  // Collect every product family the text names, tagged with where it first
  // appears, so we can emit them in reading order (matches the spelled-out list).
  const hits: { name: DealIconName; idx: number }[] = []

  for (const fam of PRODUCT_FAMILIES) {
    const m = fam.re.exec(text)
    if (m) hits.push({ name: fam.name, idx: m.index })
  }

  // Pre-rolls: one glyph, variant by pack count.
  const pr = PRE_ROLL.exec(text)
  if (pr) {
    const name: DealIconName = PACK_TRIPLE.test(text)
      ? 'joint-triple'
      : PACK_DOUBLE.test(text)
        ? 'joint-double'
        : 'joint-single'
    hits.push({ name, idx: pr.index })
  }

  // Concentrate: one glyph, most-specific sub-form that matches.
  for (const fam of CONCENTRATE_FAMILIES) {
    const m = fam.re.exec(text)
    if (m) {
      hits.push({ name: fam.name, idx: m.index })
      break
    }
  }

  // Reading order, then de-dupe (a family named twice — "Topicals, Tinctures &
  // Capsules" — shows one glyph).
  hits.sort((a, b) => a.idx - b.idx)
  const icons: DealIconName[] = []
  for (const h of hits) if (!icons.includes(h.name)) icons.push(h.name)

  // A genuine fixed-dollar price tags the deal as a price drop, alongside the
  // product (if any). Suppressed when the only "$" is a spend threshold.
  if (DOLLAR_PRICE.test(text) && !DOLLAR_THRESHOLD.test(text)) icons.push('price-drop')

  // Named nothing recognizable (brands / online / membership / hours) — it's
  // still a real deal, so the catch-all tag.
  if (icons.length === 0) return ['special-pricing']

  return icons
}
