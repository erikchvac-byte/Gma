---
baseline_commit: 91bdfad765d7bd11f21964e040cad71f76ffc22f
---

# Story: ADR-077 Phase 1 — Products dataset → local SQLite substrate (kill the git wall)

Status: done

<!-- Standalone story (no parent epic — tracked individually, like cross-store-value-matcher / deal-sku-bridge). Source of truth: ADR-077 + plans/products-storage-local-sqlite-plan.md + the two 2026-07-06 scope memos. -->

## Story

As the **solo operator of GmaS**,
I want the raw longitudinal `products.json` to stop being committed to git and instead live in a **local SQLite DB on my home machine**, with Render serving only small pre-computed **derived facts**,
so that the **GitHub file-size wall (~50 MB warning ~2026-07-23, ~100 MB hard block ~2026-08-20) is killed permanently at $0**, the per-request full-parse OOM risk on Render is removed, and I gain the **query substrate the derivation engine (the unbuilt value) is gated on** — without touching the deals pipeline or the honesty gates.

## Context & motivation

- `server/data/products.json` is **18.8 MB and growing ~1.75 MB/day** (forensic audit Finding 8). Linear extrapolation → GitHub push-**warning ~2026-07-23**, hard push-**block ~2026-08-20**. This is a hard deadline, not a preference.
- The two value routes already serialize exactly the shapes the derivation produces (`valueRoute.ts:22` → `buildMatchReport(...)`; `valueRoute.ts:51` → `buildDealScopeLinks(...)`), so "serve derived facts" is a **small server change**: precompute those two objects on the home machine, write them to small JSON files, make the routes read the file.
- This substrate is **step one of the value program**: the derivation-engine PRD (Tier 1 facts D1–D5) reads from exactly this DB. Design the `observation` table's `observedAt` indexing with time-range queries in mind **now** (cheap to include, expensive to retrofit) — see reconciliation note #1.

> **THE LOAD-BEARING RULE (violate this and it becomes reckless):** Render serves derived facts only. It must **never** open a live connection to the home DB. If the home machine is off, the site keeps serving the last-pushed facts; only fresh *accrual* pauses. Site availability must never depend on home uptime or the ISP.

**Scope of THIS story = Phase 1 only.** Phase 0 (mtime-cache of `readProducts`) is independent and routed to `bmad-quick-dev`; Phase 2 (move Dutchie fully local, backup routine, B1 indices) is post-deadline hardening. Note the coupling but do not build Phase 0 or Phase 2 here.

## Acceptance Criteria

