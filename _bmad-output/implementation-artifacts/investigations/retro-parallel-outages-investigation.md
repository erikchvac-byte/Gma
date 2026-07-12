# Investigation: happy-time-mt-vernon persistent-stale + Dutchie products outage

## Hand-off Brief

1. **What happened.** Two Confirmed root causes: (a) `happy-time-mt-vernon` genuinely has zero recreational specials on its live Dutchie menu since its June month-end promos expired 2026-06-30 — the pipeline scrapes correctly, but applyIngest cannot represent "legitimately empty", so the store reads stale forever, reds every hourly alert, and the app serves expired June deals as current; (b) the ~2-day Dutchie products outage (2026-07-08 → 07-10) happened because the ADR-077 cutover (07-06) moved Dutchie accrual to the local machine with **no Scheduled Task** — daily coverage until then was manual dev-session runs, and 07-08/09 simply had none.
2. **Where the case stands.** Concluded, both threads High confidence. Outage thread needs no fix (task created 07-10, first scheduled run green 07-11); mt-vernon thread needs a mechanism fix.
3. **What's needed next.** Decide the "confirmed-empty specials" representation fix (see Fix direction) — until then the hourly alert stays red and the card shows dead June deals.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | Retro action items #1 and #2, epic-derivation-1-retro-2026-07-10.md:50-51 |
| Date opened      | 2026-07-11 |
| Status           | Concluded |
| System           | GitHub Actions hourly deals cron + Render (gmaslist.com); local Windows pipeline (~\GmaS-data\products.db) for products |
| Evidence sources | data.json seed, live products.db, GH Actions run/job logs, live Dutchie embed menu, git history, Scheduled Tasks, storeStatus/applyIngest/ingestRun/_dutchie source |

## Problem Statement

From the retro (verbatim): (1) "`happy-time-mt-vernon` persistently stale (233h at retro time) — reds every hourly alert-gate email until cleared." (2) "Recurring Dutchie outage pattern (seen ~2 days twice) — root cause unknown." **Premise correction:** the products data contains exactly ONE multi-day Dutchie gap (07-07T03:03Z → 07-10T17:58Z, ~3.6 days); "twice" reflects two live-proof observations (1.2.5 on 07-08, 1.7 on 07-09/10) of the same outage, not two occurrences. No "recurring pattern" exists in the data.

## Evidence Inventory

| Source   | Status | Notes |
| -------- | ------ | ----- |
| data.json seed | Available | mt-vernon lastFetchedAt=2026-07-01T03:33:28Z (= Jun 30 20:33 PDT, month end); 6 frozen deals all "JUNE 2026 SUMMER SALE …" / "MAY … MEMORIAL DAY … PULLMAN" |
| Live Dutchie embed menu | Available (checked 2026-07-11) | /embedded-menu/happy-time-mt-vernon/specials renders: "Sorry, but there aren't any recreational specials right now." |
| GH Actions run 29164399560 (2026-07-11T18:57Z) | Available | mt-vernon scrape job SUCCEEDS in ~11s, zero scraper errors, emits 216-byte artifact (empty deals); step log: `[ingestRun] happy-time-mt-vernon: stale` |
| alert-gate log (same run) | Available | `fresh=16/18 totalFailure=false persistentlyStale=[happy-time-mt-vernon]`, exit 1 |
| Live products.db (~\GmaS-data) | Available | Per-day store counts pinpoint the outage window; Weedmaps task fired 10:30Z every day incl. outage days; Dutchie runs at variable times = manual |
| Scheduled Tasks | Available | 4 GmaS tasks Ready; Dutchie Ingest LastRun 2026-07-11 03:00:01 local, result 0 |
| git history | Available | cad2b23 2026-07-06 (ADR-077 cutover), 205ca1a 2026-07-10 "fix(ingest): schedule the local Dutchie feeder + derive runner" |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-06-24 → 07-07 | Dutchie products accrual runs daily at variable UTC times (10:05–12:29, one 03:03) — manual dev-session runs | products.db group-by | Confirmed (runs) / Deduced (manual) |
| 2026-07-01T03:33Z | Last successful mt-vernon deals ingest (Jun 30 20:33 PDT); June promos removed from menu at month end | data.json + deal titles | Confirmed / Deduced (expiry cause) |
| 2026-07-06 | ADR-077 Phase 1 cutover: Dutchie products → local SQLite (cad2b23); no task scheduled | git | Confirmed |
| 2026-07-07T03:03Z | Last pre-outage Dutchie products run | products.db | Confirmed |
| 2026-07-08, 07-09 | No Dutchie products run; only Weedmaps' 10 stores accrue (780 obs/day). 1.2.5 (07-08) and 1.7 (07-09/10) catch it live | products.db; story docs | Confirmed |
| 2026-07-10T17:58Z | Manual recovery run; same day task scheduling committed (205ca1a) | products.db + git | Confirmed |
| 2026-07-11T10:00Z | First scheduled Dutchie run (3:00am PDT task, LastResult 0) | products.db + Get-ScheduledTaskInfo | Confirmed |
| 2026-07-11T18:58Z | Hourly alert-gate still reds solely on mt-vernon persistent-stale | Actions job 86575011561 | Confirmed |

