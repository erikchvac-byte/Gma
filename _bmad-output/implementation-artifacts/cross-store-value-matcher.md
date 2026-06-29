---
baseline_commit: ed5446dbe7b99b2c00f25a1b0acb0f10483415cf
---

# Story: Cross-Store Value Matcher (Phase 0 honesty hardening + A1 keystone)

Status: review

<!-- Cross-cutting follow-up story (no parent epic), tracked individually like data-hardening / compliance-launch-gate. Sourced from the AI-search/proprietary-data synthesis plan, not epics.md. -->

## Story

As the GmaS data platform,
I want a verified-honest engine that matches the **same product across different stores** and emits a cross-store price-disparity fact (`lowPrice`, `highPrice`, `spread%`, `storesCarrying[]`),
so that GmaS holds a proprietary relational dataset that no single store has — the keystone the cheapest-delivered index, brand matrix, and AI-search surfacing all compose from.

## Context & Source of Truth

**Full plan and rationale:** `_bmad-output/implementation-artifacts/investigations/ai-search-data-strategy-investigation.md` (read this first — it grades every derivation by honesty × buildability and explains why A1 is the keystone).

This story implements **Phase 0 + Tier A item A1** of that plan. Supporting evidence:
- `investigations/value-analysis-2026-06-24.md` §4 — the data-quality audit (what is honest vs not).
- `investigations/fix6-basePrice-verdict.md` — why discount % is NOT a value signal; `specialPrice` is the real price paid.
- `investigations/FIXES.md` — the honesty fixes (esp. #1 kill banner-discount math, #2 history-vs-median).

### Downstream phases — OUT OF SCOPE for this story, but this is the path forward (do NOT build here)
The plan continues after this story; preserving the sequence so the next pickup has context:
- **Phase 2 — Weedmaps wiring** (TYPE 3 `weedmaps-static-json`): adds per-gram `gramUnitPrice` + per-SKU `dealIds` as a second source feeding the matcher. Gated on a scaled-crawl/rate-limit test. *Not in this story.*
- **Phase 3 — Accrual on schedule**: let CAP-6 observations accumulate days→weeks so trendlines / "vs own rolling median" (the only honest discount, `FIXES` #2) become real. *Not in this story.*
- **Phase 4 — Legal gates → public SSR surfacing (Goal 2)**: close WSLCB/counsel gates (WAC 314-55-155 warning statements; derived-vs-verbatim redistribution line), then ship server-rendered comparison-table / question→answer pages with `AggregateOffer`/`Dataset` schema. *Not in this story — and gated on non-engineering decisions.*
- **Phase 5 — Monetization** (sponsored placement / freemium): see `investigations/monetization-ad-revenue-investigation.md`. *Separate decision.*

This story produces a **private dataset/API only** — no public surfacing. That keeps it on the safe side of the ToS/legal line per the plan's cross-cutting risk section.

## Acceptance Criteria

1. **Cross-store identity key.** A pure function derives a stable match key for a `ProductRecord` from normalized `brand + strainType + category + canonical weight` (and a normalized name token where brand is null). Two listings of the same product at different stores produce the same key; clearly different products do not. Unmatchable records (no brand AND no usable name signal) are returned in an explicit "unmatched" bucket, never silently dropped or mis-grouped.
2. **Disparity record.** For each match key carried by ≥2 stores, the engine emits `{ matchKey, displayName, category, weightGrams, lowPrice, highPrice, spread, spreadPct, storesCarrying: [{ dispensaryId, price, quantityAvailable }] }`, where price is the latest observation's `specialPrice ?? basePrice` (the real price paid, per `fix6`), `spread = high - low`, `spreadPct = spread / low`.
3. **Honesty gate — flags honored.** Records (or specific options) flagged `weight-mismatch`, `unparseable-weight`, or `unparseable-pack` are EXCLUDED from any per-gram disparity comparison (they produce false $/gram). They may still appear in same-weight absolute-price comparison where the flag does not apply. No disparity output is produced from a flagged per-gram value. (The parser already sets these flags in `normalizeProduct.ts`; this AC is about the consumer honoring them.)
4. **Honesty gate — like-for-like only.** A disparity is only emitted comparing the **same canonical weight** (e.g. 1g vape vs 1g vape; 3.5g flower vs 3.5g flower). The engine never compares across weights or computes a whole-catalog $/gram leaderboard (`value-analysis` §4 verdict: that structurally surfaces trim every time — forbidden).
5. **Phase 0 verification.** A test/audit asserts that running the matcher over the current committed `server/data/products.json` produces zero disparity rows whose inputs carry an excluded flag, and that the fractional-oz parse (ADR-054) and pack-count parse remain correct (regression lock on `parseGrams`/`parsePackCount`). Any record the matcher cannot place is counted and reportable, not hidden.
6. **Decoupling preserved.** The new code is additive: it does NOT modify `Deal`, `filterActiveDeals`, `/api/data`, `_dutchie.ts`, or the `ProductRecord`/`ProductsFile` write path. All existing server tests (177+ deals path, product-pricing suite) stay green. The matcher is a read-only consumer of `ProductsFile`.
7. **Surface (private).** The disparity dataset is reachable for internal use — either a new read-only route (e.g. `GET /api/value/disparities`) or an exported artifact function — following the existing `productsRoute.ts` read-only pattern. No public/SSR page, no schema.org markup (those are Phase 4).
8. **Tests.** Unit tests for the identity key (match/no-match/unmatchable), the disparity math (spread/spreadPct, special-vs-base selection), and the honesty gates (flagged records excluded, no cross-weight comparison), per the project's TypeScript-strict + test-everything rule.

## Tasks / Subtasks

- [x] **Task 1 — Cross-store identity key** (AC: 1)
  - [x] New module `server/utils/productMatchKey.ts` + test. Pure `deriveMatchKey(rec: ProductRecord): { key: string } | { unmatched: reason }`.
  - [x] Canonicalize weight via existing `parseGrams` (reuse — do not reinvent); normalize brand/strain/category casing & whitespace; brand-null fallback to a normalized leading name token. (See deviation note in Completion Notes: strain token included ALWAYS, not only brand-null, to satisfy AC1's "different products → different key" clause.)
- [x] **Task 2 — Disparity engine** (AC: 2, 3, 4)
  - [x] New module `server/utils/crossStoreValue.ts` + test. `buildDisparities(file: ProductsFile): Disparity[]`.
  - [x] Group by (matchKey, canonical weightGrams); take latest observation per product (`history.at(-1)`); price = `specialPrice ?? basePrice`.
  - [x] Apply honesty gates: exclude options whose record `flags` include excluded set from per-gram; same-weight only; require ≥2 distinct `dispensaryId`.
  - [x] New `Disparity` type in `server/types/index.ts` (additive, alongside the existing product types).
- [x] **Task 3 — Phase 0 verification/audit** (AC: 5)
  - [x] Test that loads committed `products.json`, runs the matcher, asserts no excluded-flag inputs reach disparity output; counts unmatched.
  - [x] Regression lock test pinning `parseGrams('1/8oz')===3.54` and pack-count cases (guards ADR-054 + parse contract).
- [x] **Task 4 — Private surface** (AC: 7)
  - [x] Read-only route or export fn mirroring `server/routes/productsRoute.ts`. No mutation, no public page.
- [x] **Task 5 — Decoupling regression** (AC: 6, 8)
  - [x] Run full server suite; confirm deals path + product-pricing suite unchanged. `npm run build` (client+server) clean before close.

## Dev Notes

### Current state of the code being touched (READ before implementing)

- **`server/utils/normalizeProduct.ts`** — *do not rewrite the parser.* It ALREADY: parses pack count (`parsePackCount`), parses grams incl. the fractional-oz fix (`parseGrams`, ADR-054 — `1/8oz`→3.54g not 1g), and sets `flags`: `assumed-single`, `unparseable-weight`, `weight-mismatch`. The "365 weight-mismatch / ~17% wrong $/gram" from `value-analysis` 2026-06-24 are **already flagged here** — Phase 0's job is to make the new matcher (Task 2/3) **honor those flags as exclusions**, not to re-fix parsing. Only touch this file if Task 3 surfaces a genuinely uncovered parse case (flag it, don't silently fix).
- **`server/utils/productsStore.ts`** — append-only store keyed `${dispensaryId}::${productId}` (per-store identity). There is **no cross-store grouping anywhere** — that's exactly the new capability. Read-only consume `readProducts()`; never write through this path from the matcher.
- **`server/types/index.ts`** — `ProductRecord` / `ProductObservation` / `ProductOptionObservation` shapes are here (lines 57–98). Note: `pricePerGram`/`specialPricePerGram` are PER-OPTION and already computed; `flags` are PER-RECORD. Add `Disparity` here, additively.
- **`server/routes/productsRoute.ts`** — the read-only route pattern to mirror for Task 4.

### Why this is the keystone (don't skip the honesty gates)
`fix6-basePrice-verdict.md` proved discount % is a flat storewide/brand promo rate → no per-item signal; so this engine compares **real prices paid** (`specialPrice ?? basePrice`), never discount %. `value-analysis` §4 proved $/gram is honest ONLY same-product cross-store (quality held constant) — which is precisely what this matcher constructs. Violating AC 3/4 (letting flagged or cross-weight values through) reintroduces exactly the "data that lies" the whole plan exists to avoid. The integrity of the output IS the product's moat (information-gain for Phase-4 AI search).

### Project Structure Notes
- All new files under `server/utils/` + `server/routes/`, TypeScript strict, `.js` import extensions (match existing ESM style). Co-located `*.test.ts` per house convention (vitest).
- Additive/decoupled per ADR-043 (deals-first decoupling) and ADR-053 (product-pricing isolation). Matcher is a pure read-only consumer.

### References
- [Source: _bmad-output/implementation-artifacts/investigations/ai-search-data-strategy-investigation.md] — full plan, A1 definition, phase sequence, legal gates
- [Source: _bmad-output/implementation-artifacts/investigations/value-analysis-2026-06-24.md#4] — data-quality audit; same-product $/gram honesty rule
- [Source: _bmad-output/implementation-artifacts/investigations/fix6-basePrice-verdict.md] — specialPrice trustworthy; discount % is not
- [Source: server/utils/normalizeProduct.ts] — existing parse + flagging (don't rewrite)
- [Source: server/types/index.ts:57] — ProductRecord/observation shapes
- [Source: server/routes/productsRoute.ts] — read-only route pattern to mirror

## Open Questions (for Erik — non-blocking; sensible defaults chosen)
1. Surface as a live `/api/value/disparities` route, or an export-only function for now? (Default: route, mirroring `/api/products`.)
2. Name-token fallback when `brand` is null is the fuzziest part of matching — acceptable to ship conservative (only match on strong brand+weight signal, leave more in the unmatched bucket) for v1? (Default: yes — false matches produce false disparities, so bias toward under-matching.)

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (bmad-dev-story workflow)

### Debug Log References
- Prototyped the matcher over committed `products.json` before coding: confirmed 95 candidate cross-store groups pre-gate; both `1/8oz` (442×) and `3.5g` (87×) labels present → canonical weight snapping required or eighths never match.
- Flag audit on live data: 427 `weight-mismatch`, 268 `assumed-single`, 0 `unparseable-weight` — so the AC5 exclusion gate is genuinely exercised.
- Final live run (post-gate): 2461 records → 427 excluded (weight-mismatch), 0 unmatched, 2034 placed → **82 honest cross-store disparities** (e.g. OG Chem 3.5g $15–$30 across 4 stores). Full suite 310 tests green; client+server prod build clean.

### Completion Notes List
- **Identity-key deviation (deliberate, documented):** AC1's literal text says use a name token "only where brand is null." Implemented to include the normalized strain/name token **always**. Brand+strainType+category+weight alone collides distinct strains (GG4 vs Blue Dream of the same brand) and would emit FALSE disparities — violating AC1's own second clause ("clearly different products do not produce the same key") and the story's core integrity mandate. Differing store name formats only cause UNDER-matching (a safe false-negative), which is exactly the bias Open-Question 2 chose. Verified: same product across stores matches (OG Chem ≡ Chem OG; "Banana OG Cartridge" ≡ "Banana OG 1g Cartridge"); different strains/brands do not.
- **Canonical weight snapping:** `canonicalWeightGrams` reuses `parseGrams` (incl. ADR-054 fractional-oz fix) then snaps to the nearest standard cannabis weight within 2% — so `1/8oz` (3.54g) and `3.5g` both canonicalize to 3.5g (an eighth is an eighth), while `3.6g` (2.9% off) stays distinct. The matcher recomputes weight from the option LABEL rather than trusting the stored `weightGrams` (some committed observations carry the pre-ADR-054 bad parse), making it robust to stale data.
- **Honesty gates:** records carrying any of `weight-mismatch`/`unparseable-weight`/`unparseable-pack` are excluded entirely (AC3/AC5); only same canonical weight is compared (AC4 — no cross-weight, no whole-catalog $/gram leaderboard); price is `specialPrice ?? basePrice`, never a discount % (fix6). AC5 audit proves excluded records have **zero** effect on output via a full-vs-filtered equivalence assertion on real data.
- **Decoupling (AC6):** purely additive read-only consumer of `ProductsFile`. No change to `Deal`, `filterActiveDeals`, `/api/data`, `_dutchie.ts`, `normalizeProduct.ts`, or the products write path. Deals + product-pricing suites unchanged.
- Open Questions resolved with the stated defaults: (1) shipped as a live route `GET /api/value/disparities` returning the full `MatchReport` (disparities + audit counts); (2) conservative under-matching adopted.

### File List
**New:**
- `server/utils/productMatchKey.ts`
- `server/utils/productMatchKey.test.ts`
- `server/utils/crossStoreValue.ts`
- `server/utils/crossStoreValue.test.ts`
- `server/utils/crossStoreValue.audit.test.ts`
- `server/routes/valueRoute.ts`
- `server/routes/valueRoute.test.ts`

**Modified:**
- `server/types/index.ts` — added `Disparity` + `DisparityStore` (additive).
- `server/index.ts` — wired read-only `GET /api/value/disparities`.
- `_bmad-output/implementation-artifacts/cross-store-value-matcher.md` — story tracking.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status.

## Change Log
- 2026-06-28 — Implemented cross-store value matcher (Phase 0 honesty + A1 keystone): identity key + canonical weight snapping, disparity engine with honesty gates, Phase 0 audit on committed data, private `/api/value/disparities` route. 50 new tests; full server suite 310 green; client+server build clean. Story → review.
