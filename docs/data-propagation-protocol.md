# Data Propagation Protocol

**Status:** Draft
**Purpose:** When you add a new *category* (a product type like `Edible`) or a new *data type* (a new derived fact, a new page/URL type), it must reach **every** mechanism that consumes that kind of data — not just the one you were touching. This protocol is the standing map of those touchpoints plus the rule for keeping them from drifting.

Companion to [seo-indexing-diagnostic-protocol.md](./seo-indexing-diagnostic-protocol.md) (that one *diagnoses* reach; this one *propagates* data).

---

## Core principle: prefer an enforced invariant over a checklist

A checklist is a memo you can forget. Rank the ways of keeping surfaces in sync, best first:

1. **Fan out from one source.** Multiple surfaces read the *same* canonical list, so a new entry appears everywhere at once with zero manual steps. Example: `sitemapRoute.ts`, `/llms.txt`, and the `/compare` index all derive their category URLs from the same `disparity-rollups.json` — "an index link and a sitemap entry can never disagree" (comment in `sitemapRoute.ts`).
2. **CI guard test.** When surfaces genuinely can't share one source, add a test that fails if they drift. Example: `normalizeProduct.test.ts:214` asserts `WEIGHT_BASED_CATEGORIES ⊆ DEFAULT_PRODUCT_CATEGORIES`.
3. **This checklist.** Only for the residue that neither of the above covers yet. Every time you rely on the checklist, ask whether the step could be promoted to #1 or #2.

**Rule: single-source every list; never re-type a category literal.** The category sets below are exported and imported, not duplicated.

---

## Map A — adding a product CATEGORY

A category is a Dutchie-verbatim `type` string (e.g. `Flower`, `Edible`, `Concentrate`). Reference precedent: `_bmad-output/implementation-artifacts/spec-category-expansion.md` (the Edible/Concentrate add — its Code Map is the worked example of this map).

| # | Touchpoint | File | What it controls | How it propagates |
|---|-----------|------|------------------|-------------------|
| A1 | `DEFAULT_PRODUCT_CATEGORIES` | `server/scrapers/_dutchieProducts.ts:21` | Collection allowlist — what Dutchie extraction keeps | **Source of truth.** Everything downstream imports this. |
| A2 | Weedmaps `CATEGORY_RULES` + `DEFAULT_CATEGORY_SLUGS` | `server/scrapers/_weedmaps.ts` | Cross-source vocab: maps Weedmaps ancestry → the same category strings; `LaunchCategory` is derived from A1 | Imports A1; rules are ordered (word-bounded cues **before** vape/flower to block mg-as-grams misfiling) |
| A3 | `WEIGHT_BASED_CATEGORIES` | `server/utils/normalizeProduct.ts:24` | Which categories get a true weight/`$-per-gram` axis. Non-weight categories get null weight fields and **no** `unparseable-weight` flag (Honest Math) | Exported; imported by A4, A5, and the derive runner |
| A4 | Matcher gate | `server/utils/crossStoreValue.ts:178` | Skips non-weight categories before disparity grouping; counts them in `nonComparableCategoryCount` | Imports A3 (the matcher re-parses labels itself, so it needs its own gate) |
| A5 | Derive runner gate | `server/scripts/deriveFactsRun.ts:326` | Same `WEIGHT_BASED_CATEGORIES` + `EXCLUDED_FLAGS` gate applied when building facts | Imports A3 |
| A6 | `ScrapedCategory` / `BANNER_LINKABLE_CATEGORIES` | `server/types/index.ts`, `server/utils/dealScope.ts:148` | The deliberately *narrower* set of categories deal banners are allowed to link to. Widening collection must **not** silently widen the banner bridge | Separate set on purpose — a decision, not a mirror of A1 |
| A7 | Coupling guard test | `server/utils/normalizeProduct.test.ts:214` | Fails if `WEIGHT_BASED_CATEGORIES` isn't a subset of `DEFAULT_PRODUCT_CATEGORIES` | CI invariant (principle #2) |
| A8 | Sitemap / `/llms.txt` / `/compare` | `server/routes/sitemapRoute.ts`, `compareRoute.ts` | Per-category crawlable URLs | **Automatic** (principle #1) — reads rollups, no manual edit needed |

**Honest-Math boundary (non-negotiable):** never emit a `$/gram` figure whose denominator isn't a real product weight. A mg-THC-labeled category (edibles) stays out of `WEIGHT_BASED_CATEGORIES`; its absence of a per-gram figure is `n/a`, not a defect. New categories default to **out** of the weight set until an honest unit basis exists.

**Ask-first before adding a category:** confirm the `type` string appears in a live capture; any `ProductRecord` schema field; any change to `EXCLUDED_FLAGS` or `BANNER_LINKABLE_CATEGORIES` membership.

---

## Map B — adding a DERIVED FACT / data type (a new `derived/*.json`)

| # | Touchpoint | File | Why |
|---|-----------|------|-----|
| B1 | Emit the artifact | `server/scripts/deriveFactsRun.ts` | Write the new `server/data/derived/<name>.json` via the honesty envelope (`generatedAt` + fail-soft empty shape) |
| B2 | **Publish list** | `scripts/derive-facts-local.ps1` `$derivedFiles` (line ~50) | ⚠️ **The known gap.** A new `derived/*.json` NOT appended here is generated locally but never committed/republished — it silently goes stale. No CI catches this today. |
| B3 | Read route | `server/routes/valueRoute.ts` | Add a `readDerived<T>(PATH, EMPTY_ENVELOPE)` reader — fail-soft to the empty envelope, never a 500 |
| B4 | Client hook / surface | `client/src/...` | If it feeds the app, wire the hook + component |
| B5 | Sitemap / `/llms.txt` | `server/routes/sitemapRoute.ts` | **Only if** it mints a new URL type. A new *fact on an existing page* needs nothing here; a new *page type* must fan out like `/compare/<region>` does (see `readRegionPaths`) |

**Recommended promotion (closes the B2 gap):** add a guard test asserting every `server/data/derived/*.json` on disk is present in the `derive-facts-local.ps1` `$derivedFiles` list. This turns the last manual sync point into an enforced invariant (principle #2). *Proposed, not yet built.*

---

## Procedure

1. **Classify** the change: new category (Map A) or new data type / fact (Map B)?
2. **Find the source of truth** for that kind of data and edit *it* — never a downstream copy.
3. **Walk the map row by row.** For each row, either the change flows automatically (note it) or you make the edit.
4. **Add/extend a guard test** for any row you had to edit manually — the goal is that the *next* addition can't skip it.
5. **Verify:** `npm test --workspace=server` (guards green), `npm run build` (client+server compile), and after the next local derive+publish, confirm the new category/fact appears on the auto-fan-out surfaces (`/sitemap.xml`, `/llms.txt`, `/compare`).

---

## Known gaps (promote these over time)

- **B2 — `$derivedFiles` is hand-maintained.** The one manual sync point with no CI guard. Highest-value promotion.
- **A6 is intentionally manual.** The banner-linkable set is a *decision*, not a mirror; keep it a conscious edit, but the coupling to `ScrapedCategory` could get its own guard test.

---

## Change Log

- **2026-08-08** — Initial draft. Extracted the category touchpoint map from `spec-category-expansion.md` and the derived-fact chain from `valueRoute.ts` / `derive-facts-local.ps1`; codified the "fan-out > guard test > checklist" ranking.
