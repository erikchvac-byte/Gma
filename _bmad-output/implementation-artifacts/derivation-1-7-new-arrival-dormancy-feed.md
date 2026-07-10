---
baseline_commit: 2cfe08126de3fb52c4efdb2699f8d21e393ee5ae
---

# Story derivation-1.7: New-arrival & dormancy feed (D3)

Status: review

## Story

As a **data consumer**,
I want a per-run feed of genuinely-new SKUs and newly-dormant SKUs,
so that catalog turnover is surfaced honestly — **without ever mistaking a missed scrape (or a store-wide extraction hole) for a delisting** (FR10, D3, Gate 4).

Placed **last of the Tier-1 facts because it is the most dangerous**: a naive absence→delisting read produces catastrophic false positives. It is safe only because extraction-health (1.2.5) now exists to gate it. This story is **the first real consumer of `buildExtractionHealthReport`** (1.2.5 deferred that consumer decision to here).

## Grounding (read before starting — live `products.db`, story-creation 2026-07-10)

Queried the real home-machine store `C:/Users/erikc/GmaS-data/products.db` directly (same discipline as 1.2.5/1.3/1.4/1.5/1.6). **The single most important thing in this story is the store-health gate in §3 and the ≥2-run dormancy floor in §4 — read them before writing any code.** The naive version of this fact is a liability.

1. **Corpus: 5,401 products, 39,811 observations, 17 distinct days (2026-06-24 .. 2026-07-10).** Two roster stores (`caravan-cannabis-burlington`, `the-vault-silvana`) have zero rows and don't appear in the DB, exactly as 1.2.5 found. Do **not** hardcode any of these counts in unit tests — the DB accrues daily; use small hand-built fixtures and treat live numbers as sanity targets only. Note this is a **different DB file** from the committed `server/data/products.db` (which is stale at 2026-07-06, 13 days). The live derivation runs against `~/GmaS-data/products.db` (env `PRODUCTS_DB_PATH`), so ground and live-prove against that one.

