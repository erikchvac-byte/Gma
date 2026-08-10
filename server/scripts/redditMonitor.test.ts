import { describe, it, expect } from 'vitest'
import {
  parseListing,
  tokenizeInventory,
  preFilter,
  parseClassification,
  buildAlerts,
  expireSeen,
  precisionLine,
  renderAlertsMarkdown,
  factHeadline,
  factConcernsBrand,
  factFreshnessFrom,
  CATEGORY_TERMS,
  DEFAULT_CONFIDENCE_THRESHOLD,
  type PreFilterContext,
  type ClassifiedCandidate,
  type Classification,
  type RedditPost,
  type SeenMap,
} from './redditMonitor.js'
import { parseArgs } from './redditMonitorRun.js'
import type { Region } from '../utils/regionModel.js'
import type { CitableFact, DisparityFact, RegionalFloorFact } from './factPackager.js'

// ---- fixtures ----

const everett: Region = {
  slug: 'everett',
  label: 'Everett',
  cities: ['Everett', 'Marysville', 'Snohomish'],
  memberDispensaryIds: ['remedy-tulalip'],
  floors: [],
} as unknown as Region

const REGIONS = [everett]

const disparityFact: DisparityFact = {
  kind: 'disparity',
  category: 'Flower',
  displayName: 'Donny Burger (DOH)',
  weightGrams: 7,
  lowPrice: 14.4,
  highPrice: 84,
  lowStoreId: 'bacon-s-buds',
  storeCount: 3,
  sourceUrl: 'https://gmaslist.com/compare/flower',
}
const floorFact: RegionalFloorFact = {
  kind: 'regional-floor',
  category: 'Vaporizers',
  displayName: 'Regulator: Purple Punch',
  weightGrams: 1,
  floorPrice: 30,
  regionLabel: 'Everett',
  regionSlug: 'everett',
  storeCountInCluster: 2,
  sourceUrl: 'https://gmaslist.com/compare/vaporizers/everett',
}

function ctx(overrides: Partial<PreFilterContext> = {}): PreFilterContext {
  return {
    regions: REGIONS,
    inventoryTokens: tokenizeInventory(['Remedy Tulalip', 'Donny Burger']),
    categoryKeys: CATEGORY_TERMS,
    ...overrides,
  }
}

function post(over: Partial<RedditPost> = {}): RedditPost {
  return { postId: 't3_x', subreddit: 'everett', title: '', selftext: '', url: 'https://reddit.com/x', createdUtc: 0, ...over }
}

function classification(over: Partial<Classification> = {}): Classification {
  return { intent: 4, geoConfidence: 0.85, matchedStore: '', matchedBrand: '', routedTool: 'cheapest-delivered fact', ...over }
}

function candidate(over: Partial<ClassifiedCandidate> = {}): ClassifiedCandidate {
  return {
    post: post(),
    pre: { passed: true, geoTokens: ['everett'], matchedCategory: 'flower' },
    classification: classification(),
    fact: disparityFact as CitableFact,
    factAsOf: '2026-08-09T05:00:00.000Z',
    factFreshness: 'fresh',
    ...over,
  }
}

// ---- parseArgs (runner CLI) ----

describe('parseArgs', () => {
  it('defaults to a live run with no limit override', () => {
    expect(parseArgs([])).toEqual({ dry: false })
  })
  it('parses --dry and a valid --limit', () => {
    expect(parseArgs(['--dry', '--limit', '25'])).toEqual({ dry: true, limit: 25 })
  })
  it('leaves limit unset (config default) when --limit is non-numeric or non-positive', () => {
    expect(parseArgs(['--limit', 'abc']).limit).toBeUndefined()
    expect(parseArgs(['--limit', '0']).limit).toBeUndefined()
  })
  it('never swallows a following flag: `--limit --dry` still runs dry', () => {
    expect(parseArgs(['--limit', '--dry'])).toEqual({ dry: true })
    expect(parseArgs(['--limit'])).toEqual({ dry: false })
  })
})

// ---- parseListing ----

describe('parseListing', () => {
  it('extracts t3 posts and builds a permalink URL', () => {
    const body = JSON.stringify({
      data: {
        children: [
          { kind: 't3', data: { id: 'abc', name: 't3_abc', subreddit: 'everett', title: 'hi', selftext: 'b', permalink: '/r/everett/comments/abc/hi/', created_utc: 123 } },
        ],
      },
    })
    const posts = parseListing(body)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ postId: 't3_abc', subreddit: 'everett', url: 'https://www.reddit.com/r/everett/comments/abc/hi/' })
  })
  it('synthesizes t3_ name when only id present, and skips childless junk', () => {
    expect(parseListing({ data: { children: [{ data: { id: 'z' } }] } })[0].postId).toBe('t3_z')
    expect(parseListing('not json')).toEqual([])
    expect(parseListing({})).toEqual([])
    expect(parseListing({ data: { children: [{ data: {} }] } })).toEqual([]) // no id
  })
})

