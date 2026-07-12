import { describe, it, expect } from 'vitest'
import {
  buildPriceVsOwnMedianReport,
  windowStartDay,
  ROLLING_WINDOW_DAYS,
  MIN_OBSERVED_DAYS,
  type PriceEntry,
  type PriceProductSeries,
} from './priceVsOwnMedian.js'

// A single option-day price point.
const e = (day: string, option: string, effectivePrice: number | null): PriceEntry => ({
  observedAt: `${day}T12:00:00.000Z`,
  option,
  effectivePrice,
})

// Consecutive-day price points for one option, starting 2026-07-01 with the given prices.
function series(prices: (number | null)[], option = '1/8oz', startDay = 1): PriceEntry[] {
  return prices.map((p, i) => {
    const day = new Date(Date.UTC(2026, 6, startDay + i)).toISOString().slice(0, 10)
    return e(day, option, p)
  })
}

function product(over: Partial<PriceProductSeries> & Pick<PriceProductSeries, 'entries'>): PriceProductSeries {
  return {
    productId: 'p1',
    dispensaryId: 'store-a',
    name: 'Blue Dream',
    category: 'Flower',
    ...over,
  }
}

// `today` = the last calendar day of a `count`-day run from 2026-07-01, so an unbroken run of
// `count` days ends exactly on today and every observed day sits inside the 30-day window.
const todayFor = (count: number, startDay = 1): string =>
  new Date(Date.UTC(2026, 6, startDay + count - 1)).toISOString().slice(0, 10)

describe('buildPriceVsOwnMedianReport — decision F type gate (Gate 2 / FR16)', () => {
  it('does not expose the base/special pair, discount %, or potency on the input types (breach does not compile)', () => {
    const entry: PriceEntry = { observedAt: '2026-07-01T00:00:00.000Z', option: '1/8oz', effectivePrice: 30 }
    const p: PriceProductSeries = { productId: 'p', dispensaryId: 's', name: 'n', category: 'Flower', entries: [entry] }
    // @ts-expect-error Gate 2: the flat banner rate (specialPrice) is unreachable on the price input
    void entry.specialPrice
    // @ts-expect-error Gate 2: basePrice (the other half of the pair) is unreachable
    void entry.basePrice
    // @ts-expect-error Gate 2: a precomputed discount % is unreachable
    void entry.discountPct
    // @ts-expect-error Gate 5/FR16: potency (thc) is unreachable on the price input
    void p.thc
    expect(entry.effectivePrice).toBe(30)
  })
})

describe('buildPriceVsOwnMedianReport — window + floor constants', () => {
  it('uses the ratified constants', () => {
    expect(ROLLING_WINDOW_DAYS).toBe(30)
    expect(MIN_OBSERVED_DAYS).toBe(7)
  })

  it('windowStartDay spans ROLLING_WINDOW_DAYS inclusive days ending today', () => {
    // today − (30 − 1) days.
    expect(windowStartDay('2026-07-30')).toBe('2026-07-01')
  })
})

describe('buildPriceVsOwnMedianReport — comparison + emit', () => {
  it('surfaces a below-own-median mover as a negative pctVsMedian row', () => {
    // 7 days at 40, then today at 30. Median over the 8 observed days = 40; today 30 → −25%.
    const prices = [40, 40, 40, 40, 40, 40, 40, 30]
    const rep = buildPriceVsOwnMedianReport([product({ entries: series(prices) })], todayFor(prices.length))
    expect(rep.comparedCount).toBe(1)
    expect(rep.belowMedianCount).toBe(1)
    expect(rep.rows).toHaveLength(1)
    expect(rep.rows[0].currentPrice).toBe(30)
    expect(rep.rows[0].medianPrice).toBe(40)
    expect(rep.rows[0].pctVsMedian).toBe(-0.25)
    expect(rep.rows[0].observedDays).toBe(8)
    expect(rep.rows[0].option).toBe('1/8oz')
  })

  it('surfaces an above-own-median premium as a positive pctVsMedian row', () => {
    const prices = [30, 30, 30, 30, 30, 30, 30, 45]
    const rep = buildPriceVsOwnMedianReport([product({ entries: series(prices) })], todayFor(prices.length))
    expect(rep.aboveMedianCount).toBe(1)
    expect(rep.rows[0].pctVsMedian).toBe(0.5) // (45−30)/30
  })

  it('counts a today-at-own-median series but does NOT emit it (movers-only rule)', () => {
    // Flat 40 for 8 days → today equals median → 0% → counted, not emitted.
    const prices = [40, 40, 40, 40, 40, 40, 40, 40]
    const rep = buildPriceVsOwnMedianReport([product({ entries: series(prices) })], todayFor(prices.length))
    expect(rep.comparedCount).toBe(1)
    expect(rep.atMedianCount).toBe(1)
    expect(rep.rows).toHaveLength(0)
  })

  it('computes an even-count median as the mean of the two middle values', () => {
    const prices = [10, 10, 10, 10, 20, 20, 20, 20] // 8 days, today = 20; median = (10+20)/2 = 15
    const rep = buildPriceVsOwnMedianReport([product({ entries: series(prices) })], todayFor(prices.length))
    expect(rep.rows[0].medianPrice).toBe(15)
    expect(rep.rows[0].currentPrice).toBe(20)
    expect(rep.rows[0].pctVsMedian).toBe(0.3333) // (20−15)/15 rounded to 4dp
  })
})

