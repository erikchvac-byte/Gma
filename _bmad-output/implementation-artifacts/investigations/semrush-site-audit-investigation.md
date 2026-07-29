# Investigation: Semrush Site Audit (gmaslist.com, 29 Jul 2026)

## Hand-off Brief

1. **What happened.** A Semrush Site Audit of gmaslist.com reports the site technically clean (Site Health 96%, AI Search Health 99%, 0 errors, 0 pages blocked from any AI crawler) but flags 28 warnings/notices dominated by *thin content* — 21 of 44 crawled pages have a low word count. (Confirmed from the PDF.)
2. **Where the case stands.** Stronghold established: the flagged pages map onto the auto-generated SSR reach surface (`/compare/*` geo pages + `/store/*`), which is exactly the reach machine's output. Which specific 21 URLs are thin is not in the Overview export — that is the one material evidence gap.
3. **What's needed next.** Pull the per-URL "low word count" list from the full Semrush report (or fetch 2–3 live SSR pages and count words) to confirm whether the thin pages are the store pages, the region-category pages, or both — then decide if thin auto-pages help or hurt the AI-citation goal.

## Case Info

| Field            | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Ticket           | N/A                                                                                    |
| Date opened      | 2026-07-29                                                                              |
| Status           | Active                                                                                  |
| System           | gmaslist.com (Render web service, Express SSR + React SPA). Audit run 29 Jul 2026.     |
| Evidence sources | Semrush Site Audit Overview PDF (4pp); repo SSR route source; committed derived JSON.   |

## Problem Statement

No explicit symptom was reported — the input is a Semrush Site Audit Overview PDF handed over for review. Treated as an **exploration** case: reconstruct what the audit says about the site's crawlability/SEO health, grade each finding, and identify which (if any) matter for the standing strategic priority (AI-search *reach* is the binding constraint per STRATEGY.md).

## Evidence Inventory

| Source                                   | Status    | Notes                                                                                                   |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| Semrush Overview PDF                      | Available | Summary tiles + top-issue counts only. No per-URL breakdown of any issue.                                |
| Per-URL issue lists (full Semrush report)| Missing   | The Overview export omits the actual URLs behind "21 low word count", "6 long titles", etc.              |
| SSR route source (`server/routes/*`)      | Available | `compareRoute.ts`, `sitemapRoute.ts`, `aboutRoute.ts`, `storeRoute.ts` read; page templates understood.  |
| Committed derived JSON                     | Available | `server/data/derived/*` present; `data.json` carries 18 store ids.                                       |
| Live-page word counts                      | Partial   | Not yet fetched; can be obtained via WebFetch/curl to elevate the thin-page hypothesis to Confirmed.     |

## Investigation Backlog

| # | Path to Explore                                                                 | Priority | Status | Notes                                                                                     |
| - | ------------------------------------------------------------------------------ | -------- | ------ | ----------------------------------------------------------------------------------------- |
| 1 | Get the per-URL "21 low word count" list from the full Semrush report          | High     | Open   | The one gap that turns deductions into confirmed page identities.                          |
| 2 | Fetch 2–3 live SSR pages, count words, confirm which template is thin           | High     | Open   | Independent confirmation not dependent on Semrush access.                                  |
| 3 | Decide: is thin auto-page content a *problem* for AI citation, or acceptable?   | Medium   | Open   | Strategic call — thin-but-honest fact pages vs. Google's thin-content ranking penalty.     |
| 4 | Identify the 6 "too much text in title tags" pages                              | Low      | Open   | Deduced to be the long region-category `<title>`s; cheap to confirm + trim.                |
| 5 | Identify the 1 low text-HTML-ratio page                                         | Low      | Open   | Deduced to be `/` (React shell + `__GMA_DATA__` snapshot, little crawlable prose).         |

## Timeline of Events

| Time         | Event                                                        | Source            | Confidence |
| ------------ | ----------------------------------------------------------- | ----------------- | ---------- |
| 2026-07-25   | Sitemap submitted to Google Search Console                   | memory            | Deduced    |
| 2026-07-26   | Sitemap submitted to Bing Webmaster Tools                    | memory            | Deduced    |
| 2026-07-28   | Geo `/compare/<category>/<region>` pages shipped (ADR-107)   | git / ADR         | Confirmed  |
| 2026-07-29   | Semrush Site Audit run: 44 pages crawled, 96%/99% health     | Semrush PDF       | Confirmed  |

