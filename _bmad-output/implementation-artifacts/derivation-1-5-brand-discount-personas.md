---
baseline_commit: 7c37603f7624e89895d1e9b8ca1fb1bae3e944ff
---

# Story derivation-1.5: Brand discount personas (D2)

Status: review

## Story

As a **data consumer**,
I want a per-brand persona (always-on-special / never-discounted / intermittently-discounted) derived from the ~12 days of observation history,
so that a brand's discounting *behavior* is characterized honestly over time — without pretending the flat banner rate is a value signal (FR9, D2).

## Grounding (read before starting — real `products.db` state, story-creation time 2026-07-09)

Queried the live committed `server/data/products.db` directly rather than trusting the epics doc's prose — same discipline as 1.2.5 / 1.3 / 1.4. **The single most important thing in this story is the honesty reframe in point 3 — read it before writing any code.**

1. **13 days of history live** (`2026-06-24` → `2026-07-06`), 5,219 products, 33,169 observations. Matches the epics' "~12 days" claim. Don't hardcode the day count; assert structural shape and use a min-observations gate, not an exact window.

2. **516 distinct raw brand strings; 826 products (16%) carry a null/empty brand.** Null-brand products MUST be excluded and counted (`nullBrand` excluded-entry, FR7) — never bucketed under a fabricated `""` brand. There are **10 real normalization collisions** in the live data that the shared normalizer (decision B) must merge, all casing/punctuation/whitespace: `Lavish`/`LAVISH`, `Plume`/`PLUME`, `Truffle`/`TRUFFLE`, `Vice`/`VICE`, `Bon Bombs`/`BON BOMBS`, `Hustler's Ambition`/`Hustler's Ambition ` (trailing space), `EZ-Vape`/`EZ VAPE`/`EZ Vape`, `EZ-Brand`/`EZ Brand`, `DOCTOR & CROOK`/`Doctor & Crook`, `PACIFIC & PINE`/`Pacific & Pine`. Lowercase + collapse every non-alphanumeric run to a single space + trim merges all 10 and changes NO other brand's identity. After normalization: **505 brands**.

3. **THE HONESTY REFRAME (Gate 2 / fix6 / decision F) — binding.** The epics FR9 line calls the third persona "typical discount **depth**." **Depth-as-magnitude is forbidden in this story and is impossible to compute honestly here.** Two independent reasons, both load-bearing:
   - **fix6 (`investigations/fix6-basePrice-verdict.md`, memory):** a product's `specialPrice`-vs-`basePrice` discount % is a *flat store/brand promo rate* (10 of 15 stores apply one % across ~100% of their catalog matching the banner). It carries **no per-item signal** beyond the banner. A "typical discount depth" built on it would be reporting the banner rate, which is meaningless.
   - **The only honest discount magnitude is price-vs-the-product's-own-rolling-median — that is D6 / FR13, explicitly Epic 2, NOT decomposed in this run.** It needs SQLite time-range queries and a window/floor decision that Epic 2 owns. It is out of scope here by the epic's own FR coverage map.
   - **Decision F makes this mechanical, not a matter of taste:** the persona's input type is narrowed so `basePrice`/`specialPrice` (Gate 2) AND `thc`/`cbd`/`totalTerpenes` (Gate 5) are **not reachable — the breach does not compile.** A persona function that literally cannot see prices cannot compute a discount magnitude.
   - **Grounded resolution (what this story ships):** the third persona is **`intermittently-discounted`**, quantified by the **frequency** a brand is on special — the share of its observed product-days where `observation.special` is true — NOT a discount magnitude. The honest quantity is *prevalence of specials over time*, read purely from the `special` boolean series. The field is named `specialDayFraction`, never `discountDepth`/`avgDiscountPct`. This is flagged to Erik in the closing questions because it deviates from the literal AC wording "depth," but it is the ONLY reading consistent with the gates the epic itself mandates (see AC re-write below).

4. **`observation.special` is the honest, ready signal.** It is a per-observation boolean already stored in `products.db` (`observation.special INTEGER NOT NULL`) and reconstructed onto `ProductObservation.special` by the DB reader. It is source-of-truth per 1.3's header: Dutchie sets it from the source's own flag; Weedmaps ORs it across weight-tier `specialPrice` presence. This story does NOT re-derive it from per-option prices (nor could it — decision F hides those). Live observation split: **70% special=1 (23,194), 30% special=0 (9,975)** — most catalog is on special most days, exactly the flat-rate reality fix6 describes. This is why frequency (not magnitude) is the honest axis.

