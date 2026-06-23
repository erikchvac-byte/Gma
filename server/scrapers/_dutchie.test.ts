import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Intercepted } from '../utils/scraperClient.js'
import {
  dutchieEmbedUrl,
  dutchieRequest,
  pickSpecials,
  scrapeDutchieSpecials,
  transformSpecials,
} from './_dutchie.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(
  readFileSync(path.join(__dirname, '__fixtures__', 'dutchie-specials.json'), 'utf-8'),
) as { intercepted: Intercepted[] }

// The vocabulary filterActiveDeals.ts accepts — abbreviations silently never match.
const VALID_DAYS = new Set([
  'everyday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
])

describe('dutchieEmbedUrl / dutchieRequest', () => {
  it('builds the embed URL from a store id', () => {
    expect(dutchieEmbedUrl('abc123')).toBe('https://dutchie.com/embedded-menu/abc123')
  })

  it('presets the browser tier and GraphQL intercept patterns', () => {
    const req = dutchieRequest('abc123')
    expect(req.tier).toBe('browser')
    expect(req.headless).toBe(true)
    expect(req.url).toContain('abc123')
    expect(req.intercept_pattern).toMatch(/graphql/)
    // waits for the specials op specifically — large menus emit it late
    expect(req.wait_for_pattern).toBe('GetSpecialMenuCards')
  })
})

describe('pickSpecials', () => {
  it('finds the GetSpecialMenuCards intercept and returns its menu cards', () => {
    expect(pickSpecials(fixture.intercepted)).toHaveLength(6)
  })

  it('returns [] when no GetSpecialMenuCards intercept is present', () => {
    const other: Intercepted[] = [
      { url: 'https://dutchie.com/graphql?operationName=FilteredProducts', status: 200, data: {} },
    ]
    expect(pickSpecials(other)).toEqual([])
  })

  it('returns [] for an empty intercepted array', () => {
    expect(pickSpecials([])).toEqual([])
  })

  it('returns [] when the menuCards path is missing/wrong-shaped', () => {
    const bad: Intercepted[] = [
      { url: 'graphql?operationName=GetSpecialMenuCards', status: 200, data: { data: {} } },
    ]
    expect(pickSpecials(bad)).toEqual([])
  })

  it('returns [] against the old (pre-reconciliation) specialMenuCards path', () => {
    const old: Intercepted[] = [
      {
        url: 'graphql?operationName=GetSpecialMenuCards',
        status: 200,
        data: { data: { specialMenuCards: { specials: [{ title: 'x' }] } } },
      },
    ]
    expect(pickSpecials(old)).toEqual([])
  })
})

describe('transformSpecials', () => {
  const deals = transformSpecials(fixture.intercepted)

  it('skips the nameless/malformed card (6 cards → 5 deals)', () => {
    expect(deals).toHaveLength(5)
  })

  it('parses percent from the name and weekday restrictions from free text', () => {
    const d = deals.find((x) => x.description === '50% off Storewide - Monday & Friday')!
    expect(d).toMatchObject({
      type: 'daily',
      discountPct: 50,
      startTime: null,
      endTime: null,
      daysValid: ['monday', 'friday'],
    })
  })

  it('maps an all-day percent special with no day text to everyday/daily', () => {
    const d = deals.find((x) => x.description === '40% OFF Your Entire Order!')!
    expect(d).toMatchObject({ type: 'daily', discountPct: 40, daysValid: ['everyday'] })
  })

  it('reads the percent from menuDisplayDescription when the name has none', () => {
    const d = deals.find((x) => x.description === 'Join the Joint: Savings for Everyone!')!
    expect(d.discountPct).toBe(20)
    expect(d.daysValid).toEqual(['everyday'])
    expect(d.type).toBe('daily')
  })

  it('yields discountPct null for a non-percent (dollar-off) special', () => {
    const d = deals.find((x) => x.description === '$5 Off Pre-Rolls')!
    expect(d.discountPct).toBeNull()
    expect(d.type).toBe('daily')
  })

  it('suppresses a description-only percent on a price-titled card (ADR-050)', () => {
    // "$50 Crossroads Ounce" displays a price; its "50% OFF" lives only in the hidden
    // menuDisplayDescription. Badging it 50% off would contradict the visible title.
    const d = deals.find((x) => x.description === '$50 Crossroads Ounce')!
    expect(d.discountPct).toBeNull()
    expect(d.type).toBe('daily')
  })

  it('emits only daysValid the active-deal filter understands', () => {
    for (const d of deals) {
      for (const day of d.daysValid) expect(VALID_DAYS.has(day)).toBe(true)
    }
  })

  it('returns [] when there are no specials at all', () => {
    expect(transformSpecials([])).toEqual([])
  })
})

describe('scrapeDutchieSpecials (retry-on-empty)', () => {
  // Build a GetSpecialMenuCards intercept with the given menuDisplayNames.
  const cards = (...names: string[]): Intercepted[] => [
    {
      url: 'https://dutchie.com/graphql?operationName=GetSpecialMenuCards',
      status: 200,
      data: { data: { getSpecialMenuCards: { menuCards: names.map((n) => ({ menuDisplayName: n })) } } },
    },
  ]
  const EMPTY = cards() // intercept present, zero cards — the race/no-specials case

  // A postFn that yields the queued batches in order (last batch repeats), counting calls.
  function queuedPost(batches: Intercepted[][]) {
    const calls = { n: 0 }
    const postFn = async () => {
      const batch = batches[Math.min(calls.n, batches.length - 1)]
      calls.n++
      return batch
    }
    return { postFn, calls }
  }

  it('returns deals from the first attempt without retrying when non-empty', async () => {
    const { postFn, calls } = queuedPost([cards('40% OFF Everything')])
    const deals = await scrapeDutchieSpecials('store-x', { postFn })
    expect(deals).toHaveLength(1)
    expect(deals[0].discountPct).toBe(40)
    expect(calls.n).toBe(1) // no wasted retries on a good first scrape
  })

  it('retries past empty captures and returns deals once they populate', async () => {
    const { postFn, calls } = queuedPost([EMPTY, EMPTY, cards('25% OFF Edibles')])
    const deals = await scrapeDutchieSpecials('store-x', { postFn })
    expect(deals).toHaveLength(1)
    expect(deals[0].discountPct).toBe(25)
    expect(calls.n).toBe(3) // two empties, then the populated capture
  })

  it('returns [] after exhausting attempts on a genuinely specials-less store', async () => {
    const { postFn, calls } = queuedPost([EMPTY])
    const deals = await scrapeDutchieSpecials('store-x', { postFn, attempts: 3 })
    expect(deals).toEqual([])
    expect(calls.n).toBe(3)
  })

  it('treats a thrown attempt as empty and keeps retrying', async () => {
    let n = 0
    const postFn = async () => {
      n++
      if (n === 1) throw new Error('service unreachable')
      return cards('30% OFF Flower')
    }
    const deals = await scrapeDutchieSpecials('store-x', { postFn })
    expect(deals).toHaveLength(1)
    expect(deals[0].discountPct).toBe(30)
    expect(n).toBe(2)
  })

  it('respects a custom attempts count', async () => {
    const { postFn, calls } = queuedPost([EMPTY])
    await scrapeDutchieSpecials('store-x', { postFn, attempts: 2 })
    expect(calls.n).toBe(2)
  })
})
