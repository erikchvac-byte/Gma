import { describe, it, expect } from 'vitest'
import {
  buildRegionalPriceFloorReport,
  CLUSTER_RADIUS_MILES,
  type StoreCategoryPresence,
} from './regionalPriceFloor.js'
import type { StoreGeoLookup } from './disparityRollups.js'
import type { StoreHealthStatus } from './extractionHealth.js'
import type { Disparity, DisparityStore } from '../types/index.js'

// Fixture coordinates: 1° latitude ≈ 69.09 miles (R = 3958.8), so at the ratified 10-mile
// radius 0.13° (≈ 8.98 mi) is safely inside and 0.16° (≈ 11.05 mi) safely outside — the
// boundary tests don't chase float-exact 10.0000-mile equality.
const BASE_LAT = 48.0
const LNG = -122.2
const INSIDE_DELTA = 0.13 // ≈ 8.98 mi
const OUTSIDE_DELTA = 0.16 // ≈ 11.05 mi

function disparity(over: Partial<Disparity> = {}): Disparity {
  return {
    matchKey: 'acme::blue-dream::flower',
    displayName: 'Blue Dream',
    category: 'Flower',
    weightGrams: 3.5,
    lowPrice: 30,
    highPrice: 40,
    spread: 10,
    spreadPct: 0.3333,
    storesCarrying: [
      { dispensaryId: 'store-a', price: 40, quantityAvailable: null },
      { dispensaryId: 'store-b', price: 30, quantityAvailable: null },
    ],
    ...over,
  }
}

function geo(entries: [string, { lat: number; lng: number } | null][]): StoreGeoLookup {
  return new Map(entries)
}

function status(entries: [string, StoreHealthStatus][] = []): Map<string, StoreHealthStatus> {
  return new Map(entries)
}

function presence(...pairs: [string, string][]): StoreCategoryPresence[] {
  return pairs.map(([dispensaryId, category]) => ({ dispensaryId, category }))
}

