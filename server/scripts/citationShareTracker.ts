// Citation-share tracker — PURE logic (no network, no fs), so it is unit-testable.
// Backlink Measure-and-Surface Tooling, Story 1.1 / ADR-113. This EXTENDS the AI-citation
// monitor (citationMonitor.ts / aiCitationRun.ts): it makes NO new engine calls. It consumes
// the monitor's append-only JSONL log of CitationCheck observations and turns it into a dated
// time series of gmaslist's citation share against the rival field, plus a human-readable
// trend. The IO half (read the log, write the series + markdown) lives in citationShareRun.ts.
//
// Output is PRIVATE reach-measurement state (like the monitor's own log and products.db):
// written under ~/GmaS-data/, never committed, never served. See ADR-113.

import { rivalDomainRanking, TARGET_DOMAIN, type CitationCheck } from './citationMonitor.js'

// A single cited seed query, carried into the datapoint for traceability (NFR-3) and so the
// weekly report can name WHICH query produced a first-ever citation (FR-2).
export interface CitedQuery {
  questionId: string
  question: string
}

// One engine's share within a run.
export interface EngineShare {
  model: string
  totalQuestions: number // distinct questionIds this engine was asked in the run
  gmaslistCitedQuestions: number // questions where gmaslist.com was a cited source (hard signal)
  mentionedOnlyQuestions: number // named in prose but not cited as a source
  erroredQuestions: number
  rivals: Record<string, number> // rival domain -> questions cited in (excludes gmaslist.com)
  citedQueries: CitedQuery[] // the specific queries this engine cited us in
}

// One run of the monitor, reduced to a share datapoint. `rivals`/`overall` are UNION-by-question
// across engines (a domain counts once per question if ANY engine cited it that question), which
// is the meaningful "n/total questions" share; per-engine detail lives in `engines`.
export interface CitationShareDatapoint {
  date: string // YYYY-MM-DD (UTC) of the run
  runTimestamp: string // representative (latest) ISO timestamp in the run
  questionCount: number // distinct questionIds across the run
  engines: Record<string, EngineShare>
  rivals: Record<string, number> // union-by-question rival tally across engines
  overall: {
    gmaslistCitedQuestions: number // distinct questions cited by ANY engine
    questionCount: number
  }
}

export interface CitationShareSeries {
  generatedAt: string
  targetDomain: string
  datapoints: CitationShareDatapoint[] // sorted by date ascending
}

// Default run boundary: weekly runs are days apart; within a run, checks are ~1.5s + API latency
// apart. Any gap larger than this starts a new run. 10 minutes is comfortably between the two.
export const DEFAULT_RUN_GAP_MS = 10 * 60 * 1000

function parseMs(ts: string): number {
  const t = Date.parse(ts)
  return Number.isNaN(t) ? NaN : t
}

// UTC calendar date of an ISO timestamp. Timestamps come from new Date().toISOString(), so the
// first 10 chars ARE the UTC date; fall back to a parse for anything non-standard.
export function dateOf(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(ts)) return ts.slice(0, 10)
  const ms = parseMs(ts)
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10)
}

// Split an append-only log into runs by timestamp gap. Pure: sorts a copy, never mutates input.
// A check whose timestamp won't parse forces a run boundary (fail-soft — it can't be placed in
// time). Returns runs in chronological order, each preserving chronological order.
export function groupChecksIntoRuns(
  checks: CitationCheck[],
  gapMs: number = DEFAULT_RUN_GAP_MS,
): CitationCheck[][] {
  if (checks.length === 0) return []
  // ISO-8601 UTC strings sort lexicographically == chronologically.
  const sorted = [...checks].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))
  const runs: CitationCheck[][] = []
  let current: CitationCheck[] = []
  let prevMs = NaN
  for (const c of sorted) {
    const ms = parseMs(c.timestamp)
    const boundary =
      current.length > 0 && (Number.isNaN(ms) || Number.isNaN(prevMs) || ms - prevMs > gapMs)
    if (boundary) {
      runs.push(current)
      current = []
    }
    current.push(c)
    prevMs = ms
  }
  if (current.length > 0) runs.push(current)
  return runs
}

