# Investigation: Phase-0 AI-citation monitor still reads 0/8

## Hand-off Brief

1. **What happened.** The AI-citation monitor's last (and only) live baseline, 2026-07-28, shows gmaslist.com cited in **0 of 8** questions — but this is a *correct* reading, not a monitor defect: the engine performed real web searches and cited 4–9 genuine domains per question (weedmaps, leafly, leafbuyer, yelp, actual store sites), and gmaslist.com was in **none** of them (Confirmed).
2. **Where the case stands.** Concluded, High confidence. Root cause of 0/8 is **reach, not instrumentation**: the AI engine's web-search index does not retrieve gmaslist.com for these WA-local queries (consistent with the GSC "discovered-not-crawled / ~0 backlinks" finding). Secondary premise correction: there has been **exactly one** baseline run; the weekly Scheduled Task has **never fired** (first run 2026-08-03), so "still" 0/8 is a single data point, not a trend.
3. **What's needed next.** No monitor fix is warranted. Keep the baseline and let the reach/page-machine work (ADR-107 geo pages) move the number; re-read after 2026-08-03 for the first repeat sample.

## Case Info

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Ticket           | N/A                                                                        |
| Date opened      | 2026-07-31                                                                 |
| Status           | Concluded                                                                  |
| System           | Windows 11 / PowerShell; local-only monitor (ADR-106), Haiku 4.5 + basic web_search |
| Evidence sources | `~/GmaS-data/citation-log.jsonl`; Windows Scheduled Task "GmaS AI Citation Monitor"; ADR-106; code under `server/scripts/` + `scripts/` |

## Problem Statement

User report (hypothesis): "the Phase-0 AI-citation monitor still reads 0/8." Implied concern: repeated readings show no citations — is the monitor broken, or is the site genuinely not being cited?

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| `~/GmaS-data/citation-log.jsonl` | Available | 32 records, all timestamped 2026-07-28. Three runs that day: 15:05 UTC (all 401 auth-fail), 15:56 (partial, pre-domain-capture), 16:05 (full baseline with `citedDomains`). |
| Scheduled Task "GmaS AI Citation Monitor" | Available | State Ready; **LastRun 11/30/1999 (never); LastResult 0x41303 = TASK_HAS_NOT_RUN**; NextRun 2026-08-03 05:00; weekly, Monday. |
| ADR-106 change log | Available | Documents first live baseline 0/8, rival roll-up, env-path fix, cost pass. |
| Monitor source (`citationMonitor.ts`, `aiCitationRun.ts`) | Available | Not deep-read; not needed — the domain is absent from retrieval, so match-logic is not implicated in this baseline. |

## Confirmed Findings

### Finding 1: The 0/8 is a true baseline — the engine searched and cited real sources, none ours
**Evidence:** `~/GmaS-data/citation-log.jsonl`, run at `2026-07-28T16:05Z`. Every one of the 8 questions has `cited:false` with populated `citedDomains` (4–9 domains) and `citationCount` 4–9 — except `same-product-price-diff`, where the model declined to search (0 domains). gmaslist.com appears in **zero** `citedDomains` arrays across all questions.
**Detail:** Rivals dominate the answers Google/AI give instead of us: weedmaps.com (nearly every question), leafly.com, leafbuyer.com, yelp.com, plus real store sites (dutchie.com, starbud.com, westernbud.com, jetcannabisco.com). The monitor is functioning exactly as designed — it is accurately reporting zero AI-search reach.

### Finding 2: Only one live run exists; the scheduled monitor has never fired
**Evidence:** Scheduled-task info — `LastRunTime = 11/30/1999`, `LastTaskResult = 0x41303` (SCHED_S_TASK_HAS_NOT_RUN), `NextRunTime = 2026-08-03`. Log contains only 2026-07-28 timestamps.
**Detail:** The "0/8" is a single manual baseline from setup day. "Still 0/8" implies a repeated, unchanging measurement; there is no second sample. The first scheduled sample is 2026-08-03 (Monday). Premise partially refuted.

