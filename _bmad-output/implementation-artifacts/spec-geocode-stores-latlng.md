---
title: 'Geocode all 22 stores + add lat/lng to records & type'
type: 'feature'
created: '2026-06-21'
status: 'done'
context: []
baseline_commit: '7d1c030707b370f9aca068b481602953149d1455'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 0 of 22 stores carry real coordinates. `distanceMiles` is the legacy fixed-origin-98270 number on the 4 originals and absent on the 18 Dutchie stores, so no honest per-user distance is possible. This is the unblocking substrate for User-Relative Positioning (brainstorm 2026-06-21, proposed ADR-044) — deliverables #3 (live distance/sort) and #4 (centroid cold-start) are dead without it.

**Approach:** A one-time, dev-time script geocodes every store via free OpenStreetMap **Nominatim** (no key, no runtime dependency) and writes `lat`/`lng` onto each record in the **committed** `server/data/data.json`. Add optional `lat?`/`lng?` to the `Dispensary` type. Coords must be committed (Render's disk is ephemeral — every redeploy resets `data.json` to the seed), and they survive cron ingests because `applyIngest` mutates records in place by id (touching only `deals`/`lastFetchedAt`/`stale`).

## Boundaries & Constraints

**Always:**
- Dev-time only: NO runtime geocoding, NO API key, NO new runtime dependency (Render free plan).
- `lat`/`lng` are additive OPTIONAL fields (like `status`) — absent-or-finite-number; no consumer reads them yet.
- Idempotent: only fills records missing coords; re-running is a no-op.
- Respect Nominatim usage policy: ≤1 request/second, a real `User-Agent`.
- Honest Math (ADR-007/009): never fabricate a coordinate; an unresolved store stays uncoorded.

**Ask First:**
- If any store's street address cannot be confidently sourced from its own site / public Dutchie listing → HALT, do not guess coords.
- If Nominatim coverage proves too unreliable for these stores → HALT before falling back to any paid/keyed service.

**Never:**
- No runtime/per-request geocoding; no paid geocoder.
- Do NOT add `address` as a runtime schema field (it is dev input only, lives in the script).
- Do NOT implement distance math, sort, centroid, slider, ZIP/Geolocation input, or ferry chip — those are deferred #2–#6.
- Do NOT touch `applyIngest` / the ingest route / scrapers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh store | record has no `lat`/`lng`, address resolves | write finite `lat`/`lng` onto the record | N/A |
| Already geocoded | record already has `lat`/`lng` | skip (idempotent), leave untouched | N/A |
| No / ambiguous result | Nominatim returns 0 results | leave record uncoorded, log a warning, exit non-zero so the dev notices | no write |
| Out-of-region match | resolved coord outside WA bounds (lat 45.5–49.0, lng −124.8…−116.9) | reject as a likely-wrong match, log, leave uncoorded | no write |
| Rate-limit / network | Nominatim 429 or fetch error | back off and retry once; if still failing, HALT the run | partial writes already on disk are fine (idempotent resume) |

</frozen-after-approval>

## Code Map

- `client/src/types/index.ts` -- `Dispensary` interface; add optional `lat?`/`lng?` (shared by server via import).
- `server/data/data.json` -- committed seed of 22 records; script writes coords here; THIS file is the deliverable.
- `server/scripts/geocodeStores.ts` -- NEW dev-time script (run via `tsx`, mirror `printStores.ts`/`ingestRun.ts` style). Holds the inline `id → address` map, the Nominatim client, the WA-bounds sanity check, and the idempotent merge.
- `server/scripts/geocodeStores.test.ts` -- NEW; unit-tests the pure merge/validation helpers (no network).
- `server/utils/applyIngest.ts` -- REFERENCE ONLY (no change): confirms in-place id-matched mutation preserves `lat`/`lng` across cron ingests.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/types/index.ts` -- add `lat?: number` and `lng?: number` to `Dispensary` with a short comment (additive enrichment, populated by the geocode script, consumed by deferred #3/#4) -- keeps the type honest and compiling.
- [x] `server/scripts/geocodeStores.ts` -- new script: (a) inline `id → address` map with a source comment per store; (b) Nominatim fetch with `User-Agent` + ≥1s spacing; (c) pure helpers `mergeCoords`/`inWaBounds`; (d) atomic write back to `data.json`; (e) per-store warn + non-zero exit when a store stays uncoorded. **Added `VERIFIED_COORDS`** — a cited per-store override for 4 addresses OSM lacks at house-number precision (Nominatim can't resolve them); checked before the address path.
- [x] `server/data/data.json` -- ran the script; committed `lat`/`lng` on **21 of 22** records (all in WA bounds, spot-checked). `liv-ferndale` left uncoorded by Erik's call (no confidently-sourced WA address; renders with no distance/gas, honest per ADR-043).
- [x] `server/scripts/geocodeStores.test.ts` -- unit-tests `mergeCoords`, `inWaBounds`, `geocode` (injected GET), and a `VERIFIED_COORDS`-in-bounds guard; no network. (server suite 153 green)

**Acceptance Criteria:**
- Given a clean checkout, when `npx tsx server/scripts/geocodeStores.ts` runs, then every store with a sourced address (**21 of 22** — all but `liv-ferndale`, deferred per the Ask-First HALT) ends with a finite `lat`/`lng` inside WA bounds; a second run reports all-skipped (no diff); and the run exits 0 because the only uncoorded store is the known-deferred `liv-ferndale` (an unexpected miss exits non-zero).
- Given the type change, when `npm run build` runs, then client and server compile with no errors.
- Given a committed `data.json` with coords, when a cron ingest runs against a store, then that store's `lat`/`lng` remain unchanged (only `deals`/`lastFetchedAt`/`stale` move).

## Spec Change Log

- **2026-06-21 — 3-layer review (blind / edge-case / acceptance).** No intent_gap, no bad_spec; acceptance auditor PASS on every Always/Never/Ask-First boundary and all 5 I/O rows. **Patches applied** (code, not spec): (1) added `EXPECTED_UNCOORDED` allowlist so the script exits non-zero only on an *unexpected* miss — avoids a permanent `exit(1)` from the known-deferred `liv-ferndale` (both adversarial reviewers' top finding); (2) `geocode` guards `rows[0]` is a non-null object before reading `.lat`/`.lon` (no `TypeError`-burns-retry on a `[null]`/HTML-200 body); (3) `mergeCoords` + the skip-guard use `Number.isFinite` instead of `typeof === 'number'`, so a stray `NaN` is re-resolved not mistaken for geocoded; (4) warn on dead `STORE_ADDRESSES`/`VERIFIED_COORDS` keys that match no store id. +3 tests (12 total). **Doc:** AC-1 reconciled to 21/22 + exit-code semantics; `VERIFIED_COORDS` override recorded here and in ADR-044. **Deferred to #3:** `normalizeDispensaries` does not validate `lat`/`lng` — harmless now (no consumer), but its future consumer (#3 live distance) should add a finite-coord drop-rule. **Rejected as non-issues:** lock-free write "racing the cron" (the cron writes prod's ephemeral `data.json`, not the local repo file; `withDataLock` is in-process only — no cross-process protection), pacing, inclusive WA-bounds edges, partial-run re-fetch.

## Design Notes

Addresses are dev input, not schema — the `id → address` map is the only place a street address exists, and nothing at runtime reads it. Each map entry carries a comment citing where the address came from; an unsourceable store triggers the Ask-First HALT, not a guessed coord. This slice lands the data substrate of proposed **ADR-044**; ADR-044 is fully realized when #3 ships and ADR-008/011 are formally retired — add the ADR-044 entry noting this slice when committing.

## Verification

**Commands:**
- `npx tsx server/scripts/geocodeStores.ts` -- expected: all 22 records gain finite in-WA `lat`/`lng`; re-run is a clean no-op.
- `npm run build` -- expected: client + server compile clean (type change).
- `npm test --prefix server` -- expected: new `geocodeStores` helper tests pass; existing suite green.

**Manual checks:**
- Spot-check 3–4 resolved coords (e.g. Remedy Tulalip, Salish Coast/Port Townsend, a Bellingham store) land in the correct city/county before committing `data.json`.

## Suggested Review Order

**The mechanism (start here)**

- Entry point — the run loop: skip-if-coorded → verified override → Nominatim → WA-bounds → merge.
  [`geocodeStores.ts:129`](../../server/scripts/geocodeStores.ts#L129)

- Idempotent merge — `Number.isFinite` so a stray `NaN` is re-resolved, not mistaken for geocoded.
  [`geocodeStores.ts:84`](../../server/scripts/geocodeStores.ts#L84)

- Nominatim client — keyless, UA header, null-safe parse (handles `[]`/`[null]`/non-numeric).
  [`geocodeStores.ts:106`](../../server/scripts/geocodeStores.ts#L106)

- Coarse WA bounding box — rejects out-of-state mis-geocodes (e.g. Ferndale, MI).
  [`geocodeStores.ts:78`](../../server/scripts/geocodeStores.ts#L78)

**The data sources (honesty)**

- Cited `id → address` map; `liv-ferndale` deliberately omitted (Ask-First HALT).
  [`geocodeStores.ts:26`](../../server/scripts/geocodeStores.ts#L26)

- `VERIFIED_COORDS` — cited building-precision overrides where OSM lacks the house number.
  [`geocodeStores.ts:62`](../../server/scripts/geocodeStores.ts#L62)

- `EXPECTED_UNCOORDED` — keeps the exit code honest (fail only on an *unexpected* miss).
  [`geocodeStores.ts:72`](../../server/scripts/geocodeStores.ts#L72)

- Committed result — 21/22 records carry coords; the real deliverable (ephemeral-disk survival).
  [`data.json`](../../server/data/data.json)

**Supporting**

- Additive optional type — no consumer reads it yet (deferred #3/#4).
  [`index.ts:34`](../../client/src/types/index.ts#L34)

- Helper unit tests (no network): bounds, idempotency, parse edges, override/expected guards.
  [`geocodeStores.test.ts:1`](../../server/scripts/geocodeStores.test.ts#L1)
