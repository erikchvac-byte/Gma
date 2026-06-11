---
title: 'EIA Gas Price Refresh'
type: 'feature'
created: '2026-06-11'
status: 'done'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md']
baseline_commit: '8610ef2'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `meta.gasPrice` is a static seed (4.25) — every gas-cost figure on every card is built on a stale number, undermining the R&D success bar (gas cost within 15% of actual). FR-7 requires a live, server-side refreshed price ≤ 24h old.

**Approach:** New `server/utils/refreshGasPrice.ts` fetches the latest weekly Washington-state regular gasoline retail price from the EIA v2 API and patches `meta.gasPrice` / `meta.gasPriceUpdatedAt` in `data.json` via a new generic `server/utils/atomicWrite.ts`; `server/index.ts` runs it at startup and every 24h. No client changes — `GET /api/data` reads `data.json` per request, so new prices flow automatically.

## Boundaries & Constraints

**Always:**
- Refresh logic lives ONLY in `server/utils/refreshGasPrice.ts`; ALL `data.json` writes go through `atomicWrite.ts` (write sibling `data.tmp.json`, then `fs.renameSync` → `data.json`). Keep `atomicWrite` generic — Epic 4's scraper engine reuses it.
- API key from `process.env.EIA_API_KEY` only — never hardcoded, never logged. Missing/empty key → log one warning, skip the fetch, keep the last known value.
- EIA series: v2 route `petroleum/pri/gnd`, `frequency=weekly`, `facets[duoarea][]=SWA` (Washington), `facets[product][]=EPMR` (regular gasoline), sorted by period desc, `length=1` — take `response.data[0].value`.
- Fail-safe on EVERY failure mode (network, non-2xx, malformed body, missing rows, non-positive/non-finite price): keep `data.json` byte-for-byte unchanged, `console.error` the reason, never throw out of `refreshGasPrice()`, never crash the server.
- Fetched value may be a number or numeric string — coerce with `Number(...)`; accept only finite > 0.
- On success: `meta.gasPrice` = fetched value, `meta.gasPriceUpdatedAt` = `new Date().toISOString()`; all other `data.json` content (dispensaries, lastScraperRun, nationalMpg) passes through untouched.
- `server/index.ts`: invoke once at startup (fire-and-forget, rejection-safe), then `setInterval` every 24h (constant `REFRESH_INTERVAL_MS`). `process.env.TZ` line MUST remain the first executable line (locked by `index.test.ts`).
- Use `axios` (existing dep) with a request timeout. TS strict, co-located Vitest tests; `data.json` path resolution mirrors `dataRoute.ts` but injectable for tests.

**Ask First:**
- Any new dependency. Any `data.json` schema change. Any client-side change. An interval other than 24h. Retry/backoff logic beyond the single scheduled attempt.

**Never:**
- No new endpoints. Don't touch `dataRoute.ts`, `filterActiveDeals.ts`, or anything in `client/`. No direct `writeFileSync` to `data.json`. Vehicle MPG / fueleconomy.gov is Story 3.2.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Success | EIA returns `{ response: { data: [{ value: 4.439 }] } }` | `meta.gasPrice` = 4.439, fresh ISO `gasPriceUpdatedAt`, rest of file unchanged, no `data.tmp.json` left behind | N/A |
| String value | `value: "4.439"` (EIA returns strings for some series) | Same as success — coerced to 4.439 | N/A |
| Missing key | `EIA_API_KEY` unset or `''` | No HTTP call; one warning logged; file untouched | Graceful skip |
| Network/timeout | Request rejects | File untouched; error logged; resolves without throwing | Catch-all |
| Non-2xx | 403 (bad key) / 500 | Same as network failure | Catch-all |
| Malformed body | No `response.data[0].value` (empty rows, shape change) | File untouched; error logged | Validation reject |
| Bad price | `value` = `0`, `-1`, `"abc"`, `null`, `Infinity` | File untouched; error logged | Finite > 0 gate |
| Startup | Server boots with valid key | Refresh fires immediately; `app.listen` not blocked or crashed by a rejected refresh | Fire-and-forget with `.catch` |

</frozen-after-approval>

## Code Map

- `server/utils/atomicWrite.ts` — create: generic `atomicWriteJson(targetPath, value)`
- `server/utils/refreshGasPrice.ts` — create: fetch → validate → read → patch meta → atomic write
- `server/index.ts` — wire startup call + 24h `setInterval` (TZ line stays first — `index.test.ts:10` asserts it)
- `server/routes/dataRoute.ts` — reference only: per-request `readFileSync` means no cache invalidation needed (AC7 free)
- `server/data/data.json` — target file; seed meta: `gasPrice: 4.25`, `gasPriceUpdatedAt: 2026-06-09`
- `.env.example` — already has `EIA_API_KEY=` (verify only); `.env` is gitignored and absent on this machine
- `server/package.json` — axios + vitest already present; no additions

## Tasks & Acceptance

