---
baseline_commit: d4d8e28646700510d23d38de6896ec5ec0858e00
---

# Story 3.2: In-app value cards (Derivation Epic 3, slice 2)

Status: done

<!-- create-story 2026-07-13. Story key: derivation-3-2-in-app-value-cards. Epic: epic-derivation-3
     ("Feed the surfaces"), which is already in-progress (3-1 SEO pages done). This is the SECOND and
     final Epic-3 slice — the in-app surface, unblocked now that Epic 2 (FR13 price-vs-own-median) shipped. -->

> ⚠️ **DEV-START RATIFICATION REQUIRED.** This surface is genuinely new (first in-app consumer of the
> derived value facts) and has **no UX spec**. Two decisions are load-bearing and change the whole
> shape of the work — **read “Questions for Erik” (bottom) and get his call before writing code.**
> The ACs below are written for the **recommended MVP** (a single flagship “real price drop” surface
> over `price-vs-own-median`); if Erik picks a different scope, revise ACs first. This mirrors the
> established derivation-story pattern (proposed defaults, Erik ratifies at dev-start).

## Story

As a Gma's-list shopper,
I want an honest, in-app “this product is actually cheaper than its own usual price” signal,
so that I can tell a *real* price drop from a meaningless banner percentage — the one honest discount the engine can now compute.

## Why now / context

- **Epic 3 = two slices.** Slice 1 (SEO `/compare` pages, `derivation-3-1`) shipped + code-reviewed 2026-07-13 (ADR-079). This is slice 2, the **in-app** surface.
- **The blocker is gone.** In-app value cards were deferred (`deferred-work.md` §“Epic 3 slice decision”) because the flagship card — “how good is this deal vs its own history” — needed Epic 2 Story 2.1 (**FR13, price-vs-own-rolling-median**), which was parked. Epic 2 is now **done** (all 3 stories, retro ratified 2026-07-13). The keystone honest-discount fact is produced daily.
- **The retro named this next.** `epic-derivation-2-retro-2026-07-13.md`: “Epic 3 = close 3-1 then **in-app value cards**.” 3-1 is closed → this is the named next story.

## The one thing that makes this hard (read before ACs)

The in-app deal feed is **store-keyed**: `DealFeed` renders one `DealCard` per store, showing that store's *banner deals* (`Dispensary.deals[]`, keyed by store id). The honest value facts are **product-keyed**: `price-vs-own-median` rows are keyed by `(dispensaryId, productId, option)`. **There is no product-level join in the current UI** — the banner deal text is free-form marketing copy, not a SKU reference. The deal→SKU bridge (`deal-scope.json`) exists but is deliberately honesty-gated to emit **no savings number** (it links scope + temporal window, not a discount).

**Consequence:** you cannot cleanly bolt a “this deal is X% below median” badge onto an existing `DealCard`, because a banner deal doesn't reference the product whose median we know. The honest, low-friction surface is therefore a **product-level list of today's genuine price drops**, joined to the store list we already load — **not** a per-deal-card badge. That is the recommended MVP (Option B in Questions for Erik).

## Two facts the runner already produces but Render does NOT yet serve

`server/scripts/deriveFactsRun.ts` writes and `scripts/derive-facts-local.ps1` commits these, but **no HTTP route exposes them** — `server/routes/valueRoute.ts` serves only `disparities`, `deal-scope`, `disparity-rollups`:

| Derived file | Fact | Served today? |
|---|---|---|
| `price-vs-own-median.json` | **flagship**: current price vs the SKU's own rolling median (the only honest discount, FR13/Gate 2) | ❌ **no route** |
| `cheapest-delivered.json` | per match-key cheapest incl. round-trip fuel (FR14) | ❌ no route |
| `regional-price-floor.json` | per-cluster floor + availability gap (FR15) | ❌ no route |
| `disparities.json` | same-product cross-store price spread | ✅ `/api/value/disparities` |

So **adding a served route** for whatever fact the cards consume is in-scope, load-bearing work — not just client work.

> Note: `price-vs-own-median.json` / `cheapest-delivered.json` / `regional-price-floor.json` are **not currently committed** in `server/data/derived/` (home `products.db` was empty on 2026-07-12 — see memory). Verify the feeders repopulated and a fresh `derive-facts-local.ps1` run has committed these files before relying on live data. They are already in `$derivedFiles`, so they republish on the next derive; the served route's fail-soft empty envelope covers the not-yet-committed window.

