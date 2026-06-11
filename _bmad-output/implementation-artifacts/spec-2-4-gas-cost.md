---
title: 'Gas Cost Calculation'
type: 'feature'
created: '2026-06-10'
status: 'done'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
baseline_commit: '5f347b5'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The product's core differentiator — "is this deal worth the drive?" — is missing: cards show the discount but not what the round trip costs in gas (PRD SM-2/SM-3, ADR-009 side-by-side Discount Display).

**Approach:** Pure `roundTripGasCost` function in `client/src/utils/gasCost.ts`; `DealFeed` computes it per dispensary from `meta.gasPrice` and MPG (localStorage `gma_vehicle_mpg` if valid, else `meta.nationalMpg`) and passes a formatted string to `DealCard`, which renders the side-by-side Discount Display.

## Boundaries & Constraints

**Always:**
- Formula exactly `(distanceMiles × 2) × (gasPrice / mpg)`; display two decimals (`$1.80`).
- Side-by-side format: `35% off — $1.80 to get there` (one line, em dash).
- Gas cost visible on every card on first load, zero user action.
- MPG resolution: `gma_vehicle_mpg` from localStorage via the existing `useLocalStorage` hook ONLY if it is a finite number > 0; anything else (absent, null, garbage, ≤ 0) falls back to `meta.nationalMpg` silently.
- Calculation is a pure function in `gasCost.ts` — never inlined in `DealCard.tsx` or `DealFeed.tsx`; `DealCard` stays purely presentational (formatted string arrives as a prop).
- TS strict, co-located tests, types from `client/src/types/index.ts`.

