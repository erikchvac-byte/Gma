---
baseline_commit: 297dc32af6ef3182e6cf299a01a002fbe317276d
---

# Story derivation-1.4: Cross-store disparity rollups (D4)

Status: done

## Story

As a **data consumer**,
I want rollups over the already-computed cross-store disparities,
so that the keystone fact is summarizable (by category and by store/geo) without recomputing or mutating the base disparities artifact (FR11).

## Grounding (read before starting — real `disparities.json`/`data.json` state, story-creation time 2026-07-09)

Queried the live committed artifacts directly rather than trusting the epics doc's numbers/scope on faith — same discipline as 1.2.5/1.3.

- **246 disparities live**, not 217 as the epics doc's FR11 line says (`server/data/derived/disparities.json`, `coverage: { totalRecords: 5392, placedRecords: 4260, disparityCount: 246 }`, `generatedAt: 2026-07-09T21:59:40Z`). The dataset has grown since the epics doc was written; do not hardcode 217 anywhere, and don't be surprised if the count differs again by implementation time — assert `>= 2` distinct stores per row (already guaranteed upstream) and structural shape, not an exact count, in tests.
- **`Disparity` (server/types/index.ts:149) does NOT carry a `brand` field.** Fields are: `matchKey`, `displayName`, `category`, `weightGrams`, `lowPrice`, `highPrice`, `spread`, `spreadPct`, `storesCarrying: DisparityStore[]` (`dispensaryId`, `price`, `quantityAvailable`). The epics doc's story-1.4 prose says "summarizable (by category, brand, geo)" but the ACs themselves (re-read below) never actually mandate a brand dimension — and **brand is intentionally out of scope here**: decision B (epics-derivation-engine.md line 135) puts the shared brand-key normalizer in Story 1.5, consumed by 1.5/1.6, specifically so "1.5 vs 1.6 order is free." Story 1.6 (brand→store matrix) is the brand-dimension story. Building a brand rollup in 1.4 would (a) require either parsing `matchKey`'s first `|`-delimited segment (an internal identity-key format never intended as a public parse contract — `productMatchKey.ts`'s own header calls it "weight-FREE product identity," not documented as brand-extractable) or (b) modifying `buildMatchReport`/`Disparity` itself, which 1.1's Dev Notes explicitly forbid ("DO NOT modify... their existing byte-identical parity tests... are the oracle"). **Decision for this story: rollups group by `category` (direct field, zero risk) and by `dispensaryId`/store (direct field via `storesCarrying`); brand is explicitly NOT a rollup dimension in 1.4** — leave it for 1.6's shared normalizer.
- **Geo is a real join gap, not a trivial lookup.** `storesCarrying[].dispensaryId` spans **21 distinct stores** in the live disparities data, but `server/data/data.json`'s public `dispensaries[]` array only has **18** entries (all 18 carry `lat`/`lng`). The **7 missing** — `a-greener-today-lynnwood`, `northwind-anacortes`, `kaleafa-oak-harbor`, `western-bud-burlington`, `210-cannabis-arlington`, `euphorium-lynnwood`, `prc-arlington` — are Weedmaps-only product stores that live in the **private** registry `server/scrapers/weedmaps-stores.ts` (`WEEDMAPS_STORES`), not in `data.json` (ADR per that file's own header: "net-new Weedmaps stores are deliberately NOT added to data.json"). Each `WEEDMAPS_STORES` entry carries its own `lat`/`lng` **unless** `overlap: true`, in which case it deliberately omits coords and inherits them from `data.json` by shared `dispensaryId`. **A geo rollup built only against `data.json` would silently under-cover 7/21 (one-third) of stores carrying disparities** — this is exactly the kind of silent-exclusion Inspectability (FR7) exists to prevent. The rollup's geo lookup MUST merge both sources (see AC3).
- **No route currently exists for a rollups artifact** (only `disparities`/`deal-scope` are served, per `server/index.ts`; `extraction-health`/`special-events` are internal-only, per 1.2.5/1.3's explicit "no route — no consumer yet" scoping). FR11's own text says the keystone fact "needs a served consumer surface + rollups" — read together with the party-mode decision ("1.4... adds only the rollups" on top of 1.1's already-served disparities route), the net-new "consumer surface" for 1.4 is the **rollups artifact's own route**, mirroring the exact `disparitiesRoute`/`dealScopeRoute` pattern (private, fail-soft, envelope-shaped). This is a scope decision made at story-creation time, not literal AC text in the epics doc — flagged here so it isn't missed or second-guessed as scope creep.

## Acceptance Criteria

1. **Separate artifact, oracle untouched (decision A).** Rollups are computed from the **already-written** `disparities.json` envelope's `data.disparities` array (the output of `buildMatchReport`, unchanged) and written to a **new, separate** `server/data/derived/disparity-rollups.json`. `buildMatchReport`, `Disparity`, `DisparityStore`, and `disparities.json`'s own shape/content are **never modified** — the 1.1 oracle (and its `productsDb.test.ts` parity tests) stays valid untouched.
2. **By-category rollup.** For every distinct `category` value across `data.disparities`, emit one entry: `{ category, disparityCount, avgSpreadPct, distinctStoresInvolved }` — `disparityCount` = number of disparity rows in that category; `avgSpreadPct` = mean of those rows' `spreadPct` (2dp); `distinctStoresInvolved` = size of the union of `storesCarrying[].dispensaryId` across that category's rows. Category grouping never merges rows across different `matchKey`s into a single price comparison (Gate 1) — it only counts/averages already-independent, already-honest per-product rows; no new cross-product price claim is created.
3. **By-store rollup with merged geo lookup.** For every distinct `dispensaryId` appearing in any `storesCarrying[]` across `data.disparities`, emit one entry: `{ dispensaryId, lat, lng, disparityCount, timesCheapest, timesPriciest }` — `disparityCount` = number of disparity rows this store appears in; `timesCheapest`/`timesPriciest` = number of those rows **with a real price spread (`highPrice > lowPrice`)** where this store's price equals that row's `lowPrice`/`highPrice`. Zero-spread rows (all stores tied at one price — ~47% of live rows, since the oracle emits a disparity for any ≥2-store group with no spread filter) contribute to **neither** counter: a tie is not an actionable cheapest/priciest, and crediting both would inflate the metric up to ~13× (amended per code-review 2026-07-09). The store still appears in `disparityCount` on a tie — it genuinely carries the row. `lat`/`lng` are resolved via a merged lookup: check `server/scrapers/weedmaps-stores.ts`'s `WEEDMAPS_STORES` first (its own `lat`/`lng` if `overlap: false`; else fall through to `data.json`'s entry for the same `dispensaryId`), else check `data.json`'s public `dispensaries[]` directly. A `dispensaryId` found in **neither** source resolves to `lat: null, lng: null` and is counted under `excluded[{ reason: 'missingGeo' }]` — never silently defaulted or dropped from the rollup row itself (only its geo fields go null; `disparityCount`/`timesCheapest`/`timesPriciest` are still reported). This is a pure grouping/counting/lookup pass — no new price-derivation logic (FR11: "not new derivation").
4. **No whole-catalog leaderboard (Gate 1).** Neither rollup ranks or compares absolute prices across *different* products (e.g. no "cheapest flower in WA" claim spanning multiple `matchKey`s) — `avgSpreadPct`/counts are aggregates of already-independent, already-honest same-product rows, never a new cross-product price assertion.
5. **Honesty envelope (FR7, NFR6).** `DisparityRollupsReport` is wrapped via the existing `wrapEnvelope` helper: `excluded[]` = `[{ reason: 'missingGeo', count }]`; `coverage` = `{ totalDisparities, categoryCount, storeCount }`. Strict-typed unit tests cover: multi-row category aggregation (avg computed correctly, not just summed), a store appearing as cheapest in one row and priciest in another, a store resolvable only via `WEEDMAPS_STORES` (non-overlap), a store resolvable only via `data.json` (plain Dutchie-only store, absent from `WEEDMAPS_STORES` entirely), a `WEEDMAPS_STORES` `overlap: true` entry correctly inheriting `data.json`'s coords (not its own, since it has none), and a `dispensaryId` present in neither source landing in `excluded` with null geo.
6. **Wired into the runner.** `deriveFactsRun.ts` calls the new pure function with the **already-computed** `report.disparities` (from the existing `buildMatchReport(productsFile)` call already in `deriveFacts()` — do not call `buildMatchReport` a second time), plus the two geo sources, wraps and writes `disparity-rollups.json` via the same `atomicWriteJson` pattern as the three existing writes, **appended after** the existing `special-events.json` write (preserves the write-ordering discipline established by 1.2.5's review — see Dev Notes). `DeriveOutcome` is extended with the new path + a short summary; `main()` gets a matching `console.log` line.
7. **Served consumer surface (FR11).** New route `GET /api/value/disparity-rollups` in `valueRoute.ts` (`disparityRollupsRoute`), registered in `server/index.ts` alongside the existing two `/api/value/*` routes. Same private/internal, fail-soft posture: missing/unparseable/wrong-shaped file degrades to a safe empty envelope (mirror `EMPTY_DISPARITIES_ENVELOPE`'s pattern exactly, including the fixed non-"now" `generatedAt` for the empty constant). No client/public consumer — private route only, same as `disparities`/`deal-scope`.
8. **Regression-safe.** `data.json`, the deals pipeline, `buildMatchReport`, `buildDealScopeLinks`, `buildExtractionHealthReport`, `buildSpecialEventsReport`, existing `disparities.json`/`deal-scope.json`/`extraction-health.json`/`special-events.json` output, `WEEDMAPS_STORES`, and every existing type are unchanged (FR3, NFR5) — this story only *reads* `WEEDMAPS_STORES` and `data.json`'s dispensaries, never writes to either. Full server test suite stays green; `npm run build` (client + server) stays clean.

## Tasks / Subtasks

- [x] **Build the geo-lookup helper** (AC: 3)
  - [x] `buildStoreGeoLookup(dispensaries: Dispensary[], weedmapsStores: WeedmapsStore[]): StoreGeoLookup` added to `server/utils/disparityRollups.ts` (colocated, per the story's "or a small shared helper" option — kept pure/testable with plain fixture arrays, no registry import inside). Non-overlap `WeedmapsStore` entries use their own committed coords; overlap entries fall through to the `dispensaries` match by id; anything in neither source maps to `null` (not thrown, not omitted).
  - [x] Imports `type WeedmapsStore` from `server/scrapers/weedmaps-stores.js` and `type Dispensary` from `client/src/types/index.js` (type-only — no runtime import of `WEEDMAPS_STORES`/registry data into this module; the caller in `deriveFactsRun.ts` builds the real arrays via the existing `readDispensaries` helper and passes them in).
- [x] **Build the pure rollup function** (AC: 1, 2, 3, 4, 5)
  - [x] New file `server/utils/disparityRollups.ts` with `CategoryRollup`, `StoreRollup`, `DisparityRollupsReport`, `StoreGeoLookup` types exactly as specified.
  - [x] `buildDisparityRollups(disparities: Disparity[], geoLookup: StoreGeoLookup): DisparityRollupsReport` — pure, no I/O, no DB/Express/scraper-registry import.
  - [x] Groups by `category` for `byCategory` (count + true average `spreadPct` + distinct store union); groups by `dispensaryId` (flattened across `storesCarrying`) for `byStore`, comparing each store's `price` to the row's `lowPrice`/`highPrice` for `timesCheapest`/`timesPriciest`.
- [x] **Unit tests** `server/utils/disparityRollups.test.ts` (AC: 5) — 10/10 passing. Covers: multi-row category true-average (not sum), cross-category separation (Gate 1), store cheapest-in-one/priciest-in-another, geo resolved + missing-geo counted without dropping the row, dispensaryId absent from the lookup entirely, empty-input report, plus the 4 geo-lookup-merge cases (Dutchie-only via data.json, Weedmaps-only non-overlap via its own coords, overlap inheriting data.json coords, neither source → unresolvable).
- [x] **Wire into the runner** (AC: 6, 7, 8)
  - [x] In `deriveFactsRun.ts`, after the existing `special-events.json` write, build the geo lookup from `readDispensaries(dataPath)` (hoisted into a shared `dispensaries` variable also reused by `buildDealScopeLinks`) + `WEEDMAPS_STORES`, call `buildDisparityRollups(report.disparities, geoLookup)` (reusing the existing `report`, no second `buildMatchReport` call), wrap via `wrapEnvelope`, write `disparity-rollups.json` via `atomicWriteJson`.
  - [x] Extended `DeriveOutcome` (`disparityRollupsPath`, `categoryCount`, `storeCount`) + added a matching `main()` `console.log` line.
  - [x] Added `disparityRollupsRoute` to `valueRoute.ts` (mirrors `disparitiesRoute`/`dealScopeRoute` exactly — `EMPTY_DISPARITY_ROLLUPS_ENVELOPE` constant with the fixed non-"now" `generatedAt`, `readDerived<DisparityRollupsReport>`).
  - [x] Registered `app.get('/api/value/disparity-rollups', disparityRollupsRoute)` in `server/index.ts` next to the existing two.
- [x] **Update `deriveFactsRun.test.ts`** (AC: 6, 8) — extended the main regression test with rollups assertions (envelope-shaped, correct counts against the `populatedFile()` fixture), plus a NEW dedicated wiring test exercising the real geo merge: `western-bud-burlington` (real non-overlap `WEEDMAPS_STORES` entry, its own coords), a fixture-only `store-only-in-datajson` (coords from a fixture `data.json`, absent from `WEEDMAPS_STORES`), and `nowhere-store` (in neither source → `lat:null,lng:null`, counted in `missingGeoCount`). 6/6 passing.
- [x] **Update `valueRoute.test.ts`** (AC: 7) — new `describe` block for the route (happy-path shape, envelope fields, per-row shape assertions, independence from `/api/data`'s shape) + fail-soft assertions added to the existing missing-file/wrong-shape cases.
- [x] **Live-data proof** — ran the real `deriveFacts()` CLI against this machine's `server/data/products.db`: **228 disparities → 4 categories, 21 stores, `missingGeoCount: 0`** (the geo-merge fully resolves live — confirms the story's grounding concern about the 7 Weedmaps-only stores was real and is now correctly handled). `coverage.totalDisparities` (228) matches the regenerated `disparities.json`'s own `coverage.disparityCount` (228) exactly. See Debug Log for full byCategory/byStore sample.
- [x] **Full regression + build** (AC: 8) — full server test suite: 518/518 passing (44 files, +16 from the 502-test baseline). `npm run build` (client + server) exits clean.

## Dev Notes

### Anti-patterns to avoid (LLM-dev-agent disaster prevention)

- **Do not** add a `brand` field to `Disparity`, `DisparityStore`, or `MatchReport`, and do not parse `matchKey`'s internal `|`-delimited segments to extract a pseudo-brand. Brand rollups are Story 1.6's job (shared normalizer from 1.5, decision B). This story's rollups are category + store/geo only (see Grounding).
- **Do not** call `buildMatchReport` a second time inside the rollup wiring — `deriveFactsRun.ts` already computed `report` once for the `disparities.json` write; pass `report.disparities` straight through.
- **Do not** build the geo lookup against `data.json`'s `dispensaries[]` alone — that misses 7 of the 21 stores that actually carry disparities (see Grounding). Must also consult `WEEDMAPS_STORES`, respecting its `overlap` flag (overlap entries have no coords of their own; non-overlap entries do).
- **Do not** silently default a store with no resolvable geo to `{lat: 0, lng: 0}` or omit it from `byStore` entirely — emit the row with `lat: null, lng: null` and count it in `excluded[{reason: 'missingGeo'}]` (Inspectability, FR7).
- **Do not** modify `server/utils/crossStoreValue.ts`, `server/scrapers/weedmaps-stores.ts`, `server/data/data.json`'s dispensary list, or any existing type. This story only reads them.
- **Do not** insert the new write before the existing `special-events.json` write in `deriveFactsRun.ts` — append after, preserving the write-ordering discipline from 1.2.5's code review (a new fallible step placed before existing writes can silently drop them on a throw).

### Testing standards

- TypeScript strict mode; tests for everything (project rule).
- Server suite (vitest) was 502 tests / 44 files as of the 1.3 story-creation baseline — confirm the current count when you run it rather than trusting this number.
- Run the real production build before anything that could auto-deploy: `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest ([[feedback_run-production-build-before-deploy]]).

### Previous story intelligence (derivation-1.3, 1.2.5, 1.1)

- `wrapEnvelope`/`isEnvelope` (`server/utils/derivedEnvelope.ts`) — reuse unchanged, same as every prior fact.
- `atomicWriteJson` (`server/utils/atomicWrite.ts`) — same write helper every existing artifact uses.
- 1.2.5 established the "take a pre-built roster/lookup as a parameter, don't import the registry inside the pure fact module" pattern (`buildExtractionHealthReport(productsFile, storeIds, today)`) — this story's `buildDisparityRollups(disparities, geoLookup)` follows the same shape for testability (pass a fixture `Map` in tests, no real registry import needed in the test file).
- 1.2.5's review found and fixed a write-ordering risk (a new fallible step before existing writes can drop them on throw) — `deriveFactsRun.ts` write order is now: disparities → deal-scope → extraction-health → special-events. This story's write must be appended after special-events, not inserted earlier.
- 1.1 established: additive `server/utils/*.ts` module, short header comment (why not what), pure named exports, colocated `.test.ts`. Follow it.
- Git pattern: recent derivation stories (`297dc32`, `c93e9ab`) are single squash-merged PRs with a `Co-authored-by: Claude Sonnet 5` trailer, one additive module + tests + runner wiring per commit.

### Project Structure Notes

- New files: `server/utils/disparityRollups.ts`, `server/utils/disparityRollups.test.ts`.
- Modified: `server/scripts/deriveFactsRun.ts` (new call + write, `DeriveOutcome` extended, `main()` log line, geo-lookup construction), `server/scripts/deriveFactsRun.test.ts`, `server/routes/valueRoute.ts` (new route + empty-envelope constant), `server/routes/valueRoute.test.ts`, `server/index.ts` (new route registration).
- Regenerated (from the live-data proof run): `server/data/derived/disparity-rollups.json` (new), and routine refreshes of `disparities.json`/`deal-scope.json`/`extraction-health.json`/`special-events.json` if the full `deriveFacts()` CLI is run.
- No changes to: `server/utils/crossStoreValue.ts`, `server/utils/dealScope.ts`, `server/utils/extractionHealth.ts`, `server/utils/specialEvents.ts`, `server/utils/productsDb.ts`, `server/scrapers/weedmaps-stores.ts`, `server/scrapers/dutchie-stores.ts`, `server/data/data.json`, any client file, any existing type in `server/types/index.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story 1.4] — written AC text; corrected/scoped in Grounding above (217→246 count, brand explicitly deferred to 1.6, geo-merge gap identified, route addition justified from FR11's own text).
- [Source: server/utils/crossStoreValue.ts] — `buildMatchReport`/`Disparity` (untouched; the input this story consumes).
- [Source: server/types/index.ts#Disparity, #DisparityStore] — exact fields available for rollup (no brand field, confirmed).
- [Source: server/utils/productMatchKey.ts] — confirms `matchKey`'s first segment is brand-derived but this is an internal identity-key format, not a documented public parse contract; not to be parsed here.
- [Source: server/scrapers/weedmaps-stores.ts#WEEDMAPS_STORES] — the private-registry geo source; `overlap` semantics.
- [Source: server/data/data.json#dispensaries] — the public geo source (18 entries, all geocoded).
- [Source: server/scripts/deriveFactsRun.ts] — current runner (read in full at story-creation time); `readDispensaries` helper to reuse; write-ordering discipline from 1.2.5's review.
- [Source: server/routes/valueRoute.ts] — `disparitiesRoute`/`dealScopeRoute` pattern to mirror exactly for the new route.
- [Source: server/utils/derivedEnvelope.ts] — `wrapEnvelope`/`isEnvelope`, reused unchanged.
- [Source: _bmad-output/implementation-artifacts/derivation-1-2-5-source-extraction-health-fact.md] — pattern for passing a pre-built lookup/roster into a pure fact function instead of importing a registry.
- [Source: _bmad-output/implementation-artifacts/derivation-1-3-special-start-end-event-detection.md] — write-ordering discipline, module/test conventions, "no route unless FR calls for a consumer surface" precedent (contrasted here — FR11 does call for one).
- [Source: ADR.md#ADR-077] — the substrate decision this fact stays inside.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via bmad-dev-story.

### Debug Log References

- `npx vitest run server/utils/disparityRollups.test.ts` — 10/10 passing.
- `npx vitest run server/scripts/deriveFactsRun.test.ts` — 6/6 passing (1 extended pre-existing + 1 new dedicated geo-merge wiring test).
- `npx vitest run server --exclude '**/dist/**'` — full server suite: 44 files / 518 tests passing (up from the 502-test baseline; +16 new, 0 regressions).
- `npm run build` — clean exit (client `tsc -b && vite build`; server `tsc && node scripts/copyData.mjs`).
- **Live-data proof**, real run via `npx tsx server/scripts/deriveFactsRun.ts` against this machine's `server/data/products.db`:
  ```
  [derive] disparities: 228 (from 5219 records)
  [derive] deal-scope links: 13 (from 48 deals)
  [derive] extraction-health: 24 suspected, 2 insufficient-history
  [derive] special-events: 0 started, 0 ended
  [derive] disparity-rollups: 4 categories, 21 stores
  ```
  `disparity-rollups.json`: `coverage: { totalDisparities: 228, categoryCount: 4, storeCount: 21 }`, `excluded: [{ reason: 'missingGeo', count: 0 }]`. `byCategory` = Vaporizers (93, avgSpreadPct 0.27, 18 stores), Flower (100, avgSpreadPct 0.3, 18 stores), Concentrate (24, avgSpreadPct 0.26, 15 stores), Pre-Rolls (11, avgSpreadPct 0.05, 5 stores). All 21 `byStore` rows resolved real lat/lng — confirming the geo-merge across `data.json` + the private `WEEDMAPS_STORES` registry works correctly against live data (not just fixtures); zero stores landed in `missingGeoCount`.
  - **Note on the count vs story-creation grounding:** grounding time (this same session, before implementation) read the already-committed `disparities.json` at 246 disparities/5,392 records. This live run produced 228/5,219 — fewer, not more. This machine's `products.db` has a `products.db-wal` file dated after the `.db` file's own mtime (uncheckpointed writes), and 1.2.5/1.3 already flagged an ongoing ~2-day Dutchie-scraper gap around this date — both point to this being pre-existing DB/scraper state, not something this story's code changed. Recorded honestly per "verify, don't assume"; not investigated further as it's out of scope for a rollup-only story.

### Completion Notes List

- Implemented `buildDisparityRollups`/`buildStoreGeoLookup` in `server/utils/disparityRollups.ts` exactly per the story's grounded design: two rollup dimensions only (category, store/geo) — brand deliberately excluded (deferred to Story 1.6 per decision B, since `Disparity` carries no brand field and `buildMatchReport`/`Disparity` must stay untouched, per 1.1's explicit "DO NOT modify" guidance).
- The geo lookup merges `data.json`'s public dispensaries with the private `WEEDMAPS_STORES` registry (respecting `overlap` — non-overlap entries use their own coords, overlap entries fall through to `data.json`), closing the real 7-of-21-store gap identified during story-creation grounding. A `dispensaryId` in neither source resolves to `lat: null, lng: null` and is counted in `missingGeoCount`, never silently dropped or defaulted (Inspectability, FR7).
- `deriveFactsRun.ts` reuses the already-computed `report.disparities` (no second `buildMatchReport` call) and the already-read `dispensaries` (hoisted into a shared variable, also reused by `buildDealScopeLinks`, avoiding a duplicate `data.json` read). The new write is appended AFTER the existing `special-events.json` write, preserving the write-ordering discipline from 1.2.5's code review.
- New route `GET /api/value/disparity-rollups` mirrors `disparitiesRoute`/`dealScopeRoute` exactly: private, fail-soft, envelope-shaped, fixed non-"now" `generatedAt` on the empty constant.
- Live-data proof confirmed the geo-merge fully resolves against the real current 21-store set (`missingGeoCount: 0`) — validating the story's grounding concern (7 Weedmaps-only stores missing from `data.json` alone) was real and is now correctly handled by the merge.
- No new ADR entry — stays inside ADR-077's existing scope, consistent with 1.1/1.2.5/1.3.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` updated to `in-progress` at start of this session; updated to `review` at completion.

### File List

- `server/utils/disparityRollups.ts` (new)
- `server/utils/disparityRollups.test.ts` (new)
- `server/scripts/deriveFactsRun.ts` (modified — new call + write, `DeriveOutcome` extended, `main()` log line, hoisted `dispensaries` variable, geo-lookup construction)
- `server/scripts/deriveFactsRun.test.ts` (modified — envelope-shape + count assertions for the new artifact in the main regression test, new dedicated geo-merge wiring test)
- `server/routes/valueRoute.ts` (modified — new route + `EMPTY_DISPARITY_ROLLUPS_ENVELOPE` constant)
- `server/routes/valueRoute.test.ts` (modified — new route describe block, fail-soft assertions extended)
- `server/index.ts` (modified — new route registration)
- `server/data/derived/disparity-rollups.json` (new — real data, envelope-shaped)
- `server/data/derived/disparities.json` (regenerated — routine refresh from the real derivation run, unrelated content change)
- `server/data/derived/deal-scope.json` (regenerated — routine refresh, unrelated content change)
- `server/data/derived/extraction-health.json` (regenerated — routine refresh, unrelated content change)
- `server/data/derived/special-events.json` (regenerated — routine refresh, unrelated content change)

Untouched (verified, not modified): `server/utils/crossStoreValue.ts`, `server/utils/dealScope.ts`, `server/utils/extractionHealth.ts`, `server/utils/specialEvents.ts`, `server/utils/productsDb.ts`, `server/utils/derivedEnvelope.ts`, `server/scrapers/weedmaps-stores.ts`, `server/scrapers/dutchie-stores.ts`, any client file, `data.json`, any existing type in `server/types/index.ts`.

## Review Findings

Code review 2026-07-09 (bmad-code-review, inline three-lens: blind diff read + edge-case hunt with project access + acceptance audit vs this spec). Verified state: 518/518 server tests pass, `tsc --noEmit` clean, `npm run build` clean. Diff scope: 7 code files (~474 lines); regenerated data-JSON artifacts excluded from review.

- [x] [Review][Decision] **RESOLVED** (honest-metric fix applied) — `timesCheapest`/`timesPriciest` were inflated up to ~13× by zero-spread ties [server/utils/disparityRollups.ts:100-113] — In live data, 108 of 228 disparity rows (47%) are zero-spread (`lowPrice === highPrice`; the oracle emits a disparity for any ≥2-store group with no spread filter). On every such row, both `s.price === d.lowPrice` and `s.price === d.highPrice` are true, so each participating store is credited as **both** cheapest **and** priciest — 216 such double-credits across the dataset. Concrete distortion: `2020-solutions-pacific-highway` reports `timesCheapest: 82` but genuinely undercut on only 6 rows (76 are ties); `timesPriciest: 92` with the same 76 ties. `hangar-420-west/everett` report `timesCheapest: 23` with only 2 real. AC3 *literally* sanctions this ("a store can be both in a 2-store row"), so the code is faithful to the written spec — but the AC pictured a genuine low-vs-high split, not a degenerate tie, and a "cheapest 82×" stat that is really 6× directly contradicts the project's honesty-gate moat. **Decision needed:** apply the honest-metric fix (attribute cheapest/priciest only when `d.highPrice > d.lowPrice`, so ties count toward neither — deviates from AC3's literal wording), or keep the literal AC behavior as-is. Recommend the fix.

## Change Log

- 2026-07-09: Story created via bmad-create-story. Grounding against the live `disparities.json`/`data.json`/`weedmaps-stores.ts` corrected the epics doc's stale disparity count (217→246), scoped brand explicitly OUT of this story (deferred to 1.6 per decision B), identified a real geo-join gap (7/21 stores missing from `data.json` alone, resolvable only via merging in the private `WEEDMAPS_STORES` registry), and justified adding a new served route from FR11's own text (contrasted with 1.3's "no route" precedent).
- 2026-07-09: Story implemented via bmad-dev-story — `disparityRollups.ts` (+ tests) added, wired into `deriveFactsRun.ts` (appended after the special-events write, reusing `report.disparities` and a hoisted `dispensaries` read), new `GET /api/value/disparity-rollups` route added to `valueRoute.ts`/`server/index.ts`. 518/518 server tests green (+16), production build clean. Live-data proof confirmed the geo-merge fully resolves against the real 21-store set (`missingGeoCount: 0`), validating the story's grounding concern. Status → review.
- 2026-07-09: Code review (bmad-code-review) — 1 decision-needed finding: `timesCheapest`/`timesPriciest` inflated up to ~13× by zero-spread tie rows (47% of live disparities have `lowPrice === highPrice`; each tied store was credited as both cheapest AND priciest). Erik chose the honest-metric fix: attribution now gated on `highPrice > lowPrice`, so ties count toward neither counter (store still counts in `disparityCount`). AC3 wording amended to match; new tie-case unit test added. Regenerated artifact confirms the correction live (`2020-solutions-pacific-highway` 82→6 cheapest, `hangar-420-west` 23→2). 519/519 server tests green (+1), build clean. Status → done.
