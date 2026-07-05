import type { DealIconName } from './dealIcons'

// Erik's own sale-tag art (GmasINCOlist/Store sale tags), resized into small
// webp assets — NOT redrawn. dealIcons.ts decides WHICH item a deal names; this
// maps that name to the picture. Vite fingerprints + bundles each import.
import bud from '../assets/deal-icons/bud.webp'
import jointSingle from '../assets/deal-icons/joint-single.webp'
import jointDouble from '../assets/deal-icons/joint-double.webp'
import jointTriple from '../assets/deal-icons/joint-triple.webp'
import concentrate from '../assets/deal-icons/concentrate.webp'
import dabs from '../assets/deal-icons/dabs.webp'
// shatter has no legacy single asset — the family is new (split from dabs);
// its first pool image doubles as the underflow fallback
import shatter from '../assets/deal-icons/shatter/shatter-01.webp'
import diamond from '../assets/deal-icons/diamond.webp'
import vape from '../assets/deal-icons/vape.webp'
import edible from '../assets/deal-icons/edible.webp'
import drink from '../assets/deal-icons/drink.webp'
import tincture from '../assets/deal-icons/tincture.webp'
// glass has no legacy single asset either — same pattern as shatter: one pool
// image doubles as the canonical art / underflow fallback. glass-02 (spoon
// pipe on white), not glass-01: Erik found the green-bong-on-green-tile muddy
// at 28px, and the filter bar wears this canonical art.
import glass from '../assets/deal-icons/glass/glass-02.webp'
import storeWide from '../assets/deal-icons/store-wide.webp'
import priceDrop from '../assets/deal-icons/price-drop.webp'
import specialPricing from '../assets/deal-icons/special-pricing.webp'
import bogoBadge from '../assets/deal-icons/bogo.webp'

export const DEAL_ICON_SRC: Record<DealIconName, string> = {
  bud,
  'joint-single': jointSingle,
  'joint-double': jointDouble,
  'joint-triple': jointTriple,
  concentrate,
  dabs,
  shatter,
  diamond,
  vape,
  edible,
  drink,
  tincture,
  glass,
  'store-wide': storeWide,
  'price-drop': priceDrop,
  'special-pricing': specialPricing,
}

// The BOGO badge is NOT a DealIconName — it replaces the discount figure in the
// deal block (DealCard), not the per-item tag row. Same provenance as the rest:
// Erik's art, resized only.
export const BOGO_BADGE_SRC: string = bogoBadge