2. **THERE IS A REAL, ONGOING EXTRACTION OUTAGE IN THE LIVE DATA — and it is the perfect proof of why this fact must be gated.** Per-day distinct-product counts collapse from ~3,500/day (2026-07-05..07) to **~780/day on 07-08, 07-09, 07-10** — the Dutchie local scraper has not run for ~2 days (same outage 1.2.5's live run flagged). Concretely, if you ran a **naive** dormancy feed with `today = 2026-07-10`:
   - **2,765 products** have their last-ever observation on 2026-07-07 → a naive feed screams "2,765 SKUs delisted!" They are not delisted; their stores just weren't scraped.
   - **4,450 products** are "absent today but had trailing history"; 2,147 of them had ≥5 trailing observed days. Almost all are the outage, not turnover.
   - Per-store: **12 Dutchie stores have `seenToday = 0`** on 07-10 (cannazone-bellingham, cannazone-old-hwy-99, evolve-cannabis-bellingham, hangar-420-everett/west, happy-time-mt-vernon, jet-cannabis-everett, kush21-everett-evergreen, kushmart-north, local-roots-everett-128th, salish-coast-cannabis, starbuds-bellingham, sweet-relief-mt-vernon, the-joint-everett) — their **entire catalogs** would false-fire as dormant. The `2020-solutions` pair shows partial (93–96 of ~630, kept alive only by their Weedmaps overlap feed).
   - **This is the disaster the store-health gate (§3) exists to prevent.** Under the gate, extraction-health flags every one of those stores `suspected-extraction-failure`, and 1.7 emits **zero** dormant SKUs for them. Only genuinely-`ok` stores contribute dormancy candidates.

3. **STORE-HEALTH GATE (AC2, consumes 1.2.5) — load-bearing.** Dormancy is computed **only** for stores whose extraction-health status is `ok`. A store that is `suspected-extraction-failure` or `insufficient-history` contributes **no** dormant SKUs — its absent SKUs are excluded and **counted** (`suppressedUnhealthyStoreCount`, FR7), never emitted. 1.7 does not re-derive health; it consumes the `ExtractionHealthReport` already computed earlier in the same `deriveFacts()` run (in-process — 1.2.5 said the first consumer picks in-process-call vs re-read-JSON; **pick in-process**, it's cheaper and already there). Bonus: this same gate makes the fact **self-protecting against the "derivation ran before today's scrape completed" race** (1.2.5's deferred wall-clock finding) — an un-scraped-yet store is not `ok`, so its SKUs are suppressed, not false-fired.

4. **DORMANCY FLOOR — never from one absent run (AC1, Gate 4), grounded at ≥2 store-scrapes.** A single absent run is overwhelmingly **churn, not dormancy** — measured on the healthy window (2026-06-24..07-07), of 2,599 present→absent gap-starts: **29.4% reappear after just 1 absent day**, +6.7% after 2, +1.8% after 3, +5.1% after 4, 57% never (in-window). So a 1-run absence carries a ~29% "it'll be back tomorrow" rate — asserting dormancy on it is dishonest. **A SKU is emitted dormant only if it is absent from the store's `DORMANCY_MIN_ABSENT_RUNS` (= 2) most-recent scrape days** (the store's own observed/active days, ending at today for an `ok` store), which clears the dominant 29% one-day-churn bucket. Count absent **store-scrape-runs, not calendar days** — this is robust to store holes on intervening days (a day the store produced no data is not a "run" and doesn't count as a confirmed absence). A SKU absent for exactly 1 run is **below threshold, counted** (`belowThresholdCount`), never emitted. Even an emitted dormant SKU carries `missedScrapeAmbiguity: true` — the fact reports *suspected* dormancy, never asserts *removal* (Gate 4). `DORMANCY_MIN_ABSENT_RUNS` is a named, documented constant (tunable — flagged to Erik, §Questions).

5. **NEW-ARRIVAL — the safe direction, but guard store-onboarding.** A new arrival = a SKU whose **first-ever** observation is `today` (the 1.2 helper's `'first'` status at the `today` entry, walking full history with no `startDate` — mirrors `specialEvents.ts`). Presence today is unambiguous, so no health gate is needed. The ONE noise source is **store onboarding**: on a store's first day in our dataset, *every* SKU is `'first'`. Live proof: store-onboarding waves (16 Dutchie stores first seen 06-24, 8 Weedmaps stores first seen 06-30) and coverage-expansion spikes (664 first-appears on 06-30, **1,296 on 07-05**) are not "new products," they're "we started/expanded watching." **Suppress new-arrivals for a store whose own earliest observed day is `today`** (store-onboarding guard), excluded and counted (`onboardingStoreArrivalCount`). Genuine per-SKU new arrivals at established stores still emit (healthy 07-07: 136; holed 07-10: only 9). Bulk coverage-expansion days (07-05's 1,296) are *not* store-onboarding and will honestly emit as first-appearances — that's acceptable and inspectable (the count itself signals a bulk event); do not try to filter them, we cannot honestly distinguish "new to the store" from "scraper started capturing it."

6. **This is a per-SKU, gap-tolerant time-series fact — use the 1.2 helper, like `specialEvents.ts`.** Walk each product's `history` with `walkPresenceAwareSeries(rec.history, { getObservedAt, getValue, endDate: today })`. Reuse the **exact try/catch** `specialEvents.ts` uses (a product whose entire history postdates `today` throws in the helper — treat as gap, don't abort the run). For dormancy's "absent from last K store-runs" you additionally need the **store's active-day set** (distinct observation days per store), computed once at the top from `productsFile` — 1.7 computes this itself (small, self-contained; do not import extraction-health's internal `groupByDispensary`).

7. **PRESENCE FACT ONLY — no price, no discount, no potency (Gates 1/2/5 by omission).** Like `specialEvents.ts`, emit identity + event only: `dispensaryId`, `productId`, `name`, `category`, and the date/absence fields. **No** price/`specialPrice`/discount/`thc`/weight field anywhere. There is no decision-F type-gate to build here (1.7 never touches a price — it reads presence), but the *output* must carry no price/potency field. State this in the module header.

8. **No route (mirrors 1.5/1.6/1.2.5/1.3).** FR10's story text is "a per-run feed," not FR11's "served consumer surface." So write `server/data/derived/new-arrival-dormancy.json` (envelope-wrapped, wired into the runner), add **no** route to `valueRoute.ts`/`server/index.ts`. Flagged to Erik (a served surface, if ever wanted, is a separate story exactly as 1.4 was for FR11).

## Acceptance Criteria

1. **Dormancy never asserted from one absent run — ≥2-run floor + ambiguity flag (Gate 4, FR10; Grounding §4).** A SKU is emitted in `dormant[]` **only** if it is absent from the store's `DORMANCY_MIN_ABSENT_RUNS` (= 2) most-recent scrape days (store active-days, ending at `today`) and has ≥1 prior observation before them. A SKU absent for exactly one run is **not** emitted — it is counted in `belowThresholdCount` (FR7). Every emitted `DormantSku` carries `missedScrapeAmbiguity: true` (the fact reports *suspected* dormancy, never asserts *removal*). `DORMANCY_MIN_ABSENT_RUNS` is an exported named constant with a rationale comment citing the live reappearance split (29.4% reappear after 1 absent day).

2. **Store-health gate — suspected/insufficient stores emit no dormancy (AC2, consumes 1.2.5; Grounding §2/§3).** Dormancy is computed only for stores whose extraction-health status is `ok`. A SKU whose store is `suspected-extraction-failure` or `insufficient-history` is **never** emitted dormant; every such absent SKU is counted in `suppressedUnhealthyStoreCount` (FR7). The store statuses come from the `ExtractionHealthReport` already computed in the same run — passed **into** the pure function (1.7 does not import the scraper registry or re-derive health). Live effect on `today = 2026-07-10`: the 12 zero-today Dutchie stores + the collapsed 2020-solutions pair emit **zero** dormant SKUs.

3. **New arrivals — first-ever observation today, store-onboarding suppressed (AC3, Gate 3; Grounding §5).** A SKU is emitted in `newArrivals[]` iff its `today` entry status is `'first'` (via `walkPresenceAwareSeries`, full-history walk to `today`) **and** its store was observed on at least one day before `today` (store-onboarding guard). A first-today SKU at a store whose earliest observed day is `today` is suppressed and counted in `onboardingStoreArrivalCount` (FR7). A store-wide extraction gap shows up as `'gap'` for every affected product, never a fabricated new arrival (Gate 3, inherited from the 1.2 helper).

4. **Presence fact only — no price/discount/potency in the output (Grounding §7).** `NewArrival` and `DormantSku` carry `dispensaryId`, `productId`, `name`, `category`, and date/absence fields only. There is **no** `price`/`basePrice`/`specialPrice`/`discountPct`/`thc`/`weightGrams`/any-value field anywhere in the report. The module header states plainly: this is a catalog-presence fact; value/discount is out of scope (Gates 1/2/5 satisfied by omission).

5. **Report shape + honesty envelope (FR7, NFR6).** New module `server/utils/newArrivalDormancy.ts` exports:
   ```ts
   export const DORMANCY_MIN_ABSENT_RUNS = 2

   export interface NewArrival {
     dispensaryId: string
     productId: string
     name: string
     category: string
     firstSeen: string          // === today
   }
   export interface DormantSku {
     dispensaryId: string
     productId: string
     name: string
     category: string
     lastSeen: string           // date of its last real observation
     absentRuns: number         // # of the store's most-recent scrape days it is missing from (>= DORMANCY_MIN_ABSENT_RUNS)
     missedScrapeAmbiguity: true // ALWAYS true — never a certain-delisting claim (Gate 4, AC1)
   }
   export interface NewArrivalDormancyReport {
     newArrivals: NewArrival[]           // sorted by dispensaryId, then productId
     dormant: DormantSku[]               // sorted by dispensaryId, then productId
     totalProducts: number               // Object.keys(productsFile.products).length
     newArrivalCount: number
     dormantCount: number
     suppressedUnhealthyStoreCount: number  // SKUs absent-today at a non-ok store, NOT emitted (AC2, FR7)
     belowThresholdCount: number            // SKUs absent < DORMANCY_MIN_ABSENT_RUNS at an ok store (churn), NOT emitted (AC1, FR7)
     onboardingStoreArrivalCount: number    // first-today SKUs suppressed as store-onboarding (AC3, FR7)
   }
   export function buildNewArrivalDormancyReport(
     productsFile: ProductsFile,
     storeStatus: Map<string, StoreHealthStatus>,   // from ExtractionHealthReport.entries; import the type from extractionHealth.ts
     today: string,
   ): NewArrivalDormancyReport
   ```
   Deterministic sorts (`dispensaryId` then `productId`). Pure function — no I/O, no DB, no Express/route/registry import. Consumes `walkPresenceAwareSeries` (1.2) and the `StoreHealthStatus` **type** from `extractionHealth.ts` (type-only import; do not call `buildExtractionHealthReport` from inside — the caller passes the computed statuses in).

6. **Wired into the runner (FR1, write-ordering discipline).** In `deriveFactsRun.ts`, **after** the existing `brand-store-matrix.json` write (the current last write — **append after it, never insert earlier**, preserving the ordering discipline from 1.2.5's review), build `storeStatus` from the already-computed `extractionHealth.entries` (`new Map(extractionHealth.entries.map(e => [e.dispensaryId, e.status]))`), reuse the already-read `productsFile` and the same `today`, call `buildNewArrivalDormancyReport`, `wrapEnvelope`, and write `new-arrival-dormancy.json` via the same `atomicWriteJson` pattern. Do **not** re-read the DB and do **not** recompute extraction-health. `excluded[]` = `[{ reason: 'suppressedUnhealthyStore', count }, { reason: 'belowThreshold', count }, { reason: 'onboardingStore', count }]`; `coverage` = `{ totalProducts, newArrivalCount, dormantCount }`. Extend `DeriveOutcome` (`newArrivalDormancyPath`, `newArrivalCount`, `dormantCount`) + add a matching `main()` `console.log` line.

7. **No route (Grounding §8).** Internal-only derived artifact, mirroring brand-store-matrix / brand-personas / extraction-health / special-events. Do **NOT** add a route to `valueRoute.ts` / `server/index.ts`, and do not add an `EMPTY_*_ENVELOPE` constant.

8. **Regression-safe (FR3, NFR5).** `data.json`, the deals pipeline, `buildMatchReport`, `buildDealScopeLinks`, `buildExtractionHealthReport`, `buildSpecialEventsReport`, `buildDisparityRollups`, `buildBrandPersonas`, `buildBrandStoreMatrix`, every existing derived artifact's shape/content, and every existing type are unchanged — this story only *reads* `productsFile` + the in-memory `extractionHealth` report and adds one new `server/utils/newArrivalDormancy.ts` (+ test) plus runner wiring. `presenceAwareSeries.ts`, `extractionHealth.ts`, `derivedEnvelope.ts`, `atomicWrite.ts` are reused **unchanged** (the `StoreHealthStatus` import is type-only). Full server test suite stays green; `npm run build` (client + server) stays clean.

## Tasks / Subtasks

- [x] **Pure fact** `server/utils/newArrivalDormancy.ts` (AC: 1, 2, 3, 4, 5)
  - [x] Module header: catalog-presence fact; new-arrival = first-ever obs today (onboarding-guarded); dormancy = absent from ≥2 most-recent store-runs at an `ok` store, always ambiguity-flagged (never a delisting claim); no price/discount/potency (Gates 1/2/5 by omission); consumes 1.2 helper + 1.2.5 store statuses.
  - [x] Export `DORMANCY_MIN_ABSENT_RUNS = 2` with rationale comment (live reappearance split: 29.4% reappear after 1 absent day, so 1-run absence is churn; ≥2 clears it).
  - [x] Export types `NewArrival`, `DormantSku` (`missedScrapeAmbiguity: true` literal), `NewArrivalDormancyReport`; type-only import `StoreHealthStatus` from `./extractionHealth.js`.
  - [x] Compute per-store active-day set once (`Map<dispensaryId, string[]>` sorted distinct calendar days) from `productsFile` — for the store-onboarding guard (earliest active day) and the dormancy "last K store-runs" logic.
  - [x] Per product: walk `history` via `walkPresenceAwareSeries(..., { endDate: today })` inside the **same try/catch** `specialEvents.ts` uses (postdates-today throws → treat as gap, count nothing, continue).
    - New arrival: `today` entry status `'first'` AND store has an active day `< today` → `newArrivals`; if store's earliest active day `=== today` → `onboardingStoreArrivalCount`.
    - Dormancy: `today` entry missing/`'gap'` (SKU not observed today) AND SKU has ≥1 prior observation → candidate. Store not `ok` → `suppressedUnhealthyStoreCount`. Store `ok` → count `absentRuns` = how many of the store's most-recent scrape days (ending at today) this SKU is missing from; `>= DORMANCY_MIN_ABSENT_RUNS` → `dormant` (with `lastSeen`, `absentRuns`, `missedScrapeAmbiguity: true`), else `belowThresholdCount`.
  - [x] Deterministic sorts (`dispensaryId` then `productId`); aggregate all counts.
- [x] **Unit tests** `server/utils/newArrivalDormancy.test.ts` (AC: 1, 2, 3, 4, 5) — small hand-built `ProductsFile` fixtures (mirror `rec()`/`populatedFile()` style):
  - [x] Dormancy: SKU absent from the store's 2 most-recent runs at an `ok` store → emitted with `absentRuns >= 2`, `missedScrapeAmbiguity === true`, correct `lastSeen`.
  - [x] Single-run-absence: SKU present on the store's most-recent-but-one run, absent only from today's run → NOT emitted, counted in `belowThresholdCount` (Gate 4 — the core honesty test).
  - [x] Store-health gate: identical absent SKU at a `suspected-extraction-failure` store AND at an `insufficient-history` store → both suppressed, counted in `suppressedUnhealthyStoreCount`, absent from `dormant[]` (AC2 — the disaster-prevention test).
  - [x] Store-hole robustness: a SKU absent from today's run at an `ok` store, where an intervening calendar day had NO store data (not a run) → `absentRuns` counts store-runs not calendar days (doesn't over-count the hole).
  - [x] New arrival: SKU first-observed on `today` at a store with prior history → emitted `firstSeen === today`; the same at a store whose earliest day IS today → suppressed, counted in `onboardingStoreArrivalCount` (AC3).
  - [x] Gap-not-arrival: a store-wide gap day never fabricates a new arrival (Gate 3).
  - [x] Presence-only: assert no price/potency key exists on emitted entries (shape guard).
  - [x] Accounting: empty input → fully-zeroed report; postdates-today product → treated as gap, no throw. (+ a determinism/sort test.)
- [x] **Wire into the runner** (AC: 6, 8)
  - [x] `deriveFactsRun.ts`: after the `brand-store-matrix.json` write, build `storeStatus` from `extractionHealth.entries`, call `buildNewArrivalDormancyReport(productsFile, storeStatus, today)`, `wrapEnvelope`, `atomicWriteJson('new-arrival-dormancy.json')`. `DeriveOutcome` extended (`newArrivalDormancyPath`, `newArrivalCount`, `dormantCount`) + `main()` log line.
  - [x] `server/scripts/deriveFactsRun.test.ts`: extend the main regression test with a `new-arrival-dormancy.json` envelope-shape assertion (against `populatedFile()`, whose `store-a`/`store-b` are non-roster → `insufficient-history` → any absence suppressed; 2026-07-01 obs are pre-`today` gaps → assert `dormantCount === 0` and `suppressedUnhealthyStoreCount === 2`, proving the gate reaches the pure function through the real wiring).
- [x] **Live-data proof** — ran `PRODUCTS_DB_PATH=C:/Users/erikc/GmaS-data/products.db npx tsx server/scripts/deriveFactsRun.ts`, wall-clock `today = 2026-07-10`. **Gate held: 0 dormant SKUs at any of the 12 zero-today Dutchie stores / the 2020-solutions pair; `suppressedUnhealthyStoreCount = 4,473`** (the outage SKUs suppressed, not emitted). 9 new arrivals (07-10 holed). Envelope top keys / `excluded[]` / `coverage` verified; every dormant entry at an `ok` store with `absentRuns >= 2` + `missedScrapeAmbiguity: true`; no price/potency key. See Debug Log.
- [x] **Full regression + build** (AC: 8) — `npx vitest run --exclude '**/dist/**'` from `server/`: **557 passed / 48 files** (was 547/47 at 1.6; +10 new module tests). `npm run build` (client + server) clean.

## Dev Notes

### The two things that matter most (read Grounding §2–§4 first)

1. **The store-health gate is the whole reason this fact is safe to ship.** The live data has an active ~2-day Dutchie outage: a naive dormancy read on `today = 2026-07-10` would declare ~2,765 SKUs "delisted" that are simply un-scraped. AC2 makes that impossible — dormancy is computed **only** for `ok` stores; every SKU under a non-`ok` store is suppressed and counted. This also self-protects against the "derivation ran before today's scrape" race (1.2.5's deferred wall-clock finding): an un-scraped store isn't `ok`.
2. **Never assert dormancy from one absent run.** A single missed run has a ~29% "back tomorrow" rate (live-measured). Require absence from the store's **≥2 most-recent scrape runs** (not calendar days — robust to store holes), and *still* flag every emission `missedScrapeAmbiguity: true`. The fact reports *suspected* dormancy; it never claims removal.

### Anti-patterns to avoid (LLM-dev-agent disaster prevention)

- **Do not** emit dormancy for a SKU absent under a non-`ok` store — that is the exact 2,765-false-delisting disaster (AC2). Suppress and count.
- **Do not** assert dormancy from a single absent run, and **do not** count in calendar days. Count absent **store-scrape-runs** (the store's own observed days); require ≥ `DORMANCY_MIN_ABSENT_RUNS`; always set `missedScrapeAmbiguity: true` (Gate 4). A day with no store data is not a run and must not count as a confirmed absence.
- **Do not** re-derive extraction-health or import the scraper registries in `newArrivalDormancy.ts`. It is a pure function taking `storeStatus: Map<string, StoreHealthStatus>` (the type is a type-only import from `extractionHealth.ts`); the **runner** builds the map from the already-computed `extractionHealth.entries`. Mirrors how `extractionHealth.ts` takes `storeIds: string[]` computed by its caller.
- **Do not** re-read the DB or recompute anything in the runner — reuse the already-read `productsFile`, the already-computed `extractionHealth`, and the same `today`.
- **Do not** put any price/discount/potency/weight field in the output (Grounding §7). This is a presence fact. There is no decision-F type-gate to build (1.7 never reads a price), but the output must carry none.
- **Do not** try to filter bulk coverage-expansion first-appearances (e.g. 07-05's 1,296) beyond the store-onboarding guard — we cannot honestly distinguish "new to store" from "scraper started capturing it." Emit them honestly; the count signals the bulk event.
- **Do not** forget the `specialEvents.ts` try/catch: a product whose whole history postdates `today` throws in `walkPresenceAwareSeries` (its default `startDate` lands after `endDate`) — treat as gap, do not abort the run.
- **Do not** insert the new `atomicWriteJson` before any existing write in `deriveFactsRun.ts` — append after the `brand-store-matrix.json` write (write-ordering discipline from 1.2.5's review: a new fallible step ahead of existing writes can silently drop them on a throw).
- **Do not** add a route, an `EMPTY_*_ENVELOPE` constant, or touch `valueRoute.ts` / `server/index.ts` (Grounding §8).
- **Do not** modify `presenceAwareSeries.ts`, `extractionHealth.ts`, `specialEvents.ts`, `derivedEnvelope.ts`, `atomicWrite.ts`, `data.json`, any scraper registry, or any existing type. Do not import `extractionHealth.ts`'s internal `groupByDispensary` (not exported) — compute your own per-store active-day map.

### Design rationale: dormancy in store-runs, not calendar days

The live outage makes the calendar-vs-runs distinction concrete. On 07-10 a store may be `ok` (scraped today) yet had holes on 07-08/07-09. A SKU last seen 07-07 has `daysAbsent = 3` in calendar terms, but only **1** confirmed absent run (today's), because 07-08/09 produced no store data — not runs, just holes. Counting calendar days would falsely credit the store's holes as SKU absences and cross the ≥2 floor on a single real miss. Counting **store scrape-runs** (days the store produced ≥1 observation) is the honest measure: it asks "of the days we actually looked at this store's menu, how many recent ones lacked this SKU?" `absentRuns` in the output is that count. `lastSeen` is the SKU's true last observation date (for consumer display); `absentRuns` is the confidence signal.

### Testing standards

- TypeScript strict mode; tests for everything (project rule). Server suite is vitest.
- 1.6 shipped at **547 tests / 47 files**; confirm the current count when you run rather than trusting this number (the DB and suite drift daily).
- Use small hand-built fixtures for unit tests (not the live DB); the live-proof (gate behavior on the real outage) is a separate manual sanity check whose counts drift daily.
- Run the real production build before anything that could auto-deploy: `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest ([[feedback_run-production-build-before-deploy]]).

### Previous story intelligence (1.2.5, 1.3, 1.6)

- **`buildExtractionHealthReport` / `StoreHealthStatus` / `StoreHealthEntry`** (`server/utils/extractionHealth.ts`) — 1.2.5's fact, this story's dependency. `StoreHealthStatus = 'ok' | 'suspected-extraction-failure' | 'insufficient-history'`. Entries are `{ dispensaryId, status, todayCount, trailingMedian, observedDaysInWindow }`. 1.7 consumes the **statuses** (type-only import of `StoreHealthStatus`); the runner already has the computed `extractionHealth` object — build `Map(entries.map(e => [e.dispensaryId, e.status]))`. 1.2.5 explicitly deferred "the first consumer decides read-JSON vs call-function" to this story → **decision: in-process** (the object is right there in the same run).
- **`buildSpecialEventsReport`** (`server/utils/specialEvents.ts`) — the closest sibling: per-SKU, gap-tolerant, `today`-parameterized, presence/identity-only (no price), same envelope wiring, same `walkPresenceAwareSeries(rec.history, { getObservedAt, getValue, endDate: today })` shape, and the **postdates-today try/catch → gap** pattern to copy verbatim. 1.7 is structurally a sibling of it plus the store-health gate and the run-counting dormancy logic.
- **`walkPresenceAwareSeries`** (`server/utils/presenceAwareSeries.ts`, 1.2) — `DayEntry<V>` union (`gap`/`first`/`unchanged`/`changed`). `'first'` is per-window; walking full history (no `startDate`) makes `'first'` at `today` mean genuine first-ever. Its day-arithmetic helpers are NOT exported; if you need "subtract days" write your own small UTC helper (1.2.5 did — mirror `subtractDaysUTC`), though the run-counting approach may not need it.
- **`wrapEnvelope`** (`server/utils/derivedEnvelope.ts`) — `wrapEnvelope(data, excluded[], coverage)`; `generatedAt` set inside. Reuse unchanged.
- **`atomicWriteJson`** (`server/utils/atomicWrite.ts`) — the write helper every artifact uses.
- **`deriveFactsRun.ts` current write order:** disparities → deal-scope → extraction-health → special-events → disparity-rollups → brand-personas → **brand-store-matrix**. Append `new-arrival-dormancy` **after** brand-store-matrix. Note extraction-health is computed at line ~175 and is in scope for the whole function — reuse that object, don't recompute.
- **`DeriveOutcome` field-collision watch:** it already carries many count fields (incl. `suspectedCount`, `insufficientHistoryCount`, `nullBrandProductCount`, `unmatchedProductCount`). Use distinct new names (`newArrivalDormancyPath`, `newArrivalCount`, `dormantCount`) — do not reuse/overwrite existing fields.
- **Git pattern:** recent derivation stories (`c017777`, `d8c3035`, `7c37603`) are single squash-merged PRs (`feat(derivation): … (#NN)`) with a `Co-authored-by` trailer — one additive module + tests + runner wiring. Self-merge of Erik-directed derivation PRs is pre-authorized ([[feedback_always-push-deploy-fixes]]).

### Project Structure Notes

- **New files:** `server/utils/newArrivalDormancy.ts`, `server/utils/newArrivalDormancy.test.ts`, `server/data/derived/new-arrival-dormancy.json` (produced by the live-proof run).
- **Modified:** `server/scripts/deriveFactsRun.ts` (import, path, `storeStatus` map + `buildNewArrivalDormancyReport` call + envelope + write appended after brand-store-matrix, `DeriveOutcome` extended, `main()` log line), `server/scripts/deriveFactsRun.test.ts` (new-arrival-dormancy assertions in the main regression test). The seven existing `server/data/derived/*.json` may routinely refresh if the full `deriveFacts()` CLI is run — unrelated content churn, fine (same note 1.4/1.5/1.6 made).
- **No changes to:** `valueRoute.ts`, `server/index.ts` (no route — Grounding §8), `presenceAwareSeries.ts`, `extractionHealth.ts`, `specialEvents.ts`, `derivedEnvelope.ts`, `atomicWrite.ts`, `productsDb.ts`, any scraper registry, `data.json`, any client file, any existing type in `server/types/index.ts`.
- **ADR:** no new ADR entry — stays inside ADR-077's existing scope, consistent with 1.2/1.2.5/1.3/1.4/1.5/1.6.

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story 1.7] — the written AC (single-absent-run→ambiguity-flag/never-removal; suspected-extraction-failure store→not-dormant; genuinely-new→new-arrival via 1.2 helper; envelope + strict-typed tests for the missed-scrape/extraction-hole cases).
- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Epic 1 design decisions] — decision C (extraction-health is the derivation-time precondition for the dormancy feed); Gate 4 (missed-scrape ≠ delisting); FR10.
- [Source: server/utils/extractionHealth.ts] — 1.2.5's `buildExtractionHealthReport`, `StoreHealthStatus`, `StoreHealthEntry`; the dependency this story consumes (type-only import; statuses passed in by the runner).
- [Source: server/utils/specialEvents.ts] — the closest sibling: per-SKU gap-tolerant `today`-parameterized presence fact; the `walkPresenceAwareSeries` shape and the postdates-today try/catch to copy.
- [Source: server/utils/presenceAwareSeries.ts] — the Gate 3 primitive (`walkPresenceAwareSeries`, `DayEntry<V>`); `'first'` is per-window.
- [Source: server/utils/derivedEnvelope.ts] — `wrapEnvelope`, reused unchanged.
- [Source: server/scripts/deriveFactsRun.ts] — current runner + write order (append after brand-store-matrix); extraction-health already computed at line ~175 and reusable in-process.
- [Source: server/scripts/deriveFactsRun.test.ts] — `rec()`/`populatedFile()` fixtures (`store-a`/`store-b`, non-roster → insufficient-history) to extend.
- [Source: server/types/index.ts#ProductRecord, #ProductObservation, #ProductsFile] — the record/history shape walked (presence only; no price read).
- [Source: _bmad-output/implementation-artifacts/derivation-1-2-5-source-extraction-health-fact.md] — the dependency's design + its deferral of the first-consumer decision to this story; its live-outage finding this story turns into the gate proof.
- [Source: _bmad-output/implementation-artifacts/derivation-1-6-brand-store-matrix.md] — immediate predecessor: grounding discipline, envelope wiring, write-ordering, live-proof, no-route decision.
- [Source: ADR.md#ADR-077] — the substrate/derivation-engine decision this fact stays inside.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

Live-data proof — `PRODUCTS_DB_PATH=C:/Users/erikc/GmaS-data/products.db npx tsx server/scripts/deriveFactsRun.ts`, wall-clock `today = 2026-07-10` (outage still active):

```
[derive] new-arrival-dormancy: 9 new arrivals / 135 dormant → …/new-arrival-dormancy.json
```

Envelope verification (`new-arrival-dormancy.json` vs `extraction-health.json`):
- top keys `[data, excluded, coverage, generatedAt]`; `excluded = [{suppressedUnhealthyStore:4473},{belowThreshold:15},{onboardingStore:0}]`; `coverage = {totalProducts:5401,newArrivalCount:9,dormantCount:135}`.
- **Gate invariant HELD:** dormant entries at non-`ok` stores = **0**; dormant entries at the 12 listed zero-today Dutchie stores = **0**. The ~2,765+ outage SKUs that a naive read would false-fire as delisted are among the **4,473 suppressed** (not emitted).
- All 135 dormant are at exactly 6 genuinely-`ok` stores (`210-cannabis-arlington`, `a-greener-today-lynnwood`, `kaleafa-oak-harbor`, `northwind-anacortes`, `remedy-tulalip`, `western-bud-burlington` — the plain-HTML / Weedmaps-fed stores still scraping), every one with `absentRuns >= 2` (min 2) and `missedScrapeAmbiguity === true`.
- Presence-only shape confirmed: no `price/basePrice/specialPrice/discountPct/thc/weightGrams` key on any emitted entry. Sample dormant `{210-cannabis-arlington, african-mango, Pre-Rolls, lastSeen 2026-07-05, absentRuns 5, missedScrapeAmbiguity true}`; sample new arrival `{2020-solutions-north-bellingham, funky-oranges-doh, Flower, firstSeen 2026-07-10}`.

### Completion Notes List

- New pure fact `server/utils/newArrivalDormancy.ts` — structural sibling of `specialEvents.ts` (per-SKU, gap-tolerant via the 1.2 helper, same postdates-today try/catch → treat-as-gap guard), plus the two honesty guards: the store-health gate (dormancy only for `ok` stores; the caller passes in the already-computed `StoreHealthStatus` map — type-only import, no health re-derivation) and the ≥2-run dormancy floor counted in **store scrape-runs, not calendar days** (robust to store holes), with a permanent `missedScrapeAmbiguity: true` on every emission.
- `absentRuns` is computed by walking the store's most-recent scrape-runs (its own distinct observed days ending at `today`) backward until the run where the SKU was last present — so intervening no-data days never inflate the count (unit-tested: 2 runs across a 4-calendar-day span).
- New-arrival is store-onboarding-guarded: a first-today SKU emits only if its store was observed on some day before today; a store whose earliest day IS today is a whole onboarding wave, suppressed + counted.
- Wired into `deriveFactsRun.ts` **after** the `brand-store-matrix.json` write (write-ordering discipline from 1.2.5's review), reusing the already-read `productsFile`, the in-process `extractionHealth.entries`, and the same `today`. No DB re-read, no health recompute. `DeriveOutcome` extended with `newArrivalDormancyPath`/`newArrivalCount`/`dormantCount` + a `main()` log line.
- Internal-only artifact `new-arrival-dormancy.json` (envelope-wrapped). **No route** (Grounding §8 — FR10 is "a per-run feed", not FR11's served surface). No new `EMPTY_*_ENVELOPE`, no `valueRoute.ts`/`index.ts` change, no new ADR (stays in ADR-077 scope).
- Reused unchanged: `presenceAwareSeries.ts`, `extractionHealth.ts`, `derivedEnvelope.ts`, `atomicWrite.ts`. No existing type touched.
- The three story questions (dormancy floor 2 vs 3; no-route; the still-active Dutchie scraper outage) are surfaced to Erik below — non-blocking.
- Incidental churn: the live-proof run also refreshed the 7 pre-existing `server/data/derived/*.json` to fresh 2026-07-10 data (same note 1.4/1.5/1.6 made — running the full `deriveFacts()` CLI rewrites the whole set). They are a consistent set with the new artifact; the commit decision (bundle the full refresh vs revert the 7) is flagged to Erik.

### File List

- **Added:** `server/utils/newArrivalDormancy.ts`
- **Added:** `server/utils/newArrivalDormancy.test.ts`
- **Added:** `server/data/derived/new-arrival-dormancy.json` (produced by the live-proof run)
- **Modified:** `server/scripts/deriveFactsRun.ts` (import, path, `storeStatus` map + `buildNewArrivalDormancyReport` call + envelope + write appended after brand-store-matrix; `DeriveOutcome` extended; `main()` log line)
- **Modified:** `server/scripts/deriveFactsRun.test.ts` (new-arrival-dormancy envelope + gate assertions in the main regression test)
- **Modified:** `_bmad-output/implementation-artifacts/sprint-status.yaml` (story → in-progress → review)
- **Incidentally refreshed by the live-proof run (unrelated content churn):** `server/data/derived/{disparities,deal-scope,extraction-health,special-events,disparity-rollups,brand-personas,brand-store-matrix}.json`

## Questions for Erik (saved from story-creation analysis — non-blocking)

1. **`DORMANCY_MIN_ABSENT_RUNS = 2` — the dormancy floor.** Grounded from the live reappearance split (a 1-run absence has a ~29% "back tomorrow" rate; ≥2 runs clears that dominant churn bucket). Since this is the "most dangerous" fact, 3 would be more conservative (fewer, higher-confidence dormancies) at the cost of latency. Comfortable with 2, or want 3? (Named constant, trivially tunable.)
2. **No served route (Grounding §8).** FR10 says "a per-run feed," not FR11's "served consumer surface" that earned 1.4 its `/api/value/*` route. So this ships as internal-only `new-arrival-dormancy.json` (envelope-wrapped, wired into the runner), matching brand-store-matrix / brand-personas / extraction-health / special-events. A served surface, if wanted, is a small separate story (as 1.4 was for FR11). Flagging so the no-route call is conscious.
3. **The live outage is still active (as of 2026-07-10).** This fact's first real run will correctly suppress the ~2,765 outage SKUs (not-dormant, because their stores aren't `ok`) — but that outage is a genuine ongoing scraper problem (Dutchie local runner idle ~2 days), separate from this story. 1.2.5 flagged it; still worth fixing at the scraper/orchestration layer so the dataset resumes accruing. Out of this story's scope; re-flagging.

## Change Log

- 2026-07-10: Implemented via bmad-dev-story. New pure fact `newArrivalDormancy.ts` (+ 10 unit tests) wired into `deriveFactsRun.ts` after the brand-store-matrix write; internal-only `new-arrival-dormancy.json`, no route. Live-proof against `~/GmaS-data/products.db` (outage active): the store-health gate held — 0 dormant SKUs at any zero-today store, 4,473 outage SKUs suppressed (not the naive ~2,765 false delistings), 135 genuine dormant at 6 `ok` stores (all `absentRuns>=2`, `missedScrapeAmbiguity:true`), 9 new arrivals. Server suite 557/48 green; `npm run build` (client+server) clean. Status → review.
- 2026-07-10: Story created via bmad-create-story. Grounded against live `~/GmaS-data/products.db` (5,401 products, 17 days through 2026-07-10). Surfaced the decisive fact: an **active ~2-day Dutchie outage** means a naive dormancy read on `today=2026-07-10` would false-fire ~2,765 SKUs as "delisted" (12 Dutchie stores at zero-today) — making the store-health gate (consume 1.2.5, AC2) load-bearing, not optional. Grounded the dormancy floor from a live reappearance measurement (29.4% of 1-run absences reappear next day → ≥2 store-runs required, counted in runs not calendar days for store-hole robustness). Designed as a per-SKU gap-tolerant presence fact structurally mirroring `specialEvents.ts` + the 1.2 helper, plus the store-health gate and a store-onboarding guard on new-arrivals (grounded on the 06-24/06-30 onboarding waves + 07-05's 1,296 coverage-expansion spike). Presence-only output (no price/discount/potency). Internal-only, no route (mirrors 1.5/1.6). Status → ready-for-dev.
