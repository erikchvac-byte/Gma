// Colloquial WA telephone area codes (NPAs) as region handles (deferred item from the
// 2026-07-28 positioning-footer audit). People search and ask "best weed in the 425" or
// "the 360" — the NPA is local slang for a place, so surfacing it lets a geo /compare
// region page answer that phrasing (ADR-107 pages are the canonical long-tail answers).
//
// HONESTY (load-bearing, WAC 314-55-155): an NPA is a TELEPHONE PREFIX and a colloquial
// nickname for an area — it is NOT a legal service area, a delivery zone, or where any
// store is licensed. So an area code is surfaced ONLY as a descriptive keyword and a
// "locals call it" nickname line, NEVER as schema.org `areaServed`/`telephone`, and never
// as a claim that we (or any store) serve or deliver to "the 425." The WA-only areaServed
// invariant (regionDatasetJsonLd.spatialCoverage) is untouched. An unmapped region gets no
// area-code handle at all — fail-open, we never guess an NPA.

// Region slug (dominant-city anchor, regionModel.slugify) → its NPAs, primary first then
// overlays. 564 is the western-Washington overlay layered over 206/253/360/425. Keyed by
// slug so it lines up with how the pages are addressed (/compare/<region>); an entry only
// exists where the NPA is factually correct for that county. Extend as new regions mint:
//   Whatcom (Bellingham) / Skagit (Mount Vernon) = 360; Snohomish (Everett) = 425; both
//   carry the 564 overlay. (King/Seattle = 206, Pierce/Tacoma = 253, eastern WA = 509.)
const REGION_AREA_CODES: Record<string, string[]> = {
  bellingham: ['360', '564'],
  everett: ['425', '564'],
  'mount-vernon': ['360', '564'],
}

// This region's area codes (primary first), or [] when the region is not mapped. [] is the
// honest default: we never invent an NPA for a region we have not verified.
export function areaCodesForRegion(regionSlug: string): string[] {
  return REGION_AREA_CODES[regionSlug] ?? []
}

// A plain-text "locals call it" nickname sentence, or '' when the region has no mapped NPA.
// Framed as colloquial local slang for the AREA — never a service/delivery claim. Returns
// plain text (no HTML); the caller escapes it before inserting into markup. Only the primary
// NPA is named in prose (the overlay is a keyword-only signal, not something people say).
export function areaCodeNicknameSentence(regionSlug: string, label: string): string {
  const codes = areaCodesForRegion(regionSlug)
  if (codes.length === 0) return ''
  return `Locals sometimes call the ${label} area "the ${codes[0]}."`
}

// Keyword tokens for a region page's JSON-LD `keywords` array: the bare NPA and its "the
// <NPA>" locality phrasing, so a query like "cannabis prices in the 425" has a token to
// match. Deliberately NOT "best weed in the 425" — a superiority phrase would brush the WA
// advertising rules; we keep our own keywords to the neutral locality handle. [] when unmapped.
export function areaCodeKeywords(regionSlug: string): string[] {
  return areaCodesForRegion(regionSlug).flatMap((c) => [c, `the ${c}`])
}
