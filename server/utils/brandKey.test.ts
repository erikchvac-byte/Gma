import { describe, it, expect } from 'vitest'
import { normalizeBrandKey } from './brandKey.js'

describe('normalizeBrandKey', () => {
  it('case-folds so casing variants merge to one key (Lavish / LAVISH)', () => {
    const a = normalizeBrandKey('Lavish')
    const b = normalizeBrandKey('LAVISH')
    expect(a).toBe('lavish')
    expect(a).toBe(b)
  })

  it('trims and collapses whitespace so a trailing-space variant merges', () => {
    // Live collision: "Hustler's Ambition" vs "Hustler's Ambition " (trailing space)
    expect(normalizeBrandKey("Hustler's Ambition")).toBe('hustler s ambition')
    expect(normalizeBrandKey("Hustler's Ambition ")).toBe('hustler s ambition')
    expect(normalizeBrandKey("Hustler's Ambition")).toBe(normalizeBrandKey("Hustler's Ambition "))
  })

  it('collapses punctuation so hyphen/ampersand variants merge (EZ-Vape / EZ Vape, DOCTOR & CROOK / Doctor & Crook)', () => {
    expect(normalizeBrandKey('EZ-Vape')).toBe('ez vape')
    expect(normalizeBrandKey('EZ VAPE')).toBe('ez vape')
    expect(normalizeBrandKey('EZ Vape')).toBe('ez vape')
    expect(normalizeBrandKey('DOCTOR & CROOK')).toBe('doctor crook')
    expect(normalizeBrandKey('Doctor & Crook')).toBe('doctor crook')
    expect(normalizeBrandKey('DOCTOR & CROOK')).toBe(normalizeBrandKey('Doctor & Crook'))
  })

  it('returns null for null / undefined / empty / whitespace-only / punctuation-only', () => {
    expect(normalizeBrandKey(null)).toBeNull()
    expect(normalizeBrandKey(undefined)).toBeNull()
    expect(normalizeBrandKey('')).toBeNull()
    expect(normalizeBrandKey('   ')).toBeNull()
    expect(normalizeBrandKey('-- & --')).toBeNull()
  })

  it('round-trips a non-colliding brand to a stable distinct key that does not merge with others', () => {
    expect(normalizeBrandKey('Phat Panda')).toBe('phat panda')
    expect(normalizeBrandKey('Phat Panda')).not.toBe(normalizeBrandKey('Green Haven'))
  })
})
