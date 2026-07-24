---
baseline_commit: 67730fd11ab5ab391b27c41138238074db9bb702
---

# Story: Crawler-visible homepage HTML + AgeGate content mounting (SEO Phase 0a-HTML + 0b)

Status: review

<!-- Cross-cutting spec-driven story (no numeric epic), tracked in sprint-status.yaml
as `crawler-visible-homepage-and-agegate`, sibling of compliance-launch-gate /
oracle-freshness-gate / spec-phase-0a-data-snapshot-injection. Created via
bmad-create-story 2026-07-23. Releases the Phase 0b legal go-ahead (Erik, on the
ADR-066 basis) and builds the two coupled changes that make `/` crawler-visible. -->

## Story

As **an operator who wants Gmas List at the top of AI search**,
I want **the homepage `/` to serve human-readable deal/store HTML that non-JS AI crawlers can read, and the age gate to mount real content in the DOM (behind an unchanged visual overlay) so JS crawlers see it too**,
so that **GPTBot, PerplexityBot, OAI-SearchBot, Claude-SearchBot and Googlebot index actual deals/stores instead of the empty `<div id="root">` shell they get today** — closing the one blocker worth ~90% of the SEO spec's value.

## Context & why now

- The homepage `/` serves an empty SPA shell: `curl -A "GPTBot/1.0" https://gmaslist.com/` returns `<body><div id="root"></div></body>`. All deal content paints client-side; non-JS crawlers see title + meta + thin JSON-LD only. Confirmed in `investigations/ai-crawler-invisible-homepage-investigation.md`.
- This gap is **deliberate, not a bug** (`server/routes/shellRoute.ts:29-32`): the crawler-visible HTML half of Phase 0a was deferred pending the **Phase 0b legal decision**. Erik released that go-ahead **2026-07-23** on the ADR-066 basis (WAC 314-55-155 binds licensed retailers, not an unlicensed aggregator; `/compare` and `/api/data` already publish deal-derived content un-gated).
- Scope confirmed by Erik: **0a-HTML + 0b together** (phases.md "Recommended Deployment Order" §1 — "the actual unlock").
- The SSR pattern is already proven and live on `/about` (ADR-078) and `/compare*` (ADR-079). This story extends it into the homepage and removes the JS-side content gate(s).

## Acceptance Criteria

