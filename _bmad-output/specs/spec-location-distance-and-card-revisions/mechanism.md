# Mechanism — Location, Distance & Card Revisions

Load-bearing implementation mechanism and data dependencies for SPEC-location-distance-and-card-revisions. Most of the location/distance engine is already designed in the source brainstorm and `deferred-work.md` (ADR-044 slices #2/#3); it is lifted here so downstream reads one contract. The card-address and MPG-removal mechanics are new.

## Resolved decisions (Erik-confirmed)

- **Location input = two doors.** Device GPS (one tap, exact) AND a ZIP text box, side by side, with an explicit "no location yet → no distance/$ " empty state. Confident users tap; cautious users type.
- **No vehicle → no gas.** Removing the 28-MPG default means a gas figure requires both a location and a chosen vehicle. Distance shows from location alone; the dollar figure appears only once a vehicle is selected.

## Location & distance engine (adopted from ADR-044 #2/#3)

- **Store coordinates** already exist: optional `lat`/`lng` on `Dispensary`, committed into `data.json` for 21/21 stores via the dev-time `server/scripts/geocodeStores.ts` (OSM Nominatim, no runtime dependency). They survive cron ingests because `applyIngest` mutates records in place by id.
- **User location** resolves to `{lat, lng}` two ways:
  1. **Device GPS** via the browser Geolocation API (one tap; exact).
  2. **ZIP** resolved against a committed **WA Census ZCTA centroid** table (public domain, WA-only). A non-WA / unrecognized ZIP resolves to `null` = "not recognized" (the no-location state), never a crash.
- **Distance** = `haversine(user, store) × 1.3` road factor → feeds the EXISTING `roundTripGasCost(distanceMiles, gasPrice, mpg)` in `client/src/utils/gasCost.ts`. No second formula. Persist the resolved location in `localStorage` (validated at the use site, mirroring the `gma_vehicle_mpg` pattern).
- **Carry-in from the #1 geocode review:** `normalizeDispensaries` validates only `id`/`deals`/`distanceMiles` today — it does NOT validate `lat`/`lng`. When a consumer starts reading coords, add a finite-coord drop-rule there so a poisoned `lat: NaN` can't reach the haversine/sort path (mirror the existing present-but-invalid `distanceMiles` rule).

## MPG removal (CAP-4) — what changes

- `meta.nationalMpg` (currently `28` in `data.json`) stops driving any displayed figure. `DealFeed`'s `effectiveMpg` fallback to `data.meta.nationalMpg` (DealFeed.tsx ~L117) is removed — `effectiveMpg` is the user's vehicle MPG or **nothing**.
- Existing copy in `VehicleSelector.tsx` becomes wrong and must change:
  - L147 "Set it once for exact gas math. **Skip it and we use the national average.**"
  - L161 "...Gas costs will **use the national average.**"
  Both national-average promises must be replaced (skipping now means no gas figure, not an estimate).
- fueleconomy.gov is now load-bearing for ALL gas dollars (no fallback). Close the known reliability gaps (`deferred-work.md`): no loading indicator, no fetch timeout/AbortController, no retry path, silent empty-menu dead end.

## Store address as a data field (CAP-1) — new

- Address is **not** a runtime field today. Per ADR-044, addresses live only in the dev-time `geocodeStores.ts` `STORE_ADDRESSES` map. CAP-1 requires promoting address into a real, validated schema field (`Dispensary.address`), committed into `data.json`, and rendered in the card header (top-right) at deal-title text size.
- **Addresses already exist and are cited** for all 21 stores in `STORE_ADDRESSES` (sourced 2026-06-21 from each operator's site / Yelp / Dutchie locator), including the 4 originals — no new sourcing needed. The build lifts these into the schema/data.json; Erik to spot-verify the originals. Never fabricate a missing one (Honest Math).
- The 4 originals (Erik to verify): **Remedy Tulalip** — 9226 34th Avenue NE, Tulalip, WA 98271; **Kush21 Everett (Evergreen Way)** — 8911 Evergreen Way, Everett, WA 98208; **The Joint - Everett** — 9506 19th Ave SE, Everett, WA 98208; **Jet Cannabis** — 13224 Highway 99, Everett, WA 98204.
- Preserve the user's exact size reference: deal-title size, e.g. the string "Your Purchase Everyday from 7-8am?".
- **Placement (locked, Erik-confirmed via mockup):** address in the top-**right** of the header at deal-title size; the **distance pill tucks just beneath the address**; the gas-trip line is pushed down below that. With no location set there is no pill and no gas line, so the address is the only top-right element under the store name. (Arrangement locked; the specific CSS/markup is the build's call.)

## Vehicle input prominence (CAP-5) — new

- Today the only entry to `VehicleSelector` is an unlabeled gear `IconButton` in the `Header` opening a bottom sheet. CAP-5 requires a plainly visible, labeled affordance in the primary flow so a first-time user finds it without hunting. Exact placement is a UX-resolve item.

## Touch set (indicative, from deferred-work #2/#3 + the new asks)

New: `distance.ts` (+test), `zipCentroids.wa.json` + `zipCentroids.ts` (+test), `useLocation.ts` (+test), `LocationInput.tsx` (+test).
Edits: `client/src/types/index.ts` (`address`; drop reliance on `nationalMpg`), `data.json` (addresses), `normalizeDispensaries` (coord + address validation), `DealCard`, `DealFeed` (remove national-MPG fallback; render address), `VehicleSelector` (copy + obvious entry), `AgeGate`/`Header` (location input + vehicle affordance), `geocodeStores.ts`/address source, ADR.

## Honest-Math invariants (must hold throughout)

- No location → no distance pill, no gas line (CAP-2).
- Location but no vehicle → distance shows, no gas line (CAP-4).
- No fabricated coordinate, MPG, distance, or address ever reaches display.