5. **Live persona distribution (worked example, thresholds MIN_OBSERVED_PRODUCT_DAYS=10, HIGH=0.95, LOW=0.05).** Of 505 normalized brands: **291 classifiable** (≥10 observed product-days), **214 insufficient-history**; among classifiable → **118 always-on-special, 39 never-discounted, 134 intermittently-discounted.** Concrete worked examples the dev can assert against in a live-data proof:
   - always-on-special: `green haven` (61 products, 362 observed product-days, fraction 1.000), `pagoda` (35 / 401 / 1.000), `good vibe tribe` (36 / 336 / 1.000).
   - never-discounted: `zodiac` (12 / 146 / 0.000), `brc` (8 / 48 / 0.000), `royal tree` (14 / 173 / 0.040).
   - intermittently-discounted: `full spec` (86 / 652 / 0.627), `mama j's` (54 / 466 / 0.582), `fire bros` (49 / 242 / 0.368).
   Don't hardcode these exact counts in unit tests (the DB accrues daily and 1.2.5/1.3/1.4 all flagged an ongoing ~2-day Dutchie-scraper gap around this date that shifts totals) — use small hand-built fixtures for unit tests and treat these as the live-proof sanity target only.

6. **No route for this fact.** Precedent: 1.2.5 (extraction-health) and 1.3 (special-events) are internal-only derived artifacts with **no `/api/value/*` route** — only disparities / deal-scope / disparity-rollups are served, because their FRs (or FR11's explicit "served consumer surface" text) called for it. **FR9 does NOT call for a served surface**, and the persona's downstream consumer is 1.6 (brand→store matrix, itself a fact) and Epic 3 surfaces. So this story writes `server/data/derived/brand-personas.json` (envelope-wrapped) and wires it into the runner, but adds **no route** to `valueRoute.ts`/`server/index.ts`. This mirrors extraction-health/special-events exactly and avoids scope creep. (Contrast 1.4, which added a route only because FR11's own text demanded one.)

## Acceptance Criteria

1. **Shared brand-key normalizer, owned once (decision B).** A new shared module `server/utils/brandKey.ts` exports `normalizeBrandKey(brand: string | null | undefined): string | null` — lowercases, collapses every run of non-alphanumeric characters to a single space, trims; returns `null` for null/undefined/empty-after-normalization. It merges the 10 live casing/punctuation/whitespace collisions (see Grounding §2) and changes no other brand's identity. This module is the single owner of brand identity for the derivation engine; **Story 1.6 (brand→store matrix) consumes it unchanged** — do not inline brand normalization inside the persona module. Strict-typed unit tests cover: case-fold merge (`LAVISH`→`Lavish` key), whitespace/trailing-space merge (`Hustler's Ambition ` → same key), punctuation collapse (`DOCTOR & CROOK`/`Doctor & Crook`, `EZ-Vape`/`EZ Vape`), null/undefined/empty/whitespace-only → `null`, and a non-colliding brand round-tripping to a stable distinct key.

2. **Narrowed persona input type — Gate 2 + Gate 5, decision F (the breach does not compile).** The pure persona function takes a **deliberately narrowed** input that exposes ONLY brand identity + the per-day `special` boolean — NOT option prices (`basePrice`/`specialPrice`, Gate 2/fix6) and NOT potency (`thc`/`cbd`/`totalTerpenes`, Gate 5). Define in `server/utils/brandPersonas.ts`:
   ```ts
   export interface BrandDaySignal { observedAt: string; special: boolean }
   export interface BrandProductSeries { productId: string; brand: string | null; history: BrandDaySignal[] }
   ```
   The function signature is `buildBrandPersonas(products: BrandProductSeries[]): BrandPersonasReport`. It does NOT accept `ProductsFile`/`ProductRecord` (which carry prices + potency). A **compile-level negative test** (in `brandPersonas.test.ts`, using `// @ts-expect-error`) asserts that `specialPrice`/`basePrice` are unreachable on `BrandDaySignal` and `thc`/`totalTerpenes` are unreachable on `BrandProductSeries` — proving the fix6/potency breach does not compile (NFR6, decision F).

3. **Per-product gap-tolerant special series via the 1.2 helper (Gate 3, FR6).** For each `BrandProductSeries`, walk its `history` with `walkPresenceAwareSeries` (`getObservedAt: o => o.observedAt`, `getValue: dayItems => dayItems.at(-1)!.special`, no explicit `startDate`/`endDate` — characterize the product's full observed span). Count **observed product-days** = entries whose `status !== 'gap'`; count **special product-days** = observed entries whose `value === true`. A missing interior day (`status: 'gap'`) contributes to NEITHER count (Gate 3: "no observation" is never read as "observed, not-special"). Do not reimplement day-bucketing — the helper is the shared primitive and owns the last-observation-of-day + gap semantics. Wrap the per-product walk in the same `try/catch → treat as fully-gapped` guard `specialEvents.ts` uses, so one anomalous product (all-future-dated history → helper throws on inverted range) can't abort the whole run.

4. **Brand roll-up + classification (FR9).** Group products by `normalizeBrandKey(brand)`, dropping null-key products (counted in `nullBrandProductCount`). For each brand, sum `observedProductDays` and `specialProductDays` across its products, and compute `specialDayFraction = specialProductDays / observedProductDays`. Classify with exported constants:
   - `observedProductDays < MIN_OBSERVED_PRODUCT_DAYS` (10) → `insufficient-history` (`specialDayFraction: null`).
   - `specialDayFraction >= SPECIAL_FRACTION_HIGH` (0.95) → `always-on-special`.
   - `specialDayFraction <= SPECIAL_FRACTION_LOW` (0.05) → `never-discounted`.
   - otherwise → `intermittently-discounted`.
   Constants are module-level named exports with a comment tying HIGH/LOW to the live distribution (Grounding §5) and MIN to the "≥10 observed product-days" sample-size floor, mirroring `extractionHealth.ts`'s `TRAILING_WINDOW_DAYS`/`COLLAPSE_RATIO` convention.

5. **Honest naming + no magnitude (Gate 2, the reframe).** The report reports **frequency of being on special over time**, never a discount magnitude. The quantified field is `specialDayFraction` (share of observed product-days on special). There is NO `discountDepth`/`avgDiscountPct`/`avgSpecialPrice`/any price field anywhere in the output — decision F's type gate makes that structurally impossible, and the naming must reflect it. A module header comment states plainly: honest discount *magnitude* (price vs the product's own rolling median) is Epic 2 / D6 / FR13, deliberately not here.

6. **Report shape + honesty envelope (FR7, NFR6).** `buildBrandPersonas` returns:
   ```ts
   export type BrandDiscountPersona =
     | 'always-on-special' | 'never-discounted' | 'intermittently-discounted' | 'insufficient-history'
   export interface BrandPersona {
     brandKey: string          // normalized key (from normalizeBrandKey)
     displayBrand: string      // a real raw brand label from the group (NOT the normalized key, NOT fabricated)
     productCount: number
     observedProductDays: number
     specialProductDays: number
     specialDayFraction: number | null   // null iff insufficient-history
     persona: BrandDiscountPersona
   }
   export interface BrandPersonasReport {
     personas: BrandPersona[]
     totalBrands: number                 // normalized non-null brands (classifiable + insufficient)
     alwaysOnSpecialCount: number
     neverDiscountedCount: number
     intermittentCount: number
     insufficientHistoryCount: number
     nullBrandProductCount: number       // products excluded for null/empty brand (counted, FR7)
   }
   ```
   `displayBrand` is a representative *raw* label observed in the group (e.g. the raw brand of the group's first-seen or most-observed product) — a real string, never the lowercased key and never invented. In `deriveFactsRun.ts` the report is wrapped via the existing `wrapEnvelope` helper: `excluded[]` = `[{ reason: 'nullBrand', count: nullBrandProductCount }, { reason: 'insufficientHistory', count: insufficientHistoryCount }]`; `coverage` = `{ totalBrands, alwaysOnSpecialCount, neverDiscountedCount, intermittentCount, insufficientHistoryCount }`.

7. **Wired into the runner (FR1, write-ordering discipline).** In `deriveFactsRun.ts`, after the existing `disparity-rollups.json` write (the current last write — **append after it, never insert earlier**, preserving the ordering discipline established by 1.2.5's review: a new fallible step ahead of existing writes can silently drop them on a throw), project the already-read `productsFile` into `BrandProductSeries[]` at the call boundary (`Object.values(productsFile.products).map(r => ({ productId: r.productId, brand: r.brand, history: r.history.map(o => ({ observedAt: o.observedAt, special: o.special })) }))` — this projection is the ONLY place prices/potency are dropped; the pure function never sees them), call `buildBrandPersonas(...)`, wrap via `wrapEnvelope`, and write `brand-personas.json` via the same `atomicWriteJson` pattern as the five existing writes. Reuse the already-read `productsFile` — do **not** re-read the DB. Extend `DeriveOutcome` (`brandPersonasPath`, `alwaysOnSpecialCount`, `neverDiscountedCount`, `intermittentCount`, `insufficientHistoryCount`, `nullBrandProductCount`) and add a matching `main()` `console.log` line.

8. **No route (see Grounding §6).** This is an internal-only derived artifact, mirroring extraction-health / special-events. Do **NOT** add a route to `valueRoute.ts` or `server/index.ts`, and do not add an `EMPTY_*_ENVELOPE` constant. (If a served surface is ever wanted it is a separate story, like 1.4 was for FR11.)

9. **Regression-safe (FR3, NFR5).** `data.json`, the deals pipeline, `buildMatchReport`, `buildDealScopeLinks`, `buildExtractionHealthReport`, `buildSpecialEventsReport`, `buildDisparityRollups`, every existing derived artifact's shape/content, and every existing type are unchanged — this story only *reads* `productsFile` and adds two new `server/utils/*.ts` modules plus runner wiring. `walkPresenceAwareSeries`/`presenceAwareSeries.ts`, `derivedEnvelope.ts`, `atomicWrite.ts` are reused **unchanged**. Full server test suite stays green; `npm run build` (client + server) stays clean.

## Tasks / Subtasks

- [x] **Shared brand normalizer** (AC: 1)
  - [x] New `server/utils/brandKey.ts` — `normalizeBrandKey(brand: string | null | undefined): string | null`; header comment (owned once, decision B, consumed by 1.5 + 1.6). Pure, no domain-type imports.
  - [x] New `server/utils/brandKey.test.ts` — 5 tests covering case-fold, whitespace/trailing, punctuation-collapse ×2, null/empty/punct-only→null, stable distinct key.
- [x] **Pure persona fact** (AC: 2, 3, 4, 5, 6)
  - [x] New `server/utils/brandPersonas.ts` — narrowed input types (`BrandDaySignal`, `BrandProductSeries`), report types, exported constants (`MIN_OBSERVED_PRODUCT_DAYS`, `SPECIAL_FRACTION_HIGH`, `SPECIAL_FRACTION_LOW`), `buildBrandPersonas(products: BrandProductSeries[]): BrandPersonasReport`.
  - [x] Imports `walkPresenceAwareSeries` from `./presenceAwareSeries.js` and `normalizeBrandKey` from `./brandKey.js`. Input type is self-contained (no price/potency field).
  - [x] Per-product walk with the `try/catch → fully-gapped` guard (mirrors `specialEvents.ts`); rolls up per normalized brand; classifies; counts buckets + `nullBrandProductCount`; sorts by brandKey.
  - [x] Module header comment: honest-frequency-not-magnitude reframe, D6/FR13 magnitude deferred to Epic 2 (AC5).
- [x] **Unit tests** `server/utils/brandPersonas.test.ts` (AC: 2, 3, 4, 5, 6) — 10 tests
  - [x] Compile-level `// @ts-expect-error` negative test: `specialPrice`/`basePrice` unreachable on `BrandDaySignal`, `thc`/`totalTerpenes` unreachable on `BrandProductSeries` (decision F).
  - [x] always-on-special / never-discounted / intermittently-discounted classification + a HIGH/LOW threshold-boundary test.
  - [x] Gap-tolerance: a missing interior day is NOT counted in observedProductDays (Gate 3).
  - [x] Two raw spellings normalizing to one key roll up into ONE persona (`displayBrand` a real raw label); null/whitespace-brand products excluded + counted in `nullBrandProductCount`.
  - [x] insufficient-history (< MIN → `specialDayFraction: null`); empty-input → zeroed report.
- [x] **Wire into the runner** (AC: 7, 9)
  - [x] `deriveFactsRun.ts`: projects `productsFile` → `BrandProductSeries[]` at the boundary, calls `buildBrandPersonas`, `wrapEnvelope`, `atomicWriteJson('brand-personas.json')` **appended after** the disparity-rollups write. `DeriveOutcome` extended + `main()` log line added.
  - [x] `server/scripts/deriveFactsRun.test.ts`: extended the main regression test with brand-personas envelope-shape + count assertions against `populatedFile()` (one brand `acme`, 2 observed product-days < 10 → `insufficient-history`, `nullBrandProductCount: 0`).
- [x] **Live-data proof** — ran `npx tsx server/scripts/deriveFactsRun.ts` against `server/data/products.db`: `118 always / 39 never / 134 intermittent / 214 insufficient (826 null-brand excluded)`, exactly matching Grounding §5. Envelope + spot-checks verified (see Debug Log).
- [x] **Full regression + build** (AC: 9) — `npx vitest run --exclude '**/dist/**'`: 534 tests / 46 files green (+15 from 519 baseline). `npm run build` (client + server) clean.

## Dev Notes

### The one thing that matters most (read Grounding §3 first)

This fact is "brand discount personas" but it **must not report a discount magnitude.** The flat banner/special rate carries no honest signal (fix6), and the only honest magnitude is price-vs-own-rolling-median which is **Epic 2 / D6 / FR13, out of scope here.** So the persona is built entirely on the `observation.special` **boolean** — classifying brands by how *often* they're on special (`specialDayFraction`), never by how *much*. Decision F enforces this mechanically: the persona's input type omits prices and potency, so a magnitude computation **does not compile.** If you find yourself reaching for `basePrice`/`specialPrice`, stop — you've left the honest boundary.

### Anti-patterns to avoid (LLM-dev-agent disaster prevention)

- **Do not** compute or report any discount magnitude / `avgDiscountPct` / `discountDepth` / average `specialPrice`. Gate 2 / fix6 / decision F forbid it; the input type won't even expose the fields. The persona axis is special-**frequency**, not depth.
- **Do not** pass `ProductsFile`/`ProductRecord` into `buildBrandPersonas`. Project to the narrowed `BrandProductSeries[]` at the runner boundary. The pure function must be structurally unable to see prices/potency (decision F) — that's what the `@ts-expect-error` test guards.
- **Do not** inline brand normalization inside `brandPersonas.ts`. It lives in the shared `brandKey.ts` (decision B) so 1.6 reuses it byte-for-byte. Owned once.
- **Do not** bucket null/empty-brand products under a `""` or `'unknown'` brand — exclude and count them (`nullBrandProductCount`, FR7). 826 live products (16%) have no brand.
- **Do not** reimplement day-bucketing or gap logic — use `walkPresenceAwareSeries` (the 1.2 primitive). A missing interior day is a `gap` and counts as neither special nor non-special (Gate 3).
- **Do not** re-read `products.db` or call any `build*` function a second time in the runner — reuse the already-read `productsFile`.
- **Do not** insert the new `atomicWriteJson` before any existing write in `deriveFactsRun.ts` — append after the `disparity-rollups.json` write (write-ordering discipline from 1.2.5's review: a fallible step ahead of existing writes can drop them on a throw).
- **Do not** add a route, an `EMPTY_*_ENVELOPE` constant, or touch `valueRoute.ts`/`server/index.ts` (Grounding §6 — internal-only, like extraction-health/special-events).
- **Do not** modify `presenceAwareSeries.ts`, `crossStoreValue.ts`, `dealScope.ts`, `extractionHealth.ts`, `specialEvents.ts`, `disparityRollups.ts`, `derivedEnvelope.ts`, `data.json`, any scraper registry, or any existing type. This story only reads `productsFile` and adds new modules.

### Testing standards

- TypeScript strict mode; tests for everything (project rule). Server suite is vitest.
- Baseline was **519 tests / 45 files** at the 1.4 story-creation baseline — confirm the current count when you run it rather than trusting this number.
- Use small hand-built fixtures for unit tests (not the live DB); the live-data proof is a separate sanity check whose counts drift daily.
- Run the real production build before anything that could auto-deploy: `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest ([[feedback_run-production-build-before-deploy]]).

### Previous story intelligence (derivation-1.4, 1.3, 1.2.5, 1.2, 1.1)

- **`walkPresenceAwareSeries`** (`server/utils/presenceAwareSeries.ts`, the 1.2 primitive) — generic over item/value; `getValue: dayItems => dayItems.at(-1)!.special` is exactly how `specialEvents.ts` reads the per-day special boolean. Reuse unchanged. `DayEntry<V>` union has `status: 'gap' | 'first' | 'unchanged' | 'changed'`; observed = `status !== 'gap'`.
- **`specialEvents.ts`** is the closest sibling (temporal fact over the same `special` boolean via the 1.2 helper). Mirror its `try/catch → gapCount++` guard for the all-future-dated-history throw case, and its module-header style (why not what).
- **`extractionHealth.ts`** established: exported threshold constants with a live-data-justified comment; a third status (`insufficient-history`) for stores lacking a real baseline. This story reuses both patterns (threshold constants + an `insufficient-history` persona for brands below the min-observation floor).
- **`wrapEnvelope`** (`server/utils/derivedEnvelope.ts`) — `wrapEnvelope(data, excluded[], coverage)`; `generatedAt` is set inside. Reuse unchanged, same as every prior fact.
- **`atomicWriteJson`** (`server/utils/atomicWrite.ts`) — the write helper every artifact uses.
- **1.2.5 pattern:** pass a pre-projected/narrowed value into the pure fact function rather than the raw registry/file — this story's `BrandProductSeries[]` projection at the runner boundary is the decision-F-mandated version of that pattern.
- **`deriveFactsRun.ts` current write order:** disparities → deal-scope → extraction-health → special-events → disparity-rollups. Append brand-personas **after** disparity-rollups.
- **Git pattern:** recent derivation stories (`7c37603`, `297dc32`) are single squash-merged PRs (`feat(derivation): …`, `#NN`) with a `Co-authored-by: Claude Sonnet 5` trailer — one additive module (here two: `brandKey.ts` + `brandPersonas.ts`) + tests + runner wiring per commit. Self-merge of Erik-directed derivation PRs is pre-authorized ([[feedback_always-push-deploy-fixes]]).

### Project Structure Notes

- **New files:** `server/utils/brandKey.ts`, `server/utils/brandKey.test.ts`, `server/utils/brandPersonas.ts`, `server/utils/brandPersonas.test.ts`, `server/data/derived/brand-personas.json` (produced by the live-proof run).
- **Modified:** `server/scripts/deriveFactsRun.ts` (projection + call + write, `DeriveOutcome` extended, `main()` log line), `server/scripts/deriveFactsRun.test.ts` (brand-personas assertions in the main regression test). The five existing `server/data/derived/*.json` may routinely refresh if the full `deriveFacts()` CLI is run — unrelated content churn, fine.
- **No changes to:** `valueRoute.ts`, `valueRoute.test.ts`, `server/index.ts` (no route — Grounding §6), `presenceAwareSeries.ts`, `crossStoreValue.ts`, `dealScope.ts`, `extractionHealth.ts`, `specialEvents.ts`, `disparityRollups.ts`, `derivedEnvelope.ts`, `productsDb.ts`, any scraper registry, `data.json`, any client file, any existing type in `server/types/index.ts`.
- **ADR:** no new ADR entry — stays inside ADR-077's existing scope, consistent with 1.2/1.2.5/1.3/1.4.

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story 1.5] — written AC text; the "typical discount depth" wording is reframed to special-**frequency** in Grounding §3 per Gate 2 / fix6 / decision F (magnitude is Epic 2 / D6 / FR13).
- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Epic 1 design decisions] — decision B (shared brand normalizer owned once) and decision F (one type-gate covers Gate 2 + Gate 5; the breach does not compile).
- [Source: server/utils/presenceAwareSeries.ts] — the 1.2 gap-tolerant helper this fact walks per product (reused unchanged).
- [Source: server/utils/specialEvents.ts] — closest sibling; `getValue` for the `special` boolean, the `try/catch → gap` guard, header style.
- [Source: server/utils/extractionHealth.ts] — exported-threshold-constants pattern + the `insufficient-history` third-status precedent.
- [Source: server/utils/derivedEnvelope.ts] — `wrapEnvelope`/`isEnvelope`, reused unchanged.
- [Source: server/utils/crossStoreValue.ts] — fix6 honesty gate 3 ("Price is the real price paid … never a discount %, which fix6 proved carries no per-item signal") — the same principle that forbids a magnitude persona here.
- [Source: server/utils/productMatchKey.ts] — existing `norm()` (lowercase + `[^a-z0-9 ]`→space + collapse) is the normalization shape `normalizeBrandKey` should follow; note it is internal to the match-key module and NOT a shared brand key — hence the new shared `brandKey.ts` (decision B).
- [Source: server/utils/productsDb.ts] — DB schema (`observation.special INTEGER NOT NULL`) and the reader that reconstructs `ProductObservation.special`; the runner's input source.
- [Source: server/scripts/deriveFactsRun.ts] — current runner + write-ordering discipline (append after disparity-rollups); the projection boundary lives here.
- [Source: server/scripts/deriveFactsRun.test.ts] — `rec()`/`populatedFile()` fixtures (brand `Acme`, `special: false`) to extend.
- [Source: server/types/index.ts#ProductRecord, #ProductObservation] — the full record (with prices + potency) that the runner projects DOWN to `BrandProductSeries` at the boundary.
- [Source: _bmad-output/implementation-artifacts/derivation-1-4-cross-store-disparity-rollups.md] — the immediate-predecessor pattern (grounding discipline, envelope wiring, write-ordering, live-proof); note its opposite route decision (1.4 added one because FR11 demanded it; 1.5 does not).
- [Source: ADR.md#ADR-077] — the substrate/derivation-engine decision this fact stays inside.
- [Reference: investigations/fix6-basePrice-verdict.md] — why the banner discount % carries no signal (the honesty basis for the frequency reframe).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8), via bmad-dev-story.

### Debug Log References

- `npx vitest run utils/brandKey.test.ts` — 5/5 passing.
- `npx vitest run utils/brandPersonas.test.ts` — 10/10 passing (incl. the decision-F `@ts-expect-error` compile-level guard — it passes only because `specialPrice`/`basePrice`/`thc`/`totalTerpenes` genuinely do not compile on the persona input types).
- `npx vitest run scripts/deriveFactsRun.test.ts` — 6/6 passing (extended main regression test).
- `npx vitest run --exclude '**/dist/**'` — full server suite: 46 files / 534 tests passing (+15 from the 519 baseline; 0 regressions).
- `npm run build` — clean (client `tsc -b && vite build`; server `tsc && node scripts/copyData.mjs`).
- **Live-data proof**, `npx tsx server/scripts/deriveFactsRun.ts` against `server/data/products.db`:
  ```
  [derive] brand-personas: 118 always / 39 never / 134 intermittent / 214 insufficient (826 null-brand excluded)
  ```
  `brand-personas.json` envelope verified: top-level keys `['data','excluded','coverage','generatedAt']`; `excluded: [{nullBrand:826},{insufficientHistory:214}]`; `coverage: {totalBrands:505, alwaysOnSpecialCount:118, neverDiscountedCount:39, intermittentCount:134, insufficientHistoryCount:214}`. Spot-checks: `green haven` → always-on-special (61 products, 362 observed product-days, fraction 1.0), `zodiac` → never-discounted (12/146/0.0), `full spec` → intermittently-discounted (86/652/0.627). No empty `brandKey`; personas sorted ascending. These match Grounding §5 exactly — the story-creation grounding query and the shipped code agree.

### Completion Notes List

- Implemented the shared `normalizeBrandKey` (`server/utils/brandKey.ts`, decision B) — lowercase + collapse non-alphanumeric runs + trim; null/empty/punctuation-only → null. Owned once here; Story 1.6 consumes it unchanged. Live effect: 516 raw brand strings → 505 normalized (the 10 casing/punctuation/whitespace collisions merged), 826 null-brand products excluded + counted.
- Implemented `buildBrandPersonas` (`server/utils/brandPersonas.ts`, D2/FR9) on the **honest frequency axis** (`specialDayFraction`, share of observed product-days on special) — NOT a discount magnitude. Decision F enforces this mechanically: the narrowed `BrandDaySignal`/`BrandProductSeries` input types have no price or potency field, so a magnitude computation does not compile (proven by the `@ts-expect-error` test). Honest magnitude (price vs own rolling median) stays deferred to Epic 2 / D6 / FR13.
- Gap-tolerant by construction (Gate 3): each product's `special` series is walked through the 1.2 helper (`walkPresenceAwareSeries`); a missing interior day is a `gap` counted as neither special nor non-special. Reused the `try/catch → fully-gapped` guard from `specialEvents.ts` defensively.
- Classification: `insufficient-history` below `MIN_OBSERVED_PRODUCT_DAYS` (10); `always-on-special` ≥ 0.95; `never-discounted` ≤ 0.05; `intermittently-discounted` between. Thresholds are exported constants justified against the live distribution.
- Wired into `deriveFactsRun.ts`: the full `ProductRecord` is projected DOWN to `BrandProductSeries[]` at the call boundary (the ONLY place prices/potency are dropped), then `buildBrandPersonas` → `wrapEnvelope` → `atomicWriteJson('brand-personas.json')`, appended AFTER the disparity-rollups write (write-ordering discipline from 1.2.5's review). Reuses the already-read `productsFile` (no second DB read).
- **No route added** — internal-only derived artifact, mirroring extraction-health/special-events (FR9 does not call for a served consumer surface, unlike FR11/1.4). `valueRoute.ts`/`server/index.ts` untouched.
- No new ADR entry — stays inside ADR-077's scope, consistent with 1.2/1.2.5/1.3/1.4.
- The 5 pre-existing `server/data/derived/*.json` files show a routine content refresh from the live derivation run (unrelated to this story's logic) — same expected churn 1.4 noted; the disparities count read live as 228 (vs the 246 committed at story-creation), consistent with the ongoing ~2-day Dutchie-scraper gap 1.2.5/1.3/1.4 already flagged, not anything this story changed.
- Two non-blocking questions remain for Erik (depth→frequency reframe; threshold values) — see the "Questions for Erik" section.
- `sprint-status.yaml`: `ready-for-dev` → `in-progress` at start, → `review` at completion.

### File List

- `server/utils/brandKey.ts` (new)
- `server/utils/brandKey.test.ts` (new)
- `server/utils/brandPersonas.ts` (new)
- `server/utils/brandPersonas.test.ts` (new)
- `server/scripts/deriveFactsRun.ts` (modified — projection + `buildBrandPersonas` call + `brand-personas.json` write appended after disparity-rollups, `DeriveOutcome` extended, `main()` log line)
- `server/scripts/deriveFactsRun.test.ts` (modified — brand-personas envelope-shape + count assertions in the main regression test)
- `server/data/derived/brand-personas.json` (new — real data, envelope-shaped)
- `server/data/derived/disparities.json` (regenerated — routine refresh from the live derivation run)
- `server/data/derived/deal-scope.json` (regenerated — routine refresh)
- `server/data/derived/extraction-health.json` (regenerated — routine refresh)
- `server/data/derived/special-events.json` (regenerated — routine refresh)
- `server/data/derived/disparity-rollups.json` (regenerated — routine refresh)

Untouched (verified, not modified): `server/routes/valueRoute.ts`, `server/index.ts` (no route), `server/utils/presenceAwareSeries.ts`, `crossStoreValue.ts`, `dealScope.ts`, `extractionHealth.ts`, `specialEvents.ts`, `disparityRollups.ts`, `derivedEnvelope.ts`, `productsDb.ts`, any scraper registry, `data.json`, any client file, any existing type in `server/types/index.ts`.

## Questions for Erik (saved from story-creation analysis — non-blocking)

1. **"Depth" reframed to "frequency" (Grounding §3).** FR9 lists the third persona as "typical discount **depth**," but discount magnitude is (a) meaningless per fix6 and (b) explicitly Epic 2 / D6 / FR13, and decision F makes it non-compilable here. This story ships the third persona as `intermittently-discounted`, quantified by `specialDayFraction` (how *often* the brand is on special), not by how much. This is the only reading consistent with the epic's own gates — flagging it so the wording change is a conscious call, not a silent deviation. Honest magnitude personas can be revisited in Epic 2 once price-vs-own-rolling-median (D6) exists.
2. **Thresholds (0.95 / 0.05 / min-10-observed-product-days)** are chosen from the live distribution (Grounding §5) to produce sensible splits (118 / 39 / 134 / 214). They're exported constants, easy to tune. Comfortable with these, or want a different always/never cutoff?

## Change Log

- 2026-07-09: Story created via bmad-create-story. Grounding against live `products.db` confirmed the ~12-day window (13 days, 5,219 products), quantified the brand-normalization need (516 raw → 505 normalized; 10 real casing/punctuation/whitespace collisions; 826 null-brand products), and — the central decision — resolved the epics' "typical discount depth" wording into an honest special-**frequency** persona (`specialDayFraction`), because discount magnitude is fix6-meaningless and Epic-2-gated (D6/FR13), with decision F's narrowed input type making the magnitude breach non-compilable. Scoped OUT a served route (internal-only, mirroring extraction-health/special-events; FR9 doesn't call for one). Live persona distribution computed as a worked example (118 always / 39 never / 134 intermittent / 214 insufficient-history). Status → ready-for-dev.
- 2026-07-09: Story implemented via bmad-dev-story (Opus 4.8). Added shared `brandKey.ts` (`normalizeBrandKey`, decision B) + `brandPersonas.ts` (`buildBrandPersonas`, honest special-**frequency** persona on narrowed decision-F input types, gap-tolerant via the 1.2 helper) with colocated tests, and wired brand-personas into `deriveFactsRun.ts` (projected at the boundary, `brand-personas.json` written after the disparity-rollups write, no route). 534/534 server tests green (+15), production build clean. Live-data proof reproduced the grounding numbers exactly (118 always / 39 never / 134 intermittent / 214 insufficient / 826 null-brand excluded; green haven=always, zodiac=never, full spec=intermittent). Status → review.