## Acceptance Criteria (recommended MVP: flagship “real price drop” surface)

**Served route (server)**

1. **Given** the shipped `readDerived` / honesty-envelope machinery in `server/routes/valueRoute.ts`
   **When** a `GET /api/value/price-vs-own-median` route is added and registered in `server/index.ts` (before the production SPA fallback, and proxied in Vite dev like the other value routes)
   **Then** it reads `server/data/derived/price-vs-own-median.json`, returns the `{ data, excluded, coverage, generatedAt }` envelope unchanged, and **fail-soft**s a missing/malformed/wrong-shape file to a referentially-stable `EMPTY_PRICE_VS_OWN_MEDIAN_ENVELOPE` (`generatedAt` = epoch, never “now”) — never a 500, never a read of raw product data (the load-bearing rule). Mirror `disparitiesRoute` exactly; add the empty-envelope constant + a route unit test alongside the existing `valueRoute.test.ts` cases.

**Client fetch (fail-soft, additive)**

2. **Given** the client loads the deal feed via `useDeals`
   **When** a sibling hook (e.g. `useValueDrops`) fetches `/api/value/price-vs-own-median`
   **Then** it uses the same fail-soft posture as `useDeals`: a non-ok response, malformed JSON, or an empty/epoch envelope yields **zero drops** and renders nothing — the value surface is purely additive and can never break the deal feed or crash render. No new global, no change to `useDeals`.

**The honest signal (Honesty Contract — hard)**

3. **Given** a `price-vs-own-median` row with `pctVsMedian < 0` (below its own median = the honest discount)
   **When** it renders
   **Then** it shows the product `name`, the store (joined `dispensaryId` → `Dispensary.name` from the already-loaded `/api/data`), the `option` label verbatim, and the drop as a fixed-format figure (e.g. “**19% below its usual**” and/or “$X.XX vs $Y.YY usual”), in the design-system value accent — **never** a verdict word (no “great deal”/“best”/“steal”; ADR-009), **never** a health claim (ADR-066/UDAP), and **never** the banner `discountPct` (Gate 2 — the flat banner % carries no signal; it must not appear anywhere on this surface).

4. **Given** the `pctVsMedian` sign
   **Then** a row **at or above** its own median (`pctVsMedian >= 0`) is **not** shown as a drop — the runner already emits movers-only, but the client must not re-derive or invent a discount; it renders only what the fact asserts (Honest Math: no fabricated numbers, suppress when absent).

5. **Given** the store join
   **When** a row's `dispensaryId` is **not** present in the loaded dispensary list (store dropped/renamed), or that store's `status` is `failed`/`stale`
   **Then** the row is dropped (or its store label degrades honestly), never rendered against a fabricated store name — Honest Math.

**Placement / surface (store-keyed feed is preserved)**

6. **Given** the deal feed is store-keyed and this fact is product-keyed
   **When** the value surface renders
   **Then** it renders as its **own section** (recommended: a “Real price drops” block; exact placement/label is a Question for Erik), **not** as a per-`DealCard` savings badge — the store-keyed `DealCard`/`DealFeed` contract, listitem-per-store count (a11y), urgency/border logic, and deal-block rendering are **unchanged**. If the surface shows nothing (no drops today), it renders nothing and leaves the feed visually intact.

**Style + a11y + tests (binding UX contract)**

7. **Given** the binding design system (`ux-Happy-2026-06-11/DESIGN.md`, `EXPERIENCE.md`) and its Honest Math rules
   **Then** figures use the tabular/slashed-zero figure type and fixed formats (dollars 2dp, percent whole-number), the surface reuses existing `ui/` primitives (`Card`, etc.) + tokens (no color literals), meets the same AA contrast bar as the shipped surfaces, and ships strict-typed with tests: the new route + empty-envelope fail-soft, the hook's fail-soft paths, the sign/verdict/banner-% honesty gates (a test asserting no banner % and no verdict word reach the DOM), and the store-join drop rule.

## Tasks / Subtasks

- [x] **Task 0 — Ratify scope with Erik** (blocks all below). Get his call on the two Questions (which cards; surface placement/label). If he picks anything other than the flagship-only MVP, revise ACs first. (AC: all)
  - [x] Ratified 2026-07-13: scope = **flagship-only MVP** (price-vs-own-median) → ACs stand unchanged. Surface = **standalone "Real price drops" section at TOP of feed** (Option B). Erik additionally requested a **UX pass (Sally / bmad-ux) before build** → dev paused pending value-card layout spec (Q3 answered "run a UX pass first").
