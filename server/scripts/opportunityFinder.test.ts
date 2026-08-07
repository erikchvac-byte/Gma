import { describe, it, expect } from 'vitest'
import type { Disparity } from '../types/index.js'
import type { RegionalFloor } from '../utils/regionalPriceFloor.js'
import type { PriceVsOwnMedianRow } from '../utils/priceVsOwnMedian.js'
import type { Region } from '../utils/regionModel.js'
import type { PackagerSources } from './factPackager.js'
import {
  parseCandidates,
  isRivalOrOutChannel,
  candidateGeoIsWa,
  matchFact,
  suggestChannel,
  buildWorklist,
  factHeadline,
  renderWorklistMarkdown,
  type RawCandidate,
} from './opportunityFinder.js'

// ---- fixture factories (mirror factPackager.test.ts) ----
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

function candidate(over: Partial<RawCandidate> = {}): RawCandidate {
  return { url: 'https://www.reddit.com/r/CannabisWA/comments/x/', ...over }
}

describe('parseCandidates', () => {
  it('parses a bare JSON array', () => {
    const out = parseCandidates('[{"url":"https://a.com","title":"T"}]')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ url: 'https://a.com', title: 'T' })
  })
  it('parses JSON inside a ```json fence with surrounding prose', () => {
    const text = 'Here you go:\n```json\n[{"url":"https://a.com"},{"url":"https://b.com"}]\n```\nDone.'
    expect(parseCandidates(text)).toHaveLength(2)
  })
  it('extracts the widest [ ... ] slice from noisy text', () => {
    const out = parseCandidates('noise [{"url":"https://a.com"}] trailing')
    expect(out.map((c) => c.url)).toEqual(['https://a.com'])
  })
  it('wraps a single object into an array', () => {
    expect(parseCandidates('{"url":"https://a.com"}')).toHaveLength(1)
  })
  it('drops entries without a string url, and returns [] on garbage', () => {
    expect(parseCandidates('[{"title":"no url"},{"url":"https://a.com"},{"url":42}]')).toHaveLength(1)
    expect(parseCandidates('this is not json at all')).toEqual([])
    expect(parseCandidates('')).toEqual([])
  })
})

describe('isRivalOrOutChannel (FR-8)', () => {
  it('drops rival/aggregator domains and subdomains', () => {
    expect(isRivalOrOutChannel('https://weedmaps.com/x')).toBe(true)
    expect(isRivalOrOutChannel('https://www.leafly.com/x')).toBe(true)
    expect(isRivalOrOutChannel('https://biz.yelp.com/x')).toBe(true)
    expect(isRivalOrOutChannel('https://leafbuyer.com/x')).toBe(true)
  })
  it('drops an unparseable / linkless URL', () => {
    expect(isRivalOrOutChannel('not a url')).toBe(true)
    expect(isRivalOrOutChannel('')).toBe(true)
  })
  it('keeps a legit IN-channel URL', () => {
    expect(isRivalOrOutChannel('https://www.reddit.com/r/CannabisWA/comments/x/')).toBe(false)
  })
})

describe('candidateGeoIsWa (FR-8)', () => {
  const regions = [region()]
  it('keeps a covered region geo and the statewide sentinel', () => {
    expect(candidateGeoIsWa(candidate({ geo: 'bellingham' }), regions)).toBe(true)
    expect(candidateGeoIsWa(candidate({ geo: 'wa' }), regions)).toBe(true)
  })
  it('drops an explicit out-of-WA geo', () => {
    expect(candidateGeoIsWa(candidate({ geo: 'Portland OR' }), regions)).toBe(false)
  })
  it('keeps an uncovered geo when the text carries a clear WA signal', () => {
    expect(candidateGeoIsWa(candidate({ geo: '', title: 'Cheapest carts in Seattle?' }), regions)).toBe(true)
    expect(candidateGeoIsWa(candidate({ geo: '', snippet: 'anywhere in Washington' }), regions)).toBe(true)
  })
  it('drops an ambiguous candidate with no WA signal, and one with a non-WA signal', () => {
    expect(candidateGeoIsWa(candidate({ geo: '', title: 'best deals anywhere' }), regions)).toBe(false)
    expect(candidateGeoIsWa(candidate({ geo: '', title: 'deals in Portland' }), regions)).toBe(false)
  })
})

