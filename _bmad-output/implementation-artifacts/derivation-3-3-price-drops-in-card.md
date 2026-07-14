---
baseline_commit: 218f203caeb3c8c351a3f7d1f2338ccc313145f5
---

# Story 3.3: Move "Real price drops" into each store's card (Derivation Epic 3, slice 3)

Status: done

<!-- Derived 2026-07-13 (bmad-dev-story, from the UX spec) as a follow-up to derivation-3-2.
     Story key: derivation-3-3-price-drops-in-card. Epic: epic-derivation-3 (reopened in-progress).
     There is no create-story pass — the binding source is the ratified UX spec
     real-price-drops-in-card.md (Sally, Erik-ratified this session). ACs + tasks are derived
     verbatim from that spec so the design intent is the machine contract. -->

## Story

As a Gma's-list shopper,
I want a store's real price drop shown **inside that store's card** — next to its link, address, distance and deals — instead of in a separate block at the top of the feed,
so that all the information about one store reads together and I don't have to hunt for the store a drop belongs to.

## Why now / context

- **Erik's direct feedback (this session):** the top-of-feed "Real price drops" block (shipped in 3-2, ADR-087) is visually disconnected from the store cards that carry the link and the rest of the info. "The deal for the store should be with the cards so people see all information together."
- **UX pass done.** Sally produced + Erik ratified `real-price-drops-in-card.md` — the binding companion that supersedes the *placement* of `real-price-drops-surface.md` while keeping every honesty gate, copy, and number format unchanged.
- **Two ratified decisions carried into the ACs:** (1) drops **follow their store** on the distance filter (a drop past the slider is hidden with its store); (2) a store with a real drop but no banner deal **gets a card** so no drop is lost (union / no-drop-lost) — Erik chose this over freezing the feed's store set.

## Binding source

`_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/real-price-drops-in-card.md` — the ratified spec. On any ambiguity, defer to it and to `DESIGN.md`/`EXPERIENCE.md`. The fact, copy, number formats, and honesty gates are inherited verbatim from `real-price-drops-surface.md`; only placement changes.

## The change in one line

Retire the standalone top-of-feed `<ValueDrops>` section; render each renderable drop as a labeled "Real price drops" strip **inside its store's `DealCard`**, under that store's banner deals.

## Acceptance Criteria

**Placement — in-card (supersedes 3-2's top-of-feed section)**

1. **Given** the store-keyed deal feed
   **When** the feed renders
   **Then** the standalone top-of-feed "Real price drops" section is **gone**, and each renderable drop appears **inside its store's `DealCard`** as a labeled "Real price drops" strip positioned **after** that store's banner deal grid. The old between-slider-and-feed section no longer exists.

**Distance rule (ratified)**

2. **Given** a price drop whose store is beyond the current distance-slider setting
   **When** the feed renders
   **Then** the drop is **not shown** — exactly as that store's card is not shown. Drops follow their store (this reverses 3-2's "not distance-filtered" behavior).

**Union / no-drop-lost (ratified)**

3. **Given** a fresh (non-stale, `status` ok), in-range store that has ≥1 renderable price drop but **no** active or recently-expired banner deal (so it shows no card today)
   **When** the feed renders (no category selected)
   **Then** that store **gets a card** — identity + trip + the neutral "No current deals" status + the "Real price drops" strip (no banner deal grid) — so its drop is not silently dropped. Under a category selection, drop-only cards are hidden (same rule as expired cards).

**The honest signal (Honesty Contract — inherited verbatim, hard)**

4. **Given** a renderable drop row (`pctVsMedian < 0`, displayed percent ≥ 1%)
   **When** the strip renders it
   **Then** it shows the product `name`, the `option` label (verbatim; store name is **omitted** from the row meta because the card already is the store), and the drop as fixed figures ("**19% below its usual**" + "$32.40 vs $40.00 usual") in the single amber discount hue — **never** a verdict word (ADR-009), **never** a health claim (ADR-066), **never** the banner `discountPct` (Gate 2), and **never** a row at/above its own median as a drop.

