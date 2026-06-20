
---
title: 'Deal Card Redesign (Tidewater)'
type: 'feature'
created: '2026-06-19'
status: 'done'
baseline_commit: '27dc3d7e2d2c25129abb62a081eaab381244a3eb'
context:
  - '{project-root}/spec-deal-card-redesign-tidewater.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The shipped deal feed renders each store's deals as a flat stack of text rows. It reads as a list, not a scannable card, and offers no way to filter by deal kind. The redesign is a visual/layout reskin of the existing one-card-per-store feed (ADR-038) plus an interactive deal-type filter — no data-layer change.

**Approach:** Restyle `DealCard` into a structured card (trip-cost chip + store-level urgency badge in the header, deals as a flex-wrap grid of sub-blocks with magnitude-emphasized discounts). Add a scrollable chip row that filters the in-memory deal list by `Deal.type` (`All` / `Happy hours` / `Daily deals`). All values come from existing `tokens.css` variables.

## Boundaries & Constraints

**Always:**
- Use only existing `tokens.css` variables. Map the source spec's literal px sizes to the nearest existing token (15px→`--text-base`, 13px→`--text-sm`, 12px→`--text-xs`, 24px→`--text-2xl`).
- Keep **amber** as the time-urgency color (`--text-urgent`/`Badge variant="urgent"`) — confirmed by user; honors shipped ADR-037 (single teal *brand* accent + retained semantic status hues). Teal (`--accent`) encodes **only** discount magnitude.
- One `listitem` per store; deal sub-blocks are plain `<div>`s (ADR-038).
- Trip cost (distance + gas) renders once per store, in the header (ADR-038).
- Badges report time, never a "worth it" verdict (ADR-009).
- Filtering is in-memory on the `DealView`/deal list — zero network. A store with no deals matching the active chip drops out of the feed.

**Ask First:**
- Any need to change `tokens.css`, add a new token/hex, or touch `sortDeals`/`groupDealsByStore`/`types`/API.
- Any urgency or discount signal that would require a color not already in the token set.

**Never:**
- No "Worth it / Maybe / Meh" verdict or any go/no-go rating (ADR-009).
- No product-category chips or any filter on a field absent from `Deal` (no category field exists).
- No second brand accent, no hardcoded off-palette hex (ADR-037).
- No refactor/rename of the data layer, API, scraper, `sortDeals`, `groupDealsByStore`, or the `Deal`/`Dispensary`/`StoreGroup`/`DealView` types.
- No routing/page-composition change. `Header.tsx` already matches §5 (wordmark + set-dot + settings) — leave it untouched.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Store has a live happy hour | a deal with non-null `countdown` (deals pre-sorted soonest-first) | Header shows amber urgent badge `ends in {countdown}` (first live deal) | N/A |
| Daily-only / all-day store | no deal has a `countdown` | Header shows muted `active today` badge | N/A |
| Active chip = Happy hours | mixed deals | Only `happy_hour` deals shown; stores with none drop out | N/A |
| Active chip = Daily deals | mixed deals | Only `daily` deals shown; stores with none drop out | N/A |
| Active chip filters everything out | no store matches | Existing "No active deals right now" notice | N/A |
| Discount magnitude | `discountPct` high vs low vs `null` | High→full `--accent`+semibold; low→`--accent` reduced opacity; `null`→no `%` element (block still renders title/meta) | AA-large (≥3:1) at every tier |
| Gas cost unavailable | `gasCostText === null` | Trip chip shows `{distance} mi` only, no `·`/`$` | N/A |

</frozen-after-approval>

## Code Map

- `client/src/components/DealCard.tsx` -- restyle: header trip-cost chip + store urgency badge; deals as flex-wrap sub-block grid with magnitude-emphasized `%`.
- `client/src/components/DealFeed.tsx` -- add chip-filter state; render filter row between slider and cards; filter deals by `type` before `groupDealsByStore` (empty stores drop naturally).
- `client/src/components/DealTypeFilter.tsx` -- NEW: scrollable chip row (`All` / `Happy hours` / `Daily deals`).
- `client/src/utils/dealView.ts` -- NEW pure helpers: `filterByType`, `storeUrgencyBadge`, `discountTier`.
- `client/src/styles/components.css` -- NEW token-driven classes: `.gma-chips`/`.gma-chip`, `.gma-deal-block` + parts, trip-cost chip.
- `client/src/components/ui/{Card,Badge}.tsx` -- reused as-is (`urgent`/`neutral` variants).
- `client/src/components/DistanceFilter.tsx` / `RangeSlider.tsx` -- UNCHANGED (see Design Notes deviation).

## Tasks & Acceptance

**Execution:**
- [x] `client/src/utils/dealView.ts` -- add `filterByType(dispensaries, sel)`, `storeUrgencyBadge(deals): {variant, text}`, `discountTier(pct): 'high'|'mid'|'low'|null` -- pure, isolates derivations for testing.
- [x] `client/src/utils/dealView.test.ts` -- unit-test the I/O matrix rows (urgency derivation, type filter drop-out, discount tiers incl. `null`).
- [x] `client/src/styles/components.css` -- add chip-row, chip (active/inactive), deal-block, and trip-cost-chip classes; every value references a token.
- [x] `client/src/components/DealTypeFilter.tsx` (+ `.test.tsx`) -- chip row; `selected` + `onSelect` props; `role="group"`, `aria-pressed` per chip; horizontal scroll.
- [x] `client/src/components/DealCard.tsx` -- header: name (left) + trip-cost chip + urgency badge; deals as `.gma-deal-block` grid; `%` styled by `discountTier`.
- [x] `client/src/components/DealFeed.tsx` -- `useState` chip selection (default `all`, in-memory, not persisted); apply `filterByType` before grouping; render `<DealTypeFilter>` between `<DistanceFilter>` and the card `<ul>`.
- [x] `client/src/components/{DealCard,DealFeed}.test.tsx` + `App.test.tsx` -- updated OLD-layout assertions (`"12.4 miles"`, `"$3.63 to get there"`, `"X% off"`, per-deal countdown) to the new structure; added chip-filter interaction + urgency-badge tests. Intent preserved (gas once per store).

