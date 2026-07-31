# Investigation: Discovery / Crawl Bottleneck (Google + non-Google engines)

## Hand-off Brief

1. **What happened.** gmaslist.com has near-zero reach; the operator's working theory is "insufficient sitemap coverage on the non-Google engines, and Google needs checking" — i.e. discovery/crawl is the misunderstood area.
2. **Where the case stands.** The sitemap is Confirmed complete (40 URLs, one canonical file, served identically to every crawler) and Confirmed *read by Google*. So "insufficient sitemap coverage" is **refuted as the Google bottleneck** — the real Google bottleneck is crawl authority (~0 backlinks), already diagnosed in `semrush-site-audit-investigation.md`. The genuine open gap is the **non-Google side**: Bing read-status and AI-engine crawl are unverified, because sitemap submission is not even the discovery channel for AI engines.
3. **What's needed next.** Pull the two authoritative non-Google sources — Bing Webmaster Tools (is the sitemap read? how many indexed?) and the Render access log (are Bingbot/PerplexityBot/GPTBot/ClaudeBot actually fetching pages?) — to confirm whether non-Google discovery is happening at all. The citation monitor (0/8) already measures the *outcome* for AI engines.

## Case Info

| Field            | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Ticket           | N/A                                                                         |
| Date opened      | 2026-07-30                                                                  |
| Status           | Active (exploration)                                                         |
| System           | gmaslist.com (Render web service, Express SSR + React SPA)                   |
| Evidence sources | Live curl of robots/sitemap; `server/routes/sitemapRoute.ts`; GSC pull (via `semrush-site-audit-investigation.md`); citation-log.jsonl; memory ledger |

## Problem Statement

Operator's verbatim framing: *"Not sufficient site map coverage on the other (non-google) sites and google needs checked as well, leaving discovery/crawl ability as the real misunderstood area for me. What is done and what is our bottleneck on discovery."*

Treated as an **exploration** case: build the correct mental model of "discovery/crawl" for this property, separate what is Done from what is the Bottleneck, and grade each. The premise ("insufficient sitemap coverage") is a hypothesis to test, not a fact — per `docs/seo-indexing-diagnostic-protocol.md`, a proxy belief must be confirmed against the authoritative source before acting.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| Live `robots.txt` (curl 2026-07-30) | Available | Allow-all + explicit AI groups incl `Bingbot`, `GPTBot`, `ClaudeBot`, `PerplexityBot`, `OAI-SearchBot`; advertises single `Sitemap:`. |
| Live `sitemap.xml` (curl 2026-07-30) | Available | **40 URLs**: 3 static + 19 `/compare/*` + 18 `/store/*`. One canonical file, served identically to all engines. |
| `server/routes/sitemapRoute.ts` | Available | Confirms one dynamically-built sitemap from the derived source; there is no per-engine sitemap. |
| GSC pull (2026-07-29) | Available (via prior case) | 40 discovered, homepage indexed, store/compare = `Discovered – not crawled` (`Last crawl N/A`). Google-only. |
| Bing Webmaster Tools read/index status | **Missing** | Sitemap *submitted* 2026-07-26 (memory); never re-pulled to confirm it was read or how many URLs Bing indexed. **The core non-Google gap.** |
| Render access log (crawler-hit evidence) | **Missing** | Would show whether Bingbot / PerplexityBot / GPTBot / ClaudeBot actually fetch pages. Not tracked locally; lives in Render logs. |
| Citation monitor (`~/GmaS-data/citation-log.jsonl`) | Available | Last run 2026-07-28, **0/8 cited**; rivals cited = leafly/leafbuyer/weedmaps/yelp/wheresweed etc. Measures AI *outcome*, not crawl. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Bing Webmaster Tools: sitemap read status + indexed count | High | Open | The one authoritative non-Google discovery source never pulled. Analogue of the GSC step for Bing (which also feeds DuckDuckGo/ChatGPT search). |
| 2 | Render access log: grep for Bingbot/PerplexityBot/GPTBot/ClaudeBot/OAI-SearchBot fetches | High | Open | Confirms whether *any* non-Google bot is organically crawling. Direct evidence, no console needed. |
| 3 | Re-run citation monitor; confirm still 0/8 and which rivals win | Medium | Open | Measures AI-engine reach outcome; already scheduled weekly (Mon 05:00). |
| 4 | Confirm Google re-crawled homepage post-Request-Indexing (checkpoint ~2026-08-12) | Medium | Open | Carried from `semrush-site-audit-investigation.md`; verifies store pages gained a referring page. |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-07-25 | Sitemap submitted to Google Search Console | memory | Deduced |
| 2026-07-26 | Sitemap submitted to Bing Webmaster Tools | memory | Deduced |
| 2026-07-28 | Citation monitor baseline run: 0/8 cited | citation-log.jsonl | Confirmed |
| 2026-07-29 | GSC: 40 discovered, homepage indexed, store/compare Discovered–not-crawled; Request Indexing submitted for 6 URLs | prior case file | Confirmed |
| 2026-07-30 | Live curl: sitemap = 40 URLs, robots allow-all incl AI/Bing groups | this case | Confirmed |

