---
baseline_commit: 9dd71da7dcbb22fbf27c5fc659deb8171f33752c
---

# Story: Oracle freshness gate at `buildMatchReport`

Status: done

<!-- Cross-cutting follow-up story (no parent epic), promoted from the Epic-derivation-2 retrospective
     (2026-07-13, action item 3). Tracked individually like the other no-parent-epic stories in
     sprint-status.yaml. Layer-2 gap #1 of ADR-095 (data-acquisition strategy). -->

## Story

As the derivation engine (and the shoppers who trust its numbers),
I want `buildMatchReport` to exclude a product's price when that product's latest observation is stale (not from the most recent scrape),
so that a prior-day price from a store that silently stopped being scraped can never set a cross-store low, inflate a spread, or become a regional floor — across **every** disparity-derived fact at once.

## Context & problem statement

`buildMatchReport` (`server/utils/crossStoreValue.ts:96`) reads each product's **latest** observation with `rec.history.at(-1)` and uses its price with **no freshness check**. If a store was not scraped today — a persistent outage (`happy-time-mt-vernon`), a recurring Dutchie extraction failure, or an individual SKU that silently dropped out of the menu — its most recent observation is a *prior-day* price, and the oracle treats it as current. That stale price can:

- set the cross-store `lowPrice` (a savings claim a shopper cannot act on),
- inflate `highPrice`/`spread`/`spreadPct`,
- become a regional price **floor** (ADR-086 `buildRegionalPriceFloor`),
- flow into `cheapest-delivered` (ADR-085) and `disparity-rollups` (ADR-084) unchanged.

All four disparity-derived facts consume `report.disparities`, so **the fix belongs at the `buildMatchReport` layer — one gate, every fact.** This is the single root cause the Epic-1 and Epic-2 retros converged on:

- Epic-derivation-1 retro action items 1–2 (mt-vernon persistent-stale; recurring Dutchie outage) — never closed as separate chores.
- Epic-derivation-2 retro challenge #2: "a `suspected-extraction-failure` store can set a regional floor from a stale prior-day price … inherited identically by disparities/cheapest-delivered/rollups. **The theme is that the oracle has no freshness gate.**"

