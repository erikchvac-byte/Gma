import { describe, it, expect } from 'vitest'
import {
  slugify,
  parseCity,
  buildRegions,
  findRegion,
  floorsForCategory,
  MIN_REGION_STORES,
} from './regionModel.js'
import type { RegionalPriceFloorReport, RegionalCluster, RegionalFloor } from './regionalPriceFloor.js'

function floor(over: Partial<RegionalFloor> = {}): RegionalFloor {
  return {
    matchKey: over.matchKey ?? 'mk',
    displayName: over.displayName ?? 'Product',
    category: over.category ?? 'Concentrate',
    weightGrams: over.weightGrams ?? 1,
    floorPrice: over.floorPrice ?? 10,
    floorDispensaryIds: over.floorDispensaryIds ?? ['store-a'],
    storeCountInCluster: over.storeCountInCluster ?? 1,
  }
}

function cluster(over: Partial<RegionalCluster> = {}): RegionalCluster {
  const memberDispensaryIds = over.memberDispensaryIds ?? ['store-a', 'store-b']
  return {
    clusterId: over.clusterId ?? memberDispensaryIds[0],
    memberDispensaryIds,
    centroidLat: over.centroidLat ?? 48,
    centroidLng: over.centroidLng ?? -122,
    storeCount: over.storeCount ?? memberDispensaryIds.length,
    floors: over.floors ?? [floor()],
    categoriesPresent: over.categoriesPresent ?? ['Concentrate'],
    availabilityGaps: over.availabilityGaps ?? [],
    gapsSuppressed: over.gapsSuppressed ?? false,
  }
}

function report(clusters: RegionalCluster[]): RegionalPriceFloorReport {
  return {
    clusters,
    categoryUniverse: [],
    totalClusters: clusters.length,
    clusteredStoreCount: 0,
    unclusteredStoreCount: 0,
    totalFloors: 0,
    singleStoreFloorCount: 0,
    suppressedGapClusterCount: 0,
  }
}

describe('slugify', () => {
  it('lowercases, replaces non-alphanumerics with a single dash, trims edges', () => {
    expect(slugify('Mount Vernon')).toBe('mount-vernon')
    expect(slugify('Pre-Rolls')).toBe('pre-rolls')
    expect(slugify('  Oak   Harbor!! ')).toBe('oak-harbor')
  })
})

describe('parseCity', () => {
  it('extracts the city from "STREET, CITY, ST ZIP" (with and without ZIP+4)', () => {
    expect(parseCity('5655 Guide Meridian Road, Bellingham, WA 98226')).toBe('Bellingham')
    expect(parseCity('200 Suzanne Ln, Mount Vernon, WA 98273-1234')).toBe('Mount Vernon')
  })
  it('returns null for non-strings and unparseable addresses', () => {
    expect(parseCity(undefined)).toBeNull()
    expect(parseCity(42 as unknown)).toBeNull()
    expect(parseCity('just a street with no city or zip')).toBeNull()
  })
})

