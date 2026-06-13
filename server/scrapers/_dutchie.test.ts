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
    expect(req.wait_for_pattern).toMatch(/graphql/)
  })
})

describe('pickSpecials', () => {
  it('finds the GetSpecialMenuCards intercept and returns its cards', () => {
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

  it('returns [] when the specials path is missing/wrong-shaped', () => {
    const bad: Intercepted[] = [
      { url: 'graphql?operationName=GetSpecialMenuCards', status: 200, data: { data: {} } },
    ]
    expect(pickSpecials(bad)).toEqual([])
  })
})

describe('transformSpecials', () => {
  const deals = transformSpecials(fixture.intercepted)

  it('skips the nameless/malformed card (5 cards → 4 deals)', () => {
    expect(deals).toHaveLength(4)
  })

  it('maps a percent daily special with named weekdays', () => {
    const d = deals.find((x) => x.description === '20% Off All Edibles')!
    expect(d).toMatchObject({
      type: 'daily',
      discountPct: 20,
      startTime: null,
      endTime: null,
      daysValid: ['monday', 'tuesday'],
    })
  })

  it('maps a timed special to happy_hour with 24h strings and everyday', () => {
    const d = deals.find((x) => x.description === 'Early Bird Happy Hour')!
    expect(d).toMatchObject({
      type: 'happy_hour',
      discountPct: 15,
      startTime: '07:00',
      endTime: '09:00',
      daysValid: ['everyday'],
    })
  })

  it('yields discountPct null for a non-percent (dollar-off) special', () => {
    const d = deals.find((x) => x.description === '$5 Off Pre-Rolls')!
    expect(d.discountPct).toBeNull()
    expect(d.type).toBe('daily')
  })

  it('parses the percent from the name when no discount field is present', () => {
    const d = deals.find((x) => x.description.startsWith('Wax Wednesday'))!
    expect(d.discountPct).toBe(30)
    expect(d.daysValid).toEqual(['wednesday'])
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
