# Story: Weedmaps Source Wiring (AI-search Phase 2 — second source feeding the matcher)

Status: in-review
baseline_commit: 6dea4a4def383d3d7cd49881b08105f7b95ac2ec

<!-- Decisions confirmed by Erik 2026-06-29 (bmad-quick-dev): Q1 reuse existing ids for the 3
overlaps · Q2 12 slugs shallow (3 launch categories) · Q3 build scrape-weedmaps.yml but leave
the schedule DISABLED (re-probe runner IP first) · Q4 conservative brand-from-slug (null when
unsure). PLUS two build-shaping resolutions surfaced in dev: (A) the AC5/AC8 conflict —
net-new Weedmaps stores live in a SEPARATE PRIVATE registry (server/scrapers/weedmaps-stores.ts)
with their own WA-guard, NOT in the public data.json/api/data (honors AC8 + the private-only
posture); (B) One Hit Wonder DROPPED from v1 — its slug labeled "Bellingham" actually resolves
to Port Townsend/Silverdale and is unconfirmed, so 8 net-new stores ship, not 9 (omit-don't-guess). -->


<!-- Cross-cutting follow-up story (no parent epic), tracked individually like cross-store-value-matcher. Sourced from the AI-search/proprietary-data synthesis plan, not epics.md. -->

## Story

As the GmaS data platform,
I want **Weedmaps** wired as a second product source — a static, throttled fetch that normalizes each store's menu into the existing `ProductRecord` shape and appends it to `products.json`,
so that the cross-store value matcher (A1, ADR-062/063) compares the **same SKU across two independent sources** (Dutchie + Weedmaps), adding per-gram-priced stores it has never seen and turning single-source disparities into cross-verified ones.

## Context & Source of Truth

**Full plan:** `investigations/ai-search-data-strategy-investigation.md` — this is **Phase 2** (line 123: "Wire Weedmaps as TYPE 3 `weedmaps-static-json`. Static axios path (no Playwright), `__NEXT_DATA__` extract, throttled. Feeds A1/B2.").

**Gate — CLEARED 2026-06-29:** `investigations/weedmaps-scaled-crawl-gate-result.md`. The plan's prerequisite scaled-crawl/rate-limit test passed (23/23 requests served real menu JSON, zero PerimeterX/DataDome/captcha challenges, no 429/403, even under a 1s-apart burst). Weedmaps is technically GO as a private source. **Carry the gate's caveats:** crawl shallowly + throttled + nightly; full-traversal volume is not proven; re-probe from the CI/datacenter IP before trusting a production cron.

**Source profile:** `investigations/weedmaps-source-data-inventory.md` — confirmed field map of one `menuItems[]` object. **Store slugs:** `unverifyed-dispensary-findings.md` (12 verified WA scrapeable stores).

### Why this is private-only (stays on the safe side of the legal line)
Like the matcher, this story produces a **private dataset only** — Weedmaps data lands in `products.json` and feeds the private `/api/value/disparities`. No public surfacing, no redistribution of raw menus. Public SSR pages remain **Phase 4**, gated on WSLCB/counsel review. This story is engineering-only and does not touch the legal gates.

### Out of scope (do NOT build here)
- Phase 3 accrual scheduling, Phase 4 public SSR / schema.org, Phase 5 monetization.
- Full exhaustive pagination of every Weedmaps catalog (gate caveat: shallow crawl suffices — the matcher needs list price per SKU, not the whole 1,500-product menu).
- THC/CBD/terpene capture (sparse-to-absent per inventory), ratings, deal-window timing capture.
- Any change to the Dutchie deals OR Dutchie products pipeline, `Deal`, `filterActiveDeals`, `/api/data`, or the matcher itself (it must pick up Weedmaps with **zero** code change — that is the proof of correct wiring).

## Acceptance Criteria

1. **Static Weedmaps fetcher.** A new module (`server/scrapers/_weedmaps.ts`) fetches `https://weedmaps.com/dispensaries/<slug>` (+ a shallow set of category subpages) via plain HTTP GET (axios/`fetch`, desktop UA, follow redirects) — **no Playwright, no `scraper-svc`**. It extracts `<script id="__NEXT_DATA__">` → JSON → `props.dehydratedState.queries[].state.data.data.menuItems[]`. Defensive at every hop: a drift/miss degrades to fewer products or `[]`, never throws (mirrors `scrapeDutchieProducts`).
2. **menuItems → RawProduct mapping.** Each `menuItems[]` object maps to the existing `RawProduct` shape so it flows through the **unchanged** `normalizeProduct`:
   - `name` ← `name`; `category` ← normalized from `edgeCategory`/`ancestors` (see AC3); `strainType` ← `category.name`/`geneticsTag` (Indica/Sativa/Hybrid).
   - `brand` ← recovered from `slug` when JSON `brand` is null (slug carries brand prefix); null when unrecoverable.
   - `options` ← every weight tier in `prices.<unit>[]` → `{ option: label, basePrice: originalPrice ?? price, specialPrice: onSale ? price : null, quantityAvailable: null }` (Weedmaps exposes no reliable per-tier stock; null = unknown, which the matcher's Gate 4 keeps).
   - `weightField`/`netWeightMg` ← from `price.complianceNetMg` where present (validation signal only).
   - `special` ← any tier `onSale === true`.
3. **Category-vocabulary reconciliation (load-bearing for cross-source matching).** Weedmaps `edgeCategory` values are normalized to the **same category vocabulary** the Dutchie products use (`Pre-Rolls` / `Flower` / `Vaporizers`, per `DEFAULT_PRODUCT_CATEGORIES`). Without this the match key's `category` component never aligns across sources and no cross-source disparity ever forms. Products outside that vocabulary are dropped (launch scope), matching the Dutchie product scraper. A test asserts a Weedmaps Flower item and a Dutchie Flower item of the same brand/strain/weight produce the **same** `deriveMatchKey`.
4. **Store identity / cross-source reconciliation.** Each Weedmaps store is registered under a `dispensaryId`. Where a Weedmaps store is the **same physical store** as an existing `products.json`/registry store (e.g. `2020-solutions-pacific-highway`, `2020-solutions-north-bellingham`), it MUST reuse that existing `dispensaryId` so the matcher treats the two sources as one store (B2 reconciliation, cheapest offer wins) — **never** as two stores (which would emit a false self-disparity). Net-new Weedmaps stores get new ids. A test asserts the overlap stores reuse existing ids and no disparity is emitted whose `storesCarrying` are two sources of the same physical store.
5. **Store registry + coords.** Net-new Weedmaps stores added to the dispensary registry carry finite WA `lat`/`lng` (geocoded via the existing dev-time OSM-Nominatim script, ADR-044) so the `storeRegistry.test.ts` CI guard stays green (every seed store WA-coorded, unique id, in-bounds). No orphan stores.
6. **Throttled crawl orchestration.** A run script (extending `scrapeProductsRun` or a sibling) crawls the registered Weedmaps stores with an inter-request delay (≥2s, jittered) and a shallow category set, appends observations via the **existing** `persistProductObservations` (one serialized read-modify-write), and is fail-soft per store. Respects the gate: shallow + throttled + intended for nightly cadence.
7. **Matcher picks it up with zero change.** After a Weedmaps run appends to `products.json`, `GET /api/value/disparities` includes Weedmaps stores and net-new cross-store/cross-source disparities — with **no edit** to `crossStoreValue.ts` / `productMatchKey.ts`. (Proven by an integration test that builds a `ProductsFile` containing both a Dutchie-shaped and a Weedmaps-shaped record for the same SKU and asserts one reconciled disparity.)
8. **Decoupling + honesty preserved.** Additive only: no change to `Deal`, `filterActiveDeals`, `/api/data`, `_dutchie.ts`, `_dutchieProducts.ts`, `normalizeProduct.ts` logic (Weedmaps conforms to `RawProduct`, it does not bend the normalizer), or the matcher. Weedmaps products are subject to the **same** honesty flags (`weight-mismatch`/`unparseable-*`) and the matcher's Gates 1–4. Full server suite stays green; `npm run build` (client+server) clean.
9. **Tests.** Unit tests for `__NEXT_DATA__` extraction (incl. a captured real fixture + a challenge-page/empty-blob degradation case), the menuItems→RawProduct mapping (tiers, brand-from-slug, category normalization, onSale special), the cross-source match-key equality (AC3) and same-store reconciliation (AC4), and the matcher integration (AC7). Per the TypeScript-strict + test-everything rule.

## Tasks / Subtasks

- [x] **Task 1 — Weedmaps static fetcher + extractor** (AC: 1)
  - [x] `server/scrapers/_weedmaps.ts`: `fetchWeedmapsMenu(slug, opts)` → `RawProduct[]`. Plain GET, desktop UA, follow redirects, injectable getFn + throttle hook, fetches landing + shallow category subpages, dedupes across pages, never throws.
  - [x] `__NEXT_DATA__` regex extract + JSON walk to `…menuItems`; degrade to `[]` on missing/blocked/unparseable. Co-located test with a real captured fixture (`__fixtures__/weedmaps-western-bud.json`) + challenge/empty/unparseable cases.
- [x] **Task 2 — menuItems → RawProduct mapping** (AC: 2, 3)
  - [x] `transformWeedmapsProducts(menuItems): RawProduct[]` — tiers→options, conservative `brandFromSlug`, onSale→specialPrice, complianceNetMg→netWeightMg signal, `| Sub-Category` suffix stripped to the strain.
  - [x] `normalizeCategory` mapping `edgeCategory`/`ancestors` → `DEFAULT_PRODUCT_CATEGORIES`; drop out-of-vocab. Test: cross-source `deriveMatchKey` equality for the same SKU (OG Chem).
- [x] **Task 3 — Store registry, identity overlap, coords** (AC: 4, 5)
  - [x] `server/scrapers/weedmaps-stores.ts` PRIVATE roster (slug → dispensaryId), reusing existing ids for the 3 overlaps; 8 net-new ids (One Hit Wonder dropped).
  - [x] Geocoded 8 net-new stores via OSM-Nominatim (sourced+cited addresses, WA-bounds verified); coords committed in the private registry (NOT data.json). New CI guard `weedmaps-stores.test.ts`. Test: overlap reuse + no same-store self-disparity.
- [x] **Task 4 — Throttled crawl run + registry** (AC: 6)
  - [x] `weedmapsProductScrapers` registry (`Record<string, () => Promise<RawProduct[]>>`) parallel to `dutchieProductScrapers`.
  - [x] Sibling `server/scripts/scrapeWeedmapsRun.ts` (≥2s jittered throttle between stores, injectable sleep/rng); append via existing `persistProductObservations`; fail-soft per store. CLI + test.
- [x] **Task 5 — Matcher integration proof + decoupling regression** (AC: 7, 8, 9)
  - [x] `server/integration/weedmapsMatcher.test.ts`: Dutchie-shaped + Weedmaps-shaped record for the same SKU → exactly one reconciled disparity; overlap store reconciles cheapest source, no self-disparity.
  - [x] Full server suite (357 passed) + `npm run build` (client+server) clean. Deals path, Dutchie products path, and matcher unchanged (zero edit to `_dutchie*`, `normalizeProduct`, `crossStoreValue`, `productMatchKey`).
- [x] **Task 6 — CI cadence (decision-gated, see Open Q3)** (AC: 6)
  - [x] New `.github/workflows/scrape-weedmaps.yml` (no Python/Playwright). Commit-back products.json like the existing product cron. **Schedule DISABLED (commented) per Erik** — `workflow_dispatch` only; re-probe runner IP before enabling (gate caveat #4).

## Dev Notes

### The wiring in one sentence
Weedmaps `menuItems[]` → `RawProduct` (Task 2) → existing `normalizeProduct(raw, dispensaryId, now)` → existing `persistProductObservations` → `products.json` → existing matcher. The only genuinely new code is the **fetch + map + registry**; everything downstream is reused unchanged. That reuse IS the architecture (mirror how `_dutchieProducts.ts` feeds `scrapeProductsRun.ts`).

### Read before implementing
- **`server/scrapers/_dutchieProducts.ts`** — the closest analogue: `transformProducts(intercepted) → RawProduct[]`, retry-on-empty, defensive `num()`, drops out-of-vocab categories via `DEFAULT_PRODUCT_CATEGORIES`. Mirror its shape (but fetch is static, not via the Python service).
- **`server/scrapers/dutchie-stores.ts`** — the `dutchieProductScrapers` registry pattern + the id-vs-cName split (relevant: Weedmaps slug ≠ dispensaryId, same as cName ≠ id).
- **`server/scripts/scrapeProductsRun.ts`** — the orchestrator to extend/mirror: iterate stores → scrape → `normalizeProduct` → append. It already takes an injectable `registry`.
- **`server/utils/normalizeProduct.ts`** — DO NOT modify. Weedmaps must conform to `RawProduct`; the normalizer sets the same `flags` and computes the same unit economics. (If a Weedmaps quirk genuinely can't map, flag it in Completion Notes, don't bend the normalizer.)
- **`server/scrapers/remedy-tulalip.ts`** — the existing `static-html` axios pattern (closest fetch analogue; deals, but same HTTP discipline).
- **`server/scrapers/storeRegistry.test.ts`** — the CI guard net-new stores must satisfy (finite lat/lng in WA bounds, unique id, non-orphan).
- **`server/utils/crossStoreValue.ts` / `productMatchKey.ts`** — the consumer. Do NOT change. `deriveMatchKey` uses `brand|strainToken|strainType|category`; for cross-source matches to form, Weedmaps `brand`/`category`/`strainType` must normalize into the same space (AC3). Gate 4 (ADR-063) keeps `quantityAvailable: null` offers, so Weedmaps' null-stock tiers participate.

### Gate caveats to honor (from the cleared scaled-crawl test)
1. Crawl **shallow** (landing + Flower/Vaporizers/Pre-Rolls only), not the full 1,500-product catalog. 2. Throttle ≥2s jittered, nightly cadence. 3. Category slugs need live mapping (`pre-rolls`→`pre-roll` redirect; `vaporizers` 404'd). 4. Re-probe from the GH-Actions/Render IP before enabling the cron — datacenter IPs may be treated differently than the residential IP that passed the gate.

### Project Structure Notes
New files under `server/scrapers/` (+ `__fixtures__/`), `server/scripts/`, `.github/workflows/`. TypeScript strict, `.js` ESM import extensions, co-located `*.test.ts` (vitest). Additive/decoupled per ADR-043/053.

### References
- [Source: investigations/ai-search-data-strategy-investigation.md] — Phase 2 definition (line 123), B2 cross-source reconciliation (line 62)
- [Source: investigations/weedmaps-scaled-crawl-gate-result.md] — gate cleared + caveats
- [Source: investigations/weedmaps-source-data-inventory.md] — field map, JSON path, captured sample
- [Source: unverifyed-dispensary-findings.md] — 12 WA store slugs + overlap notes
- [Source: server/scrapers/_dutchieProducts.ts] — transform/retry pattern to mirror
- [Source: server/scripts/scrapeProductsRun.ts] — orchestrator to extend
- [Source: ADR-062 / ADR-063] — the matcher this feeds (do not modify)

## Open Questions (for Erik — decisions that change the build; defaults chosen but flag-worthy)
1. **Store-identity overlap (AC4).** Several Weedmaps stores overlap existing data.json stores (2020 Solutions ×2; Remedy already scraped via Dutchie). *Default:* reuse the existing `dispensaryId` for overlaps (→ cross-source reconciliation, not a self-disparity); add only the net-new Weedmaps stores as new ids. Confirm this is the intended behavior.
2. **v1 crawl scope.** *Default:* the 12 gate-verified WA slugs, shallow (3 launch categories). Wider roster / deeper pagination deferred.
3. **Where the cron runs (AC6 / Task 6).** *Default:* a new lightweight `scrape-weedmaps.yml` (no Python/Playwright needed since the fetch is static) on a nightly schedule, separate from `scrape-products.yml`. Alternative: fold into the existing product cron. Either way, re-probe the runner IP before enabling.
4. **Brand-from-slug fuzziness.** Slug-derived brand is the least certain field. *Default:* conservative — only set brand when confidently recoverable, else null (the matcher's name-token still keys it; under-matching is the safe bias, consistent with ADR-062).

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (bmad-quick-dev), 2026-06-29.

### Debug Log References
- Scaled-crawl gate test 2026-06-29: 23/23 OK, 0 challenges (see weedmaps-scaled-crawl-gate-result.md).
- Net-new geocode 2026-06-29: 8/8 addresses resolved inside WA bounds via Nominatim (scratchpad one-off).
- Server suite after build: 34 files / 357 tests passed. Server `tsc` + client `vite build` clean.

### Completion Notes List
- **Zero matcher change (the wiring proof).** `crossStoreValue.ts`, `productMatchKey.ts`,
  `normalizeProduct.ts`, `_dutchie*.ts`, `scrapeProductsRun.ts` were NOT touched. Weedmaps conforms
  to `RawProduct` and flows through the unchanged normalize → persist → matcher. The integration
  test builds a real ProductsFile and proves a single reconciled cross-source disparity forms.
- **Name suffix fix.** Weedmaps names are `Strain | Sub-Category`; the after-pipe token was stripped
  in mapping, else `big buds`-type tokens would poison the strain signature and block every
  cross-source match. (Not in the original AC list — a real correctness fix, flagged here.)
- **strainType is the cross-source brittleness.** Weedmaps' own `category` (strain type) can disagree
  with Dutchie's (the captured Golden Pineapple even has category=Indica, geneticsTag=Sativa). Since
  the matcher key includes strainType and must NOT change, disagreements UNDER-match (safe bias,
  ADR-062). Accepted, not worked around.
- **Private registry, not data.json (AC5/AC8 resolution).** Net-new stores live in
  `weedmaps-stores.ts` with committed WA coords + a parallel CI guard. Public `/api/data` untouched.
- **One Hit Wonder dropped** (slug→store unconfirmed: "Bellingham" label vs actual Port Townsend/
  Silverdale). 8 net-new + 3 overlap stores shipped.
- **Northwind coord is approximate** — exact street unconfirmed in sourcing; Nominatim resolved the
  Anacortes/Swinomish area (in WA bounds). Flagged in the registry comment.
- **Workflow schedule left DISABLED** per Erik; needs a `workflow_dispatch` runner-IP re-probe before
  the nightly cron is enabled (datacenter IP ≠ the residential IP that passed the gate).

### File List
**New (code):**
- `server/scrapers/_weedmaps.ts` — static fetcher + `__NEXT_DATA__` extractor + `transformWeedmapsProducts` + `normalizeCategory` + `brandFromSlug`
- `server/scrapers/weedmaps-stores.ts` — private store roster + `weedmapsProductScrapers` registry
- `server/scripts/scrapeWeedmapsRun.ts` — throttled commit-back run + CLI
**New (tests/fixtures):**
- `server/scrapers/_weedmaps.test.ts` (26), `server/scrapers/weedmaps-stores.test.ts` (7)
- `server/scripts/scrapeWeedmapsRun.test.ts` (5), `server/integration/weedmapsMatcher.test.ts` (3)
- `server/scrapers/__fixtures__/weedmaps-western-bud.json` (captured + confirmed cross-store items)
**New (CI):**
- `.github/workflows/scrape-weedmaps.yml` (schedule disabled)
**Unchanged (verified):** `_dutchie.ts`, `_dutchieProducts.ts`, `normalizeProduct.ts`, `productMatchKey.ts`, `crossStoreValue.ts`, `productsStore.ts`, `scrapeProductsRun.ts`, `data.json`.

## Change Log
- 2026-06-29 — Story drafted (AI-search Phase 2). Scaled-crawl gate cleared first; story scoped to static Weedmaps fetch → RawProduct → existing normalize/persist → existing matcher (zero matcher change). Private dataset only; public surfacing remains Phase 4. Status: draft, pending Erik's go-ahead on the 4 Open Questions before dev.
- 2026-06-29 — Implemented (bmad-quick-dev, opus-4-8). 4 defaults + 2 dev-surfaced resolutions confirmed (private registry; One Hit Wonder dropped). All 6 tasks complete; 41 new tests; server suite 357 green; client+server build clean. Matcher/deals/Dutchie-products pipelines verified untouched. Status: in-review (awaiting Erik's review; not committed/pushed — on branch feat/weedmaps-source-wiring).