describe('matchFact (FR-7, delegates to factPackager)', () => {
  it('pairs a candidate to a gated fact, or returns null to discard', () => {
    const src = sources({ disparities: [disparity()] })
    expect(matchFact(candidate({ topic: 'flower', geo: 'wa' }), src)).not.toBeNull()
    // No gated fact for a category with no data → discard.
    expect(matchFact(candidate({ topic: 'edibles', geo: 'wa' }), src)).toBeNull()
  })
})

describe('suggestChannel', () => {
  it('labels reddit with the subreddit and falls back otherwise', () => {
    expect(suggestChannel(candidate({ url: 'https://www.reddit.com/r/Seattle/comments/x/' }))).toBe(
      'Reddit reply (r/Seattle)',
    )
    expect(suggestChannel(candidate({ url: 'https://someforum.example/thread/1' }))).toBe('IN-channel reply')
  })
})

describe('buildWorklist (FR-7/8/9)', () => {
  it('filters rivals + out-of-WA, pairs facts, ranks, and caps to the limit', () => {
    const r = region({ floors: [floor({ floorPrice: 7 })] })
    const cands: RawCandidate[] = [
      candidate({ url: 'https://weedmaps.com/x', topic: 'flower', geo: 'wa' }), // rival → drop
      candidate({ url: 'https://www.reddit.com/r/Oregon/1', topic: 'flower', geo: 'Portland OR' }), // out-of-WA → drop
      candidate({ url: 'https://www.reddit.com/r/x/1', topic: 'edibles', geo: 'wa' }), // no gated fact → drop
      candidate({ url: 'https://www.reddit.com/r/CannabisWA/2', topic: 'flower', geo: 'bellingham' }), // floor
      candidate({ url: 'https://www.reddit.com/r/CannabisWA/3', topic: 'flower', geo: 'wa' }), // disparity
    ]
    const wl = buildWorklist(cands, sources({ regions: [r], disparities: [disparity()] }), {
      limit: 10,
      now: new Date('2026-08-07T00:00:00Z'),
    })
    expect(wl.scanned).toBe(5)
    expect(wl.kept).toBe(2)
    expect(wl.opportunities).toHaveLength(2)
    // Regional floor outranks statewide disparity.
    expect(wl.opportunities[0].fact.kind).toBe('regional-floor')
    expect(wl.opportunities[1].fact.kind).toBe('disparity')

    const capped = buildWorklist(cands, sources({ regions: [r], disparities: [disparity()] }), {
      limit: 1,
      now: new Date('2026-08-07T00:00:00Z'),
    })
    expect(capped.opportunities).toHaveLength(1)
    expect(capped.kept).toBe(2) // kept counts survivors before the cap
  })

  it('the "$84 Donny Burger" trap: a matched disparity row cites the LOW, never the $84 high', () => {
    const donny = disparity({
      displayName: 'Donny Burger (DOH)',
      lowPrice: 14.4,
      highPrice: 84,
      spreadPct: 4.83,
      storesCarrying: [
        { dispensaryId: 'store-a', price: 14.4, quantityAvailable: 4 },
        { dispensaryId: 'store-b', price: 84, quantityAvailable: 1 },
      ],
    })
    const wl = buildWorklist(
      [candidate({ url: 'https://www.reddit.com/r/CannabisWA/9', topic: 'flower', geo: 'wa' })],
      sources({ disparities: [donny] }),
      { now: new Date('2026-08-07T00:00:00Z') },
    )
    expect(wl.opportunities).toHaveLength(1)
    const o = wl.opportunities[0]
    expect(o.factHeadline).toContain('as low as $14.40')
    expect(o.factCopy).toContain('as low as $14.40')
    expect(o.factCopy).not.toMatch(/as low as \$84/)
  })

  it('emits an empty worklist with a stated reason (never a fabricated row)', () => {
    const empty = buildWorklist([], sources(), { now: new Date('2026-08-07T00:00:00Z') })
    expect(empty.opportunities).toEqual([])
    expect(empty.reason).toMatch(/no candidate threads/)

    const allFiltered = buildWorklist(
      [candidate({ url: 'https://weedmaps.com/x', topic: 'flower', geo: 'wa' })],
      sources({ disparities: [disparity()] }),
      { now: new Date('2026-08-07T00:00:00Z') },
    )
    expect(allFiltered.opportunities).toEqual([])
    expect(allFiltered.reason).toMatch(/no candidate survived/)
  })
})