**Acceptance Criteria:**
- Given a store with a live happy hour, when the card renders, then exactly one amber urgency badge reads `ends in {countdown}` in the header (not per deal).
- Given the user taps `Happy hours`, when the feed re-renders, then only happy-hour deals show and daily-only stores disappear; tapping `All deals` restores them.
- Given any rendered card, when inspecting the DOM, then there is exactly one `listitem` per store and exactly one trip-cost line.
- Given the built CSS, when audited, then no new off-palette hex appears and discount tiers use only `--accent`/`--text-muted`.

## Spec Change Log

- **2026-06-19 — review patches (no spec/intent change).** Three-layer adversarial review (acceptance auditor: fully compliant; blind + edge-case hunters). Applied as patches, no loopback:
  1. Blank-description **daily** deals omit the title fallback (kind is already in their `Daily deal · …` meta) so `"Daily deal"` never doubles; happy hours keep the `Happy hour` fallback.
  2. Card accent border now derives from `storeUrgencyBadge` variant (was `hasHappyHour`) so border and badge can't contradict for all-day/partial-window happy hours.
  3. `discountTier` returns null for non-finite / `<= 0` `discountPct` (boundary doesn't validate deal fields) — never renders `"NaN%"`/`"-5%"`.
  Rejected: casing (badge is `text-transform: uppercase`), ragged flex row (spec-mandated `flex:1; min-width:180px`), AA claim (verified ~4.6:1), hidden scrollbar (3 short chips), index key (pre-existing pattern).

## Design Notes

**Conscious deviations from the source spec (flag at review):**
1. **Urgency stays amber, not teal** (user-confirmed) — keeps teal exclusive to §2's discount hierarchy; amber `--text-urgent` is the shipped, contrast-audited urgency semantic.
2. **Tokens, not raw px** — codebase is strictly token-driven (ADR-037); mapped to nearest tokens (see Boundaries).
3. **`DistanceFilter`/`RangeSlider` left unchanged** — already satisfy §4 (label "Within", mi readout, `1–50`/`50`/`gma_distance_miles` preserved). §4's inline-row layout would mean refactoring a tested shared primitive for a cosmetic change (out of scope per Never); revisit as follow-up.

**Store urgency derivation (deals arrive pre-sorted, soonest-first):**
```ts
const live = deals.find((d) => d.countdown !== null)
return live ? { variant: 'urgent', text: `ends in ${live.countdown}` }
            : { variant: 'neutral', text: 'active today' }
```

**Discount tier → style (single accent; verify AA-large ≥3:1):** high (`pct >= 30`): `--accent`, `--weight-semibold`, opacity 1 · mid (`15–29`): `--accent`, `--weight-medium`, ~0.8 · low (`<15`): `--accent` ~0.6 or `--text-muted`. `null` pct → render no `%` element.

## Verification

**Commands:**
- `cd client && npm run test` -- expected: all suites pass (updated + new).
- `cd client && npx tsc -b` -- expected: no type errors.
- `cd client && npm run lint` -- expected: clean.
- `cd client && npm run build` -- expected: `vite build` succeeds; grep built CSS for stray hex.

**Manual checks:**
- DevTools: one `<li>` per store; chip row scrolls horizontally, card list does not.
- Toggle each chip; confirm stores drop/restore and counts match.
- Contrast-audit each discount tier and the amber badge against their surfaces (AA).

## Suggested Review Order

**Filter logic (the new behavior)**

- Entry point: the in-memory chip filter wired in before grouping — empty stores drop naturally.
  [`DealFeed.tsx:108`](../../client/src/components/DealFeed.tsx#L108)
- The three pure derivations: type filter, store urgency, discount tier.
  [`dealView.ts:14`](../../client/src/utils/dealView.ts#L14)
- Chip state (in-memory, default `all`) and where the chip row renders.
  [`DealFeed.tsx:59`](../../client/src/components/DealFeed.tsx#L59)
- The chip row component: `role="group"`, `aria-pressed` per chip, horizontal scroll.
  [`DealTypeFilter.tsx:17`](../../client/src/components/DealTypeFilter.tsx#L17)

**Card reskin (presentation)**

- Border + badge driven from one urgency signal so they can't contradict (review patch).
  [`DealCard.tsx:45`](../../client/src/components/DealCard.tsx#L45)
- Trip-cost chip: distance + gas, once per store header (ADR-038).
  [`DealCard.tsx:57`](../../client/src/components/DealCard.tsx#L57)
- Deal sub-blocks: flex-wrap grid, magnitude-tiered teal `%`.
  [`DealCard.tsx:69`](../../client/src/components/DealCard.tsx#L69)
- Token-only styles: chips, trip chip, deal blocks, discount tiers.
  [`components.css:239`](../../client/src/styles/components.css#L239)

**Tests (supporting)**

- Pure-helper coverage incl. non-finite/`<=0` discount and urgency derivation.
  [`dealView.test.ts:1`](../../client/src/utils/dealView.test.ts#L1)
- Feed-level chip filtering: drop/restore, empty-state, zero-network.
  [`DealFeed.test.tsx:368`](../../client/src/components/DealFeed.test.tsx#L368)
