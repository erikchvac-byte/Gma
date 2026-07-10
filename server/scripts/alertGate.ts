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

// derivation-1.8: freshness of the DAILY derive run (`GmaS Derive Facts`, 04:00 local,
// -StartWhenAvailable). Same red-only-on-real-staleness discipline as evaluateAlert, but
// scaled to a 24h cadence instead of the hourly ingest cron:
//   - FRESH: within ~28h (one day + grace, so a late/next-wake run is still fresh).
//   - STALE-ALERT: older than ~50h ≈ two full missed daily runs — the real signal (the
//     ~2-day derive/scraper outage that 1.2.5 and 1.7 kept surfacing). One skipped day
//     (PC off overnight, ran next evening) must NOT red; two consecutive misses should.
export const DERIVE_FRESH_WINDOW_MS = 28 * 60 * 60 * 1000
export const DERIVE_STALE_ALERT_MS = 50 * 60 * 60 * 1000
// A generatedAt more than this far in the FUTURE is implausible (home-machine clock
// skew, not a real run) and alerts: a timestamp days ahead would otherwise keep ageMs
// negative — masking a dead pipeline exactly as long as the skew. Small skew (< this)
// still counts as fresh, per the future-skew-is-fresh discipline.
export const DERIVE_MAX_FUTURE_SKEW_MS = 6 * 60 * 60 * 1000

export interface FreshnessOptions {
  freshWindowMs?: number
  staleAlertMs?: number
  neverDerivedBaselineMs?: number
  maxFutureSkewMs?: number
}

export interface FreshnessVerdict {
  alert: boolean
  ageMs: number
  fresh: boolean
  stale: boolean
  neverDerived: boolean
  futureSkew: boolean
}

// Pure decision: given the derive run's `generatedAt` (read generically off the honesty
// envelope) and "now", decide whether to alert. No I/O so it is fully unit-testable.
// A generatedAt that is unparseable OR at/before the never-derived baseline (the fixed
// EMPTY_GENERATED_AT epoch sentinel = Render serving the empty fallback, so no derived
// file is reaching the site) is flagged `neverDerived` and always alerts — reported
// distinctly from a merely-stale run. Small future-skew (ageMs < 0 within the plausibility
// cap) counts as fresh, never stale (mirrors evaluateAlert); skew beyond the cap is
// flagged `futureSkew` and alerts. `fresh` is the diagnostic band (fresh vs
// late-but-graceful) — the alert boolean depends only on the stale window and the two
// anomaly flags.
export function evaluateRunFreshness(
  generatedAt: string,
  nowMs: number,
  opts: FreshnessOptions = {},
): FreshnessVerdict {
  const freshWindowMs = opts.freshWindowMs ?? DERIVE_FRESH_WINDOW_MS
  const staleAlertMs = opts.staleAlertMs ?? DERIVE_STALE_ALERT_MS
  const baselineMs = opts.neverDerivedBaselineMs ?? INGESTED_BASELINE_MS
  const maxFutureSkewMs = opts.maxFutureSkewMs ?? DERIVE_MAX_FUTURE_SKEW_MS

  const t = Date.parse(generatedAt)
  if (Number.isNaN(t) || t <= baselineMs) {
    return {
      alert: true,
      ageMs: Number.isNaN(t) ? NaN : nowMs - t,
      fresh: false,
      stale: false,
      neverDerived: true,
      futureSkew: false,
    }
  }

  const ageMs = nowMs - t
  const futureSkew = ageMs < -maxFutureSkewMs // implausibly far ahead → clock-skew anomaly
  const stale = ageMs > staleAlertMs // small future-skew (ageMs<0 within cap) is fresh, never stale
  const fresh = !futureSkew && ageMs <= freshWindowMs
  return { alert: stale || futureSkew, ageMs, fresh, stale, neverDerived: false, futureSkew }
}

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

  const nowMs = Date.now()
  const verdict = evaluateAlert(dispensaries, nowMs)
  console.log(
    `[alertGate] fresh=${verdict.freshCount}/${dispensaries.length}` +
      ` totalFailure=${verdict.totalFailure} persistentlyStale=[${verdict.staleStores.join(', ')}]`,
  )

  // derivation-1.8: freshness of the DAILY derive run, folded into this same alert gate
  // (decision D — one alert system, no new schedule). Reads generatedAt off the served
  // honesty envelope; a stalled derive reds this run's email. The log line names the cause
  // unambiguously so the cross-pipeline coupling stays diagnosable.
  const freshnessUrl = process.env.FRESHNESS_URL ?? 'https://gmaslist.com/api/value/disparities'
  let freshnessAlert = false
  try {
    const res = await axios.get<{ generatedAt?: unknown }>(freshnessUrl, { timeout: 30000 })
    const generatedAt = res.data?.generatedAt
    if (typeof generatedAt !== 'string') {
      // Fetch succeeded but the body isn't the envelope — a shape regression, not a
      // network failure; diagnose it as such.
      console.error(`[alertGate] ALERT: ${freshnessUrl} responded without a generatedAt string (envelope shape regression?)`)
      freshnessAlert = true
    } else {
      const freshness = evaluateRunFreshness(generatedAt, nowMs)
      freshnessAlert = freshness.alert
      if (freshness.neverDerived) {
        console.error('[alertGate] ALERT: derive run never-derived (empty fallback / unparseable generatedAt)')
      } else {
        const ageHours = (freshness.ageMs / 3_600_000).toFixed(1)
        const band = freshness.futureSkew ? 'FUTURE-SKEW' : freshness.stale ? 'STALE' : freshness.fresh ? 'fresh' : 'late-but-graceful'
        console.log(`[alertGate] deriveFreshness=${band} age=${ageHours}h stale=${freshness.stale}`)
        if (freshness.stale) console.error('[alertGate] ALERT: derive run stale (~two missed daily runs)')
        if (freshness.futureSkew) {
          console.error('[alertGate] ALERT: derive generatedAt is implausibly far in the future (clock skew?)')
        }
      }
    }
  } catch (err) {
    // Can't read the derived surface → alert-worthy (same posture as DATA_URL fetch
    // failure) — but fall through so a simultaneous store-ingest alert still prints
    // its own cause before the combined exit.
    console.error(`[alertGate] could not fetch ${freshnessUrl}:`, (err as Error).message)
    freshnessAlert = true
  }

  if (verdict.alert) {
    if (verdict.totalFailure) console.error('[alertGate] ALERT: no store has fresh data (total failure)')
    if (verdict.staleStores.length > 0) {
      console.error(`[alertGate] ALERT: store(s) stale for several runs: ${verdict.staleStores.join(', ')}`)
    }
  }

  if (verdict.alert || freshnessAlert) process.exit(1)
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
