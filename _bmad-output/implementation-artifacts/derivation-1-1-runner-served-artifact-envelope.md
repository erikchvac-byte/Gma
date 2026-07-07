---
baseline_commit: 7d35445339499f2950356c76e4effceafee14c8e
---

# Story derivation-1.1: Derivation runner + served-artifact envelope

Status: review

## Story

As a **derivation-engine maintainer**,
I want the two already-trusted computations (cross-store disparities, deal-scope links) served wrapped in a uniform **honesty envelope** `{ data, excluded, coverage, generatedAt }`,
so that every served derived artifact is inspectable (FR7) and the pipeline is a proven oracle — with a generic shape future facts (1.3–1.8) and the freshness alert (1.8) can rely on — before any new fact is added.

## IMPORTANT: Scope correction vs. the epics document

`_bmad-output/planning-artifacts/epics-derivation-engine.md` describes Story 1.1 as if the runner + orchestration + served routes don't exist yet. **They already do** — built ahead of schedule inside `products-storage-sqlite-phase-1.md` (Story 1.0, status `done`, merged `cad2b23`/PR#68 + uncommitted 2026-07-07 review-fix patches currently sitting in the working tree — see Dev Notes). Do **not** rebuild any of the following; they are already shipped and must only be extended:

- `server/scripts/deriveFactsRun.ts` — the home-machine runner (reads `products.db`, runs `buildMatchReport`/`buildDealScopeLinks`, writes `server/data/derived/{disparities,deal-scope}.json`).
- `scripts/derive-facts-local.ps1` — the orchestration script (detached worktree, hard-reset, run, commit-back `[skip ci]`, push). Mirrors `scripts/scrape-weedmaps-local.ps1` exactly, already built.
- `server/routes/valueRoute.ts` — `disparitiesRoute`/`dealScopeRoute` already read the derived files fail-soft and never touch the home DB (the load-bearing rule, already satisfied).
- G1 match-key precision — already asserted at the pure-function level (`server/utils/productMatchKey.test.ts`) and transitively proven byte-identical through the DB-backed pipeline (`server/utils/productsDb.test.ts` parity tests for both `buildMatchReport` and `buildDealScopeLinks`). No new G1 test is required; cite the existing coverage.

**The actual net-new scope of this story is narrow: wrap the two existing derived artifacts in the honesty envelope, and update the runner + route layer to write/read that shape.** Nothing about the runner's control flow, the orchestration script, or the pure fact-functions changes.

## Acceptance Criteria

1. **Envelope type + shared helper.** A new additive module defines the honesty envelope type `{ data: T, excluded: ExcludedEntry[], coverage: Record<string, number>, generatedAt: string }` (decision E) and a small helper to construct/validate it. No existing type (`MatchReport`, `DealScopeReport`, `ProductsFile`) is modified.
2. **Disparities wrapped.** `deriveFactsRun.ts` writes `disparities.json` as an envelope whose `data` field holds the **unchanged** `MatchReport` (decision E rationale: the byte-identical oracle lives on the pure `buildMatchReport` function, not the served JSON — this story does not touch that function or its existing parity tests). `excluded[]` restates the report's existing counts (`nonComparableCategoryCount`, `excludedFlagCount`, `unmatchedCount`) as accounting entries; `coverage` restates `totalRecords`/`placedRecords`/disparity count. `generatedAt` is set at write time.
3. **Deal-scope wrapped.** `deriveFactsRun.ts` writes `deal-scope.json` as an envelope whose `data` field holds the unchanged `DealScopeReport`. `excluded[]` restates `unsupportedCategoryCount`/`unresolvedCount`/`zeroMatchCount`; `coverage` restates `totalDeals`/`storewideCount`/`categoryCount`/`linkedSkuCount`/`brandCount`.
4. **Zero-collapse guard still works.** The existing "refuse to overwrite a previously-populated derived file with a zero-record result" guard (added in the 2026-07-07 review-fix pass) is updated to read `previousEnvelope.data.totalRecords` instead of the old top-level `totalRecords` — it must not silently stop working because the shape moved.
5. **Routes serve the envelope.** `valueRoute.ts`'s `disparitiesRoute`/`dealScopeRoute` serve the envelope as-is (no unwrapping) — confirmed safe because zero `client/` references exist to either route's current shape (decision E rationale, already verified in the 1.0 story). `EMPTY_MATCH_REPORT`/`EMPTY_DEAL_SCOPE` become envelope-shaped empty constants (`data` = the existing empty report, `excluded: []`, `coverage: {}`, `generatedAt` = a fixed/deterministic empty-state value — do not use "now" for the empty constant, so fail-soft output stays referentially stable for tests). `readDerived`'s shape validation is updated to check for the envelope's four keys instead of the old flat report keys, while still degrading to the safe empty envelope on missing/unparseable/wrong-shaped files (fail-soft posture, unchanged).
6. **Bounded size.** Wrapping adds a handful of scalar fields; artifacts remain bounded (NFR2) — no new unbounded arrays introduced by the envelope itself.
7. **Regression-safe.** `data.json`, the deals pipeline, `buildMatchReport`, `buildDealScopeLinks`, and every existing type are unchanged (FR3, NFR5). The full server test suite stays green; `npm run build` (client + server) stays clean.

