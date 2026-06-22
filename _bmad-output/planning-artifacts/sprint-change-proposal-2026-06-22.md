# Sprint Change Proposal — Persist live data across deploys (commit-back seed)

**Date:** 2026-06-22 · **Author:** Erikc (via Correct-Course) · **Mode:** Incremental
**Scope class:** Moderate (CI workflow + small server script + ADR; one optional infra toggle)
**Source investigation:** `_bmad-output/implementation-artifacts/investigations/stale-last-updated-and-unavailable-count-investigation.md`

---

## Section 1 — Issue Summary

Production renders a frozen **"Last updated Jun 14, 9:28 AM"** and **"17 sources unavailable,"** updating only intermittently.

**Root cause (Confirmed, High).** The UI reads both strings straight from `data.json` (`DealFeed.tsx:113` timestamp, `:93` stale-count). Render's disk is **ephemeral**, so every redeploy resets `data.json` to the **committed seed**, which is frozen at `lastScraperRun=2026-06-14T16:28Z` with 17 epoch-seeded `stale:true` stores. The push-triggered scrape-ingest meant to repopulate it (PR#24) **loses the cutover race** — PR#28's run logged `ingestRun: ok` at 16:16:10, then the same run's alert-gate read prod `fresh=0/21` 35 s later (the redeploy cut over and discarded the ingest). Repopulation then waits for a GitHub *scheduled* cron, which fires ~every 6 h (not the configured hourly), so prod sits frozen for hours after each deploy. Three pushes today each re-froze it — that is the "intermittent."

## Section 2 — Impact Analysis

