import { describe, it, expect } from 'vitest'
import { deriveMatchKey, canonicalWeightGrams, strainToken } from './productMatchKey.js'
import type { ProductRecord } from '../types/index.js'

// A1 keystone: the cross-store identity key. It must be STABLE for the same product
// sold at different stores (so a disparity can form) and DISTINCT for clearly
// different products (so we never emit a false disparity comparing GG4 to Blue Dream).
// Weight is canonicalized separately (an eighth is an eighth whether labeled 1/8oz or
// 3.5g) and combined into the per-option comparison key by the disparity engine.

function rec(over: Partial<ProductRecord> = {}): ProductRecord {
  return {
    productId: 'p1',
    dispensaryId: 'store-a',
    name: 'GG4',
    category: 'Flower',
    brand: 'Libre Cannabis',
    strainType: 'Hybrid',
    packCount: null,
    flags: [],
    history: [],
    ...over,
  }
}

describe('canonicalWeightGrams', () => {
  it.each([
    ['1g', 1],
    ['3.5g', 3.5],
    ['1/8oz', 3.5], // 3.54g exact-oz snaps to the nominal eighth
    ['1/4oz', 7], // 7.09g → quarter
    ['1/2oz', 14], // 14.17g → half
    ['1oz', 28], // 28.35g → ounce
    ['28g', 28],
    ['2g', 2],
    ['.75g', 0.75],
  ])('canonicalizes %j → %jg (eighth label-agnostic)', (option, grams) => {
    expect(canonicalWeightGrams(option)).toBe(grams)
  })

  it('returns null for an unparseable weight', () => {
    expect(canonicalWeightGrams('mystery')).toBeNull()
  })

  it('keeps a non-standard weight at its parsed value (no false snap)', () => {
    // 3.6g is >2% from the 3.5g eighth → must stay distinct, not merge with eighths
    expect(canonicalWeightGrams('3.6g')).toBe(3.6)
  })
})

describe('strainToken', () => {
  it('strips brand, form, and weight noise leaving the strain signature', () => {
    expect(strainToken(rec({ name: 'Libre Cannabis Flower GG4', brand: 'Libre Cannabis' }))).toBe('gg4')
  })

  it('is order-insensitive (OG Chem === Chem OG)', () => {
    const a = strainToken(rec({ name: 'OG Chem', brand: 'Phat Panda' }))
    const b = strainToken(rec({ name: 'Chem OG', brand: 'Phat Panda' }))
    expect(a).toBe(b)
    expect(a).toBe('chem og')
  })

  it('matches the same strain across differing store name formats', () => {
    const a = strainToken(rec({ name: 'Banana OG Cartridge (Hustler\'s Ambition)', brand: "Hustler's Ambition", category: 'Vaporizers' }))
    const b = strainToken(rec({ name: 'Banana OG 1g Cartridge (Hustler\'s Ambition)', brand: "Hustler's Ambition", category: 'Vaporizers' }))
    expect(a).toBe(b)
  })
})

describe('deriveMatchKey', () => {
  it('produces the SAME key for the same product at different stores', () => {
    const a = deriveMatchKey(rec({ dispensaryId: 'store-a', name: 'Libre Cannabis Flower GG4' }))
    const b = deriveMatchKey(rec({ dispensaryId: 'store-b', name: 'Libre Cannabis | GG4' }))
    expect('key' in a && 'key' in b).toBe(true)
    expect((a as { key: string }).key).toBe((b as { key: string }).key)
  })

  it('produces DIFFERENT keys for clearly different strains (no false collision)', () => {
    const gg4 = deriveMatchKey(rec({ name: 'GG4', brand: 'Libre Cannabis' }))
    const bd = deriveMatchKey(rec({ name: 'Blue Dream', brand: 'Libre Cannabis' }))
    expect((gg4 as { key: string }).key).not.toBe((bd as { key: string }).key)
  })

  it('distinguishes brand even for the same strain name', () => {
    const a = deriveMatchKey(rec({ name: 'GG4', brand: 'Libre Cannabis' }))
    const b = deriveMatchKey(rec({ name: 'GG4', brand: 'Phat Panda' }))
    expect((a as { key: string }).key).not.toBe((b as { key: string }).key)
  })

  it('falls back to the name token when brand is null', () => {
    const r = deriveMatchKey(rec({ brand: null, name: 'House GG4' }))
    expect('key' in r).toBe(true)
    expect((r as { key: string }).key).toContain('gg4')
  })

  it('returns the unmatched bucket when there is no brand AND no usable name signal', () => {
    const r = deriveMatchKey(rec({ brand: null, name: '3.5g' }))
    expect('unmatched' in r).toBe(true)
  })
})