// Reduce one run's checks to a share datapoint. Pure and deterministic.
export function computeShareDatapoint(runChecks: CitationCheck[]): CitationShareDatapoint {
  const questionIds = new Set<string>()
  let runTimestamp = ''

  // Per-engine grouping.
  const byEngine = new Map<string, CitationCheck[]>()
  for (const c of runChecks) {
    questionIds.add(c.questionId)
    if (c.timestamp > runTimestamp) runTimestamp = c.timestamp
    const list = byEngine.get(c.engine) ?? []
    list.push(c)
    byEngine.set(c.engine, list)
  }

  const engines: Record<string, EngineShare> = {}
  for (const [engine, list] of byEngine) {
    const ids = new Set(list.map((c) => c.questionId))
    const cited = list.filter((c) => !c.error && c.cited)
    const mentionedOnly = list.filter((c) => !c.error && !c.cited && c.mentionedInText)
    const errored = list.filter((c) => c.error)
    const rivals: Record<string, number> = {}
    for (const { domain, questions } of rivalDomainRanking(list)) rivals[domain] = questions
    engines[engine] = {
      model: list[0]?.model ?? '',
      totalQuestions: ids.size,
      gmaslistCitedQuestions: new Set(cited.map((c) => c.questionId)).size,
      mentionedOnlyQuestions: new Set(mentionedOnly.map((c) => c.questionId)).size,
      erroredQuestions: new Set(errored.map((c) => c.questionId)).size,
      rivals,
      citedQueries: dedupeQueries(cited),
    }
  }

  // Union-by-question tallies across engines.
  const rivalQuestions = new Map<string, Set<string>>()
  const gmaslistQuestions = new Set<string>()
  for (const c of runChecks) {
    if (c.error) continue
    if (c.cited) gmaslistQuestions.add(c.questionId)
    for (const d of c.citedDomains ?? []) {
      if (d === TARGET_DOMAIN) continue
      const set = rivalQuestions.get(d) ?? new Set<string>()
      set.add(c.questionId)
      rivalQuestions.set(d, set)
    }
  }
  const rivals: Record<string, number> = {}
  for (const [d, set] of rivalQuestions) rivals[d] = set.size

  return {
    date: dateOf(runTimestamp),
    runTimestamp,
    questionCount: questionIds.size,
    engines,
    rivals,
    overall: { gmaslistCitedQuestions: gmaslistQuestions.size, questionCount: questionIds.size },
  }
}

function dedupeQueries(checks: CitationCheck[]): CitedQuery[] {
  const seen = new Map<string, string>()
  for (const c of checks) if (!seen.has(c.questionId)) seen.set(c.questionId, c.question)
  return [...seen.entries()].map(([questionId, question]) => ({ questionId, question }))
}

// Turn a full log into candidate datapoints — one per detected run. Pure.
export function buildDatapointsFromLog(
  checks: CitationCheck[],
  gapMs: number = DEFAULT_RUN_GAP_MS,
): CitationShareDatapoint[] {
  return groupChecksIntoRuns(checks, gapMs)
    .map(computeShareDatapoint)
    .filter((d) => d.questionCount > 0)
}