- [x] **Task 1 — Served route** (AC: 1)
  - [x] Add `EMPTY_PRICE_VS_OWN_MEDIAN_ENVELOPE` + `priceVsOwnMedianRoute` to `server/routes/valueRoute.ts` (mirror `disparitiesRoute`; import the `PriceVsOwnMedianReport` type).
  - [x] Register `GET /api/value/price-vs-own-median` in `server/index.ts` before the SPA fallback. (Vite dev proxy needs NO new entry — the existing catch-all `'/api': 'http://localhost:3001'` rule already proxies every `/api/value/*` route, same as disparities/deal-scope/rollups.)
  - [x] Tests in `valueRoute.test.ts`: happy read (envelope + report shape + Gate-2 no `discountPct` on rows + independence), plus the fail-soft missing/wrong-shape cases extended to the new empty envelope. 22/22 green.
- [x] **Task 2 — Client fetch hook** (AC: 2)
  - [x] `client/src/hooks/useValueDrops.ts` (+ test): fetch `/api/value/price-vs-own-median`, validate the envelope shape via exported pure `selectDrops`, expose `{ drops, isLoading, error }`; every failure path → `drops: []`. `selectDrops` also filters to `pctVsMedian < 0` so an above-median premium (the fact is movers-only) can never surface as a drop (AC4). New client type `PriceDropRow` added. 9/9 green.
- [x] **Task 3 — Value surface component** (AC: 3, 4, 5, 6, 7)
  - [x] `client/src/components/ValueDrops.tsx` (+ test) renders the flagship rows per the ratified UX spec (`real-price-drops-surface.md`): Card `as="section"`, "Real price drops" `<h2>` + count, local `<ul>` ledger rows; joins `dispensaryId` → store name from the loaded dispensary list; drops unmatched + failed/stale-store rows. New `gma-value-drops__*` CSS in `components.css` (tokens only, mono/tabular figures, single amber discount hue).
  - [x] Wired between the distance slider and the store feed (UX-ratified placement) via a one-line additive edit in `DealFeed.tsx`, passing the FULL unfiltered dispensary list (drops are not distance-filtered). `DealCard.tsx` untouched; the feed's `<ul>` listitem-per-store count is unchanged (the section is a sibling, not nested).
  - [x] Honesty-gate tests (8): no banner `discountPct` / no verdict word reaches the DOM; store-join drop (absent + failed/stale); whole-number percent + 2dp dollars; spelled-out accessible name with full product name; separate `<ul>` region. AC4 (`pctVsMedian >= 0` never shown) is enforced + tested in `selectDrops` (Task 2). Two pre-existing DealFeed tests that asserted a global no-fetch were updated to mock `useValueDrops` (their intent — useDeals used the snapshot — is preserved).
- [x] **Task 4 — Verify end-to-end** (AC: all)
  - [x] `price-vs-own-median.json` is NOT yet committed (home `products.db` was empty 2026-07-12) → relying on the empty-envelope fallback, as the story authorizes. Verified BOTH live paths on the built server: (a) file absent → `GET /api/value/price-vs-own-median` returns HTTP 200 with the epoch empty envelope (no 500); (b) a realistic file placed in the dist derived dir → the route serves both rows with the real `generatedAt`, and `selectDrops` filters to the 1 below-median drop the surface renders. Temp files removed; derived dir unchanged. The real file republishes on the next `derive-facts-local.ps1` run (already in `$derivedFiles`).
  - [x] Client suite **581** green, server suite **682** green; real production build clean — client `tsc -b && vite build` and server `tsc && copyData.mjs` both succeed (not just `tsc --noEmit`).

## Dev Notes

