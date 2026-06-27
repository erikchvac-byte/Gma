import { describe, it, expect } from 'vitest'
import { lookupZipCentroid } from './zipCentroids'
import waCentroids from '../data/zipCentroids.wa.json'

// WA bounding box (same predicate as server/scripts/geocodeStores.ts inWaBounds)
const inWaBounds = (lat: number, lng: number): boolean =>
  lat >= 45.5 && lat <= 49.0 && lng >= -124.85 && lng <= -116.9

describe('lookupZipCentroid', () => {
  it('resolves a known WA ZIP to its centroid', () => {
    const marysville = lookupZipCentroid('98270')
    expect(marysville).not.toBeNull()
    expect(marysville?.lat).toBeCloseTo(48.05, 1)
    expect(marysville?.lng).toBeCloseTo(-122.15, 1)
  })

  it('resolves Seattle (98101) and Spokane (99201)', () => {
    expect(lookupZipCentroid('98101')?.lat).toBeCloseTo(47.61, 1)
    expect(lookupZipCentroid('99201')?.lng).toBeCloseTo(-117.44, 1)
  })

  it('tolerates surrounding whitespace and a ZIP+4 suffix', () => {
    expect(lookupZipCentroid('  98270  ')).not.toBeNull()
    expect(lookupZipCentroid('98270-1234')).not.toBeNull()
  })

  it('returns null for a non-WA ZIP (no national coverage by design)', () => {
    expect(lookupZipCentroid('90210')).toBeNull() // Beverly Hills, CA
    expect(lookupZipCentroid('10001')).toBeNull() // New York, NY
    expect(lookupZipCentroid('99501')).toBeNull() // Anchorage, AK (99xxx but not WA)
  })

  it('returns null for malformed input (letters, wrong length, empty, non-string)', () => {
    expect(lookupZipCentroid('abcde')).toBeNull()
    expect(lookupZipCentroid('982')).toBeNull()
    expect(lookupZipCentroid('982700')).toBeNull()
    expect(lookupZipCentroid('')).toBeNull()
    expect(lookupZipCentroid(undefined as unknown as string)).toBeNull()
  })
})

describe('zipCentroids.wa.json table', () => {
  const entries = Object.entries(waCentroids as Record<string, { lat: number; lng: number }>)

  it('is non-empty', () => {
    expect(entries.length).toBeGreaterThan(500)
  })

  it('contains only finite WA-bounds coordinates keyed by 5-digit ZIPs', () => {
    for (const [zip, { lat, lng }] of entries) {
      expect(zip).toMatch(/^\d{5}$/)
      expect(Number.isFinite(lat) && Number.isFinite(lng)).toBe(true)
      expect(inWaBounds(lat, lng), `${zip} out of WA bounds`).toBe(true)
    }
  })
})