## Confirmed Findings

### Finding 1: Site is technically clean — zero errors, nothing blocked from AI crawlers

**Evidence:** Semrush PDF p.2–3. Site Health 96%, AI Search Health 99%, Errors 0. All eight AI-bot rows (ChatGPT-User, OAI-SearchBot, Googlebot, Google-Extended, PerplexityBot, Perplexity-User, Claude-User, Claude-SearchBot) show **0 blocked pages**. Crawled: 44 total — 0 broken, 0 blocked, 1 redirect (2.3%).

**Detail:** The explicit per-agent `Allow: /` groups in `server/routes/sitemapRoute.ts:39-67` (ROBOTS_TXT) are doing their job — no crawler, AI or search, is being turned away. For a strategy whose binding constraint is AI-search reach, the crawler door is confirmed open. Nothing to fix here.

### Finding 2: Thin content is the headline issue — 21 of 44 pages flagged low word count

**Evidence:** Semrush PDF p.4. Top issue = "21 pages have a low word count" (Warning). 33 of 44 pages (75%) "have issues"; only 10 (22.7%) "healthy". Total warnings 28, all Warning/Notice — no Errors.

**Detail:** 21/44 ≈ half the indexable surface. The SSR templates in `compareRoute.ts` render deliberately compact fact pages: a region-category page with only one or two floor rows is an `<h1>` + one-sentence lede + a 1–2 item `<ul>` + one accounting paragraph (`renderRegionCategoryHtml`, compareRoute.ts:587-655). Same shape for sparse `/compare/<category>` pages and for `/store/<id>` pages. These are thin *by construction* — the honesty contract forbids padding them with menu dumps or leaderboards.

## Deduced Conclusions

### Deduction 1: The 21 thin pages are the auto-generated reach surface

**Based on:** Finding 2 + the route inventory.

**Reasoning:** The 44-page corpus decomposes as ~3 static (`/`, `/about`, `/compare`) + 18 `/store/<id>` + a handful of `/compare/<category>` + 3 `/compare/<region>` + ~12 `/compare/<category>/<region>` (sitemap builders in sitemapRoute.ts:96-170; 18 store ids in `data.json`). Every data-backed template collapses to a few lines of prose when its slice of derived data is small. The static entity pages (`/about`, `/compare` index) carry the most prose and are the likely members of the "10 healthy" set.

