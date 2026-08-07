import { describe, it, expect } from 'vitest'
import {
  mentionsBrand,
  mentionKey,
  normalizeGscDomains,
  alreadyLinks,
  buildChaseList,
  renderChaseListMarkdown,
  type RawMention,
  type KnownMentionSet,
} from './unlinkedMentionFinder.js'

// ---- fixture factories ----
function mention(over: Partial<RawMention> = {}): RawMention {
  return {
    url: 'https://someblog.example/post/1',
    title: 'A post that mentions gmaslist',
    snippet: 'I found it on gmaslist',
    ...over,
  }
}

function knownSet(keys: string[] = []): KnownMentionSet {
  return {
    generatedAt: '2026-08-01T00:00:00.000Z',
    targetDomain: 'gmaslist.com',
    mentions: keys.map((k) => ({ key: k, url: `https://${k}`, firstSeen: '2026-08-01T00:00:00.000Z' })),
  }
}

const NOW = new Date('2026-08-07T00:00:00.000Z')

describe('mentionsBrand (FR-10)', () => {
  it('matches the brand across apostrophe/space variants', () => {
    expect(mentionsBrand(mention({ snippet: 'saw it on gmaslist last week' }))).toBe(true)
    expect(mentionsBrand(mention({ snippet: '', title: "Gma's List has good deals" }))).toBe(true)
    expect(mentionsBrand(mention({ snippet: '', title: 'Gmas List is handy' }))).toBe(true)
    expect(mentionsBrand(mention({ snippet: '', context: 'per GMASLIST.com' }))).toBe(true)
  })
  it('rejects a result that does not actually name the brand', () => {
    expect(mentionsBrand(mention({ title: 'best weed deals', snippet: 'nothing relevant', context: '' }))).toBe(false)
  })
})

