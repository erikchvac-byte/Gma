import type { ProductObservation, ProductOptionObservation, ProductRecord, RawProduct } from '../types/index.js'

// Unit-economics normalization for Dutchie products (SPEC-dutchie-product-pricing
// CAP-5, ADR-053). Turns a RawProduct (extracted prices, unresolved weight unit)
// into a ProductRecord with one timestamped observation whose options carry true
// per-gram and per-item ($/joint) figures.
//
// Two source fields are LOAD-BEARING and not structured:
//   1. pack count lives in the free-text Name ("2pk", "5-pack") — there is no
//      structured pack field; it MUST be parsed to compute $/item, and an
//      unparseable pack on a pre-roll is FLAGGED, never silently treated as 1.
//   2. the raw `weight` field's unit is unresolved (1000 for a "2g" 2-pack →
//      per-unit milligrams). Per-gram math uses the Options label parsed to grams;
//      `weight` is used only as a VALIDATION signal — a contradiction is flagged.

const PRE_ROLL = 'Pre-Rolls'
const GRAMS_PER_OZ = 28.3495

// Round to cents so stored $/g and $/item are clean and comparable.
function r2(x: number): number {
  return Math.round(x * 100) / 100
}

// Pack count from the free-text name: "2pk", "5-pack", "3 pack", "10ct", "5 joints".
// Returns null when no count is present (unparseable → flagged downstream).
export function parsePackCount(name: string): number | null {
  const m = name.match(/(\d+)\s*-?\s*(pk|packs?|joints?|ct|count)\b/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Total grams for an option label: "2g"→2, "3.5g"→3.5, "100mg"→0.1, "1oz"→28.35,
// bare "2"→2 (grams assumed). Returns null when no number is present.
export function parseGrams(option: string): number | null {
  const m = option.match(/([\d.]+)\s*(g|gram|grams|mg|milligram|milligrams|oz|ounce|ounces)?/i)
  if (!m) return null
  const val = parseFloat(m[1])
  if (!Number.isFinite(val)) return null
  const unit = (m[2] ?? 'g').toLowerCase()
  if (unit.startsWith('mg') || unit.startsWith('milligram')) return val / 1000
  if (unit.startsWith('oz') || unit.startsWith('ounce')) return r2(val * GRAMS_PER_OZ)
  return val
}

function perGram(price: number | null, grams: number | null): number | null {
  return price !== null && grams !== null && grams > 0 ? r2(price / grams) : null
}

function perItem(price: number | null, pack: number | null): number | null {
  return price !== null && pack !== null && pack > 0 ? r2(price / pack) : null
}

// Two milligram totals agree within 2% (slack for rounded option labels). Used to
// reconcile the unresolved `weight` field against the trusted Options-derived total.
function approxMg(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false
  return Math.abs(a - b) / Math.max(a, b) <= 0.02
}

// Build one ProductRecord (identity + a single observation) from a RawProduct.
// Per-item economics are computed ONLY for pre-rolls (where a pack of joints makes
// $/joint meaningful); for Flower/Vaporizers the canonical unit is $/gram and
// pricePerItem stays null (not a flag — per-item is n/a there).
export function normalizeProduct(
  raw: RawProduct,
  dispensaryId: string,
  observedAt: string,
): ProductRecord {
  const isPreRoll = raw.category === PRE_ROLL
  const parsedPack = parsePackCount(raw.name)
  const flags: string[] = []

  // Pre-roll pack count: use the parsed count when present, else treat the pre-roll as
  // a SINGLE joint (Erik's rule 2026-06-24, overriding the spec's flag-don't-assume
  // default for THIS case — most singles carry no pack word, and flagging them all
  // contributed no $/joint and thinned the "cheapest $/joint" signal). We still FLAG an
  // inferred single ('assumed-single') so it stays distinguishable from a parsed "1pk".
  // Non-pre-rolls keep the parsed value (may be null) — $/item is n/a there anyway.
  const packCount = isPreRoll ? (parsedPack ?? 1) : parsedPack
  if (isPreRoll && parsedPack === null) flags.push('assumed-single')

  const options: ProductOptionObservation[] = raw.options.map((o) => {
    const weightGrams = parseGrams(o.option)
    if (weightGrams === null && !flags.includes('unparseable-weight')) {
      flags.push('unparseable-weight')
    }
    return {
      option: o.option,
      weightGrams,
      basePrice: o.basePrice,
      specialPrice: o.specialPrice,
      pricePerGram: perGram(o.basePrice, weightGrams),
      pricePerItem: isPreRoll ? perItem(o.basePrice, packCount) : null,
      specialPricePerGram: perGram(o.specialPrice, weightGrams),
      specialPricePerItem: isPreRoll ? perItem(o.specialPrice, packCount) : null,
      quantityAvailable: o.quantityAvailable,
    }
  })

  // Weight reconciliation (validation only). For a single-option product we can
  // cross-check three independent signals of total weight: Options-grams×1000,
  // measurements.netWeight (mg), and weight×packCount (per-unit mg × pack). A
  // contradiction means the unit assumption is wrong → flag, don't trust silently.
  // CAVEAT: multi-option products skip this check, so a (rare) multi-option pack whose
  // Options are PER-UNIT rather than total would compute wrong $/g and $/item with NO
  // flag. Low-risk in practice (flower is sold by weight; pre-roll packs are single-
  // option), but it is a silent-wrong path, not just an un-validated one — revisit if a
  // multi-option pre-roll pack ever appears live.
  if (
    raw.options.length === 1 &&
    options[0].weightGrams !== null &&
    raw.netWeightMg !== null &&
    raw.weightField !== null &&
    packCount !== null
  ) {
    const totalFromOption = options[0].weightGrams * 1000
    const totalFromWeightField = raw.weightField * packCount
    if (
      !approxMg(raw.netWeightMg, totalFromOption) ||
      !approxMg(totalFromWeightField, totalFromOption)
    ) {
      flags.push('weight-mismatch')
    }
  }

  const observation: ProductObservation = {
    observedAt,
    special: raw.special,
    options,
  }

  return {
    productId: raw.productId,
    dispensaryId,
    name: raw.name,
    category: raw.category,
    brand: raw.brand,
    strainType: raw.strainType,
    packCount,
    flags,
    history: [observation],
  }
}
