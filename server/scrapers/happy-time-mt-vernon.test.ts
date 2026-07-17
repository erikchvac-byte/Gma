import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parse } from './happy-time-mt-vernon.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(
  path.join(__dirname, '__fixtures__', 'happy-time-mt-vernon-menu.html'),
  'utf-8',
)

// The vocabulary filterActiveDeals.ts accepts — anything else silently never matches.
const VALID_DAYS = new Set([
  'everyday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
])

describe('happy-time-mt-vernon parse()', () => {
  const deals = parse(fixture)

  it('parses all nine deal-card promos from the live fixture', () => {
    expect(deals).toHaveLength(9)
  })

  it('ignores the storewide banner and the embedded product card (only .deal-card)', () => {
    // Both carry "% Off" text but are NOT `.deal-card`s — a percent-only heuristic
    // would wrongly pull the "50% OFF … STOREWIDE" banner and the "20% Off applied
    // at checkout" product meta into the feed.
    expect(deals.some((d) => /storewide/i.test(d.description))).toBe(false)
    expect(deals.some((d) => /checkout/i.test(d.description))).toBe(false)
  })

  it('maps every card to a daily / everyday deal with no time window', () => {
    for (const d of deals) {
      expect(d.type).toBe('daily')
      expect(d.startTime).toBeNull()
      expect(d.endTime).toBeNull()
      expect(d.daysValid).toEqual(['everyday'])
    }
  })

  it('uses the visible title as the description and parses its percent', () => {
    const flower = deals.find((d) => /All Flower/i.test(d.description))
    expect(flower).toMatchObject({
      type: 'daily',
      description: '30% Off All Flower',
      discountPct: 30,
    })
  })

  it('discountPct is always a parsed number for this source', () => {
    for (const d of deals) {
      expect(typeof d.discountPct).toBe('number')
      expect(d.discountPct).toBeGreaterThan(0)
    }
  })

  it('covers the advertised discount tiers (30 / 25 / 20)', () => {
    const pcts = [...new Set(deals.map((d) => d.discountPct))].sort((a, b) => Number(b) - Number(a))
    expect(pcts).toEqual([30, 25, 20])
  })

  it('every daysValid entry uses a filterActiveDeals-recognized name', () => {
    for (const d of deals) {
      for (const day of d.daysValid) {
        expect(VALID_DAYS.has(day)).toBe(true)
      }
    }
  })

  it('empty / malformed / deal-free HTML yields [] (no throw)', () => {
    expect(parse('')).toEqual([])
    expect(parse('<html><body><p>no deals here</p></body></html>')).toEqual([])
    expect(parse('<<<not html')).toEqual([])
    // a titleless deal-card is skipped, not emitted as a blank deal
    expect(parse('<div class="deal-card"><span class="deal-cat">July Deals</span></div>')).toEqual(
      [],
    )
  })
})