1. **(0a-HTML — non-JS crawlers) `/` server-renders human-readable deal/store HTML.** The homepage response body contains real, escaped, semantic HTML — an `<h1>`, each in-range store's name, and its active deal text — built from the same `buildApiData()` output already injected as `__GMA_DATA__`. `curl -A "GPTBot/1.0" https://gmaslist.com/` (and any non-JS fetch) shows store names and deal titles in the served markup. Verified by supertest assertions on `res.text` mirroring `compareRoute.test.ts` style.
2. **The rendered deal HTML lives INSIDE `<div id="root">`** — the crawler-only sink React's `createRoot` wipes on hydration (`client/src/main.tsx:6` uses `createRoot`, not `hydrateRoot`). Humans in steady state never see un-gated deal content: the moment React mounts, `#root` is cleared and the age gate takes over. Assert the injected content is within the `#root` element, not a sibling/`<noscript>`. (This is the load-bearing AC from `HANDOFF_DECISION.md` caveat #1.)
3. **Every interpolated data string is HTML-escaped** (`& < >`) via a helper mirroring `compareRoute.ts`/`aboutRoute.ts` `escapeHtml`. Deal/store text is scraped and hostile-by-premise — the existing `shellRoute.test.ts` fixtures (`Store </script><script>alert(1)</script>`, `SAVE $$$ TODAY`, U+2028) must not break out of markup or corrupt the page. Use a **function** replacement, never a string replacement, when splicing into the shell (same `$`-pattern lesson already in `shellRoute.ts:63-67`).
4. **Snapshot/body parity + fail-soft preserved.** The body HTML derives from the same single `buildApiData()` call as `__GMA_DATA__` (no second derivation path — honest-math rule). On any build error or malformed/unreadable `data.json`, the route still returns **200** with the plain shell (no body HTML, no `__GMA_DATA__`) — every existing `shellRoute.test.ts` fail-soft case still passes. A missing `<div id="root">` marker logs and skips injection (mirrors the existing `</head>` guard) rather than throwing.
5. **(0b — JS crawlers) AgeGate mounts `children` in the DOM in all states.** `AgeGate.tsx` stops early-returning the gate without children; it always renders `{children}`, with the existing overlay dialog layered on top. While `!isIn`, the underlying content is made non-interactive and invisible to assistive tech via the React 19 native **`inert`** prop (+ `aria-hidden="true"`) on the content wrapper. The overlay (IconField `--surface-inverse` fill + 0.5 black scrim + card, `zIndex 50/51`) is already a full-bleed opaque takeover, so **human visual/behavioral impact is zero** — the gate looks and acts exactly as today.
6. **Gate integrity preserved.** While gated: the age attestation card + four WA `AGE_GATE_WARNINGS` remain the topmost, focus-trapped `aria-modal`/`alertdialog`; Tab stays trapped inside the gate (the underlying `inert` content is not focusable); "Yes I'm 21+", "Remember me" persistence, decline ("out" state), and the no-Escape rule all behave exactly as before. Verified by `AgeGate` tests: children present in DOM but `inert` when gated; children interactive and overlay gone once `isIn`.
7. **(JS crawlers reach the FEED, not the onboarding step) The `LocationOnboarding` gate gets the same treatment.** Today `App.tsx` renders `LocationOnboarding` *instead of* `DealFeed` until `onboarded`, so a JS crawler that renders past the age gate (fresh, no localStorage) lands on the onboarding prompt with the feed absent from the DOM. Restructure so the main feed (`Header`/`LocationBar`/`VehicleBar`/`DealFeed`/`DisclaimerFooter`) always mounts, and `LocationOnboarding` overlays it on top with the feed `inert` while `!onboarded` — mirroring AC5. Zero human visual change (onboarding is already an opaque `--surface-inverse` full-bleed overlay at `zIndex 45`). **RATIFIED IN SCOPE (Erik, 2026-07-23).**
8. **Compliance + ADR.** WA-only framing preserved; no NEW data exposure (payload already public via `/api/data`, deal-derived facts already un-gated on `/compare`). Deal titles rendered server-side are already sanitized at the `normalizeDeals` chokepoint (compliance-launch-gate) — do not re-sanitize, but DO escape. Log an ADR covering both the implementation AND the Phase 0b legal go-ahead release (Erik 2026-07-23, ADR-066 basis). **RATIFIED (Erik, 2026-07-23): render a static `21+`/WA-warning line into the crawler-facing server body** (defensible, consistent with the compliance-launch-gate posture; reuse `AGE_GATE_WARNINGS` copy where practical, or a minimal "For adults 21+. …" line).
9. **Green + live-verified.** `npm run build` (real `tsc -b && vite build`) clean; client + server test suites green. Post-deploy: `curl -sL -A "GPTBot/1.0" https://gmaslist.com/ | sed -n '/<body/,/<\/body>/p'` shows real store/deal text; the site renders and gates identically to today in a real browser.

## Tasks / Subtasks

- [x] **Task 1 — Server-render deal/store HTML into the shell body (AC 1,2,3,4)**
  - [x] Add a pure helper (in `shellRoute.ts` or a new `server/utils/renderShellBody.ts` with a unit test) that takes `buildApiData()` output and returns escaped semantic HTML: an `<h1>`, then per in-range store an `<h2>`/`<h3>` store name + a `<ul>` of that store's active deal titles. Keep it plain and WA-framed; reuse the `escapeHtml` pattern from `compareRoute.ts:55`.
  - [x] In `makeShellRoute`, after the existing `__GMA_DATA__`/`__GMA_DROPS__` head injection, inject the body HTML **inside** `<div id="root">…</div>` using a **function** replacement. Guard the marker's absence (log + skip, like the `</head>` guard). Both injections share the one `buildApiData()` result.
  - [x] Preserve every fail-soft path: malformed/unreadable `data.json` → plain shell, 200, no body HTML, no snapshot. Missing shell → 500 (unchanged).
  - [x] Extend `shellRoute.test.ts`: assert store name + deal title appear in `res.text` inside `#root`; assert hostile fixtures don't break out; assert the malformed/unreadable cases render neither `__GMA_DATA__` nor body deal text; assert exactly one `</head>` and one `#root`.