## Confirmed Findings

### Finding 1: mt-vernon deals scrape works and honestly returns empty

**Evidence:** Actions job 86574924536 (run 29164399560): scrape job success, no `[scraperClient]`/attempt errors across the ADR-051 3-attempt sequence, 216-byte empty-deals artifact; live menu text "there aren't any recreational specials right now" (2026-07-11).

**Detail:** The same embed serves 100 products/day to the products pipeline (extraction-health.json:5-9, status ok) — the store and scraper are healthy; the specials list is genuinely empty.

### Finding 2: Empty is unrepresentable as fresh — by design

**Evidence:** server/utils/applyIngest.ts:47-52 (empty deals → lastFetchedAt untouched, `stale=true`, result 'stale'); server/utils/storeStatus.ts:11-29 (stale = lastFetchedAt >3h old); ADR-051 retry-on-empty rationale in server/scrapers/_dutchie.ts:159-169 ("a real no-specials store … indistinguishable" — the gap was known).

**Detail:** Last-known-good semantics protect against transient empty scrapes, but a persistently-empty store can never go fresh: lastFetchedAt freezes, alertGate's persistent-stale check fires every hour, and the UI keeps serving the frozen (now expired) deals.

### Finding 3: The products outage window and its boundary events

**Evidence:** products.db: 16-store Dutchie runs daily 06-24→07-07T03:03Z, then none until 07-10T17:58Z; Weedmaps 10:30Z group unbroken throughout; git cad2b23 (07-06 cutover), 205ca1a (07-10 scheduling); task LastRun 07-11 03:00:01 result 0.

**Detail:** The only multi-day gap in the dataset. Weedmaps was already task-scheduled (fixed 10:30Z fire time); Dutchie was not — its pre-outage daily coverage came from human-in-the-loop runs during Epic 1 dev sessions.

## Deduced Conclusions

### Deduction 1 (thread 1 root cause): Month-end promo expiry + unrepresentable-empty = permanent red

**Based on:** Findings 1-2; deal titles ("JUNE 2026 SUMMER SALE", "MAY … MEMORIAL DAY"); last success at Jun 30 20:33 PDT.

**Reasoning:** The store removed its month-branded promos at June's end and has run zero recreational specials since. Every hourly scrape since then correctly returns []; applyIngest by design refuses it; staleness accumulates unboundedly.

**Conclusion:** Not a scraper defect. The defect is representational: the system has no "confirmed zero specials" state, so honest emptiness presents as permanent failure (alert red + expired deals served).

### Deduction 2 (thread 2 root cause): Missing Scheduled Task, not a broken scraper

**Based on:** Finding 3.

**Reasoning:** Variable run times = manual runs; the two dark days are exactly the days between the last dev-session run after the ADR-077 cutover and the 07-10 manual recovery + task creation; the scraper ran perfectly when invoked on 07-10/07-11.

**Conclusion:** Ops gap in the 07-06 cutover (scheduling shipped 4 days later). Already remediated; no recurrence expected while the task fires (StartWhenAvailable/laptop-off behavior is the residual risk — see Diagnostic).

## Hypothesized Paths

### Hypothesis 1: Products outage = missing local Scheduled Task (memory carry-in)

**Status:** Confirmed. **Resolution:** Deduction 2; task-creation commit 205ca1a dated 4 days after cutover; first scheduled run green 07-11.

### Hypothesis 2: mt-vernon Dutchie menu changed on ~Jul 1 (slug/embed/structure)

**Status:** Refuted (as stated). **Resolution:** Embed alive (products flow daily; menu renders). What changed was menu *content* — specials removed at month end — not slug/embed/structure.

