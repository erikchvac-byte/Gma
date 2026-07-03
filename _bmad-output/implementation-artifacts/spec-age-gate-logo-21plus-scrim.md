---
title: 'Age-gate polish: prominent wordmark, 21+ labeling, tile scrim'
type: 'feature'
created: '2026-06-28'
status: 'done'
baseline_commit: '995153d7b2bc605e3b51de0e8626e67ebab10c8e'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On the 21+ age-gate page the "gmas list" wordmark is small enough to be nearly hidden against the tile mosaic, the age badge reads a bare "21" instead of the conventional "21+", and the decorative tiles compete with the card for attention.

**Approach:** Enlarge the top wordmark, relabel the standalone age references to "21+", and lay a dark scrim between the tile mosaic and the card so the card and wordmark read cleanly. Single component, `AgeGate.tsx`, plus its test.

## Boundaries & Constraints

**Always:** Use existing design tokens (`--text-4xl`, etc.). Apply the scrim in BOTH gate states (ask + declined) via a single shared backdrop so they never drift. Keep the scrim `aria-hidden` and non-interactive (pointer-events none), layered below the card (z-index 51) and above the tiles.

**Ask First:** Any change to the four WA-mandated legal warnings, or to the gate's confirm/decline/persist logic.

**Never:** Touch the verbatim legal warnings in `constants/legal.ts` (the "21 and older" there is locked). Do NOT rewrite "21 or older" / "21 and over" prose to "21+" — the qualifier already implies it and "21+ or older" reads redundant. No new dependencies, no layout framework changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ask state badge | Gate shown, not confirmed | Badge tile renders "21+"; wordmark renders at enlarged size; dark scrim sits over tiles, under card | N/A |
| Decline state heading | User clicks "No, take me back" | Heading reads "Come back at 21+"; scrim still present | N/A |
| Already confirmed | localStorage `gma_age_confirmed === true` | Gate (and backdrop/scrim) not rendered; children shown | N/A |

</frozen-after-approval>

## Code Map

- `client/src/components/AgeGate.tsx` -- the age gate; holds `Wordmark`, `IconField`, the badge `tileStyle` span ("21"), the "Come back at 21" heading, and all style constants
- `client/src/components/AgeGate.test.tsx` -- asserts exact text `'Come back at 21'` (line ~140) and heading regex `/come back at 21/i` (~73); the exact-string assertion must update with the copy change
- `client/src/styles/tokens.css` -- token source (`--text-4xl: 2.25rem`, `--surface-inverse`) — read-only reference

## Tasks & Acceptance

**Execution:**
- [x] `client/src/components/AgeGate.tsx` -- (1) In `Wordmark`, change `fontSize: 'var(--text-2xl)'` → `'var(--text-4xl)'` (dot is em-based, scales automatically). (2) Change the badge span text `21` → `21+`. (3) Change the declined-state heading `Come back at 21` → `Come back at 21+`. (4) Add a shared backdrop: a small component rendering `<IconField />` plus an `aria-hidden`, pointer-events-none dark scrim div (`position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,~0.5)`), and use it in both the declined and ask states in place of the two bare `<IconField />` calls.
- [x] `client/src/components/AgeGate.test.tsx` -- update the exact `getByText('Come back at 21')` assertion to `'Come back at 21+'` (the `/come back at 21/i` regex still matches the new substring and needs no change)

**Acceptance Criteria:**
- Given the gate is shown, when it renders, then the badge reads "21+" and the "gmas list" wordmark renders at `--text-4xl`.
- Given the user declines, when the out-state shows, then the heading reads "Come back at 21+".
- Given either gate state, when it renders, then a dark scrim sits visually between the tile mosaic and the card, and the card/warning bar remain fully legible.
- Given the existing AgeGate test suite, when run, then all tests pass (with the one updated string assertion).

## Design Notes

Single shared backdrop avoids the current duplication (two `<IconField />` call sites) and guarantees the scrim can't be added to one state but forgotten in the other. The scrim is a sibling rendered AFTER `IconField` at the same z-index (50); equal z-index + later DOM order paints it over the tiles, while the card's z-index 51 keeps it on top. Tile opacity (0.16) stays as-is — the scrim, not an opacity drop, does the darkening (more uniform across varied tiles).

## Verification

**Commands:**
- `cd client && npm test -- AgeGate` -- expected: all AgeGate tests pass
- `cd client && npx tsc --noEmit` -- expected: no type errors

**Manual checks:**
- Run the client; the age gate shows an enlarged "gmas list" wordmark, a "21+" badge, and a visibly darkened tile background with the card standing out. Decline → heading reads "Come back at 21+".
