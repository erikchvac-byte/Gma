# Story: ADR-077 Phase 1 — Products dataset → local SQLite substrate (kill the git wall)

Status: ready-for-dev

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

- [ ] **Pick the SQLite driver** (AC: 1,2) — prefer `better-sqlite3` (synchronous, fits the pure-function/CLI derivation shape) unless Erik/Winston prefer `node:sqlite`. Node-only dependency, never bundled into the Render request path. Verify it does not enter the client build.
- [ ] **Schema + importer** `server/scripts/importProductsToSqlite.ts` (AC: 1,2)
  - [ ] Define `product` + `observation` tables + indices (AC2). Get Winston's eyes on the schema before freezing (coupling note #1).
  - [ ] Import current `products.json`; assert record/observation counts equal source; re-runnable.
- [ ] **DB-backed reader** `server/utils/productsDb.ts` (AC: 3) — returns the same `ProductsFile` shape `buildMatchReport`/`buildDealScopeLinks` already consume, so the pure functions stay untouched. This is the seam.
- [ ] **Derivation runner** `server/scripts/deriveFactsRun.ts` (AC: 3) — read DB → build both reports → write `server/data/derived/{disparities,deal-scope}.json`.
- [ ] **Orchestration** `scripts/derive-facts-local.ps1` (AC: 4) — clone the `scrape-weedmaps-local.ps1` structure exactly (worktree, hard-reset, run, `[skip ci]` commit-back of derived only, push).
- [ ] **Repoint routes** `server/routes/valueRoute.ts` (AC: 5) — read derived files, fail-soft; drop the request-time `buildMatchReport`/`buildDealScopeLinks` calls. Keep `readDispensaries` only if deal-scope stays live (open decision #3).
- [ ] **Kill the wall** (AC: 6) — take backups first; `git rm server/data/products.json`; amend `scrape-products.yml` to stop raw commit-back.
- [ ] **Feed the DB** (AC: 7) — Weedmaps local → SQLite; Dutchie per open decision #1.
- [ ] **Parity test** `server/**/*.test.ts` (AC: 8) — DB-derived reports == pre-migration live values; wire into the server suite so CI guards it.
- [ ] **Update ADR.md** — move ADR-077 status note from "direction approved, not yet built" to reflect Phase 1 landed; record schema + driver decision and the resolved open decisions.

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

### Debug Log References

### Completion Notes List

### File List