## Tasks / Subtasks

- [x] **Define the envelope type + helper** (AC: 1)
  - [x] New module `server/utils/derivedEnvelope.ts`: `interface ExcludedEntry { reason: string; count: number }`, `interface DerivedEnvelope<T> { data: T; excluded: ExcludedEntry[]; coverage: Record<string, number>; generatedAt: string }`, a `wrapEnvelope<T>(data: T, excluded: ExcludedEntry[], coverage: Record<string, number>): DerivedEnvelope<T>` builder (sets `generatedAt` via `new Date().toISOString()`), and an `isEnvelope<T>(parsed: unknown): parsed is DerivedEnvelope<T>` type guard checking the four top-level keys.
  - [x] Unit tests: `wrapEnvelope` produces the right shape; `isEnvelope` accepts a well-formed envelope and rejects arrays / missing-key objects / a bare (un-enveloped) report.
- [x] **Wrap the disparities artifact** (AC: 2, 4)
  - [x] In `deriveFactsRun.ts`, after `buildMatchReport`, build `excluded[]` from `nonComparableCategoryCount`/`excludedFlagCount`/`unmatchedCount` and `coverage` from `totalRecords`/`placedRecords`/`disparities.length`; write via `wrapEnvelope`.
  - [x] Update `readPreviousTotalRecords` (the zero-collapse guard) to parse the previous file as an envelope and read `.data.totalRecords`; keep the existing "refuse to overwrite" throw behavior and its message.
- [x] **Wrap the deal-scope artifact** (AC: 3)
  - [x] Same pattern: `excluded[]` from `unsupportedCategoryCount`/`unresolvedCount`/`zeroMatchCount`; `coverage` from `totalDeals`/`storewideCount`/`categoryCount`/`linkedSkuCount`/`brandCount`.
- [x] **Update `deriveFactsRun.test.ts`** (AC: 2, 3, 4) — assert both written files are envelope-shaped (`data`/`excluded`/`coverage`/`generatedAt`), assert the zero-collapse guard still fires reading the new shape.
- [x] **Update `valueRoute.ts`** (AC: 5, 6)
  - [x] `EMPTY_MATCH_REPORT`/`EMPTY_DEAL_SCOPE` → envelope-shaped empty constants (renamed to `EMPTY_DISPARITIES_ENVELOPE`/`EMPTY_DEAL_SCOPE_ENVELOPE`; grepped first — only `valueRoute.test.ts` imported the old names, updated alongside).
  - [x] `hasExpectedShape`/`readDerived` validate against the envelope's key set (replaced `hasExpectedShape` with `isEnvelope` from the new module — kept `readDerived` simplest).
  - [x] Routes serve the envelope object directly via `res.json(...)`.
- [x] **Update `valueRoute.test.ts`** (AC: 5) — existing assertions that read `res.body.unmatchedCount`/`res.body.links` etc. directly move to `res.body.data.unmatchedCount`/`res.body.data.links`; fail-soft tests assert the empty envelope shape (plus a new bare-report-rejection case); added assertions that `res.body.generatedAt`/`res.body.excluded`/`res.body.coverage` are present.
- [x] **Check `crossStoreValue.audit.test.ts` and `productsDb.test.ts`** (AC: 7) — verified, not assumed: `productsDb.test.ts` asserts only on pure `buildMatchReport`/`buildDealScopeLinks` return values, unaffected, no change needed. `crossStoreValue.audit.test.ts` DOES read the committed `disparities.json` off disk directly — it broke under the new envelope shape (confirmed by running it before updating), so it was updated to unwrap `.data` before asserting.
- [x] **Full regression + build** (AC: 7) — full server test suite green (468 tests / 40 files, up from the prior 459); `npm run build` (client + server, `tsc -b && vite build` then `tsc && copyData.mjs`) exits clean.

## Dev Notes

### Critical context: uncommitted work already in the tree

