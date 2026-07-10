import { describe, it, expect } from 'vitest'
import {
  buildBrandPersonas,
  MIN_OBSERVED_PRODUCT_DAYS,
  SPECIAL_FRACTION_HIGH,
  SPECIAL_FRACTION_LOW,
  type BrandDaySignal,
  type BrandProductSeries,
} from './brandPersonas.js'

// One observation-day signal.
const day = (d: string, special: boolean): BrandDaySignal => ({
  observedAt: `${d}T12:00:00.000Z`,
  special,
})

// A product observed on `count` consecutive days from 2026-07-01, each with the given special flag.
function run(
  productId: string,
  brand: string | null,
  count: number,
  special: boolean,
): BrandProductSeries {
  const history: BrandDaySignal[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10)
    history.push(day(d, special))
  }
  return { productId, brand, history }
}

describe('buildBrandPersonas — decision F type gate (Gate 2 + Gate 5)', () => {
  it('does not expose option prices or potency on the persona input types (the breach does not compile)', () => {
    const signal: BrandDaySignal = { observedAt: '2026-07-01T00:00:00.000Z', special: true }
    const series: BrandProductSeries = { productId: 'p', brand: 'X', history: [signal] }
    // @ts-expect-error decision F / Gate 2: the flat banner rate (specialPrice) is unreachable on the persona input
    void signal.specialPrice
    // @ts-expect-error decision F / Gate 2: basePrice is unreachable on the persona input
    void signal.basePrice
    // @ts-expect-error decision F / Gate 5: potency (thc) is unreachable on the persona input
    void series.thc
    // @ts-expect-error decision F / Gate 5: potency (totalTerpenes) is unreachable on the persona input
    void series.totalTerpenes
    expect(signal.special).toBe(true)
  })
})

describe('buildBrandPersonas — classification', () => {
  it('classifies always-on-special when the brand is on special on (nearly) every observed day', () => {
    const report = buildBrandPersonas([run('a', 'Green Haven', 12, true)])
    const p = report.personas.find((x) => x.brandKey === 'green haven')!
    expect(p.persona).toBe('always-on-special')
    expect(p.specialDayFraction).toBe(1)
    expect(p.observedProductDays).toBe(12)
    expect(p.specialProductDays).toBe(12)
    expect(report.alwaysOnSpecialCount).toBe(1)
  })

  it('classifies never-discounted when the brand is never on special', () => {
    const report = buildBrandPersonas([run('a', 'Zodiac', 12, false)])
    const p = report.personas.find((x) => x.brandKey === 'zodiac')!
    expect(p.persona).toBe('never-discounted')
    expect(p.specialDayFraction).toBe(0)
    expect(report.neverDiscountedCount).toBe(1)
  })

  it('classifies intermittently-discounted for a mixed special history', () => {
    // 6 special days + 6 non-special days across two products of one brand → fraction 0.5.
    const report = buildBrandPersonas([
      run('a', 'Full Spec', 6, true),
      run('b', 'Full Spec', 6, false),
    ])
    const p = report.personas.find((x) => x.brandKey === 'full spec')!
    expect(p.persona).toBe('intermittently-discounted')
    expect(p.specialDayFraction).toBe(0.5)
    expect(p.productCount).toBe(2)
    expect(p.observedProductDays).toBe(12)
    expect(report.intermittentCount).toBe(1)
  })

  it('honors the HIGH / LOW thresholds at their boundaries', () => {
    expect(SPECIAL_FRACTION_HIGH).toBe(0.95)
    expect(SPECIAL_FRACTION_LOW).toBe(0.05)
    // 19/20 = 0.95 → always (>= HIGH); 1/20 = 0.05 → never (<= LOW)
    const high = buildBrandPersonas([run('a', 'Hi', 19, true), run('b', 'Hi', 1, false)])
    expect(high.personas.find((x) => x.brandKey === 'hi')!.persona).toBe('always-on-special')
    const low = buildBrandPersonas([run('a', 'Lo', 1, true), run('b', 'Lo', 19, false)])
    expect(low.personas.find((x) => x.brandKey === 'lo')!.persona).toBe('never-discounted')
  })
})

describe('buildBrandPersonas — gap tolerance (Gate 3)', () => {
  it('does not count a missing interior day as observed (neither special nor non-special)', () => {
    // Observed 2026-07-01 and 2026-07-03 (both special); 2026-07-02 is a gap.
    const series: BrandProductSeries = {
      productId: 'a',
      brand: 'GapBrand',
      history: [day('2026-07-01', true), day('2026-07-03', true)],
    }
    const report = buildBrandPersonas([series])
    const p = report.personas.find((x) => x.brandKey === 'gapbrand')!
    expect(p.observedProductDays).toBe(2) // the gap day is NOT counted
    expect(p.specialProductDays).toBe(2)
  })
})

describe('buildBrandPersonas — brand normalization + null handling', () => {
  it('rolls two raw spellings that normalize to one key into a single persona', () => {
    const report = buildBrandPersonas([
      run('a', 'Lavish', 6, true),
      run('b', 'LAVISH', 6, true),
    ])
    const lavish = report.personas.filter((x) => x.brandKey === 'lavish')
    expect(lavish).toHaveLength(1)
    expect(lavish[0].productCount).toBe(2)
    expect(lavish[0].observedProductDays).toBe(12)
    expect(['Lavish', 'LAVISH']).toContain(lavish[0].displayBrand) // a real raw label, not the key
    expect(report.totalBrands).toBe(1)
  })

  it('excludes and counts null/empty-brand products, never bucketing them', () => {
    const report = buildBrandPersonas([
      run('a', 'Green Haven', 12, true),
      run('b', null, 12, true),
      run('c', '   ', 12, true),
    ])
    expect(report.nullBrandProductCount).toBe(2)
    expect(report.totalBrands).toBe(1)
    expect(report.personas.every((x) => x.brandKey !== '')).toBe(true)
  })
})

describe('buildBrandPersonas — insufficient history + empty input', () => {
  it('marks a brand below the min-observed-days floor as insufficient-history with null fraction', () => {
    expect(MIN_OBSERVED_PRODUCT_DAYS).toBe(10)
    const report = buildBrandPersonas([run('a', 'Tiny', 3, true)])
    const p = report.personas.find((x) => x.brandKey === 'tiny')!
    expect(p.persona).toBe('insufficient-history')
    expect(p.specialDayFraction).toBeNull()
    expect(p.observedProductDays).toBe(3)
    expect(report.insufficientHistoryCount).toBe(1)
  })

  it('returns a zeroed report for empty input', () => {
    const report = buildBrandPersonas([])
    expect(report.personas).toEqual([])
    expect(report.totalBrands).toBe(0)
    expect(report.alwaysOnSpecialCount).toBe(0)
    expect(report.neverDiscountedCount).toBe(0)
    expect(report.intermittentCount).toBe(0)
    expect(report.insufficientHistoryCount).toBe(0)
    expect(report.nullBrandProductCount).toBe(0)
  })
})
