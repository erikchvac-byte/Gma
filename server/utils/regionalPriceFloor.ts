import type { Disparity } from '../types/index.js'
import type { StoreGeoLookup } from './disparityRollups.js'
import type { StoreHealthStatus } from './extractionHealth.js'

// derivation-2.3 — regional price floor + availability gap (D8 / FR15). The third sibling of 1.4
// (disparityRollups.ts) and 2.2 (cheapestDelivered.ts): a PURE consumer of already-computed runner
// inputs. It does NO new derivation — no DB read, no product grouping, no match-key derivation, no
// weight parsing, no price reduction. All of that ran once, upstream, inside buildMatchReport.
//
// TWO HALVES ON ONE GEO-CLUSTER SPINE:
//  (a) FLOORS — for each geo cluster of stores, the lowest observed price per like-for-like cell
//      (match-key + canonical weight). A Gate-1-honest claim because it is a min WITHIN a
//      same-product cell, never across products or a whole category. Floors are POSITIVE claims
//      ("lowest observed here") — missing data can only make a min conservative, never a lie — so
//      they stay emitted even when the availability half is suppressed.
//  (b) AVAILABILITY GAPS — per cluster, which product categories are present at NO member store
//      (presence/absence only, never a category-level price claim). A gap is an ABSENCE assertion,
//      which is dishonest if a member store's extraction silently broke — so a cluster with a
//      `suspected-extraction-failure` member emits `availabilityGaps: []` + `gapsSuppressed: true`
//      and is counted (Gate-4 spirit, 1.7 precedent). `insufficient-history` does NOT suppress (a
//      young store's today-records are real; it merely lacks a trailing median).
//
// GATES ARE INHERITED, NOT RE-IMPLEMENTED. A `Disparity` is BY CONSTRUCTION a same-product,
// same-canonical-weight, ≥2-distinct-store cell whose per-store `price` is the reduced
// `specialPrice ?? basePrice` with reported-sold-out already excluded (crossStoreValue.ts gates
// 1–5, EXCLUDED_FLAGS, canonicalWeightGrams mg/count protection). Consuming that output means
// Gate 1 and the weight gates hold by inheritance — this module imports NO weight parser and
// re-parses NO option label. `floorPrice` is passed through verbatim so it reconciles byte-for-byte
// against disparities.json (2.2 precedent).
//
// GEO comes ONLY from 1.4's merged `StoreGeoLookup` (buildStoreGeoLookup) — no second geo source
// (AC1 verbatim). A store present in the run but with null/absent geo is UNCLUSTERED + counted,
// never defaulted to 0,0 (1.4 discipline).
//
// NO RUNTIME CLIENT IMPORT: haversine is local here (R = 3958.8, numerically identical to
// client/src/utils/distance.ts) — every server→client import in this tree is `import type` only, and
// a value import would be a new build-boundary crossing. The client's ×1.3 road factor is
// deliberately NOT copied: clustering is a geometric grouping claim, not a delivered-cost claim, so
// the road factor stays client-side where user-facing distance/gas lives (ADR-057 posture preserved).
//
// FR16 type-gate is satisfied STRUCTURALLY: floors reuse the shared `Disparity`/`DisparityStore`
// (no base/special pair, no discount %, no potency — narrowed once upstream); presence is the new
// two-field record below (price-blind by construction). A compile-level @ts-expect-error test
// asserts those fields are unreachable.

// Erik-ratified at dev-start 2026-07-12 (2.1 ratification precedent). Single-linkage over the 22
// live geo-resolved stores yields 4 honest regions at 10 mi (Bellingham 5 / Everett-corridor 11 /
// Skagit 5 / Oak Harbor 1 — a real single-store cluster). Below ~8 mi splinters; at 20 mi
// single-linkage chains all stores into one mega-cluster (stay well under it).
export const CLUSTER_RADIUS_MILES = 10

// Great-circle miles. Numerically identical to client/src/utils/distance.ts's constant — see the
// no-runtime-client-import note in the module header for why it is redeclared, not imported.
const EARTH_RADIUS_MILES = 3958.8