describe('buildPriceVsOwnMedianReport — floor + today-presence suppression', () => {
  it('suppresses a series below the distinct-day floor and counts it in belowFloorCount', () => {
    // Only 6 observed days (< 7) — suppressed, no row, not compared.
    const prices = [40, 40, 40, 40, 40, 30]
    const rep = buildPriceVsOwnMedianReport([product({ entries: series(prices) })], todayFor(prices.length))
    expect(rep.belowFloorCount).toBe(1)
    expect(rep.comparedCount).toBe(0)
    expect(rep.rows).toHaveLength(0)
  })

  it('counts a floor-clearing series with no observation TODAY as noObservationToday, not compared', () => {
    // 7 observed days ending 2026-07-07, but today is 2026-07-20 (a gap on today).
    const rep = buildPriceVsOwnMedianReport([product({ entries: series([40, 40, 40, 40, 40, 40, 30]) })], '2026-07-20')
    expect(rep.noObservationTodayCount).toBe(1)
    expect(rep.belowFloorCount).toBe(0)
    expect(rep.comparedCount).toBe(0)
  })
})

describe('buildPriceVsOwnMedianReport — gap tolerance (Gate 3)', () => {
  it('never enters a gap day into the median (missing day is not a fabricated value)', () => {
    // Observed 40 on 7 spread days, then a big gap, then 20 today. The gap contributes nothing;
    // median is over the 8 real observed values only.
    const entries = [
      ...series([40, 40, 40, 40, 40, 40, 40]), // 2026-07-01..07
      e('2026-07-25', '1/8oz', 20), // today, after a long gap
    ]
    const rep = buildPriceVsOwnMedianReport([product({ entries })], '2026-07-25')
    expect(rep.comparedCount).toBe(1)
    expect(rep.rows[0].observedDays).toBe(8) // 7 + today; the ~17 gap days are NOT observed
    expect(rep.rows[0].medianPrice).toBe(40)
  })
})

describe('buildPriceVsOwnMedianReport — window boundary', () => {
  it('includes an observation on the window-start day and excludes the day before it', () => {
    // today = 2026-07-30 → window start = 2026-07-01. Put one obs on 06-30 (out) and a full run
    // inside the window. The 06-30 value must not affect the median.
    const inside = series([40, 40, 40, 40, 40, 40, 40, 30], '1/8oz', 1) // 07-01..07-08
    // extend the run so today is 07-30 with an observation, keeping ≥7 observed days:
    const entries = [
      e('2026-06-30', '1/8oz', 999), // BEFORE window start — must be ignored
      ...inside,
      e('2026-07-30', '1/8oz', 30), // today
    ]
    const rep = buildPriceVsOwnMedianReport([product({ entries })], '2026-07-30')
    expect(rep.comparedCount).toBe(1)
    // 999 would wreck the median if counted; it isn't. Observed days = 8 inside + today = 9.
    expect(rep.rows[0].observedDays).toBe(9)
    expect(rep.rows[0].medianPrice).toBe(40)
  })
})