describe('mentionKey (FR-11 dedup identity)', () => {
  it('collapses www/case/trailing-slash/query/fragment to one key', () => {
    const a = mentionKey('https://www.Blog.Example/Post/1/')
    const b = mentionKey('https://blog.example/post/1')
    const c = mentionKey('http://blog.example/post/1?utm=x#frag')
    expect(a).toBe('blog.example/post/1')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
  it('distinguishes different paths on the same host', () => {
    expect(mentionKey('https://blog.example/a')).not.toBe(mentionKey('https://blog.example/b'))
  })
  it('returns empty string for an unparseable url', () => {
    expect(mentionKey('not a url')).toBe('')
    expect(mentionKey('')).toBe('')
  })
})

describe('normalizeGscDomains (AR-6)', () => {
  it('parses a domain-per-row export, www-stripped, ignoring headers/blanks', () => {
    const csv = 'Site,Linking pages\nwww.leafly.com,5\nexample.com,2\n\nnot-a-domain-header,\n'
    const set = normalizeGscDomains(csv)
    expect(set.has('leafly.com')).toBe(true)
    expect(set.has('example.com')).toBe(true)
    expect(set.size).toBe(2)
  })
  it('accepts URL cells and returns empty on garbage', () => {
    expect(normalizeGscDomains('"https://news.site/x",3').has('news.site')).toBe(true)
    expect(normalizeGscDomains('').size).toBe(0)
    expect(normalizeGscDomains('header only\njust words here').size).toBe(0)
  })
})

describe('alreadyLinks (FR-10)', () => {
  it('excludes when the engine reports a link', () => {
    expect(alreadyLinks(mention({ linksToTarget: true }), new Set())).toBe(true)
  })
  it('excludes when the domain is in the GSC linking set (cross-check)', () => {
    expect(alreadyLinks(mention({ url: 'https://news.site/x' }), new Set(['news.site']))).toBe(true)
  })
  it('keeps a genuinely unlinked mention', () => {
    expect(alreadyLinks(mention({ url: 'https://blog.example/1', linksToTarget: false }), new Set())).toBe(false)
  })
})

describe('buildChaseList (FR-10/11/12)', () => {
  it('drops rivals, self-domain, already-linked, off-brand, and linkless; keeps real unlinked mentions', () => {
    const raw: RawMention[] = [
      mention({ url: 'https://weedmaps.com/x' }), // rival → drop
      mention({ url: 'https://gmaslist.com/about' }), // self → drop
      mention({ url: 'https://a.blog/1', linksToTarget: true }), // already links → drop
      mention({ url: 'https://b.blog/1', snippet: 'no brand here', title: 'unrelated', context: '' }), // off-brand → drop
      mention({ url: 'not a url' }), // linkless → drop
      mention({ url: 'https://good.blog/1' }), // KEEP
    ]
    const { chaseList } = buildChaseList(raw, knownSet(), { now: NOW })
    expect(chaseList.scanned).toBe(6)
    expect(chaseList.newCount).toBe(1)
    expect(chaseList.mentions[0].url).toBe('https://good.blog/1')
  })

  it('does not re-report a mention seen in a prior run (FR-11) and is idempotent (NFR-2)', () => {
    const raw = [mention({ url: 'https://good.blog/1' })]
    const first = buildChaseList(raw, knownSet(), { now: NOW })
    expect(first.chaseList.newCount).toBe(1)
    // Re-run with the SAME input but the grown ledger → 0 new, ledger unchanged in size.
    const second = buildChaseList(raw, first.updatedKnown, { now: NOW })
    expect(second.chaseList.newCount).toBe(0)
    expect(second.updatedKnown.mentions).toHaveLength(first.updatedKnown.mentions.length)
    expect(second.chaseList.reason).toMatch(/already known|no new/i)
  })

  it('grows the known set monotonically across distinct runs', () => {
    const r1 = buildChaseList([mention({ url: 'https://a.blog/1' })], knownSet(), { now: NOW })
    expect(r1.updatedKnown.mentions).toHaveLength(1)
    const r2 = buildChaseList([mention({ url: 'https://b.blog/2' })], r1.updatedKnown, { now: NOW })
    expect(r2.updatedKnown.mentions).toHaveLength(2)
    expect(r2.chaseList.newCount).toBe(1)
  })

  it('dedupes within a single run by normalized key', () => {
    const raw = [
      mention({ url: 'https://c.blog/1' }),
      mention({ url: 'https://www.c.blog/1/?utm=x' }), // same normalized key
    ]
    const { chaseList } = buildChaseList(raw, knownSet(), { now: NOW })
    expect(chaseList.newCount).toBe(1)
  })

  it('--limit truncates the display and the overflow resurfaces next run (not swallowed)', () => {
    const raw = [
      mention({ url: 'https://a.blog/1', postedDate: '2026-08-06' }),
      mention({ url: 'https://b.blog/2', postedDate: '2026-08-05' }),
      mention({ url: 'https://c.blog/3', postedDate: '2026-08-04' }),
    ]
    const first = buildChaseList(raw, knownSet(), { now: NOW, limit: 1 })
    expect(first.chaseList.newCount).toBe(1)
    expect(first.updatedKnown.mentions).toHaveLength(1) // only the shown one recorded
    // The two not shown are still NEW next run.
    const second = buildChaseList(raw, first.updatedKnown, { now: NOW, limit: 10 })
    expect(second.chaseList.newCount).toBe(2)
  })

  it('applies the GSC cross-check to exclude already-linking domains', () => {
    const raw = [mention({ url: 'https://linked.site/1' }), mention({ url: 'https://fresh.blog/1' })]
    const { chaseList } = buildChaseList(raw, knownSet(), { now: NOW, gscDomains: new Set(['linked.site']) })
    expect(chaseList.newCount).toBe(1)
    expect(chaseList.mentions[0].url).toBe('https://fresh.blog/1')
  })

  it('emits an empty chase list with a stated reason (never a fabricated row)', () => {
    const empty = buildChaseList([], knownSet(), { now: NOW })
    expect(empty.chaseList.mentions).toEqual([])
    expect(empty.chaseList.reason).toMatch(/no candidate mentions/)

    const allFiltered = buildChaseList([mention({ url: 'https://weedmaps.com/x' })], knownSet(), { now: NOW })
    expect(allFiltered.chaseList.mentions).toEqual([])
    expect(allFiltered.chaseList.reason).toMatch(/no new unlinked mention/)
  })

  it('sorts dated-newest first, undated last', () => {
    const raw = [
      mention({ url: 'https://a.blog/old', postedDate: '2026-07-01' }),
      mention({ url: 'https://b.blog/undated' }),
      mention({ url: 'https://c.blog/new', postedDate: '2026-08-06' }),
    ]
    const { chaseList } = buildChaseList(raw, knownSet(), { now: NOW })
    expect(chaseList.mentions.map((m) => m.url)).toEqual([
      'https://c.blog/new',
      'https://a.blog/old',
      'https://b.blog/undated',
    ])
  })
})

describe('renderChaseListMarkdown (FR-12)', () => {
  it('renders one scannable row per mention with source, context, channel', () => {
    const { chaseList } = buildChaseList(
      [
        mention({
          url: 'https://www.reddit.com/r/CannabisWA/comments/x/',
          title: 'Anyone use gmaslist?',
          context: 'I check gmaslist before I drive',
          postedDate: '2026-08-06',
        }),
      ],
      knownSet(),
      { now: NOW },
    )
    const md = renderChaseListMarkdown(chaseList)
    expect(md).toContain('## 1. Anyone use gmaslist?')
    expect(md).toContain('https://www.reddit.com/r/CannabisWA/comments/x/')
    expect(md).toContain('Context: I check gmaslist before I drive')
    expect(md).toContain('Suggested channel: Reddit reply (r/CannabisWA)')
  })
  it('renders an explicit no-mentions report with no fabricated content', () => {
    const md = renderChaseListMarkdown(buildChaseList([], knownSet(), { now: NOW }).chaseList)
    expect(md).toContain('No new unlinked mentions this run')
    expect(md).not.toMatch(/##\s/) // no numbered rows
  })
})

describe('unlinkedMentionFinderRun — pure CLI helpers', () => {
  it('parseArgs reads limit/dry with sane defaults', async () => {
    const { parseArgs } = await import('./unlinkedMentionFinderRun.js')
    expect(parseArgs(['--limit', '15'])).toEqual({ limit: 15, dry: false })
    expect(parseArgs(['--dry'])).toEqual({ dry: true })
    expect(parseArgs([])).toEqual({ dry: false })
    expect(parseArgs(['--limit', 'notanumber'])).toEqual({ dry: false }) // fail-soft: no cap
  })
  it('buildSearchPrompt asks for a JSON array, excludes self + rivals, targets unlinked mentions', async () => {
    const { buildSearchPrompt } = await import('./unlinkedMentionFinderRun.js')
    const p = buildSearchPrompt()
    expect(p).toMatch(/JSON array/i)
    expect(p).toMatch(/do NOT hyperlink/i)
    expect(p).toMatch(/EXCLUDE gmaslist\.com's own pages/i)
    expect(p).toMatch(/EXCLUDE weedmaps/i)
    expect(p).toMatch(/linksToTarget/)
  })
})
