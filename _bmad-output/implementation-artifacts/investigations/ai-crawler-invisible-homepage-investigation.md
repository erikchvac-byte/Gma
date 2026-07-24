# Investigation: Homepage `/` is invisible to AI crawlers despite a strong Lighthouse score

## Hand-off Brief

1. **What happened.** The homepage `https://gmaslist.com/` serves a client-rendered SPA whose `<body>` is an empty `<div id="root"></div>`; non-JS AI crawlers get head metadata only and see zero deal/store content — *Confirmed* by the raw HTTP response.
2. **Where the case stands.** Root cause is Confirmed and it is **intentional, not a bug**: `server/routes/shellRoute.ts:29-32` states the crawler-visible HTML half of "Phase 0a" is deliberately deferred pending a "Phase 0b legal decision"; only `/about` and `/compare*` are server-rendered today.
3. **What's needed next.** This is an undone feature, not a defect — the unblock is Erik's go-ahead on Phase 0b (server-render human-readable deal/store content into the homepage shell). Recommend `bmad-correct-course` or `bmad-create-story` to schedule it.

## Case Info

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Ticket           | N/A                                                                        |
| Date opened      | 2026-07-23                                                                 |
| Status           | Concluded                                                                  |
| System           | gmaslist.com (Render, Express SSR + Vite/React SPA client). Windows dev.   |
| Evidence sources | Live HTTP responses (curl), server source, Lighthouse report `gmaslist.com-5555.json`, project memory |

## Problem Statement

User reports that an AI search of `https://gmaslist.com/` pulls only `<title>`, meta description, theme color, and viewport — "an empty shell" — because deals/listings render client-side via JavaScript that a basic crawler/fetch does not execute. Yet Lighthouse scores look strong. User wants to know "what is broken, missing, wrong or undone" and to be at the top of AI-search results.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| Raw homepage HTML (`curl` as GPTBot UA) | Available | Body is `<div id="root"></div>` — no rendered content. 23,535 bytes, nearly all `<head>`. |
| Raw `/about`, `/compare` HTML | Available | 10 KB / 4 KB of real server-rendered `<h1>`, prose, FAQ, comparison facts. |
| `server/routes/shellRoute.ts` | Available | Comment explicitly names the gap as deferred (lines 29-32). |
| `server/index.ts` route table | Available | Catch-all → shellRoute; `/about`, `/compare*` bound to SSR routes. |
| Lighthouse report `gmaslist.com-5555.json` | Available | Runs headless Chromium (executes JS) → measures the hydrated page, not the crawler's view. |
| Project memory (ADR-082, SEO spec) | Available | Confirms "0a crawler-HTML half still open, needs Erik's 0b go-ahead." |

## Confirmed Findings

### Finding 1: Homepage body is an empty SPA shell to any non-JS client

**Evidence:** `curl -sL https://gmaslist.com/` returns `<body><div id="root"></div></body>`. No headings, prose, deals, or store names in the served markup.

**Detail:** All homepage content is painted by client-side React after JS execution. A fetcher that does not run JS (most AI crawlers, `curl`, plain HTTP) sees only `<head>` metadata + inline scripts.

### Finding 2: The homepage DOES embed the full data — but only as a JS blob, not readable content

**Evidence:** `curl` output contains `window.__GMA_DATA__` and `window.__GMA_DROPS__` (`server/routes/shellRoute.ts:57-67`), plus a `<head>` JSON-LD `@graph` (WebSite + Organization only).

**Detail:** The complete `/api/data` deals payload is injected as an inline `<script>window.__GMA_DATA__ = {...}</script>` for hydration performance (ADR-082/092). This is a variable assignment, not rendered DOM text — standard crawler/LLM text extraction ignores it. The only machine-readable structured data is the head JSON-LD, which carries **entity identity only** (who Gmas List is) and **no deals**.

### Finding 3: The gap is intentional and documented in the code

**Evidence:** `server/routes/shellRoute.ts:29-32`: *"This is the Phase 0a PERF half only. The crawler-visible HTML half is deferred pending the Phase 0b legal decision -- do NOT render human-readable deal content here."*

**Detail:** Confirms this is undone-by-design, gated on a legal decision, not a regression or bug. Memory corroborates: "0a crawler-HTML half still open, needs Erik's 0b go-ahead."

### Finding 4: `/about` and `/compare*` are already server-rendered — the pattern exists

**Evidence:** `server/index.ts:55,61,62` bind `aboutRoute`, `compareIndexRoute`, `compareCategoryRoute`; `/about` returns a real `<h1>` + FAQ (10 KB), `/compare` returns `<h1>` + 1,427 comparison facts (4 KB). Catch-all `app.get(/^(?!\/api).*/, shellRoute)` (`server/index.ts:97`) sends everything else — including `/` — to the empty shell.

