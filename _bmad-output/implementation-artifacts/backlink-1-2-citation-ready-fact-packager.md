---
baseline_commit: aaab002674160b2620357d00e7aa1bafdc60d570
---

# Story 1.2: Citation-ready fact packager

Status: review

<!-- DECISIONS pre-set from Story 1.1 / ADR-113 precedent (Erik: "default to private output unless I say otherwise"):
  1. Output location = PRIVATE under ~/GmaS-data/ (env-overridable); NOT committed, NOT served, NOT in $derivedFiles. AR-1/AR-3 do NOT apply (same rationale as ADR-113). See Dev Notes "Output location".
  2. NOT scheduled — this is an ON-DEMAND tool. AR-4 (Scheduled-Task go-ahead) is NOT triggered; do not touch ai-citation-local.ps1 or setup-ai-citation-task.ps1.
  3. INPUT = the committed server/data/derived/*.json (read-only) — exactly what SSR /compare/* + /store/* serve, so the source URL the packager cites is truthful (AR-7). Env-overridable base dir.
  Two design choices left to dev-start are RECOMMENDED (not open blockers) in Dev Notes "Fact selection" and "CLI shape"; proceed on the recommendation. -->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator (Erik),
I want a copy-paste-ready honest fact for a given topic/geo with its caveat already attached,
so that I never pitch a number the derivation engine can't vouch for when I answer a thread.

## Acceptance Criteria

**AC-1 — Select a gated fact for a query/geo (FR-4)**
- Given a supplied topic/category and a WA geo,
- When the packager runs,
- Then it returns the single most relevant gated fact drawn from the existing committed derived JSON — cross-store spread (`disparities.json`), real-drop-vs-own-median (`price-vs-own-median.json`), or regional price floor (`regional-price-floor.json`) — reading only, never re-scraping or re-computing (AR-7);
- And a geo outside WA is rejected with no out-of-state fact returned;
- And a fact is returned only if it passes the honesty gate (see AC-3 / Dev Notes "Honesty gate").

**AC-2 — Render channel-shaped, caveat-baked copy (FR-5)**
- Given a qualifying gated fact and a named IN-channel,
- When copy is rendered,
- Then the output includes the number, its plain-English caveat, and a source reference (URL) to the live gmaslist page that already publishes the fact;
- And the copy contains no health or potency claim, no discount-hype framing (no "% OFF", no "SALE"), and never implies gmaslist sells product (the positioning line "independent information service — not a cannabis seller" is included).

**AC-3 — Refuse when no gated fact vouches (FR-6)**
- Given no honesty-gated fact answers the supplied query,
- When the packager runs,
- Then it emits an explicit "nothing citable" result and never a fabricated or loosely-computed number;
- And the HIGH side of a cross-store disparity (the expensive store — e.g. the "$84 Donny Burger" high price) is never emitted as a citable low/deal; only the cross-store LOW is citable, framed as such;
- And a stale / freshness-unverified regional floor is never emitted as a citable number;
- And a non-finite / non-positive price is never emitted.

**AC-4 — Read-only, no re-computation, no engine calls (AR-7, NFR-4)**
- Given the packager reads already-derived JSON,
- When it produces copy,
- Then it re-renders existing gated facts and never re-derives, re-scrapes, re-parses weights, or makes any AI-engine / network call (zero marginal cost).

**AC-5 — Fail-soft (NFR-1)**
- Given a required derived JSON file is missing, empty, or malformed,
- When the packager runs,
- Then it emits a "nothing citable" / partial result stating the reason (never crashes, never fabricates), exit 0.

**Cross-cutting (epic-level, apply to this story):**
- Every packaged fact carries its source reference (the live gmaslist URL) so the operator can verify before acting (NFR-3).
- Idempotent (NFR-2): re-running for the same topic/geo produces the same copy (pure function of the committed inputs).
- TypeScript strict mode; tests written for all pure logic; the architectural decision recorded as ADR-114 in `ADR.md`.

## Tasks / Subtasks

- [x] Task 1 — Pure packager logic module, unit-tested (AC-1, AC-2, AC-3, AC-4)
  - [x] Created `server/scripts/factPackager.ts` as a PURE module (no `fs`, no network), mirroring the pure/IO split in `citationMonitor.ts` / `citationShareTracker.ts`.
  - [x] Defined a `CitableFact` discriminated union (`DisparityFact` / `RegionalFloorFact` / `OwnMedianFact`) + `NoFact`. Reuses `Disparity` (`types/index.ts`), `RegionalFloor` (`regionalPriceFloor.ts`), `PriceVsOwnMedianRow` (`priceVsOwnMedian.ts`), and `Region`/`slugify` (`regionModel.ts`) for geo→region and source-URL slugs.
  - [x] `resolveGeo(geoInput, regions)`: covered WA `Region` (slug/label/member city) → `statewide` sentinel → explicit OUT-of-WA reject (NON_WA_TOKENS) → uncovered-WA-area. Added a small category-alias map so "vape"/"carts" → "Vaporizers".
  - [x] `selectFact({topic, geo}, sources)`: ranking geo+category regional floor > statewide disparity (largest spread) > store-in-geo own-median drop; else `{kind:'none', reason}`.
  - [x] Honesty guards in the pure layer: (a) disparities emit `lowPrice` only (high side is contrast ceiling only), `storesCarrying.length >= 2`; (b) skip `stale === true` floors; (c) reject non-finite/≤0 prices; (d) never read `excluded[]`; own-median gated `pctVsMedian<0` && display ≥1%.
  - [x] `renderCopy(fact, channel)` + `renderNoFact` + `renderResult`: number, verbatim SSR caveat, source URL, positioning line; no potency, no banner %, no "% off"/"sale", never implies selling.
  - [x] Wrote `server/scripts/factPackager.test.ts` (19 vitest tests): geo resolve (region/city/statewide/OUT-of-WA/uncovered); ranking + tie-breaks; the "$84 Donny Burger" trap; stale-floor skip; non-finite/≤0 reject; sub-1% + premium suppression; no-fact → `{kind:'none'}`; copy carries number+caveat+URL+positioning and NO hype/potency/selling; refusal emits no dollar figure.
- [x] Task 2 — IO runner + CLI (AC-1, AC-2, AC-5)
  - [x] Created `server/scripts/factPackagerRun.ts` (IO, mirrors `citationShareRun.ts`): parses `--topic`/`--geo`/`--channel`; reads the three committed derived JSON from `DERIVED_DIR` (default `server/data/derived`) via the reused `readDerived` + exported empty envelopes from `valueRoute.ts`; projects regions via `buildRegions` over `buildApiData()`'s store→city map (fail-soft); calls the pure functions; prints copy + writes the private record.
  - [x] Output: stdout is the deliverable; also writes `fact-pack-<topic>-<geo>.md` + `.json` under `FACT_PACK_DIR` (default `~/GmaS-data/`) — private, not committed/served.
  - [x] Fail-soft: missing/empty/malformed → "nothing citable" stating the reason, exit 0; `import.meta.url` direct-execution guard so importing helpers in tests has no side effects.
  - [x] Run banner + summary line (topic, geo, selected kind or reason, record path).
  - [x] `loadRegions` omits the request-time freshness overlay (local-checkout artifact; ADR-111 makes committed floors freshness-invariant; Gate 6 already applied upstream) — see Dev Notes / ADR-114.
- [x] Task 3 — ADR + header comments (cross-cutting)
  - [x] Header comments on both new files point at ADR-114 + the reach-launch-plan ("reads committed derived facts, no engine calls, private output").
  - [x] Wrote ADR-114 in `ADR.md` (context/decision/honesty-guards/freshness-overlay/output-location/rationale/consequences/testing) + a change-log row.
  - [x] Did NOT touch any Scheduled Task / ps1 (on-demand tool; AR-4 not triggered).

## Dev Notes

### The three source facts (confirmed shapes, live 2026-08-06)
All under `server/data/derived/`, each an honesty envelope `{ data, excluded, coverage, generatedAt }`. Read ONLY `data`; `excluded[]` holds rows the engine already rejected — never emit them.

- `disparities.json` → `data.disparities: Disparity[]`. Row: `{ matchKey, displayName, category, weightGrams, lowPrice, highPrice, spread, spreadPct, storesCarrying: [{dispensaryId, price, quantityAvailable}] }`. BY CONSTRUCTION a same-product, same-weight cell across ≥2 stores (Gate 1). **`highPrice` is the expensive store — NEVER a "deal". The "$84 Donny Burger" in FR-6 is literally a real row's `highPrice`.** Citable fact = "as low as `$lowPrice` at `<low store>`, vs `$highPrice` elsewhere — same product, same weight."
- `regional-price-floor.json` → `data.clusters[].floors: RegionalFloor[]`. Floor: `{ matchKey, displayName, category, weightGrams, floorPrice, floorDispensaryIds[], storeCountInCluster, stale? }`. A per-product min WITHIN a same-product cell — NOT a category leaderboard. **Skip `stale === true`** (freshness unverified — don't paste an unverified number publicly). Cluster carries `clusterId`, `memberDispensaryIds`, `storeCount`.
- `price-vs-own-median.json` → `data.rows: PriceVsOwnMedianRow[]`. Row: `{ dispensaryId, productId, name, category, option, currentPrice, medianPrice, pctVsMedian, observedDays }`. The ONE honest per-item discount (below the SKU's own rolling median; Gate 2 / fix6). `pctVsMedian < 0` = a real drop; ignore `>= 0`. Apply the same display gate `storeRoute.renderableStoreDrops` uses (drop must round to ≥1%).

### Fact selection ranking (FR-4 "most relevant") — RECOMMENDED, proceed on it
Given `{ topic (→ category), geo }`:
1. **Regional floor for that category in that geo** (strongest — geo- AND category-specific). Requires geo to resolve to a covered `Region`; pick the cheapest non-stale floor in the matching category (reuse `floorsForCategory`). Source URL `/compare/<catSlug>/<regionSlug>`.
2. **Statewide cross-store disparity for that category** (geo = statewide, or no regional floor). Pick the row with the largest honest gap (`spreadPct` desc) whose `lowPrice` is finite/positive and `storesCarrying.length >= 2`. Source URL `/compare/<catSlug>`.
3. **Own-median drop in that category at a store in that geo** (fallback). Deepest `pctVsMedian` (most negative) among renderable rows whose `dispensaryId` is in the region's `memberDispensaryIds`. Source URL `/store/<dispensaryId>`.
4. None qualify → `{ kind: 'none', reason }`.
Topic→category match: case-insensitive against the derived `category` values (`Flower`, `Vaporizers`, `Concentrate`, `Edible`, ...); a free-text topic that matches no category falls back to statewide-disparity search across all categories, else `none`.

### Honesty gate (AC-3, load-bearing — this is the whole point of the tool)
The derived `data` is already gated (Gate 1 same-product, Gate 2 own-median, Gate 6 staleness excludes stale disparity records, weight-category gating). The packager's added guards on top:
- Disparities: emit `lowPrice` only; the framing must say "as low as $X ... same product, same weight," never present `highPrice` as anything but the contrast ceiling. `storesCarrying.length >= 2` (defensive; engine guarantees it).
- Regional floor: `stale === true` → not citable.
- Own-median: `pctVsMedian < 0` AND `Math.round(abs(pctVsMedian)*100) >= 1` (mirror `renderableStoreDrops`).
- Universal: citable price `Number.isFinite` and `> 0`; never emit from `excluded[]`; no potency field is ever read/rendered; no banner/promo % is ever computed (there is none in these facts by design).

### Caveat phrasing (FR-5) — mirror the LIVE SSR wording VERBATIM (do not invent new claims)
- Disparity / regional floor: "Same product at the same weight — a per-product low, not a discount or a category ranking. Prices are shelf prices, not discounts. Verify in store." (from `compareRoute.ts` accounting lines).
- Own-median drop: "Priced below its own recent typical price at this store, based on observed price history — not a fake sale." (from `storeRoute.ts` "Real price drops" copy: "below their own recent typical price ... based on observed price history"; and "X% below its usual: $curr vs $median usual").
- Always append the positioning line (from `positioningDisclaimer.ts`): "Gmas List is an independent information service — not a cannabis seller."
- Freshness: when the source page carries an "as of <date>" line, the copy may state "as of <date>" — but do NOT fabricate a date; prefer the fact's own `generatedAt` day, or omit.

### Source-reference URLs (FR-5) — the live pages that already publish the fact (AR-7)
`BASE_URL = https://gmaslist.com`. Category slug = `regionModel.slugify(category)` (byte-identical to `compareRoute.categorySlug`). Region slug = the `Region.slug` from `buildRegions`.
- Regional floor → `${BASE_URL}/compare/${catSlug}/${regionSlug}`
- Statewide disparity → `${BASE_URL}/compare/${catSlug}`
- Own-median drop → `${BASE_URL}/store/${dispensaryId}`
These are exactly the routes in `compareRoute.ts` / `storeRoute.ts`, so the cited URL truly renders the fact.

### WA geo (FR-4)
The whole dataset is WA-only by invariant (all stores WA-geocoded), so any emitted fact is inherently WA. `resolveGeo` therefore: (1) match against covered `Region` slugs + member cities (from `buildRegions`) → return that Region; (2) accept "wa"/"washington"/"statewide" → statewide sentinel; (3) if the input carries a clearly non-WA signal (a US state token that isn't WA, or a known non-WA city) → REJECT as outside-WA (AC-1); (4) otherwise (an unrecognized-but-plausible WA locality we don't cover) → `{kind:'none', reason:'no covered geo'}` — a "we don't cover that area yet," NOT a WA rejection. Keep the non-WA reject list pragmatic; the dev can seed it with neighboring-state tokens (OR, ID, CA, "portland", ...).

### Store→city source for buildRegions (IO layer)
`regionModel.buildRegions(report, cityById, statusById?)` needs a store→city map. `storeRoute.ts` builds it from `buildApiData().dispensaries` → `regionModel.parseCity(address)`. Reuse that path in `factPackagerRun.ts` (fail-soft: wrap in try/catch → empty regions → statewide-only still works). This reproduces the EXACT `/compare/<region>` slugs the source URL must point at (a divergent slug would 404 the citation).

### Architecture — pure/IO split (mirror the monitor + tracker)
All selection/rendering/guard logic in `factPackager.ts` (pure, unit-tested, no fs/network); all reading (derived JSON, buildApiData) + CLI + writing in `factPackagerRun.ts`. This is what keeps AC-4 true and makes the honesty guards testable without files.

### Output location — DECISION (private; mirrors ADR-113)
Same reasoning as Story 1.1: the planning artifacts' AR-1/AR-3 say "write to `server/data/derived/` + register in `$derivedFiles`," but (1) this is operator work-product (pitch copy), not a served fact, and PRD §5 says these tools are not a deployed/public surface; (2) `$derivedFiles` is the commit list for `deriveFactsRun.ts` outputs on the DERIVE task — a different pipeline this tool isn't part of. So: primary deliverable is stdout; a private record file (`fact-pack-<topic>-<geo>.md` + `.json`) is written under `FACT_PACK_DIR` (default `~/GmaS-data/`), NOT committed, NOT served, NOT in `$derivedFiles`. AR-1/AR-3 deliberately not applied (record the override in ADR-114). The tool READS the committed `server/data/derived/*.json` (input, read-only) — that's the served fact it cites.

### Testing standards
- Framework: vitest. Co-locate `factPackager.test.ts` next to the module. Pure tests use hand-built fixtures (a disparity with a high/low pair for the Donny-Burger trap, a stale floor, a sub-1% own-median row, a clean row per kind).
- Run: `cd server` then the repo test command (vitest). Also run the real `npm run build` before done — `tsc --noEmit` + vitest can pass while the production build fails (repo lesson).
- Manual verify: `cd server ; npx tsx scripts/factPackagerRun.ts --topic Flower --geo bellingham` (regional floor), `--topic Vaporizers --geo wa` (statewide disparity), `--geo portland` (WA reject), `--topic nonsense --geo wa` (nothing citable); and against a temp `DERIVED_DIR` pointing at a missing file (fail-soft, exit 0).

### Project Structure Notes
- New files: `server/scripts/factPackager.ts` (pure), `server/scripts/factPackagerRun.ts` (IO), `server/scripts/factPackager.test.ts`. Import convention is the `.js` extension in TS imports (e.g. `../utils/regionModel.js`, `../utils/crossStoreValue.js`).
- No client / server-runtime code is touched; nothing is added to the Express app or the served bundle (PRD §5). The tool imports server utils but runs only via `tsx` locally.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2: Citation-ready fact packager] — story + ACs
- [Source: _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/prd.md#4.2 Citation-Ready Fact Packager] — FR-4/FR-5/FR-6
- [Source: _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/addendum.md] — AR-7 (reads derived JSON), AR-1/AR-3 (overridden here), AR-8 (repo norms)
- [Source: _bmad-output/implementation-artifacts/backlink-1-1-citation-share-tracker.md] — the shipped sibling: pure/IO split, private-output decision (ADR-113), fail-soft + import.meta.url guard patterns to mirror
- [Source: server/utils/crossStoreValue.ts] — `Disparity` type; the same-product cross-store fact (lowPrice/highPrice/storesCarrying)
- [Source: server/utils/regionalPriceFloor.ts + server/utils/regionModel.ts] — `RegionalFloor`/`Region`; `buildRegions`, `slugify`, `findRegion`, `floorsForCategory`, `parseCity`; region slugs = the /compare source URLs
- [Source: server/utils/priceVsOwnMedian.ts] — `PriceVsOwnMedianRow`; the own-median honest-discount fact (Gate 2)
- [Source: server/routes/compareRoute.ts] — live caveat wording + /compare/:category(/:region) URLs the packager cites
- [Source: server/routes/storeRoute.ts] — `renderableStoreDrops`, "Real price drops" caveat wording, /store/:id URL; store→city via buildApiData+parseCity
- [Source: server/utils/positioningDisclaimer.ts] — the "not a cannabis seller" positioning line to append
- [Source: server/scripts/citationShareRun.ts] — IO runner pattern (env paths, atomic write, import.meta.url guard, fail-soft) to mirror
- [Source: server/data/derived/{disparities,regional-price-floor,price-vs-own-median}.json] — the live inputs (envelope shape confirmed 2026-08-06)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- New unit tests: `factPackager.test.ts` 19/19 passing.
- Full server suite: 910/910 passing (71 files) — was 891 before this story (+19).
- Server production build (`npm run build`): clean (tsc + copyData).
- Smoke (real committed derived data, `FACT_PACK_DIR`→scratchpad): `--topic Flower --geo bellingham` → regional-floor "$4.80 Bellingham", source `/compare/flower/bellingham`; `--topic Vaporizers --geo wa` → statewide disparity "as low as $23.00", source `/compare/vaporizers`; `--geo "Portland OR"` → out-of-WA refusal (no number); `--topic zzzznope --geo wa` → nothing citable; missing `DERIVED_DIR` → nothing citable, exit 0.

### Completion Notes List

- Reads-not-recomputes (AR-7): consumes the committed `server/data/derived/{disparities,regional-price-floor,price-vs-own-median}.json` (the exact SSR-served facts), reuses `valueRoute.readDerived` + exported empty envelopes for fail-soft envelope-shape reads; makes no engine calls / no re-derivation (AC-4).
- Honesty guards (AC-3): disparity emits the LOW side only — the "$84 Donny Burger" high side is never a citable low (proven by a dedicated test using the real row); stale floors skipped; sub-1%/premium own-median suppressed; non-finite/≤0 rejected; `excluded[]` never read; no potency/hype/selling-claim; explicit "nothing citable" refusal never a fabricated number.
- **Design finding (freshness overlay):** `buildRegions` with a store→status map applies the request-time 3h freshness gate; on a local checkout `data.json` is hours old, which falsely marked EVERY store stale and suppressed every regional floor. Resolved by NOT passing statusById — per ADR-111 committed floors are freshness-invariant page existence and Gate 6 already excluded genuinely stale records upstream, so the packager cites the committed floor exactly as the live page publishes it (the pure `stale` guard still honors any pre-marked floor). Documented in ADR-114.
- Output-location decision (ADR-114, mirrors ADR-113): copy printed to stdout (deliverable) + recorded to `~/GmaS-data/fact-pack-<topic>-<geo>.md/.json` (`FACT_PACK_DIR`-overridable) — NOT committed/served/in `$derivedFiles`. AR-1/AR-3 deliberately not applied; INPUT is the committed derived JSON (read-only).
- On-demand only — NOT scheduled; AR-4 not triggered; no ps1/Scheduled Task touched.
- Added the `import.meta.url` direct-execution guard to the runner (mirrors the tracker) so importing `parseArgs`/helpers in tests has no side effects.
- Small usability add: category-alias map ("vape"/"carts"→Vaporizers, "dab"/"rosin"→Concentrate, ...) so a natural topic word matches the derived category.

### File List

- server/scripts/factPackager.ts (new — pure logic)
- server/scripts/factPackagerRun.ts (new — IO runner + CLI)
- server/scripts/factPackager.test.ts (new — 19 unit tests)
- ADR.md (modified — ADR-114 + change-log entry)
- _bmad-output/implementation-artifacts/backlink-1-2-citation-ready-fact-packager.md (this story)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status updates)

### Change Log

- 2026-08-06: Implemented Story 1.2 (citation-ready fact packager) — pure packager module + IO runner/CLI + 19 tests; reads committed derived facts, renders caveat-baked citable copy, refuses when nothing gated vouches; private output under `~/GmaS-data/`; ADR-114. Status → review.