describe('buildPriceVsOwnMedianReport — unsorted input (pure-fn must not assume caller order)', () => {
  it('produces identical output for shuffled entries', () => {
    const prices = [40, 41, 39, 42, 38, 40, 40, 30]
    const ordered = series(prices)
    const shuffled = [...ordered].reverse()
    const today = todayFor(prices.length)
    const a = buildPriceVsOwnMedianReport([product({ entries: ordered })], today)
    const b = buildPriceVsOwnMedianReport([product({ entries: shuffled })], today)
    expect(b).toEqual(a)
  })
})

describe('buildPriceVsOwnMedianReport — same-day tie-break', () => {
  it('picks the time-latest usable observation when a day has multiple entries, regardless of input order', () => {
    const at = (day: string, time: string, p: number): PriceEntry => ({
      observedAt: `${day}T${time}`,
      option: '1/8oz',
      effectivePrice: p,
    })
    const entries = [
      ...series([40, 40, 40, 40, 40, 40, 40]), // 2026-07-01..07
      at('2026-07-08', '06:00:00.000Z', 45), // today, earlier scrape
      at('2026-07-08', '18:00:00.000Z', 30), // today, later scrape — must win
    ]
    const rep = buildPriceVsOwnMedianReport([product({ entries })], '2026-07-08')
    expect(rep.rows[0].currentPrice).toBe(30) // time-latest, not input-order-last
    expect(rep.rows[0].medianPrice).toBe(40) // day value is 30, so sorted [30, 40×7]
    const shuffled = buildPriceVsOwnMedianReport([product({ entries: [...entries].reverse() })], '2026-07-08')
    expect(shuffled).toEqual(rep)
  })
})

describe('buildPriceVsOwnMedianReport — multi-option independence', () => {
  it('treats each option label as its own series', () => {
    const entries = [
      ...series([40, 40, 40, 40, 40, 40, 40, 30], '1/8oz'),
      ...series([70, 70, 70, 70, 70, 70, 70, 70], '1/4oz'),
    ]
    const rep = buildPriceVsOwnMedianReport([product({ entries })], todayFor(8))
    expect(rep.totalSeries).toBe(2)
    expect(rep.comparedCount).toBe(2)
    // 1/8oz moved (−25%, emitted); 1/4oz flat (at-median, not emitted)
    expect(rep.rows).toHaveLength(1)
    expect(rep.rows[0].option).toBe('1/8oz')
    expect(rep.atMedianCount).toBe(1)
    expect(rep.belowMedianCount).toBe(1)
  })
})

describe('buildPriceVsOwnMedianReport — unusable price accounting', () => {
  it('drops and counts null / non-finite / non-positive effective prices', () => {
    const entries = [
      ...series([40, 40, 40, 40, 40, 40, 40], '1/8oz'), // 7 usable days
      e('2026-07-08', '1/8oz', 30), // today, usable
      e('2026-07-05', '1/8oz', null), // unusable — dropped + counted
      e('2026-07-06', '1/8oz', 0), // unusable (≤0) — dropped + counted
    ]
    const rep = buildPriceVsOwnMedianReport([product({ entries })], '2026-07-08')
    expect(rep.noUsablePriceCount).toBe(2)
    expect(rep.comparedCount).toBe(1)
    // the null/0 fell on already-observed days, so observed-day count is unchanged (8)
    expect(rep.rows[0].observedDays).toBe(8)
  })
})

describe('buildPriceVsOwnMedianReport — empty + totals', () => {
  it('returns a zeroed report for empty input', () => {
    const rep = buildPriceVsOwnMedianReport([], '2026-07-11')
    expect(rep.rows).toEqual([])
    expect(rep.totalProducts).toBe(0)
    expect(rep.totalSeries).toBe(0)
    expect(rep.comparedCount).toBe(0)
  })

  it('sorts emitted rows deepest-discount-first', () => {
    const deep = product({ productId: 'deep', entries: series([40, 40, 40, 40, 40, 40, 40, 20]) }) // −50%
    const shallow = product({ productId: 'shallow', entries: series([40, 40, 40, 40, 40, 40, 40, 36]) }) // −10%
    const rep = buildPriceVsOwnMedianReport([shallow, deep], todayFor(8))
    expect(rep.rows.map((r) => r.productId)).toEqual(['deep', 'shallow'])
  })
})
