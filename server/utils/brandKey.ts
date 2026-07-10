// Shared brand-identity normalizer for the derivation engine (ADR-077, derivation-1.5,
// decision B). Owned ONCE here so brand-keyed facts agree on identity: 1.5 (brand discount
// personas) and 1.6 (brand→store matrix) both consume this unchanged — never inline brand
// normalization in a fact module.
//
// Lowercase + collapse every run of non-alphanumeric characters to a single space + trim.
// This merges the live casing/punctuation/whitespace variants that are the SAME brand
// (Lavish/LAVISH, EZ-Vape/EZ Vape, "Hustler's Ambition"/"Hustler's Ambition ",
// DOCTOR & CROOK/Doctor & Crook) while changing no genuinely-distinct brand's identity.
// A brand that normalizes to empty (null/undefined/blank/punctuation-only) returns null —
// the caller excludes and COUNTS it (never buckets it under a fabricated "" brand).

export function normalizeBrandKey(brand: string | null | undefined): string | null {
  if (brand == null) return null
  const key = brand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return key === '' ? null : key
}