### Architecture patterns & constraints
- **Read-only, additive, fail-soft (load-bearing).** Render never opens the home DB and never recomputes. The route just reads a committed file through `readDerived(path, EMPTY_*)`; a missing/bad file degrades to a stable empty envelope (epoch `generatedAt`), never a 500. Copy `valueRoute.ts` line-for-line in posture. `[Source: server/routes/valueRoute.ts:10-108]`
- **Honesty Contract is hard on every surfaced fact** (`epics-derivation-engine.md` §Cross-cutting AC; `epic-derivation-3-context.md`): Gate 1 (same-product $/g only — N/A here, this fact makes no cross-product/$-g claim by construction), **Gate 2 (banner % carries no signal — the entire point of this card)**, Gate 3 (gap tolerance — already enforced in the fact), no potency (Gate 5, non-goal), Inspectability (the fact carries `excluded[]`/coverage).
- **Legal posture (ADR-066, CLOSED).** Public/in-app fact surfaces are cleared; retained caveats bind this UI: **no health claims, nothing UDAP-deceptive, facts-not-menus** (surface the computed drop, never reproduce a store menu), no licensee ad creative. WA-only framing. `[Source: ADR.md ADR-066]`
- **No verdicts (ADR-009).** Report time/facts, never a “good/bad deal” judgment — same rule the deal cards already obey (`storeUrgencyBadge` reports time, never a verdict). `[Source: client/src/components/DealCard.tsx:62-63]`
- **Honest Math (binding UX rule).** Fixed formats, tabular figures, and — critically — **suppress rather than fabricate**: no distance/price/percent is ever invented; absent data renders nothing. `[Source: ux-Happy-2026-06-11/EXPERIENCE.md §Honest Math Rules]`

### The flagship fact's shape (what you render)
`PriceVsOwnMedianRow` = `{ dispensaryId, productId, name, category, option, currentPrice, medianPrice, pctVsMedian, observedDays }`. `pctVsMedian` = `(current − median) / median`, **negative = the honest discount**. Rows are movers-only and pre-sorted. Report also carries counts (`comparedCount`, `belowMedianCount`, `belowFloorCount`, …) for an optional “N genuine drops today” header. **There is no store display name on the row — only `dispensaryId`** → you must join to `Dispensary.name` from the already-loaded `/api/data`. `[Source: server/utils/priceVsOwnMedian.ts:56-81]`

### Source tree — files to touch
- **Server (NEW route):** `server/routes/valueRoute.ts` (+`.test.ts`), `server/index.ts` (registration), `client/vite.config.ts` (dev proxy).
- **Client (NEW surface):** `client/src/hooks/useValueDrops.ts` (+test), `client/src/components/ValueDrops.tsx` (+test); one small wire-in edit where `DealFeed` is composed (App/feed container) to slot the section — **DealFeed.tsx and DealCard.tsx themselves stay unchanged.**
- **Read but do not change:** `client/src/hooks/useDeals.ts` (fail-soft template + the dispensary list you join against), `client/src/types/index.ts` (`Dispensary`, `StoreStatus`), `client/src/components/ui/` (primitives), `server/routes/aboutRoute.ts`/`compareRoute.ts` (SSR value-fact precedent, if a server surface is ever chosen).

### What must be preserved (regression surface)
- `DealFeed` renders exactly one listitem per store (a11y count) — do not nest the value section inside the feed's list. `[Source: client/src/components/DealCard.tsx:135-138]`
- `useDeals`' snapshot/fetch dual path and its single validation boundary — do not route value data through it. `[Source: client/src/hooks/useDeals.ts:20-39]`
- Deals pipeline / `data.json` / `/api/data` / existing types' behavior — untouched (FR3, NFR5).

### Testing standards
TypeScript strict; test every new module (project rule + NFR6). Prioritize the honesty-gate assertions (no banner %, no verdict, no `>= 0` row shown as a drop, store-join drop) and the fail-soft paths (route + hook) — those are the load-bearing correctness properties, not the layout.

### Project Structure Notes
- Naming follows the derivation-story convention (`derivation-N-M-slug.md`; standard stories are `derivation-*`, only the quick-dev SEO slice was `spec-derivation-3-1-*`).
- The value routes cluster under `/api/value/*` and read `server/data/derived/*.json` through one shared `readDerived` — the new route fits that pattern with zero new infra.
- No new derived artifact and no runner change: this story is a **consumer** of already-produced facts (the runner + `$derivedFiles` already emit/commit them).

