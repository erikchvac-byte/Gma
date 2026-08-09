// Citation-share tracker — IO entry point (Story 1.1 / ADR-113). Reads the AI-citation monitor's
// append-only JSONL log (the SAME log aiCitationRun.ts writes), folds it into a dated citation-share
// time series, and writes the series JSON + a one-screen markdown summary. Makes NO engine calls —
// it only consumes what the monitor already produced (AR-2). All pure logic lives in
// citationShareTracker.ts; this file is only IO.
//
//   Manual run:  cd server ; npx tsx scripts/citationShareRun.ts
//
// Output is PRIVATE reach-measurement state, written alongside the monitor log under ~/GmaS-data/
// (never committed, never served — see ADR-113). Env:
//   CITATION_LOG_PATH  - monitor JSONL log to read (default ~/GmaS-data/citation-log.jsonl) —
//                        SAME default as aiCitationRun.ts, so they stay in sync.
//   CITATION_SHARE_DIR - dir to write citation-share.json + .md (default: the log's directory)
//
// This is scheduled by scripts/ai-citation-local.ps1 (weekly Task, after the monitor run), and is
// also runnable on demand. Fail-soft: it never throws on missing/empty/corrupt input — it writes a
// report stating the reason and exits 0.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { TARGET_DOMAIN, type CitationCheck } from './citationMonitor.js'
import {
  buildDatapointsFromLog,
  computeTrend,
  mergeDatapoints,
  renderMarkdown,
  type CitationShareDatapoint,
  type CitationShareSeries,
} from './citationShareTracker.js'

function logPath(): string {
  return process.env.CITATION_LOG_PATH ?? path.join(os.homedir(), 'GmaS-data', 'citation-log.jsonl')
}

function outputDir(): string {
  return process.env.CITATION_SHARE_DIR ?? path.dirname(logPath())
}

// Parse a JSONL log into CitationCheck records, skipping (and counting) any malformed or
// structurally-invalid lines rather than aborting the run (NFR-1).
export function parseLog(raw: string): { checks: CitationCheck[]; skipped: number } {
  const checks: CitationCheck[] = []
  let skipped = 0
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const obj = JSON.parse(trimmed) as Partial<CitationCheck>
      if (
        obj &&
        typeof obj.timestamp === 'string' &&
        typeof obj.engine === 'string' &&
        typeof obj.questionId === 'string'
      ) {
        checks.push(obj as CitationCheck)
      } else {
        skipped++
      }
    } catch {
      skipped++
    }
  }
  return { checks, skipped }
}

function readExistingDatapoints(seriesPath: string): CitationShareDatapoint[] {
  if (!fs.existsSync(seriesPath)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(seriesPath, 'utf8')) as Partial<CitationShareSeries>
    return Array.isArray(parsed.datapoints) ? parsed.datapoints : []
  } catch {
    // A corrupt series file must not lose history-in-the-log nor crash: treat as empty and let
    // this run rebuild from the log.
    console.warn('WARN: existing citation-share.json is unreadable — rebuilding from the log')
    return []
  }
}

function atomicWrite(filePath: string, contents: string): void {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, contents)
  fs.renameSync(tmp, filePath)
}

// The one glance a human takes: a single line per weekly run in a rolling file you'll actually
// open. Built from the series' trend (current share, delta, rival leader) — the SAME numbers as
// the markdown report, just one line. Returns '' when there's no datapoint to summarize.
export function buildSummaryLine(datapoints: CitationShareDatapoint[]): string {
  const trend = computeTrend(datapoints)
  const c = trend.current
  if (!c) return ''
  const share = `${c.overall.gmaslistCitedQuestions}/${c.overall.questionCount}`
  const delta =
    trend.deltaCitedQuestions === null
      ? 'Δ— (first run)'
      : `Δ${trend.deltaCitedQuestions > 0 ? '+' : ''}${trend.deltaCitedQuestions} vs ${(trend.previous as CitationShareDatapoint).date}`
  const rival = trend.rivalLeader
    ? `top rival ${trend.rivalLeader.domain} (${trend.rivalLeader.questions}/${c.questionCount})`
    : 'top rival none'
  return `${c.date} · cited ${share} · ${delta} · ${rival}`
}

// Append/upsert today's datapoint's one-liner into a rolling summary file, keyed by the datapoint
// date so a same-week re-run replaces that week's line instead of duplicating it. Kept date-sorted.
// Pure-ish IO: never throws (fail-soft, this must not fail the weekly task).
export function upsertSummaryLine(summaryPath: string, line: string): void {
  if (!line) return
  const date = line.slice(0, 10)
  let existing: string[] = []
  if (fs.existsSync(summaryPath)) {
    existing = fs
      .readFileSync(summaryPath, 'utf8')
      .split('\n')
      // Keep only prior data lines: drop blanks, the header/comment lines (re-added below), and
      // this date's line (upserted). A data line starts with a YYYY-MM-DD date.
      .filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l.trim()) && l.slice(0, 10) !== date)
  }
  existing.push(line)
  existing.sort()
  const header = '# AI-citation share — weekly one-liners (private; newest at bottom)'
  atomicWrite(summaryPath, `${header}\n\n${existing.join('\n')}\n`)
}

function main(): void {
  const inPath = logPath()
  const dir = outputDir()
  const seriesPath = path.join(dir, 'citation-share.json')
  const mdPath = path.join(dir, 'citation-share.md')
  fs.mkdirSync(dir, { recursive: true })

  const now = new Date().toISOString()
  const existing = readExistingDatapoints(seriesPath)

  let datapoints = existing
  let reason = ''

  if (!fs.existsSync(inPath)) {
    reason = `monitor log not found at ${inPath}`
  } else {
    const { checks, skipped } = parseLog(fs.readFileSync(inPath, 'utf8'))
    if (skipped > 0) console.warn(`WARN: skipped ${skipped} malformed log line(s)`)
    if (checks.length === 0) {
      reason = `monitor log at ${inPath} has no usable observations`
    } else {
      datapoints = mergeDatapoints(existing, buildDatapointsFromLog(checks))
    }
  }

  const series: CitationShareSeries = {
    generatedAt: now,
    targetDomain: TARGET_DOMAIN,
    datapoints,
  }

  atomicWrite(seriesPath, JSON.stringify(series, null, 2) + '\n')
  atomicWrite(mdPath, renderMarkdown(series, now))

  // Rolling one-liner — the single line a human scans each week (ADR-113 report wiring).
  const summaryPath = path.join(dir, 'citation-summary.md')
  const summaryLine = buildSummaryLine(datapoints)
  upsertSummaryLine(summaryPath, summaryLine)
  if (summaryLine) console.log(`  summary: ${summaryLine} → ${summaryPath}`)

  console.log(`citation-share tracker: ${datapoints.length} datapoint(s) → ${seriesPath}`)
  if (reason) console.log(`  (no new datapoint this run — ${reason})`)
  if (datapoints.length > 0) {
    const latest = datapoints[datapoints.length - 1]
    console.log(
      `  latest ${latest.date}: gmaslist cited in ${latest.overall.gmaslistCitedQuestions}/${latest.overall.questionCount} question(s)`,
    )
  }
}

// Run only when executed directly (via tsx/node), NOT when imported (e.g. by tests importing
// parseLog) — importing must have no side effects.
const invokedDirectly =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  try {
    main()
  } catch (err) {
    // Last-resort fail-soft: never crash the weekly task on an unexpected error.
    console.error('citation-share tracker: unexpected error —', err instanceof Error ? err.message : err)
    process.exitCode = 0
  }
}
