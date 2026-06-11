// Single definition of "usable numeric input" for gas math — DealFeed reuses
// this for the vehicle-MPG fallback decision so the two can't drift.
export function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

// Round-trip gas cost in dollars: (distanceMiles × 2) × (gasPrice / mpg).
// Returns null unless every input is a finite number > 0 — callers render
// the discount alone in that case (no '— … to get there' fragment).
export function roundTripGasCost(distanceMiles: number, gasPrice: number, mpg: number): number | null {
  if (!isPositiveFinite(distanceMiles) || !isPositiveFinite(gasPrice) || !isPositiveFinite(mpg)) {
    return null
  }
  const cost = distanceMiles * 2 * (gasPrice / mpg)
  // valid inputs can still overflow to Infinity — never let that reach display
  return Number.isFinite(cost) ? cost : null
}

// 1.4642857… → '$1.46'
export function formatGasCost(cost: number): string {
  return `$${cost.toFixed(2)}`
}
