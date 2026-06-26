---
title: 'Card store address + remove hardcoded national-MPG default'
type: 'feature'
created: '2026-06-26'
status: 'done'
baseline_commit: '7ab1c31cc3dfb7084a1b3ec3a661315d4dfee785'
context:
  - '{project-root}/_bmad-output/specs/spec-location-distance-and-card-revisions/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-location-distance-and-card-revisions/mechanism.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Deal cards never show the store's street address (the one fact that tells a shopper *which* store this is), and gas-cost math silently falls back to a hardcoded 28-MPG national average (ADR-003/013) — a fabricated number that violates Honest Math (ADR-007/009). This is chunk 1 of spec-location-distance-and-card-revisions: CAP-1 (address on card) + CAP-4 (remove the MPG default).

**Approach:** Promote the already-cited store addresses (`server/scripts/geocodeStores.ts` `STORE_ADDRESSES`) into a real schema field `Dispensary.address` and into `data.json` for all 21 stores, then render it top-right on the card at deal-title text size. Separately, remove `meta.nationalMpg` end-to-end so gas MPG comes only from the user's chosen vehicle — no vehicle, no gas line (distance unaffected).

## Boundaries & Constraints

**Always:**
- Honest Math (ADR-007/009): never fabricate an address or MPG. Lift addresses verbatim from `STORE_ADDRESSES`; an absent address renders nothing, never a placeholder.
- Address is additive enrichment, NOT a visibility gate (ADR-043, mirrors `lat`/`lng`/`status`): optional in the type, populated for all 21 stores in `data.json`, rendered only when a non-empty string is present.
- Layout (Erik-confirmed via mockup): address top-right in the card header at deal-title size (`var(--text-sm)`); the distance pill tucks beneath the address; the gas line sits below the header (pushed down). With no location there is no pill/gas line, so address is the only top-right element under the store name.
- After removal, gas cost requires BOTH a location (a finite `distanceMiles`) AND a chosen vehicle MPG; either missing → no gas line. Distance still shows from `distanceMiles` alone.
- TypeScript strict; write/adjust tests for every behavior change.

**Ask First:**
- If any of the 21 stores in `data.json` has no matching `STORE_ADDRESSES` entry (would force a fabricated or blank address) — HALT and report which.

**Never:**
- No location input, geolocation, ZIP, or user-relative distance recompute (CAP-2/CAP-3 — chunk 2).
- No redesign of the vehicle-selector entry point / no fueleconomy.gov hardening (CAP-5 — chunk 3). Copy fixes to the existing sheet are in scope.
- Do not commit or push — leave changes in the working tree for review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Address present | store with `address: "9226 34th Avenue NE, Tulalip, WA 98271"` | Address rendered top-right at deal-title size | N/A |
| Address absent | store with no `address` | No address element; card still renders | N/A |
| Address present but invalid | `address: ""` / whitespace / non-string | Store + deals still render; address line omitted (address is NEVER a visibility gate, ADR-043) | Treat as absent |
| No vehicle, has distance | `mpg=null`, `distanceMiles=2.5` | Distance pill shows; NO gas line | N/A |
| Vehicle + distance | `mpg=24`, `distanceMiles=2.5` | Distance pill + gas line | N/A |
| No distance | `distanceMiles` absent | No pill, no gas line (address may still show) | N/A |

</frozen-after-approval>

## Code Map

