import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildSummaryLine, upsertSummaryLine } from './citationShareRun.js'
import { type CitationShareDatapoint } from './citationShareTracker.js'

function datapoint(over: Partial<CitationShareDatapoint>): CitationShareDatapoint {
  return {
    date: '2026-08-08',
    runTimestamp: '2026-08-08T05:00:00.000Z',
    questionCount: 8,
    engines: {},
    rivals: {},
    overall: { gmaslistCitedQuestions: 0, questionCount: 8 },
    ...over,
  }
}

describe('buildSummaryLine', () => {
  it('returns empty string with no datapoints', () => {
    expect(buildSummaryLine([])).toBe('')
  })

  it('marks the first datapoint as first-run (no delta target)', () => {
    const line = buildSummaryLine([datapoint({ rivals: { 'weedmaps.com': 8 } })])
    expect(line).toBe('2026-08-08 · cited 0/8 · Δ— (first run) · top rival weedmaps.com (8/8)')
  })

  it('reports delta vs the previous datapoint and the current rival leader', () => {
    const prev = datapoint({ date: '2026-08-01', overall: { gmaslistCitedQuestions: 1, questionCount: 8 } })
    const cur = datapoint({
      date: '2026-08-08',
      overall: { gmaslistCitedQuestions: 3, questionCount: 8 },
      rivals: { 'leafly.com': 4, 'weedmaps.com': 6 },
    })
    expect(buildSummaryLine([prev, cur])).toBe(
      '2026-08-08 · cited 3/8 · Δ+2 vs 2026-08-01 · top rival weedmaps.com (6/8)',
    )
  })

  it('shows a negative delta signed', () => {
    const prev = datapoint({ date: '2026-08-01', overall: { gmaslistCitedQuestions: 3, questionCount: 8 } })
    const cur = datapoint({ overall: { gmaslistCitedQuestions: 1, questionCount: 8 } })
    expect(buildSummaryLine([prev, cur])).toContain('Δ-2 vs 2026-08-01')
  })

  it('handles no rivals recorded', () => {
    expect(buildSummaryLine([datapoint({})])).toContain('top rival none')
  })
})

describe('upsertSummaryLine', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-summary-'))
    file = path.join(dir, 'citation-summary.md')
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('is a no-op for an empty line', () => {
    upsertSummaryLine(file, '')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('writes a single header + data line on first run', () => {
    upsertSummaryLine(file, '2026-08-08 · cited 0/8 · Δ— (first run) · top rival none')
    const out = fs.readFileSync(file, 'utf8')
    expect(out.match(/^# AI-citation share/gm)).toHaveLength(1)
    expect(out).toContain('2026-08-08 · cited 0/8')
  })

  it('upserts the same date instead of duplicating, and never re-adds the header', () => {
    upsertSummaryLine(file, '2026-08-08 · cited 0/8 · a')
    upsertSummaryLine(file, '2026-08-08 · cited 1/8 · b') // same date, re-run
    const out = fs.readFileSync(file, 'utf8')
    expect(out.match(/^# AI-citation share/gm)).toHaveLength(1)
    expect(out.match(/^2026-08-08/gm)).toHaveLength(1)
    expect(out).toContain('cited 1/8') // latest wins
    expect(out).not.toContain('cited 0/8')
  })

  it('appends a new date and keeps lines date-sorted (newest at bottom)', () => {
    upsertSummaryLine(file, '2026-08-15 · newer')
    upsertSummaryLine(file, '2026-08-08 · older')
    const dataLines = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l))
    expect(dataLines).toEqual(['2026-08-08 · older', '2026-08-15 · newer'])
  })
})
