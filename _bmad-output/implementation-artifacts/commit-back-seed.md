---
baseline_commit: e63806c7462b20371032003aedd2df658c551143
---

# Story: Commit-Back Seed — Durable Live Data Across Render Deploys

Status: done

<!-- Cross-cutting follow-up story (no parent epic). Origin: Correct-Course 2026-06-22.
     Sprint Change Proposal: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-22.md
     Investigation: _bmad-output/implementation-artifacts/investigations/stale-last-updated-and-unavailable-count-investigation.md -->

## Story

As the operator of gmaslist.com,
I want the scrape-ingest pipeline to commit the freshly scraped `data.json` back to `master` as the seed,
so that Render's ephemeral-disk reset on every redeploy lands on **recent** data instead of the frozen 2026-06-14 seed, and the "Last updated" / "N sources unavailable" UI stops flip-flopping after each deploy.

## Context (why this story exists)

**Confirmed root cause (High):** The UI renders `data.meta.lastScraperRun` (`client/src/components/DealFeed.tsx:113`) and the count of `stale===true` stores (`DealFeed.tsx:93`) straight from `data.json`. Render's disk is **ephemeral**, so every redeploy resets `server/data/data.json` to the **committed seed**, which is frozen at `lastScraperRun=2026-06-14T16:28:05.534Z` with 17 epoch-seeded `stale:true` stores. The push-triggered re-scrape (PR#24) does **not** save prod because it loses the deploy cutover race — PR#28's run logged `[ingestRun] …: ok` at 16:16:10, then the same run's alert-gate read prod `fresh=0/21` 35s later (the redeploy cut over and discarded the ingest). Scheduled crons then only fire ~every 6h, so prod sits frozen for hours after each deploy.

**The fix (approved option 1c):** keep the committed `data.json` continuously fresh by committing the merged scrape result back to `master`. The ephemeral reset then restores a recent seed → deploys become non-destructive.

## Acceptance Criteria

1. **Commit source is the in-CI `applyIngest` merge — NOT `GET /api/data`.** The committed seed is produced by running the existing `applyIngest()` over the per-store scraped `Deal[]` against the checked-out `server/data/data.json`. **Do NOT source the seed from `GET /api/data`**: `dataRoute.ts:21` pipes deals through `filterActiveDeals` (`server/utils/filterActiveDeals.ts:33`), which drops any deal not active at the request instant (out-of-window happy hours, wrong-weekday deals). Committing that view back would silently delete those deals from the seed.
2. **No active deal in the stored set is lost across a commit-back cycle.** A deal present in `data.json` before a run (and not replaced by a fresh scrape) is still present after — `applyIngest`'s "never overwrite good data with empty" semantics are preserved (empty scrape → store flagged `stale`, prior `deals`/`lastFetchedAt` untouched).
3. **A new `commit-back` job** in `.github/workflows/scrape-ingest.yml` runs after the `scrape` matrix (`needs: scrape`, `if: always()`), reads git not prod (deploy-independent), and commits the updated `server/data/data.json` to `master` **only if the file changed**, with message `chore(data): refresh seed [skip ci]`.
4. **Loop prevention is airtight in-repo.** The workflow's `push` trigger gains `paths-ignore: ['server/data/data.json']` so the data commit cannot re-trigger scrape-ingest. `[skip ci]` is included as defense-in-depth. (Render "Ignored Paths" is an optional, Erik-owned optimization — NOT implemented here and NOT required for correctness.)
5. **Concurrent-push safe & non-fatal.** Before pushing, the job does `git pull --rebase origin master` (one retry on push rejection). The job is `continue-on-error: true` so a transient git failure never reds the run — `alert-gate` (`server/scripts/alertGate.ts`) remains the SOLE alert per ADR-034 §6.
6. **Permissions:** the workflow grants `contents: write` (the commit-back job needs push). Other jobs keep least privilege where practical.
7. **Per-store `POST /api/ingest` is unchanged** — it still runs in each `scrape` matrix job for immediate live refresh between deploys. A single scrape feeds both the POST and the artifact (no double-scrape).
8. **ADR-047** added to `ADR.md` documenting the decision, the `applyIngest`-not-`/api/data` correction, the in-repo loop-breaker, and that this supersedes PR#24's push-re-scrape as the durability mechanism (push trigger retained only for immediate refresh). Change log updated.
9. **Verification:** full server test suite + `npm run build` (client `tsc -b && vite build` + server `tsc`) green. New unit tests cover `commitBackSeed` merge correctness and the AC2 no-loss invariant.