## Confirmed Findings

### Finding 1: There is exactly one sitemap, complete relative to the route inventory, served identically to every engine

**Evidence:** `server/routes/sitemapRoute.ts:96-170` (single `buildSitemapXml` from the derived source); live curl 2026-07-30 = 40 `<loc>` entries (3 static + 19 `/compare/*` + 18 `/store/*`).

**Detail:** There is no concept of "sitemap coverage on the other sites" as separate artifacts — one `/sitemap.xml` is advertised in `robots.txt` to all crawlers. Coverage matches the route inventory (18 live stores, the derived compare surface). So the corpus itself is not deficient.

### Finding 2: Every AI/search crawler is explicitly allowed; the crawler door is open

**Evidence:** `sitemapRoute.ts:39-67`; live `robots.txt` 2026-07-30 shows dedicated `Allow: /` groups for Bingbot, GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended, CCBot, Meta-ExternalAgent, etc. Semrush audit independently reported 0 pages blocked from any AI crawler.

**Detail:** Nothing is being turned away. Discovery is not gated by robots.

### Finding 3: On Google, the bottleneck is crawl authority, not sitemap coverage or content

**Evidence:** `semrush-site-audit-investigation.md` Findings 7–8 (GSC pull 2026-07-29): 40 URLs discovered, store/compare pages `Discovered – currently not indexed`, `Last crawl: N/A` (never fetched); Links report = "Processing data" ≈ ~0 backlinks; homepage last crawl Jul 2 (stale, predates the store-link addition).

**Detail:** Google *knows* the URLs (sitemap read, Success) but sits on them in a low-priority queue because the domain has ~0 authority. This is the definitive refutation of "sitemap coverage" as the Google problem — coverage is fine, crawl priority is the wall.

### Finding 4: AI-engine reach outcome is zero, and AI engines do not consume the sitemap via a console

**Evidence:** `citation-log.jsonl` last run 2026-07-28 = 0/8 questions cited gmaslist.com; rivals (leafly/leafbuyer/weedmaps/yelp/wheresweed) win. AI answer engines crawl the open web on their own authority-weighted schedule — there is no "submit sitemap to Perplexity/ChatGPT" step.

**Detail:** For the non-Google AI side, "sitemap coverage" is a category error: the lever is being *crawlable and authoritative on the open web*, which is already half-built (crawler-visible SSR shipped) but starved of authority (backlinks) — the same root as Finding 3.

## Deduced Conclusions

### Deduction 1: "Discovery/crawl" is three distinct channels with one shared root cause

**Based on:** Findings 1–4.

