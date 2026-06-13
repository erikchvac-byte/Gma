---
baseline_commit: e5b7cdb
context: []
---

# Story 4.1: Scraper Engine & Orchestrator

Status: review

## Story

As an **operator**,
I want a scheduled scraper engine that runs every 60 minutes, orchestrates all dispensary scrapers, and logs results to a file,
So that deal data stays fresh and I can identify and fix broken parsers.

## Acceptance Criteria

1. **Given** the server starts, **When** it initializes, **Then** `runScrapers()` is called once immediately and then on a 60-minute `setInterval`.
2. **Given** a scraper returns `Deal[]` (success — non-empty array), **When** `runScrapers` processes the result, **Then** the dispensary's `stale` flag is set to `false`, its `deals` array is updated, and `lastFetchedAt` is refreshed to the current ISO timestamp.
3. **Given** a scraper returns `[]` (failure path — including "no scraper registered yet" and any unexpected thrown error), **When** `runScrapers` processes the result, **Then** the dispensary's `stale` flag is set to `true` and its existing `deals`/`lastFetchedAt` are left untouched — never overwritten with an empty array.
4. **Given** each completed scraper run, **When** `runScrapers` finishes all dispensaries, **Then** a log entry is appended to `logs.json`: `{ runAt: ISO timestamp, results: { "store-slug": "ok | error: ..." } }`, and `data.json`'s `meta.lastScraperRun` is set to that same timestamp.
5. **Given** `logs.json` on disk, **When** read directly, **Then** per-source success/failure status and timestamp for every run are visible without a database.
6. **Given** all `data.json`/`logs.json` writes in the scraper engine, **When** the codebase is inspected, **Then** every write uses `atomicWriteJson` — no direct `fs.writeFileSync`. Additionally, all read-modify-write access to `data.json` (including `refreshGasPrice`) is serialized through a shared write lock so a scraper run and a gas-price refresh can never race and lose each other's update.
7. **Given** the scraper file contract, **When** any file in `server/scrapers/` is inspected, **Then** it exports `export default async function scrape(): Promise<Deal[]>` and never throws — it returns `[]` on any error.
8. **Given** `server/scrapers/_template.ts`, **When** reviewed, **Then** it provides the correct starting structure (contract + try/catch returning `[]`) for future dispensary parser files (Stories 4.2/4.3).

## Tasks / Subtasks

