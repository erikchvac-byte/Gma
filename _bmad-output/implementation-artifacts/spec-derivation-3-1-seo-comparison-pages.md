---
title: 'SEO comparison pages — server-rendered cross-store price-disparity surface (derivation-3.1)'
type: 'feature'
created: '2026-07-10'
status: 'done'
baseline_commit: 'd5902f7'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-derivation-3-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 1's honest cross-store price-disparity facts (`disparities.json`, `disparity-rollups.json`) are served only on private JSON API routes — no public page, no structured data — so AI-search crawlers and Google can't discover, read, or cite them. The public-surfacing legal gate is now closed (ADR-066), yet `site:gmaslist.com` still indexes ~nothing beyond `/about`.

**Approach:** Add server-rendered comparison pages (one index + one page per product category) that render the shipped derived disparity facts as extractable HTML plus `Dataset` JSON-LD, mirroring the ADR-078 `/about` SSR pattern. Read-only over the committed derived artifacts via the existing fail-soft `readDerived` envelope machinery — no recompute, no new data.

## Boundaries & Constraints

**Always:**
- Publish COMPUTED RELATIONAL FACTS only (same-product cross-store price ranges/spreads), never a store's full menu. Every row is the same product across ≥2 stores (`matchKey` guarantees Gate 1).
- Mirror `aboutRoute.ts` (ADR-078) SSR conventions: build visible HTML and JSON-LD from the SAME constants so schema text matches page text (enforce with a test); escape `<`→`<` in `ld+json`, `& < >` in text nodes; emit canonical/`<title>`/`<meta description>`; register routes BEFORE the SPA fallback; `Cache-Control: public, max-age=3600`.
- `areaServed`/`spatialCoverage` = Washington only (WAC 314-55-155).
- Read derived facts ONLY through `readDerived` + `EMPTY_*` fallback (fail-soft): missing/malformed artifact → safe page, never a 500, never a raw-product / home-DB read.
- Stable-entity URLs only: index + per-category pages; category set fixed from `byCategory` at module load.
- Surface source accounting (coverage/`excluded` counts) on-page for Inspectability.

**Ask First:**
- Adding `sitemap.xml` / `robots.txt` / Open-Graph tags (SEO-plan Phase 1) — out of this slice; don't expand into it without a nod.
- Emitting any schema type beyond `Dataset` (e.g. `Product`/`Offer`/`AggregateOffer`/`LocalBusiness`) — the plan warns off commerce schema for cannabis; confirm first.

**Never:**
- No per-deal or per-product/`matchKey` URLs (they churn hourly/daily → thin, rotting pages).
- No banner/product-special discount % anywhere (Gate 2 — no signal); present cross-store price facts, not "how good a deal is."
- No potency dimension (Gate 5, non-goal). No health claims, no licensee ad creative. No change to `data.json`, the deals pipeline, `/api/data`, or existing types' behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Index page | GET `/compare`, rollups present | 200 HTML: intro + `byCategory` summary + per-category links + "most-often-cheapest stores" (`byStore.timesCheapest`) + `Dataset` JSON-LD; no `#root` shell | N/A |
| Category page | GET `/compare/vaporizers`, disparities present | 200 HTML: same-product rows (name, weight, `$low`–`$high` across N stores, cheapest vs priciest store) sorted by spread desc + category-scoped `Dataset` JSON-LD | N/A |
| Unknown category | GET `/compare/not-a-category` | 404 with minimal HTML — no junk indexable content | 404, not SPA fallback |
| Missing/malformed artifact | derived file absent or bad shape | `readDerived`→`EMPTY` envelope → page renders "No comparison data available right now"; 200 | never 500 |
| Empty category | category in set but 0 disparities today | 200 minimal page, honest empty state | N/A |

</frozen-after-approval>

## Code Map

- `server/routes/aboutRoute.ts` — the SSR + JSON-LD template to mirror (escaping, canonical, single-source-of-truth, 1h cache); also add a crawlable internal link to `/compare` here for discoverability (no sitemap this slice).
- `server/routes/valueRoute.ts` — reuse `readDerived`, `EMPTY_DISPARITIES_ENVELOPE`, `EMPTY_DISPARITY_ROLLUPS_ENVELOPE`, and the `DERIVED_DIR` paths (export/import as needed).
- `server/data/derived/disparities.json`, `disparity-rollups.json` — the facts rendered; envelope `{ data, excluded, coverage, generatedAt }`.
- `server/utils/disparityRollups.ts` — `DisparityRollupsReport` / `byCategory` / `byStore` types.
- `server/types/index.ts` — `Disparity` / `MatchReport` types.
- `server/index.ts` — register `/compare` + `/compare/:category` before the SPA fallback (unconditional, like `/about`).
- `client/vite.config.ts` — add `'/compare': 'http://localhost:3001'` to the dev proxy (mirrors the `/about` entry).

## Tasks & Acceptance