- **Epic impact:** None to scope. This is an operational/durability defect in the ADR-034 ingest pipeline, not a feature change.
- **Story/artifact impact:** New ADR **ADR-047**. Amends the 2026-06-22 ADR-034 note (PR#24 "repopulate prod on deploy") — that push-trigger is now known **insufficient** (loses the cutover race); commit-back replaces it as the durability mechanism.
- **Technical impact:** `.github/workflows/scrape-ingest.yml` (new job + trigger guard + permission), one new server-side merge script reusing `applyIngest`, optional `ingestRun` tweak to emit scraped `Deal[]` as an artifact. One optional Render dashboard toggle (Ignored Paths).
- **What this does NOT fix:** the ~11–12 genuinely-unresolved Dutchie stores (unresolved embed cNames) stay `stale`. Commit-back makes "N unavailable" **stick at the true floor** instead of resetting to 17 each deploy, but lowering the floor is the separate ADR-043/Dutchie-coverage track.

## Section 3 — Recommended Approach

**Direct Adjustment — commit the scraped result back to `master` as the seed** (Erik's selected option 1c).

The cron keeps the committed `data.json` current; the ephemeral-disk reset then lands on a **recent** seed instead of the frozen Jun-14 one. Deploys become non-destructive. Free, no DB, no data-layer rewrite.

**Critical design correction (caught in review):** the commit source must be the **full stored set**, not `GET /api/data`. `dataRoute` runs deals through `filterActiveDeals` first (`dataRoute.ts:21`, `filterActiveDeals.ts:33`), which drops any deal not active *at the request instant* (out-of-window happy hours, wrong-weekday deals). Committing that lossy view back would **silently delete** those deals from the seed. Instead, reuse the proven `applyIngest` merge in CI against the checked-out `data.json` — byte-identical to the server's disk, tested logic, and **no prod read** (eliminates cutover-read risk entirely).

**Loop prevention (airtight in-repo; dashboard optional):** the data commit must not re-trigger the pipeline.
- **Primary (in our control):** `paths-ignore: ['server/data/data.json']` on the workflow's `push` trigger → the data commit cannot re-run scrape-ingest. This alone breaks the commit→scrape→commit loop.
- **Defense-in-depth:** `[skip ci]` in the commit message.
- **Optimization (optional, Erik-owned):** Render "Ignored Paths" for `server/data/**` so a data-only commit doesn't redeploy. Not load-bearing — a Render deploy never creates a commit, so the worst case without it is **one harmless extra deploy** that resets the disk onto the just-committed fresh seed. If the live service deploys via a deploy-hook webhook (not native auto-deploy), a git push doesn't deploy at all and this is moot.

**Effort:** ~½ day. **Risk:** Low (reuses tested `applyIngest`; in-repo loop break; non-fatal commit step). **Timeline:** single PR.

## Section 4 — Detailed Change Proposals

**1. `.github/workflows/scrape-ingest.yml`**
- `OLD` `permissions: contents: read` → `NEW` `contents: write` (for the commit-back job; scope to that job if practical).
- `OLD` `push: branches: [master]` → `NEW` add `paths-ignore: ['server/data/data.json']`. *Rationale: airtight loop-breaker.*
- `scrape` matrix job: after POST `/api/ingest` (unchanged — immediate live refresh), write each store's scraped `Deal[]` to `out/<store>.json` and `actions/upload-artifact`. *Rationale: makes the scrape result available to the merge job without re-reading prod.*
- **NEW `commit-back` job** (`needs: scrape`, `if: always()`, schedule+dispatch+push — it reads git not prod, so it's deploy-independent): checkout → `download-artifact` (all) → run the new merge script → if `data.json` changed: `git config` bot identity, commit `chore(data): refresh seed [skip ci]`, `git pull --rebase origin master`, `git push` (one retry). `continue-on-error: true` so a transient push failure never reds the run (alert-gate stays the sole alert per ADR-034 §6).

**2. New `server/scripts/commitBackSeed.ts`** (run via `tsx` in the commit-back job)
- Loads checked-out `server/data/data.json` + all `out/<store>.json` artifacts → builds `IngestEntry[]` → calls `applyIngest(entries, dataPath)` (existing, tested) → applyIngest's "never overwrite good data with empty" keeps last-known-good for empty scrapes. Exits 0; the workflow commits only if git sees a diff. *Rationale: identical merge to the live server; preserves all stored deals regardless of current time window.*

**3. `server/scripts/ingestRun.ts`** (minor)
- Add an opt-in flag/env to also write the scraped `Deal[]` to `out/<store>.json` alongside the existing POST. *Rationale: single scrape feeds both the live POST and the artifact; no double-scrape.*

**4. ADR-047** (new, `ADR.md`)
- Title: *Commit-back seed — durable live data on Render's ephemeral disk.* Records the cutover-race finding, the `applyIngest`-not-`/api/data` correction, the in-repo loop-breaker, and that it supersedes PR#24's push-re-scrape as the durability mechanism (push trigger retained only for immediate refresh).

**5. Secondary (timestamp honesty) — RE-SCOPED to "no change."**
The `accepted>0` guard at `applyIngest.ts:59` is actually **correct**: "Last updated" should reflect when data last truly changed. The real defect was the seed never being committed — fixed by commit-back, which re-commits the live `lastScraperRun`. So no guard change is needed. *(Optional future polish: surface the existing per-store `status` field in the UI instead of leaning on one global timestamp — separate, lower priority.)*

## Section 5 — Implementation Handoff

- **Scope:** Moderate → **Developer-implementable in one PR** (no PM/Architect replan).
- **Owner:** Developer agent (recommend `bmad-create-story` → `bmad-quick-dev`, given the CI + server-script + ADR surface and 3-layer review fit).
- **Erik-owned, optional, parallel:** set Render "Ignored Paths" `server/data/**` (or confirm the deploy trigger is a webhook). Not a blocker.
- **Success criteria:**
  1. After a fresh `master` deploy, `gmaslist.com/api/data` shows `lastScraperRun` within the last cron interval (not Jun 14) and the scraping stores fresh — i.e. deploys are non-destructive.
  2. A scheduled run commits an updated `server/data/data.json` to `master` and does **not** trigger a new scrape-ingest run (no loop) and does not (or harmlessly) redeploy.
  3. No active deal present in the stored set is lost across a commit-back cycle (verifies the `applyIngest`-merge correctness vs. the rejected `/api/data` source).
  4. Full server suite + `npm run build` green; alert-gate semantics unchanged.

---

### Change log
- 2026-06-22 — Proposal created. Option 1c selected by Erik. Commit source corrected from `GET /api/data` to in-CI `applyIngest` merge after review caught `filterActiveDeals` data-loss. Render Ignored-Paths downgraded to optional.
