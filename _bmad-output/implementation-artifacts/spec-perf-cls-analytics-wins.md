---
title: 'Quick Lighthouse wins: kill font/image CLS + defer analytics'
type: 'bugfix'
created: '2026-07-18'
status: 'done'
baseline_commit: '5f792d731abc1b79d930d5e68434d54057f23607'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/investigations/lighthouse-perf-investigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Mobile Lighthouse past the age gate scores Performance 64, dragged by CLS 0.254 (score 0.49) and ~68 KiB of render-time-unused analytics JS. LH attributes the layout shift to two causes: web-font FOUT reflow (0.232, the dominant share) and the location-pin image "lacking an explicit size" (0.021). The deal grid is what gets *pushed*; it is not itself resizing (a `min-height` on it would not help), and the loading→loaded shift is already reserved via the skeleton's `minHeight:100vh` (ADR-081).

**Approach:** Three surgical, low-blast-radius edits: (1) switch the Google Fonts URLs from `display=swap` to `display=optional` so a late font never swaps in and reflows text; (2) give `.gma-location-pin` an explicit CSS `width`/`height` so its box is reserved; (3) defer the heavy `gtag.js` download to browser idle after `load`, keeping the `dataLayer`/`gtag()` stub so early events still queue and flush.

## Boundaries & Constraints

**Always:** Preserve the `</head>` marker and the existing `<script type="application/ld+json">` block exactly (shellRoute snapshot injection anchors on `</head>`; indexHtml.test.ts guards the JSON-LD). Keep GA measurement working — `gtag('js')` and `gtag('config','G-Z3EH6D5C89')` must still run and events must still reach GA once the deferred script loads. Fonts stay non-render-blocking (keep the `media="print" onload` pattern).

**Ask First:** Any change beyond these three edits; touching the skeleton/`useDeals` loading path; removing analytics entirely.

**Never:** Add a `min-height` to `.gma-deal-grid` (does not address the measured cause). Re-introduce a render-blocking stylesheet link. Change GA measurement ID, consent behavior, or the JSON-LD/meta entity copy. Hardcode versioned `fonts.gstatic.com` file URLs (brittle).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Web font arrives late (first visit, slow net) | `display=optional` | Fallback font used for the whole load, NO swap → no font-caused CLS | N/A |
| Web font cached (repeat visit) | font in HTTP cache | Brand font applies within the short block window; no shift | N/A |
| Location bar paints | `.gma-location-pin` 36×36 | Box reserved from first layout; no shift from the pin | N/A |
| Analytics event fired before gtag.js loads | `gtag(...)` called during hydration | Call pushed to `window.dataLayer`, queued | N/A |
| Browser reaches idle after load | `requestIdleCallback` (or `setTimeout` fallback) | `gtag.js` script appended; queued dataLayer flushes to GA | Missing `requestIdleCallback` → `setTimeout` fallback |

</frozen-after-approval>

## Code Map

- `client/index.html` -- head has the gtag inline+async block (lines ~4–12) and the three Google Fonts URLs carrying `display=swap` (preload href, stylesheet href, noscript href).
- `client/src/styles/components.css` -- `.gma-location-pin` rule (~line 730) sets `object-fit`/`flex` but no width/height.
- `server/routes/shellRoute.ts` -- injects `window.__GMA_DATA__` before `</head>`; unaffected but must not be broken.
- `client/src/indexHtml.test.ts` -- guards meta description + JSON-LD only; must stay green.
- `client/src/components/DealFeed.tsx` -- reference only: skeleton `minHeight:100vh` already reserves loaded-feed space (do not change).

## Tasks & Acceptance

**Execution:**
- [x] `client/index.html` -- replace `display=swap` with `display=optional` in all three Google Fonts URLs (preload, stylesheet, noscript) -- stops late-font swap reflow, the dominant CLS cause.
- [x] `client/index.html` -- rewrite the gtag block so the inline stub (`dataLayer`, `gtag()`, `gtag('js')`, `gtag('config',…)`) stays inline, but the `https://www.googletagmanager.com/gtag/js?id=G-Z3EH6D5C89` `<script>` is created and appended inside a `load`→`requestIdleCallback` (with `setTimeout` fallback), not loaded up front -- removes ~68 KiB from the initial-load critical path while keeping measurement.
- [x] `client/src/styles/components.css` -- add `width: 36px; height: 36px;` to `.gma-location-pin` -- reserves the image box so LH's "media lacking explicit size" shift clears.

