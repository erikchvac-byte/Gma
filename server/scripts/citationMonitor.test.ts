import { describe, it, expect } from 'vitest'
import {
  hostnameMatches,
  urlToDomain,
  checkCitation,
  rivalDomainRanking,
  summarize,
  type CitationCheck,
  type EngineAnswer,
} from './citationMonitor.js'

describe('hostnameMatches', () => {
  it('matches the apex domain', () => {
    expect(hostnameMatches('https://gmaslist.com/compare')).toBe(true)
  })
  it('matches subdomains (www)', () => {
    expect(hostnameMatches('https://www.gmaslist.com/about')).toBe(true)
  })
  it('is case-insensitive on host', () => {
    expect(hostnameMatches('https://GmasList.com/')).toBe(true)
  })
  it('does NOT match a lookalike that merely contains the string', () => {
    expect(hostnameMatches('https://gmaslist.com.attacker.net/x')).toBe(false)
    expect(hostnameMatches('https://evil-gmaslist.com/x')).toBe(false)
    expect(hostnameMatches('https://notgmaslist.com/x')).toBe(false)
  })
  it('does not match unrelated domains', () => {
    expect(hostnameMatches('https://weedmaps.com/')).toBe(false)
  })
  it('returns false for malformed URLs', () => {
    expect(hostnameMatches('not a url')).toBe(false)
    expect(hostnameMatches('')).toBe(false)
  })
})

function answer(over: Partial<EngineAnswer> = {}): EngineAnswer {
  return { answerText: '', citedUrls: [], citationCount: 0, ...over }
}

describe('checkCitation', () => {
  it('marks cited when gmaslist.com is among the cited sources', () => {
    const v = checkCitation(
      answer({ citedUrls: ['https://weedmaps.com/x', 'https://gmaslist.com/compare/flower'] }),
    )
    expect(v.cited).toBe(true)
    expect(v.matchedUrls).toEqual(['https://gmaslist.com/compare/flower'])
  })

  it('is not cited when only third-party sources appear', () => {
    const v = checkCitation(answer({ citedUrls: ['https://leafly.com/', 'https://weedmaps.com/'] }))
    expect(v.cited).toBe(false)
    expect(v.matchedUrls).toEqual([])
  })

  it('dedupes repeated matched URLs', () => {
    const v = checkCitation(
      answer({ citedUrls: ['https://gmaslist.com/a', 'https://gmaslist.com/a'] }),
    )
    expect(v.matchedUrls).toEqual(['https://gmaslist.com/a'])
  })

  it('detects a soft brand mention in the answer text even without a source citation', () => {
    const v = checkCitation(answer({ answerText: 'A tool called Gmaslist tracks WA prices.' }))
    expect(v.cited).toBe(false)
    expect(v.mentionedInText).toBe(true)
  })

  it('no mention when the brand is absent from the text', () => {
    const v = checkCitation(answer({ answerText: 'Try Weedmaps or Leafly.' }))
    expect(v.mentionedInText).toBe(false)
  })

  it('records all cited domains (deduped, www-stripped), incl. our own', () => {
    const v = checkCitation(
      answer({
        citedUrls: [
          'https://www.weedmaps.com/x',
          'https://weedmaps.com/y',
          'https://leafly.com/z',
          'https://gmaslist.com/compare',
          'not a url',
        ],
      }),
    )
    expect(v.citedDomains).toEqual(['weedmaps.com', 'leafly.com', 'gmaslist.com'])
  })
})

describe('urlToDomain', () => {
  it('lowercases and strips a leading www.', () => {
    expect(urlToDomain('https://WWW.Weedmaps.com/deals')).toBe('weedmaps.com')
  })
  it('keeps non-www subdomains', () => {
    expect(urlToDomain('https://blog.leafly.com/a')).toBe('blog.leafly.com')
  })
  it('returns empty string for an unparseable URL', () => {
    expect(urlToDomain('nope')).toBe('')
  })
})

describe('rivalDomainRanking', () => {
  it('ranks rivals by questions cited in, excluding our own domain and errored checks', () => {
    const checks = [
      check({ questionId: 'a', citedDomains: ['weedmaps.com', 'leafly.com', 'gmaslist.com'] }),
      check({ questionId: 'b', citedDomains: ['weedmaps.com', 'dutchie.com'] }),
      check({ questionId: 'c', citedDomains: ['weedmaps.com'], error: 'boom' }), // errored → ignored
    ]
    const ranked = rivalDomainRanking(checks)
    expect(ranked).toEqual([
      { domain: 'weedmaps.com', questions: 2 },
      { domain: 'dutchie.com', questions: 1 },
      { domain: 'leafly.com', questions: 1 },
    ])
    // our own domain never appears in the rival list
    expect(ranked.some((r) => r.domain === 'gmaslist.com')).toBe(false)
  })
})

function check(over: Partial<CitationCheck>): CitationCheck {
  return {
    timestamp: '2026-07-27T00:00:00.000Z',
    engine: 'anthropic',
    model: 'claude-opus-4-8',
    questionId: 'q',
    question: 'Q?',
    cited: false,
    mentionedInText: false,
    matchedUrls: [],
    citedDomains: [],
    citationCount: 0,
    answerSnippet: '',
    ...over,
  }
}

describe('summarize', () => {
  it('handles an empty run', () => {
    expect(summarize([])).toBe('No checks run.')
  })

  it('counts cited / mentioned-only / errored per engine', () => {
    const out = summarize([
      check({ questionId: 'a', cited: true, matchedUrls: ['https://gmaslist.com/a'] }),
      check({ questionId: 'b', mentionedInText: true }),
      check({ questionId: 'c', error: 'Anthropic API 429: slow down' }),
    ])
    expect(out).toContain('anthropic: cited in 1/3')
    expect(out).toContain('mentioned-only in 1')
    expect(out).toContain('1 error(s)')
    expect(out).toContain('✓ "Q?" → https://gmaslist.com/a')
  })

  it('includes a "who\'s winning" rival roll-up excluding our own domain', () => {
    const out = summarize([
      check({ questionId: 'a', cited: true, citedDomains: ['gmaslist.com', 'weedmaps.com'] }),
      check({ questionId: 'b', citedDomains: ['weedmaps.com', 'leafly.com'] }),
    ])
    expect(out).toContain("Who's winning the answers")
    expect(out).toContain('2/2  weedmaps.com')
    expect(out).toContain('1/2  leafly.com')
    expect(out).not.toContain('gmaslist.com') // our own domain excluded from the rival list
  })
})
