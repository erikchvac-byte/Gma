# SEO / Indexing / Reach Diagnostic Protocol

**Purpose:** a repeatable protocol for diagnosing crawl/index/reach issues on gmaslist.com **without producing false flags** — i.e. without mistaking a third-party audit's *proxy metric* for a confirmed, actionable problem.

**The false flag this exists to prevent (2026-07-29, real):** A Semrush audit flagged "21 pages have a low word count." The natural-but-wrong conclusion was *"thin content is hurting our reach — enrich the pages."* A GSC pull refuted it: Google has **never crawled** those pages (`Discovered – currently not indexed`, `Last crawl: N/A`). **A page Google has never fetched cannot be penalized for its content.** Word count was moot; the real bottleneck was crawl/discovery. We nearly built a whole enrichment story to fix a problem the authoritative source showed did not exist. Full case: `_bmad-output/implementation-artifacts/investigations/semrush-site-audit-investigation.md`.

---

## Core principle

> **A third-party audit metric (Semrush, Lighthouse, PageSpeed, an SEO blog checklist) is a *hypothesis*, not a verdict. Confirm it against the authoritative source (Google Search Console / live data) before acting.**

Third-party tools crawl our site with their own bot, their own thresholds, and no knowledge of what Google/AI engines actually did. They are useful for *generating* hypotheses and for catching hard errors (broken links, blocked crawlers). They are **not** evidence that a given page is being penalized, deranked, or ignored. Only GSC (for Google) and the citation monitor (for AI engines) show what the real consumers did.

**Grade every finding.** Label it `Confirmed` (from the authoritative source), `Deduced` (inferred from code/structure), or `Hypothesized` (a proxy metric or a guess). Never act on a `Hypothesized` finding as if it were `Confirmed`. The thin-content flag was `Hypothesized`; treating it as `Confirmed` was the error.

---

## The authoritative sources (what actually counts)

| Question | Authoritative source | NOT authoritative |
| --- | --- | --- |
| Is Google indexing / crawling a page, and why not? | GSC → URL Inspection + Pages report | Semrush "indexability", a rank tracker |
| Does the page surface in Google at all? | GSC → Performance (impressions/clicks) | Estimated-traffic tools |
| Does the site have crawl authority? | GSC → Links (external backlinks) | Domain-authority scores |
| Is an AI engine citing us? | The Phase-0 citation monitor (`citationMonitor.ts`, `~/GmaS-data/citation-log.jsonl`) | GSC (Google-only), Semrush |
| Is the crawler being blocked? | Live `curl -A <bot>` + GSC crawl status | A checklist assertion |

---

## Diagnostic sequence (run in order; each step rules something in or out)

Property: **`sc-domain:gmaslist.com`** in Google Search Console.

### 1. Establish the corpus
- GSC → **Sitemaps**: is the sitemap `Success`? When was it **last read**? How many URLs **discovered**?
- Compare discovered count to the route inventory (`sitemapRoute.ts`). A gap = a sitemap generation bug; a match = Google knows the URLs exist.
- *Rules out:* "Google doesn't know about the pages." (Discovery ≠ crawl ≠ index — keep them distinct.)

### 2. Get the index-status split
- GSC → **Indexing → Pages**: how many **Indexed** vs **Not indexed**, and the **reason table**.
- *This is the fork in the road.* Do not proceed to any remedy until you know the *reason*.

### 3. Classify the not-indexed reason (decision tree)

| GSC reason | What it means | Correct response |
| --- | --- | --- |
| **Page with redirect** | A non-canonical variant (http→https, www→apex) redirecting correctly. | Usually **fine** — confirm the target URLs are the canonical ones. Not a defect. |
| **Discovered – currently not indexed** + `Last crawl: N/A` | Google knows the URL (sitemap) but **has never fetched it**. | **CRAWL/DISCOVERY problem.** Content is irrelevant — Google hasn't seen it. Go to steps 4–6 (internal links, backlinks, request-indexing). **Do NOT touch page content.** |
| **Crawled – currently not indexed** | Google **fetched** the page but chose not to index it. | **NOW content/quality/duplication is in play.** Thin content, near-duplicate templates, low value are legitimately suspect here. This is the only bucket where an enrichment/consolidation story is warranted. |
| **Duplicate / alternate page with canonical** | Google folded it into another URL. | Fix canonicalization, not content. |
| **Excluded by 'noindex'** / **Blocked by robots.txt** | A directive is suppressing it. | Fix the directive (`shellRoute`/`sitemapRoute`), not content. |
| **Soft 404 / crawl anomaly** | Google saw an error/empty shell. | Check the SSR render for that route (empty-data fail-soft, 404 template). |