**Acceptance Criteria:**
- Given a fresh mobile load past the age gate, when Lighthouse re-runs, then CLS drops below 0.1 (from 0.254) and the layout-shifts audit no longer lists "Web font loaded" or the location-pin as culprits.
- Given the page loads, when the browser goes idle after the `load` event, then `gtag.js` is fetched and any `dataLayer`-queued events are sent to GA (measurement unchanged, just later).
- Given the client build runs, when `tsc -b && vite build` executes, then it succeeds and `indexHtml.test.ts` + `shellRoute.test.ts` stay green.
- Given the served HTML, when the shell route runs, then exactly one `window.__GMA_DATA__` script is still injected before the single `</head>`.

## Spec Change Log

- **2026-07-18 — review patches (no spec loopback; two `patch`-class findings auto-fixed).**
  1. *Shared-class size regression (edge-case hunter, confirmed).* The first cut set `width/height:36px` on the base `.gma-location-pin`, which is reused at 16px (`LocationInput.tsx:68`), 22px (`VehicleSelector.tsx:136`), and 56px (`LocationOnboarding.tsx:70`, inline-protected). Fixed by scoping the explicit size to `.gma-location-bar__label .gma-location-pin` — the actual LH-flagged element — leaving the pickers' sizes intact.
  2. *Idle-callback starvation (blind + edge-case hunters).* `requestIdleCallback(cb)` had no `{ timeout }`, so a never-idle main thread could strand gtag.js and the queued events. Added `{ timeout: 3000 }`; `setTimeout` fallback retained for engines without rIC.
  - Accepted/not-actioned: `display=optional` fallback-font-on-first-visit (Erik's explicit trade); gtag adblock/onerror loss (pre-existing under the old eager `async` tag too). Known residual: deferring GA drops pageviews for very-fast bounces — inherent to the requested deferral.

## Design Notes

`display=optional` is the deliberate trade Erik chose: on a slow first visit the brand fonts (Space Grotesk / Plus Jakarta Sans / Space Mono) may not appear until a later cached load, in exchange for eliminating the swap reflow. Keep the `media="print" onload="this.media='all'"` non-blocking pattern from ADR-081 — only the `display=` query param changes.

Analytics defer pattern (keep the stub inline so nothing is lost):

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-Z3EH6D5C89');
  addEventListener('load', function () {
    (window.requestIdleCallback || function (cb) { setTimeout(cb, 1500); })(function () {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=G-Z3EH6D5C89';
      document.head.appendChild(s);
    });
  });
</script>
```

## Verification

**Commands:**
- `npm run build --prefix client` -- expected: `tsc -b && vite build` succeeds; built `dist/index.html` contains `display=optional` and no eagerly-loaded `gtag/js` in `<head>`.
- `npm test --prefix client -- --run` -- expected: green, incl. `indexHtml.test.ts`.
- `npm test --prefix server -- --run shellRoute` -- expected: green (snapshot still injects before the lone `</head>`).

**Manual checks:**
- Re-run mobile Lighthouse on the past-age-gate flow: CLS < 0.1, Performance improved; layout-shifts audit free of font/location-pin culprits.
- In DevTools Network, confirm `gtag/js` requests only after `load`/idle, and Realtime GA still records a hit.

## Suggested Review Order

**CLS fix — web-font FOUT (dominant, ~91% of the shift)**

- Entry point: the ADR-081 non-blocking font pattern kept intact; only `display=` flips swap→optional so a late font never reflows text.
  [`index.html:74`](../../client/index.html#L74)
- Same change on the applied (`media="print"`) stylesheet link and the noscript fallback.
  [`index.html:77`](../../client/index.html#L77)

**CLS fix — location-pin box (minor, ~8%)**

- Explicit size scoped to the flagged bar pin only; base class untouched so the 16/22/56px picker reuses keep their sizes (review patch).
  [`components.css:741`](../../client/src/styles/components.css#L741)

**Analytics defer**

- Inline `dataLayer`/`gtag()` stub stays; `gtag('js')`/`gtag('config')` still run at parse time so early events queue.
  [`index.html:13`](../../client/index.html#L13)
- Heavy `gtag.js` appended at idle after `load`; `{ timeout: 3000 }` caps idle-callback starvation, `setTimeout` fallback for older engines (review patch).
  [`index.html:24`](../../client/index.html#L24)