// ---- tokenizeInventory ----

describe('tokenizeInventory', () => {
  it('keeps significant words + full phrase, drops stopwords and short tokens', () => {
    const set = tokenizeInventory(['Remedy Tulalip', 'The Cannabis Store'])
    expect(set.has('remedy tulalip')).toBe(true)
    expect(set.has('remedy')).toBe(true)
    expect(set.has('tulalip')).toBe(true)
    expect(set.has('the')).toBe(false)
    expect(set.has('cannabis')).toBe(false) // stopword
    expect(set.has('store')).toBe(false) // stopword
  })
})

// ---- preFilter (I/O matrix) ----

describe('preFilter — precision gate', () => {
  it('passes with a hard geo token AND an inventory (store) signal', () => {
    const r = preFilter(post({ title: 'Best deal at Remedy in Everett?' }), ctx())
    expect(r.passed).toBe(true)
    expect(r.geoTokens).toContain('everett')
    expect(r.matchedBrand).toBe('remedy')
  })
  it('passes on geo + a product-category term (keeps intent #3 alive)', () => {
    const r = preFilter(post({ title: 'flower prices in Marysville are insane' }), ctx())
    expect(r.passed).toBe(true)
    expect(r.matchedCategory).toBe('flower')
  })
  it('drops geo-only with no inventory/category signal', () => {
    const r = preFilter(post({ title: 'anyone else moving to Everett?' }), ctx())
    expect(r.passed).toBe(false)
    expect(r.reason).toMatch(/no inventory/)
  })
  it('drops broad-WA only (bare "Washington" is never a hard local token)', () => {
    const r = preFilter(post({ title: 'cheap flower anywhere in Washington?' }), ctx())
    expect(r.passed).toBe(false)
    expect(r.geoTokens).toEqual([])
  })
  it('does not match a city substring inside a larger word', () => {
    // "everett" must be whole-word; here it is embedded — should NOT count as a geo token.
    const r = preFilter(post({ title: 'severettish vibes with flower' }), ctx())
    expect(r.geoTokens).toEqual([])
    expect(r.passed).toBe(false)
  })
})

// ---- parseClassification ----

describe('parseClassification', () => {
  it('parses a fenced JSON object and clamps confidence', () => {
    const c = parseClassification('```json\n{"intent": 4, "geoConfidence": 1.5, "matchedStore": "Remedy"}\n```')
    expect(c).toMatchObject({ intent: 4, geoConfidence: 1, matchedStore: 'Remedy', routedTool: 'cheapest-delivered fact' })
  })
  it('rejects an out-of-range intent and unparseable text', () => {
    expect(parseClassification('{"intent": 9, "geoConfidence": 0.9}')).toBeNull()
    expect(parseClassification('no json here')).toBeNull()
  })
  it('accepts intent 0 (not a shopping post) with no routed tool', () => {
    const c = parseClassification('{"intent": 0, "geoConfidence": 0.95}')
    expect(c).toMatchObject({ intent: 0, routedTool: '' })
  })
  it('defaults missing confidence to 0 (below threshold)', () => {
    expect(parseClassification('{"intent": 1}')?.geoConfidence).toBe(0)
  })
})

// ---- buildAlerts (threshold + gate + dedup) ----