## Out of Scope (do NOT do)

- Lowering the ~11–12 genuinely-unresolved Dutchie `stale` stores (unresolved embed cNames) — separate ADR-043/coverage track. This story makes "N unavailable" **stick at the true floor** instead of resetting to 17 each deploy; it does not lower the floor.
- Changing the `accepted>0` guard at `server/utils/applyIngest.ts:59` — it is **correct** ("Last updated" should reflect when data last truly changed). Commit-back re-commits the live `lastScraperRun`, which fixes the visible frozen-date symptom without touching the guard.
- Any Render dashboard / infra change (Erik-owned, optional).

## Tasks / Subtasks

- [x] **Task 1 — Emit scraped entry as an artifact source (AC1, AC7)**
  - [x] In `server/scripts/ingestRun.ts`, add an opt-in (env `INGEST_EMIT_DIR` or `--emit <dir>` flag) that, after `entries` are built (post-`normalizeDeals`, line ~94), writes each `IngestEntry` to `<dir>/<dispensaryId>.json`. Keep the existing POST behavior unchanged; emit is additive and only active when the flag/env is set. → emit runs BEFORE the POST so a POST failure still leaves the seed.
  - [x] Unit test: with emit set, the file is written with the normalized `IngestEntry` shape `{ dispensaryId, deals }`; without it, no file and behavior is identical to today. → +5 tests incl. emit-before-POST + `parseEmitDir`.
- [x] **Task 2 — `commitBackSeed.ts` merge script (AC1, AC2)**
  - [x] New `server/scripts/commitBackSeed.ts` (run via `tsx`): reads a dir of `<store>.json` `IngestEntry` artifacts + the checked-out `server/data/data.json` path, builds `IngestEntry[]`, calls existing `applyIngest(entries, dataPath)` (reuse — do not reimplement the merge). Exits 0; ignores unknown/empty dirs gracefully (logs, no throw).
  - [x] Unit tests: (a) a fresh non-empty scrape replaces a store's deals + sets `stale:false`; (b) **AC2 invariant** — an empty entry for a store with existing deals leaves those deals + `lastFetchedAt` intact and flips `stale:true`; (c) a store absent from the artifacts is untouched; (d) deals NOT currently in their time window survive the merge (the regression `GET /api/data` would have caused). → (d) uses a 02:00–03:00 happy hour proven dropped by `filterActiveDeals(noon)` yet kept by the merge.
- [x] **Task 3 — Workflow wiring (AC3, AC4, AC5, AC6, AC7)**
  - [x] `permissions: contents: write`.
  - [x] `push` trigger → add `paths-ignore: ['server/data/data.json']`.
  - [x] `scrape` matrix job: pass `INGEST_EMIT_DIR` (e.g. `out`) to the `Scrape & ingest` step, then `actions/upload-artifact@v4` for `server/out/<store>.json` (unique artifact name per store). → upload step is `if: always()` (load-bearing: POST failure exits non-zero, would skip upload) + `if-no-files-found: ignore`.
  - [x] New `commit-back` job (`needs: scrape`, `if: always()`, `continue-on-error: true`): checkout master (`fetch-depth: 0`) → `actions/download-artifact@v4` (merge all) → `npx tsx scripts/commitBackSeed.ts --in out` (working-directory: server) → if `git status --porcelain server/data/data.json` shows a change: bot identity, `git add server/data/data.json`, commit `chore(data): refresh seed [skip ci]`, `git pull --rebase origin master`, push (retry once; permanent failure → `::warning::`, never reds).
  - [x] Decide trigger scope: commit-back runs on `schedule` + `workflow_dispatch` + `push` (safe on all — it reads git, not prod). Documented in a workflow comment.
- [x] **Task 4 — ADR-047 + change log (AC8)**
- [x] **Task 5 — Verify (AC9):** `npm test` (server) + `npm run build`; confirm green; manual reasoning note that on next real deploy `/api/data` `lastScraperRun` will be recent.

## Dev Notes

### Files to touch

