---
title: 'User-relative distance (GPS + WA ZIP) — CAP-2 + CAP-3'
type: 'feature'
created: '2026-06-26'
status: 'in-review'
baseline_commit: '6aeb400772dbd66e1ac03dbb77dec3b9dda51220'
context:
  - '{project-root}/_bmad-output/specs/spec-location-distance-and-card-revisions/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-location-distance-and-card-revisions/mechanism.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The live app shows a fixed-origin distance (ZIP 98270, ADR-008/011) identical for every visitor — fabricated-feeling and a Honest-Math violation. This is chunk 2 of spec-location-distance-and-card-revisions: CAP-2 (no location → no distance/$ anywhere, feed still lists deals) + CAP-3 (set location via one-tap GPS or a WA ZIP, then distances are measured from the user).

**Approach:** Add a `useLocation` hook (localStorage `gma_location`, validated at use site like `gma_vehicle_mpg`) fed by two doors — browser Geolocation (exact) and a WA ZIP resolved against a committed Census ZCTA centroid table. A single transform `applyUserDistance` REPLACES each store's `distanceMiles` (computed = `haversine(user, store) × 1.3`); with no location it strips `distanceMiles` entirely, so every existing consumer (pill, gas line, radius filter, nearest-first sort) keeps working untouched and the 4 originals' seeded fixed-origin distance is retired, not bypassed. Location UI lives both as a first-run onboarding step after the age gate AND as a persistent top-of-feed bar (Erik-confirmed).

## Boundaries & Constraints