> **The load-bearing distinction: `Discovered – not indexed` (never crawled) vs `Crawled – not indexed` (fetched, rejected).** Content remedies apply **only** to the second. Conflating them is exactly the 2026-07-29 false flag.

### 4. Inspect representative URLs directly
- GSC → **URL Inspection** on 2–3 real URLs of each template (a `/store/*`, a `/compare/<cat>/<region>`, a `/compare/<region>` hub, the homepage).
- Record, per URL: **Coverage state**, **Last crawl** (or N/A), **Discovery** (sitemap vs referring page), **Referring page** ("None detected" = sitemap-only = weak signal), **Crawled as**, **Google-selected canonical**.
- *This is the single most decisive step.* `Last crawl: N/A` alone kills any content-based theory.

### 5. Check internal-link reachability
- A URL with **Referring page: None detected** is discovered only via the sitemap — the lowest crawl priority.
- Verify a **crawled** page actually links to it in its **raw HTML** (not just post-hydration). For gmaslist: homepage→store links live in `renderShellBody.ts`; store→compare in `storeRoute.ts`; about→compare in `aboutRoute.ts`.
- **Staleness trap (real, 2026-07-29):** if the linking page's `Last crawl` predates when the link was *added to the code*, Google hasn't seen the link yet. Check the ship date of the internal link vs the referrer's last-crawl date before concluding "internal linking is broken."

### 6. Check authority
- GSC → **Links** → external links. ~0 backlinks on a new domain = crawl budget is throttled sitewide; nothing on-page overcomes that. (Note: a "Processing data" state means *no data yet*, which for a new property ≈ no meaningful backlinks — don't misreport it as a hard zero.)

### 7. Check whether indexed pages surface
- GSC → **Performance**, last 3 months. Zero impressions on *indexed* pages = a ranking/authority issue, distinct from an indexing issue.

### 8. Separate Google from AI reach
- Everything above is **Google-only**. AI answer engines (Perplexity/ChatGPT/Claude) crawl on their own schedule and may fetch what Google hasn't.
- For the AI-citation question, read the **Phase-0 citation monitor** log — never infer AI reach from GSC state.

---

## Remedy-selection gate

**Only after step 3 identifies a `Confirmed` reason do you pick a remedy.** Map reason → remedy; never skip to a remedy from a proxy metric:

- `Discovered – not crawled` → re-crawl the hub (Request Indexing on the linking page), request-index flagships, earn backlinks, deepen internal links. **Not** content.
- `Crawled – not indexed` → *then* consider content depth / de-duplication / consolidation.
- `Page with redirect` / directive → fix canonicals / directives. Not content.
- Indexed but zero impressions → authority + query-targeting, not indexing.

---

## Operational notes (browser-driving the GSC pull)

- GSC report data **lags** — the Pages report timestamp can trail a same-day sitemap read; a fresh URL Inspection is more current than the aggregate report.
- **Live test vs indexed state:** URL Inspection's default view is the *last indexed* state; "Test Live URL" fetches fresh. Google-selected canonical shows only for the indexed view, not the live test.
- `get_page_text` is a reliable fallback when `computer` screenshots time out (CDP `captureScreenshot` occasionally hangs on this SPA-heavy console).
- **`Request Indexing` is an outward action on the verified property** — recommend it, show the target, and get Erik's go-ahead before submitting. Do not self-click.

---

## One-line checklist (tape to the monitor)

1. Sitemap read + discovered count?
2. Indexed vs not-indexed **reason**?
3. `Discovered–not-crawled` (crawl problem) or `Crawled–not-indexed` (content problem)? **← the whole game**
4. URL Inspection: Last crawl? Referring page? Canonical?
5. Internal link exists in raw HTML *and* the referrer was crawled after it shipped?
6. Backlinks?
7. Impressions on indexed pages?
8. AI reach = citation monitor, not GSC.
9. Grade every finding; act only on `Confirmed`; a proxy metric is a hypothesis.
