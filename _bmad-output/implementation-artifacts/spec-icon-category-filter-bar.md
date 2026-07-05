---
title: 'Icon category filter bar (replaces deal-type chips)'
type: 'feature'
created: '2026-07-05'
status: 'done'
context: []
baseline_commit: 'e4c37dd9cf0c2433939ddf63cb4ff8c3a2b46913'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The top filter bar's three text chips (All deals / Happy hours / Daily deals) filter by `Deal.type`, which shoppers don't think in. Cards already tag every deal with product-category icons (Erik's art via `dealIcons`), but there is no way to filter the feed by them.

**Approach:** Replace `DealTypeFilter` with an icon bar built from the exact same icon art already rendered on deal cards. An icon appears only when at least one on-page store has an active deal carrying that tag; clicking it filters the feed to only stores with a matching active deal (click again to clear).

## Boundaries & Constraints

**Always:**
- Reuse the existing icon assets via `DEAL_ICON_SRC` — the bar shows each family's canonical single art (no rotation pools in the bar). No new icons, no redrawn art.
- Category membership in the bar and in the filter must come from the SAME matcher output (`dealIcons` on the same subject text `buildDealBlocks` uses, i.e. layered-sale title when present) so bar presence and filter results can never disagree.
- All tag types qualify, including `store-wide`, `price-drop`, and `special-pricing` (Erik's explicit choice).
- The three joint pack variants collapse into ONE pre-roll icon in the bar; clicking it matches any pack variant.
- Presence is computed from the post-stale/distance/expiry active set ("on the page"), BEFORE the category filter, so selecting an icon never removes the other icons.
- Each icon button has an accessible name from `DEAL_ICON_LABEL` and `aria-pressed` state.
- TypeScript strict; tests for all new logic.

**Ask First:** Any change to deal-card rendering, matcher families (`dealIcons.ts` patterns), or server code.

**Never:**
- Keep the old type chips alongside the icons — this is a replacement (`Deal.type` filtering goes away).
- Persist the selection (in-memory only, like the old chip state).
- Show an icon for a category no on-page store currently carries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Feed has stores with edible + vape deals | Bar shows edible and vape icons in canonical order; nothing else | N/A |
| Click icon | Vape icon clicked | Feed narrows to stores with ≥1 active vape deal; within each card only matching deals render (existing chip semantics); icon shows pressed | N/A |
| Click again | Pressed vape icon clicked | Selection clears; full feed returns | N/A |
| Joint variants | Stores carry only 2-pack + 3-pack pre-roll deals | ONE pre-roll icon appears; clicking matches all pack variants | N/A |
| Category vanishes | Selected category's last deal expires on a clock tick | Selection is treated as cleared (bar icon gone → full feed), never a stuck-empty feed | Derived guard, no state write needed |
| No deals at all | Zero active stores | Bar renders nothing (no icons); existing "No active deals" notice unchanged | N/A |
| Expired-store cards | A category is selected | Expired "No current deals" cards hidden (same rule as old non-'all' chips) | N/A |
| Blank-description deal | Deal whose description yields `[]` from `dealIcons` | Contributes no bar icon; matches no category filter | N/A |

</frozen-after-approval>

## Code Map

- `client/src/components/DealTypeFilter.tsx` + `.test.tsx` -- old chip bar; DELETE (replaced)
- `client/src/components/DealCategoryFilter.tsx` -- NEW icon bar component
- `client/src/components/DealFeed.tsx` -- mounts the bar (line 220), owns selection state (`dealType` at line 71 becomes category selection), filter pipeline at lines 141–152 (expired-card gate + `filterByType` call site)
- `client/src/utils/dealView.ts` -- `filterByType`/`DealTypeSelection` (lines 6–21, to be replaced); `resolveLayeredSale` + `buildDealBlocks` icon-subject rule (line 274) the new helpers must mirror
- `client/src/utils/dealIcons.ts` -- `dealIcons` matcher + `DealIconName` + `DEAL_ICON_LABEL` (reused, unmodified)
- `client/src/utils/dealIconAssets.ts` -- `DEAL_ICON_SRC` canonical art per name (reused, unmodified)
- `client/src/styles/components.css` -- `.gma-chips` row (line 255, reusable) + `.gma-deal-icon` tile look (line 510) to echo in new `.gma-icon-chip`
- `client/src/components/DealFeed.test.tsx`, `client/src/App.test.tsx`, `client/src/changeZip.test.tsx` -- existing tests referencing the old chips

## Tasks & Acceptance

**Execution:**
- [x] `client/src/utils/dealView.ts` -- Remove `DealTypeSelection`/`filterByType`. Add: `type DealCategory` (= `DealIconName` with joint variants normalized to `'joint-single'`); `dealCategories(deal): DealCategory[]` (icon subject = `resolveLayeredSale(deal.description)?.title ?? deal.description`, then `dealIcons`, then joint-collapse + dedupe); `categoriesPresent(dispensaries): DealCategory[]` in fixed canonical order (bud, joint-single, concentrate, dabs, shatter, diamond, vape, edible, drink, tincture, glass, store-wide, price-drop, special-pricing); `filterByCategory(dispensaries, sel: DealCategory | null)` narrowing each store's deals to those matching `sel` (null = passthrough) -- one matcher source of truth
- [x] `client/src/utils/dealView.test.ts` -- Update for removals; unit-test the three helpers incl. joint collapse, layered-sale subject, blank description, null passthrough
- [x] `client/src/components/DealCategoryFilter.tsx` -- NEW: props `{ categories, selected, onSelect }`; renders `.gma-chips` row of icon toggle buttons (`DEAL_ICON_SRC` art, `aria-label` from `DEAL_ICON_LABEL`, `aria-pressed`, click toggles via `onSelect(selected === cat ? null : cat)`); renders null when `categories` empty
- [x] `client/src/components/DealCategoryFilter.test.tsx` -- NEW: only passed categories render; pressed state; toggle-to-null; empty → nothing
- [x] `client/src/components/DealTypeFilter.tsx` + `DealTypeFilter.test.tsx` -- DELETE
- [x] `client/src/components/DealFeed.tsx` -- Replace `dealType` state with `selectedCategory: DealCategory | null`; compute `categoriesPresent(activeDispensaries)`; derived guard: selection not in present list → treat as null; expired cards only when effective selection is null; `filterByCategory` replaces `filterByType`; mount `DealCategoryFilter`
- [x] `client/src/styles/components.css` -- Add `.gma-icon-chip` (button wrapping a `.gma-deal-icon`-look 28px tile; pressed = accent border/ring; focus-visible ring) near the `.gma-chips` block
- [x] `client/src/components/DealFeed.test.tsx` (+ `App.test.tsx` / `changeZip.test.tsx` if they touch chips) -- Update: icon bar presence rule, filter narrows stores, toggle clears, expired-card gate, vanish-guard

**Acceptance Criteria:**
- Given the live feed, when it renders, then the old "All deals / Happy hours / Daily deals" chips are gone and only icons for categories actually present on-page appear, using the identical art files the cards use.
- Given a selected icon, when a store has no active deal in that category, then that store's card is not rendered; stores with a match render only their matching deals.
- Given a selected icon, when the same icon is clicked again, then the full unfiltered feed returns.
- Given `npm test` and `npm run build`, then all client+server suites pass and the production build is clean.

## Spec Change Log

## Verification

**Commands:**
- `npx vitest run` (in `client/`) -- expected: all green incl. new DealCategoryFilter/dealView/DealFeed tests
- `npm run build` (repo root) -- expected: clean client+server production build (feedback rule: run the REAL build)

## Suggested Review Order

**Category model — one matcher source of truth**

- The bar's vocabulary: card glyphs with joint pack variants collapsed into one category
  [`dealView.ts:12`](../../client/src/utils/dealView.ts#L12)

- Record-typed order — a future icon family missing here fails the build, not the bar
  [`dealView.ts:19`](../../client/src/utils/dealView.ts#L19)

- Per-deal categories reuse dealIcons on buildDealBlocks' exact subject (layered-sale aware)
  [`dealView.ts:45`](../../client/src/utils/dealView.ts#L45)

- Presence (which icons render) and filter share that same helper — they can't disagree
  [`dealView.ts:58`](../../client/src/utils/dealView.ts#L58), [`dealView.ts:70`](../../client/src/utils/dealView.ts#L70)

**Feed pipeline rewire**

- Presence computed pre-filter from the post-stale/distance/expiry active set
  [`DealFeed.tsx:146`](../../client/src/components/DealFeed.tsx#L146)

- The review-driven fix: a departed category CLEARS state (render-phase adjust), never lies dormant
  [`DealFeed.tsx:154`](../../client/src/components/DealFeed.tsx#L154)

- Expired "No current deals" cards keep their unfiltered-only rule, keyed on the effective selection
  [`DealFeed.tsx:169`](../../client/src/components/DealFeed.tsx#L169)

- Bar mount where the old DealTypeFilter sat
  [`DealFeed.tsx:243`](../../client/src/components/DealFeed.tsx#L243)

**The bar itself**

- Icon toggle buttons: canonical card art, DEAL_ICON_LABEL accessible names, toggle-to-null
  [`DealCategoryFilter.tsx:16`](../../client/src/components/DealCategoryFilter.tsx#L16)

- Chip styling echoes the cards' 28px tile; pressed = accent ring
  [`components.css:267`](../../client/src/styles/components.css#L267)

**Peripherals — tests**

- New helper suites: collapse, layered subject, blank, passthrough, canonical order
  [`dealView.test.ts:38`](../../client/src/utils/dealView.test.ts#L38)

- Component contract: presence-only render, pressed state, toggle, empty → nothing
  [`DealCategoryFilter.test.tsx:6`](../../client/src/components/DealCategoryFilter.test.tsx#L6)

- Feed-level: filter narrows stores AND deals; vanish-then-return proves no resurrection
  [`DealFeed.test.tsx:479`](../../client/src/components/DealFeed.test.tsx#L479)