describe('renderWorklistMarkdown', () => {
  it('renders one scannable row per opportunity with link, fact, source, channel', () => {
    const r = region({ floors: [floor({ floorPrice: 7 })] })
    const wl = buildWorklist(
      [candidate({ url: 'https://www.reddit.com/r/CannabisWA/2', topic: 'flower', geo: 'bellingham', title: 'Cheap flower?' })],
      sources({ regions: [r] }),
      { now: new Date('2026-08-07T00:00:00Z') },
    )
    const md = renderWorklistMarkdown(wl)
    expect(md).toContain('## 1. Cheap flower?')
    expect(md).toContain('https://www.reddit.com/r/CannabisWA/2')
    expect(md).toContain('Suggested channel: Reddit reply (r/CannabisWA)')
    expect(md).toContain('Matched fact:')
    expect(md).toContain('https://gmaslist.com/compare/flower/bellingham')
    expect(md).not.toMatch(/%\s*off/i) // no discount-hype inherited
  })
  it('renders an explicit no-opportunities report', () => {
    const md = renderWorklistMarkdown(buildWorklist([], sources(), { now: new Date('2026-08-07T00:00:00Z') }))
    expect(md).toContain('No opportunities this run')
    expect(md).not.toMatch(/\$\d/) // no fabricated number
  })
})

describe('opportunityFinderRun — pure CLI helpers', () => {
  it('parseArgs reads topic/geo/limit/dry with defaults', async () => {
    const { parseArgs } = await import('./opportunityFinderRun.js')
    expect(parseArgs(['--topic', 'flower', '--geo', 'bellingham', '--limit', '3'])).toEqual({
      topic: 'flower',
      geo: 'bellingham',
      limit: 3,
      dry: false,
    })
    expect(parseArgs(['--dry'])).toEqual({ topic: '', geo: '', limit: 10, dry: true })
    expect(parseArgs(['--limit', 'notanumber']).limit).toBe(10) // fail-soft default
  })
  it('buildSearchPrompt excludes rivals + non-WA and asks for a JSON array', async () => {
    const { buildSearchPrompt } = await import('./opportunityFinderRun.js')
    const p = buildSearchPrompt('vape carts', 'everett')
    expect(p).toContain('Washington')
    expect(p).toMatch(/EXCLUDE weedmaps/i)
    expect(p).toMatch(/JSON array/i)
    expect(p).toContain('vape carts')
    expect(p).toContain('everett')
  })
})

describe('factHeadline', () => {
  it('is low-side-only for a disparity', () => {
    const h = factHeadline({
      kind: 'disparity',
      category: 'Flower',
      displayName: 'W',
      weightGrams: 7,
      lowPrice: 20,
      highPrice: 40,
      lowStoreId: 'a',
      storeCount: 2,
      sourceUrl: 'https://gmaslist.com/compare/flower',
    })
    expect(h).toContain('as low as $20.00')
    expect(h).toContain('up to $40.00 elsewhere')
  })
})
