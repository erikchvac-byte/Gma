---
id: SPEC-location-distance-and-card-revisions
companions:
  - mechanism.md
sources:
  - ../../brainstorming/brainstorming-session-2026-06-21-1721.md
  - ../../implementation-artifacts/deferred-work.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Location, Distance & Deal-Card Revisions

## Why

A **pain to fix in what already shipped.** The live app (gmaslist.com) shows distance and gas-cost figures that are not user-relative: the 4 original stores carry a distance measured from a fixed origin (ZIP 98270, ADR-008/011) identical for every visitor, and gas math falls back to a hardcoded 28-MPG national average (ADR-003/013). Both are fabricated-feeling numbers that violate the project's Honest Math rule (ADR-007/009) — they look exact but mean nothing to a user who isn't in Marysville driving the average car. Meanwhile the card omits the one fact that tells an elderly shopper *which* store they're looking at — its street address — and the control that would make the gas math real (the vehicle selector) is hidden behind an unlabeled gear icon. This is the consumer-facing half of the already-planned "User-Relative Positioning" work (ADR-044 slices #2/#3), bundled with three card/MPG corrections Erik called out directly.

## Capabilities

- id: CAP-1
  intent: A user can see each store's street address on its deal card, in the top-right of the card header (distance pill tucked beneath it, gas-trip line pushed down), so the store is identifiable at a glance.
  success: Every card renders the store's real street address in the top-right at the same text size as a deal title, above the distance pill and gas line; with no location set the address is the only top-right element; no card shows a fabricated or placeholder address.

- id: CAP-2
  intent: A user sees a distance and a gas-cost figure only after they have provided a location; with no location, no distance or dollar figure is shown or computed anywhere.
  success: With no stored location, zero cards display a distance pill or a gas line, yet the feed still lists every store's deals.

- id: CAP-3
  intent: A user can set their location by one-tap device GPS or by typing a ZIP, after which every store's distance is measured from that location instead of a fixed origin.
  success: After the user grants GPS or enters a recognized WA ZIP, each in-range card shows a distance measured from the user; an unrecognized or empty ZIP returns the honest no-location state (no number, no crash, no guess).

- id: CAP-4
  intent: Gas-cost math draws MPG only from the user's chosen vehicle — no hardcoded national-average fallback drives any displayed figure.
  success: With no vehicle selected, no card shows a gas-cost figure even when a location is set; distance still shows from location alone; no displayed dollar value derives from a 28-MPG (or any hardcoded) default.

- id: CAP-5
  intent: A user can find and open the vehicle (car type) selector without hunting — it is plainly visible and labeled in the primary flow, not concealed behind an unlabeled icon.
  success: A first-time user can locate a clearly labeled "set your vehicle" control without opening a hidden menu, and its purpose is obvious from its label.

## Constraints

- **Honest Math (ADR-007/009).** Never display a fabricated distance, MPG, or gas figure. A missing input suppresses the dependent figure entirely — never a placeholder, zero, or guessed value.
- **Gas cost requires BOTH a location and a chosen vehicle.** Either one missing → no gas line; distance may still show from location alone. (Erik-confirmed.)
- **fueleconomy.gov is the sole MPG source** (no fallback remains), so the vehicle picker must handle its failure visibly — loading indicator, fetch timeout, retry path, and a distinct "no result" message — never a silent empty/hung dropdown. (Erik-confirmed in scope.)
- **Retires ADR-003/ADR-013 (hardcoded national MPG) and ADR-008/ADR-011 (fixed-origin distance).** Their behavior must be removed, not merely bypassed — `meta.nationalMpg` stops driving any figure and no fixed-origin distance survives.
- **Zero paid runtime services, no new API keys (Render free plan).** Location→coordinates and store coordinates must use only free browser APIs (device GPS), committed store `lat`/`lng`, and a committed WA ZIP-centroid table.
- **One gas-cost formula home.** Distance feeds the existing `roundTripGasCost` (`client/src/utils/gasCost.ts`); no second formula is introduced.
- **Store address becomes a real, validated data field** sourced from cited real addresses — never invented. (21 stores' addresses already exist in the dev-time geocode map; any others must be sourced first.)

## Non-goals

- No driving-time, traffic, or turn-by-turn routing — approximate road distance only.
- No telephone area-code lookup as a location source (too coarse to locate a user).
- No national ZIP coverage — WA-focused; a non-WA ZIP resolves to the no-location state, by design.
- Out of scope (ADR-044 slices not requested here): the radius-slider reframe/default change (#5) and the centroid cold-start sort for users who skip location (#4).
- No change to deal sourcing, scraping, or the ingest pipeline.

## Success signal

A WA user clears the age gate and sees store cards — each showing the store's address in the card header (top-right, above the gas line) — but no distances or dollar figures anywhere. They tap "Use my location" (or type their ZIP) and pick their vehicle from an obvious control; every in-range card now shows a real distance from where they actually are and an accurate round-trip gas cost. Nowhere does a 28-MPG default or a fixed-origin distance appear, and a user who skips the vehicle step still sees distances but no gas dollars.

## Assumptions

- "Same size font as the product name (example: 'Your Purchase Everyday from 7-8am?')" reads as **deal-title** text size, not the larger store-name `<h2>`. Proceeding on deal-title size; the exact layout is logged below.
- "Area code or location" means device GPS or ZIP entry; telephone area code is excluded as a locator (confirmed via the location-input decision).

<!-- Open Questions — all resolved 2026-06-26 (see .decision-log.md):
  - Card layout: address top-right at deal-title size; distance pill tucks beneath it; gas line pushed
    down; with no location, address is the only top-right element. (Erik-confirmed via mockup.)
  - Address sourcing: all 21 stores (incl. the 4 originals) already carry cited street addresses in
    server/scripts/geocodeStores.ts STORE_ADDRESSES. No new sourcing — promote into the runtime schema
    + data.json; Erik to spot-verify the 4 originals.
  - fueleconomy.gov hardening: folded into scope as a Constraint (timeout/spinner/retry/empty-result). -->
