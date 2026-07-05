---
title: 'Vape rotation pool (3 images) + new shatter family (2 images, split from dabs)'
type: 'feature'
created: '2026-07-04'
status: 'done'
context: []
baseline_commit: '8cb3b8438af67a57aa554649312497ce9e8c8035'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Erik wants the same rotation treatment (spec-edible-icon-rotation, ADR-073) for vape deals using the 3 `Vape Cartridge*` JPEGs, and his 2 `SHATTER/` icons shown "when we have shatter as an item" — but shatter currently maps to the generic dabs art.

**Approach:** Add `vape` (×3) and `shatter` (×2) pools to `ROTATING_ICON_POOLS`; introduce `'shatter'` as a first-class `DealIconName` matched most-specific-first ahead of dabs (removing `\bshatter\b` from the dabs regex). All mechanics (feed-order assignment, seed-stable shuffled cycles, underflow fallback) reuse ADR-073 unchanged.

## Boundaries & Constraints

**Always:** ADR-067 asset pipeline (Erik's art, resized not redrawn). One concentrate glyph per deal stays the rule — shatter simply outranks dabs. Existing `vape.webp` remains the underflow fallback; `shatter-01` becomes the `DEAL_ICON_SRC.shatter` fallback.

**Never:** Redraw art. Change any other family's matching. Rotate non-pool families.

</frozen-after-approval>

## Code Map

- `client/src/utils/dealIcons.ts` -- add `'shatter'` name + label; CONCENTRATE_FAMILIES gains shatter entry before dabs
- `client/src/utils/dealIconAssets.ts` -- add `shatter` entry to DEAL_ICON_SRC
- `client/src/utils/dealIconPools.ts` -- add vape + shatter pools (mechanism untouched)
- `client/src/assets/deal-icons/vapes/`, `client/src/assets/deal-icons/shatter/` -- new webp assets

## Tasks & Acceptance

**Execution:**
- [x] convert 3 vape + 2 shatter JPEGs (ADR-067 recipe) into `vapes/vape-01..03.webp`, `shatter/shatter-01..02.webp` — all 5 visually verified
- [x] `dealIcons.ts` -- `'shatter'` DealIconName + 'Shatter' label; shatter family first in CONCENTRATE_FAMILIES; drop `\bshatter\b` from dabs regex; retire the vestigial `_assertIcons` block (no 'shatter' SVG glyph exists; `DEAL_ICON_SRC`/`DEAL_ICON_LABEL` Records already fail the build on a missing name)
- [x] `dealIconAssets.ts` -- import shatter-01 as the `shatter` fallback
- [x] `dealIconPools.ts` -- `vape` + `shatter` pool entries
- [x] tests -- dealIcons: 'Shatter' → `['shatter']` (not dabs), 'Shatter and Wax' → shatter only, 'Wax' alone still dabs; dealIconPools: names/sizes updated. 532 green.

**Acceptance Criteria:**
- Given a deal naming shatter, when rendered, then a shatter pool image shows (rotating, no repeat until both used).
- Given a deal naming dabs/wax (no shatter), when rendered, then the dabs icon shows exactly as before.
- Given vape deals, when rendered feed-wide, then the 3 vape images rotate with ADR-073 semantics.

## Verification

**Commands:**
- `cd client; npx vitest run` -- full suite green
- `npm run build` -- clean