**Conclusion:** The thin-content warning is a direct property of the reach machine, not a regression. It is Deduced (not Confirmed) only because the Overview PDF withholds the per-URL list (Backlog #1/#2).

### Deduction 2: The 6 long-title pages are the region-category pages

**Based on:** compareRoute.ts:649.

**Reasoning:** `renderRegionCategoryHtml` emits `title = "Cheapest {category} in {region}, WA — cannabis price comparison | Gmas List"` — routinely 60–70+ chars, past Semrush's title-length threshold. Region index titles (compareRoute.ts:577) are similarly long. Six such pages tripping the warning is consistent with 3 regions × a couple categories each.

**Conclusion:** Low-effort, low-stakes; trimming the boilerplate tail ("— cannabis price comparison") would clear it. Confirm against the per-URL list before touching.

### Deduction 3: The 1 low text-HTML-ratio page is the SPA homepage `/`

**Based on:** ADR-082 (`__GMA_DATA__` snapshot injection) + SPA architecture.

**Reasoning:** `/` serves the React shell with a large injected JSON data snapshot and minimal crawlable prose → high markup, low visible text = low text-HTML ratio. The SSR pages are prose-dense by comparison.

**Conclusion:** Expected artifact of the SPA/SSR split; likely not worth acting on.

## Hypothesized Paths

### Hypothesis 1: Thin auto-pages are a *reach liability*, not just a cosmetic warning

**Status:** Open

**Theory:** Google demotes thin, templated, near-duplicate pages; a fleet of 1–2-row region-category pages could dilute crawl budget and rank/cite worse than a smaller set of richer pages. If so, the reach machine is partially working against the reach goal.

**Supporting indicators:** 75% of crawled pages flagged; region-category pages share near-identical boilerplate differing only by a couple of rows.

**Would confirm:** Search Console showing these URLs crawled-but-not-indexed or "Discovered – currently not indexed"; low/zero impressions on the geo pages over the next few weeks.

**Would refute:** The geo pages getting indexed and drawing AI citations / impressions despite low word count (fact-dense pages can cite well even when short).

### Hypothesis 2: Thinness is acceptable and even on-strategy

**Status:** Open

**Theory:** For AI-citation (not classic ranking), a short page that answers one long-tail question with a hard, sourced fact is exactly what a citation crawler wants. Word count is a Google-era proxy, not an AI-answer proxy.

**Supporting indicators:** AI Search Health 99%; honesty contract deliberately keeps pages fact-only.

**Would confirm:** The Phase-0 citation monitor showing gmaslist.com cited off a geo page.

**Would refute:** Neither Google nor AI engines surfacing the geo pages at all after indexing settles.

## Missing Evidence

| Gap                                          | Impact                                                              | How to Obtain                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Per-URL list behind each warning              | Turns Deductions 1–3 from Deduced to Confirmed page identities      | Full Semrush report (Issues tab, export URLs) or the project UI.       |
| Live word counts per template                 | Independent confirmation of which template is thin + how thin       | WebFetch / curl the live SSR pages and count visible words.           |
| Search Console index status of the geo pages  | Settles Hypothesis 1 vs 2 (are thin pages actually indexed/cited?)  | GSC Coverage + Performance for `/compare/*/*` URLs.                    |

## Source Code Trace

| Element        | Detail                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Thin templates | `server/routes/compareRoute.ts` — `renderRegionCategoryHtml` (587-655), `renderCategoryHtml` (321-399), `renderRegionIndexHtml` (523-583); `server/routes/storeRoute.ts`. |
| Long titles    | `compareRoute.ts:649` (region-category) and `:577` (region index).                                            |
| Page inventory | `server/routes/sitemapRoute.ts:96-170` (`buildSitemapXml` / `readRegionPaths` / `readStoreSlugs`).            |
| Crawler policy | `server/routes/sitemapRoute.ts:39-67` (`AI_CRAWLER_AGENTS`, `ROBOTS_TXT`) — confirmed open to all AI bots.    |

## Conclusion

**Confidence:** Medium.

**Confirmed:** The site is technically healthy and fully open to every AI and search crawler (Finding 1); the audit's dominant signal is thin content — 21/44 pages low word count, with 6 long titles and 1 low text-HTML page as minor tails (Finding 2). No errors, no broken pages, no blocked pages.

**Hypothesized (unresolved):** Whether the thin auto-generated `/compare/*` reach pages *help or hurt* the AI-citation goal (Hypotheses 1 vs 2). This is the only question with real stakes, and it can't be settled from the Overview PDF alone — it needs the per-URL list and/or Search Console index status.

**The trap to avoid:** treating "21 low word count" as a bug to fix by padding pages. Padding would violate the honesty contract and add no fact value. The real decision is upstream: fewer, richer pages vs. many thin fact pages.

## Recommended Next Steps

### Fix direction

Do **not** reflexively fatten pages. Two genuinely cheap, no-downside wins if confirmed: (a) trim the boilerplate tail on region-category `<title>`s (Deduction 2), (b) leave `/` text-HTML ratio alone (expected SPA artifact). The substantive decision — consolidate thin geo pages vs. keep them — should wait for index-status evidence (Hypothesis 1/2), not the word-count warning.

### Diagnostic

1. Export the per-URL "low word count" list from the full Semrush report (Backlog #1).
2. Independently: fetch 2–3 live SSR pages (`/store/<id>`, a sparse `/compare/<cat>/<region>`) and count visible words (Backlog #2).
3. Check Search Console: are the geo pages indexed, or "discovered – not indexed"? (settles Hypothesis 1 vs 2).

## Side Findings

- `18 outgoing external links contain nofollow` (Notice): consistent with the own-site-first store-card outbound links (`rel="nofollow"`), an intentional, correct choice — not a defect.
- `2 subdomains don't support HSTS` (Notice): infrastructure (Render/host TLS policy), outward-facing — do not change without Erik's go-ahead; low stakes.
- `1 redirect (2.3%)` in the crawl: likely the trailing-slash normalizer (`server/middleware/trailingSlashRedirect.ts`) — expected, healthy.

## Follow-up: 2026-07-29

### New Evidence

Fetched the live sitemap (40 URLs) and counted visible words (scripts/styles/JSON-LD stripped) across 11 representative pages. Word counts:

| URL                                  | Words | Read      |
| ------------------------------------ | ----- | --------- |
| `/`                                  | 368   | low ratio (49 KB HTML) |
| `/about`                             | 655   | healthy   |
| `/compare` (index)                   | 240   | thin-ish  |
| `/compare/concentrate`               | 1917  | **rich**  |
| `/compare/vaporizers/mount-vernon`   | 1780  | **rich**  |
| `/compare/flower/bellingham`         | 1893  | **rich**  |
| `/compare/concentrate/mount-vernon`  | 509   | ok        |
| `/compare/bellingham` (region index) | 180   | **thin**  |
| `/store/the-vault-silvana`           | 152   | **thin**  |
| `/store/2020-solutions-north-...`    | 301   | thin      |
| `/store/happy-time-mt-vernon`        | 258   | thin      |

Title lengths: region-category titles run **73–80 chars** (`Cheapest Concentrate in Mount Vernon, WA — cannabis price comparison | Gmas List` = 80); region-index titles 50–55; store titles 63–69; the `/compare/concentrate` category-index title = 74.

### Additional Findings

**Finding 3 (Confirmed): the 21 thin pages are the 18 `/store/<id>` pages + the 3 `/compare/<region>` landing pages.** 18 + 3 = 21, an exact match to the audit count. Store pages run 150–300 words (an entity page: deals + location + boilerplate, little prose); region landing pages ~180 words (pure category-link hubs). The Silvana store (confirmed empty) is the floor at 152.

**Finding 4 (Confirmed): the region-CATEGORY content pages are NOT thin** — 509 to 1,893 words (100-row caps). The category index pages are rich too (1,917).

**Finding 5 (Confirmed): the 6 long-title pages are region-category (and one category-index) pages**, pushed past Semrush's ~70-char threshold by the `— cannabis price comparison` boilerplate tail (`compareRoute.ts:649`) plus the long "Mount Vernon"/"Concentrate"/"Vaporizers" tokens.

**Finding 6 (Confirmed): the 1 low text-HTML-ratio page is `/`** — 49 KB of HTML, 368 visible words (SPA shell + `__GMA_DATA__` snapshot). Matches Deduction 3.

### Updated Hypotheses

- **Deduction 1 — REFUTED (in part).** I had guessed the thin pages were the region-*category* geo pages. They are the richest pages on the site (100 rows each). The thin surface is the **store pages + region landing pages**. Followed the evidence, corrected the theory.
- **Hypothesis 1 (thin = reach liability) — narrowed.** Applies only to the 18 store pages and 3 region hubs now, not the money geo pages. Region hubs being thin is fine (navigational, like the `/compare` index). The only real question is the 18 store pages.
- **Deduction 3 / Finding 6 — CONFIRMED.**

### Backlog Changes

- #1, #2 → **Done** (word counts obtained independently; per-URL identities resolved without the full Semrush export).
- #4 (long titles) → **Confirmed** as region-category pages.
- New #6: decide whether the 18 store pages warrant one crawlable fact sentence each, or stay lean — the only open judgment call.

### Updated Conclusion

**Confidence: High.** Clean bill of health with one honest structural fact: the thinnest 21 pages are the per-store entity pages (18) and region link-hubs (3) — **not** the geo answer pages, which are rich. Nothing is broken, nothing is blocked from crawlers. Two cheap, honesty-safe cleanups: (a) trim the region-category `<title>` boilerplate tail; (b) optionally add one crawlable fact sentence to each store page. Neither is urgent.