// The narrowed presence record projected at the runner boundary (decision-F pattern: the projection
// is the ONLY place the full ProductRecord is visible; this pure fn never sees prices, the
// base/special pair, or potency — the FR16 breach does not compile).
export interface StoreCategoryPresence {
  dispensaryId: string
  category: string
}

export interface RegionalFloor {
  matchKey: string
  displayName: string
  category: string
  weightGrams: number
  floorPrice: number
  floorDispensaryIds: string[]
  storeCountInCluster: number
  // Set only by the region PROJECTION (regionModel.buildRegions), never by this
  // derive: true when every store tied at this floor has a stale/failed extraction,
  // so the row is a last-known price whose current freshness is unverified. The
  // derive itself is freshness-blind and leaves this undefined.
  stale?: boolean
}

export interface RegionalCluster {
  clusterId: string
  memberDispensaryIds: string[]
  centroidLat: number
  centroidLng: number
  storeCount: number
  floors: RegionalFloor[]
  categoriesPresent: string[]
  availabilityGaps: string[]
  gapsSuppressed: boolean
}

export interface RegionalPriceFloorReport {
  clusters: RegionalCluster[]
  categoryUniverse: string[]
  totalClusters: number
  clusteredStoreCount: number
  unclusteredStoreCount: number
  totalFloors: number
  singleStoreFloorCount: number
  suppressedGapClusterCount: number
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h))
}

function r4(x: number): number {
  return Math.round(x * 10000) / 10000
}

// Union-find single-linkage: two stores merge when their haversine distance is `<=` the radius
// (inclusive boundary), transitively. Connected COMPONENTS are identical regardless of union order
// — the final grouping reads find() roots and relabels each group by its lexicographically-first
// member — so the report is input-order insensitive (proven by test).
function cluster(
  members: { id: string; lat: number; lng: number }[],
): { id: string; lat: number; lng: number }[][] {
  const parent = new Map<string, string>()
  for (const m of members) parent.set(m.id, m.id)
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    // path compression
    let cur = x
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    // union by lexicographic root — deterministic, though grouping below is root-independent
    if (ra < rb) parent.set(rb, ra)
    else parent.set(ra, rb)
  }

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (haversineMiles(members[i], members[j]) <= CLUSTER_RADIUS_MILES) {
        union(members[i].id, members[j].id)
      }
    }
  }

  const byRoot = new Map<string, { id: string; lat: number; lng: number }[]>()
  for (const m of members) {
    const root = find(m.id)
    const g = byRoot.get(root) ?? []
    g.push(m)
    byRoot.set(root, g)
  }
  return [...byRoot.values()]
}

