# Investigation: "Last updated Jun 14" frozen + "17 sources unavailable" intermittent

## Hand-off Brief

1. **What happened.** Prod renders a frozen "Last updated Jun 14, 9:28 AM" and "17 sources unavailable" because every Render redeploy resets the ephemeral-disk `data.json` to the committed seed (which is frozen at `lastScraperRun=2026-06-14T16:28Z` with 17 epoch-seeded stale stores), and the push-triggered scrape-ingest meant to repopulate it loses a race against the redeploy. **[Confirmed]**
2. **Where the case stands.** Root cause Confirmed (High). Live API + GitHub Actions logs + committed seed all corroborate: a no-deploy scheduled cron reaches `fresh=10/22`, while the post-merge push run reads `fresh=0/21`. The "intermittent" is deploy-resets vs. cron-repopulations.
3. **What's needed next.** Stop storing live data on Render's ephemeral disk (persistent store / external KV), OR make the push-scrape wait for the deploy to finish before POSTing, AND decouple the "Last updated" timestamp from `accepted>0`. Recommend `bmad-correct-course` to pick the persistence fix.

## Case Info

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Ticket           | N/A                                                                        |
| Date opened      | 2026-06-22                                                                 |
| Status           | Concluded (root cause Confirmed)                                           |
| System           | Render free web service (ephemeral disk), GitHub Actions cron, gmaslist.com |
| Evidence sources | Live `/api/data`, committed `server/data/data.json`, GH Actions run logs, `applyIngest.ts`, `DealFeed.tsx`, `scrape-ingest.yml` |

## Problem Statement

User report: "WHY DOES THIS NOT GET UPDATED EVER? Last updated Jun 14, 9:28 AM, and the '17 sources unavailable' part acts intermittently funny — not updating at the right time or with the right info."

## Evidence Inventory

| Source   | Status    | Notes     |
| -------- | --------- | --------- |
| Live `/api/data` (gmaslist.com) | Available | `meta.lastScraperRun=2026-06-14T16:28:05.534Z`; 21 stores, 17 with `lastFetchedAt=1970…` + `stale=true`; `gasPriceUpdatedAt=2026-06-22` (server alive). |
| Committed `server/data/data.json` | Available | Seed is frozen: `lastScraperRun=2026-06-14T16:28:05.534Z`, 17 epoch-seeded `stale=true` stores. |
| GH Actions `scrape-ingest` runs | Available | Hourly+push+dispatch. Scheduled crons actually fire ~every 6h (00:08, 06:26, 12:47), not hourly. Nearly all runs "fail" — alert-gate reds them. |
| `applyIngest.ts` | Available | `lastScraperRun` bumped only when `accepted>0` (line 59). |
| `DealFeed.tsx` | Available | "Last updated" ← `meta.lastScraperRun` (113); "N unavailable" ← count of `stale===true` (93). |
| Render deploy event log | Partial | Deploy timing inferred from `gasPriceUpdatedAt` and alert-gate `fresh=0/21` post-merge; not pulled directly. |

## Timeline of Events

| Time (UTC, 2026-06-22) | Event | Source | Confidence |
| ----------- | ------------------- | --------------------- | --------------------- |
| 2026-06-14T16:28 | Last time a scrape accepted real deals → seed frozen here | committed data.json `lastScraperRun` | Confirmed |
| 12:47 | Scheduled cron (no concurrent deploy) → `fresh=10/22` | run 27953753683 alert-gate | Confirmed |
| 15:09 / 15:34 / 16:15 | PR#26 / #27 / #28 merged → 3 Render redeploys, each resets disk to seed | gh run list (push events) | Confirmed |
| 16:15:28–16:16:10 | Push-scrape ingests accepted: remedy/evolve/happy-time all `ok` (real deals landed) | run 27967080022 scrape jobs | Confirmed |
| 16:16:45 | Same run's alert-gate reads prod `fresh=0/21` — ingests wiped within ~35s (cutover ≈16:16) | run 27967080022 alert-gate | Confirmed |
| 16:27:34 | In-process gas interval tick writes runtime (NOT cutover — weak proxy) | live `gasPriceUpdatedAt` | Deduced |

## Confirmed Findings

### Finding 1: Both UI strings render directly from `data.json`, not from a live clock
**Evidence:** `client/src/components/DealFeed.tsx:113` (`lastUpdated = formatLastUpdated(data.meta.lastScraperRun)`) and `:93` (`staleCount = data.dispensaries.filter(d => d.stale === true).length`).
**Detail:** "Last updated …" is whatever `meta.lastScraperRun` says; "N sources unavailable" is the count of `stale:true` stores. Neither self-refreshes; both are only as fresh as `data.json`.