### References
- `[Source: _bmad-output/planning-artifacts/epics-derivation-engine.md §Epic 3, §Honesty Contract, FR13/D6]`
- `[Source: _bmad-output/implementation-artifacts/epic-derivation-3-context.md]` (Epic-3 binding context; note it was scoped to the SEO slice — the constraints still apply)
- `[Source: _bmad-output/implementation-artifacts/deferred-work.md §“Epic 3 slice decision (2026-07-10)”]` (the deferral this story closes)
- `[Source: _bmad-output/implementation-artifacts/epic-derivation-2-retro-2026-07-13.md]` (retro naming this next)
- `[Source: server/utils/priceVsOwnMedian.ts]` (flagship fact + row shape) · `[Source: server/routes/valueRoute.ts]` (route pattern to mirror) · `[Source: server/scripts/deriveFactsRun.ts:405-483]` (facts produced) · `[Source: scripts/derive-facts-local.ps1:50-61]` (`$derivedFiles` commit list)
- `[Source: client/src/hooks/useDeals.ts, client/src/components/DealCard.tsx, client/src/types/index.ts]`
- `[Source: ADR.md ADR-066 (legal), ADR-079/ADR-078 (SSR value-fact precedent)]`
- `[Source: _bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/{DESIGN.md,EXPERIENCE.md}]` (binding style + Honest Math)

## Questions for Erik (RESOLVE AT DEV-START — load-bearing)

1. **Which value card(s) in this first slice?** Recommend **flagship-only MVP**: the `price-vs-own-median` “real price drop” surface — highest value, now-unblocked, honesty-cleanest, one new route. Options to expand later (each is another served route + surface): cross-store cheapest (`disparities`, already served), cheapest-**delivered** with fuel (`cheapest-delivered`), brand availability (`brand-store-matrix`), regional floor (`regional-price-floor`). **Recommendation: ship flagship-only; defer the rest to follow-up slices.**
2. **Surface shape & placement.** Because deals are store-keyed and this fact is product-keyed, recommend a **standalone “Real price drops” section** (Option B) above/below the feed — *not* a per-`DealCard` badge (Option A), which would need the honesty-gated `deal-scope` join and can't honestly carry a savings number. Confirm Option B, and give the section a label/placement (e.g. top of feed vs. its own tab). **A per-card badge (Option A) is possible but materially larger and honesty-fragile — flag if you want it.**
3. **UX-spec gap (FYI, not blocking).** No UX design exists for value cards; `DESIGN.md`/`EXPERIENCE.md` bind style + Honest Math but define no value-card layout. The MVP reuses existing primitives/tokens. If you want a real UX pass (Sally / `bmad-ux`) before build, say so — otherwise dev proceeds on the design-system primitives.

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (bmad-dev-story)

### Debug Log References

