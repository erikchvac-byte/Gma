import { describe, it, expect } from 'vitest'
import type { Disparity } from '../types/index.js'
import type { RegionalFloor } from '../utils/regionalPriceFloor.js'
import type { PriceVsOwnMedianRow } from '../utils/priceVsOwnMedian.js'
import type { Region } from '../utils/regionModel.js'
import {
  resolveGeo,
  selectFact,
  renderCopy,
  renderResult,
  topicMatchesCategory,
  dropPercent,
  disparityUrl,
  regionalFloorUrl,
  storeUrl,
  POSITIONING_LINE,
  type PackagerSources,
} from './factPackager.js'

// ---- fixture factories ----
function disparity(over: Partial<Disparity> = {}): Disparity {
  return {
    matchKey: 'k',
    displayName: 'Widget',
    category: 'Flower',
    weightGrams: 7,
    lowPrice: 20,
    highPrice: 40,
    spread: 20,
    spreadPct: 1,
    storesCarrying: [
      { dispensaryId: 'store-a', price: 20, quantityAvailable: 3 },
      { dispensaryId: 'store-b', price: 40, quantityAvailable: 1 },
    ],
    ...over,
  }
}

function floor(over: Partial<RegionalFloor> = {}): RegionalFloor {
  return {
    matchKey: 'k',
    displayName: 'Widget',
    category: 'Flower',
    weightGrams: 1,
    floorPrice: 7,
    floorDispensaryIds: ['store-a'],
    storeCountInCluster: 2,
    ...over,
  }
}

function ownMedianRow(over: Partial<PriceVsOwnMedianRow> = {}): PriceVsOwnMedianRow {
  return {
    dispensaryId: 'store-a',
    productId: 'p1',
    name: 'Widget',
    category: 'Flower',
    option: '1/8oz',
    currentPrice: 28,
    medianPrice: 40,
    pctVsMedian: -0.3,
    observedDays: 20,
    ...over,
  }
}

function region(over: Partial<Region> = {}): Region {
  return {
    slug: 'bellingham',
    label: 'Bellingham',
    cities: ['Bellingham', 'Ferndale'],
    clusterId: 'c1',
    memberDispensaryIds: ['store-a', 'store-b'],
    storeCount: 2,
    floors: [floor()],
    categories: [{ category: 'Flower', slug: 'flower', floorCount: 1 }],
    ...over,
  }
}

function sources(over: Partial<PackagerSources> = {}): PackagerSources {
  return { disparities: [], regions: [], ownMedianRows: [], ...over }
}

describe('topicMatchesCategory', () => {
  it('matches exact, substring both ways, and empty topic', () => {
    expect(topicMatchesCategory('Flower', 'Flower')).toBe(true)
    expect(topicMatchesCategory('vape', 'Vaporizers')).toBe(true) // category includes topic
    expect(topicMatchesCategory('cheapest flower deals', 'Flower')).toBe(true) // topic includes category
    expect(topicMatchesCategory('', 'Edible')).toBe(true)
    expect(topicMatchesCategory('flower', 'Concentrate')).toBe(false)
  })
})

describe('dropPercent + url builders', () => {
  it('rounds drop magnitude and builds live URLs with slugified category', () => {
    expect(dropPercent(-0.19)).toBe(19)
    expect(dropPercent(-0.004)).toBe(0)
    expect(disparityUrl('Vaporizers')).toBe('https://gmaslist.com/compare/vaporizers')
    expect(regionalFloorUrl('Flower', 'bellingham')).toBe('https://gmaslist.com/compare/flower/bellingham')
    expect(storeUrl('store-a')).toBe('https://gmaslist.com/store/store-a')
  })
})

