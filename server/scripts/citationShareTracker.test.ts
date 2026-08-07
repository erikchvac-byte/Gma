import { describe, it, expect } from 'vitest'
import {
  groupChecksIntoRuns,
  computeShareDatapoint,
  buildDatapointsFromLog,
  mergeDatapoints,
  computeTrend,
  detectFirstCitations,
  rivalLeaderOf,
  renderMarkdown,
  dateOf,
  type CitationShareDatapoint,
  type CitationShareSeries,
} from './citationShareTracker.js'
import { parseLog } from './citationShareRun.js'
import { type CitationCheck } from './citationMonitor.js'

function check(over: Partial<CitationCheck>): CitationCheck {
  return {
    timestamp: '2026-08-06T05:00:00.000Z',
    engine: 'anthropic',
    model: 'claude-haiku-4-5',
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

describe('dateOf', () => {
  it('takes the UTC date from an ISO timestamp', () => {
    expect(dateOf('2026-08-06T23:59:00.000Z')).toBe('2026-08-06')
  })
  it('returns empty string for garbage', () => {
    expect(dateOf('not a date')).toBe('')
  })
})

describe('groupChecksIntoRuns', () => {
  it('returns no runs for an empty log', () => {
    expect(groupChecksIntoRuns([])).toEqual([])
  })

  it('keeps checks close in time in a single run', () => {
    const runs = groupChecksIntoRuns([
      check({ timestamp: '2026-08-06T05:00:00.000Z', questionId: 'a' }),
      check({ timestamp: '2026-08-06T05:00:02.000Z', questionId: 'b' }),
      check({ timestamp: '2026-08-06T05:00:03.500Z', questionId: 'c' }),
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(3)
  })

  it('splits into separate runs across a large timestamp gap', () => {
    const runs = groupChecksIntoRuns([
      check({ timestamp: '2026-08-06T05:00:00.000Z', questionId: 'a' }),
      check({ timestamp: '2026-08-13T05:00:00.000Z', questionId: 'a' }), // a week later
    ])
    expect(runs).toHaveLength(2)
  })

  it('sorts out-of-order input chronologically before grouping', () => {
    const runs = groupChecksIntoRuns([
      check({ timestamp: '2026-08-13T05:00:00.000Z', questionId: 'later' }),
      check({ timestamp: '2026-08-06T05:00:00.000Z', questionId: 'earlier' }),
    ])
    expect(runs).toHaveLength(2)
    expect(runs[0][0].questionId).toBe('earlier')
    expect(runs[1][0].questionId).toBe('later')
  })

  it('forces a run boundary on an unparseable timestamp (fail-soft)', () => {
    const runs = groupChecksIntoRuns([
      check({ timestamp: '2026-08-06T05:00:00.000Z', questionId: 'a' }),
      check({ timestamp: 'garbage', questionId: 'b' }),
    ])
    expect(runs).toHaveLength(2)
  })
})

describe('computeShareDatapoint', () => {
  it('counts gmaslist cited questions and union rival tallies across engines', () => {
    const run = [
      check({
        engine: 'anthropic',
        questionId: 'a',
        cited: true,
        citedDomains: ['gmaslist.com', 'weedmaps.com'],
      }),
      check({ engine: 'anthropic', questionId: 'b', citedDomains: ['weedmaps.com', 'leafly.com'] }),
      check({
        engine: 'perplexity',
        model: 'sonar',
        questionId: 'a',
        citedDomains: ['weedmaps.com'],
      }),
      check({ engine: 'perplexity', model: 'sonar', questionId: 'b', citedDomains: ['leafly.com'] }),
    ]
    const dp = computeShareDatapoint(run)
    expect(dp.questionCount).toBe(2)
    expect(dp.overall).toEqual({ gmaslistCitedQuestions: 1, questionCount: 2 })
    // weedmaps appears in both questions (union), leafly in one
    expect(dp.rivals).toEqual({ 'weedmaps.com': 2, 'leafly.com': 1 })
    expect(dp.engines.anthropic.gmaslistCitedQuestions).toBe(1)
    expect(dp.engines.anthropic.citedQueries).toEqual([{ questionId: 'a', question: 'Q?' }])
    expect(dp.engines.perplexity.gmaslistCitedQuestions).toBe(0)
    expect(dp.engines.perplexity.model).toBe('sonar')
  })

  it('excludes errored checks from tallies but counts them per engine', () => {
    const run = [
      check({ questionId: 'a', cited: true, citedDomains: ['gmaslist.com'] }),
      check({ questionId: 'b', error: 'Anthropic API 429', citedDomains: ['weedmaps.com'] }),
    ]
    const dp = computeShareDatapoint(run)
    expect(dp.overall.gmaslistCitedQuestions).toBe(1)
    expect(dp.rivals).toEqual({}) // errored weedmaps citation ignored
    expect(dp.engines.anthropic.erroredQuestions).toBe(1)
  })

  it('picks the latest timestamp in the run as runTimestamp and its UTC date', () => {
    const dp = computeShareDatapoint([
      check({ timestamp: '2026-08-06T05:00:00.000Z' }),
      check({ timestamp: '2026-08-06T05:00:09.000Z' }),
    ])
    expect(dp.runTimestamp).toBe('2026-08-06T05:00:09.000Z')
    expect(dp.date).toBe('2026-08-06')
  })
})

describe('buildDatapointsFromLog', () => {
  it('produces one datapoint per detected run', () => {
    const dps = buildDatapointsFromLog([
      check({ timestamp: '2026-08-06T05:00:00.000Z', questionId: 'a', cited: true, citedDomains: ['gmaslist.com'] }),
      check({ timestamp: '2026-08-13T05:00:00.000Z', questionId: 'a', citedDomains: ['weedmaps.com'] }),
    ])
    expect(dps).toHaveLength(2)
    expect(dps[0].date).toBe('2026-08-06')
    expect(dps[0].overall.gmaslistCitedQuestions).toBe(1)
    expect(dps[1].date).toBe('2026-08-13')
    expect(dps[1].overall.gmaslistCitedQuestions).toBe(0)
  })

  it('returns [] for an empty log', () => {
    expect(buildDatapointsFromLog([])).toEqual([])
  })
})

function dp(over: Partial<CitationShareDatapoint>): CitationShareDatapoint {
  return {
    date: '2026-08-06',
    runTimestamp: '2026-08-06T05:00:00.000Z',
    questionCount: 8,
    engines: {},
    rivals: {},
    overall: { gmaslistCitedQuestions: 0, questionCount: 8 },
    ...over,
  }
}

describe('mergeDatapoints', () => {
  it('upserts by date so a same-date re-run updates rather than duplicates (idempotent)', () => {
    const existing = [dp({ date: '2026-08-06', overall: { gmaslistCitedQuestions: 0, questionCount: 8 } })]
    const rerun = [dp({ date: '2026-08-06', overall: { gmaslistCitedQuestions: 1, questionCount: 8 } })]
    const merged = mergeDatapoints(existing, rerun)
    expect(merged).toHaveLength(1)
    expect(merged[0].overall.gmaslistCitedQuestions).toBe(1)
  })

  it('preserves prior-date datapoints absent from the current log (monotonic history)', () => {
    const existing = [dp({ date: '2026-07-30' }), dp({ date: '2026-08-06' })]
    const derived = [dp({ date: '2026-08-13' })]
    const merged = mergeDatapoints(existing, derived)
    expect(merged.map((d) => d.date)).toEqual(['2026-07-30', '2026-08-06', '2026-08-13'])
  })

  it('sorts merged datapoints by date ascending', () => {
    const merged = mergeDatapoints([dp({ date: '2026-08-13' })], [dp({ date: '2026-08-06' })])
    expect(merged.map((d) => d.date)).toEqual(['2026-08-06', '2026-08-13'])
  })
})

describe('computeTrend', () => {
  it('reports current share, delta vs previous, and the rival leader', () => {
    const trend = computeTrend([
      dp({ date: '2026-08-06', overall: { gmaslistCitedQuestions: 0, questionCount: 8 } }),
      dp({
        date: '2026-08-13',
        overall: { gmaslistCitedQuestions: 2, questionCount: 8 },
        rivals: { 'weedmaps.com': 8, 'leafly.com': 3 },
      }),
    ])
    expect(trend.current?.date).toBe('2026-08-13')
    expect(trend.previous?.date).toBe('2026-08-06')
    expect(trend.deltaCitedQuestions).toBe(2)
    expect(trend.rivalLeader).toEqual({ domain: 'weedmaps.com', questions: 8 })
  })

  it('has a null delta with a single datapoint', () => {
    const trend = computeTrend([dp({})])
    expect(trend.deltaCitedQuestions).toBeNull()
    expect(trend.previous).toBeNull()
  })

  it('returns all-null for an empty series', () => {
    expect(computeTrend([])).toEqual({
      current: null,
      previous: null,
      deltaCitedQuestions: null,
      rivalLeader: null,
    })
  })
})

describe('rivalLeaderOf', () => {
  it('picks the highest count, breaking ties alphabetically', () => {
    expect(rivalLeaderOf(dp({ rivals: { 'weedmaps.com': 5, 'apple.com': 5, 'leafly.com': 2 } }))).toEqual({
      domain: 'apple.com',
      questions: 5,
    })
  })
  it('returns null when there are no rivals', () => {
    expect(rivalLeaderOf(dp({ rivals: {} }))).toBeNull()
  })
})

describe('detectFirstCitations', () => {
  const cited = (engine: string, questionId: string, question: string) =>
    dp({
      engines: {
        [engine]: {
          model: 'm',
          totalQuestions: 8,
          gmaslistCitedQuestions: 1,
          mentionedOnlyQuestions: 0,
          erroredQuestions: 0,
          rivals: {},
          citedQueries: [{ questionId, question }],
        },
      },
    })

  it('flags a (engine, query) cited for the first time, naming the engine and query', () => {
    const previous = [dp({})] // never cited before
    const latest = cited('anthropic', 'cheapest-marysville', 'Best deals near Marysville?')
    expect(detectFirstCitations(previous, latest)).toEqual([
      { engine: 'anthropic', questionId: 'cheapest-marysville', question: 'Best deals near Marysville?' },
    ])
  })

  it('does not re-flag a citation already seen in a prior datapoint', () => {
    const previous = [cited('anthropic', 'q1', 'Q1?')]
    const latest = cited('anthropic', 'q1', 'Q1?')
    expect(detectFirstCitations(previous, latest)).toEqual([])
  })

  it('treats the same query on a different engine as its own first citation', () => {
    const previous = [cited('anthropic', 'q1', 'Q1?')]
    const latest = cited('perplexity', 'q1', 'Q1?')
    expect(detectFirstCitations(previous, latest)).toEqual([
      { engine: 'perplexity', questionId: 'q1', question: 'Q1?' },
    ])
  })
})

function series(over: Partial<CitationShareSeries> = {}): CitationShareSeries {
  return {
    generatedAt: '2026-08-13T05:05:00.000Z',
    targetDomain: 'gmaslist.com',
    datapoints: [],
    ...over,
  }
}

describe('parseLog', () => {
  it('parses well-formed JSONL lines and ignores blank lines', () => {
    const raw =
      JSON.stringify(check({ questionId: 'a' })) + '\n\n' + JSON.stringify(check({ questionId: 'b' })) + '\n'
    const { checks, skipped } = parseLog(raw)
    expect(checks.map((c) => c.questionId)).toEqual(['a', 'b'])
    expect(skipped).toBe(0)
  })

  it('skips and counts malformed or structurally-invalid lines (fail-soft)', () => {
    const raw = [
      JSON.stringify(check({ questionId: 'ok' })),
      '{not json', // unparseable
      JSON.stringify({ engine: 'anthropic' }), // missing required fields
    ].join('\n')
    const { checks, skipped } = parseLog(raw)
    expect(checks).toHaveLength(1)
    expect(skipped).toBe(2)
  })
})

describe('renderMarkdown', () => {
  it('states there is no data for an empty series (fail-soft surface)', () => {
    const md = renderMarkdown(series())
    expect(md).toContain('No citation-monitor data available yet')
  })

  it('renders current share, delta, rival leader and a first-citation callout', () => {
    const first = dp({ date: '2026-08-06', overall: { gmaslistCitedQuestions: 0, questionCount: 8 } })
    const second = dp({
      date: '2026-08-13',
      overall: { gmaslistCitedQuestions: 1, questionCount: 8 },
      rivals: { 'weedmaps.com': 8 },
      engines: {
        anthropic: {
          model: 'claude-haiku-4-5',
          totalQuestions: 8,
          gmaslistCitedQuestions: 1,
          mentionedOnlyQuestions: 0,
          erroredQuestions: 0,
          rivals: { 'weedmaps.com': 8 },
          citedQueries: [{ questionId: 'cheapest-marysville', question: 'Best deals near Marysville, WA?' }],
        },
      },
    })
    const md = renderMarkdown(series({ datapoints: [first, second] }))
    expect(md).toContain('Citation share: 1/8 questions')
    expect(md).toContain('+1 question(s)')
    expect(md).toContain('Rival leader: weedmaps.com (8/8)')
    expect(md).toContain('First-ever citation')
    expect(md).toContain('[anthropic] "Best deals near Marysville, WA?"')
  })

  it('notes a missing prior run for a single-datapoint series', () => {
    const md = renderMarkdown(series({ datapoints: [dp({})] }))
    expect(md).toContain('first datapoint, no prior run to compare')
  })
})
