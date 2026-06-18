---
title: 'ADR-034 Goal C — Retire in-process scraping on Render'
type: 'refactor'
created: '2026-06-18'
status: 'done'
baseline_commit: '62f8399'
context: ['{project-root}/ADR.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Render still runs the boot + hourly `setInterval runScrapers()` (ADR-010) as the data trigger, but that path is now redundant and misleading: the GitHub Actions cron → `POST /api/ingest` is the proven sole data source (verified live 2026-06-18 19:14 UTC — all 4 stores fresh via push). On free-tier Render the in-process scrape is also unreliable (spin-down) and cannot reach the Dutchie scraper (`localhost:8000` unhosted), so it only adds confusing dead behavior and a false "scraping still runs" comment.

**Approach:** Remove only the in-process scrape *trigger* from `server/index.ts` (boot call, hourly interval, its import + interval constant) so Render becomes read-only over `data.json`/the store, serving last-known-good written exclusively by `/api/ingest`. The pull pipeline's machinery (`runScrapers.ts`, `withDataLock`, `normalizeDeals`, `atomicWriteJson`) stays intact and untouched. (ADR-034 Decision §5.)

## Boundaries & Constraints

**Always:**
- Keep `runScrapers.ts`, `withDataLock`, `normalizeDeals`, `atomicWriteJson`, `dataStore`, and the `scrapers` registry exactly as-is — only the *caller* in `index.ts` is removed.
- Keep the gas-price path (`refreshGasPrice` boot call + `REFRESH_INTERVAL_MS` daily interval) fully intact.
- Keep `process.env.TZ` as the first executable line and `app.post('/api/ingest', ingestRoute)` as the sole data writer.
- TypeScript strict (`tsc` clean, no unused imports/locals) and all server tests green.

**Ask First:**
- Deleting or relocating `runScrapers.ts` (it becomes caller-less but stays tested — do NOT delete; project safety rule forbids removal without explicit approval).

**Never:**
- Do not touch the ingest pipeline, `applyIngest`, the Actions workflow, or `scraper-svc/`.
- Do not change Goal B (per-store `ok|stale|failed` observability) — it is deferred and re-scoped post-C.
- Do not weaken any safety invariant to "simplify" the removal.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prod boot | Server starts in production | Serves `/api/data` from existing `data.json`; performs NO scrape; gas-price refresh still runs on boot | N/A |
| Ingest POST | Valid authed `/api/ingest` call | Writes last-known-good per-store (unchanged) | unchanged |
| Stale window | No Actions run since deploy | `/api/data` serves last-known-good; stores age toward `stale` until next cron | N/A (by design — read-only) |

</frozen-after-approval>

## Code Map

- `server/index.ts` -- entry point; holds the boot+`setInterval` scrape trigger to remove (lines ~11 import, ~16 `SCRAPE_INTERVAL_MS`, ~56–61 scrape block, ~26–28 now-false comment).
- `server/index.test.ts` -- source-text assertion test; add a check that the scrape trigger is gone.
- `server/utils/runScrapers.ts` -- the pull pipeline; STAYS untouched (becomes caller-less but still tested by `runScrapers.test.ts`).
- `server/routes/ingestRoute.ts` / `server/utils/applyIngest.ts` -- the surviving sole data writer; reference only, no change.
- `ADR.md` -- append ADR-034 Goal C change-log entry.

## Tasks & Acceptance

**Execution:**
- [x] `server/index.ts` -- remove the `runScrapers` import, the `SCRAPE_INTERVAL_MS` constant, and the boot-call + hourly `setInterval` scrape block; update the `/api/ingest` comment to state in-process scraping is retired and ingest is the sole data writer (ADR-034 §5). Leave the gas-price boot/interval and everything else intact.
- [x] `server/index.test.ts` -- add an assertion that `index.ts` no longer references `runScrapers`/`SCRAPE_INTERVAL_MS` (locks the removal), keeping the existing TZ + `refreshGasPrice` assertions.
- [x] `ADR.md` -- append a Change Log entry recording Goal C (retire in-process scrape; push path is sole trigger, proven live 2026-06-18).

**Acceptance Criteria:**
- Given the server boots in production, when it starts, then it serves `/api/data` and performs no scrape, while gas-price refresh still runs on boot and on its daily interval.
- Given a valid authenticated `POST /api/ingest`, when it is received, then data is written per-store exactly as before (ingest path unchanged).
- Given the codebase after the change, when `tsc` and the server test suite run, then both pass with no unused-symbol errors and `runScrapers.ts`/safety utilities are unmodified.

## Verification

**Commands:**
- `cd server && npx tsc --noEmit` -- expected: clean (no unused `runScrapers`/`SCRAPE_INTERVAL_MS`).
- `cd server && npm test` -- expected: all green, including the new index assertion and the untouched `runScrapers.test.ts`.
- `git diff --stat` -- expected: only `server/index.ts`, `server/index.test.ts`, `ADR.md` changed.

## Suggested Review Order

**The retirement (design intent)**

- Start here — the rewritten comment states the new contract: ingest is the sole writer, in-process scrape retired.
  [`index.ts:25`](../../server/index.ts#L25)

- The hole where the boot + hourly `setInterval runScrapers()` block used to be; gas-price boot/interval deliberately kept just above.
  [`index.ts:56`](../../server/index.ts#L56)

**Regression guard (test)**

- Locks the removal: asserts `index.ts` no longer references `runScrapers`/`SCRAPE_INTERVAL_MS`, matching the file's existing source-text test style.
  [`index.test.ts:34`](../../server/index.test.ts#L34)

**Doc + record (peripherals)**

- Patch from review: runbook no longer documents the now-removed boot self-heal; points recovery at the next Actions cron.
  [`deploy-scraper-runbook.md:79`](../../docs/deploy-scraper-runbook.md#L79)

- ADR-034 Change Log entry recording D-proven-live + Goal C.
  [`ADR.md:425`](../../ADR.md#L425)