5. **Given** a store whose `status` is `failed`/`stale`, or a drop row whose store is absent from the loaded list
   **When** the feed renders
   **Then** its drops are dropped (a stale/failed store is already absent from the feed; a failed/stale-status store never carries a drops strip) — never rendered against a fabricated or unreliable store.

6. **Given** a drop whose displayed whole-number percent rounds to 0% (a sub-0.5% mover)
   **Then** it is **suppressed** (a claimed drop must have a visible ≥1% magnitude) — carried over from 3-2.

**Preserved contracts (regression surface)**

7. **Given** the store-keyed feed and its a11y contract
   **When** the strip renders inside a card
   **Then** the feed keeps **one top-level `<li>` per store** — the strip is a labeled `<section>` inside the card article and its rows are a **nested `<ul>`** (its own list, carrying the per-row `aria-label` the mono figures need), never new items on the feed's own top-level `<ul>`; the store name stays the card's `<h2>` and the strip heading is an `<h3>` scoped per card; the per-row accessible name carries the full product name (minus the redundant "at {store}" clause); banner deals and drops stay **visually distinct** (a drop is never restyled as an "N% off" banner). `DealFeed`'s deal pipeline, urgency/border logic, distance/category/stale behavior, `useDeals`, and `data.json` are otherwise unchanged.

**Style + tests (binding UX contract)**

8. **Given** the binding design system
   **Then** figures use the tabular/slashed-zero figure type + fixed formats (percent whole-number, dollars 2dp), the strip reuses the existing `gma-value-drops__*` styles (re-scoped to nest in a card) + tokens (no color literals), meets the same AA bar, and ships strict-typed with tests: the strip's honesty gates (no banner %, no verdict, option-empty meta, accessible name), the in-card placement, the distance-follows-store rule, the union drop-only card, and no-regression of the feed's one-listitem-per-store count.

## Tasks / Subtasks