`git status` at story-creation time shows **uncommitted local changes** to exactly the files this story touches: `server/scripts/deriveFactsRun.ts`, `server/utils/productsDb.ts`, `server/routes/valueRoute.ts`, `server/routes/valueRoute.test.ts`, `server/utils/crossStoreValue.audit.test.ts`, `server/scripts/importProductsToSqlite.ts`, plus untracked `server/scripts/deriveFactsRun.test.ts` and `server/scripts/importProductsToSqlite.test.ts`. These are the **10 code-review patches from the 2026-07-07 review of Story 1.0** (see `products-storage-sqlite-phase-1.md` Review Findings + Change Log) — they are correct, already-tested prior work, not something to discard or redo. Read the current on-disk content of these files before editing (already done during story creation — see below); build on top of them, don't diff against the last commit (`cad2b23`) as if it were current.

### Files to touch (current state read at story-creation time — grounded)

- `server/scripts/deriveFactsRun.ts` — **current state:** `deriveFacts()` calls `buildMatchReport`/`buildDealScopeLinks`, atomic-writes each report **directly** (no wrapper) to `disparities.json`/`deal-scope.json`. `readPreviousTotalRecords()` reads the previous file's top-level `totalRecords` for the zero-collapse guard. **Change:** wrap both writes; move the guard's read path to `.data.totalRecords`.
- `server/routes/valueRoute.ts` — **current state:** `EMPTY_MATCH_REPORT`/`EMPTY_DEAL_SCOPE` are flat report shapes; `hasExpectedShape`/`readDerived` validate against those flat shapes; routes `res.json()` the flat report. **Change:** envelope-shaped empty constants, envelope-shaped validation, routes serve the envelope. **Preserve:** the fail-soft posture exactly (missing/unparseable/wrong-shaped file → safe empty value, never throws, never reads the home DB).
- `server/utils/crossStoreValue.ts` (`buildMatchReport`) and `server/utils/dealScope.ts` (`buildDealScopeLinks`) — **DO NOT modify.** Pure functions; their existing byte-identical parity tests (`server/utils/productsDb.test.ts`) are the oracle and must keep passing unchanged.
- `server/utils/productsDb.test.ts` — has the AC8 parity tests from Story 1.0 (`buildMatchReport(DB) === buildMatchReport(JSON)`, same for `buildDealScopeLinks`). These compare the **pure function outputs directly**, not the on-disk envelope — should need no changes, but re-run to confirm.
- `server/utils/productMatchKey.ts` / `.test.ts` — where G1 match-key precision is actually tested (trim/pack/numbered-strain guards, ADR-062/063 hardening). Cite, don't duplicate.
- New: `server/utils/derivedEnvelope.ts` (+ `.test.ts`) — the envelope type/helper, additive under `server/utils/` per NFR5.

### Non-negotiables / invariants (from ADR-077 + this epic's decisions)

- Render **never** opens the home DB — already true, unaffected by this story.
- `data.json` / deals pipeline / `filterActiveDeals` / ADR-043/053 Deal↔Product decoupling untouched.
- Pure fact-functions (`buildMatchReport`, `buildDealScopeLinks`) stay byte-identical — only what wraps their output changes.
- Additive only — new module (`derivedEnvelope.ts`), no existing type's behavior changes (NFR5).
- Decision E (Erik, resolved 2026-07-06): uniform wrapper on **every** artifact; disparities' `data` = unchanged `MatchReport`. Chosen over extend-in-place because zero `client/` references exist to either route.
- Decision F (persona/matrix type-gating) does **not** apply to this story — it's a Story 1.5/1.6 concern. Don't add it here.
- G5 (potency) is a non-goal for all of Epic 1, including this story.

### Testing standards

