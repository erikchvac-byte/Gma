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
import diamond from '../assets/deal-icons/diamond.webp'
import vape from '../assets/deal-icons/vape.webp'
import edible from '../assets/deal-icons/edible.webp'
import drink from '../assets/deal-icons/drink.webp'
import tincture from '../assets/deal-icons/tincture.webp'
import storeWide from '../assets/deal-icons/store-wide.webp'
import priceDrop from '../assets/deal-icons/price-drop.webp'
import specialPricing from '../assets/deal-icons/special-pricing.webp'

export const DEAL_ICON_SRC: Record<DealIconName, string> = {
  bud,
  'joint-single': jointSingle,
  'joint-double': jointDouble,
  'joint-triple': jointTriple,
  concentrate,
  dabs,
  diamond,
  vape,
  edible,
  drink,
  tincture,
  'store-wide': storeWide,
  'price-drop': priceDrop,
  'special-pricing': specialPricing,
}
