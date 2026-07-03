# Weedmaps Scaled-Crawl Gate — Test Result (Phase 2 prerequisite)

**Date:** 2026-06-29
**Purpose:** Close the Phase 2 deployment gate from `ai-search-data-strategy-investigation.md`
(line 123 "Run the scaled-crawl test first"; Missing-Evidence line 112 "Weedmaps scaled-crawl
behavior / rate-limit / captcha under nightly crawl — Primary deployment risk").
**Method:** Throttled read-only crawl from ONE residential IP, no browser, Node global `fetch`,
desktop Chrome UA, follow-redirects. Script: `scratchpad/wmCrawlTest.mjs` (session-local).

## Design
- **Segment 1 — breadth:** 12 real WA dispensary landing pages (`/dispensaries/<slug>`),
  throttled 4–7s random.
- **Segment 2 — depth:** 5 category subpages of `western-bud-skagit-valley-wa`, throttled 4–7s.
- **Segment 3 — throttle probe:** 6 rapid requests 1s apart.
- Per request recorded: HTTP status, redirect target, latency, bytes, whether real
  `<script id="__NEXT_DATA__">` + `…menuItems[]` came back, and any bot-wall markers
  (perimeterx / datadome / incapsula / captcha-delivery / "access denied" / cloudflare challenge).

## Result — GATE PASSED (at sample scale)

| Metric | Value |
|---|---|
| Requests | 23 |
| Served real menu JSON (`__NEXT_DATA__` + menuItems) | **23 / 23** |
| Bot-challenge markers seen | **NONE** |
| HTTP 429 / 403 (rate-limit / block) | **0** |
| Errors (network) | 0 |
| Median latency | 1.29 s |
| Burst (6× @1s apart) | all OK, no throttle |

Every one of the 12 stores returned HTTP 200, 700–925 KB, with parseable `__NEXT_DATA__` and
menu items. The single `404` (`western-bud/vaporizers`) **still served valid `__NEXT_DATA__`** —
a wrong category slug, NOT a bot wall (note `pre-rolls` 301-redirects to `pre-roll`). No
PerimeterX/DataDome/Incapsula/captcha challenge fired; the `captcha` *script reference* the
inventory noted stayed benign across all 23 requests.

**Conclusion:** the rate-limit/captcha risk — the plan's "primary deployment risk" — is cleared
for low/moderate volume. Weedmaps serves real menu JSON to plain throttled axios from one IP, no
Playwright, no challenge, even under a small burst. Phase 2 (TYPE 3 `weedmaps-static-json`) is
technically GO.

## Honest caveats (carry into Phase 2 design)
1. **Not full-volume-proven.** 23 requests over ~2 min ≠ a real nightly crawl (12 stores × ~10
   categories × pagination = hundreds–thousands of requests; Western Bud alone = 1,543 products).
   No challenge observed at sample scale; behavior at full-traversal volume is still inferred.
   **Mitigation:** conservative throttle + nightly cadence + caching. The cross-store matcher (A1)
   only needs list price per SKU, so a **shallow** crawl (landing + a few categories) suffices —
   no need to exhaustively paginate every catalog.
2. **Category-URL scheme needs mapping.** `pre-rolls`→`pre-roll` redirect; `vaporizers` 404'd
   (real slug differs). Enumerate live category slugs per store during Phase 2.
3. **Pagination depth unmapped.** Every page returned exactly 24 items — the landing slice. The
   page/offset contract for full depth is still open (matches inventory "Uncertain: pagination").
4. Single residential IP, daytime. Datacenter IPs (Render) may be treated differently — re-probe
   from the deploy environment before wiring a production cron, or run the crawl from the same
   GitHub-Actions runner that already does Dutchie ingest (ADR-034).

## References
- Plan: `ai-search-data-strategy-investigation.md` (Phase 2 line 123, gate line 112)
- Source profile: `weedmaps-source-data-inventory.md`
- Store slugs: `dispensary-recon-98274-2026-06-28.md` (12 WA scrapeable stores; formerly repo-root `unverifyed-dispensary-findings.md`)