- `client/src/types/index.ts` -- add `address?: string` to `Dispensary`; remove `nationalMpg` from `Meta`.
- `server/data/data.json` -- add `address` to all 21 stores (verbatim from `STORE_ADDRESSES`); delete `meta.nationalMpg`.
- `server/scripts/geocodeStores.ts` -- source of truth for the 21 addresses (read-only here).
- `client/src/utils/normalizeDispensaries.ts` -- address is NOT validated/gated here; a bad address never drops the store (DealCard guards rendering). Only `distanceMiles` keeps its present-but-invalid drop.
- `client/src/components/DealCard.tsx` -- render address top-right header column; distance pill beneath; gas line below.
- `client/src/styles/components.css` -- header column layout + `.gma-dealcard__address` (deal-title size, right-aligned).
- `client/src/components/DealFeed.tsx` -- `effectiveMpg` = vehicle MPG or `null`; gas text null when no MPG.
- `client/src/components/VehicleSelector.tsx` -- fix "national average" copy (~L147, ~L161) to reflect "no vehicle → no gas estimate".
- Test fixtures with `nationalMpg`: `client/src/{App.test.tsx,hooks/useDeals.test.ts,components/DealFeed.test.tsx}`, `server/{routes/dataRoute.test.ts,utils/applyIngest.test.ts,utils/refreshGasPrice.test.ts,utils/runScrapers.test.ts,integration/ingestFreshness.test.ts,scripts/commitBackSeed.test.ts}`.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/types/index.ts` -- add optional `address?: string` to `Dispensary`; remove `nationalMpg: number` from `Meta`.
- [x] `server/data/data.json` -- add `address` (verbatim from `STORE_ADDRESSES`) to each of the 21 stores; remove `meta.nationalMpg`. Verify every store id has a `STORE_ADDRESSES` entry first (Ask First if not).
- [x] `client/src/utils/normalizeDispensaries.ts` -- do NOT gate visibility on address; a bad/empty/non-string address keeps the store (DealCard omits the line). Only `distanceMiles` retains its present-but-invalid drop. Add tests.
- [x] `client/src/components/DealCard.tsx` + `components.css` -- restructure header into name (left) + right column (address top, distance pill beneath); render address when present at deal-title size; keep gas line below the header.
- [x] `client/src/components/DealFeed.tsx` -- replace the `data.meta.nationalMpg` fallback so `effectiveMpg` is the vehicle MPG or `null`; `gasCostText` returns `null` when `effectiveMpg` is `null`.
- [x] `client/src/components/VehicleSelector.tsx` -- update the two "national average" copy strings to state that skipping the vehicle means no gas estimate (distance only).
- [x] Update all `nationalMpg` test fixtures/assertions (9 files above); update `DealFeed.test.tsx` cases that asserted a national-average gas line to assert NO gas line without a vehicle.

**Acceptance Criteria:**
- Given a store with a populated `address`, when its card renders, then the address appears top-right at deal-title size with the distance pill beneath it (or as the only top-right element when no location).
- Given a record whose `address` is present but empty/whitespace/non-string, when normalized then rendered, then the store and its deals still appear with no address line (address never hides a store).
- Given a user with no vehicle selected and a store with a distance, when the card renders, then the distance pill shows and no gas line appears.
- Given the codebase after the change, when searched, then `nationalMpg` exists in no source or test file and no displayed figure derives from a hardcoded MPG.

## Spec Change Log

- **2026-06-26 (post-review, Erik-directed):** (1) Address is no longer a visibility gate — the frozen I/O matrix row "Address present but invalid → drop record" was changed to "store renders, address line omitted" (ADR-043), triggered by the blind-hunter review finding that dropping a store over a cosmetic field contradicts deals-first. `normalizeDispensaries` no longer validates address; DealCard's `typeof` + `.trim()` guard is the single source of truth (no crash/math path exists for address). KEEP: `distanceMiles` retains its present-but-invalid drop (it feeds `.toFixed`/filter/sort). (2) Removed duplicate store `kushmans-everett-evergreen-way` (same physical site as `kush21-everett-evergreen`) from `data.json` (21→20), `products.json` (−272 entries), `DUTCHIE_STORE_IDS`, and `STORE_ADDRESSES`.

## Verification

**Commands:**
- `cd client && npx vitest run` -- expected: all client tests green (including updated address + no-vehicle-no-gas cases).
- `cd server && npx vitest run` -- expected: all server tests green (fixtures updated, storeRegistry/integration unaffected).
- `npm run build` -- expected: real production build (client `tsc -b && vite build` + server `tsc`) clean, no `nationalMpg` type errors.
- `grep -rn "nationalMpg" client server` -- expected: zero matches.

## Suggested Review Order

**CAP-4 — remove the national-MPG default (widest blast radius)**

- Entry point: MPG now vehicle-only; null → no gas line (Honest Math).
  [`DealFeed.tsx:118`](../../client/src/components/DealFeed.tsx#L118)
- Gas needs BOTH distance AND vehicle MPG; either missing → no gas line.
  [`DealFeed.tsx:121`](../../client/src/components/DealFeed.tsx#L121)
- `nationalMpg` removed from the served contract.
  [`index.ts:49`](../../client/src/types/index.ts#L49)
- Copy no longer promises a national-average estimate.
  [`VehicleSelector.tsx:147`](../../client/src/components/VehicleSelector.tsx#L147)

**CAP-1 — store address on the card**

- New optional, additive enrichment field (mirrors lat/lng/status, ADR-043).
  [`index.ts:28`](../../client/src/types/index.ts#L28)
- Address committed verbatim to all 21 stores (cited source map).
  [`data.json:12`](../../server/data/data.json#L12)
- Presence-guarded compute — never fabricated.
  [`DealCard.tsx:93`](../../client/src/components/DealCard.tsx#L93)
- Header restructure: address top-right, pill tucked beneath, gas pushed down.
  [`DealCard.tsx:117`](../../client/src/components/DealCard.tsx#L117)
- Deal-title size + right-aligned column.
  [`components.css:316`](../../client/src/styles/components.css#L316)

**Validation boundary**

- Address is NOT gated here (ADR-043) — only distanceMiles keeps its present-but-invalid drop.
  [`normalizeDispensaries.ts:21`](../../client/src/utils/normalizeDispensaries.ts#L21)

**Tests (supporting)**

- No-vehicle → no gas line.
  [`DealFeed.test.tsx:197`](../../client/src/components/DealFeed.test.tsx#L197)
- Address rendering (present / absent / no-location sole element).
  [`DealCard.test.tsx:396`](../../client/src/components/DealCard.test.tsx#L396)
- Normalize address rule (absent kept; empty/whitespace/non-string dropped).
  [`normalizeDispensaries.test.ts:58`](../../client/src/utils/normalizeDispensaries.test.ts#L58)