describe('resolveGeo', () => {
  const regions = [region()]
  it('resolves a covered region by slug, label, and member city', () => {
    expect(resolveGeo('bellingham', regions)).toEqual({ kind: 'region', region: regions[0] })
    expect(resolveGeo('Bellingham', regions)).toEqual({ kind: 'region', region: regions[0] })
    expect(resolveGeo('Ferndale', regions)).toEqual({ kind: 'region', region: regions[0] })
  })
  it('resolves statewide tokens', () => {
    expect(resolveGeo('wa', regions)).toEqual({ kind: 'statewide' })
    expect(resolveGeo('Washington', regions)).toEqual({ kind: 'statewide' })
    expect(resolveGeo('spokane wa', regions)).toEqual({ kind: 'statewide' }) // WA-signalled, uncovered city
  })
  it('rejects an out-of-WA geo', () => {
    const portland = resolveGeo('Portland OR', regions)
    expect(portland.kind).toBe('out-of-wa') // token is the first non-WA signal seen (portland or or)
    expect(resolveGeo('boise', regions)).toEqual({ kind: 'out-of-wa', token: 'boise' })
  })
  it('marks an unrecognized plausible-WA area as uncovered (not a WA rejection)', () => {
    expect(resolveGeo('Wenatchee', regions)).toEqual({ kind: 'uncovered', geo: 'Wenatchee' })
    expect(resolveGeo('', regions)).toEqual({ kind: 'uncovered', geo: '' })
  })
})

describe('selectFact ranking', () => {
  it('prefers a geo+category regional floor when the geo is a covered region', () => {
    const r = region({ floors: [floor({ floorPrice: 7 })] })
    const result = selectFact('Flower', { kind: 'region', region: r }, sources({
      regions: [r],
      disparities: [disparity()], // present but floor wins
    }))
    expect(result.kind).toBe('regional-floor')
    if (result.kind === 'regional-floor') {
      expect(result.floorPrice).toBe(7)
      expect(result.sourceUrl).toBe('https://gmaslist.com/compare/flower/bellingham')
    }
  })

  it('falls to the statewide disparity with the largest honest spread', () => {
    const result = selectFact('Flower', { kind: 'statewide' }, sources({
      disparities: [
        disparity({ displayName: 'Small gap', spreadPct: 0.2, lowPrice: 30 }),
        disparity({ displayName: 'Big gap', spreadPct: 4.83, lowPrice: 14.4, highPrice: 84 }),
      ],
    }))
    expect(result.kind).toBe('disparity')
    if (result.kind === 'disparity') expect(result.displayName).toBe('Big gap')
  })

  it('falls to an own-median drop constrained to stores in the region', () => {
    const r = region({ floors: [], memberDispensaryIds: ['store-a'] })
    const result = selectFact('Flower', { kind: 'region', region: r }, sources({
      regions: [r],
      ownMedianRows: [
        ownMedianRow({ dispensaryId: 'store-a', pctVsMedian: -0.1, name: 'In geo' }),
        ownMedianRow({ dispensaryId: 'store-z', pctVsMedian: -0.9, name: 'Out of geo' }),
      ],
    }))
    expect(result.kind).toBe('own-median')
    if (result.kind === 'own-median') {
      expect(result.name).toBe('In geo')
      expect(result.sourceUrl).toBe('https://gmaslist.com/store/store-a')
    }
  })

  it('returns kind:none when nothing qualifies', () => {
    const result = selectFact('Flower', { kind: 'statewide' }, sources())
    expect(result.kind).toBe('none')
  })
})