export function buildRegionalPriceFloorReport(
  disparities: Disparity[],
  presence: StoreCategoryPresence[],
  geoLookup: StoreGeoLookup,
  storeStatus: Map<string, StoreHealthStatus>,
): RegionalPriceFloorReport {
  // Cluster universe = distinct presence stores WITH resolvable geo. A presence store whose geo is
  // null or absent from the lookup is unclustered + counted (never defaulted to 0,0). A geo-only
  // store with no presence record is not a region member.
  const presenceStoreIds = new Set(presence.map((p) => p.dispensaryId))
  const geoMembers: { id: string; lat: number; lng: number }[] = []
  let unclusteredStoreCount = 0
  for (const id of presenceStoreIds) {
    const geo = geoLookup.get(id)
    // The lookup's value type is `{ lat: number; lng: number }`, but `number` admits NaN/Infinity
    // (buildStoreGeoLookup only checks `typeof === 'number'`). A non-finite coord would poison the
    // haversine (NaN <= radius is false → phantom singleton) and the centroid, so treat it exactly
    // like null/absent geo: unclustered + counted, never clustered, never defaulted to 0,0 (1.4).
    if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
      geoMembers.push({ id, lat: geo.lat, lng: geo.lng })
    } else {
      unclusteredStoreCount++
    }
  }

  // Category universe = distinct categories over ALL presence records (INCLUDING geo-less stores —
  // an unclustered store's category still means the category exists in the run, so a cluster's
  // "no store here carries X" gap stays honest). Data-derived; never a hardcoded list.
  const categoryUniverse = [...new Set(presence.map((p) => p.category))].sort((a, b) =>
    a.localeCompare(b),
  )

  // Per-store category sets, over member stores only (used for a cluster's categoriesPresent).
  const categoriesByStore = new Map<string, Set<string>>()
  for (const p of presence) {
    const set = categoriesByStore.get(p.dispensaryId) ?? new Set<string>()
    set.add(p.category)
    categoriesByStore.set(p.dispensaryId, set)
  }

  const groups = cluster(geoMembers)

  let totalFloors = 0
  let singleStoreFloorCount = 0
  let suppressedGapClusterCount = 0
  let clusteredStoreCount = 0

  const clusters: RegionalCluster[] = groups.map((group) => {
    const memberIds = group.map((m) => m.id).sort((a, b) => a.localeCompare(b))
    const memberSet = new Set(memberIds)
    clusteredStoreCount += memberIds.length

    // FLOORS — per (cluster × Disparity): filter storesCarrying to cluster members; if ≥1 offer,
    // emit a floor row with the min price and ALL stores tied at it (1.4 tie lesson: never crown
    // one store on a tie). Prices pass through verbatim (reconcile with disparities.json).
    const floors: RegionalFloor[] = []
    for (const d of disparities) {
      const offers = d.storesCarrying.filter((s) => memberSet.has(s.dispensaryId))
      if (offers.length === 0) continue // no row (NOT an exclusion — ≥2-store is global to the oracle)
      const floorPrice = Math.min(...offers.map((s) => s.price))
      const floorDispensaryIds = offers
        .filter((s) => s.price === floorPrice)
        .map((s) => s.dispensaryId)
        .sort((a, b) => a.localeCompare(b))
      floors.push({
        matchKey: d.matchKey,
        displayName: d.displayName,
        category: d.category,
        weightGrams: d.weightGrams,
        floorPrice,
        floorDispensaryIds,
        storeCountInCluster: offers.length,
      })
      totalFloors++
      if (offers.length === 1) singleStoreFloorCount++
    }
    floors.sort((a, b) => a.matchKey.localeCompare(b.matchKey) || a.weightGrams - b.weightGrams)

    // AVAILABILITY GAPS — presence/absence only. categoriesPresent over member stores; gaps =
    // universe − present. Suppressed (flagged + counted, never silently dropped) when a member's
    // extraction is suspected-broken; insufficient-history never suppresses.
    const present = new Set<string>()
    for (const id of memberIds) {
      for (const c of categoriesByStore.get(id) ?? []) present.add(c)
    }
    const categoriesPresent = [...present].sort((a, b) => a.localeCompare(b))
    const gapsSuppressed = memberIds.some(
      (id) => storeStatus.get(id) === 'suspected-extraction-failure',
    )
    const availabilityGaps = gapsSuppressed
      ? []
      : categoryUniverse.filter((c) => !present.has(c))
    if (gapsSuppressed) suppressedGapClusterCount++

    const centroidLat = r4(group.reduce((s, m) => s + m.lat, 0) / group.length)
    const centroidLng = r4(group.reduce((s, m) => s + m.lng, 0) / group.length)

    return {
      clusterId: memberIds[0],
      memberDispensaryIds: memberIds,
      centroidLat,
      centroidLng,
      storeCount: memberIds.length,
      floors,
      categoriesPresent,
      availabilityGaps,
      gapsSuppressed,
    }
  })

  clusters.sort((a, b) => a.clusterId.localeCompare(b.clusterId))

  return {
    clusters,
    categoryUniverse,
    totalClusters: clusters.length,
    clusteredStoreCount,
    unclusteredStoreCount,
    totalFloors,
    singleStoreFloorCount,
    suppressedGapClusterCount,
  }
}
