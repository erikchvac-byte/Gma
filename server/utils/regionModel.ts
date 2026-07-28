import type { RegionalPriceFloorReport, RegionalFloor } from './regionalPriceFloor.js'

// Geo-scoped citable-page model (ADR-107). Projects the already-derived
// regional-price-floor fact (regionalPriceFloor.ts, ADR-086) into named consumer
// REGIONS so /compare/<category>/<region> can be the canonical answer to a
// long-tail query ("cheapest concentrate deals Bellingham WA today"). This module
// is PURE and does NO new derivation: it names clusters, filters/orders their
// already-computed floors, and never reads the DB, re-parses weights, or re-reduces
// prices. All the honest work (Gate-1 same-product min, weight gates, sold-out
// exclusion) happened once upstream inside buildMatchReport → buildRegionalPriceFloorReport.
//
// HONESTY POSTURE (inherited, not re-implemented):
// - A `RegionalFloor` is a per-product min WITHIN a same-product cell (match-key +
//   canonical weight), never a category-wide "cheapest = $X" claim. So a page listing
//   floors filtered to one category is a list of same-product lows, NOT a Gate-1
//   leaderboard. The rendering copy must frame it that way (see compareRoute).
// - `floorPrice` passes through verbatim (reconciles with disparities.json).
// - A region is only minted for a cluster of >= MIN_REGION_STORES stores: a lone
//   store is not a cross-store comparison, and "cheapest across 1 store" reads wrong.
// - PAGE-LEVEL STALENESS GUARD (ADR-107): a floor names the store(s) tied at the min
//   price. If a named store's extraction has gone `failed`/`stale`, its current price is
//   untrustworthy — the same reason /store price-drops drop a stale store (storeDrops).
//   So when a store status map is supplied, each floor's holders are narrowed to the
//   NON-dead ones (a fresh store still vouches for the tied price), and a floor whose
//   holders are ALL dead is dropped entirely — a dead store can never be crowned
//   "cheapest." This is a partial guard: it catches a dark store, NOT a store with a
//   today-present-but-wrong price. The complete, engine-wide fix is a today-freshness
//   gate at buildMatchReport (the queued oracle-freshness story), which supersedes this.

// A single-store cluster is not a comparison — exclude it from geo pages. (Oak
// Harbor's 1-store cluster is the live example this guards against.)
export const MIN_REGION_STORES = 2

// The one slugging rule shared by region slugs AND the category segment of a
// region page's URL. Byte-identical to compareRoute.categorySlug's regex so a
// /compare/<category> slug and a /compare/<category>/<region> category segment can
// never disagree (a test asserts the two agree over the live category set).
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Parse the CITY out of "STREET, CITY, ST ZIP" — byte-identical to
// storeRoute.buildPostalAddress's regex, so the city we name a region after is the
// same locality that page emits. Anything that does not match yields null (the
// store simply does not vote for a region name).
export function parseCity(address: unknown): string | null {
  if (typeof address !== 'string') return null
  const m = address.match(/^\s*(.+?),\s*(.+?),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/)
  return m ? m[2].trim() : null
}

export interface RegionCategory {
  category: string
  slug: string
  floorCount: number
}

export interface Region {
  slug: string // dominant-city anchor, e.g. "bellingham"
  label: string // dominant city display, e.g. "Bellingham"
  cities: string[] // distinct member cities, sorted — honest coverage disclosure
  clusterId: string
  storeCount: number
  floors: RegionalFloor[] // renderable floors only
  categories: RegionCategory[] // categories present, by floor count desc then name
}

