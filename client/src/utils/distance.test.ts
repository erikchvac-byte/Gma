import { describe, it, expect } from 'vitest'
import { haversineMiles, roadDistanceMiles, ROAD_FACTOR } from './distance'

describe('haversineMiles', () => {
  it('is zero for identical points', () => {
    expect(haversineMiles(47.6, -122.3, 47.6, -122.3)).toBe(0)
  })

  it('matches a known one-degree span at the equator (~69.09 mi)', () => {
    expect(haversineMiles(0, 0, 0, 1)).toBeCloseTo(69.094, 2)
    expect(haversineMiles(0, 0, 1, 0)).toBeCloseTo(69.094, 2)
  })

  it('matches a known WA pair: Marysville → Seattle (~32.03 mi great-circle)', () => {
    expect(haversineMiles(48.05672, -122.1469, 47.6109, -122.33642)).toBeCloseTo(32.03, 1)
  })

  it('is symmetric', () => {
    const ab = haversineMiles(47.6, -122.3, 48.0, -122.1)
    const ba = haversineMiles(48.0, -122.1, 47.6, -122.3)
    expect(ab).toBeCloseTo(ba, 10)
  })

  it('returns NaN when any input is non-finite (the transform finite-guard relies on this)', () => {
    expect(haversineMiles(NaN, 0, 0, 0)).toBeNaN()
    expect(haversineMiles(0, Infinity, 0, 0)).toBeNaN()
    expect(haversineMiles(0, 0, NaN, 0)).toBeNaN()
    expect(haversineMiles(0, 0, 0, NaN)).toBeNaN()
  })
})

describe('roadDistanceMiles', () => {
  it('is the great-circle distance scaled by the 1.3 road factor', () => {
    const gc = haversineMiles(48.05672, -122.1469, 47.6109, -122.33642)
    expect(roadDistanceMiles(48.05672, -122.1469, 47.6109, -122.33642)).toBeCloseTo(gc * ROAD_FACTOR, 6)
    expect(ROAD_FACTOR).toBe(1.3)
  })

  it('propagates NaN from a non-finite input', () => {
    expect(roadDistanceMiles(NaN, 0, 0, 0)).toBeNaN()
  })
})