**Execution:**
- [x] `server/utils/atomicWrite.ts` — create: `atomicWriteJson(targetPath: string, value: unknown): void` — serialize (2-space indent + trailing newline, matching seed format), write `<dir>/<base>.tmp.json`, `renameSync` over target
- [x] `server/utils/atomicWrite.test.ts` — create: writes valid JSON, replaces existing content, leaves no tmp file, tmp path is sibling of target (temp-dir fixtures)
- [x] `server/utils/refreshGasPrice.ts` — create: `refreshGasPrice(dataPath?: string): Promise<void>` — key gate, axios GET with timeout, finite>0 validation, read-patch-write via `atomicWriteJson`; never rejects
- [x] `server/utils/refreshGasPrice.test.ts` — create: full matrix via mocked axios + temp data file — success number/string, missing key (no HTTP call), network reject, non-2xx, malformed body, each bad-price variant; assert file untouched on every failure row
- [x] `server/index.ts` — modify: import + startup invocation with `.catch(console.error)`, `REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000` interval; TZ line untouched
- [x] `server/index.test.ts` — verify: TZ-first assertion still passes (source-text test) — extend with a source-text assertion that `refreshGasPrice` is invoked and scheduled

**Acceptance Criteria:**
- Given the server starts with a valid key, when it initializes, then `refreshGasPrice` runs immediately and every 24h thereafter, and a successful fetch updates `meta.gasPrice` + ISO `meta.gasPriceUpdatedAt` in `data.json`.
- Given any failure mode in the matrix, when the refresh runs, then `data.json` is unchanged, the error is logged, and the process keeps running.
- Given the codebase, when inspected, then the EIA key appears only as `process.env.EIA_API_KEY` and no code path writes `data.json` without `atomicWrite.ts`.
- Given both suites, when `npm test -- --run` runs in `server/` and `client/`, plus `npx tsc --noEmit` in `server/` and `npx tsc -b` + `npm run lint` in `client/`, then all pass (client untouched: 131 tests).

## Spec Change Log

- 2026-06-11 (review pass 1, patch-level — no loopback): three sub-agent reviewers (Blind Hunter, Edge Case Hunter, Acceptance Auditor — auditor found zero violations, all five verification commands run). Patches: `atomicWrite` now fsyncs the tmp file before rename (power loss can't publish a truncated `data.json`) and removes the orphan tmp if the rename throws (test: rename onto a non-empty directory); EIA value gated on `typeof number|string` before `Number(...)` (blocks `true` → 1, `[4.2]` → 4.2; three new matrix variants). Rejected as verified non-issue: `DEFAULT_DATA_PATH` dist resolution (edge hunter traced both tsx-dev and compiled-dist layouts). Rejected as frozen intent: retry/backoff, period-based timestamping. Deferred: single-writer constraint + unique tmp names (blocker-grade for Epic 4 Story 4.1), `copyData.mjs` seed-reversion on rebuild, optional price plausibility bounds. KEEP: fail-safe catch logging `err.message` only (request config carries the key), injectable `dataPath`, exact EIA v2 facets (SWA/EPMR/weekly/length=1).

## Verification

**Commands:**
- `cd server; npm test -- --run` — expected: all suites pass incl. new matrix tests
- `cd server; npx tsc --noEmit` — expected: zero type errors
- `cd client; npm test -- --run; npx tsc -b; npm run lint` — expected: unchanged, all pass

**Manual checks (if no CLI):**
- With a real key in `.env`: `npm run dev` in `server/`, watch the startup log, confirm `data.json` meta updates to a plausible WA price (~$4–5) with a current timestamp; then blank the key, restart, confirm the warning logs and the file keeps the fetched value.

## Suggested Review Order

**The refresh (fail-safe by contract)**

- Entry point: key gate → fetch → validate → patch — every failure path resolves, logs, leaves the file untouched
  [`refreshGasPrice.ts:18`](../../server/utils/refreshGasPrice.ts#L18)

- typeof gate before `Number(...)` — blocks coercion exotica (`true`, `[4.2]`); only finite > 0 survives
  [`refreshGasPrice.ts:43`](../../server/utils/refreshGasPrice.ts#L43)

- Catch logs `err.message` only — the axios config carries the API key, so it must never be serialized
  [`refreshGasPrice.ts:57`](../../server/utils/refreshGasPrice.ts#L57)

**The atomic write (Epic 4 will reuse this)**

- tmp sibling → fsync → rename; orphan tmp removed if the rename throws; single-writer note for Story 4.1
  [`atomicWrite.ts:10`](../../server/utils/atomicWrite.ts#L10)

**Wiring**

- Boot-time fire-and-forget plus 24h interval; TZ line stays first (locked by `index.test.ts`)
  [`index.ts:23`](../../server/index.ts#L23)

**Peripherals (tests)**

- Full failure matrix against a temp data file: file deep-equals seed on every failure row; key-leak probe
  [`refreshGasPrice.test.ts:23`](../../server/utils/refreshGasPrice.test.ts#L23)

- Atomicity contract: format, replacement, no tmp residue, rename-failure cleanup
  [`atomicWrite.test.ts:7`](../../server/utils/atomicWrite.test.ts#L7)