describe('honesty guards (FR-6)', () => {
  it('the "$84 Donny Burger" trap: emits the LOW side only, never the high', () => {
    const donny = disparity({
      displayName: 'Donny Burger (DOH)',
      lowPrice: 14.4,
      highPrice: 84,
      spreadPct: 4.83,
      storesCarrying: [
        { dispensaryId: '2020-solutions-north-bellingham', price: 14.4, quantityAvailable: 4 },
        { dispensaryId: '2020-solutions-pacific-highway', price: 84, quantityAvailable: 1 },
      ],
    })
    const result = selectFact('Flower', { kind: 'statewide' }, sources({ disparities: [donny] }))
    expect(result.kind).toBe('disparity')
    if (result.kind === 'disparity') {
      expect(result.lowPrice).toBe(14.4) // the citable number is the LOW
      expect(result.lowStoreId).toBe('2020-solutions-north-bellingham')
      const copy = renderCopy(result)
      expect(copy).toContain('as low as $14.40')
      expect(copy).toContain('up to $84.00 elsewhere') // high only as the contrast ceiling
    }
  })

  it('never emits a stale regional floor', () => {
    const r = region({ floors: [floor({ stale: true, floorPrice: 7 })] })
    const result = selectFact('Flower', { kind: 'region', region: r }, sources({ regions: [r] }))
    expect(result.kind).toBe('none') // stale floor skipped; nothing else available
  })

  it('never emits a non-finite / non-positive price', () => {
    const bad = selectFact('Flower', { kind: 'statewide' }, sources({
      disparities: [disparity({ lowPrice: 0 }), disparity({ lowPrice: Number.NaN })],
    }))
    expect(bad.kind).toBe('none')
  })

  it('suppresses a sub-1% own-median mover', () => {
    const r = region({ floors: [] })
    const result = selectFact('Flower', { kind: 'region', region: r }, sources({
      regions: [r],
      ownMedianRows: [ownMedianRow({ pctVsMedian: -0.004 })], // rounds to 0%
    }))
    expect(result.kind).toBe('none')
  })

  it('ignores an above-median (premium) row', () => {
    const r = region({ floors: [] })
    const result = selectFact('Flower', { kind: 'region', region: r }, sources({
      regions: [r],
      ownMedianRows: [ownMedianRow({ pctVsMedian: 0.2 })],
    }))
    expect(result.kind).toBe('none')
  })
})

describe('renderCopy — honest, caveat-baked, sourced', () => {
  it('disparity copy carries the low number, verbatim caveat, source URL, positioning line', () => {
    const copy = renderCopy({
      kind: 'disparity',
      category: 'Flower',
      displayName: 'Widget',
      weightGrams: 7,
      lowPrice: 20,
      highPrice: 40,
      lowStoreId: 'store-a',
      storeCount: 2,
      sourceUrl: 'https://gmaslist.com/compare/flower',
    }, 'r/CannabisWA')
    expect(copy).toContain('r/CannabisWA')
    expect(copy).toContain('as low as $20.00')
    expect(copy).toContain('not a discount or a category ranking')
    expect(copy).toContain('Verify in store.')
    expect(copy).toContain('Source: https://gmaslist.com/compare/flower')
    expect(copy).toContain(POSITIONING_LINE)
  })

  it('own-median copy states the below-own-history caveat', () => {
    const copy = renderCopy({
      kind: 'own-median',
      category: 'Flower',
      name: 'Widget',
      option: '1/8oz',
      currentPrice: 28,
      medianPrice: 40,
      dropPercent: 30,
      dispensaryId: 'store-a',
      sourceUrl: 'https://gmaslist.com/store/store-a',
    })
    expect(copy).toContain('30% below')
    expect(copy).toContain('$28.00 vs $40.00 usual')
    expect(copy).toContain('based on observed price history')
  })

  it('never contains discount-hype or a selling claim', () => {
    for (const copy of [
      renderCopy({
        kind: 'disparity', category: 'Flower', displayName: 'W', weightGrams: 7,
        lowPrice: 20, highPrice: 40, lowStoreId: 'a', storeCount: 2,
        sourceUrl: 'https://gmaslist.com/compare/flower',
      }),
      renderCopy({
        kind: 'own-median', category: 'Flower', name: 'W', option: '', currentPrice: 28,
        medianPrice: 40, dropPercent: 30, dispensaryId: 'a', sourceUrl: 'https://gmaslist.com/store/a',
      }),
    ]) {
      expect(copy).not.toMatch(/%\s*off/i)
      expect(copy).not.toMatch(/\bsale\b/i)
      expect(copy).not.toMatch(/\b(buy|shop|order) (from|at|with) us\b/i)
      expect(copy).not.toMatch(/\b(thc|potency|mg\b)/i)
    }
  })
})

describe('renderResult — refusal (FR-6)', () => {
  it('renders an explicit nothing-citable result with no number', () => {
    const out = renderResult({ kind: 'none', reason: 'no gated fact' }, 'Flower', 'Portland OR')
    expect(out).toContain('Nothing citable')
    expect(out).toContain('no gated fact')
    expect(out).toContain(POSITIONING_LINE)
    expect(out).not.toMatch(/\$\d/) // never a dollar figure
  })
})