// Modal (most common) member city; ties break lexicographically. null when no
// member address parses — such a cluster gets no region (we will not invent a name).
function dominantCity(memberIds: string[], cityById: Map<string, string | null>): string | null {
  const freq = new Map<string, number>()
  for (const id of memberIds) {
    const city = cityById.get(id)
    if (city) freq.set(city, (freq.get(city) ?? 0) + 1)
  }
  if (freq.size === 0) return null
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

// A store whose extraction has failed or gone stale carries an untrustworthy current
// price (mirrors the /store price-drop gate). Unknown/absent status is NOT dead
// (fail-open: missing status info must not hide a real floor).
export function isDeadStatus(status: string | undefined): boolean {
  return status === 'stale' || status === 'failed'
}

// Guard the fields a floor is rendered/reduced through so one shapeless row is
// skipped (never a 500), mirroring compareRoute.isRenderableDisparity.
function isRenderableFloor(f: RegionalFloor): boolean {
  return (
    !!f &&
    typeof f.displayName === 'string' &&
    typeof f.category === 'string' &&
    Number.isFinite(f.weightGrams) &&
    Number.isFinite(f.floorPrice) &&
    Array.isArray(f.floorDispensaryIds) &&
    f.floorDispensaryIds.length > 0
  )
}

// Project the derived report + a store→city lookup into named regions. Pure and
// defensive: a shapeless/empty report degrades to [] (never throws). Clusters below
// the store floor, or with no nameable city, are dropped. Slug collisions (two
// clusters that would name to the same city) keep the first and drop the second —
// deterministic given the input sort — rather than serve two different regions at
// one URL.
export function buildRegions(
  report: RegionalPriceFloorReport | undefined,
  cityById: Map<string, string | null>,
  statusById?: Map<string, string>,
): Region[] {
  const clusters = Array.isArray(report?.clusters) ? report!.clusters : []
  const regions: Region[] = []
  const seenSlug = new Set<string>()

  for (const c of clusters) {
    if (!c || !Array.isArray(c.memberDispensaryIds) || c.memberDispensaryIds.length === 0) continue
    const storeCount =
      typeof c.storeCount === 'number' && Number.isFinite(c.storeCount)
        ? c.storeCount
        : c.memberDispensaryIds.length
    if (storeCount < MIN_REGION_STORES) continue

    const label = dominantCity(c.memberDispensaryIds, cityById)
    if (!label) continue
    const slug = slugify(label)
    if (!slug || seenSlug.has(slug)) continue
    seenSlug.add(slug)

    const cities = [
      ...new Set(
        c.memberDispensaryIds
          .map((id) => cityById.get(id))
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      ),
    ].sort((a, b) => a.localeCompare(b))

    // Shape-guard each floor, then (when statuses are known) apply the staleness guard:
    // narrow tied holders to non-dead stores and drop any floor whose holders are all dead.
    const floors: RegionalFloor[] = []
    for (const f of Array.isArray(c.floors) ? c.floors : []) {
      if (!isRenderableFloor(f)) continue
      if (!statusById) {
        floors.push(f)
        continue
      }
      const freshHolders = f.floorDispensaryIds.filter((id) => !isDeadStatus(statusById.get(id)))
      if (freshHolders.length === 0) continue // every store tied at this floor is dark — a dead price
      floors.push(
        freshHolders.length === f.floorDispensaryIds.length
          ? f
          : { ...f, floorDispensaryIds: freshHolders },
      )
    }

    const counts = new Map<string, number>()
    for (const f of floors) counts.set(f.category, (counts.get(f.category) ?? 0) + 1)
    const categories: RegionCategory[] = [...counts.entries()]
      .map(([category, floorCount]) => ({ category, slug: slugify(category), floorCount }))
      .sort((a, b) => b.floorCount - a.floorCount || a.category.localeCompare(b.category))

    regions.push({
      slug,
      label,
      cities,
      clusterId: typeof c.clusterId === 'string' ? c.clusterId : slug,
      storeCount,
      floors,
      categories,
    })
  }

  return regions.sort((a, b) => a.slug.localeCompare(b.slug))
}

export function findRegion(regions: Region[], slug: string): Region | undefined {
  const wanted = slug.toLowerCase()
  return regions.find((r) => r.slug === wanted)
}

// This region's floors for one category, cheapest first (then name, then weight)
// so the page leads with the lowest observed prices. Each row is still a
// same-product min — the ordering is a display convenience, not a cross-product
// ranking claim.
export function floorsForCategory(region: Region, category: string): RegionalFloor[] {
  return region.floors
    .filter((f) => f.category === category)
    .sort(
      (a, b) =>
        a.floorPrice - b.floorPrice ||
        a.displayName.localeCompare(b.displayName) ||
        a.weightGrams - b.weightGrams,
    )
}