### Finding 3: Query shape vs page shape mismatch (why we wouldn't be cited even if indexed)
**Evidence:** Question set (`citation-questions.json`) is WA-**local** long-tail (Marysville / Everett / Bellingham / Snohomish); ADR-106 context notes our `/compare/<category>` pages are **statewide price ranges** — "nobody's canonical answer" to a local query.
**Detail:** Two independent gaps compound: (a) retrieval — the site isn't in the AI search index (reach/authority), and (b) relevance — even if retrieved, statewide-range content doesn't answer a local "cheapest X in <city> today" prompt. ADR-107 geo-scoped pages are the response already in flight.

## Deduced Conclusions

### Deduction 1: This is the AI-engine analog of "Discovered – not crawled," not "Crawled – not indexed"
**Based on:** Findings 1 & 3.
**Reasoning:** The engine never surfaces gmaslist.com among ~50 total citations across 8 queries. As with the GSC finding (memory: store pages "Discovered, not crawled / N/A", ~0 backlinks), the failure is at **retrieval/discovery**, not at content quality of an already-fetched page.
**Conclusion:** The remedy is not word-count/on-page tweaks. It is (1) citable, query-matched surfaces (geo pages, ADR-107) and (2) authority/discovery (backlinks, the reach plan). Editing existing pages to "look better" would be treating a crawl problem as a content problem — the exact false-flag the SEO diagnostic protocol warns against.

## Hypothesized Paths

### Hypothesis 1: Citation-match logic produces a false negative (gmaslist retrieved but not counted)
**Status:** Refuted (for this baseline)
**Theory:** `cited` could be false while gmaslist.com is actually among the cited sources.
**Would refute:** gmaslist.com absent from the raw `citedDomains`.
**Resolution:** `citedDomains` is captured independently of the `cited` flag and contains no gmaslist.com in any of the 8 records. There is nothing to match; the domain was never retrieved. Match-logic correctness is moot here (could be revisited only once gmaslist.com starts appearing in `citedDomains`).

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| A second, scheduled data point | Confirms 0/8 is a stable state vs day-noise (LLM answers are stochastic) | Let the 2026-08-03 Monday run fire; re-read the log. |
| Whether basic `web_search_20250305` uses the same index that would ever include a low-authority new domain | Bounds the ceiling on what the monitor can detect | Out of scope — engine-internal; treat citations as directional, not absolute. |

## Conclusion

**Confidence:** High.

The monitor is **not** broken. The 2026-07-28 baseline is a Confirmed, correct reading: the AI engine ran real searches, cited 4–9 legitimate domains per question, and gmaslist.com was in none of them. Root cause of "0/8" is the **binding reach constraint** the monitor exists to measure — the site is not retrieved by AI web search for WA-local deal queries (a discovery/authority failure), compounded by a query-vs-content shape mismatch (statewide ranges vs local questions). Secondary correction: only one baseline exists; the weekly task has never run (first run 2026-08-03), so "still" overstates the evidence — 0/8 is a single point.

## Recommended Next Steps

### Fix direction
No instrumentation change. The 0/8 is the signal, working as intended. Moving it is the job of the reach plan already underway: ADR-107 geo-scoped `/compare/<category>/<region>` pages (query-matched surfaces) + discovery/backlink work (authority). Do **not** treat this as an on-page content bug.

### Diagnostic
Re-read `~/GmaS-data/citation-log.jsonl` after the 2026-08-03 05:00 scheduled run to get the first repeat sample and confirm the task fires cleanly (watch `LastTaskResult`). Bump cadence back toward daily only once a non-zero citation appears and a *rate* is worth sampling (per ADR-106).

## Side Findings

- The 2026-07-28 15:05 UTC run logged 8 records with `API key is invalid` (401) — the pre-fix dry-run/key path. The env-path fix (PR#114, repo-root `.env`) resolved it; the 16:05 run is clean (0 errors). No action; noting the log contains both failed and successful attempts from setup day.
- `same-product-price-diff` reliably makes the model **refuse to web-search** (asks for a specific product) → contributes 0 citations every time and can never cite us. Consider rewording it to a searchable form if you want all 8 slots to actually exercise retrieval.