**Always:**
- Honest Math (ADR-007/009): never fabricate a distance. No location OR no store coords → no `distanceMiles` → no pill, no gas line. The feed still lists every store's deals (CAP-2, ADR-043 deals-first).
- The transform REPLACES `distanceMiles` unconditionally (never augments): a store WITH a seeded `distanceMiles` and NO location must render no pill and no gas line. This is what retires ADR-008/011 — do not rely on stripping `data.json` (the `chore(data)` cron may re-inject it).
- Distance = `haversine(user, store) × 1.3` road factor feeding the EXISTING `roundTripGasCost` (`client/src/utils/gasCost.ts`). One formula home; no second formula.
- ZIP is WA-only by design: a non-WA / unrecognized / malformed ZIP resolves to `null` = the no-location state (no number, no crash, no guess). GPS accepts any finite coords (haversine is global).
- Zero paid services, no API keys (Render free): device GPS, committed store `lat`/`lng`, committed WA ZCTA centroid table only.
- Carry-in (ADR-044 #1): `normalizeDispensaries` now STRIPS a present-but-non-finite `lat`/`lng` (keeps the store + its deals — coords are ADR-043 deals-first enrichment like `address`, NOT a drop gate). The real NaN protection is the finite-guard in the transform.
- TypeScript strict; tests for every behavior.

**Ask First:**
- Any change to the radius-slider default/reframe (non-goal #5) or a centroid cold-start sort (non-goal #4).

**Never:**
- No driving-time/traffic/routing — approximate road distance only.
- No national ZIP coverage; no telephone area-code locator.
- No vehicle-selector prominence redesign / no fueleconomy.gov hardening (CAP-5 — chunk 3).
- Do not commit or push — leave changes in the working tree for review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | 
|----------|--------------|----------|
| No location | `location=null`, store has seeded `distanceMiles=2.5` | No pill, no gas line; store + deals still render |
| GPS set | `location={lat,lng,source:'gps'}`, store has lat/lng | Pill shows `haversine×1.3`; gas line if vehicle set |
| WA ZIP set | ZIP `98270` → centroid | Each in-range store shows distance from centroid |
| Non-WA / bad ZIP | `00000` / `99999` / `abc` / `''` | No location set; no number; no crash (honest no-location state) |
| Store missing coords | location set, store has no `lat`/`lng` | No pill/gas for that store; sorts last; deals still show |
| Poisoned coord | store `lat: NaN` in payload | normalize strips the coord (store kept); transform yields no distance |
| GPS denied/unavailable | user denies / no geolocation | Visible message; no location set; feed unaffected |

</frozen-after-approval>

## Code Map

- `client/src/types/index.ts` — add `UserLocation { lat; lng; source: 'gps' | 'zip' }`.
- `client/src/data/zipCentroids.wa.json` — committed Census 2024 ZCTA centroids, WA only (605 ZIPs, public domain).
- `client/src/utils/zipCentroids.ts` — `lookupZipCentroid(zip): { lat; lng } | null` (5-digit guard; WA table lookup). +test.
- `client/src/utils/distance.ts` — `haversineMiles`, `roadDistanceMiles` (×1.3). +test.
- `client/src/utils/withUserDistance.ts` — `applyUserDistance(dispensaries, location)` REPLACES `distanceMiles`. +test.
- `client/src/utils/normalizeDispensaries.ts` — strip present-but-non-finite `lat`/`lng` (keep store). +test.
- `client/src/hooks/useLocation.ts` — `gma_location` localStorage (use-site validated), GPS + ZIP actions, transient status. +test.
- `client/src/components/LocationInput.tsx` — two-door presentational (GPS button + ZIP form + status). +test.
- `client/src/components/LocationOnboarding.tsx` — first-run step (LocationInput + "Not now"). +test.
- `client/src/components/LocationBar.tsx` — persistent top-of-feed (summary + change / set). +test.
- `client/src/components/DealFeed.tsx` — accept `location` prop; apply `applyUserDistance` before filter/sort.
- `client/src/App.tsx` — wire `useLocation` + `gma_location_onboarded`; render onboarding first-run, bar + feed after.
- `client/src/styles/components.css` — location input/bar/onboarding styles.
- ADR.md — retire ADR-008/011; record the engine + the coord strip-not-drop deviation.

## Tasks & Acceptance

**Acceptance Criteria:**
- Given no stored location, when the feed renders, then zero cards show a distance pill or gas line, yet every store's deals still list.
- Given a store with a seeded `distanceMiles` and no location, when it renders, then no pill and no gas line appear (fixed-origin retired).
- Given the user grants GPS or enters a recognized WA ZIP, when the feed renders, then each in-range card shows a distance measured from that location and the list is nearest-first.
- Given an unrecognized/empty ZIP, when submitted, then the app stays in the no-location state with no number and no crash.
- Given `npm run build`, then the real production build is clean.

## Spec Change Log

- **2026-06-26:** Created for chunk 2. Placement decided by Erik: gate-first-run onboarding + persistent control. Coord validation deviates from mechanism.md ("mirror the distanceMiles drop"): coords STRIP, not drop, the store (ADR-043 deals-first; matches `address`). Logged for ADR.
- **2026-06-26 (review + fixes):** High-effort 8-angle code review (see `spec-user-relative-distance.review.md`, 10 findings). Fixed in chunk 2: **#2** transient status bleed — LocationInput now gates the ZIP error / GPS notice on in-instance interaction (local `submittedZip`/`gpsTried`), so a stale status from the onboarding instance can't paint the bar's fresh field, and the error clears on edit; **#3** `validate()` now rejects finite-but-impossible coords (lat∉[-90,90]/lng∉[-180,180]); **#5** added an exact-gas-from-real-road-distance test pinning the DealFeed distance→gas wiring. Left for chunk 3: **#1** empty-feed when nearest store >50mi (= the out-of-scope #5 slider reframe). Optional polish deferred: #4 bar GPS-collapse, #6 onboarding flash, #7 memoization, #8 focus-trap dedup, #9 coord-validity consolidation, #10 lazy ZIP table. Client 448 tests + server 260 green; lint + build clean.
- **2026-06-26 (browser smoke):** Live Chromium walkthrough vs real backend (Playwright). Age gate → onboarding (both doors, focus on GPS) → CAP-2 no-location: 0 pills / 0 gas, all stores' deals still list, seeded `remedy-tulalip distanceMiles:2.5` stripped → CAP-3 ZIP 98270: 13 in-range pills nearest-first (3.2→11.3 mi) → reload persists → clear → back to 0 → CAP-3 GPS (Marysville): 13 pills nearest-first (2.6→10.3 mi), bar "current location". All AC visually confirmed. Screenshots in session scratchpad.
- **2026-06-26 (implemented):** All tasks done. WA ZCTA table generated from the Census 2024 national Gazetteer (605 WA ZIPs, all in-bounds, spot-checked 98270/98101/99201). Engine: `distance.ts`, `zipCentroids.ts`, `withUserDistance.ts`, `useLocation.ts`; UI: `LocationInput`/`LocationOnboarding`/`LocationBar`; wired `DealFeed` (transform) + `App` (onboarding + bar). `tsconfig.app.json` += `resolveJsonModule`. Test seam: `DealFeed.test.tsx` mocks `applyUserDistance` to identity (downstream behavior), `DealFeed.distance.test.tsx` runs the real transform (CAP-2/CAP-3). client **439** + server **260** green; `npm run build` clean; eslint clean. ADR-057 recorded. Not committed/pushed. status → in-review.