**Reasoning:** Discovery splits into (a) **Google** — sitemap-driven, discovery SOLVED, crawl throttled by authority; (b) **Bing** — sitemap-submittable, read-status UNVERIFIED (Backlog #1); Bing also underpins DuckDuckGo and ChatGPT's search tool, so it is disproportionately valuable; (c) **AI answer engines** — no sitemap channel, discovery = organic authority-weighted crawl, outcome measured at 0/8. All three are gated by the **same dominant input: external backlinks / domain authority (~0 today)**.

**Conclusion:** The operator's instinct that discovery is "the misunderstood area" is correct — but the misunderstanding is treating it as a *sitemap-coverage* problem. Coverage is done. The real, shared bottleneck is **crawl authority**, plus an **unverified non-Google discovery signal** (is Bing/AI even fetching?).

## Hypothesized Paths

### Hypothesis 1: Bing has not read/indexed the sitemap either (non-Google discovery is also stalled)

**Status:** Open

**Theory:** Given Google (higher crawl budget for new sites than Bing) hasn't crawled the store pages, Bing — with a smaller crawl appetite and the same ~0 authority — likely shows the sitemap submitted-but-barely-crawled too.

**Would confirm:** Bing Webmaster Tools showing sitemap read with 0–few indexed URLs; access log showing no/negligible Bingbot fetches.

**Would refute:** BWT showing meaningful Bing-indexed count, or access log showing Bingbot crawling the corpus.

### Hypothesis 2: AI crawlers are fetching pages even where Google/Bing haven't

**Status:** Open

**Theory:** GPTBot/ClaudeBot/PerplexityBot crawl on independent schedules and may have fetched pages Google never did; if so, the 0/8 citation result is a *ranking/authority* problem (they saw us, didn't cite), not a *discovery* problem.

**Would confirm:** Access log entries from AI bot user-agents hitting `/store/*` or `/compare/*`.

**Would refute:** No AI-bot fetches in the log → AI reach is still gated at discovery, same as Google.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Bing Webmaster Tools sitemap-read + indexed count | Settles whether non-Google search discovery is happening (Hyp. 1) | Log into BWT for gmaslist.com; read Sitemaps + Indexed pages |
| Render access-log crawler hits | Direct proof of which non-Google bots fetch, and what (Hyp. 2) | Render dashboard logs / `mcp__render` list_logs, filter by bot user-agents |
| Whether backlinks exist anywhere | The dominant crawl-budget input across all three channels | GSC Links (currently "processing"); a backlink checker |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Single sitemap builder | `server/routes/sitemapRoute.ts:96-170` (`buildSitemapXml`, `readRegionPaths`, `readStoreSlugs`) |
| Crawler policy | `sitemapRoute.ts:39-67` (`AI_CRAWLER_AGENTS`, `ROBOTS_TXT`) — all engines allowed |
| Homepage→store internal links (crawl-graph hub) | `server/utils/renderShellBody.ts` (added 2026-07-23, ADR-097) |
| AI-reach instrument | `citationMonitor.ts` → `~/GmaS-data/citation-log.jsonl` (weekly Mon 05:00) |

## Conclusion

**Confidence:** High (for what is Confirmed); the non-Google specifics remain Open pending Backlog #1–2.

**What is DONE (Confirmed):** One complete 40-URL sitemap, served to all engines and *read by Google*; robots.txt opens the door to every AI/search crawler; crawler-visible SSR pages exist; Google discovery is solved (40 URLs discovered); Request Indexing already nudged 6 URLs (2026-07-29); the AI-citation outcome is instrumented and running weekly (0/8 baseline).

**What is the BOTTLENECK (Confirmed + Deduced):** *Not* sitemap coverage — that premise is refuted. The bottleneck is **crawl authority: ~0 external backlinks**, which throttles Google's crawl of the discovered URLs and equally starves AI-engine reach. Layered on top is a **measurement gap on the non-Google side** — Bing's read/index status and whether AI bots are organically fetching have never been pulled, so we cannot yet say whether non-Google discovery has even started.

**The correct mental model:** discovery = three channels (Google / Bing / AI engines), one shared root (authority/backlinks). Sitemap work is complete; the next real lever is backlinks (reach plan Phase 2: Reddit + local news), and the next real *measurement* is Bing Webmaster Tools + Render access logs.

## Recommended Next Steps

### Diagnostic (close the two Open gaps — cheap, authoritative)

1. **Bing Webmaster Tools pull** (Backlog #1): confirm sitemap read + Bing-indexed count. Bing feeds DuckDuckGo and ChatGPT search, so this is the highest-value non-Google discovery check.
2. **Render access-log scan** (Backlog #2): filter for Bingbot/PerplexityBot/GPTBot/ClaudeBot/OAI-SearchBot to see who is actually fetching pages — direct discovery evidence, no third-party console needed.

### Fix direction (the shared root)

Do **not** invest further in sitemap coverage (done) or page content/word count (`semrush-site-audit-investigation.md` proved it inert). The one lever that raises crawl priority across Google, Bing, and AI engines simultaneously is **external backlinks** — the reach plan's Phase 2 (local subreddit, local news, a WA source that links out). Everything on-page is already in place to convert a crawl into a citation once authority arrives.

## Side Findings

- The prior case (`semrush-site-audit-investigation.md`) is Google-only by its own caveat; this case is its non-Google complement. Keep them cross-linked.
- Bing's value is amplified: it is the search backend for DuckDuckGo and for ChatGPT's browsing tool — so a Bing discovery failure quietly caps part of the AI-citation goal too.

## Follow-up: 2026-07-30 (Render access-log pull + Bing attempt)

### New Evidence

| Signal | Reading | Implication |
| ------ | ------- | ----------- |
| Render service | `srv-d8ni2ikm0tmc73e5uhcg` ("Gma"), **starter** plan, Oregon, live (redeployed 2026-07-30 19:23 via seed refresh). | Healthy. |
| Render log `type` label values | Only **`app`** and **`build`** — **no `request` type**. | Render is not exposing structured request/access logs via the API on this plan. |
| App-log sample (2026-07-30) | Only startup lines + `[refreshGasPrice] meta.gasPrice updated`. **No per-request lines.** | The Express app has **no request-logging middleware** (no morgan). It emits nothing per HTTP hit. |
| App-log regex for bot UAs (Bingbot/Googlebot/Perplexity/GPTBot/ClaudeBot/…) over last 7 days | **0 matches.** | Not evidence of "no crawling" — it is evidence that **crawler hits are not logged at all**. |

### Finding 9 (Confirmed): crawler-hit visibility does not exist — Render access logs are a dead end here

The app writes no request logs and Render's starter plan does not surface `request`-type logs through the API (only `app`/`build`). Therefore the access-log route **cannot** confirm or refute whether Bingbot/PerplexityBot/GPTBot/ClaudeBot are fetching pages. This is a **measurement gap**, not a finding of zero crawl. To gain this visibility would require adding a lightweight request-logging middleware (log method + path + user-agent to stdout), which would then be queryable as `app` logs — an outward code change, not yet made.

- Backlog #2 → **Blocked** (data does not exist). Superseded by two alternatives: (a) add request-logging middleware; (b) read Bing/GSC *Crawl Stats* reports, which attribute fetches by bot without needing our own logs.

### Finding 10 (Confirmed): the Bing Webmaster Tools pull is blocked on the browser extension

`tabs_context_mcp` returned **"Browser extension is not connected."** The Claude-in-Chrome extension must be installed, running, and logged into the same account before I can drive Bing Webmaster Tools. Backlog #1 remains **Open, blocked on setup**.

### Updated bottom line

Nothing changes the core conclusion — sitemap coverage is done; authority (backlinks) is the bottleneck. What this pull adds: **we are flying blind on non-Google crawl.** Neither Render logs (don't exist) nor any pull-to-date tells us if Bing/AI bots fetch. The two ways to open that eye are Bing Webmaster Tools' own Crawl Stats (needs the extension or a manual login) and, optionally, adding request logging to the app.

## Follow-up: 2026-07-30 #2 (crawler-logging middleware shipped)

**Action taken (Finding 9 remediation).** Added `server/middleware/crawlerLogger.ts` (+ tests, 10/10 green; full prod build green) — a bot-scoped request logger registered first in `server/index.ts`. It emits one greppable stdout line per crawler hit: `[crawler] <bot> <method> <path> <status> ua="..."`, surfaced as a Render `app` log. Bot-scoped (matches `Googlebot`/`Bingbot`/`GPTBot`/`ClaudeBot`/`PerplexityBot`/… + generic bot/crawler/spider) so the /healthz + /api/ingest noise doesn't bury the signal. Committed `db26cb5`, pushed to master → Render auto-deploy.

**Now queryable** (once the deploy is live) via `mcp__render__list_logs` with `type=["app"]`, `text=["\\[crawler\\]"]`. This is the standing instrument that finally answers "are non-Google bots fetching us?" — the gap no third-party console covers.

**Verification checkpoint:** after ~a day of live traffic, pull `[crawler]` app logs. Any Bingbot/AI-bot lines = non-Google discovery is happening (bottleneck is then ranking/authority, not discovery); zero lines over several days = non-Google discovery is genuinely stalled, reinforcing backlinks as the unlock.

**Still open:** Backlog #1 (Bing Webmaster Tools sitemap read-status) — blocked on the Chrome extension connection; the crawler log is complementary, not a substitute (BWT reports Bing's *indexed* count, the log reports raw *fetches*).

## Follow-up: 2026-07-30 #3 (Bing Webmaster Tools pulled — Backlog #1 resolved)

Chrome extension connected; drove Bing Webmaster Tools (`bing.com/webmasters/sitemaps`, property gmaslist.com).

### Finding 11 (Confirmed): Bing HAS read the sitemap, but its copy is stale and short (25 of 40 URLs)

| Sitemap (Bing) | Last submit | Last crawl | Status | URLs discovered |
| --- | --- | --- | --- | --- |
| `https://gmaslist.com/sitemap.xml` | 7/27/2026 | **7/27/2026** | **Success** | **25** |
| `https://gmaslist.com/` (stray) | 7/26/2026 | 7/26/2026 | Success | 0 |

- **Bing read the sitemap successfully** — refutes any "Bing never saw it" worry. Non-Google *sitemap* discovery works.
- **But it discovered only 25 URLs vs the live 40.** The 15-URL gap is an **exact match to the ADR-107 geo pages (12 `/compare/<cat>/<region>` + 3 `/compare/<region>` hubs) that shipped 2026-07-28 — one day AFTER Bing's last crawl (7/27).** Bing is holding the pre-geo-page sitemap and is missing the 15 richest answer pages (`/compare/<category>/<region>`, ~1,500–1,900 words each). It will refresh on Bing's own schedule; a manual resubmit accelerates it.
- The second row (`gmaslist.com/` submitted as a sitemap, 0 URLs) is a stray/erroneous submission — harmless noise, removable.
- Caveat: "URLs discovered" = Bing's read of the sitemap, **not** indexed count. Bing's actual index coverage lives under Site Explorer / Search Performance — a separate, still-unpulled question.

### Resubmit — CONFIRMED (correction)

The manual resubmit **did register.** The BWT console had just rendered stale on my reload; Erik's later read shows `Last processed 7/31/2026, URLs discovered 35, Successfully processed.` Bing jumped 25 → 35 discovered. (Rendering was flaky mid-session — CDP screenshot timeouts, cropped captures — but the submit itself went through; I was wrong to call it unconfirmed.)

### Finding 12 (Confirmed): Bing is now fully in sync — and the sitemap URL count is volatile because it is derived-data-backed

Re-curled the live sitemap after the 19:23 seed-refresh redeploy: it is now **35 URLs** (1 `/` + 1 `/about` + 1 `/compare` + **14** `/compare/*` + 18 `/store/*`) — down from **40** this morning (**19** `/compare/*`). **Bing's 35 discovered == the live 35. No gap; Bing is current.** The change is not a Bing problem: the seed refresh republished the derived artifacts (`disparity-rollups.json` / `regional-price-floor.json`), and **5 geo `/compare/<category>/<region>` pages dropped out of the sitemap** because their underlying regional-floor data changed. `buildSitemapXml` emits exactly the `/compare/*` set the current derived data supports (`sitemapRoute.ts:96-170`), so the citable geo surface expands/contracts with each derive.

**New side concern (worth a separate thread):** the richest answer pages (`/compare/<cat>/<region>`, the ones most likely to earn citations) **wink in and out** as derived data shifts — 19→14 in one refresh cycle. A URL that appears in the sitemap, gets discovered/crawled, then vanishes on the next derive is crawl-churn both Google and Bing see; it also means a page an engine is about to rank may 404 or fall out. This is a *data-stability / geo-page-durability* question, distinct from the discovery-authority bottleneck. Not investigated here — logged as Backlog #6.

### Backlog + hypothesis updates

- Backlog #1 → **Done** (Bing read-status pulled: Success, stale at 25/40).
- **Hypothesis 1 (non-Google discovery also stalled) — partially refuted:** Bing *did* discover 25 URLs, so discovery is not zero — it is stale/incomplete, missing the 15 newest pages. Root cause is the same authority/refresh-cadence story, not a coverage defect.
- New Backlog #5: pull Bing's actual *indexed* count (Site Explorer) — the analogue of GSC's index-status split, still unknown for Bing.
