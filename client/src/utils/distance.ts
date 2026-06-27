// Great-circle + road-distance math for user-relative store distance (CAP-3).
// One home for the formula; `applyUserDistance` is the only caller and feeds the
// result to the existing `roundTripGasCost` (gasCost.ts). No second formula.

const EARTH_RADIUS_MILES = 3958.8
// Straight-line miles understate a real drive; 1.3 is the conventional
// circuity (road) factor used to approximate driving distance without a routing
// API (Honest Math: an approximation we label as such, never a fabricated exact).
export const ROAD_FACTOR = 1.3

const toRadians = (deg: number): number => (deg * Math.PI) / 180

// Haversine great-circle distance in miles between two {lat,lng} points.
// Returns NaN if any input is non-finite so callers can guard a single value.
export function haversineMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return NaN
  const dLat = toRadians(bLat - aLat)
  const dLng = toRadians(bLng - aLng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * sinLng * sinLng
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Approximate driving distance in miles = great-circle × road factor.
// Returns NaN when any input is non-finite (the finite-guard the transform
// relies on so a poisoned coordinate never reaches the pill/sort).
export function roadDistanceMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  return haversineMiles(aLat, aLng, bLat, bLng) * ROAD_FACTOR
}