- [x] **Task 2 — AgeGate: mount children behind an inert overlay (AC 5,6)**
  - [x] Refactor `AgeGate.tsx`: remove the `if (isIn) return <>{children}</>` early return; always render a wrapper `<div inert={!isIn} aria-hidden={!isIn}>{children}</div>` with the overlay/backdrop rendered after it (on top via existing z-index) only while `!isIn`.
  - [x] Verify the IconField/scrim still fully occludes the mounted content (it does: opaque `--surface-inverse` + 0.5 scrim at `inset:0`); no CSS changes expected. Confirm no layout shift when the overlay unmounts on confirm.
  - [x] Tests (`AgeGate.test.tsx`): gated render → `children` in DOM but wrapper `inert`, overlay present, Tab trapped in gate; after confirm → wrapper not inert, overlay absent, children interactive; decline/"out" state unchanged; "Remember me" persistence unchanged.
- [x] **Task 3 — LocationOnboarding: same inert-overlay treatment (AC 7)** *(confirm scope at dev-start)*
  - [x] In `App.tsx`, always render the main feed block; render `LocationOnboarding` as an overlay on top while `!onboarded`, with the feed wrapper `inert`/`aria-hidden`. Preserve auto-advance (`onboarded` when `location` resolves), "Not now" → feed, and the persistent `LocationBar` later-change path.
  - [x] Confirm honest no-location state still holds (feed lists deals with no distances/gas until a location is set).
  - [x] Add/adjust tests for the always-mounted feed + inert onboarding overlay.
- [x] **Task 4 — Compliance, ADR, docs (AC 8)**
  - [x] Decide with Erik: static `21+`/WA-warning line in the crawler-facing body? If yes, add to the server-rendered shell body (mirrors the `/about` age-statement deferred item).
  - [x] New ADR: "Homepage crawler-visible HTML (Phase 0a-HTML) + AgeGate/onboarding content mounting (Phase 0b); Phase 0b legal go-ahead released by Erik 2026-07-23 on the ADR-066 basis." Cross-link ADR-052 (0a/0b risk-class split), ADR-066 (legal), ADR-078/079 (SSR pattern), ADR-082/092 (snapshot injection).
  - [x] Close the two deferred 0a-crawler-HTML items in `deferred-work.md`; update `docs/seo-ai-crawler-visibility-plan.md` / spec `phases.md` to mark 0a-HTML + 0b shipped; fix the stale "21 WA stores" store-count drift while there (registry is 20, ADR-056) if convenient.
- [x] **Task 5 — Verify (AC 9)**
  - [x] `npm run build` clean; full client + server suites green.
  - [x] Live smoke after deploy: `curl -sL -A "GPTBot/1.0" https://gmaslist.com/` shows deal/store text in `<body>`; `/about` + `/compare` unchanged; real browser renders/gates identically.

## Dev Notes

### Files to touch (current state → change → preserve)

- **`server/routes/shellRoute.ts`** (UPDATE). *Current:* reads `client/dist/index.html`, injects `__GMA_DATA__` + `__GMA_DROPS__` as an inline `<script>` before `</head>` via a **function** replacement (the `$`-pattern XSS lesson lives here, lines 63-67); fail-softs to the plain shell on any data error; `Cache-Control: no-cache`. *Change:* additionally splice escaped semantic deal/store HTML inside `<div id="root">`. *Preserve:* single `buildApiData()` call feeds both; all fail-soft paths; the function-replacement rule; `no-cache`.
- **`client/src/components/AgeGate.tsx`** (UPDATE). *Current:* `isIn = ageConfirmed === true || sessionConfirmed`; `if (isIn) return <>{children}</>` — **children are NOT in the DOM while gated**; otherwise renders `Backdrop` (IconField `--surface-inverse` + scrim, `zIndex 50`) + overlay `alertdialog` (`zIndex 51`, focus-trap via `handleKeyDown`, WA `WarningBar`). *Change:* always render `{children}` in a wrapper that is `inert`+`aria-hidden` while `!isIn`; overlay layered on top only when gated. *Preserve:* attestation flow, `useLocalStorage('gma_age_confirmed')`, session-only vs remembered confirm, decline/out state, focus trap, no-Escape, WA warnings, all styles. React **19.2.6** → `inert` is a native boolean prop (no polyfill).
- **`client/src/App.tsx` + `client/src/components/LocationOnboarding.tsx`** (UPDATE, Task 3). *Current:* `App` renders `LocationOnboarding` *instead of* the feed until `onboarded`; onboarding is a `zIndex 45` opaque `--surface-inverse` full-bleed `aria-modal` with its own focus trap. *Change:* always mount the feed; overlay onboarding on top with the feed `inert` while `!onboarded`. *Preserve:* auto-advance, "Not now", persistent `LocationBar`, honest no-location state.
- **`server/routes/shellRoute.test.ts`** (UPDATE) — add body-HTML visibility + escaping assertions; keep all fail-soft cases.
- **`client/src/components/AgeGate.test.tsx`** (UPDATE/NEW) — inert-while-gated + integrity assertions.
- **`ADR.md`**, **`deferred-work.md`**, **`docs/seo-ai-crawler-visibility-plan.md`** / spec `phases.md` (UPDATE) — decision trail + status.