// Upsert derived datapoints into the existing series by date key (derived wins for its dates),
// preserving pre-existing datapoints for dates the current log no longer covers (monotonic
// history that survives log rotation). Returns a new, date-sorted array. Pure.
export function mergeDatapoints(
  existing: CitationShareDatapoint[],
  derived: CitationShareDatapoint[],
): CitationShareDatapoint[] {
  const byDate = new Map<string, CitationShareDatapoint>()
  for (const d of existing) byDate.set(d.date, d)
  for (const d of derived) byDate.set(d.date, d)
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export interface RivalLeader {
  domain: string
  questions: number
}

export interface Trend {
  current: CitationShareDatapoint | null
  previous: CitationShareDatapoint | null
  deltaCitedQuestions: number | null // current - previous gmaslist cited-question count
  rivalLeader: RivalLeader | null // leader in the current datapoint
}

export function rivalLeaderOf(datapoint: CitationShareDatapoint): RivalLeader | null {
  const entries = Object.entries(datapoint.rivals)
  if (entries.length === 0) return null
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return { domain: entries[0][0], questions: entries[0][1] }
}

// Current share, delta vs the previous datapoint, and the current rival leader (FR-2). Pure.
export function computeTrend(datapoints: CitationShareDatapoint[]): Trend {
  if (datapoints.length === 0) {
    return { current: null, previous: null, deltaCitedQuestions: null, rivalLeader: null }
  }
  const current = datapoints[datapoints.length - 1]
  const previous = datapoints.length >= 2 ? datapoints[datapoints.length - 2] : null
  return {
    current,
    previous,
    deltaCitedQuestions: previous
      ? current.overall.gmaslistCitedQuestions - previous.overall.gmaslistCitedQuestions
      : null,
    rivalLeader: rivalLeaderOf(current),
  }
}

export interface FirstCitation {
  engine: string
  questionId: string
  question: string
}

// A (engine, question) pair we were cited in for the FIRST time — never cited in any prior
// datapoint. Names which engine and which seed query produced it (FR-2). Pure.
export function detectFirstCitations(
  previous: CitationShareDatapoint[],
  latest: CitationShareDatapoint,
): FirstCitation[] {
  const seen = new Set<string>() // `${engine} ${questionId}`
  for (const d of previous) {
    for (const [engine, share] of Object.entries(d.engines)) {
      for (const q of share.citedQueries) seen.add(`${engine} ${q.questionId}`)
    }
  }
  const firsts: FirstCitation[] = []
  for (const [engine, share] of Object.entries(latest.engines)) {
    for (const q of share.citedQueries) {
      if (!seen.has(`${engine} ${q.questionId}`)) {
        firsts.push({ engine, questionId: q.questionId, question: q.question })
      }
    }
  }
  return firsts
}

// One-screen human-readable summary of the whole series (FR-3). Pure.
export function renderMarkdown(series: CitationShareSeries, now = series.generatedAt): string {
  const { datapoints } = series
  const lines: string[] = []
  lines.push(`# AI-citation share — ${series.targetDomain}`)
  lines.push('')
  lines.push(`_Generated ${now}. Private reach-measurement report (not served)._`)
  lines.push('')

  if (datapoints.length === 0) {
    lines.push('No citation-monitor data available yet — no datapoints recorded.')
    return lines.join('\n')
  }

  const trend = computeTrend(datapoints)
  const current = trend.current as CitationShareDatapoint
  const share = `${current.overall.gmaslistCitedQuestions}/${current.overall.questionCount}`

  lines.push(`## Latest — ${current.date}`)
  lines.push('')
  lines.push(`- Citation share: ${share} questions`)
  if (trend.deltaCitedQuestions === null) {
    lines.push('- Delta: — (first datapoint, no prior run to compare)')
  } else {
    const d = trend.deltaCitedQuestions
    const sign = d > 0 ? `+${d}` : `${d}`
    lines.push(`- Delta vs previous run (${(trend.previous as CitationShareDatapoint).date}): ${sign} question(s)`)
  }
  if (trend.rivalLeader) {
    lines.push(
      `- Rival leader: ${trend.rivalLeader.domain} (${trend.rivalLeader.questions}/${current.questionCount})`,
    )
  } else {
    lines.push('- Rival leader: none recorded')
  }

  // Per-engine breakdown so "which engine" is always legible.
  lines.push('')
  lines.push('Per engine:')
  for (const [engine, s] of Object.entries(current.engines)) {
    lines.push(`  - ${engine}: cited in ${s.gmaslistCitedQuestions}/${s.totalQuestions}` +
      (s.mentionedOnlyQuestions ? `, mentioned-only ${s.mentionedOnlyQuestions}` : '') +
      (s.erroredQuestions ? `, ${s.erroredQuestions} error(s)` : ''))
  }

  const firsts = detectFirstCitations(datapoints.slice(0, -1), current)
  if (firsts.length > 0) {
    lines.push('')
    lines.push('🎉 First-ever citation(s) this run:')
    for (const f of firsts) lines.push(`  - [${f.engine}] "${f.question}"`)
  }

  lines.push('')
  lines.push(`_${datapoints.length} datapoint(s) in series._`)
  return lines.join('\n')
}
