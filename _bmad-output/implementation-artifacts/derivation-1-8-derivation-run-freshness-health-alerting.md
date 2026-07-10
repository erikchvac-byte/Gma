---
baseline_commit: 966750e02fffb3e75d911635f2557175adb6b303
---

# Story derivation-1.8: Derivation-run freshness / health alerting

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a derivation-engine maintainer,
I want alerting on the freshness of the daily derivation run — reusing the existing `evaluateAlert` alert path rather than a second alert system,
so that a stalled or unhealthy derivation run (the exact ~2-day local-scraper/derive outage that 1.2.5 and 1.7 kept surfacing) is caught automatically instead of only being noticed by eye.

## Acceptance Criteria

1. **(Decision D — extend, don't duplicate)** Freshness alerting is added to the existing alert module `server/scripts/alertGate.ts` as a sibling pure function next to `evaluateAlert` — NOT a new parallel alert script/system. It follows the same red-only-on-real-staleness discipline: a pure, I/O-free decision function that is fully unit-testable, plus a thin CLI wiring that fetches state and exits non-zero on a real alert. [Source: epics-derivation-engine.md#Story-1.8; server/scripts/alertGate.ts]

2. **(Decision E — reads `generatedAt` off the envelope, generically)** The freshness check reads the `generatedAt` field off the honesty envelope `{ data, excluded, coverage, generatedAt }` — it does NOT reach into any fact-specific `data` shape. Because every artifact is wrapped by the same `wrapEnvelope`, the check is generic across artifacts (it takes a `generatedAt` string, not a typed report). [Source: server/utils/derivedEnvelope.ts; epics-derivation-engine.md#Story-1.8]

3. **(Reds only on real staleness — parity with the alert-gate discipline)** Given a derivation run whose `generatedAt` is older than the stale-alert window, the check alerts (exit non-zero). Given a run within the fresh window — including a run that was merely a bit late (machine asleep, ran at next wake) sitting in the grace band between the fresh and stale-alert windows — it does NOT alert. A future-skewed `generatedAt` counts as fresh, never stale (mirrors `evaluateAlert`'s future-skew handling). [Source: server/scripts/alertGate.ts:66-76; server/scripts/alertGate.test.ts:38-43,72-76]

4. **(Never-derived / empty-fallback sentinel is handled explicitly)** Given the served envelope carries the empty fail-soft `generatedAt` sentinel (`new Date(0)` epoch = `1970-01-01T00:00:00.000Z`, meaning "no derived file — Render is serving the empty fallback"), the check treats it as alert-worthy (the derived surface is not reaching the site), and this state is reported distinctly in the log from a merely-stale run. [Source: server/routes/valueRoute.ts:30-44]

5. **(Additive, strict-typed, tested — NFR5/NFR6)** The change is additive: `evaluateAlert` and its existing tests are untouched and still pass; no existing type's behavior changes. New strict-typed tests cover: fresh run (no alert), a late-but-graceful run in the band (no alert), a run past the stale-alert window (alert), the epoch/never-derived sentinel (alert), a future-skew timestamp (fresh), and a malformed/unparseable `generatedAt` (treated as never-derived → alert). The full server suite and `npm run build` stay green. [Source: epics-derivation-engine.md#Story-1.8 (NFR5, NFR6)]

6. **(Wired into the running alert path — one alert system)** The CLI reads the served envelope over HTTP from a configurable URL (default the live served disparities envelope) and the check is invoked from the existing `alert-gate` GitHub Actions job in `.github/workflows/scrape-ingest.yml` (or the same `alertGate.ts main()`), so a stale derivation run reds that run's email — no new alerting mechanism, schedule, or notification channel is introduced. [Source: .github/workflows/scrape-ingest.yml:186-205]

## Tasks / Subtasks

- [x] **Task 1 — Add the pure `evaluateRunFreshness` decision function to `alertGate.ts`** (AC: 1, 2, 3, 4)
  - [x] RED: in `server/scripts/alertGate.test.ts`, add a new `describe('evaluateRunFreshness')` block with failing tests: fresh (small age) → no alert; age in the grace band (older than fresh, younger than stale-alert) → no alert; age past the stale-alert window → alert; epoch sentinel `1970-01-01T00:00:00.000Z` → alert with `neverDerived: true`; future-skew (`generatedAt` ahead of `now`) → fresh, no alert; malformed string (`'not-a-date'`) → treated as never-derived → alert.
  - [x] GREEN: implement `export function evaluateRunFreshness(generatedAt: string, nowMs: number, opts?: FreshnessOptions): FreshnessVerdict` beside `evaluateAlert`. Verdict shape: `{ alert: boolean; ageMs: number; stale: boolean; neverDerived: boolean }`. Logic: parse `generatedAt`; if unparseable OR `<= INGESTED_BASELINE_MS` (the epoch/never-derived sentinel, reuse the existing `Date.UTC(2020,0,1)` baseline constant) → `neverDerived = true`, `alert = true`; else `ageMs = nowMs - t`; `stale = ageMs > staleAlertMs`; future-skew (`ageMs < 0`) is fresh; `alert = stale`.
  - [x] Export new tunable constants mirroring the existing pair, sized for the DAILY derive cadence (see Dev Notes §Windows): `DERIVE_FRESH_WINDOW_MS` and `DERIVE_STALE_ALERT_MS`. Add a `FreshnessOptions` interface (`freshWindowMs?`, `staleAlertMs?`, `neverDerivedBaselineMs?`) so tests can inject windows, exactly like `AlertOptions`.
  - [x] REFACTOR: keep it I/O-free and side-effect-free; match the surrounding code style and comment density of `evaluateAlert`.

- [x] **Task 2 — Wire the freshness check into `alertGate.ts main()`** (AC: 4, 6)
  - [x] GREEN: after the existing store-freshness evaluation in `main()`, fetch the served derived envelope from a new `FRESHNESS_URL` env (default `https://gmaslist.com/api/value/disparities`), read its `generatedAt`, and run `evaluateRunFreshness(..., Date.now())`. Combine verdicts: the process exits non-zero if EITHER the store-ingest alert OR the derive-freshness alert fires. Log a clear, separate line for the freshness result (fresh age vs stale vs never-derived), so a red run's cause is unambiguous.
  - [x] Fetch failure of `FRESHNESS_URL` is itself alert-worthy (same posture as the existing `DATA_URL` fetch-failure → `process.exit(1)`).
  - [x] Do NOT change the existing `DATA_URL` store-ingest behavior — it stays exactly as-is; the freshness check is strictly additive.

- [x] **Task 3 — Wire into the workflow (one alert system, no new schedule)** (AC: 6)
  - [x] UPDATE `.github/workflows/scrape-ingest.yml` `alert-gate` step: add `FRESHNESS_URL: https://gmaslist.com/api/value/disparities` to its `env:` block (alongside the existing `DATA_URL`). No new job, no new schedule, no new secret.
  - [x] Update the job/step comment to note it now also gates derivation-run freshness (so a red email's meaning is documented).

- [x] **Task 4 — Regression + build gate** (AC: 5)
  - [x] Run the full server test suite (`npm test` in `server/`); confirm the pre-existing `evaluateAlert` tests and all others stay green and the new `evaluateRunFreshness` tests pass. (565/565 green; alertGate.test.ts 18/18 = 10 pre-existing evaluateAlert + 8 new.)
  - [x] Run the real production build `npm run build` (client + server, per the standing "run production build before deploy" rule) and confirm it is clean. (exit 0.)
  - [x] Optional live proof (read-only): ran `npx tsx scripts/alertGate.ts` with prod URLs → printed `deriveFreshness=fresh age=1.0h stale=false`. (Process exited 1 due to a pre-existing store-ingest stale on `happy-time-mt-vernon` — the untouched `evaluateAlert` path — not the freshness check; this also demonstrates the additive OR-combine.)

### Review Findings

<!-- Code review 2026-07-10 (3-layer: Blind Hunter / Edge Case Hunter / Acceptance Auditor). Auditor verdict: all 6 ACs pass. -->

- [x] [Review][Patch] (was Decision — Erik chose the cap, 2026-07-10) Unbounded future-skew suppresses the stale alert indefinitely — FIXED: `DERIVE_MAX_FUTURE_SKEW_MS` (6h) plausibility cap + `futureSkew` verdict flag + `maxFutureSkewMs` option; small skew stays fresh (AC3 intact), implausible skew alerts with its own log line. [server/scripts/alertGate.ts] [blind+edge]
- [x] [Review][Patch] FRESHNESS_URL fetch failure exits before the store-ingest ALERT detail lines print — FIXED: catch no longer `process.exit(1)`s; it sets `freshnessAlert = true` and falls through so the store-ingest ALERT lines always print before the combined exit. [server/scripts/alertGate.ts] [blind+edge+auditor]
- [x] [Review][Patch] `FreshnessOptions.freshWindowMs` is accepted but never read — FIXED: verdict gains `fresh: boolean` computed from `freshWindowMs ?? DERIVE_FRESH_WINDOW_MS`; `main()` logs the band from the verdict; injected-windows test now exercises all four options. [server/scripts/alertGate.ts] [blind+edge+auditor]
- [x] [Review][Patch] Envelope-shape failure misreported as a fetch failure — FIXED: non-string `generatedAt` no longer throws into the fetch catch; it logs its own `envelope shape regression?` ALERT line. [server/scripts/alertGate.ts] [blind+edge]
- [x] [Review][Patch] Stale boundary `ageMs === staleAlertMs` unpinned — FIXED: boundary test added (exactly at `DERIVE_STALE_ALERT_MS` → not stale, strict `>` pinned). [server/scripts/alertGate.test.ts] [blind]
- [x] [Review][Defer] Single-shot 30s freshness fetch, no retry + push-triggered runs race the Render free-tier redeploy — a transient 5xx/cold-start reds the run falsely; the change widens a pre-existing DATA_URL exposure with a second sequential fetch. Deferred: the no-retry posture is spec-ratified (Task 2 "same posture as DATA_URL") and self-corrects on the next hourly run; a shared retry wrapper for both fetches is an enhancement. [server/scripts/alertGate.ts:158] [blind+edge] — deferred, pre-existing

## Dev Notes

### What this story is (and is NOT)

This is a small, additive, internal-tooling story — no new fact, no route, no client change. It adds ONE pure function and its CLI wiring to the existing alert module, plus one env line in one workflow. Treat it like the smallest derivation stories, not like 1.6/1.7.

**Scope guard — "freshness / health" means freshness here.** The epic ACs are entirely about `generatedAt` age (is the derivation run stale?). Do NOT also build extraction-health-threshold alerting (e.g. reading `extraction-health.json`'s suspected-count and reding on it) — that is a separate signal already computed by 1.2.5 and is explicitly OUT of scope for this story (surfaced as an open question below, not built). Stay on the ACs.

### The existing alert path this extends (read these first)

- `server/scripts/alertGate.ts` — the module to extend. `evaluateAlert(dispensaries, nowMs, opts)` is the existing pure decision (store-ingest freshness): red only on total-failure (no store fresh) or persistent per-store staleness; epoch/never-ingested stores excluded from the stale check; future-skew counts as fresh. `main()` fetches `DATA_URL` (`https://gmaslist.com/api/data`), evaluates, logs, exits non-zero on alert. The CLI guard (`import.meta.url === pathToFileURL(entry).href`) keeps `main()` from running under test — preserve it. **Your new function must sit beside `evaluateAlert`, reuse its constants/discipline, and not modify it.** [Source: server/scripts/alertGate.ts:26-120]
- `server/scripts/alertGate.test.ts` — the test style to mirror: fixed `NOW`, `iso(msAgo)` helper, one `it` per boundary case (fresh / grace-band / stale / epoch / future-skew / malformed / constants-sane). Add a parallel `describe('evaluateRunFreshness')`. [Source: server/scripts/alertGate.test.ts]
- `server/utils/derivedEnvelope.ts` — the envelope shape. `DerivedEnvelope<T>.generatedAt` is an ISO string stamped by `wrapEnvelope` at write time. The check reads ONLY this field — generic across all 8 facts. `isEnvelope()` already validates the four keys if you want a structural guard before reading `generatedAt`. [Source: server/utils/derivedEnvelope.ts:12-40]
- `server/routes/valueRoute.ts` — how the envelope is served. `GET /api/value/disparities` returns the full `disparities.json` envelope (including `generatedAt`). Fail-soft: a missing/malformed/non-envelope file degrades to `EMPTY_DISPARITIES_ENVELOPE` whose `generatedAt` is the FIXED epoch sentinel `EMPTY_GENERATED_AT = new Date(0).toISOString()` (`1970-01-01T00:00:00.000Z`) — deliberately stable so a freshness check can tell "never derived" from "derived a moment ago". This is exactly the sentinel AC4 requires you to handle. [Source: server/routes/valueRoute.ts:30-44,92-94]

### Why one served envelope is a faithful proxy for the whole run

Live grounding (2026-07-10, against the committed derived facts + the live site): all 8 facts are stamped by the same daily derive run within ~0.6s of each other —

```
disparities.json          2026-07-10T18:02:47.401Z   (earliest → the run "floor", and it is HTTP-served)
deal-scope.json           2026-07-10T18:02:47.402Z
extraction-health.json    2026-07-10T18:02:47.462Z
special-events.json       2026-07-10T18:02:47.613Z
disparity-rollups.json    2026-07-10T18:02:47.616Z
brand-personas.json       2026-07-10T18:02:47.760Z
brand-store-matrix.json   2026-07-10T18:02:47.806Z
new-arrival-dormancy.json 2026-07-10T18:02:48.020Z
```

Live `GET https://gmaslist.com/api/value/disparities` returned `"generatedAt":"2026-07-10T18:02:47.401Z"` — matching the committed floor. So checking the served `disparities` envelope (the earliest stamp, and one of only three HTTP-served facts) is a sound single-probe proxy for the whole derivation run's freshness. Use `disparities` as the default target. [Source: live `/api/value/disparities`; `server/data/derived/*.json` generatedAt values]

### Windows (freshness / stale-alert thresholds) — sizing rationale

The existing store-ingest gate uses `FRESH_WINDOW_MS = 3h` and `STALE_ALERT_MS = 6h` for an HOURLY cron (3× / 6× the interval), so a single empty run never reds and only multi-run persistence does. The derivation run is **DAILY** (`GmaS Derive Facts` scheduled task, 04:00 local; `-StartWhenAvailable` means a night the PC was off simply runs at next wake). Apply the same discipline scaled to a 24h cadence:

- **`DERIVE_FRESH_WINDOW_MS ≈ 28h`** — one day plus grace, so a late/next-wake run is still "fresh".
- **`DERIVE_STALE_ALERT_MS ≈ 50h`** — roughly two full missed daily runs before reding. This is the real signal: the outage that motivated this whole thread was ~2 days of no accrual. One skipped day (PC off overnight, ran next evening) must NOT red; two consecutive missed days should.

These are the recommended defaults — **confirm with Erik / adjust in-story if he wants a tighter or looser tolerance** (Question 1 below). Keep them as exported constants + injectable via `FreshnessOptions` so tests pin behavior without wall-clock coupling.

### Placement decision (why the existing hourly alert-gate job)

Wiring the freshness probe into the existing `alert-gate` job (which already runs `npx tsx scripts/alertGate.ts` and already targets `gmaslist.com`) means zero new schedule, job, or secret — the strongest reading of decision D ("extend the existing path, not a second system"). Cost: the daily-derive freshness gets checked ~24×/day (a cheap GET + arithmetic) and a stalled derive reds the *scrape-ingest* workflow email. That cross-pipeline coupling is acceptable **only because the freshness log line names the cause unambiguously** — make that log line clear. This coupling is Question 2 below; the alternative (a separate lightweight daily workflow) is a one-line-heavier option if Erik prefers isolation.

### Testing standards

- Framework: Vitest (server suite, run from `server/`). Strict TypeScript throughout (NFR6). No wall-clock in tests — inject `nowMs` and windows via `FreshnessOptions`, exactly as `alertGate.test.ts` injects into `evaluateAlert`.
- One `it` per boundary (AC5 list). Assert the verdict fields (`alert`, `stale`, `neverDerived`, `ageMs` sign for future-skew), not console output.
- Regression: the pre-existing `evaluateAlert` describe block must remain byte-unchanged and green.

### Project Structure Notes

- Touch only: `server/scripts/alertGate.ts` (UPDATE), `server/scripts/alertGate.test.ts` (UPDATE), `.github/workflows/scrape-ingest.yml` (UPDATE). No new files required (a sibling function in the existing module is the correct home — do NOT create a `deriveFreshness.ts`; that would be the "second system" decision D forbids).
- No `server/data/derived/*.json` is added or changed → no `$derivedFiles` update needed in `scripts/derive-facts-local.ps1` (that rule applies only to new derived artifacts; this story adds none).
- No route, no client change, no `data.json`/deals-pipeline change (FR3 stays intact).

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story-1.8] — the four ACs, decision D, decision E.
- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#L129,L137] — "1.8 reuses the existing evaluateAlert pattern; reads generatedAt off the envelope"; "D. Freshness alerting (1.8) extends the existing evaluateAlert path rather than building a second alert system."
- [Source: server/scripts/alertGate.ts] — `evaluateAlert`, `AlertOptions`, `AlertVerdict`, `FRESH_WINDOW_MS`, `STALE_ALERT_MS`, `INGESTED_BASELINE_MS`, `main()`, CLI guard.
- [Source: server/scripts/alertGate.test.ts] — test conventions to mirror.
- [Source: server/utils/derivedEnvelope.ts] — `DerivedEnvelope<T>`, `generatedAt`, `wrapEnvelope`, `isEnvelope`.
- [Source: server/routes/valueRoute.ts:30-44,92-94] — served envelope + the epoch empty-fallback sentinel.
- [Source: .github/workflows/scrape-ingest.yml:186-205] — the `alert-gate` job to extend.
- [Source: docs/products-local-sqlite-ingest.md] — daily derive cadence (`GmaS Derive Facts` 04:00, StartWhenAvailable) that sizes the windows.

### Open questions for Erik (surfaced, not blocking — sensible defaults chosen)

1. **Freshness windows.** Default recommended: fresh ≈ 28h, stale-alert ≈ 50h (one skipped day is fine, two consecutive missed days reds). Want tighter (e.g. alert after ~26h so any single missed run reds) or looser?
2. **Placement / coupling.** Default recommended: fold the derive-freshness probe into the existing hourly `scrape-ingest` `alert-gate` job (no new schedule; a stalled derive reds the scrape-ingest email, cause named in the log). Acceptable, or prefer a separate lightweight daily workflow so the two pipelines' alerts stay isolated?
3. **"Health" beyond freshness.** This story alerts on `generatedAt` age only. Do you also want threshold alerting on `extraction-health.json` (e.g. red when > N stores are `suspected-extraction-failure`)? Deferred out of scope here by default — could be its own tiny follow-up story if wanted.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- RED: `npx vitest run scripts/alertGate.test.ts` → 8 new fail (`evaluateRunFreshness` undefined), 10 pre-existing pass.
- GREEN: same command → 18/18 pass.
- Full server suite: `npx vitest run` → 565/565 pass (48 files).
- Production build: `npm run build` (client vite + server tsc) → exit 0, clean.
- Live read-only proof: `DATA_URL=…/api/data FRESHNESS_URL=…/api/value/disparities npx tsx scripts/alertGate.ts` → `deriveFreshness=fresh age=1.0h stale=false`.

### Completion Notes List

- Decisions confirmed with Erik before coding (all three open questions took the recommended defaults): freshness windows 28h fresh / 50h stale-alert; fold the probe into the existing hourly `alert-gate` job (no new schedule); freshness-only scope (extraction-health threshold alerting deliberately NOT built).
- Added a pure, I/O-free `evaluateRunFreshness(generatedAt, nowMs, opts?)` sibling to `evaluateAlert` in `server/scripts/alertGate.ts`, plus exported constants `DERIVE_FRESH_WINDOW_MS`/`DERIVE_STALE_ALERT_MS`, `FreshnessOptions`, and `FreshnessVerdict`. `evaluateAlert` and its tests are byte-unchanged (AC5).
- Reads `generatedAt` generically off the honesty envelope (AC2). Epoch/never-derived sentinel and unparseable strings are flagged `neverDerived` and logged distinctly from a merely-stale run (AC4). Future-skew counts as fresh (AC3).
- `main()` fetches `FRESHNESS_URL` (default `https://gmaslist.com/api/value/disparities`), evaluates, and exits non-zero if EITHER the store-ingest alert OR the derive-freshness alert fires. `FRESHNESS_URL` fetch failure is itself alert-worthy, mirroring the `DATA_URL` posture. The store-ingest path is untouched (AC6, strictly additive).
- Workflow `alert-gate` job gains one `FRESHNESS_URL` env line and an updated comment — no new job/schedule/secret (AC6).
- Note: `FreshnessOptions.freshWindowMs` / `DERIVE_FRESH_WINDOW_MS` inform only the log-line band classification (fresh vs late-but-graceful), not the alert boolean — a single-probe freshness check reds strictly on the stale-alert window, so the fresh window is purely diagnostic, matching how the store gate distinguishes its grace band.

### File List

- `server/scripts/alertGate.ts` (UPDATE) — added `evaluateRunFreshness`, constants, interfaces; wired freshness into `main()`.
- `server/scripts/alertGate.test.ts` (UPDATE) — added `describe('evaluateRunFreshness')` (8 tests); imports for new exports.
- `.github/workflows/scrape-ingest.yml` (UPDATE) — `FRESHNESS_URL` env + comment on the `alert-gate` job.
- `_bmad-output/implementation-artifacts/derivation-1-8-derivation-run-freshness-health-alerting.md` (UPDATE) — story tracking (frontmatter baseline_commit, tasks, this record).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE) — status → in-progress → review.

## Change Log

| Date       | Version | Description                                   | Author |
| ---------- | ------- | --------------------------------------------- | ------ |
| 2026-07-10 | 0.1     | Story drafted (create-story), status ready-for-dev | Erikc  |
| 2026-07-10 | 1.0     | Implemented `evaluateRunFreshness` + main()/workflow wiring; 565 tests green, build clean, live-proofed; status → review | Amelia (dev-story) |
| 2026-07-10 | 1.1     | Code review (3-layer): 1 decision resolved (Erik chose the future-skew plausibility cap), 5 patches applied (skew cap + `futureSkew` flag; no early-exit on freshness fetch failure; `fresh` band field consumes `freshWindowMs`; distinct envelope-shape diagnostic; stale-boundary test), 1 deferred (fetch retry, → deferred-work.md), 9 dismissed. alertGate tests 20/20, full suite 567/567, build clean, live-proofed (freshness fresh @2.3h; pre-existing happy-time-mt-vernon stale ALERT prints alongside). Status → done | Code review |