- TypeScript strict mode; tests for everything (project rule).
- Server suite (vitest) must stay green — currently 459 tests / 39 files (per Story 1.0 Debug Log) plus whatever the uncommitted 2026-07-07 patches added; confirm current count when you run it rather than trusting this number.
- **Run the real production build before anything that could auto-deploy** — `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest ([[feedback_run-production-build-before-deploy]]).

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story 1.1] — written AC text (predates the discovery that 1.0 already built the runner/orchestration/routes; this story file supersedes it with the corrected scope above).
- [Source: _bmad-output/implementation-artifacts/products-storage-sqlite-phase-1.md] — Story 1.0, the substrate this story extends; its Dev Agent Record / File List is the ground truth for current file state.
- [Source: server/scripts/deriveFactsRun.ts] — current runner implementation (read in full at story-creation time).
- [Source: server/routes/valueRoute.ts] — current route/read-layer implementation (read in full at story-creation time).
- [Source: server/types/index.ts#DealScopeReport, server/utils/crossStoreValue.ts#MatchReport] — the two report shapes that become envelope `data` payloads, unchanged.
- [Source: ADR.md#ADR-077] — decision of record for the substrate; this story does not need a new ADR entry unless the envelope design changes something architecturally significant (judgment call at implementation time).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via bmad-dev-story.

### Debug Log References

- `npx tsx server/scripts/deriveFactsRun.ts` — real run against the home machine's `server/data/products.db`, regenerated `server/data/derived/{disparities,deal-scope}.json` in the new envelope shape (228 disparities from 5219 records; 13 deal-scope links from 44 deals). Necessary so `crossStoreValue.audit.test.ts`, which reads the committed file off disk, exercises the real new shape rather than a stale flat one.
- `npx vitest run server --exclude '**/dist/**'` — 468 tests / 40 files, all green. (`server/dist/**` carries stale pre-existing compiled test output unrelated to this story — those failures reproduce on a plain `npx vitest run server` before any change here and are excluded per the standing pattern of testing source, not `dist`.)
- `npm run build` — clean exit (client `tsc -b && vite build`; server `tsc && node scripts/copyData.mjs`).

### Completion Notes List

- Added `server/utils/derivedEnvelope.ts` (+ `.test.ts`): `ExcludedEntry`, `DerivedEnvelope<T>`, `wrapEnvelope`, `isEnvelope`. Purely additive — no existing type touched.
- `deriveFactsRun.ts`: both `disparities.json` and `deal-scope.json` are now written via `wrapEnvelope`, with `excluded[]`/`coverage` restating each report's own existing counts (no new computation). `readPreviousTotalRecords` (zero-collapse guard) now reads `.data.totalRecords` off the envelope; guard behavior and its throw message are unchanged.
- `valueRoute.ts`: `EMPTY_MATCH_REPORT`/`EMPTY_DEAL_SCOPE` renamed to `EMPTY_DISPARITIES_ENVELOPE`/`EMPTY_DEAL_SCOPE_ENVELOPE`, now envelope-shaped with a **fixed** `generatedAt` (`new Date(0).toISOString()`, not "now") so fail-soft output stays referentially stable. `hasExpectedShape` was replaced by `isEnvelope` from the new module. Both routes serve the envelope object as-is via `res.json(...)` — no unwrapping, matching decision E (zero `client/` references exist to either route).
- Pure functions `buildMatchReport`/`buildDealScopeLinks`, `data.json`, the deals pipeline, and every existing type (`MatchReport`, `DealScopeReport`, `ProductsFile`) are byte-for-byte unchanged — confirmed via the untouched `productsDb.test.ts` DB/JSON parity tests, which stayed green without modification.
- `crossStoreValue.audit.test.ts` reads the **committed** `disparities.json` directly (not a pure-function return value) — this was not called out as a required edit in the task list, but running the suite before updating it proved it breaks under the new shape (`Cannot read properties of undefined`). Updated to unwrap `.data` before asserting; this is the honest verification the task list's "verify, don't assume" instruction asked for.
- No new ADR entry: nothing architecturally significant changed beyond what ADR-077 already covers (envelope is an additive wrapper, not a new architectural decision).
- Server suite: 459 → 468 tests (40 files, all green). Full production build (`npm run build`) clean.

### File List

- `server/utils/derivedEnvelope.ts` (new)
- `server/utils/derivedEnvelope.test.ts` (new)
- `server/scripts/deriveFactsRun.ts` (modified)
- `server/scripts/deriveFactsRun.test.ts` (modified — pre-existing uncommitted file from Story 1.0, extended here)
- `server/routes/valueRoute.ts` (modified)
- `server/routes/valueRoute.test.ts` (modified)
- `server/utils/crossStoreValue.audit.test.ts` (modified)
- `server/data/derived/disparities.json` (regenerated — envelope-shaped, real data)
- `server/data/derived/deal-scope.json` (regenerated — envelope-shaped, real data)

Untouched (verified, not modified): `server/utils/crossStoreValue.ts`, `server/utils/dealScope.ts`, `server/utils/productsDb.ts`, `server/utils/productsDb.test.ts`, `server/utils/productMatchKey.ts`/`.test.ts`, `server/scripts/importProductsToSqlite.ts`/`.test.ts` (these last four carry pre-existing uncommitted Story 1.0 review-fix patches, not touched by this story).

## Change Log

- 2026-07-07: Story implemented — honesty envelope `{data, excluded, coverage, generatedAt}` added and wired through `deriveFactsRun.ts` (write path) and `valueRoute.ts` (read/serve path); zero-collapse guard updated to the new shape; `crossStoreValue.audit.test.ts` updated after verifying it reads the committed file off disk. 468 server tests green; production build clean. Status → review.