1. **Schema + zero-loss import.** A new one-time importer (`server/scripts/importProductsToSqlite.ts`) loads the current `products.json` into `products.db`. Verify **record count and observation count match the source exactly** (audit-time figures ~5,090 records / ~29,669 observations — assert against the *actual live file at migration time*, not these numbers). Import is idempotent/re-runnable (drop-and-recreate or upsert) and reports counts on both sides.
2. **Schema is derivation-ready.** `observation` table makes **per-store, per-day presence explicitly queryable** via a `(product_key, observedAt)` key/index, and carries an index that supports the derivation engine's time-range queries (`observedAt`, and `(dispensaryId, observedAt)` for regional/trend facts). `product` table holds the record-level descriptive identity (`product_key PK, dispensaryId, productId, name, category, brand, strainType, packCount, thc, cbd, totalTerpenes, effects, subcategory, flags`); `observation` holds `(product_key FK, observedAt, special, options_json)`. JSON-preserving where a column would be premature (`options_json`, `flags`).
3. **Local derivation runner.** New `server/scripts/deriveFactsRun.ts` reads `products.db`, runs the **existing** `buildMatchReport` + `buildDealScopeLinks` (pure functions **unchanged** — only their *input* is adapted from an in-memory `ProductsFile` to a DB-backed reader that returns the same `ProductsFile` shape), and writes `server/data/derived/disparities.json` + `server/data/derived/deal-scope.json`. Honesty gates (Gates 1–5, `EXCLUDED_FLAGS`, fix6) run at derivation time, behavior-identical.
4. **Local orchestration script.** New `scripts/derive-facts-local.ps1` mirrors `scripts/scrape-weedmaps-local.ps1`: detached git worktree, **hard-reset to origin/master**, run `deriveFactsRun.ts`, commit-back **only** `server/data/derived/*.json` with `[skip ci]`, push master. (Mirrors the proven residential-runner pattern — including the clean-base reset that avoids the rebase-wedge → dataset-truncation incident.)
5. **Repoint the server (read derived files, fail-soft).** `valueRoute.ts` `disparitiesRoute` and `dealScopeRoute` read the two derived JSON files instead of computing `buildMatchReport`/`buildDealScopeLinks` at request time. Missing/malformed derived file degrades to a safe empty response (same fail-soft posture as `readProducts`/`readDispensaries`) — **never throws, never queries the home DB.**
6. **Remove the wall.** `git rm server/data/products.json`; stop the Actions `scrape-products.yml` commit-back of the **raw** file (it may still run scrapes that feed the local DB path — see open decision #1). A local copy of the last raw `products.json` **and the first `products.db` backup are taken before the delete.** This is the step that actually kills the deadline.
7. **Feed the DB.** Weedmaps local runner writes observations into `products.db` (already local — straightforward). Dutchie handled per **open decision #1** (bridge-for-deadline vs. move-local-now) — resolve with Erik before implementing this AC; do not guess.
8. **Parity test (regression gate).** Disparities derived from `products.db` at migration **equal the current live disparities count** (verify the live number from `/api/value/disparities` at implementation time — memory says ~217; confirm, don't assume). `MatchReport` counts (`excludedFlagCount` incl. `unreconciled-pack`, `nonComparableCategoryCount`, `unmatchedCount`) match the pre-migration values. `deal-scope` buckets still sum to total deals. This test is the proof the migration is byte-faithful.

## Open decisions — RESOLVE WITH ERIK BEFORE THE DEPENDENT AC (do not guess)

1. **Dutchie during Phase 1 (blocks AC7):** (a) move it local immediately — clean end-state, needs the local `scraper-svc` (Python + Playwright + Chromium) set up; or (b) bridge the deadline — Actions commits a *small daily raw-delta that is overwritten each run* (not appended) which the home machine imports into SQLite. **Plan recommendation:** bridge only if the local Python setup can't land before ~Jul 20; otherwise go straight local.
2. **`/api/products` fate (affects `productsRoute.ts`): RESOLVED 2026-07-06 → DROP ENTIRELY.** Erik's decision during derivation-engine PRD authoring (FR4). Remove the route; Render serves only derived facts. No bounded snapshot. Re-add a bounded derived view only if a real consumer later appears. This AC is now decided — implement the drop.
3. **deal-scope freshness (affects AC3/AC5):** precomputing daily makes banner→SKU links up to ~24 h stale (today it's live per request against hourly `data.json`). **Plan recommendation:** precompute daily to start; revisit only if freshness proves to matter. If kept live, ship a *small* per-store `{productId, category, weight}` index instead of full history — but that reintroduces a Render-side read of product data, so weigh against the load-bearing rule.

## Tasks / Subtasks

- [x] **Pick the SQLite driver** (AC: 1,2) — chose **`node:sqlite`** (Node 24 built-in, synchronous) over `better-sqlite3`: zero native dependency, no node-gyp/prebuild risk on Windows, cannot enter the client bundle. No package.json change. Client build verified clean.
- [x] **Schema + importer** `server/scripts/importProductsToSqlite.ts` (AC: 1,2)
  - [x] Define `product` + `observation` tables + indices (AC2). Schema decision + rationale recorded in ADR-077 (Winston review deferred to ADR — solo session; nothing frozen that a Phase-2 index add can't extend).
  - [x] Import current `products.json`; asserted record/observation counts equal source (**5,219 / 33,169**, zero-loss); re-runnable (drop-and-recreate).
- [x] **DB-backed reader** `server/utils/productsDb.ts` (AC: 3) — `readProductsFile` returns the same `ProductsFile` shape; `buildMatchReport`/`buildDealScopeLinks` **untouched**. Proven byte-identical report parity (the seam).
- [x] **Derivation runner** `server/scripts/deriveFactsRun.ts` (AC: 3) — DB → both reports → `server/data/derived/{disparities,deal-scope}.json`.
- [x] **Orchestration** `scripts/derive-facts-local.ps1` (AC: 4) — mirrors `scrape-weedmaps-local.ps1` (worktree, clean-base hard-reset, run, `[skip ci]` commit-back of derived only, push-with-retry).
- [x] **Repoint routes** `server/routes/valueRoute.ts` (AC: 5) — read derived files, fail-soft to empty; dropped request-time `buildMatchReport`/`buildDealScopeLinks`. deal-scope precomputed daily (open decision #3), so `readDispensaries` moved into the runner.
- [x] **Kill the wall** (AC: 6) — backups taken to `~/GmaS-data/backups/` (raw JSON + first DB); `git rm server/data/products.json`; **retired** `scrape-products.yml` (Dutchie fully local, no raw commit-back).
- [x] **Feed the DB** (AC: 7) — both scrape runners gained an injectable `persist` sink; CLIs append into `products.db` (`persistObservationsToDb`, idempotent). `scrape-dutchie-local.ps1` (new) + `scrape-weedmaps-local.ps1` (rewired) feed the DB.
- [x] **Parity test** (AC: 8) — `productsDb.test.ts` proves DB-report == JSON-report byte-identical on a rich fixture; real-file migration proof captured (228 disparities, all counts equal live). Audit test rebased onto the committed derived file. Wired into the server suite.
- [x] **Update ADR.md** — ADR-077 status → Phase 1 implemented; schema + driver + resolved decisions recorded; change-log entry added.

### Review Findings

- [x] [Review][Patch] Derivation fail-soft can silently push empty facts to prod, overwriting live disparities/deal-scope on gmaslist.com [server/utils/productsDb.ts:341-352, server/scripts/deriveFactsRun.ts, scripts/derive-facts-local.ps1] — fixed: `readProductsFromDbPath` now throws instead of swallowing; `deriveFacts()` refuses to overwrite a previously-populated derived file with a zero-record result. Tests: `deriveFactsRun.test.ts`.
- [x] [Review][Patch] AC8 regression gate has no automated parity test for `buildDealScopeLinks` — only `buildMatchReport` is asserted in `productsDb.test.ts` [server/utils/productsDb.test.ts] — fixed: added the DB-vs-JSON `buildDealScopeLinks` byte-equality test.
- [x] [Review][Patch] "Idempotent" importer destroys accrued history if re-run after the DB has since accrued nightly observations — DROP TABLE runs outside the transaction, before the CLI's post-commit count assertion [server/utils/productsDb.ts:164-166, server/scripts/importProductsToSqlite.ts] — fixed: `runImport` refuses to re-import against a DB that already has observations unless `--force` is passed. Tests: `importProductsToSqlite.test.ts`.
- [x] [Review][Patch] No `PRAGMA journal_mode=WAL`/`busy_timeout` — three independent local processes writing the same DB will throw `SQLITE_BUSY` with zero retry [server/utils/productsDb.ts:83-88] — fixed: `openProductsDb` now sets WAL + a 5s busy_timeout.
- [x] [Review][Patch] `readDerived` doesn't validate response shape — array or wrong-shaped-but-valid JSON passes through instead of degrading to the safe empty shape AC5 promises [server/routes/valueRoute.ts:47-56] — fixed: `hasExpectedShape` rejects arrays and objects missing the expected keys. Tests: `valueRoute.test.ts`.
- [x] [Review][Patch] `crossStoreValue.audit.test.ts` throws an unclear `TypeError` instead of a clean assertion failure when the derived file is absent — only the first `it()` checks `present` [server/utils/crossStoreValue.audit.test.ts] — fixed: the remaining three `it()` blocks now guard on `present`.
- [x] [Review][Patch] `bindProduct` unconditionally upserts product metadata even when the observation insert was a no-op duplicate — a degraded retry scrape can overwrite good metadata [server/utils/productsDb.ts:220-233] — fixed: metadata is only refreshed when `(product_key, observedAt)` is genuinely new. Test added to `productsDb.test.ts`.
- [x] [Review][Patch] First-run setup throws an unguided native error if the DB's parent directory doesn't exist yet — no `mkdirSync` before `openProductsDb` [server/scripts/importProductsToSqlite.ts, server/utils/productsDb.ts:83] — fixed: `openProductsDb` now `mkdirSync`s the parent dir (skipped for `:memory:`).
- [x] [Review][Patch] `scrape-dutchie-local.ps1` doesn't surface uvicorn's log output on health-check failure (the retired CI workflow did) and its cleanup only stops the direct PID, not orphaned Playwright/Chromium children [scripts/scrape-dutchie-local.ps1] — fixed: logs both uvicorn streams on failure; cleanup now uses `taskkill /T /F` to kill the whole process tree.
- [x] [Review][Patch] Duplicate `import` of `DEFAULT_PRODUCTS_DB_PATH` from `productsDb.js` in two separate statements [server/scripts/importProductsToSqlite.ts] — fixed: combined into one import statement.
- [x] [Review][Defer] `DEFAULT_PRODUCTS_DB_PATH` code-level fallback lives inside the git worktree, contradicting the "always outside the worktree" invariant [server/utils/productsDb.ts] — deferred, pre-existing: all three shipped `.ps1` runners always pass `PRODUCTS_DB_PATH` explicitly, so this default is never hit through the real operational path
- [x] [Review][Defer] Whole-table `SELECT *` on every derive run reproduces unbounded memory growth, just moved from Render to the home machine [server/utils/productsDb.ts:298-330] — deferred, pre-existing: story's own Dev Notes explicitly scope time-range indices/hardening to Phase 2
- [x] [Review][Defer] No alerting on runner heartbeat files / Scheduled Task silent failure [scripts/*-local.ps1] — deferred, pre-existing: already tracked as its own backlog story `derivation-1-8-derivation-run-freshness-health-alerting`
- [x] [Review][Defer] Push-retry logic can't distinguish a real git conflict from a persistent auth/network failure, silently retrying forever [scripts/derive-facts-local.ps1, scripts/scrape-dutchie-local.ps1] — deferred, pre-existing: same pattern already shipped in `scrape-weedmaps-local.ps1`, not introduced by this diff
- [x] [Review][Defer] Lock-acquisition TOCTOU race (Test-Path + Set-Content, not atomic) and Windows PID-reuse false-positive on stale-lock detection [scripts/*-local.ps1] — deferred, pre-existing: inherited from the already-shipped `scrape-weedmaps-local.ps1` pattern, low real-world probability given staggered cron scheduling
- [x] [Review][Defer] `PRODUCT_KEY`'s `::` separator has no collision guard against IDs containing the literal substring [server/utils/productsDb.ts:37] — deferred, theoretical: dispensaryId is internally controlled, productId is empirically alphanumeric/UUID-like in both source APIs

## Dev Notes

### Files to touch (all read at implementation time — grounded)
- `server/routes/valueRoute.ts` — **current state:** `disparitiesRoute` computes `buildMatchReport(readProducts())` live (line 22); `dealScopeRoute` computes `buildDealScopeLinks({dispensaries: readDispensaries()}, readProducts())` live (line 51); both fail-soft to 500 on throw. **Change:** read `server/data/derived/*.json` instead of computing. **Preserve:** the private/internal posture, the audit-count payload shape (consumers read `MatchReport`/`DealScopeReport` verbatim), fail-soft.
- `server/utils/productsStore.ts` — `readProducts()` (line 30) is the current JSON reader, fail-soft to `emptyFile()`. The new DB reader mirrors this posture. `applyProductObservations`/`persistProductObservations` are the append-only write path — the **local scrape** now writes to SQLite instead of (or in addition to, during a bridge) this file. Do NOT change the deals-side write path.
- `server/routes/productsRoute.ts` — currently ships the entire blob (`res.json(readProducts())`). Fate = open decision #2.
- `server/utils/crossStoreValue.ts` (`buildMatchReport(file: ProductsFile): MatchReport`, line 71) and `server/utils/dealScope.ts` (`buildDealScopeLinks(...)`, line 183) — **pure, input = `ProductsFile`. DO NOT modify them.** The whole point of the DB-backed reader is that these stay byte-identical; that is what makes the parity test meaningful.
- `server/types/index.ts` — `ProductRecord` (line 105), `ProductsFile` (line 125), `MatchReport`, `DealScopeReport`. **Untouched** (ADR-077 non-negotiable: types unchanged).
- `scripts/scrape-weedmaps-local.ps1` — the template for the new `derive-facts-local.ps1`. Reuse the clean-base hard-reset (avoids the rebase-wedge → truncation incident, see [[project_ai-search-data-strategy]] Phase 3 note).

### Non-negotiables / invariants (from ADR-077 + corpus memos)
- **Deals pipeline untouched** — `data.json`, `/api/data`, `filterActiveDeals`, ADR-043/053 Deal↔Product decoupling preserved.
- **Full raw history preserved — no pruning.** The asset is the whole point (feeds derivation D6 + Phase-4).
- **Honesty gates run at derivation, behavior-identical** (fix6, `EXCLUDED_FLAGS`, Gates 1–5).
- **Render never queries the home DB.** The load-bearing rule. Derived files only.
- **Not a contradiction of ADR-033** — that is *paid* Docker self-host; this is *free* local self-host of a data file.
- **Additive/decoupled** — new modules under `server/scripts/` + `server/utils/`, new derived files. Mirrors ADR-053.

### Corpus reconciliation notes to absorb (from the two 2026-07-06 scope memos)
1. **Storage move + derivation-engine PRD are ONE coupled program.** Design `observation.observedAt` indexing for the derivation engine's time-range queries *now* (AC2). Cheap here, expensive to retrofit. Winston should see the schema before it freezes.
2. **Gappy time series is a schema-and-derivation requirement, not just an analytics caveat.** The runner must be able to distinguish "no observation that day" from "observed, unchanged" — a property of how observations are keyed/queried. `(product_key, observedAt)` provides it; write the gap-tolerance rule into the derivation runner's contract, not just future analytics.
3. **Phase-2 checkpoint (NOT this story, but log it):** before "one machine owns all raw data" (Phase 2), confirm the residential Weedmaps runner fires reliably at full nightly volume and resolve the `caravan-cannabis-burlington` suspected **silent extraction failure** (empty menu vs. broken parser) — moving fully local without fixing it would bake a silent hole into the raw asset.

### Testing standards
- TypeScript strict mode; write tests for everything (project rule).
- Server test suite (vitest) must stay green; add the AC8 parity test into it.
- **Run the real production build before anything auto-deploys** — `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest. The Render build can fail while the quick checks pass ([[feedback_run-production-build-before-deploy]]). Confirm the SQLite driver never enters the client bundle.

### Definition of "done with the deadline"
Phase 0 shipped (separate track) **and** this story's AC6 merged (`products.json` out of git, derived files served, raw in local SQLite with one backup taken) — **before ~2026-07-23.**

### References
- [Source: _bmad-output/implementation-artifacts/plans/products-storage-local-sqlite-plan.md] — the full plan, all phases, open decisions.
- [Source: _bmad-output/implementation-artifacts/plans/storage-rearchitecture-scope-2026-07-06.md] — corpus validation + 3 reconciliation notes.
- [Source: _bmad-output/implementation-artifacts/plans/derivation-engine-prd-scope-2026-07-06.md] — the downstream program this substrate unblocks (Tier 1 = first PRD epic).
- [Source: ADR.md#ADR-077] — decision of record; update on completion.
- [Source: server/routes/valueRoute.ts:22,51] — the two serialize-points that become file reads.
- [Source: server/utils/productsStore.ts:30] — `readProducts` fail-soft posture to mirror in the DB reader.
- [Source: scripts/scrape-weedmaps-local.ps1] — the residential-runner template for `derive-facts-local.ps1`.

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (Claude Code, bmad-dev-story)

### Debug Log References
- Migration parity (real 21.7 MB file): 5,219 records / 33,169 observations both sides; 0 duplicate `(product_key, observedAt)` pairs (UNIQUE index safe).
- Report parity (real file): `buildMatchReport(DB)` byte-equals `buildMatchReport(JSON)` → 228 disparities, excluded 568, nonComparable 510, unmatched 1; `buildDealScopeLinks` byte-equal. Matches live `/api/value/disparities` (228) exactly.
- `npm run build` (client + server): first pass surfaced a strict-mode error — a value-returning `persist` sink is not assignable to a `void | Promise<void>` union (TS void-widening applies only to bare `void`); fixed by typing the sink return as `unknown`. Second pass clean.
- Server suite: 449 tests / 37 files green (459 / 39 after the 2026-07-07 review-fix pass).

### Completion Notes List
- **Driver:** `node:sqlite` (built-in) chosen over `better-sqlite3` — decision documented in ADR-077 + story task 1.
- **Zero-loss migration (AC1):** proven against the live file, not the stale audit-time estimates (5,090/29,669/217 were superseded by 5,219/33,169/228).
- **Schema (AC2):** UNIQUE `(product_key, observedAt)` = the per-store/per-day presence key + integrity guard; denormalized `dispensaryId` on `observation` with `(dispensaryId, observedAt)` index for the derivation engine's regional/time-range facts; `observedAt` index for whole-corpus facts. Reconstruction preserves insertion order → `history.at(-1)` faithful, gap-tolerant.
- **Seam (AC3):** pure functions untouched; the only change is their input source. Honesty gates (1–5, `EXCLUDED_FLAGS`, fix6) run at derivation, behaviour-identical.
- **Routes (AC5):** fail-soft to empty report on missing/malformed derived file — never throws, never opens the home DB (the load-bearing rule).
- **AC6 executed end-to-end** (Erik authorized this session): backups first, `git rm products.json`, `scrape-products.yml` retired.
- **AC7:** both scrape runners feed the DB via an injectable sink; three local `.ps1` runners + runbook.
- **Open decisions resolved with Erik:** #1 Dutchie fully local · #2 `/api/products` dropped entirely (route + test removed) · #3 deal-scope precomputed daily.
- **Operational first-run DONE — verified live 2026-07-11:** all four `GmaS` Scheduled Tasks registered and `Ready` (Dutchie 03:00, Weedmaps 03:30, Derive 04:00, Store Link Check); all three ingest tasks ran this morning with result 0x0 and fresh `last-success.txt` heartbeats; `products.db` at 26 MB / 6,143 products / 46,275 observations (from 5,219/33,169 at import), 24 stores contributed 3,580 observations on 2026-07-11; derive committed `636a3c9` at 04:00 today; `products.json` confirmed gone from git index. The git 50MB deadline is dead. Runbook: `docs/products-local-sqlite-ingest.md`.
- **Phase-2 flag logged:** resolve `caravan-cannabis-burlington` suspected silent-extraction failure before "one machine owns all raw data."

### File List
New:
- `server/utils/productsDb.ts` — SQLite substrate: schema, import, append-only feed, `readProductsFile` seam
- `server/utils/productsDb.test.ts` — round-trip fidelity + parity + append tests
- `server/scripts/importProductsToSqlite.ts` — one-time zero-loss migration CLI
- `server/scripts/deriveFactsRun.ts` — local derivation runner (DB → derived JSON)
- `server/data/derived/disparities.json`, `server/data/derived/deal-scope.json` — committed derived facts (served by Render)
- `scripts/derive-facts-local.ps1` — commit-back derivation orchestration
- `scripts/scrape-dutchie-local.ps1` — Dutchie feeder (boots local scraper-svc → DB)
- `docs/products-local-sqlite-ingest.md` — runbook

Modified:
- `server/routes/valueRoute.ts` — read derived files, fail-soft (no request-time compute); review-fix: `readDerived` shape validation
- `server/routes/valueRoute.test.ts` — fail-soft coverage; review-fix: wrong-shape/array test cases
- `server/index.ts` — dropped `/api/products` route + import
- `server/scripts/scrapeProductsRun.ts`, `server/scripts/scrapeWeedmapsRun.ts` — injectable DB persist sink; CLIs append to `products.db`
- `server/scripts/scrapeProductsRun.test.ts` — DB persist wiring test
- `server/utils/crossStoreValue.audit.test.ts` — rebased onto committed derived file; review-fix: null-guard the remaining `it()` blocks
- `server/utils/productsDb.ts` — review-fix: WAL/busy_timeout, `mkdirSync` parent dir, `readProductsFromDbPath` throws instead of swallowing, `appendObservations` metadata-clobber guard
- `server/utils/productsDb.test.ts` — review-fix: deal-scope parity test (AC8 gap), metadata-clobber-guard test
- `server/scripts/importProductsToSqlite.ts` — review-fix: `--force` guard against destructive re-import, combined duplicate import
- `server/scripts/deriveFactsRun.ts` — review-fix: zero-collapse regression guard before overwriting derived facts
- `scripts/scrape-weedmaps-local.ps1` — rewired from JSON commit-back to DB append
- `scripts/scrape-dutchie-local.ps1` — review-fix: surface uvicorn logs on health-check failure, kill process tree on cleanup
- `.gitignore` — ignore `products.db`
- `ADR.md` — ADR-077 Phase 1 status + schema/driver/decisions + change log

New (review-fix):
- `server/scripts/deriveFactsRun.test.ts` — regression-guard tests
- `server/scripts/importProductsToSqlite.test.ts` — `--force` guard tests

Deleted:
- `server/data/products.json` — the file-size wall (backed up to `~/GmaS-data/` first)
- `server/routes/productsRoute.ts`, `server/routes/productsRoute.test.ts` — `/api/products` dropped
- `.github/workflows/scrape-products.yml` — raw commit-back retired (Dutchie fully local)

### Change Log
- 2026-07-06 — ADR-077 Phase 1 implemented: products dataset → local SQLite; derived facts served; `products.json` out of git (wall killed); `/api/products` dropped; Dutchie/Weedmaps feed the DB. 449 server tests green; build clean.
- 2026-07-07 — Code review (3-layer adversarial): 10 patch findings fixed (derivation fail-soft data-loss risk, missing AC8 deal-scope parity test, destructive importer re-run, no WAL/busy_timeout, `readDerived` shape validation, audit-test null crash, metadata-clobber on duplicate retry, missing first-run mkdir, uvicorn log/process-tree cleanup, duplicate import), 6 deferred (pre-existing patterns / already-tracked backlog items), 5 dismissed as noise after verification. 459 server tests green (+10); `npm run build` clean (client + server).
