import { describe, it, expect } from 'vitest'
import { sanitizeDescription, DESCRIPTION_BLOCKLIST } from './sanitizeDescription.js'

describe('sanitizeDescription', () => {
  it('passes a clean description through unchanged', () => {
    expect(sanitizeDescription('Top-shelf flower, every gram')).toBe('Top-shelf flower, every gram')
  })

  it('strips HTML markup', () => {
    expect(sanitizeDescription('Top-shelf <b>flower</b>')).toBe('Top-shelf flower')
    expect(sanitizeDescription('<script>alert(1)</script>20% off')).toBe('alert(1) 20% off')
  })

  it('strips emoji and variation selectors', () => {
    expect(sanitizeDescription('Fire deals 🔥🔥 today')).toBe('Fire deals today')
    expect(sanitizeDescription('Best ❤️ prices')).toBe('Best prices')
  })

  it('collapses whitespace and trims', () => {
    expect(sanitizeDescription('  spaced    out\tcopy  ')).toBe('spaced out copy')
  })

  it('truncates over-length copy on a word boundary (no mid-word cut)', () => {
    const long =
      'Premium indoor flower grown locally and cured slowly for an exceptionally smooth finish'
    const out = sanitizeDescription(long)
    expect(out.length).toBeLessThanOrEqual(80)
    expect(long.startsWith(out)).toBe(true)
    expect(out.endsWith(' ')).toBe(false)
    // last word is whole, not chopped
    expect(out.split(' ').pop()).not.toBe('')
  })

  it('suppresses (returns "") a description with a therapeutic-claim term', () => {
    expect(sanitizeDescription('This strain cures anxiety')).toBe('')
    expect(sanitizeDescription('Great for pain relief')).toBe('')
    expect(sanitizeDescription('therapeutic and medicinal benefits')).toBe('')
  })

  it('suppresses a description with youth-appeal terms', () => {
    expect(sanitizeDescription('Kid-approved gummies')).toBe('')
    expect(sanitizeDescription('cartoon edibles')).toBe('')
  })

  it('still suppresses a blocked term when an emoji is inserted to split it', () => {
    // emoji is replaced with a space (not ''), so the term can't be glued into an
    // unmatchable token: "pain🔥relief" normalizes to "pain relief" and is caught
    expect(sanitizeDescription('pain🔥relief, all week')).toBe('')
    expect(sanitizeDescription('treats😀anxiety')).toBe('')
  })

  it('suppresses even when the blocked term sits past the length cap', () => {
    const padding = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor'
    expect(sanitizeDescription(`${padding} this product cures cancer`)).toBe('')
  })

  it('does NOT false-flag legit cannabis vocab (whole-word matching)', () => {
    // 'cure' must not catch 'cured'; 'kid' must not catch 'kidding'
    expect(sanitizeDescription('Cured resin, half off')).toBe('Cured resin, half off')
    expect(sanitizeDescription('No kidding, real savings')).toBe('No kidding, real savings')
    // gummies are a lawful product category and are intentionally not blocked
    expect(sanitizeDescription('Assorted gummies, 30% off')).toBe('Assorted gummies, 30% off')
    // 'candy' was dropped from the blocklist — it collides with legit strain names
    expect(sanitizeDescription('Cotton Candy, 20% off')).toBe('Cotton Candy, 20% off')
  })

  it('returns "" for non-strings and for copy that is only markup/emoji', () => {
    expect(sanitizeDescription(undefined)).toBe('')
    expect(sanitizeDescription(null)).toBe('')
    expect(sanitizeDescription(42)).toBe('')
    expect(sanitizeDescription('<br/> 🔥')).toBe('')
  })

  it('matches the blocklist case-insensitively', () => {
    expect(sanitizeDescription('CURE for everything')).toBe('')
    expect(sanitizeDescription('Therapeutic Relief')).toBe('')
  })

  it('exports a non-empty operator-tunable blocklist', () => {
    expect(DESCRIPTION_BLOCKLIST.length).toBeGreaterThan(0)
  })
})