### The two-gate architecture (load-bearing — don't half-build it)

There are **two** content-withholding gates in the React tree, both of which must stop withholding for a JS crawler to reach deals:
1. `AgeGate` (age) — AC5/6.
2. `LocationOnboarding` (first-run location) — AC7. Easy to miss: even with 0b done, a fresh JS crawler hydrates → age gate inert-overlaid → `children` = `LocationOnboarding` (because `onboarded === false`), and `DealFeed` is still absent from the DOM. Both gates use the identical opaque-full-bleed-overlay shape, so the same `inert`-behind-overlay fix applies cleanly to both with zero human visual change.

Note the crawler split: **non-JS crawlers** (GPTBot/Perplexity/OAI-SearchBot/Claude-SearchBot — Erik's primary AI-search audience) are satisfied entirely by AC1's **server-rendered HTML** and never touch the React gates. **JS crawlers** (Googlebot) render the DOM, so they need AC5+AC7. AC1 is the robust ~90%; AC5/7 extend it to JS crawlers.

### Injection & escaping specifics

- Inject body HTML by replacing `<div id="root"></div>` (Vite emits exactly this) with `<div id="root">${bodyHtml}</div>` via a **function** replacement — string replacements expand `$$/$&/$\`/$'` and would splice raw scraped text (review finding already encoded at `shellRoute.ts:63`).
- `escapeHtml` every interpolated store/deal string (`& < >`), per `compareRoute.ts:55`. Deal titles are already length-capped/blocklisted at `normalizeDeals` (compliance-launch-gate) — escape, don't re-sanitize.
- Pre-hydration flash: a sub-second window exists where the server body HTML is in a human's DOM before `createRoot` wipes `#root` (`HANDOFF_DECISION.md` caveat #2). Steady state is fully gated; this transient is the weaker form of the 0b question and is accepted under the released go-ahead. Do not add human-visible deal markup *outside* `#root`.

### DEV-START questions for Erik — BOTH RESOLVED 2026-07-23

1. **Task 3 (LocationOnboarding) in scope now?** → **YES.** Build 0a-HTML + 0b (AgeGate) + Task 3 (LocationOnboarding) together so both non-JS and JS crawlers reach the feed.
2. **Static `21+`/WA-warning line in the crawler-facing server body?** → **YES.** Render a static age/disclaimer line into the server body.

### Testing standards

- Vitest + supertest (server), Vitest + Testing Library (client), TypeScript strict. Mirror `shellRoute.test.ts` (readFileSync mock + supertest) and existing `AgeGate` tests. Assert behavior/visibleText, not implementation. Keep the hostile-text fixtures.

## References

- [Source: _bmad-output/specs/spec-seo-crawler-visibility/phases.md#Phase-0] — 0a/0b definitions, "0a+0b together = the actual unlock", What-Touches-What table.
- [Source: _bmad-output/specs/spec-seo-crawler-visibility/HANDOFF_DECISION.md] — code trace proving the 0a/0b seam; load-bearing caveats (inject inside `#root`; pre-hydration flash).
- [Source: _bmad-output/implementation-artifacts/investigations/ai-crawler-invisible-homepage-investigation.md] — confirmed root cause + fix direction + reproduction/verification commands.
- [Source: server/routes/shellRoute.ts:29-67] — the deferred-crawler-HTML comment + the `$`-pattern function-replacement lesson to reuse.
- [Source: server/routes/compareRoute.ts:55-83 / server/routes/aboutRoute.ts:99-108] — `escapeHtml`/semantic-SSR pattern to mirror (ADR-078/079).
- [Source: client/src/components/AgeGate.tsx / client/src/App.tsx / client/src/components/LocationOnboarding.tsx / client/src/main.tsx] — the two gates + `createRoot` (not `hydrateRoot`).
- [Source: server/utils/buildApiData.ts] — the single shared payload builder (filterActiveDeals + deriveStoreStatus).
- [Source: ADR.md ADR-052 (0a/0b risk split), ADR-066 (legal), ADR-082/092 (snapshot injection)].
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — the two deferred 0a-crawler-HTML entries this story closes.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story, 2026-07-23)

### Debug Log References

- Local runtime verify: `NODE_ENV=production node server/dist/server/index.js` + `curl -A GPTBot/1.0 http://localhost:3001/` → confirmed real store `<h2>`/deal `<li>` + 21+ line render inside `<div id="root">`, `__GMA_DATA__` present ×1, `$100`/`$$$` uncorrupted (function-replacement holds on the body path). First attempt 404'd because the shell only serves under `NODE_ENV=production` (resolves `client/dist` at repo root) — harness note, not a defect.

### Completion Notes List

- **AC1–4 (0a-HTML):** New `server/utils/renderShellBody.ts` builds escaped semantic HTML (`<h1>`, per-store `<h2>` + optional address + `<ul>` of active-deal `description`s, + a static WA 21+/health line). `shellRoute.ts` calls `buildApiData()` ONCE for both `__GMA_DATA__` and the body, splices the body inside `<div id="root">` via a **function** replacement (deal text has `$`), guards the marker's absence (logs + skips like the `</head>` guard), and preserves every fail-soft path (malformed/unreadable `data.json` → plain 200 shell; missing shell → 500). String-coercion on `description` is defensive fail-soft.
- **AC5–6 (0b AgeGate):** removed the `if (isIn) return children` early return; children now always render in a wrapper marked `inert`+`aria-hidden` while `!isIn`, with the existing `outOverlay`/`askOverlay` layered on top only when gated. Focus-trap, WA warnings, attestation, remember-me persistence, decline/out state, no-Escape rule all unchanged. React 19.2 native `inert`.
- **AC7 (0b LocationOnboarding):** `App.tsx` now always mounts the feed block, marks it `inert`+`aria-hidden` while `!onboarded`, and overlays `LocationOnboarding` on top — so a JS crawler past the age gate reaches the feed, not the onboarding prompt. Auto-advance, "Not now", persistent LocationBar preserved.
- **AC8 (compliance/ADR):** static 21+/WA line in the crawler body (ratified). ADR-097 logged (impl + Phase 0b legal go-ahead release, ADR-066 basis). Deferred 0a-crawler-HTML item closed in `deferred-work.md`; `phases.md` Phase 0 marked shipped.
- **AC9 (green + verified):** 599 client + 726 server tests green; real `npm run build` (`tsc -b && vite build` + server `tsc`) clean; built-server curl-as-GPTBot verified (see Debug Log).
- **Zero human visual change:** both gates' overlays are already opaque full-bleed takeovers occluding the mounted content; `inert` only removes interactivity/AT/focus.

### File List

- `server/utils/renderShellBody.ts` (new) — crawler-visible deal/store body HTML builder + static 21+ line.
- `server/utils/renderShellBody.test.ts` (new) — unit tests (heading/notice/sections, escaping, address, skip-no-deals/empty).
- `server/routes/shellRoute.ts` (modified) — inject body HTML inside `#root`; single shared `buildApiData()`; updated header comment.
- `server/routes/shellRoute.test.ts` (modified) — fixture deal gains `description`; new body-visibility + `$$$`-safety test.
- `client/src/components/AgeGate.tsx` (modified) — mount children behind inert overlay (Phase 0b).
- `client/src/components/AgeGate.test.tsx` (modified) — present-but-inert contract.
- `client/src/App.tsx` (modified) — always-mount feed; onboarding inert-overlay (AC7).
- `client/src/App.test.tsx` (modified) — +AC7 feed-inert-behind-onboarding describe block.
- `ADR.md` (modified) — ADR-097 + change-log row.
- `_bmad-output/implementation-artifacts/deferred-work.md` (modified) — closed the 0a-crawler-HTML deferral; noted body-HTML impact on the payload-size item.
- `_bmad-output/specs/spec-seo-crawler-visibility/phases.md` (modified) — Phase 0 shipped banner.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — story ready-for-dev → in-progress → review.

### Change Log

- 2026-07-23 — Implemented SEO Phase 0a-HTML + 0b (ADR-097). 12 files. 599 client + 726 server green; build clean; live-curl-verified. Status → review.