### Finding 2: The committed seed is frozen at the exact reported values
**Evidence:** `server/data/data.json` → `meta.lastScraperRun=2026-06-14T16:28:05.534Z`; 17 of 21 stores `lastFetchedAt:"1970-01-01T00:00:00.000Z"`, `stale:true`.
**Detail:** "Jun 14, 9:28 AM" (PDT) == 16:28 UTC, and "17 unavailable" == the 17 epoch-seeded stores — both are literally the committed seed.

### Finding 3: Live prod is currently serving exactly that seed
**Evidence:** Live `/api/data`: `lastScraperRun=2026-06-14T16:28:05.534Z`; same 17 stores `stale:true` with epoch `lastFetchedAt`; the 4 originals last fetched 2026-06-14T16:27-28 (also seed values). Only `gasPriceUpdatedAt` is today.
**Detail:** Nothing in prod has been re-fetched since Jun 14 except gas (which refreshes in-process). The disk == the committed seed.

### Finding 4: The scrape pipeline works when no deploy is racing it
**Evidence:** Scheduled run 27953753683 (12:47, no concurrent deploy) alert-gate: `fresh=10/22 totalFailure=false`.
**Detail:** Absent a deploy, the cron successfully ingests ~10 stores. The pipeline is not broken.

### Finding 5: The push-scrape successfully ingests, then the deploy wipes it within ~35s
**Evidence:** Post-merge push run 27967080022 (PR#28): scrape jobs logged `[ingestRun] remedy-tulalip: ok` (16:15:28), `evolve-cannabis-bellingham: ok` (16:16:07), `happy-time-mt-vernon: ok` (16:16:10) — `ok` means the `/api/ingest` POST was accepted with real deals (`applyIngest` sets `stale=false`, `accepted++`). Yet the same run's alert-gate read prod `fresh=0/21 totalFailure=true` at **16:16:45**, ~35s later.
**Detail:** The ingests *did* land on a live instance (proved by `ok`), then disappeared within 35s — the Render redeploy cut over to a fresh seed-disk instance and discarded them. This refutes "the scrape never landed"; it is "ingested, then discarded at cutover." Cutover therefore occurred ≈16:16, **not** 16:27 — the `gasPriceUpdatedAt=16:27` was a weak proxy (an in-process interval tick, not instance boot) and is not load-bearing for the timing.

### Finding 6: `lastScraperRun` only advances when a deal is accepted
**Evidence:** `server/utils/applyIngest.ts:59` — `if (accepted > 0) file.meta.lastScraperRun = now`.
**Detail:** A cron that scrapes only empty-returning (Dutchie) stores leaves the timestamp frozen even though it ran. Only runs that land ≥1 real deal move "Last updated."

## Deduced Conclusions

### Deduction 1: The "intermittent" is deploy-reset vs. cron-repopulate
**Based on:** Findings 3, 4, 5 + the multi-hour real cron cadence.
**Reasoning:** Right after any deploy, prod = frozen seed (17 unavailable, Jun 14). The next *scheduled* cron (which actually fires every ~6h, not hourly — GitHub drops schedules under load) repopulates ~10 stores and advances the timestamp. Erik pushed 3 PRs today, each re-freezing it.
**Conclusion:** Whether the page looks "fresh" or "frozen Jun 14 / 17 unavailable" depends entirely on whether you load it after a cron or after a deploy — exactly the reported intermittency.

### Deduction 2: Even a perfect repopulation never clears all 17
**Based on:** Finding 4 (`fresh=10/22`) + 17 epoch Dutchie stores.
**Reasoning:** The best observed cron reaches only ~10 fresh; the Dutchie stores with unresolved embed cNames return empty → stay `stale:true`.
**Conclusion:** "17 unavailable" can drop after a cron but will not reach 0 until the Dutchie scrapers resolve — a separate, pre-existing data-coverage gap.

## Hypothesized Paths

### Hypothesis 1: push-scrape ingests into the doomed pre-cutover instance, discarded at cutover
**Status:** Confirmed (by Finding 5 — `ingestRun: ok` at 16:16:10 then `fresh=0/21` at 16:16:45).
**Theory:** Zero-downtime deploy serves the old instance until the new one is ready; the push-scrape's POSTs are accepted by that old (or briefly-live) instance, then the cutover to the fresh seed-disk instance discards them.
**Would confirm:** Ingest returning `ok` immediately followed by prod reading `fresh=0`. **Would refute:** Ingest returning non-ok/`stale` for all stores (would instead mean "scrape produced nothing"), or prod retaining `fresh>0` after a deploy.
**Resolution:** Direct evidence — three stores returned `ok` (accepted real deals) at 16:15–16:16, prod read `fresh=0/21` 35s later. Ingest succeeded then was wiped → confirmed. (Considered alternative "scrape never lands usable data": refuted by the `ok` results.)

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| Exact Render cutover timestamp for PR#28 | Corroborates the ≈16:16 cutover (already Confirmed via ingest-ok→fresh=0); nice-to-have, no longer load-bearing | `mcp__render__list_deploys` — **needs Erik to select the Render workspace first** |
| Whether a Render persistent disk is available on the current (free) plan | Decides feasibility of fix #1 | Render plan/service settings |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Display origin | `client/src/components/DealFeed.tsx:113` (timestamp), `:93` (unavailable count) |
| Data origin | `server/routes/dataRoute.ts:14` reads `server/data/data.json` each request |
| Write path | `server/utils/applyIngest.ts:43-59` (per-store `stale`/`lastFetchedAt`; `lastScraperRun` only if `accepted>0`) |
| Trigger | `.github/workflows/scrape-ingest.yml` — `schedule` (hourly intent), `push:[master]`, `workflow_dispatch` |
| Condition | Render ephemeral disk resets `data.json` to committed seed on each redeploy; push-scrape races and loses |
| Related | `server/scripts/ingestRun.ts`, `server/scripts/alertGate.ts`, `server/utils/storeStatus.ts` |

## Conclusion

**Confidence:** High.

**Confirmed root cause:** The "Last updated" and "N unavailable" strings are rendered straight from `data.json` (Finding 1). On Render's **ephemeral disk**, every redeploy resets `data.json` to the **committed seed**, which is frozen at `lastScraperRun=2026-06-14T16:28` with 17 epoch-seeded `stale:true` stores (Findings 2, 3) — i.e. the seed *is* the reported symptom. The push-triggered scrape that is supposed to repopulate it **loses a race against the redeploy** and POSTs to the about-to-be-discarded instance (Finding 5, `fresh=0/21`). Repopulation then waits for the next GitHub *scheduled* cron, which fires only every ~6h, so prod sits frozen for hours after each deploy (Deduction 1). Two amplifiers: `lastScraperRun` only advances on an accepted deal (Finding 6), and ~17 Dutchie stores never resolve to deals so the count never reaches 0 (Deduction 2).

## Recommended Next Steps

### Fix direction (by mechanism)
1. **Persistence (primary).** Stop relying on the ephemeral disk for live data. Options: Render **persistent disk** for `server/data/`, or move live data to an external store (Render KV / Postgres already provisioned, or a committed-back data file). This makes deploys non-destructive and eliminates the race entirely.
2. **Race mitigation (if staying on ephemeral disk).** Make the push-triggered scrape **wait for the Render deploy to go live** before POSTing (poll `/api/health` or a deploy id), or trigger the scrape *from* a Render post-deploy hook instead of from the GitHub push event.
3. **Timestamp honesty.** Decouple "Last updated" from `accepted>0` — surface per-store freshness (ADR-034 Goal B `status` is already in the payload) or show "data as of seed" when running on a fresh disk, so the footer never silently shows a 8-day-old date.
4. **Coverage (separate track).** Resolve the 17 Dutchie embed cNames so "N unavailable" can actually reach a small number.

### Diagnostic
- Pull `mcp__render__list_deploys` for PR#28 to pin the cutover time vs. the 16:16 scrape finish (confirms the race window to the second).
- Manually `workflow_dispatch` scrape-ingest **with no concurrent push** and re-read `/api/data` — expect `fresh` to jump and `lastScraperRun` to advance, proving the pipeline works and isolating the deploy as the resetter.

## Reproduction Plan

1. Load gmaslist.com immediately after any master push/redeploy → footer shows "Last updated Jun 14, 9:28 AM" + "17 sources unavailable" (`fresh=0/21`).
2. Wait for / dispatch a scrape-ingest run with no concurrent deploy → ~10 stores flip fresh, count drops, timestamp advances.
3. Push any commit to master again → prod re-freezes to the Jun-14 seed. The flip-flop is the "intermittent funny."

## Side Findings

- The GitHub Actions "failure" badges are mostly the **alert-gate firing by design** (ADR-034 §6), not pipeline crashes — but they're indistinguishable from real failures in the run list and likely train the owner to ignore the alert emails. [Confirmed — run 27953753683 succeeded on every scrape job; only alert-gate redded.]
- Configured cron is hourly (`0 * * * *`) but GitHub only actually fired it ~every 6h today — GitHub silently drops scheduled runs under load. [Confirmed — gh run list cadence.]
- `gasPriceUpdatedAt` updates correctly in-process (today), proving the server writes to disk at runtime fine — the issue is purely deploy-reset + ingest timing, not a broken writer. [Confirmed.]
