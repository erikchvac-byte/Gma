import { describe, it, expect } from 'vitest'
import { roundTripGasCost, formatGasCost } from './gasCost'

describe('roundTripGasCost', () => {
  it('computes the default-MPG matrix case: distance 5, gasPrice 4.1, mpg 28 → $1.46', () => {
    const cost = roundTripGasCost(5, 4.1, 28)
    expect(cost).not.toBeNull()
    expect(formatGasCost(cost as number)).toBe('$1.46')
  })

  it('computes the vehicle-MPG matrix case: distance 5, gasPrice 4.1, mpg 20 → $2.05', () => {
    const cost = roundTripGasCost(5, 4.1, 20)
    expect(cost).not.toBeNull()
    expect(formatGasCost(cost as number)).toBe('$2.05')
  })

  it('rounds via toFixed: distance 12.4, gasPrice 4.1, mpg 28 → $3.63', () => {
    const cost = roundTripGasCost(12.4, 4.1, 28)
    expect(cost).not.toBeNull()
    expect(formatGasCost(cost as number)).toBe('$3.63')
  })

  it('uses the exact formula (distanceMiles × 2) × (gasPrice / mpg)', () => {
    expect(roundTripGasCost(5, 4.1, 28)).toBeCloseTo(10 * (4.1 / 28), 10)
  })

  it('returns null for every invalid-input combination', () => {
    const invalid = [0, -5, NaN, Infinity, -Infinity]
    for (const bad of invalid) {
      expect(roundTripGasCost(bad, 4.1, 28)).toBeNull()
      expect(roundTripGasCost(5, bad, 28)).toBeNull()
      expect(roundTripGasCost(5, 4.1, bad)).toBeNull()
      expect(roundTripGasCost(bad, bad, 28)).toBeNull()
      expect(roundTripGasCost(bad, 4.1, bad)).toBeNull()
      expect(roundTripGasCost(5, bad, bad)).toBeNull()
      expect(roundTripGasCost(bad, bad, bad)).toBeNull()
    }
  })

  it('returns a positive cost for valid inputs', () => {
    const cost = roundTripGasCost(0.1, 0.01, 100)
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeCloseTo(0.2 * 0.0001, 10)
  })

  it('returns null when valid inputs overflow to a non-finite cost', () => {
    expect(roundTripGasCost(Number.MAX_VALUE, Number.MAX_VALUE, 1e-300)).toBeNull()
  })
})

describe('formatGasCost', () => {
  it('formats with a dollar sign and two decimals', () => {
    expect(formatGasCost(1.8)).toBe('$1.80')
    expect(formatGasCost(2.05)).toBe('$2.05')
    expect(formatGasCost(3.6315)).toBe('$3.63')
    expect(formatGasCost(0)).toBe('$0.00')
  })
})