- [x] Task 1: Shared write-lock for `data.json` (AC: 6)
  - [x] `server/utils/dataStore.ts` — export `withDataLock<T>(fn: () => Promise<T> | T): Promise<T>`, a promise-chain mutex (see Dev Notes for exact implementation)
  - [x] `server/utils/dataStore.test.ts` — verify two overlapping calls run strictly sequentially (second doesn't start until first resolves), and that the lock survives a thrown/rejected `fn` (doesn't deadlock)
  - [x] Update `server/utils/refreshGasPrice.ts` — wrap its existing read→mutate→`atomicWriteJson` block in `withDataLock(...)`. Keep the EIA `axios.get` call **outside** the lock (don't hold the lock during network I/O)
  - [x] Update the multi-writer comment in `server/utils/atomicWrite.ts` — note that `withDataLock` (in `dataStore.ts`) now serializes all `data.json` writers; remove the "blocker" framing
- [x] Task 2: Scraper contract + registry (AC: 7, 8)
  - [x] `server/scrapers/_template.ts` — `export default async function scrape(): Promise<Deal[]>`, wraps body in try/catch, returns `[]` on any error (see Dev Notes for exact content)
  - [x] `server/scrapers/index.ts` — `export const scrapers: Record<string, () => Promise<Deal[]>> = {}` (empty registry; Stories 4.2/4.3 add entries keyed by dispensary `id`)
- [x] Task 3: `runScrapers` orchestrator (AC: 2, 3, 4, 5, 6)
  - [x] `server/utils/runScrapers.ts` — `export async function runScrapers(dataPath?, logsPath?, registry?): Promise<void>`, defaults pointing at `server/data/data.json` / `server/data/logs.json` / the real `scrapers` registry
  - [x] Inside a single `withDataLock`: read `data.json`, for each dispensary look up `registry[dispensary.id]`; missing entry → treat as failure with result `'error: no scraper registered'`; call `scrape()` in a try/catch (defense-in-depth even though the contract says never-throw) — on success (`deals.length > 0`) update `stale: false`, `deals`, `lastFetchedAt`; on `[]`/error set `stale: true` and leave `deals`/`lastFetchedAt` untouched; set `meta.lastScraperRun`; `atomicWriteJson(dataPath, file)`
  - [x] Append `{ runAt, results }` to `logs.json` (read, push, `atomicWriteJson`) — same lock scope as the `data.json` write
  - [x] `server/utils/runScrapers.test.ts` — Vitest with tmp-dir seed files and an injected mock registry; cover AC2 (success updates stale/deals/lastFetchedAt), AC3 (empty-array failure preserves deals + sets stale), AC3 (missing registry entry), AC3 (scraper throws), AC4/5 (logs.json shape), and "no `.tmp.json` left behind"
- [x] Task 4: Wire into server startup (AC: 1)
  - [x] `server/index.ts` — import `runScrapers`, add `const SCRAPE_INTERVAL_MS = 60 * 60 * 1000`, call `void runScrapers().catch(console.error)` once at startup and again on `setInterval(..., SCRAPE_INTERVAL_MS)`, following the existing `refreshGasPrice` boot pattern

## Dev Notes

### Critical: this story closes a blocker-grade race condition (read this first)

`_bmad-output/implementation-artifacts/deferred-work.md` ("Deferred from: code review of spec-3-1-eia-gas-price-refresh"):

> `atomicWriteJson` is single-writer only — the tmp filename is deterministic (`data.tmp.json`) and `refreshGasPrice` does an unserialized read-modify-write of the whole file. Safe today (one writer, sync read+write in one tick), but Epic 4's scraper engine reusing this utility MUST add writer serialization (shared mutex/queue)... Blocker-grade for Story 4.1.

Both `refreshGasPrice` (24h interval) and `runScrapers` (60min interval, plus immediate on boot) read-modify-write the **same** `server/data/data.json`. Without serialization, two concurrent runs (e.g. both fire at boot) can each read a stale copy and clobber the other's update (lost update), and both would briefly write to the same `data.tmp.json` path.

**Fix scope (don't gold-plate beyond this):** a simple in-process promise-chain mutex is sufficient — this is a single Node.js process (ADR-010: `setInterval` in the Express process, pm2 single instance). No need for pid/random tmp-file suffixes or cross-process locking; full serialization of the critical section makes concurrent same-path writes impossible by construction, which eliminates both the lost-update and tmp-collision risks in one fix.

```ts
// server/utils/dataStore.ts
let tail: Promise<unknown> = Promise.resolve()

// Runs `fn` only after all previously-queued calls have settled (success or
// failure), serializing every read-modify-write critical section against
// server/data/data.json. Single in-process mutex — sufficient because this
// app runs as one Node process (ADR-010); do not add cross-process locking.
export function withDataLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const result = tail.then(fn, fn)
  tail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
```

`refreshGasPrice.ts` change is surgical — wrap only the existing `readFileSync` → mutate → `atomicWriteJson` block:

```ts
// inside the try block, replace the read/mutate/write lines with:
await withDataLock(() => {
  const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
  file.meta.gasPrice = price
  file.meta.gasPriceUpdatedAt = new Date().toISOString()
  atomicWriteJson(dataPath, file)
})
```
Keep the `axios.get` call (and all its error handling) outside the lock — don't hold the mutex during network I/O.

### Scraper contract (`_template.ts`)

Per architecture's "Scraper File Contract": plain-HTML scrapers use Axios + Cheerio directly (both already in `server/package.json` dependencies — no install needed). `_template.ts` is the copy-paste starting point for Stories 4.2/4.3; it must compile and satisfy the contract as-is (returns `[]`):

```ts
// server/scrapers/_template.ts
import type { Deal } from '../../client/src/types/index.js'

export default async function scrape(): Promise<Deal[]> {
  try {
    // TODO: axios.get the dispensary page, parse with cheerio, map to Deal[]
    return []
  } catch (err) {
    console.error('[scraper:_template]', err)
    return []
  }
}
```

### Registry, not dynamic import

`server/scrapers/index.ts` is a static map from dispensary `id` (matches `data.json` dispensary `id`, e.g. `"remedy-tulalip"`) to that dispensary's `scrape` function. Stories 4.2/4.3 add one entry per parser file as they're written:

```ts
// server/scrapers/index.ts
import type { Deal } from '../../client/src/types/index.js'

export const scrapers: Record<string, () => Promise<Deal[]>> = {
  // 'remedy-tulalip': remedyTulalipScrape,  // added in Story 4.2
}
```

This story ships the registry **empty**. Every seeded dispensary (none have scrapers yet) hits the `registry[dispensary.id] === undefined` branch in `runScrapers` → `stale: true`, result `'error: no scraper registered'`. This is correct and expected until 4.2/4.3 populate the registry — verify it with a test rather than treating it as a bug.

A static registry avoids ESM dynamic-`import()` path resolution complexity (and Windows path quirks) and keeps `runScrapers` trivially testable via an injected `registry` parameter.

### `runScrapers` orchestration logic

```ts
// server/utils/runScrapers.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { atomicWriteJson } from './atomicWrite.js'
import { withDataLock } from './dataStore.js'
import { scrapers as defaultRegistry } from '../scrapers/index.js'
import type { ApiDataResponse, Deal } from '../../client/src/types/index.js'
import type { LogEntry, LogRun } from '../types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_PATH = path.join(__dirname, '../data/data.json')
const DEFAULT_LOGS_PATH = path.join(__dirname, '../data/logs.json')

export async function runScrapers(
  dataPath: string = DEFAULT_DATA_PATH,
  logsPath: string = DEFAULT_LOGS_PATH,
  registry: Record<string, () => Promise<Deal[]>> = defaultRegistry,
): Promise<void> {
  await withDataLock(async () => {
    const file: ApiDataResponse = JSON.parse(readFileSync(dataPath, 'utf-8'))
    const results: Record<string, LogEntry> = {}

    for (const dispensary of file.dispensaries) {
      const scrape = registry[dispensary.id]
      let deals: Deal[] = []
      if (scrape === undefined) {
        results[dispensary.id] = 'error: no scraper registered'
      } else {
        try {
          deals = await scrape()
          results[dispensary.id] = deals.length > 0 ? 'ok' : 'error: scraper returned no deals'
        } catch (err) {
          results[dispensary.id] = `error: ${err instanceof Error ? err.message : String(err)}`
        }
      }

      if (deals.length > 0) {
        dispensary.stale = false
        dispensary.deals = deals
        dispensary.lastFetchedAt = new Date().toISOString()
      } else {
        dispensary.stale = true
        // deals / lastFetchedAt intentionally untouched (AC3)
      }
    }

    const runAt = new Date().toISOString()
    file.meta.lastScraperRun = runAt
    atomicWriteJson(dataPath, file)

    const logsFile: { runs: LogRun[] } = JSON.parse(readFileSync(logsPath, 'utf-8'))
    logsFile.runs.push({ runAt, results })
    atomicWriteJson(logsPath, logsFile)
  })
}
```

`{ runs: LogRun[] }` is the `logs.json` root shape (matches the seed file `{ "runs": [] }` and architecture's `logs.json` schema); `LogRun`/`LogEntry` are already defined in `server/types/index.ts` from Story 1.3 — reuse them, don't redefine.

The try/catch around `scrape()` is defense-in-depth: the contract says scrapers never throw, but `runScrapers` must never crash the server regardless (matches the "never throws" spirit applied one level up).

### Why `[]` is always "failure" — even for a dispensary with zero current deals

Per FR-9/AC3 (epics.md), an empty array is indistinguishable from "scraper found no active deals right now" vs. "scraper broke" — both are treated as `stale: true`, preserving last-known-good `deals`. This is a deliberate product decision (favor showing slightly-stale real deals over an empty card). Don't try to "improve" this by adding a separate "legitimately empty" signal — out of scope, not requested.

### Testing

- `server/utils/dataStore.test.ts`: call `withDataLock` twice with functions that record start/end times (or push to a shared array with an `await new Promise(r => setTimeout(r, ...))` delay) — assert the second doesn't start until the first finishes. Also assert a rejecting `fn` doesn't break the chain (a third call still runs).
- `server/utils/runScrapers.test.ts`: `mkdtempSync` a tmp dir, write seed `data.json` (2-3 dispensaries: one with existing `deals: [...]`, one without) and `logs.json` (`{ "runs": [] }`). Pass a mock `registry` covering: a dispensary returning a non-empty `Deal[]` (AC2), one returning `[]` (AC3 — assert pre-existing `deals` unchanged), one with no registry entry (AC3 variant), and one whose scrape function throws (AC3 variant). Assert final `data.json` shape, `meta.lastScraperRun` is a fresh ISO string, `logs.json.runs` has exactly one new entry with the expected `results` map, and no `.tmp.json` files remain in the dir.
- Existing `server/utils/refreshGasPrice.test.ts` must continue to pass unmodified after the `withDataLock` wrap (the lock is transparent to a single caller) — re-run it to confirm no regression.
- Run `cd server && npm test` (or `npm test -- --run`).

### Project Structure Notes

This story adds:
```
server/
├── scrapers/
│   ├── _template.ts
│   └── index.ts
└── utils/
    ├── dataStore.ts
    ├── dataStore.test.ts
    ├── runScrapers.ts
    └── runScrapers.test.ts
```
And modifies: `server/utils/refreshGasPrice.ts`, `server/utils/atomicWrite.ts` (comment only), `server/index.ts`.

No new dependencies — `axios` and `cheerio` are already in `server/package.json` (ADR-010, ADR-016) though `_template.ts` doesn't use them yet (Story 4.2 will).

### References

- Epics: Story 4.1 acceptance criteria (`_bmad-output/planning-artifacts/epics.md` lines 547–586), Epic 4 summary (lines 119–121, 543–545), FR-9/FR-10/FR-12 (lines 99–102)
- Architecture: Scraper File Contract, `data.json`/`logs.json` writes (Process Patterns), Naming Patterns (`server/scrapers/<store-slug>.ts`, `runScrapers.ts`, `atomicWrite.ts`)
- ADR-010 (Lean R&D Stack — `setInterval` scheduler, single Express process), ADR-014 (data.json/logs.json flat files, atomic writes), ADR-016 (Axios+Cheerio scraper contract)
- `deferred-work.md` — "Deferred from: code review of spec-3-1-eia-gas-price-refresh" — the write-serialization blocker this story resolves
- `server/utils/atomicWrite.ts` (Story 3.1) — reuse `atomicWriteJson` as-is, no signature changes
- `server/utils/refreshGasPrice.ts` (Story 3.1) — pattern to follow for the `withDataLock` wrap and for `server/index.ts`'s immediate-then-interval boot pattern
- `server/types/index.ts` (Story 1.3) — `ScraperResult`, `LogEntry`, `LogRun` already defined, reuse don't redefine
- `client/src/types/index.ts` (Story 1.3) — `Deal`, `Dispensary`, `ApiDataResponse`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation followed Dev Notes reference implementations directly; full test suite passed on first run (45/45, including 6 new `runScrapers.test.ts` and 2 new `dataStore.test.ts` tests).

### Completion Notes List

- Added `server/utils/dataStore.ts` exporting `withDataLock` (promise-chain mutex), exactly per Dev Notes reference implementation.
- Wrapped `refreshGasPrice`'s read→mutate→`atomicWriteJson` block in `withDataLock`, keeping `axios.get` outside the lock. Existing `refreshGasPrice.test.ts` (18 tests) passes unmodified.
- Updated the multi-writer comment in `atomicWrite.ts` to describe `withDataLock` serialization instead of the "blocker" framing.
- Added `server/scrapers/_template.ts` (contract: `export default async function scrape(): Promise<Deal[]>`, try/catch returning `[]`) and `server/scrapers/index.ts` (empty `scrapers` registry).
- Added `server/utils/runScrapers.ts` implementing the orchestrator per Dev Notes: single `withDataLock` scope covering the `data.json` read/update/write and the `logs.json` append; AC2/AC3 stale/deals/lastFetchedAt semantics; `meta.lastScraperRun` set to the run's ISO timestamp.
- Added `server/utils/runScrapers.test.ts` with tmp-dir seed files and a mock registry covering: success (AC2), empty-array result (AC3), missing registry entry (AC3), thrown error (AC3), logs.json shape + meta.lastScraperRun (AC4/5), and no leftover `.tmp.json` files.
- Wired `runScrapers` into `server/index.ts`: immediate call on boot plus hourly `setInterval(SCRAPE_INTERVAL_MS = 60 * 60 * 1000)`, mirroring the `refreshGasPrice` boot pattern with a `.catch(console.error)` guard.
- Full server test suite: 7 files, 45 tests, all passing. `tsc --noEmit` clean.

### File List

- `server/utils/dataStore.ts` (new)
- `server/utils/dataStore.test.ts` (new)
- `server/utils/refreshGasPrice.ts` (modified — wrapped write in `withDataLock`)
- `server/utils/atomicWrite.ts` (modified — comment only)
- `server/scrapers/_template.ts` (new)
- `server/scrapers/index.ts` (new)
- `server/utils/runScrapers.ts` (new)
- `server/utils/runScrapers.test.ts` (new)
- `server/index.ts` (modified — wired `runScrapers` into boot + hourly interval)

## Change Log

- 2026-06-13: Implemented Story 4.1 — `withDataLock` mutex serializes all `data.json` writers (closes the blocker-grade race from the 3.1 review); added empty scraper registry + `_template.ts` contract; added `runScrapers` orchestrator with `logs.json` logging and AC2/AC3 stale-data semantics; wired into `server/index.ts` boot + hourly interval. All 45 server tests pass; `tsc --noEmit` clean.