describe('buildAlerts', () => {
  it('emits one row for an unseen, above-threshold, fact-bearing candidate', () => {
    const rows = buildAlerts([candidate()], new Set(), { now: new Date('2026-08-09T12:00:00Z') })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ postId: 't3_x', intent: 4, factSourceUrl: disparityFact.sourceUrl, factFreshness: 'fresh' })
    expect(rows[0].factAsOf).toBe('2026-08-09T05:00:00.000Z')
  })
  it('drops a candidate with no gated fact (Model-2)', () => {
    expect(buildAlerts([candidate({ fact: null, factAsOf: '', factFreshness: '' })], new Set())).toHaveLength(0)
  })
  it('drops a below-threshold candidate', () => {
    const c = candidate({ classification: classification({ geoConfidence: DEFAULT_CONFIDENCE_THRESHOLD - 0.01 }) })
    expect(buildAlerts([c], new Set())).toHaveLength(0)
  })
  it('accepts exactly at the threshold', () => {
    const c = candidate({ classification: classification({ geoConfidence: DEFAULT_CONFIDENCE_THRESHOLD }) })
    expect(buildAlerts([c], new Set())).toHaveLength(1)
  })
  it('skips an already-seen postId', () => {
    expect(buildAlerts([candidate()], new Set(['t3_x']))).toHaveLength(0)
  })
  it('never alerts an intent-0 (not-a-shopping-post) candidate, even with a fact', () => {
    const c = candidate({ classification: classification({ intent: 0, geoConfidence: 1, routedTool: '' }) })
    expect(buildAlerts([c], new Set())).toHaveLength(0)
  })
})

// ---- factFreshnessFrom (envelope-age freshness — 'fresh' is computed, never asserted) ----

describe('factFreshnessFrom', () => {
  const now = new Date('2026-08-10T06:00:00Z')
  it('stamps fresh within the age window and stale beyond it', () => {
    expect(factFreshnessFrom('2026-08-10T04:00:00Z', now)).toBe('fresh')
    expect(factFreshnessFrom('2026-08-01T04:00:00Z', now)).toBe('stale')
  })
  it("returns '' (unknown) for a missing/unparseable timestamp instead of asserting fresh", () => {
    expect(factFreshnessFrom('', now)).toBe('')
    expect(factFreshnessFrom('not-a-date', now)).toBe('')
  })
})

// ---- factConcernsBrand (brand-specific intents must not get an unrelated fact) ----

describe('factConcernsBrand', () => {
  it('matches the named brand whole-word in the fact display name', () => {
    expect(factConcernsBrand(disparityFact, 'Donny Burger')).toBe(true)
    expect(factConcernsBrand(disparityFact, 'donny')).toBe(true)
  })
  it('rejects an unrelated brand and an empty brand', () => {
    expect(factConcernsBrand(disparityFact, 'Fifty Fold')).toBe(false)
    expect(factConcernsBrand(disparityFact, '')).toBe(false)
  })
})

// ---- CATEGORY_TERMS single-sourcing (data-propagation protocol guard) ----

describe('CATEGORY_TERMS', () => {
  it('carries the full factPackager alias vocabulary (no re-typed drift)', () => {
    // Terms the old hand-typed list had silently dropped — must stay present now.
    for (const term of ['oz', 'buds', 'resin', 'cartridges', 'pre-roll', 'flower', 'vape']) {
      expect(CATEGORY_TERMS).toContain(term)
    }
  })
})

// ---- expireSeen ----

describe('expireSeen', () => {
  it('prunes entries older than the window, keeps recent and malformed', () => {
    const now = new Date('2026-08-09T00:00:00Z')
    const seen: SeenMap = {
      old: '2025-01-01T00:00:00.000Z', // > 360d
      recent: '2026-08-01T00:00:00.000Z',
      junk: 'not-a-date',
    }
    const out = expireSeen(seen, now)
    expect(out.old).toBeUndefined()
    expect(out.recent).toBe('2026-08-01T00:00:00.000Z')
    expect(out.junk).toBe('not-a-date') // fail-open: never resurfaces a post
  })
})

// ---- precisionLine + render + headline ----

describe('precisionLine', () => {
  it('reports run + lifetime precision, 0% when nothing fired', () => {
    expect(precisionLine(2, 10, 4)).toMatch(/2 alert\(s\) this run; 4\/10 lifetime acted-on \(40% precision\)/)
    expect(precisionLine(0, 0, 0)).toMatch(/0% precision/)
  })
})

describe('renderAlertsMarkdown', () => {
  it('renders the fact age and an empty-state message', () => {
    const rows = buildAlerts([candidate()], new Set())
    const md = renderAlertsMarkdown(rows, '2026-08-09T12:00:00Z')
    expect(md).toMatch(/fact as of 2026-08-09T05:00:00.000Z, fresh/)
    expect(renderAlertsMarkdown([], 'now')).toMatch(/No alerts this run/)
  })
})

describe('factHeadline', () => {
  it('summarizes each fact kind, low-side only', () => {
    expect(factHeadline(disparityFact)).toMatch(/as low as \$14\.40 across WA licensed retailers \(up to \$84\.00/)
    expect(factHeadline(floorFact)).toMatch(/lowest observed \$30\.00 in the Everett, WA area/)
  })
})
