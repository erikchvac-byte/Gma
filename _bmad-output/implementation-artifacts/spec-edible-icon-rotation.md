---
title: 'Edible deal-icon rotation pool (11 images, shuffled cycles, no repeats)'
type: 'feature'
created: '2026-07-04'
status: 'in-progress'
context: []
baseline_commit: 'adc396b3540e84bcd83418ef04061fcfae3843fa'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every edible-matched deal shows the same single `edible.webp` sale-tag icon; Erik has 11 edible art pieces (`C:\Users\erikc\Dev\Happy-assets\GmasINCOlist\Store sale tags\edds`) he wants all used.

**Approach:** Build a rotation pool of all 11 `edds` images (resized to webp per the ADR-067 pipeline — Erik's art, never redrawn). As edible-tagged deals appear top-to-bottom in the feed, each draws the next image from a shuffled pool — no repeats until all 11 are used, then the pool reshuffles for the next cycle.

**Scope renegotiated by Erik mid-implementation (2026-07-04):** the same rotation applies to the `bud` family using the 4 images in `…\Store sale tags\BUDS FLOWER ICONS`. The pool mechanism is generalized (`dealIconPools.ts`, family-keyed) instead of edible-specific; each family rotates independently.

## Boundaries & Constraints

**Always:** Use Erik's art resized only (ADR-067 ImageMagick recipe: `-fuzz 10% -trim -resize 128 -extent 144`, white tile, → webp ≤~5 KB). Rotation order = feed reading order (store cards nearest-first, blocks top-to-bottom). Icon assignment must be **stable across re-renders** — `DealFeed` re-renders every second via `useNow`, and icons must not flicker/reshuffle while the page is open. `dealIcons.ts` matcher logic unchanged — it still emits the single name `'edible'`; only the art resolution varies.

**Ask First:** Any change to which deals count as "edible" (matcher regexes); dropping any of the 11 images for quality reasons.

**Never:** Redraw/AI-regenerate the art. Rotate any other icon family (drink, tincture, etc. keep their single dedicated icons — `drink`-matched deals do NOT draw from this pool even though two source files depict drinks). No persistence of rotation state across visits (fresh shuffle per page load is fine). No change to accessible labels (`'Edibles'` stays for all variants).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ≤11 edible deals visible | 5 edible-tagged blocks in feed order | 5 distinct pool images, in shuffled-pool order | N/A |
| >11 edible deals visible | 14 edible-tagged blocks | first 11 all distinct, then a fresh shuffle starts (images 12–14 distinct among themselves) | N/A |
| Re-render (clock tick / filter change) | same feed, `useNow` ticks | every already-visible edible deal keeps its exact image | N/A |
| Filter narrows feed | deal-type chip or radius removes earlier edible deals | remaining edible deals may re-draw from the pool start (assignment is by visible feed position) — acceptable | N/A |
| Zero edible deals | no block emits `'edible'` | pool untouched, no behavior change anywhere | N/A |
| Defensive underflow | card asks for more edible srcs than assigned | fall back to legacy `DEAL_ICON_SRC.edible` | never render a broken img |

</frozen-after-approval>

## Code Map

- `client/src/utils/dealIcons.ts` -- matcher; emits `'edible'` (UNCHANGED)
- `client/src/utils/dealIconAssets.ts` -- name→src map; keeps `edible` entry as fallback
- `client/src/utils/edibleIconPool.ts` -- NEW: imports 11 webps; `buildEdibleIconSequence(count, rng)` pure generator (Fisher-Yates chunks of 11)
- `client/src/components/DealFeed.tsx` -- owns feed order + a once-per-mount PRNG seed; assigns per-store edible src arrays
- `client/src/components/DealCard.tsx` -- consumes `edibleIconSrcs` prop when rendering an `'edible'` icon
- `client/src/utils/dealView.ts` -- `buildDealBlocks` (block order source of truth; UNCHANGED)
- `client/src/assets/deal-icons/` -- existing webp assets; new `edibles/` subdir

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/assets/deal-icons/edibles/edible-01.webp` … `edible-11.webp` -- convert the 11 `edds` JPEGs with the ADR-067 ImageMagick recipe -- same visual tile treatment as shipped icons (verify `magick` is on PATH first; HALT if missing)
- [ ] `client/src/utils/edibleIconPool.ts` -- NEW: import the 11 assets as `EDIBLE_POOL_SRCS`; export `mulberry32(seed)` seeded PRNG + `buildEdibleIconSequence(count, rng): string[]` — concatenated Fisher-Yates shuffles of the pool, so any 11-window aligned chunk has no repeats and each cycle's order differs; generation is prefix-stable (growing `count` never changes earlier entries)
- [ ] `client/src/components/DealFeed.tsx` -- hold a seed in `useState(() => …)` (stable for the mount, new each visit); after `storeGroups`, build each store's `DealView[]` once, count `'edible'` occurrences via `buildDealBlocks`, slice the sequence into a per-store `edibleIconSrcs` array, pass as new `DealCard` prop
- [ ] `client/src/components/DealCard.tsx` -- accept `edibleIconSrcs: string[]` (default `[]`); while mapping `block.icons`, an `'edible'` name takes the next unconsumed src (render-scope counter), falling back to `DEAL_ICON_SRC.edible` on underflow; all other names unchanged
- [ ] `client/src/utils/edibleIconPool.test.ts` -- NEW: no repeats within each 11-chunk; all 11 used before any reuse; cycles differ under a real rng; prefix stability; count 0; count > 22
- [ ] `client/src/components/DealCard.test.tsx` -- edible icon renders the provided src; underflow falls back to legacy src; non-edible icons untouched

**Acceptance Criteria:**
- Given 11+ edible deals in the feed, when the page renders, then no edible image repeats before all 11 have appeared, and the next cycle's order differs from the first (per-mount shuffle).
- Given an open page, when the countdown clock re-renders the feed each second, then every edible deal's image is identical to the previous render.
- Given a deal matched as `drink` (or any non-edible family), when rendered, then it shows its existing dedicated icon — never a pool image.

## Verification

**Commands:**
- `cd client; npx vitest run` -- expected: full client suite green including new pool + DealCard tests
- `npm run build` -- expected: clean build, 11 new webp assets emitted