describe('buildRegions', () => {
  const cities = new Map<string, string | null>([
    ['store-a', 'Bellingham'],
    ['store-b', 'Bellingham'],
  ])

  it('degrades to [] for an empty or undefined report', () => {
    expect(buildRegions(undefined, cities)).toEqual([])
    expect(buildRegions(report([]), cities)).toEqual([])
  })

  it(`excludes a cluster with fewer than MIN_REGION_STORES (=${MIN_REGION_STORES}) stores`, () => {
    const r = buildRegions(
      report([cluster({ memberDispensaryIds: ['store-a'], storeCount: 1 })]),
      cities,
    )
    expect(r).toEqual([])
  })

  it('names a region after its dominant (modal) member city', () => {
    const many = new Map<string, string | null>([
      ['a', 'Everett'],
      ['b', 'Everett'],
      ['c', 'Lynnwood'],
    ])
    const r = buildRegions(
      report([cluster({ memberDispensaryIds: ['a', 'b', 'c'], storeCount: 3 })]),
      many,
    )
    expect(r).toHaveLength(1)
    expect(r[0].slug).toBe('everett')
    expect(r[0].label).toBe('Everett')
    // coverage disclosure lists ALL distinct member cities, sorted
    expect(r[0].cities).toEqual(['Everett', 'Lynnwood'])
  })

  it('breaks a modal-city tie lexicographically', () => {
    const tie = new Map<string, string | null>([
      ['a', 'Zephyr'],
      ['b', 'Arlington'],
    ])
    const r = buildRegions(report([cluster({ memberDispensaryIds: ['a', 'b'] })]), tie)
    expect(r[0].label).toBe('Arlington')
  })

  it('drops a cluster whose members have no parseable city (never invents a name)', () => {
    const noCity = new Map<string, string | null>([
      ['a', null],
      ['b', null],
    ])
    expect(buildRegions(report([cluster({ memberDispensaryIds: ['a', 'b'] })]), noCity)).toEqual([])
  })

  it('de-dupes a slug collision, keeping the first cluster in sorted order', () => {
    const two = new Map<string, string | null>([
      ['a', 'Everett'],
      ['b', 'Everett'],
      ['c', 'Everett'],
      ['d', 'Everett'],
    ])
    const r = buildRegions(
      report([
        cluster({ clusterId: 'z-cluster', memberDispensaryIds: ['a', 'b'] }),
        cluster({ clusterId: 'a-cluster', memberDispensaryIds: ['c', 'd'] }),
      ]),
      two,
    )
    // both would slug to "everett"; only one region is served
    expect(r).toHaveLength(1)
    expect(r[0].slug).toBe('everett')
  })

  it('skips non-renderable floors and orders categories by floor count desc', () => {
    const r = buildRegions(
      report([
        cluster({
          floors: [
            floor({ category: 'Flower', displayName: 'F1' }),
            floor({ category: 'Flower', displayName: 'F2' }),
            floor({ category: 'Concentrate', displayName: 'C1' }),
            // non-renderable: NaN price is skipped, not counted
            floor({ category: 'Vaporizers', displayName: 'V1', floorPrice: NaN }),
            // non-renderable: empty store list
            floor({ category: 'Vaporizers', displayName: 'V2', floorDispensaryIds: [] }),
          ],
        }),
      ]),
      cities,
    )
    expect(r[0].floors).toHaveLength(3)
    expect(r[0].categories).toEqual([
      { category: 'Flower', slug: 'flower', floorCount: 2 },
      { category: 'Concentrate', slug: 'concentrate', floorCount: 1 },
    ])
  })
})

describe('findRegion', () => {
  it('matches case-insensitively', () => {
    const cities = new Map<string, string | null>([
      ['a', 'Bellingham'],
      ['b', 'Bellingham'],
    ])
    const regions = buildRegions(report([cluster({ memberDispensaryIds: ['a', 'b'] })]), cities)
    expect(findRegion(regions, 'BELLINGHAM')?.slug).toBe('bellingham')
    expect(findRegion(regions, 'nope')).toBeUndefined()
  })
})

describe('floorsForCategory', () => {
  it('filters to the category and orders cheapest-first, then name, then weight', () => {
    const cities = new Map<string, string | null>([
      ['a', 'Bellingham'],
      ['b', 'Bellingham'],
    ])
    const [region] = buildRegions(
      report([
        cluster({
          memberDispensaryIds: ['a', 'b'],
          floors: [
            floor({ category: 'Concentrate', displayName: 'Zeta', floorPrice: 20 }),
            floor({ category: 'Concentrate', displayName: 'Alpha', floorPrice: 8 }),
            floor({ category: 'Concentrate', displayName: 'Beta', floorPrice: 8 }),
            floor({ category: 'Flower', displayName: 'Flower1', floorPrice: 5 }),
          ],
        }),
      ]),
      cities,
    )
    const rows = floorsForCategory(region, 'Concentrate')
    expect(rows.map((f) => f.displayName)).toEqual(['Alpha', 'Beta', 'Zeta'])
    // the $5 Flower floor is not in the Concentrate list despite being cheapest
    expect(rows.every((f) => f.category === 'Concentrate')).toBe(true)
  })
})
