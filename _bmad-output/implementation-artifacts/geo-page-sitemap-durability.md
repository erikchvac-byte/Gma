---
baseline_commit: 53b9c73678c060c301c5568e12205a284454cb54
---

# Story: Geo-page sitemap/URL durability (decouple citable URL existence from request-time freshness)

Status: review

<!-- Built 2026-07-31 (bmad-dev-story). Erik gave go-ahead; both DEV-START rulings ratified (A=b keep rows+caveat, B=test-only guard). Shipped as ADR-111. -->
<!-- NEXT: code-review (recommend a different LLM), then push/deploy (Erik's standing go-ahead). -->
<!-- ORIGINAL: NEEDS Erik go-ahead to BUILD — create-story only planned it. Confirm the two DEV-START rulings below before implementing. -->

## Story

As the operator of gmaslist.com trying to earn AI-search citations and organic crawl,
I want the geo comparison URLs (`/compare/<region>` and `/compare/<category>/<region>`) to stay present in the sitemap and return 200 even when a cluster's stores are momentarily stale,
so that a crawler that discovers or is about to rank one of my richest answer pages never hits a 404 that vanished on the next ingest cycle — the page's *existence* is stable, and only its *rendered content* reflects freshness.

## Context & Root Cause (from investigation)

Full diagnosis: `_bmad-output/implementation-artifacts/investigations/geo-page-volatility-investigation.md` (High confidence, root cause Confirmed).

- The derived price-floor data is **stable** — 7 consecutive daily derives, every eligible cluster always carries all 4 categories with hundreds of floors. [Source: investigation Finding 1]
- The **live sitemap** re-projects that stable data against a **request-time freshness overlay**: `readRegions()` joins per-store `status` computed by `deriveStoreStatus(lastFetchedAt, now)` with a **3-hour** window. [Source: `server/routes/compareRoute.ts:428-451`, `server/utils/buildApiData.ts:22-25`, `server/utils/storeStatus.ts:11,28-29`]
- The ADR-107 staleness guard in `buildRegions` narrows each floor's holders to non-dead stores and **drops any floor whose holders are all stale/failed**; `region.categories` is then built only from surviving floors. When every floor of a category in a cluster is all-stale-held, the category disappears → the `/compare/<cat>/<region>` URL drops from the sitemap AND **404s** at the route. [Source: `server/utils/regionModel.ts:139-161`, `server/routes/sitemapRoute.ts:156-170`, `server/routes/compareRoute.ts:722-726`]
- Net effect: the richest citable pages "wink in and out" on hourly ingest jitter (observed 19→14 `/compare/*` on the 2026-07-30 19:23 redeploy; recovered to full 19 by the next pull). Correct-by-design honesty, but zero hysteresis on a slow-moving SEO surface. [Source: investigation Deduction 1 / parent `discovery-crawl-bottleneck-investigation.md` Finding 12]

**The fix is a durability decoupling, NOT a change to the price derivation and NOT a change to the in-app honesty gates.** The stable committed floor structure governs whether a URL *exists*; the freshness overlay governs only what *rows/copy* the page shows.

## Acceptance Criteria

1. **URL existence is driven by the committed floor structure, not freshness.** `/compare/<region>` and `/compare/<category>/<region>` are emitted in `sitemap.xml` and return **200** for every (region, category) present in the committed `regional-price-floor.json`, regardless of any store's `ok/stale/failed` status at request time. A category that has ≥1 committed floor in a cluster never 404s solely because its holders went stale.

2. **Structural absence still 404s.** A category with **zero** committed floors in a cluster (genuinely not carried there) is still absent from the sitemap and still 404s. The change removes only the *freshness-driven* drop, not the *structural* one.

3. **In-body honesty is preserved.** On a `/compare/<category>/<region>` page whose rows are all currently stale, the page renders honestly per the DEV-START ruling (see below) — either the existing empty-state copy (`compareRoute.ts:620-623`) or last-known rows carrying an explicit "as of <date>" / freshness caveat. No stale price is presented as a currently-verified low without a caveat. The staleness guard's holder-narrowing on rendered rows is retained.

4. **Sitemap ↔ route agreement invariant holds.** Every `/compare/*` URL the sitemap emits resolves 200 (no emitted URL 404s), and no 200 geo page is missing from the sitemap — asserted by test over a fixture where some stores are stale. [preserves the `sitemapRoute.ts` "an index link and a sitemap entry can never disagree" discipline]

5. **Slug-stability guard for the latent dominant-city-flip risk (Hyp 1).** A CI test (mirroring the `storeRegistry.test.ts` guard pattern) asserts the region **slug set** derived from committed membership matches a committed snapshot; a drift (e.g. a re-cluster flipping a cluster's modal city, renaming the whole region family) **fails loudly** so a human ratifies and adds a redirect/alias rather than silently 404ing an indexed URL family. No live redirect machinery is required in this story — the guard is the deliverable; the redirect is a documented follow-up triggered only on a real flip. [Source: investigation Hyp 1 resolution — latent-low, slug is a function of committed membership only]

6. **No duplication of the oracle-freshness gate.** This story touches only the geo *surface* (sitemap emission + region route URL existence + render copy). It must not add or alter any `buildMatchReport`/`crossStoreValue` freshness gate — that is the shipped engine-wide Gate 6 (`oracle-freshness-gate`, ADR-096). The in-app "Real price drops" and disparity facts are untouched.

7. **No regression.** `/compare`, `/compare/<category>` (disparity), `/store/*`, `/about`, `robots.txt`, `llms.txt`, and the SPA fallback are unchanged. Full server + client suites and a real `npm run build` are green.

## Tasks / Subtasks

- [x] **Task 0 — DEV-START rulings (RATIFIED by Erik 2026-07-31):**
  - [x] Ruling A (AC3 render posture) = **(b) keep last-known rows + caveat.** When a region-category page's rows are all currently stale, render the last-known floor rows with an explicit "Prices last observed as of <date>; freshness currently unverified" line (reuse `asOf`/`asOfPhrase` plumbing). Do NOT fall to the empty-state for the all-stale case (the empty-state remains only for a genuinely empty committed set). Page keeps content for citations while staying honest.
  - [x] Ruling B (AC5) = **failing CI test only** — no live 301/alias until a real dominant-city flip occurs; the guard test + a documented follow-up in `deferred-work.md` is the deliverable.
- [x] **Task 1 — Decouple category-set from the staleness guard (AC1, AC2)** in `server/utils/regionModel.ts`:
  - [x] `region.categories` now derives from the committed floors (the guard no longer drops all-dark floors), so a committed category always yields a URL. Added `RegionalFloor.stale?` (in `regionalPriceFloor.ts`).
  - [x] Staleness guard retained on `region.floors` for rendering: holder-narrowing when a fresh holder remains; all-dark floor kept and marked `stale: true` (Ruling A(b)).
  - [x] `MIN_REGION_STORES`, dominant-city naming, slug-collision handling, shape-guards unchanged.
- [x] **Task 2 — Route + render honesty (AC1, AC3)** in `server/routes/compareRoute.ts`:
  - [x] `compareCategoryRegionRoute` existence check passes for any committed category → 200. `renderRegionCategoryHtml`: per-row "— freshness unverified" marker on stale rows + all-stale page caveat ("Prices last observed as of <date>; freshness currently unverified"). Empty-state now only for a genuinely empty committed category.
  - [x] `renderRegionIndexHtml` (hub): mirrors the all-stale region caveat; hub survives stale clusters (locked by tests).
- [x] **Task 3 — Sitemap (AC1, AC4)** in `server/routes/sitemapRoute.ts`:
  - [x] `readRegionPaths()` iterates the now-stable `region.categories`; no code change needed. Verified no other status-coupling in the geo path. Added a live-data geo-URL-emission test.
- [x] **Task 4 — Slug-stability guard (AC5):** added `server/routes/regionSlugStability.test.ts` (pins bellingham/everett/mount-vernon via `readRegions()`); documented the on-drift redirect follow-up in `deferred-work.md`.
- [x] **Task 5 — Tests (AC4, AC7):** stale fixtures in `regionModel.test.ts` (all-dark kept+stale, categories freshness-invariant) + `compareRegionRoute.test.ts` (all-stale rows+caveat, mixed-page single marker) + `sitemapRoute.test.ts` (geo URLs emitted). Server suite 858/858 green; client + server real builds clean.
- [x] **Task 6 — ADR:** ADR-111 added (cites it does not touch Gate 6 / ADR-096) + Change Log; investigation case file status updated + follow-up appended.

## Dev Notes

- **Precise mechanism to change:** the single coupling point is that `region.categories` (and therefore both the sitemap entry via `readRegionPaths` and the route's 404 check) is computed from the **post-staleness-guard** floor set (`regionModel.ts:157-161`). Break exactly that: category-set from committed floors; row-rendering from freshness-filtered floors. Everything else about ADR-107 stays.
- **The empty-state already exists** at `compareRoute.ts:620-623` — Ruling A(a) is nearly free. A(b) (caveat with last-known rows) is the SEO-preferred path and reuses the existing `asOf`/`asOfPhrase` plumbing (`compareRoute.ts:461-471,636`).
- **Do NOT change** `storeStatus.ts` thresholds, `deriveStoreStatus`, `buildMatchReport`, `crossStoreValue.ts`, `regionalPriceFloor.ts` (the derivation), or any `/api/value/*` route. Widening the 3h window was considered and rejected in the investigation as the weaker fix — decoupling is the chosen mechanism.
- **Honesty invariant:** a floor is a per-product same-weight min within a ≥2-store cell (Gate 1, inherited). The page must never claim a *currently-verified* low from a store whose latest ingest is stale without a caveat — that constraint is why the render path keeps the freshness filter even as URL existence is decoupled.
- **Fail-soft posture** (unchanged): a missing/malformed `regional-price-floor.json` still degrades to no geo URLs, never a throw (`compareRoute.ts:437-445`, `sitemapRoute.ts:156-170`).

### Project Structure Notes

- Files to touch: `server/utils/regionModel.ts` (UPDATE — category-set decoupling), `server/routes/compareRoute.ts` (UPDATE — render honesty), `server/routes/sitemapRoute.ts` (verify only, likely no change once `region.categories` is stable), plus tests: `server/utils/regionModel.test.ts`, `server/routes/sitemapRoute.test.ts`, `server/routes/compareRegionRoute.test.ts`. New: a slug-stability CI test. `ADR.md` + investigation case file + `deferred-work.md` doc updates.
- Server is **read-only at runtime** (ADR-034/077) — reads committed derived JSON, never the home DB. This story keeps that posture; no derive/ingest change.
- Cadence note: the daily value derive (04:00) and the hourly deals ingest are on different clocks; the geo surface was gated by the faster one. This fix moves URL existence onto the slower, stable committed artifact. [Source: investigation Side Findings]

### References

- [Source: _bmad-output/implementation-artifacts/investigations/geo-page-volatility-investigation.md — Findings 1-3, Deduction 1, Hyp 1 resolution, Fix direction option 2]
- [Source: _bmad-output/implementation-artifacts/investigations/discovery-crawl-bottleneck-investigation.md — Finding 12 / Backlog #6 (parent)]
- [Source: server/utils/regionModel.ts:139-161 — the staleness guard + category-set build]
- [Source: server/routes/compareRoute.ts:428-451, 616-655, 716-732 — readRegions, region-category render, route 404]
- [Source: server/routes/sitemapRoute.ts:156-170 — readRegionPaths geo emission]
- [Source: server/utils/storeStatus.ts:11,21-30 + buildApiData.ts:22-25 — the request-time freshness overlay]
- [Source: ADR-096 / oracle-freshness-gate — the engine-wide Gate 6 this story must NOT duplicate]
- [Source: ADR-107 — the geo-page model + the staleness guard being refined here]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story), 2026-07-31

### Debug Log References

- Full server suite: 858/858 green (`npx vitest run` in `server/`).
- Real builds: `npm run build --prefix client` (tsc + vite) clean; `npm run build --prefix server` (tsc + copyData) clean.
- Live evidence at implementation time: `curl https://gmaslist.com/sitemap.xml` = full 19 `/compare/*`; `regionSlugStability.test.ts` confirms committed data → bellingham/everett/mount-vernon.

### Completion Notes List

- Root cause (per investigation) was a single coupling point: `region.categories` (which drives both the sitemap entry and the route's 404 check) was built from the POST-staleness-guard floor set. Fix = the guard no longer drops all-dark floors; it marks them `stale`. Categories therefore become a pure function of the stable committed floors → URL existence is freshness-invariant (AC1), while structural absence still yields no category → 404 (AC2).
- Honesty preserved (AC3, Ruling A(b)): a stale row shows its last-known price with a "— freshness unverified" marker; an all-stale page/region adds a page-level "Prices last observed as of <date>; freshness currently unverified" caveat. Holder-narrowing (a fresh store still vouches for a tie) is unchanged. The empty state now fires ONLY for a genuinely empty committed category.
- Did NOT touch the derivation, `storeStatus.ts` thresholds, `buildMatchReport`/`crossStoreValue` (Gate 6 / ADR-096), or any `/api/value/*` route (AC6). Server stays read-only.
- Slug-flip (Hyp 1) is guarded by a failing CI snapshot test; live 301/alias deferred (`deferred-work.md`) — not built now per Ruling B.
- No new dependencies. Additive optional field `RegionalFloor.stale?` — the derive leaves it undefined; only the region projection sets it.

### File List

- `server/utils/regionalPriceFloor.ts` (M) — added optional `stale?: boolean` to `RegionalFloor`.
- `server/utils/regionModel.ts` (M) — staleness guard no longer drops all-dark floors; marks them `stale`; categories now freshness-invariant.
- `server/routes/compareRoute.ts` (M) — `renderRegionCategoryHtml` + `renderRegionIndexHtml` render per-row + page-level freshness caveats.
- `server/utils/regionModel.test.ts` (M) — updated 2 tests to new semantics; added stale-flag + freshness-invariant assertions.
- `server/routes/compareRegionRoute.test.ts` (M) — `floor()` helper carries `stale`; added all-stale + mixed-page render tests.
- `server/routes/sitemapRoute.test.ts` (M) — added geo-URL-emission-from-committed-data durability test.
- `server/routes/regionSlugStability.test.ts` (A) — new slug-stability CI guard.
- `ADR.md` (M) — ADR-111 + Change Log entry.
- `_bmad-output/implementation-artifacts/deferred-work.md` (M) — slug-flip redirect follow-up.
- `_bmad-output/implementation-artifacts/investigations/geo-page-volatility-investigation.md` (M) — status + fix follow-up.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M) — story status.

## Change Log

| 2026-07-31 | Implemented (bmad-dev-story, ADR-111). Decoupled geo `/compare/*` URL/sitemap existence from the request-time freshness overlay: the ADR-107 staleness guard now marks all-dark floors `stale` instead of dropping them, so region categories are freshness-invariant; render keeps last-known rows with a "freshness unverified" caveat (Ruling A(b)). Added slug-stability CI guard. 858/858 server tests green; client + server builds clean. Status → review. |
