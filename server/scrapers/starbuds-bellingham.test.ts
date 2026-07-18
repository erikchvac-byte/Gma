import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parse } from './starbuds-bellingham.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(
  path.join(__dirname, '__fixtures__', 'starbuds-bellingham-page.html'),
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

describe('starbuds-bellingham parse()', () => {
  const deals = parse(fixture)

  it('parses exactly one online-order discount from the live fixture', () => {
    expect(deals).toHaveLength(1)
  })

  it('normalizes the CTA line into an honest online-order deal', () => {
    expect(deals[0]).toEqual({
      type: 'daily',
      description: '10% Off Online Orders',
      discountPct: 10,
      startTime: null,
      endTime: null,
      daysValid: ['everyday'],
    })
  })

  it('description triggers the online-order scope vocabulary (contains "online orders")', () => {
    // dealIcons.ts ORDER_SCOPE = /\bonline orders?\b/i — this is why we normalize the
    // raw "Shop ... online for 10% off" CTA to "10% Off Online Orders": so the existing
    // text-derived system badges it with the honest online-order glyph, not a bare sale.
    expect(/\bonline orders?\b/i.test(deals[0].description)).toBe(true)
  })

  it('ignores the app "mobile-only deals" line and the rewards blurb (no percent)', () => {
    expect(deals.some((d) => /mobile/i.test(d.description))).toBe(false)
    expect(deals.some((d) => /reward/i.test(d.description))).toBe(false)
  })

  it('daysValid uses a filterActiveDeals-recognized name', () => {
    for (const d of deals) {
      for (const day of d.daysValid) {
        expect(VALID_DAYS.has(day)).toBe(true)
      }
    }
  })

  it('de-duplicates the offer even though the <a> and its <p> both carry the text', () => {
    // A naive per-element push would emit the deal twice (anchor + wrapping paragraph).
    const tens = deals.filter((d) => d.discountPct === 10)
    expect(tens).toHaveLength(1)
  })

  it('does NOT match a non-online "N% off" line (parser is scoped to online orders)', () => {
    // Scoping to the online-ordering offer keeps false positives out: a generic
    // storewide-percent ad line is intentionally not surfaced by this store's scraper.
    expect(parse('<p>30% off all flower this weekend</p>')).toEqual([])
  })

  it('empty / malformed / offer-free HTML yields [] (no throw)', () => {
    expect(parse('')).toEqual([])
    expect(parse('<html><body><p>no deals here</p></body></html>')).toEqual([])
    expect(parse('<<<not html')).toEqual([])
    // "online" present but no percent → not a deal
    expect(parse('<p>Order online for pickup today!</p>')).toEqual([])
  })
})
