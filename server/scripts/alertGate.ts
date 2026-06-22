import { pathToFileURL } from 'node:url'
import axios from 'axios'
import type { ApiDataResponse, Dispensary } from '../../client/src/types/index.js'

// ADR-034 §6 alert gate (amended). Runs once per scrape-ingest workflow, AFTER all
// per-store scrape jobs (which now run continue-on-error, so no single store reds the
// workflow). This job is the SOLE alert: a non-zero exit = the red run = GitHub's
// failure email. It raises the alert only on a signal that actually warrants one:
//
//   - TOTAL FAILURE: no store has fresh data (nothing ingested within the fresh
//     window) — the whole pipeline is down.
//   - PERSISTENT STALENESS: a store that HAS been ingested before has now gone
//     stale for several runs (lastFetchedAt older than the stale-alert window).
//
// A single store returning empty for one run is NOT an alert: it keeps its recent
// lastFetchedAt (last-known-good), so it stays "fresh/ok" and only crosses the
// stale-alert window after many consecutive empty/failed runs.
//
// Never-ingested stores (epoch lastFetchedAt = the seed sentinel, e.g. the Dutchie
// stores awaiting their first deal) are EXCLUDED from the persistent-stale check —
// they have never produced data, so they are "not yet started", not "gone dark".
// They still count against the total-failure check (they are not fresh).

// A store counts as fresh/ok if ingested within this window (mirrors the Goal B
// 3h freshness window: 3× the hourly cron).
export const FRESH_WINDOW_MS = 3 * 60 * 60 * 1000
// A previously-ingested store stale longer than this raises the alert (~6 hourly
// runs — long enough that transient single-run empties clear themselves).
export const STALE_ALERT_MS = 6 * 60 * 60 * 1000
// lastFetchedAt at/before this instant means "never really ingested" (seed epoch /
// malformed-old) — excluded from the persistent-stale check.
export const INGESTED_BASELINE_MS = Date.UTC(2020, 0, 1)

export interface AlertOptions {
  freshWindowMs?: number
  staleAlertMs?: number
  ingestedBaselineMs?: number
}

export interface AlertVerdict {
  alert: boolean
  totalFailure: boolean
  freshCount: number
  staleStores: string[]
}

// Pure decision: given the stores and "now", decide whether to alert. No I/O so it
// is fully unit-testable.
export function evaluateAlert(
  dispensaries: Pick<Dispensary, 'id' | 'lastFetchedAt'>[],
  nowMs: number,
  opts: AlertOptions = {},
): AlertVerdict {
  const freshWindowMs = opts.freshWindowMs ?? FRESH_WINDOW_MS
  const staleAlertMs = opts.staleAlertMs ?? STALE_ALERT_MS
  const ingestedBaselineMs = opts.ingestedBaselineMs ?? INGESTED_BASELINE_MS

  let freshCount = 0
  const staleStores: string[] = []

  for (const store of dispensaries) {
    const t = Date.parse(store.lastFetchedAt)
    const everIngested = !Number.isNaN(t) && t >= ingestedBaselineMs
    if (!everIngested) continue // never-ingested: not fresh, not stale-alerting

    const ageMs = nowMs - t
    if (ageMs <= freshWindowMs) {
      // within window (future-skew ageMs<0 also counts as fresh)
      freshCount++
    } else if (ageMs > staleAlertMs) {
      staleStores.push(store.id)
    }
  }

  const totalFailure = freshCount === 0
  return { alert: totalFailure || staleStores.length > 0, totalFailure, freshCount, staleStores }
}

async function main(): Promise<void> {
  const dataUrl = process.env.DATA_URL
  if (!dataUrl) {
    console.error('[alertGate] DATA_URL must be set')
    process.exit(1)
  }

  let dispensaries: Dispensary[]
  try {
    const res = await axios.get<ApiDataResponse>(dataUrl, { timeout: 30000 })
    dispensaries = res.data?.dispensaries
    if (!Array.isArray(dispensaries)) throw new Error('response has no dispensaries array')
  } catch (err) {
    // Can't read prod state → fail loud: this IS an alert-worthy condition.
    console.error(`[alertGate] could not fetch ${dataUrl}:`, (err as Error).message)
    process.exit(1)
  }

  const verdict = evaluateAlert(dispensaries, Date.now())
  console.log(
    `[alertGate] fresh=${verdict.freshCount}/${dispensaries.length}` +
      ` totalFailure=${verdict.totalFailure} persistentlyStale=[${verdict.staleStores.join(', ')}]`,
  )

  if (verdict.alert) {
    if (verdict.totalFailure) console.error('[alertGate] ALERT: no store has fresh data (total failure)')
    if (verdict.staleStores.length > 0) {
      console.error(`[alertGate] ALERT: store(s) stale for several runs: ${verdict.staleStores.join(', ')}`)
    }
    process.exit(1)
  }
  console.log('[alertGate] ok')
}

// CLI only when executed directly (not when imported by tests).
const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error('[alertGate] fatal', err)
    process.exit(1)
  })
}