**Execution:**
- [x] `server/routes/compareRoute.ts` — NEW. Build the index + category page HTML and `Dataset` JSON-LD from the derived envelopes via `readDerived`; export `compareIndexRoute`, `compareCategoryRoute`, plus the shared content constants (dataset name/description) and the known-category set for tests. Title-case `dispensaryId`→display store name. Honesty: cross-store price facts only; surface coverage/`excluded` counts; no discount %, no potency, no full menu.
- [x] `server/index.ts` — register `app.get('/compare', ...)` and `app.get('/compare/:category', ...)` BEFORE the SPA fallback; unconditional (dev too).
- [x] `client/vite.config.ts` — add the `/compare` dev-proxy entry.
- [x] `server/routes/aboutRoute.ts` — add a crawlable internal link to `/compare`.
- [x] `server/routes/compareRoute.test.ts` — NEW. supertest the index + one category + unknown-category (404) + missing-artifact fail-soft; assert no `<div id="root">`, canonical/title/description present, `Dataset` JSON-LD parses, and its name/description match the visible on-page text (mirror `aboutRoute.test.ts` `visibleText`/`extractJsonLdBlocks`).

**Acceptance Criteria:**
- Given the shipped derived artifacts, when a crawler GETs `/compare` and `/compare/<category>`, then it receives server-rendered HTML containing the disparity facts (not the React shell) plus a valid `Dataset` JSON-LD whose name/description match the visible page text.
- Given a missing or malformed derived artifact, when any `/compare` page is requested, then it degrades to a safe page — no 500, no raw-data read.
- Given the honesty contract, then no page presents a banner discount %, a whole-catalog leaderboard, a potency figure, or any store's full menu; every comparison is the same product across ≥2 stores and cites the source coverage/`excluded` counts.
- Given an unknown category slug, then the server responds 404 (no thin indexable page).
- Given the build, then `tsc -b` + `vite build` + vitest pass and no existing type's behavior or the deals pipeline changes.

## Design Notes

- **Schema = `schema.org/Dataset`, NOT `Product`/`Offer`/`AggregateOffer`.** Epic 3 named "AggregateOffer/Dataset," but the SEO plan warns commerce schema is a Google-restricted cannabis category (real risk, little upside) that implies the aggregator sells / reproduces menus. `Dataset` frames the honest comparison facts as a published dataset (transform-not-copy). Reuse `gmaslist.com/#organization` as `creator`; `areaServed`/`spatialCoverage` = Washington; `dateModified` = envelope `generatedAt`; `isAccessibleForFree: true`; `variableMeasured` = lowest/highest price + cross-store spread.
- **Store names:** title-case the `dispensaryId` slug (`a-greener-today-lynnwood` → "A Greener Today Lynnwood") — self-contained, no `data.json` coupling.
- **Categories/slugs** come from `disparity-rollups.byCategory` at module load (stable, bounded URLs); category pages filter `disparities.data` by category, sort by spread desc.
- Example honest row: "Dabstract (1g vaporizer): $22.50 at A Greener Today Lynnwood to $70.00 at Western Bud Burlington across 4 stores." No "% off."

## Verification

**Commands:**
- `npm run build` — expected: client + server build clean (the real Render build: `tsc -b && vite build`).
- `npx vitest run server/routes/compareRoute.test.ts` — expected: all pass.

**Manual checks:**
- After `npm run dev`: `curl localhost:3001/compare` and `/compare/vaporizers` → HTML with the facts + a `Dataset` `ld+json` block, no `<div id="root">`; `curl localhost:3001/compare/nope` → 404.

## Suggested Review Order

**Route surface & registration**

- Public SSR routes registered before the SPA fallback — the design entry point.
  [`index.ts:55`](../../server/index.ts#L55)

- Request handlers: read derived facts fail-soft; category validated against the same `byCategory` the index links from (no dead links).
  [`compareRoute.ts:362`](../../server/routes/compareRoute.ts#L362)

**Honest fact rendering (load-bearing)**

- Category rows: tie → "at all N stores", real spread → price from the named store, top-100 cap.
  [`compareRoute.ts:298`](../../server/routes/compareRoute.ts#L298)

- Index: numeric exclusion accounting + category links + "stores most often cheapest".
  [`compareRoute.ts:173`](../../server/routes/compareRoute.ts#L173)

**Structured data & escaping**

- `Dataset` JSON-LD (not commerce schema), Washington-only, schema text = page text.
  [`compareRoute.ts:138`](../../server/routes/compareRoute.ts#L138)

- Attribute-safe escaping for data-derived meta content.
  [`compareRoute.ts:61`](../../server/routes/compareRoute.ts#L61)

**Discoverability & dev wiring**

- Crawlable internal link from `/about`.
  [`aboutRoute.ts:205`](../../server/routes/aboutRoute.ts#L205)

- Vite dev proxy so `/compare` hits Express in dev.
  [`vite.config.ts:22`](../../client/vite.config.ts#L22)

**Tests**

- SSR + JSON-LD match, fail-soft, 404, no-discount-%, tie vs spread rendering.
  [`compareRoute.test.ts:1`](../../server/routes/compareRoute.test.ts#L1)