**Detail:** The SSR mechanism (ADR-078) is proven and live on secondary pages. Extending it to `/` is a known, bounded pattern, not new architecture.

## Deduced Conclusions

### Deduction 1: Lighthouse "looks fine" and "invisible to AI" are consistent, not contradictory

**Based on:** Findings 1, plus Lighthouse `gatherMode: navigation` running Chrome 150 headless.

**Reasoning:** Lighthouse executes JavaScript in a real Chromium engine, so it audits the *hydrated* page (LCP 2.5 s, FCP 2.5 s — real cards painted). AI crawlers and basic fetch do not execute JS, so they audit the *served* markup (empty root). The two tools measure two different artifacts of the same URL.

**Conclusion:** A high Lighthouse score is not evidence of crawler visibility. They cannot be reconciled by tuning Lighthouse; only server-rendered HTML closes the gap.

## Source Code Trace

| Element       | Detail                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| Origin        | `server/routes/shellRoute.ts:40-83` (`makeShellRoute`) — serves `client/index.html` shell with data injected into `<head>`, no body content rendered. |
| Trigger       | Any non-API request that isn't `/about` or `/compare*`, incl. `/` — `server/index.ts:97`. |
| Condition     | Client's rendering engine: JS-executing clients (browsers, Lighthouse) hydrate and see content; non-JS clients (AI crawlers) see empty root. |
| Related files | `server/index.ts` (routing), `client/index.html` (shell template with `<div id="root">`), `server/routes/aboutRoute.ts` & `compareRoute.ts` (the SSR pattern to copy), `server/utils/buildApiData.ts` (payload source). |

## Conclusion

**Confidence: High.** Root cause is Confirmed and deterministic. The homepage `/` is a client-side-rendered SPA whose served HTML contains no human-readable body content; AI crawlers that do not execute JavaScript see title + meta + JSON-LD entity identity only. Nothing is *broken* — the crawler-visible HTML render for `/` is **deliberately undone** (`shellRoute.ts:29-32`), deferred behind a Phase 0b legal decision that only Erik can release. The strong Lighthouse score is real but measures the JS-hydrated page, a different artifact than the crawler sees.

The user's premise is **correct**: the homepage is effectively invisible to non-JS AI crawlers. The refinement the evidence adds is that `/about` and `/compare` are *already* crawler-visible via the exact SSR mechanism the homepage lacks — so the site is partially discoverable today, just not on its primary URL or its actual deal content.

## Recommended Next Steps

### Fix direction

Extend the existing SSR pattern (ADR-078, as used by `aboutRoute.ts`/`compareRoute.ts`) into `shellRoute.ts` so the homepage response includes server-rendered, human-readable HTML of the current deals/stores — headings, store names, deal text — inside the served markup, in addition to the `__GMA_DATA__` snapshot it already injects. Because the payload already ships publicly and un-gated via `/api/data`, and `/compare` already publishes deal-derived facts as crawler HTML, the incremental data exposure is minimal — the true blocker is the **Phase 0b legal go-ahead**, which is Erik's decision, not an engineering unknown.

Complementary, lower-effort wins that don't need the full render:
- Add richer JSON-LD to the homepage `<head>` (e.g. `ItemList`/`Offer`/aggregate deal facts) — structured data is crawler-visible without executing JS and doesn't require rendering deal prose into the body.
- Ensure `robots.txt`, `sitemap.xml`, and `/llms.txt` (all already shipped per ADR-080/081) list the crawler-visible routes so AI crawlers find `/about` and `/compare*` even before `/` is fixed.

### Diagnostic

None required — root cause is Confirmed. To *verify a fix* once shipped: `curl -sL https://gmaslist.com/ | sed -n '/<body/,/<\/body>/p'` should show real headings/store/deal text (mirror the `visibleText()` assertions already used in `shellRoute.test.ts`/`compareRoute.test.ts`).

## Reproduction Plan

1. `curl -sL -A "GPTBot/1.0" https://gmaslist.com/` → observe `<body><div id="root"></div></body>` (empty).
2. `curl -sL https://gmaslist.com/about` → observe real `<h1>` + prose (contrast: the SSR path works).
3. Load `/` in a real browser or Lighthouse → full deal cards render (JS executed). The delta between (1) and (3) is the entire finding.

## Side Findings

- **`__GMA_DATA__` is a latent asset.** The full deals payload is already inline in the homepage HTML as a JS blob (`shellRoute.ts:57-67`). A future fix could server-render from the very same data it already computes per request — no new data plumbing, buildApiData() is already called on the request path.
- **JSON-LD present but thin.** Homepage head JSON-LD is WebSite + Organization only (identity, no offers). Per its own comment, Service + FAQPage live on `/about`. Adding deal/offer structured data to `/` is a self-contained SEO win.
- **Cache-Control is `no-cache`** on the shell (`shellRoute.ts:81`) — correct for hourly-refreshed deals, and it won't impede crawler re-fetch.
