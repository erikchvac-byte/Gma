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
