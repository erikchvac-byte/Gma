# Investigation: Lighthouse Performance on gmaslist.com (mobile)

## Hand-off Brief

1. **What happened.** Two mobile Lighthouse runs of `gmaslist.com/` score Performance 76 (age gate showing) and 64 (past the age gate); Accessibility, Best Practices, and SEO are all 100 — Performance is the only gap. *(Confirmed)*
2. **Where the case stands.** Root cause of the Performance gap is Confirmed: the site is a client-rendered SPA, so LCP (~5.0 s, score 0.27–0.29) waits on a 180 KB JS bundle + an API round trip before above-the-fold content paints; past the age gate a second problem appears — the async-loaded deal grid causes CLS 0.254 (score 0.49), costing ~12 points.
3. **What's needed next.** Three ranked levers (LCP > CLS > unused JS); the LCP fix aligns with the already-open ADR-082 crawler-HTML / snapshot work. Recommend `bmad-correct-course` or a story to sequence them.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-07-18 |
| Status           | Concluded (root cause Confirmed) |
| System           | Lighthouse 13.3.0, formFactor=mobile, throttlingMethod=simulate |
| Evidence sources | Two Lighthouse JSON reports (BEFORE age gate, PAST age gate), both `finalUrl https://gmaslist.com/` |

## Problem Statement

"Can we improve on these lighthouse reports?" — two mobile reports of the home page, one captured with the age-gate interstitial showing, one after dismissing it.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| `gmaslist.com-Starts befor the age gate.json` (572 KB) | Available | Perf 76; CLS 0.001; Agentic Browsing 100; fetched 2026-07-18T21:00Z |
| `gmaslist.com-Starts Past the age gate.json` (636 KB) | Available | Perf 64; CLS 0.254; Agentic Browsing 83; fetched 2026-07-18T20:59Z |
| Source repo (Vite/React SPA, `assets/index-*.js`) | Available | Not yet traced to component; bundle names confirmed from report URLs |

## Category Scores

| Category | BEFORE gate | PAST gate |
| -------- | ----------- | --------- |
| Performance | **76** | **64** |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |
| Agentic Browsing | 100 | 83 |

## Confirmed Findings

### Finding 1: LCP is the dominant drag in both runs
**Evidence:** `largest-contentful-paint` score 0.27 (BEFORE) / 0.29 (PAST), displayValue ~5.0 s / 4.9 s. `first-contentful-paint` 3.1 s / 2.8 s (score 0.46 / 0.56).
**Detail:** LCP is the single lowest-scoring metric in both reports and carries the heaviest weight in the mobile Performance score. Fixing it moves the score more than anything else.

### Finding 2: LCP is gated by client-side rendering + an API round trip
**Evidence:** `network-dependency-tree-insight` longest chain = `https://gmaslist.com/` → `assets/index-C_lcnk_L.js` (180,197 B) → `/api/value/price-vs-own-median` (2,829 B); longestChain duration 347 ms (simulated). `render-blocking-insight` only names `index-DvMHRGYt.css` at 6,861 B.
**Detail:** Above-the-fold content is produced by JavaScript, not present in the initial HTML. The browser must download + parse + execute the 180 KB app bundle, then fetch the value/deals API, before the LCP element can paint. Render-blocking CSS is trivial (6.8 KB) and not the bottleneck.

### Finding 3: Past the age gate, the deal grid causes CLS 0.254
**Evidence:** `cls-culprits-insight` / `layout-shifts` (score 0) — "3 layout shifts found", total 0.254. Top culprit node `ul > li > article.gma-card > div.gma-deal-grid` (score 0.232), sub-cause references `img.gma-location-pin`. Only present in the PAST-gate run; BEFORE-gate CLS = 0.001.
**Detail:** When the age gate is up it covers content, so no shift is recorded. Once dismissed, deal data hydrates into `gma-deal-grid` after first paint and pushes layout down — a ~12-point Performance hit (CLS score 1.00 → 0.49) plus the Agentic Browsing drop to 83.