### Completion Notes List
- **2026-07-13 dev-start ratification (Task 0):** Erik ratified the flagship-only MVP (`price-vs-own-median` "real price drop" surface) — ACs stand unchanged. Surface placement = standalone "Real price drops" section at the **top of the feed** (Option B); no per-DealCard badge. Erik chose to **run a UX pass (Sally / bmad-ux) before build** (Question 3), so dev paused after Task 0 pending a value-card layout spec.
- **2026-07-13 UX spec landed + build (Tasks 1–4):** Resumed once `real-price-drops-surface.md` (Sally, final, Erik-ratified) landed — it fixed placement (between the distance slider and the store feed) and the ledger-row anatomy. Implemented per ADR-087:
  - **Route (Task 1):** `GET /api/value/price-vs-own-median` mirrors `disparitiesRoute` exactly (fail-soft empty envelope, epoch `generatedAt`, never 500/never a raw read). No Vite proxy change (the `'/api'` catch-all already covers it). +7 route tests incl. a Gate-2 assertion that no served row carries `discountPct`. 22/22 green.
  - **Hook (Task 2):** `useValueDrops` (sibling of `useDeals`, does not route through it); exported pure `selectDrops` validates the envelope and filters to `pctVsMedian < 0` so the movers-only fact's above-median PREMIUMS never surface as drops (AC4). 9/9 green.
  - **Surface (Task 3):** `ValueDrops.tsx` + `gma-value-drops__*` CSS (tokens only). Joins `dispensaryId`→store name from the FULL unfiltered dispensary list (drops aren't distance-filtered); drops absent/failed/stale-store rows; whole-number %/2dp $ in mono/tabular figures; single amber `--discount` hue; spelled-out per-row accessible name. Wired via a one-line additive `DealFeed.tsx` edit — `DealCard`/`useDeals`/`data.json` untouched, feed one-listitem-per-store a11y count preserved. 8/8 green.
  - **Verify (Task 4):** Both live paths smoke-tested on the built server (empty fallback → HTTP 200 epoch envelope; populated dist file → rows served, client filters to the below-median drop). Client 581 + server 682 green; real `tsc -b && vite build` + server `tsc` clean.
- **One deliberate deviation from the UX spec (flag for Erik):** the "N today" count reflects the number of rows *actually rendered* (post store-join), not the report's `belowMedianCount`. A count that can never exceed the visible list is strictly more honest (no "says 4, I see 3"); trivially reversible (expose `belowMedianCount` from the hook) if you prefer the spec's wording.
- **Data note:** `price-vs-own-median.json` is not yet committed (home DB empty 2026-07-12); the empty-envelope fallback covers it and it republishes on the next home derive. The surface renders nothing until then — which is the intended additive/fail-soft behavior, not a bug.

### File List
- `server/routes/valueRoute.ts` (M) — `EMPTY_PRICE_VS_OWN_MEDIAN_ENVELOPE` + `priceVsOwnMedianRoute` + `PRICE_VS_OWN_MEDIAN_PATH` + type import
- `server/routes/valueRoute.test.ts` (M) — new route describe block (4 tests) + fail-soft cases extended to the new empty envelope
- `server/index.ts` (M) — import + register `GET /api/value/price-vs-own-median` before the SPA fallback
- `client/src/types/index.ts` (M) — new `PriceDropRow` type
- `client/src/hooks/useValueDrops.ts` (A) — fetch hook + exported pure `selectDrops`
- `client/src/hooks/useValueDrops.test.ts` (A) — hook + `selectDrops` tests (9)
- `client/src/components/ValueDrops.tsx` (A) — the "Real price drops" surface
- `client/src/components/ValueDrops.test.tsx` (A) — surface + honesty-gate tests (8)
- `client/src/components/DealFeed.tsx` (M) — one-line additive wire-in of `<ValueDrops>`
- `client/src/components/DealFeed.test.tsx` (M) — mock `useValueDrops` (isolate the additive fetch)
- `client/src/components/DealFeed.distance.test.tsx` (M) — same mock
- `client/src/styles/components.css` (M) — `gma-value-drops__*` styles
- `ADR.md` (M) — ADR-087 + change-log entry

## Change Log
- 2026-07-13 — Story moved to in-progress; Task 0 (scope ratification) complete: flagship-only MVP, standalone "Real price drops" section at top of feed. UX pass requested before build → dev paused pending bmad-ux value-card layout spec.
- 2026-07-13 — UX spec (`real-price-drops-surface.md`) landed and ratified; resumed and completed Tasks 1–4 (served route + hook + surface + verify). ADR-087 recorded. Client 581 + server 682 green, real build clean. Status → review.

### Review Findings

_bmad-code-review 2026-07-13 (3-layer: Blind Hunter + Edge Case Hunter + Acceptance Auditor, Opus 4.8). Auditor: all 7 ACs satisfied. 1 decision-needed, 3 patches, 10 dismissed as noise/non-reachable._

- [x] [Review][Patch] Sub-0.5% drops display "0% below its usual" — the server emits movers down to ±0.01% (4dp, `pctVsMedian !== 0`); the client filters `pctVsMedian < 0` but rounds the headline % to a whole number and $ to 2dp, so a genuine tiny mover renders a claimed drop with a zero/invisible magnitude. **Decision (Erik 2026-07-13): suppress 0%-display rows.** FIXED: render filter now drops any row where `dropPercent(row.pctVsMedian) === 0`, so the surface only shows drops with a visible ≥1% magnitude. +test. `[ValueDrops.tsx]` (blind+edge)
- [x] [Review][Patch] `name` span not `aria-hidden` while sibling `meta`/`figure` are, under an `aria-label`'d `<li>` → screen reader announces the product name twice. FIXED: moved `aria-hidden="true"` to the whole `identity` div so the row's `aria-label` is the single spoken source. `[ValueDrops.tsx]` (blind)
- [x] [Review][Patch] Duplicate React key when `productId` is empty — `validateRow` substituted `''` for a missing `productId` while the key is `dispensaryId::productId::option`, so two option-sharing rows from one store could collide. FIXED: `validateRow` now rejects an empty/non-string `productId` (dropped the `''` default). +test. `[useValueDrops.ts]` (blind+edge)
- [x] [Review][Patch] Empty `option` string rendered a dangling "· " separator and a double-comma accessible name. FIXED: the visible meta collapses to the bare store name and `accessibleName` folds the option in only when present. +test. `[ValueDrops.tsx]` (edge)
