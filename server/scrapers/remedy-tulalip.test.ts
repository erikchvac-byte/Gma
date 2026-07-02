import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parse } from './remedy-tulalip.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(path.join(__dirname, '__fixtures__', 'remedy-tulalip.html'), 'utf-8')

// The vocabulary filterActiveDeals.ts accepts — abbreviations would silently
// never match and the deal would never surface in the feed.
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

describe('remedy-tulalip parse()', () => {
  const deals = parse(fixture)

  it('parses all nine promo deals from the live fixture', () => {
    expect(deals).toHaveLength(9)
  })

  it('AC2: the 7–8am early-bird deal is happy_hour with 24-hour times', () => {
    const hh = deals.find((d) => d.type === 'happy_hour')
    expect(hh).toBeDefined()
    expect(hh).toMatchObject({
      type: 'happy_hour',
      startTime: '07:00',
      endTime: '08:00',
      discountPct: 20,
      daysValid: ['everyday'],
    })
  })

  it('AC3: day-named specials are daily with null time window and a weekday', () => {
    const monday = deals.find((d) => d.daysValid.includes('monday'))
    expect(monday).toMatchObject({
      type: 'daily',
      startTime: null,
      endTime: null,
      discountPct: 15,
      daysValid: ['monday'],
    })
    // every daily deal has a null window
    for (const d of deals.filter((x) => x.type === 'daily')) {
      expect(d.startTime).toBeNull()
      expect(d.endTime).toBeNull()
    }
  })

  it('covers all seven weekdays exactly once across the daily specials', () => {
    const weekdays = deals
      .flatMap((d) => d.daysValid)
      .filter((day) => day !== 'everyday')
      .sort()
    expect(weekdays).toEqual([
      'friday',
      'monday',
      'saturday',
      'sunday',
      'thursday',
      'tuesday',
      'wednesday',
    ])
  })

  it('AC4: discountPct is always a parsed number for this source', () => {
    for (const d of deals) {
      expect(typeof d.discountPct).toBe('number')
      expect(d.discountPct).toBeGreaterThan(0)
    }
  })

  it('CRITICAL: every daysValid entry uses a filterActiveDeals-recognized name', () => {
    for (const d of deals) {
      for (const day of d.daysValid) {
        expect(VALID_DAYS.has(day)).toBe(true)
      }
    }
  })

  it('captures the customer-group list onto the group card description', () => {
    // The card title promises "the Following Customer Groups" but the names live
    // in the .el-content <li> list; without capture the card would show nothing.
    const group = deals.find((d) => /Customer Groups/i.test(d.description))
    expect(group).toBeDefined()
    expect(group!.description).toBe(
      '10% Off Everyday for the Following Customer Groups (with Proof of Valid ID): ' +
        'Military Veterans, Tribal Members, Wisdom (50+)',
    )
    expect(group).toMatchObject({ type: 'daily', discountPct: 10, daysValid: ['everyday'] })
  })

  it('does not append fine-print content to the happy-hour title', () => {
    // The 7–8am card's content is an <em> caveat with no <li> list — description
    // must stay the clean title, not gain the fine print.
    const hh = deals.find((d) => d.type === 'happy_hour')
    expect(hh!.description).toBe('20% Off Your Purchase Everyday from 7-8am')
  })

  it('AC6: empty / malformed / deal-free HTML yields [] (no throw)', () => {
    expect(parse('')).toEqual([])
    expect(parse('<html><body><p>no deals here</p></body></html>')).toEqual([])
    expect(parse('<<<not html')).toEqual([])
  })
})