**Ask First:**
- Any server-side change. Adding any dependency. Any UI for *setting* vehicle MPG (that's Epic 3 — this story only reads the key).

**Never:**
- Vehicle Year/Make/Model dropdowns or fueleconomy.gov calls (Story 3.2). EIA refresh (3.1). Distance filter (2.5), stale indicator (2.6).
- No invented dollar "net savings" math — ADR-009 mandates side-by-side display, not a collapsed number.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default MPG | No `gma_vehicle_mpg`; distance 5, gasPrice 4.1, nationalMpg 28 | `30% off — $1.46 to get there` | N/A |
| Vehicle MPG set | `gma_vehicle_mpg` = 20 (valid) | Same card → `$2.05` (10 × 4.1/20) | N/A |
| Garbage vehicle MPG | `gma_vehicle_mpg` = `"abc"`, `0`, `-5`, or `null` | Silent fallback to `nationalMpg` | No console noise, no crash |
| Invalid gas inputs | `gasPrice` or `distanceMiles` or both MPGs non-positive/non-finite | Card shows `35% off` alone — no `— … to get there` fragment | `roundTripGasCost` returns null |
| Rounding | distance 12.4, gasPrice 4.1, mpg 28 | `$3.63` (24.8 × 0.146428… = 3.6315… → toFixed(2)) | N/A |
| Every card | Feed with HH + daily deals | Each card shows its own gas cost from its dispensary's `distanceMiles` | N/A |

</frozen-after-approval>

## Code Map

- `client/src/components/DealCard.tsx` — current `{discountPct}% off` line becomes the side-by-side Discount Display; new prop
- `client/src/components/DealFeed.tsx` — computes window/countdown props today; gains gas-cost derivation per row
- `client/src/hooks/useLocalStorage.ts` — existing generic hook; read `gma_vehicle_mpg` through it (JSON-parsed)
- `client/src/types/index.ts` — `Meta.gasPrice`, `Meta.nationalMpg`, `Dispensary.distanceMiles` (consume as-is)
- `client/src/components/DealFeed.test.tsx` — existing assertions like `getByText('30% off')` will break with the new combined line — update deliberately
- `_bmad-output/planning-artifacts/architecture.md` — localStorage key schema: `gma_vehicle_mpg` (reference)

## Tasks & Acceptance

**Execution:**
- [x] `client/src/utils/gasCost.ts` — create: `roundTripGasCost(distanceMiles, gasPrice, mpg): number | null` — exact formula; null when any input is non-finite or ≤ 0; plus `formatGasCost(cost): string` → `$X.XX`
- [x] `client/src/utils/gasCost.test.ts` — create: matrix cases — default-MPG math, vehicle-MPG math, rounding, every invalid-input combination → null
- [x] `client/src/components/DealCard.tsx` — modify: replace the standalone discount line with the side-by-side Discount Display; new `gasCostText: string | null` prop (null → discount only)
- [x] `client/src/components/DealCard.test.tsx` — modify: update discount assertions to the combined line; add null-gasCostText variant
- [x] `client/src/components/DealFeed.tsx` — modify: read `gma_vehicle_mpg` via `useLocalStorage`, resolve effective MPG per the Always rule, compute + format per row, pass prop
- [x] `client/src/components/DealFeed.test.tsx` — modify: update `% off` assertions to combined lines ($1.46 with seed meta); add vehicle-MPG-set case ($2.05) and garbage-MPG fallback case; add invalid-gasPrice case (discount alone)
- [x] `client/src/App.test.tsx` — verify: feed-region test unaffected (empty dispensaries) — update only if assertions break

**Acceptance Criteria:**
- Given a fresh visitor (no localStorage beyond age gate), when the feed loads, then every card shows `N% off — $X.XX to get there` computed from `nationalMpg` with zero user action.
- Given `gma_vehicle_mpg` holds a valid number, when the feed renders, then all gas costs use it instead of `nationalMpg`.
- Given `DealCard.tsx` and `DealFeed.tsx` sources, when inspected, then the formula appears only in `gasCost.ts`.
- Given the full client suite, when `npm test -- --run`, `npx tsc -b`, `npm run lint` run in `client/`, then all pass (82 existing tests, updated where the Discount Display changed them deliberately).

## Spec Change Log

- 2026-06-10 (review pass 1, patch-level — no loopback): Blind Hunter ran as a sub-agent; Edge Case Hunter and Acceptance Auditor were performed inline by the orchestrator after sub-agent session limits. Patches: shared `isPositiveFinite` predicate exported from `gasCost.ts` (DealFeed had duplicated the validity rule), non-finite-product guard in `roundTripGasCost`, strengthened positivity assertion, and two new tests (per-dispensary distance costs, JSON-string `'"20"'` MPG fallback — locks the "stored value must be a number" contract for Epic 3's writer). KEEP: matrix math values ($1.46/$2.05/$3.63) verified against the formula by hand.

## Verification

**Commands:**
- `cd client; npm test -- --run` — expected: all suites pass
- `cd client; npx tsc -b` — expected: zero type errors
- `cd client; npm run lint` — expected: clean

**Manual checks (if no CLI):**
- `npm run dev` both sides: every card shows `% off — $X.XX to get there`; set `localStorage.gma_vehicle_mpg = '20'` in devtools, reload, verify costs increase; set it to `'abc'`, reload, verify silent fallback.

## Suggested Review Order

**The formula (one home, guarded)**

- Entry point: exact PRD formula, null on bad inputs OR non-finite product
  [`gasCost.ts:10`](../../client/src/utils/gasCost.ts#L10)

- Shared validity predicate — DealFeed reuses it so the MPG rule can't drift
  [`gasCost.ts:3`](../../client/src/utils/gasCost.ts#L3)

**MPG resolution & per-row derivation**

- localStorage `gma_vehicle_mpg` wins only as a finite number > 0; else `nationalMpg`
  [`DealFeed.tsx:66`](../../client/src/components/DealFeed.tsx#L66)

- Per-card cost from each dispensary's own `distanceMiles`, formatted upstream
  [`DealFeed.tsx:70`](../../client/src/components/DealFeed.tsx#L70)

**Discount Display (ADR-009)**

- One line, em dash: `35% off — $1.80 to get there`; null cost → discount alone
  [`DealCard.tsx:24`](../../client/src/components/DealCard.tsx#L24)

**Peripherals (tests)**

- Matrix math, invalid-combo sweep, overflow guard
  [`gasCost.test.ts:4`](../../client/src/utils/gasCost.test.ts#L4)

- Vehicle/garbage/JSON-string MPG cases, per-distance costs, gasPrice-0 degradation
  [`DealFeed.test.tsx:149`](../../client/src/components/DealFeed.test.tsx#L149)

- Combined-line card variants incl. null gasCostText
  [`DealCard.test.tsx:27`](../../client/src/components/DealCard.test.tsx#L27)
