import { describe, it, expect } from 'vitest'
import {
  areaCodesForRegion,
  areaCodeNicknameSentence,
  areaCodeKeywords,
} from './areaCodes.js'

describe('areaCodesForRegion', () => {
  it('maps the three live regions to their correct county NPAs, primary first', () => {
    expect(areaCodesForRegion('everett')).toEqual(['425', '564'])
    expect(areaCodesForRegion('bellingham')).toEqual(['360', '564'])
    expect(areaCodesForRegion('mount-vernon')).toEqual(['360', '564'])
  })

  it('returns [] for an unmapped region (fail-open — never invents an NPA)', () => {
    expect(areaCodesForRegion('oak-harbor')).toEqual([])
    expect(areaCodesForRegion('')).toEqual([])
  })
})

describe('areaCodeNicknameSentence', () => {
  it('names the primary NPA as colloquial local slang for the area', () => {
    const s = areaCodeNicknameSentence('everett', 'Everett')
    expect(s).toContain('425')
    expect(s).toContain('Everett')
    expect(s.toLowerCase()).toContain('locals')
  })

  it('names only the primary NPA in prose, not the overlay', () => {
    // "564" is a keyword-only signal; people do not say "the 564".
    expect(areaCodeNicknameSentence('bellingham', 'Bellingham')).not.toContain('564')
  })

  it('makes no service/delivery/licensing claim (honesty gate)', () => {
    const s = areaCodeNicknameSentence('bellingham', 'Bellingham').toLowerCase()
    expect(s).not.toContain('serve')
    expect(s).not.toContain('deliver')
    expect(s).not.toContain('licensed')
  })

  it('returns empty string for an unmapped region', () => {
    expect(areaCodeNicknameSentence('oak-harbor', 'Oak Harbor')).toBe('')
  })
})

describe('areaCodeKeywords', () => {
  it('emits the bare NPA and its "the <NPA>" locality phrasing for each code', () => {
    expect(areaCodeKeywords('everett')).toEqual(['425', 'the 425', '564', 'the 564'])
  })

  it('never emits a superiority phrase ("best weed …")', () => {
    for (const k of areaCodeKeywords('everett')) {
      expect(k.toLowerCase()).not.toContain('best')
    }
  })

  it('returns [] for an unmapped region', () => {
    expect(areaCodeKeywords('oak-harbor')).toEqual([])
  })
})