## Missing Evidence

None material. (Second-outage-instance evidence cannot exist: products.db history starts 2026-06-24 and contains one gap.)

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | Not an error — server/utils/applyIngest.ts:47-52 empty-branch is the state that manifests the symptom |
| Trigger | Hourly scrape-ingest.yml → ingestRun.ts → scrapeDutchieSpecials → GetSpecialMenuCards returns menuCards: [] |
| Condition | Store has zero live recreational specials continuously since 2026-06-30 |
| Related files | server/utils/storeStatus.ts (stale predicate), server/scripts/alertGate.ts (persistent-stale red), server/scrapers/_dutchie.ts:159-188 (retry-on-empty), server/utils/scraperClient.ts (failure→[] collapse) |

## Conclusion

**Confidence: High (both threads).**

Thread 1: `happy-time-mt-vernon` staleness is honest — the store has had zero recreational specials since June 30 (live-verified). Root cause of the *symptom* (permanent alert red + expired deals shown) is the representational gap: empty-scrape never advances freshness. Note scraperClient.ts collapses service *failures* to the same `[]` as genuine empties, so today the distinction needed for a fix is discarded upstream.

Thread 2: the ~2-day (actually ~3.6-day) Dutchie products outage was caused by the ADR-077 local cutover shipping without a Scheduled Task; coverage had been manual dev-session runs. Remediated 07-10/07-11 (task green). Retro's "recurring … twice" premise corrected: one outage, observed twice.

## Recommended Next Steps

### Fix direction (thread 1)

Mechanism: make "confirmed empty" a first-class ingest outcome.
1. Propagate the service-success signal: scraperClient/ingestRun can distinguish `success:true + GetSpecialMenuCards intercepted + menuCards:[]` (confirmed empty) from failure-collapsed `[]`. ADR-051's race concern is answerable by the existing 3-attempt confirmation (3× confirmed-empty in one run) or N consecutive confirmed-empty runs.
2. applyIngest: on confirmed-empty, clear deals + advance lastFetchedAt (store reads ok, card shows "no current specials") — this both clears the hourly alert red and stops serving the expired June deals.
3. Interim manual option (needs Erik's call): none clean — data.json edits are overwritten by the next commit-back cycle, and alertGate has no suppression list; the real fix is small enough to prefer.

### Diagnostic (thread 2 residual)

Verify the 4 GmaS tasks' missed-run behavior (StartWhenAvailable / battery settings) so a 3am powered-off machine doesn't recreate silent day-gaps; extraction-health + 1.8 alerting now provide detection either way.

## Reproduction Plan

Thread 1: run `npx tsx scripts/ingestRun.ts --store happy-time-mt-vernon` with prod INGEST_URL/SECRET (or observe any hourly run): result 'stale', artifact `{"dispensaryId":"happy-time-mt-vernon","deals":[]}`. Thread 2: historical; not reproducible post-remediation.

## Side Findings

- The six frozen deals are all suffixed "PULLMAN" — Happy Time chain promos apparently authored for/labeled by the Pullman WA location were being served on the Mount Vernon card while live. Worth a glance at other multi-location Dutchie stores for chain-wide specials mislabeling. (Confirmed titles: data.json mt-vernon deals.)
- The live embed offers "Back To Available Medical Specials" — medical specials may exist while recreational is empty; the scrape captures the recreational menu only. (Confirmed: live menu 2026-07-11.)
- starbuds-bellingham: lastFetchedAt = epoch-0, 0 deals — never successfully fetched since seeding; alertGate counts it non-fresh (fresh=16/18) but it does not trip persistent-stale. (Confirmed: data.json; alert-gate log.)
- Six stores sat in a 9–11h staleness band on 2026-07-11 (the-joint-everett, cannazone-old-hwy-99, sweet-relief-mt-vernon, hangar-420-everett, cannazone-bellingham, salish-coast-cannabis) yet alertGate reported fresh=16/18 at 18:58Z — they recovered within the day; consistent with intermittent per-store empties/failures the ADR-051 retry already tolerates. (Confirmed timestamps; interpretation Deduced.)
- Repo copy of server/data/products.db is a frozen 2026-07-06 snapshot (max observedAt = meta lastUpdated); live DB is ~\GmaS-data\products.db per ADR-077. Anyone querying the repo copy gets pre-cutover data. (Confirmed.)