### Finding 4: ~107–125 KiB unused JavaScript, GA is the largest chunk
**Evidence:** `unused-javascript` — `googletagmanager.com/gtag/js?id=G-Z3EH6D5C89` total 166 KB / ~68 KB unused; `assets/index-C_lcnk_L.js` total 180 KB / ~60 KB unused.
**Detail:** Google Analytics (gtag) is the single biggest unused-byte source and is third-party. The app bundle also ships ~60 KB unused — a code-splitting opportunity.

## Deduced Conclusions

### Deduction 1: The two reports differ because of what the age gate hides
**Based on:** Findings 1 & 3.
**Reasoning:** The overlay masks the async deal-grid reflow (CLS ~0) but does not change how LCP/FCP are produced. Removing the overlay exposes the CLS the SPA hydration was always causing.
**Conclusion:** Both reports describe the same underlying architecture problem (client-side rendering); the PAST-gate run just additionally surfaces the layout-shift symptom. Fix the SPA-render/LCP path and both scores rise.

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Bundle | `assets/index-C_lcnk_L.js` (~180 KB) — the Vite/React app entry |
| LCP gate | client render → `/api/value/price-vs-own-median` fetch (the value-drops feed, ADR-087) |
| CLS node | `article.gma-card > div.gma-deal-grid` — deal grid hydrating after first paint |
| Render-block | `assets/index-DvMHRGYt.css` (6.8 KB, low impact) |

## Conclusion

**Confidence:** High. Root cause is Confirmed from the reports' own dependency tree and metric audits: a client-rendered SPA defers the LCP element behind bundle execution + an API call, and post-hydration deal-grid insertion causes CLS. Accessibility/Best-Practices/SEO are already maxed, so all realistic gains are in Performance.

## Recommended Next Steps

### Fix direction (ranked by score impact)
1. **LCP — inline/prerender above-the-fold content.** Get the hero/first card into the initial HTML instead of waiting on the JS bundle + API. This aligns with the already-open ADR-082 crawler-HTML / `window.__GMA_DATA__` snapshot work; extending that to render (not just embed data for) the first screen removes the longest critical chain. Also `<link rel="preload">` the LCP image and, if the value API gates it, embed that payload in the initial HTML snapshot so no round trip is needed.
2. **CLS — reserve space for the deal grid.** Give `gma-deal-grid` (and the store card) a `min-height` / skeleton matching the loaded layout so hydration doesn't push content down. Targets the 0.254 shift → recovers ~12 points on the past-gate score.
3. **Unused JS — defer analytics + code-split.** Load gtag after `load`/idle (or via `requestIdleCallback`); it is the biggest single unused chunk and third-party. Route-level code-split the app bundle to shed its ~60 KB unused.
4. *(Low ROI)* Inline the 6.8 KB critical CSS to clear the render-blocking flag; small gain.

### Diagnostic
- Confirm the LCP element identity by re-running Lighthouse with the `largest-contentful-paint-element` audit populated (LH 13 left it empty here), or via DevTools Performance → LCP marker.
- After the min-height fix, re-run the PAST-gate scenario to verify CLS < 0.1.

## Reproduction Plan
Mobile Lighthouse (simulated throttling) against `https://gmaslist.com/`, once with the age gate visible and once dismissed. Expected: Perf 76 / 64, LCP ~5 s both, CLS 0.001 / 0.254 — matching the two captured reports.

## Side Findings
- Agentic Browsing dropped 100 → 83 only in the past-gate run; likely tied to the same interstitial/hydration behavior. Worth a separate look if that category matters for AI-crawler visibility (spec_seo-crawler-visibility).
- All metric `displayValue`s in the reports show a mojibake space (`3.1�s` = `3.1 s`); cosmetic, encoding-only.
