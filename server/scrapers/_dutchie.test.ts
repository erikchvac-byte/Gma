import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Intercepted } from '../utils/scraperClient.js'
import {
  dutchieEmbedUrl,
  dutchieRequest,
  pickMenuCards,
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

// Wrap raw cards in the live GetSpecialMenuCards intercept shape pickSpecials reads.
function specialsIntercept(cards: unknown[]): Intercepted[] {
  return [
    {
      url: 'graphql?operationName=GetSpecialMenuCards',
      status: 200,
      data: { data: { getSpecialMenuCards: { menuCards: cards } } },
    },
  ]
}

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

describe('pickMenuCards (captured-vs-missing distinction, ADR-083)', () => {
  it('returns the cards array when the op is captured (even empty)', () => {
    const empty: Intercepted[] = [
      {
        url: 'graphql?operationName=GetSpecialMenuCards',
        status: 200,
        data: { data: { getSpecialMenuCards: { menuCards: [] } } },
      },
    ]
    expect(pickMenuCards(empty)).toEqual([])
    expect(pickMenuCards(fixture.intercepted)).toHaveLength(6)
  })

  it('returns null when the op was never captured', () => {
    expect(pickMenuCards([])).toBeNull()
    expect(
      pickMenuCards([{ url: 'graphql?operationName=FilteredProducts', status: 200, data: {} }]),
    ).toBeNull()
  })

  it('returns null when menuCards is missing or not an array', () => {
    const bad: Intercepted[] = [
      { url: 'graphql?operationName=GetSpecialMenuCards', status: 200, data: { data: {} } },
    ]
    expect(pickMenuCards(bad)).toBeNull()
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

describe('transformSpecials — specialType & providerNote (capture 2026-07-02)', () => {
  it('captures a bogo specialType and the raw menuDisplayDescription as providerNote', () => {
    const [d] = transformSpecials(
      specialsIntercept([
        {
          menuDisplayName: '40% Off Online Orders Sun,Tues,Thurs Min $80',
          specialType: 'bogo',
          menuDisplayDescription: 'Order ahead online for your deals!',
        },
      ]),
    )
    expect(d.specialType).toBe('bogo')
    expect(d.providerNote).toBe('Order ahead online for your deals!')
  })

  it('lowercases the specialType', () => {
    const [d] = transformSpecials(
      specialsIntercept([{ menuDisplayName: 'Buy 1 Get 1 10% off', specialType: 'BOGO' }]),
    )
    expect(d.specialType).toBe('bogo')
  })

  it('omits specialType for a plain sale and providerNote for an empty body', () => {
    const [d] = transformSpecials(
      specialsIntercept([
        { menuDisplayName: '50% off Ounces', specialType: 'sale', menuDisplayDescription: '  ' },
      ]),
    )
    expect(d.specialType).toBeUndefined()
    expect(d.providerNote).toBeUndefined()
  })
})

describe('scrapeDutchieSpecials (retry-on-empty + confirmed-empty, ADR-083)', () => {
  // Build a GetSpecialMenuCards intercept with the given menuDisplayNames.
  const cards = (...names: string[]): Intercepted[] => [
    {
      url: 'https://dutchie.com/graphql?operationName=GetSpecialMenuCards',
      status: 200,
      data: { data: { getSpecialMenuCards: { menuCards: names.map((n) => ({ menuDisplayName: n })) } } },
    },
  ]
  const EMPTY = cards() // intercept present, zero cards — the race/no-specials case

  // Service-level result wrapper: ok:true = the scraper service call SUCCEEDED.
  const okBatch = (intercepted: Intercepted[]) => ({ ok: true, intercepted })

  // A postFn that yields the queued results in order (last repeats), counting calls.
  function queuedPost(batches: { ok: boolean; intercepted: Intercepted[] }[]) {
    const calls = { n: 0 }
    const postFn = async () => {
      const batch = batches[Math.min(calls.n, batches.length - 1)]
      calls.n++
      return batch
    }
    return { postFn, calls }
  }

  it('returns deals from the first attempt without retrying when non-empty', async () => {
    const { postFn, calls } = queuedPost([okBatch(cards('40% OFF Everything'))])
    const { deals, confirmedEmpty } = await scrapeDutchieSpecials('store-x', { postFn })
    expect(deals).toHaveLength(1)
    expect(deals[0].discountPct).toBe(40)
    expect(confirmedEmpty).toBe(false)
    expect(calls.n).toBe(1) // no wasted retries on a good first scrape
  })

  it('retries past empty captures and returns deals once they populate', async () => {
    const { postFn, calls } = queuedPost([okBatch(EMPTY), okBatch(EMPTY), okBatch(cards('25% OFF Edibles'))])
    const { deals, confirmedEmpty } = await scrapeDutchieSpecials('store-x', { postFn })
    expect(deals).toHaveLength(1)
    expect(deals[0].discountPct).toBe(25)
    expect(confirmedEmpty).toBe(false)
    expect(calls.n).toBe(3) // two empties, then the populated capture
  })

  it('confirms empty when EVERY attempt captures a real menuCards: []', async () => {
    const { postFn, calls } = queuedPost([okBatch(EMPTY)])
    const outcome = await scrapeDutchieSpecials('store-x', { postFn, attempts: 3 })
    expect(outcome).toEqual({ deals: [], confirmedEmpty: true })
    expect(calls.n).toBe(3)
  })

  it('does NOT confirm when any attempt is a failed service call', async () => {
    const { postFn } = queuedPost([okBatch(EMPTY), { ok: false, intercepted: [] }, okBatch(EMPTY)])
    const outcome = await scrapeDutchieSpecials('store-x', { postFn, attempts: 3 })
    expect(outcome).toEqual({ deals: [], confirmedEmpty: false })
  })

  it('does NOT confirm when the GetSpecialMenuCards op was never captured', async () => {
    const noOp: Intercepted[] = [
      { url: 'https://dutchie.com/graphql?operationName=FilteredProducts', status: 200, data: {} },
    ]
    const { postFn } = queuedPost([okBatch(noOp)])
    const outcome = await scrapeDutchieSpecials('store-x', { postFn, attempts: 3 })
    expect(outcome).toEqual({ deals: [], confirmedEmpty: false })
  })

  it('does NOT confirm on shape drift — menuCards present but every card skipped', async () => {
    // nameless cards transform to zero deals, but the store is NOT provably dealless
    const nameless = cards('') // one card with an empty menuDisplayName → skipped
    const { postFn } = queuedPost([okBatch(nameless)])
    const outcome = await scrapeDutchieSpecials('store-x', { postFn, attempts: 3 })
    expect(outcome).toEqual({ deals: [], confirmedEmpty: false })
  })

  it('does NOT confirm when menuCards is not an array (wrong-shaped payload)', async () => {
    const wrong: Intercepted[] = [
      {
        url: 'graphql?operationName=GetSpecialMenuCards',
        status: 200,
        data: { data: { getSpecialMenuCards: { menuCards: null } } },
      },
    ]
    const { postFn } = queuedPost([okBatch(wrong)])
    const outcome = await scrapeDutchieSpecials('store-x', { postFn, attempts: 2 })
    expect(outcome).toEqual({ deals: [], confirmedEmpty: false })
  })

  it('treats a thrown attempt as an UNCONFIRMED empty and keeps retrying', async () => {
    let n = 0
    const postFn = async () => {
      n++
      if (n === 1) throw new Error('service unreachable')
      return okBatch(cards('30% OFF Flower'))
    }
    const { deals } = await scrapeDutchieSpecials('store-x', { postFn })
    expect(deals).toHaveLength(1)
    expect(deals[0].discountPct).toBe(30)
    expect(n).toBe(2)
  })

  it('a throw on any attempt blocks confirmation even if the rest confirm', async () => {
    let n = 0
    const postFn = async () => {
      n++
      if (n === 2) throw new Error('flake')
      return okBatch(EMPTY)
    }
    const outcome = await scrapeDutchieSpecials('store-x', { postFn, attempts: 3 })
    expect(outcome).toEqual({ deals: [], confirmedEmpty: false })
    expect(n).toBe(3)
  })

  it('respects a custom attempts count', async () => {
    const { postFn, calls } = queuedPost([okBatch(EMPTY)])
    await scrapeDutchieSpecials('store-x', { postFn, attempts: 2 })
    expect(calls.n).toBe(2)
  })
})
