import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Intercepted } from '../utils/scraperClient.js'
import { dutchieEmbedUrl, dutchieRequest, pickSpecials, transformSpecials } from './_dutchie.js'

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
    expect(pickSpecials(fixture.intercepted)).toHaveLength(5)
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

  it('skips the nameless/malformed card (5 cards → 4 deals)', () => {
    expect(deals).toHaveLength(4)
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

  it('emits only daysValid the active-deal filter understands', () => {
    for (const d of deals) {
      for (const day of d.daysValid) expect(VALID_DAYS.has(day)).toBe(true)
    }
  })

  it('returns [] when there are no specials at all', () => {
    expect(transformSpecials([])).toEqual([])
  })
})