[Source: `_bmad-output/implementation-artifacts/epic-derivation-2-retro-2026-07-13.md` §Challenges #2, §Open items, §Action items #3]

## Grounding (live products.db, story-creation 2026-07-21)

Queried the committed `server/data/products.db` (snapshot dated 2026-07-06; the live home DB carries more history — **re-ground at dev-start**):

- **Global max observed day = `2026-07-06`.** In this snapshot every *store's* latest day is 2026-07-06 (no store-level outage in this particular copy).
- **But 1,719 of 5,219 products (32.9%) have their LATEST observation before the global max day** — i.e. one-third of records currently feed the oracle a prior-day price. Latest-day spread of the stale set: `07-05:252, 07-03:144, 07-02:187, 07-01:153, 06-30:170 …` back to `06-24:55`.

Two conclusions this proves:
1. The stale-price property is **structural and large**, not just a two-store outage edge case. Per-record staleness is the dominant population.
2. The freshness gate catches a **different** population than the existing sold-out Gate 4. A silently-vanished SKU is not flagged `quantityAvailable <= 0`; it simply stops being observed. Gate 4 cannot see it; a freshness gate can.

The store-level case (mt-vernon-style persistent stale, whole-store outage windows) does not appear in *this* clean snapshot but is the documented live failure mode — the live home DB is where it manifests, so the dev must re-run the grounding query there.

## Acceptance Criteria

1. **Freshness gate added to `buildMatchReport`.** For each product, its latest observation is used only if that observation's day is fresh relative to a ratified freshness anchor (see Dev-Start Question 1). A product whose latest observation is stale is **excluded from all disparity output** and does not contribute any priced option to any group.
2. **Excluded, never silent (Gate 6).** Stale-excluded records are counted in `MatchReport` (new `staleRecords` count) and surfaced in the disparities envelope's `excluded[]` as a new `stale` reason in `deriveFactsRun.ts`, mirroring the existing five gates. The count is exact and reconciles (every record lands in exactly one of: placed / non-comparable-category / excluded-flag / unmatched / stale / no-history).
3. **Group-drop is honest.** A group that loses store(s) to the freshness gate and falls below 2 distinct stores is suppressed (existing `perStore.size < 2` path — confirm, add a test; no new suppression logic).
4. **Every disparity-derived fact inherits the gate with zero edits.** `cheapest-delivered`, `regional-price-floor`, and `disparity-rollups` consume the gated `report.disparities` and require no code change. A test proves a stale price that would have set a floor/low no longer appears in the downstream fact.
5. **FR16 type-gate parity.** No banner-rate, discount-%, price-pair, or potency claim becomes reachable. Additive-only: no change to `Deal`/`data.json`/`/api/*` route shapes or the client (ADR-043/053 preserved).
6. **Anchor is seam-safe.** The chosen freshness anchor does not misfire at the UTC-day boundary (retro lesson 1: a derive just after 00:00 UTC must not flag the whole fleet stale). Encode the anchor decision and its rationale in the code comment.
7. **Live-data proof.** Re-ground against the live home products.db: report the stale-record count, name any store(s) that fall out entirely, and show one concrete disparity/floor that changes because a stale price was removed. Grounding-first + 3-layer adversarial review + live-data proof are mandatory (Epic-2 retro action item 4).

## Dev-Start Questions for Erik — RATIFIED 2026-07-21

Erik delegated the ratification ("ratify the anchor and dev-story it"). Locked answers:
1. **Anchor = GLOBAL max observed day** (option B) — seam-proof; catches a store lagging the fleet; not per-store.
2. **`FRESHNESS_MAX_LAG_DAYS = 1`** — tolerate ordinary 1-day scrape jitter; catch the multi-day staleness that is the real hazard. Confirm against the live home DB at Task 0; flag to Erik if the live stale fraction is surprising.
3. **Per-record** granularity (gate each record's latest-observation day at `crossStoreValue.ts:96`).
4. **Runner always passes the anchor**; `buildMatchReport(file, opts)` with required opts; update the 3 test call sites; gate is never silently off.

⚠️ Session caveat: only the committed Jul-7 `products.db` is available here (pre-ADR-089 full-menu capture → day-to-day coverage undercounts, *overstating* staleness). True live-DB proof (AC7) + final `FRESHNESS_MAX_LAG_DAYS` confirmation happen when Erik runs the local derive on the home machine.

### Original recommendations (retained for rationale)

These were load-bearing design calls. Recommendations given; ground each against the live DB first.

1. **Freshness anchor — what does "fresh" mean?**
   - (A) Wall-clock UTC today (`new Date().toISOString().slice(0,10)` — what `extraction-health` already uses at `deriveFactsRun.ts:213`). Simple, consistent with siblings, **but the retro flagged the UTC-seam footgun** (a derive just after 00:00 UTC ≈ 5pm PDT flags everything stale).
   - (B) **Global max observed day in the DB (RECOMMENDED).** "Fresh" = "from the most recent scrape present in the data." Seam-proof (stable at any wall-clock run time); a store or SKU lagging the fleet is caught correctly; a persistently-stale store falls out because its latest day < the fleet's max. This is the retro's own suggested mitigation ("anchor `today` to the max observed day in the DB").
   - ⚠️ **Not** per-store max day — a per-store anchor can never flag a persistently-stale store (its own latest is trivially its own max). The anchor must be fleet-global to catch mt-vernon-style lag.
2. **Freshness tolerance — exact-day or a grace window?** Exact-day (`latestDay === anchor`) is strictest but excludes 32.9% here, some of which is normal scrape jitter. Recommend ratifying a named constant `FRESHNESS_MAX_LAG_DAYS` (default **0 or 1**), grounded against the live latest-day distribution, so a 1-day lag from ordinary churn isn't over-suppressed while multi-day staleness is caught. State the constant like `CLUSTER_RADIUS_MILES`/`ROLLING_WINDOW_DAYS` — Erik ratifies at dev-start.
3. **Gate granularity — per-record or per-store?** Recommend **per-record** (gate each record by its own latest-observation day, at `crossStoreValue.ts:96`). It is surgical, needs no reordering, and catches the dominant 32.9% partial-store population. A per-store gate (exclude whole `suspected-extraction-failure` stores) is coarser and would require computing `buildExtractionHealthReport` *before* `buildMatchReport` (currently after, line 214). Per-record subsumes the store case: a fully-stale store's records are all individually stale.
4. **Signature/compat.** `buildMatchReport(file)` is called in 3 test files + the runner. Recommend `buildMatchReport(file, opts)` where `opts.freshnessAnchor` (+ max-lag) enables the gate, the **runner always passes it**, and a runner test asserts it does — so the gate is never silently off in production. Decide whether omitting the anchor = gate-off (keeps existing disparity tests green as-is) or all call sites are updated. Flag the "optional = silently off" risk explicitly.

## Tasks / Subtasks

- [x] **Task 0 — Ground at dev-start (AC7).** Ratified in-session (Erik delegated): anchor = global max observed day, `FRESHNESS_MAX_LAG_DAYS=1`, per-record, runner always passes. Grounded vs the committed `products.db` (anchor 2026-07-06): 1,228/5,219 (23.5%) stale at lag 1. Live home-DB re-ground (store-level fall-out, steady-state %) deferred to Erik's next local derive — the committed snapshot is pre-ADR-089 (coverage-starved → upper-bound staleness). (AC: 1, 6, 7)
- [x] **Task 1 — Add the freshness gate to `buildMatchReport` (AC: 1, 3).**
  - [x] `buildMatchReport(file, opts)` with `freshnessAnchor` + `maxLagDays`; self-derives `globalMaxObservedDay(file)` when the anchor is omitted so the gate is never off; skips a record whose latest-observation day `< anchor − maxLag`.
  - [x] New `staleRecords` counter added to `MatchReport` and returned.
  - [x] "Gate 6: freshness" added to the honesty-gates header with the anchor + seam rationale (AC6).
- [x] **Task 2 — Surface it in the runner (AC: 2).** `deriveFactsRun.ts` computes `globalMaxObservedDay` and passes it explicitly; `{ reason: 'stale', count: report.staleRecords }` added to the disparities `excluded[]` and `staleRecords` to coverage. Gate runs inside the existing `buildMatchReport` call — no new fallible pre-write step.
- [x] **Task 3 — Prove sibling inheritance (AC: 4, 5).** Runner test proves a stale store is absent from both `disparities` and the downstream `disparity-rollups`; siblings consume `report.disparities` unchanged (no signature/route/type edits — FR16 parity holds, build clean).
- [x] **Task 4 — Tests (AC: all).** 10 new unit tests in `crossStoreValue.test.ts` (stale excluded+counted, boundary-kept, group-drop, explicit anchor + lag 0, UTC-seam non-misfire, unparseable-date excluded, `globalMaxObservedDay`, `FRESHNESS_MAX_LAG_DAYS`) + 1 runner test. The 3 existing call sites needed NO assertion changes (single-day fixtures → gate is a no-op); two literal `MatchReport` builders (`valueRoute.ts`, `compareRoute.test.ts`) gained `staleRecords: 0`.
- [x] **Task 5 — Live proof + build (AC: 7).** Before/after over the committed DB: 228→134 disparities (94 removed), 1,228 stale (23.5%) at lag 1. Full server suite 715 green; `npm run build` clean. 3-layer `bmad-code-review` is the recommended next step (different LLM).

## Dev Notes

### Files to touch
- `server/utils/crossStoreValue.ts` — **UPDATE.** Add Gate 6 at the `const latest = rec.history.at(-1)` boundary (line 96). Today: gates 1 (excluded-flag), 5 (non-weight category), unmatched, then latest observation used unconditionally. Preserve gates 1–5 exactly; the freshness gate is additive and orthogonal (it catches silently-vanished SKUs that Gate 4's `quantityAvailable <= 0` cannot see). Add `staleRecords` to `MatchReport`.
- `server/scripts/deriveFactsRun.ts` — **UPDATE.** `buildMatchReport(productsFile)` at line 166 → pass the ratified anchor; add the `stale` reason to `disparitiesEnvelope` `excluded[]` (lines 180–192). `today` already computed at line 213 (currently *after* the match report) — if anchor (A) is chosen, hoist it above line 166; if (B), derive the global max day from `productsFile` (max of `history.at(-1).observedAt` across records) before the call.
- Tests: `server/utils/crossStoreValue.test.ts`, `server/utils/productsDb.test.ts`, `server/integration/weedmapsMatcher.test.ts` (3 call sites) + new sibling-inheritance assertions in the cheapest-delivered / regional-price-floor / disparity-rollups suites.

### What must be preserved (do not break)
- Gates 1–5 and their counts (`nonComparableCategoryCount`, `excludedFlagCount`, `unmatchedCount`, `placedRecords`) — the envelope and existing tests depend on them.
- The `previousTotalRecords > 0 && report.totalRecords === 0` zero-collapse guard (`deriveFactsRun.ts:168`) — `totalRecords` is still `records.length` (pre-gate); do **not** redefine it as post-gate or the guard changes meaning.
- Sibling facts read `report.disparities` only — no signature change to `buildDisparityRollups` / `buildCheapestDeliveredReport` / `buildRegionalPriceFloorReport`.
- ADR-043/053 decoupling: `Deal` / `data.json` / deals path untouched.

### Scope boundaries
- **In scope:** the freshness gate at `buildMatchReport` and its inheritance by the 3 disparity-derived facts.
- **Out of scope:** `price-vs-own-median` (ADR-084) does **not** use `buildMatchReport` — it reads its own windowed `(product_key, observedAt)` query and already gates on distinct calendar days, so it is unaffected. Do not touch it. The `extraction-health` fact stays as-is (it *reports* staleness; this story *acts* on it at the price layer).
- This is coverage/honesty hardening — **no new number is invented**, a dishonest one is removed. Expect disparity/floor counts to drop somewhat; that is the point (a smaller, all-fresh oracle).

### Honesty framing
This adds **Gate 6: freshness** to the five gates already documented at the top of `crossStoreValue.ts`. Same discipline as the others: the excluded records are counted and surfaced in the envelope, never silently dropped. The moat is that every surfaced price is one a shopper can act on *today*.

### References
- [Source: `server/utils/crossStoreValue.ts` — `buildMatchReport`, honesty-gate header, `latest = rec.history.at(-1)` line 96]
- [Source: `server/scripts/deriveFactsRun.ts` — call site line 166, `today` line 213, `buildExtractionHealthReport` line 214, envelope lines 180–266]
- [Source: `server/utils/extractionHealth.ts` — per-store `ok`/`suspected-extraction-failure`/`insufficient-history`, `today` anchoring, UTC day arithmetic]
- [Source: `server/types/index.ts:105` — `ProductObservation.observedAt` is an ISO timestamp; `ProductRecord.history` is append-only]
- [Source: `_bmad-output/implementation-artifacts/epic-derivation-2-retro-2026-07-13.md` — the promotion of this story]
- [Source: `ADR.md` ADR-095 — Layer-2 gap #1; ADR-084/085/086 — the disparity-derived siblings; ADR-083 — confirmed-empty ingest, adjacent freshness mechanism]

### Project Structure Notes
- Pure-function-in-`utils` + wired-in-runner pattern, identical to the 1.4/2.2/2.3 sibling facts. No new module — the gate lives inside the existing `buildMatchReport`. No route, no client, no new derived JSON file (so no `$derivedFiles` append needed in `derive-facts-local.ps1`).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- `npx vitest run` (server): 57 files / **715 tests green** (was 705; +10 gate + 1 runner, and two existing files gained a `staleRecords: 0` literal).
- `npm run build`: client `tsc -b && vite build` + server `tsc` clean (client JS 265.25 KB unchanged; the first build surfaced two `MatchReport` literal type errors from the new required field — fixed, rebuilt clean).
- Live proof over committed `products.db` (anchor 2026-07-06, lag 1): gate OFF 228 disparities / 0 stale → gate ON **134 disparities / 1,228 stale (23.5%)**; **94 disparities removed** because they rested at least partly on a stale prior-day price.

### Completion Notes List

- **Design refinement over the ratified letter (honors every ratified property):** the anchor **self-derives** (`globalMaxObservedDay(file)`) when omitted, so the gate is *un-disableable* — stronger than "runner must remember to pass it." The runner still passes it explicitly for clarity/testability. Because every existing test fixture is single-day, the self-deriving default is a **no-op** on them, so none of the 3 existing `buildMatchReport` call sites needed assertion changes — smaller blast radius than the planned "update 3 call sites."
- **Gate 6 placement:** inside `buildMatchReport` at the `rec.history.at(-1)` boundary, after the unmatched check. Orthogonal to Gate 4 (sold-out) — it catches silently-vanished SKUs that carry no `quantityAvailable<=0` signal.
- **Anchor = global max observed day** (data-derived), not wall-clock `today` — seam-proof (a derive just after 00:00 UTC cannot flag the whole fleet stale; test `does not misfire at the UTC-day boundary`). **`FRESHNESS_MAX_LAG_DAYS = 1`** tolerates one-day scrape jitter (07-05 kept) while catching multi-day staleness (07-04 dropped).
- **Unparseable `observedAt` → treated as stale** (cannot be proven fresh). Inert when the dataset has no parseable anchor (empty DB).
- **Siblings inherit for free:** `cheapest-delivered` / `regional-price-floor` / `disparity-rollups` read `report.disparities`; no signature/route/client/`data.json`/type change (FR16 parity). `price-vs-own-median` untouched (own windowed reader).
- **⚠️ Caveat for review + Erik:** the 23.5% / 94-removed figures are an **upper bound** from the committed pre-ADR-089 snapshot (top-100 carousel era → poor day-to-day coverage inflates apparent staleness). On the live home DB (full-menu daily capture), a still-listed product is observed every day, so the steady-state stale fraction and disparity reduction will be materially smaller. The store-level fall-out case (mt-vernon-style) does not appear in this single-day snapshot; confirm on the live DB.
- Not pushed/deployed — awaiting `bmad-code-review` + Erik's go-ahead; the fact only re-serves after a home `derive-facts-local` run republishes `disparities.json` et al.

### File List

- `server/utils/crossStoreValue.ts` — MODIFIED (Gate 6: `FRESHNESS_MAX_LAG_DAYS`, `observedDay`, `subtractDaysUTC`, `globalMaxObservedDay`, `MatchReportOptions`, `staleRecords`, header doc)
- `server/scripts/deriveFactsRun.ts` — MODIFIED (compute + pass `freshnessAnchor`; `stale` envelope reason + coverage)
- `server/routes/valueRoute.ts` — MODIFIED (`staleRecords: 0` in `EMPTY_DISPARITIES_ENVELOPE`)
- `server/utils/crossStoreValue.test.ts` — MODIFIED (+10 Gate-6 tests, imports)
- `server/scripts/deriveFactsRun.test.ts` — MODIFIED (+1 stale-exclusion + downstream-inheritance test)
- `server/routes/compareRoute.test.ts` — MODIFIED (`staleRecords: 0` in a test `MatchReport` literal)

## Change Log

- 2026-07-21: Implemented the oracle freshness gate (Gate 6) at `buildMatchReport` — self-deriving global-max-observed-day anchor, `FRESHNESS_MAX_LAG_DAYS=1`, per-record, excluded+counted (`staleRecords` + `stale` envelope reason). Siblings inherit via `report.disparities`. Live proof (committed DB): 228→134 disparities, 1,228 stale (23.5%). 715 server tests green; build clean. Status → review.
- 2026-07-21: 3-layer adversarial code review (Opus 4.8) + applied 1 decision + 3 patches — anchor future-day guard (ignore days > today-UTC), calendar-invalid-date rejection in `observedDay`, `maxLagDays`/explicit-anchor input validation, +6 hardening tests. 721 server tests green; build clean. 4 items deferred (AC2 reconciliation, AC7 live-home-DB proof, whole-DB-unparseable, non-UTC offset) → `deferred-work.md`. Status → done. NOT pushed — awaits Erik's go-ahead + a home `derive-facts-local` run for AC7 live-proof.

## Review Findings

3-layer adversarial `bmad-code-review` (Blind Hunter / Edge Case Hunter / Acceptance Auditor, all Opus 4.8), 2026-07-21. 1 decision-needed, 3 patch, 4 defer, 5 dismissed. Verified: only production caller of `buildMatchReport` is `deriveFactsRun.ts:171` (explicit anchor); siblings are pure consumers of `report.disparities` (AC4 holds). **All 1 decision + 3 patches applied 2026-07-21; 721 server tests green (+6), build clean.**

- [x] [Review][Decision→Patch] Future-dated observation poisons the global-max anchor → silent engine-wide disparity blackout — one future `observedAt` (clock skew/bad scrape) makes `globalMaxObservedDay` return a day ahead of the fleet, pushing `staleThreshold` past every real store's latest day, so ALL records flag stale and every disparity/floor/rollup empties. The zero-collapse guard does NOT catch it (`totalRecords` stays pre-gate `records.length` > 0 while `disparities`→[]), so the runner republishes a decimated artifact silently. **RESOLVED — Erik chose "drop future-dated days when deriving the anchor": `globalMaxObservedDay(file, today=UTC-now)` now ignores any day `> today` (upper bound only; AC6 lower-seam behavior untouched). Testable `today` param; runner uses wall-clock default.** [crossStoreValue.ts:82]
- [x] [Review][Patch] `observedDay` accepts calendar-invalid dates (e.g. `2026-13-45`) — shape regex only; such a value can become the lexicographic max anchor and crash the derive via `new Date(...).toISOString()` RangeError, or be treated as fresh and set a phantom low. **APPLIED — `observedDay` now round-trips the day through a real UTC `Date` and rejects any value that is NaN or normalizes away from its input.** [crossStoreValue.ts:65]
- [x] [Review][Patch] `buildMatchReport` options unguarded — `?? ` only catches null/undefined: NaN `maxLagDays` → `setUTCDate(NaN)` throws; negative → threshold after anchor → all-stale silent empty; malformed explicit `freshnessAnchor` → `toISOString()` RangeError. **APPLIED — `maxLagDays` coerced to `Math.max(0, Math.trunc(x))` with NaN→default; an unparseable explicit `freshnessAnchor` falls back to the self-derived anchor (gate stays active).** [crossStoreValue.ts:128]
- [x] [Review][Patch] Missing boundary tests — **APPLIED — added just-past-boundary exclusion (`07-04` at anchor `07-06`/lag 1 → stale, pins `<` vs `<=`), `maxLagDays=0` anchor-day keep-case, impossible-date rejection, future-day anchor-guard, hostile-`maxLagDays` coercion, and unparseable-explicit-anchor fallback (6 new tests).** [crossStoreValue.test.ts]
- [x] [Review][Defer] AC2 reconciliation not literally exact — no-history (`!latest continue`) and matched-but-unpriced records are counted in no bucket; sums < `totalRecords`. Pre-existing; Gate 6 adds a correctly-counted bucket and introduces no new leak. [crossStoreValue.ts:165] — deferred, pre-existing
- [x] [Review][Defer] AC7 live-home-DB proof + store-level (mt-vernon) fall-out unproven — measured only on the committed pre-ADR-089 snapshot (upper-bound 23.5%). Must re-ground on the next home derive before this is live-verified. [oracle-freshness-gate.md AC7] — deferred, gated on home derive
- [x] [Review][Defer] Whole-dataset-unparseable disables the gate — every `observedAt` unparseable → anchor=null → Gate 6 skipped (inverse of the "unprovable ⇒ stale" guarantee). Corrupt-DB pathological only. [crossStoreValue.ts:130] — deferred, pre-existing
- [x] [Review][Defer] Non-UTC `observedAt` offsets mis-bucket by a day — `observedDay` slices first 10 chars assuming `Z`; scraper always stamps UTC so not live-reachable, but the assumption is undocumented. [crossStoreValue.ts:65] — deferred, data-provenance protected