- **`.github/workflows/scrape-ingest.yml`** (UPDATE). Current state: `permissions: contents: read`; triggers `schedule: '0 * * * *'`, `push: branches:[master]`, `workflow_dispatch`; `concurrency: scrape-ingest` (serialized, `cancel-in-progress:false`); `prepare` (matrix from `printStores.ts`) → `scrape` matrix (`continue-on-error:true`, boots Python for Dutchie, runs `ingestRun.ts --store X`, POSTs to `https://gmaslist.com/api/ingest`) → `alert-gate` (`needs:scrape, if:always()`, runs `alertGate.ts` against prod `/api/data`). **Preserve:** all of that — the new job and trigger guard are additive; alert-gate stays the sole alert; concurrency group already serializes commit-backs so they can't race each other.
- **`server/scripts/ingestRun.ts`** (UPDATE). Current state (read in full): `runIngest()` builds `entries: IngestEntry[]` via `normalizeDeals(await scrape())` (line ~93), then `postFn` POSTs `{ stores: entries }` to `/api/ingest`; `main()` reads `INGEST_URL`/`INGEST_SECRET`, parses `--store`, exits `ok?0:1`. **Preserve:** POST path, exit semantics (ADR-034 §6 — `stale` is acceptable, only real errors flip `ok=false`), the `withTimeout` backstop. Emit is a pure additive side-write of the already-built `entries`.
- **`server/scripts/commitBackSeed.ts`** (NEW). Reuses `applyIngest` from `server/utils/applyIngest.ts`.
- **`ADR.md`** (UPDATE) — ADR-047.

### Reuse — do NOT reinvent

- **`server/utils/applyIngest.ts`** is the merge. Signature `applyIngest(entries: IngestEntry[], dataPath?: string): Promise<Record<string,IngestResult>>`. It: matches each entry to an existing dispensary by `id` via `.find` (prototype-pollution-safe; unknown id → `'unknown'`, never created); `normalizeDeals(entry.deals)`; if `deals.length>0` → replace `deals`, set `lastFetchedAt=now`, `stale=false`, `accepted++`; else → set `stale=true`, leave deals/`lastFetchedAt` intact (last-known-good); bumps `meta.lastScraperRun=now` only if `accepted>0`; serialized via `withDataLock`, published via `atomicWriteJson`. This is exactly the live server's behavior — using it makes the committed seed byte-equivalent to the disk. **This is the linchpin of AC1/AC2.**
- **Types:** `IngestEntry = { dispensaryId: string; deals: Deal[] }`, `IngestResult` (`'ok' | 'stale' | 'unknown'`) in `server/types/index.ts`. `normalizeDeals` in `server/utils/normalizeDeals.ts` is the sanitization/validation chokepoint (ADR-035) — already applied inside `applyIngest`, so re-normalizing emitted entries is harmless/idempotent.

### The critical correctness point (why this story was re-designed mid-review)

`GET /api/data` is a **time-filtered projection**, not the stored set: `dataRoute.ts:21` → `filterActiveDeals(dispensaries, now)` (`filterActiveDeals.ts:33`) drops every deal where `isDealActive(deal, now)` is false — a later-today happy hour, a future-start deal, or a deal not valid on today's weekday. Sourcing the commit from `/api/data` would round-trip that lossy view into the source of truth and **progressively delete** real deals (worst for the time-windowed deals the app is built to grow into). The in-CI `applyIngest` merge avoids this entirely AND removes any dependency on reading prod at a quiet (non-cutover) moment. **If you find yourself reading `/api/data` to build the seed, stop — that's the rejected design.**

### Loop prevention reasoning

The commit→scrape→commit loop is broken **in-repo** by `paths-ignore: ['server/data/data.json']` on the `push` trigger — fully in our control. `[skip ci]` is backup. A Render deploy never creates a commit, so even if a data commit did trigger a deploy (Render "Ignored Paths" unset), the worst case is **one harmless extra deploy** that resets the disk onto the just-committed fresh seed — not a loop. Do not gate the design on the unreadable Render dashboard setting.

### Testing standards

- Server tests are vitest (`server/**/*.test.ts`); pure functions take `now`/paths as params (ADR-026 pattern) — `commitBackSeed` tests should use a temp `data.json` fixture and injected entry dirs, asserting the merged file contents. Mirror `server/utils/applyIngest.test.ts` and `server/integration/ingestFreshness.test.ts` style. Keep `now`-determinism. TypeScript strict mode; write tests for everything (project rule).

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-22.md] — approved design, Section 4 change list + Section 5 success criteria.
- [Source: _bmad-output/implementation-artifacts/investigations/stale-last-updated-and-unavailable-count-investigation.md] — Findings 1–6, the cutover-race evidence.
- [Source: server/utils/applyIngest.ts] — the merge to reuse (AC1/AC2 linchpin).
- [Source: server/utils/filterActiveDeals.ts:33 + server/routes/dataRoute.ts:21] — why `/api/data` is lossy (AC1).
- [Source: server/scripts/ingestRun.ts] — emit hook site (Task 1); ADR-034 §6 exit semantics to preserve.
- [Source: .github/workflows/scrape-ingest.yml] — job graph, concurrency, alert-gate to preserve.
- [Source: ADR.md 2026-06-22 entries] — ADR-034 §6 alert semantics; PR#24 push-re-scrape this supersedes.