- [x] **Task 1 — In-card strip component** (AC: 1, 4, 6, 7, 8)
  - [x] Created `client/src/components/ValueDropStrip.tsx`: `(storeId, drops, divided?)` → a labeled `<section aria-labelledby>` with `<h3 id="value-drops-{storeId}">Real price drops</h3>` + a nested `<ul>` of ledger rows (identity = name + option-only meta; figure = "N% below its usual" + "$X vs $Y usual"). Holds `dropPercent`/`money`/`accessibleName` (store name removed from both meta + accessible name) + exported pure `renderableDrops` (the shared `pctVsMedian<0 && display≥1%` filter). Renders nothing when no rows survive.
  - [x] `ValueDropStrip.test.tsx` — migrated honesty-gate tests (no banner %, no verdict, whole-# %, 2dp $, option-empty meta omitted, accessible name w/ full name + no store clause, above-median suppressed, one local list, divider toggle). 11 tests.
- [x] **Task 2 — Render the strip in `DealCard`** (AC: 1, 3, 7)
  - [x] Added `drops?: PriceDropRow[]` (default `[]`); computes `renderableDrops` and renders `<ValueDropStrip divided={!isExpired}>` after the deal grid when rows exist — divider only when a deal grid precedes it. Expired/"No current deals" behavior preserved (a drop-only card is the expired shell + the strip).
  - [x] `DealCard.test.tsx` — +5 tests: strip under deals (divided, ordered after grid), no strip without drops, drop-only card ("No current deals" + strip, no grid, no divider), strip adds no card-level listitem inflation, sub-1%/above-median filtered before the strip shows.
- [x] **Task 3 — Wire drops through `DealFeed` (grouping + union + distance)** (AC: 1, 2, 3, 5, 6)
  - [x] Consumes `useValueDrops`; groups drops by `dispensaryId`; `dropsFor(store)` gates out `failed`/`stale`-status stores + applies `renderableDrops`. Removed the standalone `<ValueDrops>` render.
  - [x] Carded set = union of {live, expired, drop-only}; drop-only = fresh, in-range (`nearbyDispensaries`), not-already-carded stores with ≥1 renderable drop, category-gated like expired cards; merged as empty-deal groups into the nearest-first sort. Each store's `dropsFor(...)` passed to its `DealCard`.
  - [x] `DealFeed.test.tsx` — made the `useValueDrops` mock configurable (default `[]` keeps all existing tests isolated); +5-test describe block: drop inside its store card; drop-only store surfaces a card (no "No active deals" empty state); drop hidden with its out-of-range store; failed-status store carries no strip; drop-only card hidden under a category selection.
- [x] **Task 4 — Delete the retired standalone surface** (AC: 1)
  - [x] Deleted `client/src/components/ValueDrops.tsx` + `ValueDrops.test.tsx`. `useValueDrops`, `PriceDropRow`, and the served route unchanged (still the data source).
  - [x] Re-scoped `gma-value-drops__*` to nest inside a card: new `.gma-value-drops` grid container + `.gma-value-drops--divided` hairline; heading dropped to `--text-base` `<h3>`; removed the now-dead `.gma-value-drops__head`/`__count`. No new tokens.
- [x] **Task 5 — Verify end-to-end** (AC: all)
  - [x] Client **594** green (47 files), server **682** green (unchanged — no server change), real `npm run build` (`tsc -b && vite build` + server `tsc && copyData.mjs`) clean. ADR-088 recorded.

## Dev Notes

### Architecture patterns & constraints
- **Additive, fail-soft, read-only** stays intact: `useValueDrops` already yields `[]` on any failure, so a broken drops fetch simply renders no strips and no drop-only cards — the deal feed is never blocked or crashed. `[Source: client/src/hooks/useValueDrops.ts]`
- **Honesty Contract is hard** and inherited verbatim (Gate 2 no banner %, ADR-009 no verdict, ADR-066 legal, Honest Math suppress-don't-fabricate). Co-location makes Gate 2 *more* load-bearing: banner deals and drops now share a card and must stay visually distinct. `[Source: real-price-drops-in-card.md §Honesty gates]`
- **Distance now filters drops** by construction: drops attach only to rendered (in-range, fresh) stores, and drop-only cards are built from `nearbyDispensaries`. `[Source: real-price-drops-in-card.md §Distance rule]`
- **a11y:** one `<li>` per store preserved — the strip is a `<section>`/`<div>` inside the card article, exactly like the deal blocks. Store = `<h2>`, strip = `<h3>` (unique id per store). `[Source: client/src/components/DealCard.tsx:135-138]`

### Source tree — files to touch
- **Client (NEW):** `ValueDropStrip.tsx` (+test).
- **Client (M):** `DealCard.tsx` (+ `.test.tsx`) — new `drops` prop + strip; `DealFeed.tsx` (+ `.test.tsx`) — grouping/union/wire-in, remove `<ValueDrops>`; `styles/components.css` — re-scope `gma-value-drops__*` + `.gma-dealcard__drops`.
- **Client (DELETE):** `ValueDrops.tsx`, `ValueDrops.test.tsx`.
- **Unchanged (data source):** `useValueDrops.ts`, `types/index.ts` (`PriceDropRow`), `server/routes/valueRoute.ts` + route registration.

### What must be preserved (regression surface)
- `DealFeed` renders exactly one listitem per store — do not nest the strip in the feed's `<ul>`.
- The `useValueDrops → []` mock in `DealFeed.test.tsx` / `DealFeed.distance.test.tsx` keeps the existing feed tests isolated; those tests must still pass unchanged.
- The deal pipeline, distance/category/stale/expiry behavior, urgency/border, `useDeals`, `/api/data`, and `data.json` — untouched.

### Testing standards
TypeScript strict; test every new module. Prioritize the honesty-gate assertions and the three new behaviors (in-card placement, distance-follows-store, union drop-only card).

### References
- `[Source: real-price-drops-in-card.md]` (binding spec) · `[Source: real-price-drops-surface.md]` (inherited fact/copy/gates)
- `[Source: derivation-3-2-in-app-value-cards.md]` (the surface this relocates; ADR-087)
- `[Source: client/src/components/{ValueDrops.tsx,DealCard.tsx,DealFeed.tsx}]` · `[Source: client/src/styles/components.css:550-652]`

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (bmad-dev-story)

### Debug Log References
- Initial `DealFeed` drops tests used `getByRole('listitem')` to grab the store card and hit "Found multiple elements" — the strip's ledger rows are (correctly) nested `<li>`s. Fixed by scoping those two assertions to the card `<article>` instead. No product change; the nested list is intended (see AC7 / ADR-088 rationale).

### Completion Notes List
- **In-card relocation (ADR-088).** Retired the standalone top-of-feed `<ValueDrops>` section; each store's genuine drops now render as a labeled "Real price drops" strip inside its `DealCard`, under the banner deals. New `ValueDropStrip.tsx` (+ exported pure `renderableDrops`); `DealCard` gained a `drops` prop; `DealFeed` groups/gates/unions the drops and passes each store its own. Copy, number formats, and honesty gates inherited verbatim from 3-2.
- **Two ratified decisions implemented:** (1) drops **follow their store** on the distance filter — a drop only shows if its store's card shows (drops attach only to rendered stores; drop-only cards are built from `nearbyDispensaries`). (2) **union / no-drop-lost** — a fresh, in-range store with a real drop but no active/expired banner deal surfaces a "No current deals" card carrying just the strip, so no genuine drop is silently discarded (category-gated exactly like expired cards).
- **Honesty gates preserved + strengthened by co-location:** banner deals (`gma-deal-block` "N% off") and drops (`below its usual` ledger, single amber `--discount` hue) stay visually distinct in the shared card; no banner `discountPct` and no verdict word reach the strip; `failed`/`stale`-status stores carry no strip; sub-1%-display + above-median rows suppressed. All asserted by tests.
- **a11y:** one top-level `<li>` per store preserved (the strip is a `<section>` with its own nested `<ul>`, not items on the feed list). Store = `<h2>`, strip = `<h3>` (id scoped per store). The mono figures mis-voice, so each row keeps a real listitem to expose its spelled-out `aria-label` (store clause dropped — the card's `<h2>` already names the store).
- **Data note (unchanged from 3-2):** `price-vs-own-median.json` is still not committed (home DB empty 2026-07-12), so the strip renders nothing live until the next home derive — intended additive/fail-soft behavior (`useValueDrops` yields `[]`), not a bug.
- **Verification:** client 594 + server 682 green; real `npm run build` clean. This is a client render-only change; the DealFeed→DealCard→ValueDropStrip composition is exercised end-to-end by the integration tests (only `useDeals`/`useValueDrops` mocked at the data boundary).

### File List
- `client/src/components/ValueDropStrip.tsx` (A) — in-card "Real price drops" strip + exported pure `renderableDrops`
- `client/src/components/ValueDropStrip.test.tsx` (A) — strip + honesty-gate tests (11)
- `client/src/components/DealCard.tsx` (M) — `drops` prop + strip render (divider only when a deal grid precedes)
- `client/src/components/DealCard.test.tsx` (M) — +5 strip tests (import `PriceDropRow`)
- `client/src/components/DealFeed.tsx` (M) — consume `useValueDrops`; group/gate drops; union drop-only cards; pass per-store drops; remove standalone `<ValueDrops>`
- `client/src/components/DealFeed.test.tsx` (M) — configurable `useValueDrops` mock + real-drops describe block (5)
- `client/src/components/ValueDrops.tsx` (D) — retired standalone surface
- `client/src/components/ValueDrops.test.tsx` (D) — its tests (migrated to `ValueDropStrip.test.tsx`)
- `client/src/styles/components.css` (M) — re-scoped `gma-value-drops__*` to nest in a card + `.gma-value-drops--divided`; removed dead `__head`/`__count`
- `ADR.md` (M) — ADR-088 + change-log entry
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M) — story registered; epic-derivation-3 reopened

## Review Findings

_3-layer bmad-code-review 2026-07-13 (Blind Hunter · Edge Case Hunter · Acceptance Auditor). All 8 ACs verified PASS by the Auditor; items below are the surviving triaged findings. 3 dismissed as noise (false-positive $NaN / price-invariant — `useValueDrops.validateRow` guards finite numbers; implausible duplicate React key — fact is product+option keyed per store; stale-`stale===true`-store drop loss — by design under the ratified relocation, drops follow store visibility)._

- [x] [Review][Patch] (resolved from Decision 1 → drop `role=region`) Duplicate "Real price drops" region landmark per card [client/src/components/ValueDropStrip.tsx:58] — each drop-bearing card rendered `<section aria-labelledby>` (an ARIA `region` landmark) named "Real price drops"; a feed with N such cards exposed N identically-named landmarks (APG advises unique landmark labels). Binding UX spec §Accessibility (lines 176-178) specified plain `<div>`s + an `<h3>`. **FIXED:** wrapper `<section aria-labelledby>` → `<div>`, `<h3>` heading kept (navigate-by-heading), realigning with the UX spec; region-querying tests re-anchored to the `<h3>` heading / `.gma-value-drops` container.
- [x] [Review][Decision→Accepted] Drops not category-scoped on carded stores, while drop-only cards are hidden under a category [client/src/components/DealFeed.tsx:205-234] — Erik ratified **accept as-is** (option 2a, 2026-07-13): drops are a separate product-keyed fact, not category deals; the `drop.category` product taxonomy (`'Flower'`/`'Concentrate'`) has no clean bridge to the `DealCategory` glyph vocabulary (`bud`/`vape`/scope-tags), so category-scoping would need its own spec pass. No code change.
- [x] [Review][Patch] Stale comments after the 3.3 re-scope [client/src/styles/components.css:549,614] — CSS header read "derivation-3.2 … Reuses the `.gma-card` primitive" (the strip no longer nests in a `.gma-card`); meta comment read "store name · option label" though AC4 removed the store name. **FIXED:** header re-scoped to 3.3 + "labelled by its `<h3>`, not an ARIA region"; meta comment now "the option label only".
- [x] [Review][Defer] Sub-1% mover rounds up to displayed "1%" [client/src/components/ValueDropStrip.tsx:25] — deferred, pre-existing. `Math.round(Math.abs(pct)*100)` renders a −0.5% drop as "1% below its usual" beside its true `$X vs $Y` figures. Inherited verbatim from 3-2/the deleted `ValueDrops.tsx`; spec-compliant ("displayed whole-number percent ≥ 1%"). Not introduced by this change.

## Change Log
- 2026-07-13 — Story derived from the ratified UX spec `real-price-drops-in-card.md`; moved to in-progress. epic-derivation-3 reopened.
- 2026-07-13 — Implemented Tasks 1–5 (in-card strip + DealCard prop + DealFeed union/distance wiring + delete standalone + CSS). ADR-088 recorded. Client 594 + server 682 green, real build clean. Status → review.
- 2026-07-13 — 3-layer code review: all 8 ACs pass; 2 decision-needed, 1 patch, 1 defer, 3 dismissed. Findings recorded above.
- 2026-07-13 — Review resolved: Decision 1 → patch (dropped the per-card ARIA `region` landmark, `<section>`→`<div>` + `<h3>` heading nav); Decision 2 → accepted as-is (2a, no category-scoping of drops — taxonomy gap). Both patches applied (landmark + stale CSS comments). Client 594 green, real build clean. Status → done.