describe('buildRegionalPriceFloorReport (derivation-2.3)', () => {
  describe('clustering (single-linkage over the 1.4 geo lookup)', () => {
    it('merges two stores just inside the radius into one cluster; keeps just-outside stores apart', () => {
      const near = buildRegionalPriceFloorReport(
        [],
        presence(['store-a', 'Flower'], ['store-b', 'Flower']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
        ]),
        status(),
      )
      expect(near.totalClusters).toBe(1)
      expect(near.clusters[0].memberDispensaryIds).toEqual(['store-a', 'store-b'])

      const far = buildRegionalPriceFloorReport(
        [],
        presence(['store-a', 'Flower'], ['store-b', 'Flower']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + OUTSIDE_DELTA, lng: LNG }],
        ]),
        status(),
      )
      expect(far.totalClusters).toBe(2)
      expect(far.clusters.map((c) => c.storeCount)).toEqual([1, 1])
    })

    it('chains transitively: A–B and B–C within radius merge A,B,C even though A–C is outside it', () => {
      const report = buildRegionalPriceFloorReport(
        [],
        presence(['store-a', 'Flower'], ['store-b', 'Flower'], ['store-c', 'Flower']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
          ['store-c', { lat: BASE_LAT + 2 * INSIDE_DELTA, lng: LNG }], // ≈18 mi from A — outside directly
        ]),
        status(),
      )
      expect(report.totalClusters).toBe(1)
      expect(report.clusters[0].memberDispensaryIds).toEqual(['store-a', 'store-b', 'store-c'])
    })

    it('is input-order insensitive: reversed presence/disparity order yields the identical report', () => {
      const g = geo([
        ['store-a', { lat: BASE_LAT, lng: LNG }],
        ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
        ['store-c', { lat: BASE_LAT + OUTSIDE_DELTA * 3, lng: LNG }],
      ])
      const p = presence(['store-a', 'Flower'], ['store-b', 'Edible'], ['store-c', 'Flower'])
      const d = [
        disparity(),
        disparity({
          matchKey: 'zeta::key',
          storesCarrying: [
            { dispensaryId: 'store-c', price: 20, quantityAvailable: null },
            { dispensaryId: 'store-a', price: 25, quantityAvailable: null },
          ],
        }),
      ]
      const forward = buildRegionalPriceFloorReport(d, p, g, status())
      const reversed = buildRegionalPriceFloorReport([...d].reverse(), [...p].reverse(), g, status())
      expect(reversed).toEqual(forward)
    })

    it('clusterId is the lexicographically-first member; clusters sorted by clusterId; centroid is the 4dp member mean', () => {
      const report = buildRegionalPriceFloorReport(
        [],
        presence(['zeta-store', 'Flower'], ['alpha-store', 'Flower'], ['omega-store', 'Flower']),
        geo([
          ['zeta-store', { lat: BASE_LAT, lng: LNG }],
          // +0.05 lng keeps the alpha–zeta diagonal at ≈9.27 mi (inside the 10-mi radius so the
          // pair merges) while still giving centroidLng a non-trivial member mean to assert.
          // (+0.1 lng would push the diagonal to ≈10.10 mi — just OUTSIDE the radius — and split them.)
          ['alpha-store', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG + 0.05 }],
          ['omega-store', { lat: BASE_LAT + OUTSIDE_DELTA * 3, lng: LNG }],
        ]),
        status(),
      )
      expect(report.clusters.map((c) => c.clusterId)).toEqual(['alpha-store', 'omega-store'])
      const first = report.clusters[0]
      expect(first.memberDispensaryIds).toEqual(['alpha-store', 'zeta-store'])
      expect(first.centroidLat).toBe(Math.round(((BASE_LAT + BASE_LAT + INSIDE_DELTA) / 2) * 10000) / 10000)
      expect(first.centroidLng).toBe(Math.round(((LNG + LNG + 0.05) / 2) * 10000) / 10000)
      expect(first.storeCount).toBe(2)
    })

    it('a store with null or absent geo is unclustered + counted, and contributes no presence and no floor offer', () => {
      const report = buildRegionalPriceFloorReport(
        [
          disparity({
            storesCarrying: [
              { dispensaryId: 'store-a', price: 40, quantityAvailable: null },
              { dispensaryId: 'store-null', price: 10, quantityAvailable: null }, // cheapest, but geo-less
            ],
          }),
        ],
        presence(['store-a', 'Flower'], ['store-null', 'Edible'], ['store-absent', 'Concentrate']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-null', null], // present but unresolved (1.4 discipline: never defaulted to 0,0)
        ]),
        status(),
      )
      expect(report.totalClusters).toBe(1)
      expect(report.clusteredStoreCount).toBe(1)
      expect(report.unclusteredStoreCount).toBe(2) // null-mapped + absent-from-lookup
      const cluster = report.clusters[0]
      // The geo-less store's cheaper offer must NOT set the cluster floor (it is in no cluster).
      expect(cluster.floors).toHaveLength(1)
      expect(cluster.floors[0]).toMatchObject({ floorPrice: 40, floorDispensaryIds: ['store-a'], storeCountInCluster: 1 })
      // Its categories never reach a cluster's presence — but DO count toward the universe
      // (a gap claim "no store here carries Edible" stays honest and is emitted).
      expect(cluster.categoriesPresent).toEqual(['Flower'])
      expect(report.categoryUniverse).toEqual(['Concentrate', 'Edible', 'Flower'])
      expect(cluster.availabilityGaps).toEqual(['Concentrate', 'Edible'])
    })

    it('a store with a non-finite coordinate (NaN/Infinity) is unclustered + counted, never a phantom singleton', () => {
      // `number` admits NaN, so buildStoreGeoLookup can emit it; without the finiteness guard the
      // store would haversine-to-NaN (never unioning) and surface as a lone cluster with a NaN
      // centroid. It must be treated exactly like null/absent geo instead.
      const report = buildRegionalPriceFloorReport(
        [],
        presence(['store-a', 'Flower'], ['store-nan', 'Edible'], ['store-inf', 'Concentrate']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-nan', { lat: Number.NaN, lng: LNG }],
          ['store-inf', { lat: BASE_LAT, lng: Number.POSITIVE_INFINITY }],
        ]),
        status(),
      )
      expect(report.totalClusters).toBe(1)
      expect(report.clusters[0].memberDispensaryIds).toEqual(['store-a'])
      expect(report.clusteredStoreCount).toBe(1)
      expect(report.unclusteredStoreCount).toBe(2)
      // Their categories still count toward the universe (unclustered ≠ uncollected).
      expect(report.categoryUniverse).toEqual(['Concentrate', 'Edible', 'Flower'])
    })
  })

  describe('price floors (Gate 1 — min WITHIN a same-product cell only)', () => {
    it('floor = min offer price among cluster members, with ALL tied stores listed sorted (1.4 tie lesson)', () => {
      const report = buildRegionalPriceFloorReport(
        [
          disparity({
            storesCarrying: [
              { dispensaryId: 'store-c', price: 30, quantityAvailable: null },
              { dispensaryId: 'store-a', price: 30, quantityAvailable: null }, // tie at the floor
              { dispensaryId: 'store-b', price: 45.5, quantityAvailable: null },
            ],
          }),
        ],
        presence(['store-a', 'Flower'], ['store-b', 'Flower'], ['store-c', 'Flower']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
          ['store-c', { lat: BASE_LAT - INSIDE_DELTA, lng: LNG }],
        ]),
        status(),
      )
      expect(report.totalClusters).toBe(1)
      const floor = report.clusters[0].floors[0]
      expect(floor.floorPrice).toBe(30)
      expect(floor.floorDispensaryIds).toEqual(['store-a', 'store-c'])
      expect(floor.storeCountInCluster).toBe(3)
      expect(report.totalFloors).toBe(1)
      expect(report.singleStoreFloorCount).toBe(0)
    })

    it('a single-store cluster still emits its floor, with storeCountInCluster: 1 explicit and counted', () => {
      const report = buildRegionalPriceFloorReport(
        [disparity()],
        presence(['store-a', 'Flower'], ['store-b', 'Flower']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + OUTSIDE_DELTA, lng: LNG }], // two 1-store clusters
        ]),
        status(),
      )
      expect(report.totalClusters).toBe(2)
      const a = report.clusters.find((c) => c.clusterId === 'store-a')!
      const b = report.clusters.find((c) => c.clusterId === 'store-b')!
      expect(a.floors[0]).toMatchObject({ floorPrice: 40, floorDispensaryIds: ['store-a'], storeCountInCluster: 1 })
      expect(b.floors[0]).toMatchObject({ floorPrice: 30, floorDispensaryIds: ['store-b'], storeCountInCluster: 1 })
      expect(report.singleStoreFloorCount).toBe(2)
    })

    it('a Disparity with no offers in a cluster contributes no row there (not an exclusion)', () => {
      const report = buildRegionalPriceFloorReport(
        [
          disparity(), // carried by store-a + store-b only
          disparity({
            matchKey: 'zeta::other::flower',
            displayName: 'Other',
            storesCarrying: [{ dispensaryId: 'store-far', price: 12, quantityAvailable: null }],
          }),
        ],
        presence(['store-a', 'Flower'], ['store-b', 'Flower'], ['store-far', 'Flower']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
          ['store-far', { lat: BASE_LAT + 1, lng: LNG }],
        ]),
        status(),
      )
      const near = report.clusters.find((c) => c.clusterId === 'store-a')!
      const far = report.clusters.find((c) => c.clusterId === 'store-far')!
      expect(near.floors.map((f) => f.matchKey)).toEqual(['acme::blue-dream::flower'])
      expect(far.floors.map((f) => f.matchKey)).toEqual(['zeta::other::flower'])
      expect(report.totalFloors).toBe(2)
    })

    it('floors are sorted by matchKey then weightGrams; prices pass through verbatim (reconcile with disparities.json)', () => {
      const report = buildRegionalPriceFloorReport(
        [
          disparity({ matchKey: 'zeta', weightGrams: 3.5, storesCarrying: [{ dispensaryId: 'store-a', price: 10.00005, quantityAvailable: null }] }),
          disparity({ matchKey: 'alpha', weightGrams: 7, storesCarrying: [{ dispensaryId: 'store-a', price: 20, quantityAvailable: null }] }),
          disparity({ matchKey: 'alpha', weightGrams: 3.5, storesCarrying: [{ dispensaryId: 'store-a', price: 30, quantityAvailable: null }] }),
        ],
        presence(['store-a', 'Flower']),
        geo([['store-a', { lat: BASE_LAT, lng: LNG }]]),
        status(),
      )
      const floors = report.clusters[0].floors
      expect(floors.map((f) => `${f.matchKey}:${f.weightGrams}`)).toEqual(['alpha:3.5', 'alpha:7', 'zeta:3.5'])
      // 10.00005 is not a fixed point of 2dp/4dp rounding — this fails if pass-through ever rounds.
      expect(floors[2].floorPrice).toBe(10.00005)
    })
  })

  describe('availability gaps (presence/absence only, Gate-4-spirit suppression)', () => {
    it('reports a category absent from a healthy cluster as an availability gap (empty-category case)', () => {
      const report = buildRegionalPriceFloorReport(
        [],
        presence(['store-a', 'Flower'], ['store-a', 'Edible'], ['store-b', 'Flower'], ['store-far', 'Concentrate']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
          ['store-far', { lat: BASE_LAT + 1, lng: LNG }],
        ]),
        status(),
      )
      const near = report.clusters.find((c) => c.clusterId === 'store-a')!
      const far = report.clusters.find((c) => c.clusterId === 'store-far')!
      expect(report.categoryUniverse).toEqual(['Concentrate', 'Edible', 'Flower'])
      expect(near.categoriesPresent).toEqual(['Edible', 'Flower'])
      expect(near.availabilityGaps).toEqual(['Concentrate'])
      expect(far.categoriesPresent).toEqual(['Concentrate'])
      expect(far.availabilityGaps).toEqual(['Edible', 'Flower'])
      expect(near.gapsSuppressed).toBe(false)
    })

    it('a cluster carrying every collected category reports no availability gaps (empty-gaps branch on a real cluster)', () => {
      // The literal "empty universe" case only arises with zero presence records (→ zero clusters,
      // covered by `empty inputs`); a populated cluster always implies a non-empty universe. The
      // reachable no-gaps case is a cluster whose members cover the whole universe → gaps = ∅.
      const report = buildRegionalPriceFloorReport(
        [],
        presence(['store-a', 'Flower'], ['store-a', 'Edible'], ['store-b', 'Edible']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
        ]),
        status(),
      )
      expect(report.totalClusters).toBe(1)
      const only = report.clusters[0]
      expect(report.categoryUniverse).toEqual(['Edible', 'Flower'])
      expect(only.categoriesPresent).toEqual(['Edible', 'Flower'])
      expect(only.availabilityGaps).toEqual([]) // universe − present = ∅
      expect(only.gapsSuppressed).toBe(false)
      expect(report.suppressedGapClusterCount).toBe(0)
    })

    it('suppresses gap claims (not floors) for a cluster containing a suspected-extraction-failure store', () => {
      const report = buildRegionalPriceFloorReport(
        [disparity()],
        presence(['store-a', 'Flower'], ['store-b', 'Flower'], ['store-far', 'Edible']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
          ['store-far', { lat: BASE_LAT + 1, lng: LNG }],
        ]),
        status([['store-b', 'suspected-extraction-failure']]),
      )
      const near = report.clusters.find((c) => c.clusterId === 'store-a')!
      // A broken member store means "no store here carries Edible" could be the hole talking —
      // the absence claim is suppressed, flagged, and counted (1.7 suppression pattern).
      expect(near.gapsSuppressed).toBe(true)
      expect(near.availabilityGaps).toEqual([])
      expect(report.suppressedGapClusterCount).toBe(1)
      // Floors are POSITIVE claims (lowest observed) — still emitted.
      expect(near.floors).toHaveLength(1)
      // Presence stays too (positive evidence).
      expect(near.categoriesPresent).toEqual(['Flower'])
      const far = report.clusters.find((c) => c.clusterId === 'store-far')!
      expect(far.gapsSuppressed).toBe(false)
      expect(far.availabilityGaps).toEqual(['Flower'])
    })

    it("does NOT suppress gaps for an insufficient-history member (young store's today-records are real)", () => {
      const report = buildRegionalPriceFloorReport(
        [],
        presence(['store-a', 'Flower'], ['store-b', 'Edible']),
        geo([
          ['store-a', { lat: BASE_LAT, lng: LNG }],
          ['store-b', { lat: BASE_LAT + INSIDE_DELTA, lng: LNG }],
        ]),
        status([['store-b', 'insufficient-history']]),
      )
      expect(report.clusters[0].gapsSuppressed).toBe(false)
      expect(report.suppressedGapClusterCount).toBe(0)
    })
  })

  it('empty inputs → zeroed report with no clusters and no gap claims', () => {
    const report = buildRegionalPriceFloorReport([], [], geo([]), status())
    expect(report).toEqual({
      clusters: [],
      categoryUniverse: [],
      totalClusters: 0,
      clusteredStoreCount: 0,
      unclusteredStoreCount: 0,
      totalFloors: 0,
      singleStoreFloorCount: 0,
      suppressedGapClusterCount: 0,
    })
  })

  // FR16 / decision-F gate (NFR6): floors reuse the shared Disparity/DisparityStore (narrowed once
  // upstream — no pair, no rate, no potency) and presence is a two-field record — so the banner-rate
  // or potency breach literally does not typecheck (pattern: brandStoreMatrix.test.ts:170-178).
  it('decision F: potency, discount rate, and the base/special price pair are unreachable on the input types', () => {
    const store: DisparityStore = { dispensaryId: 's', price: 25, quantityAvailable: null }
    // @ts-expect-error thc is not a field on DisparityStore (potency hidden — Gate 5)
    void store.thc
    // @ts-expect-error discountPct is not a field on DisparityStore (flat banner rate hidden — fix6)
    void store.discountPct
    // @ts-expect-error basePrice is not a field on DisparityStore (the price PAIR is hidden — Gate 2)
    void store.basePrice
    // @ts-expect-error specialPrice is not a field on DisparityStore (the price PAIR is hidden — Gate 2)
    void store.specialPrice

    const p: StoreCategoryPresence = { dispensaryId: 's', category: 'Flower' }
    // @ts-expect-error price is not a field on StoreCategoryPresence (presence is price-blind — AC3)
    void p.price
    // @ts-expect-error thc is not a field on StoreCategoryPresence (potency hidden — Gate 5)
    void p.thc
    expect(CLUSTER_RADIUS_MILES).toBe(10) // ratified constant (Erik, dev-start 2026-07-12)
  })
})