### Project Structure Notes

- Tracked as a cross-cutting follow-up story (no parent epic), matching `data-hardening` / `compliance-launch-gate` in `sprint-status.yaml`. Story key: `commit-back-seed`.
- New `server/out/` artifact dir is CI-only; add to `.gitignore` if it could appear in local runs.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- Full server suite: **191 passed (21 files)** — up from 177 (+14 new tests across `commitBackSeed.test.ts` and `ingestRun.test.ts`).
- Full production build (`npm run build` = client `tsc -b && vite build` + server `tsc && copyData.mjs`): **EXIT=0**, clean. `data.json` not modified by the build; no `server/out/` artifact left in the tree.
- Branch protection check: `gh api repos/{owner}/{repo}/branches/master/protection` → 404 "Branch not protected" → GITHUB_TOKEN `contents: write` can push directly (no PAT/deploy-key needed).

### Completion Notes List

- **AC1/AC2 (linchpin):** seed is built by `commitBackSeed.ts` → existing `applyIngest` over the per-store scraped `IngestEntry` artifacts, NEVER from `GET /api/data`. Test (d) proves the distinction: a 02:00–03:00 happy-hour deal is dropped by `filterActiveDeals(noon)` but survives the merge. AC2 no-loss invariant covered: empty entry keeps deals + `lastFetchedAt`, flips `stale`, doesn't bump `lastScraperRun`.
- **Advisor-driven hardening:** (1) `if: always()` on the upload-artifact step — without it a POST failure (the deploy-cutover race this story fixes) exits the scrape step non-zero and SKIPS the upload, defeating commit-back in its target case; emit-before-POST is paired with it. (2) Push to master is visible-not-silent on permanent failure (`::warning::`) while staying `continue-on-error`. (3) `.gitignore server/out/`; `git add` scoped to `data.json` only (never `-A`) so artifacts can't break the path-based loop-breaker.
- **Loop-breaker:** `paths-ignore: ['server/data/data.json']` on the `push` trigger (in-repo) + `[skip ci]`. No Render-dashboard dependency.
- **Unchanged (per Out of Scope):** per-store `POST /api/ingest` and its `accepted>0` `lastScraperRun` guard, `alert-gate` as the sole alert. One scrape feeds both the POST and the emitted artifact (no double-scrape).
- **Manual reasoning (AC9):** on the next real deploy, the commit-back job will have already refreshed the committed `data.json`, so Render's ephemeral reset restores a recent seed → `/api/data` `meta.lastScraperRun` is recent and the `stale` count sits at its true floor instead of resetting to 17.

### File List

- `server/scripts/ingestRun.ts` (MODIFIED) — additive `--emit`/`INGEST_EMIT_DIR` emit (before POST); `parseEmitDir`.
- `server/scripts/ingestRun.test.ts` (MODIFIED) — emit + `parseEmitDir` tests.
- `server/scripts/commitBackSeed.ts` (NEW) — artifact-merge seed builder reusing `applyIngest`.
- `server/scripts/commitBackSeed.test.ts` (NEW) — merge correctness + AC2 no-loss + time-inactive-survival + readEntries.
- `.github/workflows/scrape-ingest.yml` (MODIFIED) — `contents: write`, `paths-ignore`, emit env + upload-artifact, new `commit-back` job.
- `.gitignore` (MODIFIED) — `server/out/`.
- `ADR.md` (MODIFIED) — ADR-047 + change-log entry.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED) — story → in-progress → review.
- `_bmad-output/implementation-artifacts/commit-back-seed.md` (MODIFIED) — this story.

### Change Log

| Date | Change |
| --- | --- |
| 2026-06-22 | Implemented commit-back-seed (ADR-047). Emit hook in `ingestRun.ts` (before POST), new `commitBackSeed.ts` reusing `applyIngest`, new `commit-back` workflow job with in-repo `paths-ignore` loop-breaker + `if: always()` upload, ADR-047 + change log. Server suite 191 green (+14); full `npm run build` clean. Status → review. |

---

_Created by create-story (Correct-Course follow-up). Comprehensive context engine analysis completed — the dev agent has the full root cause, the rejected-design guardrail, the reuse target, and the loss-invariant test._
