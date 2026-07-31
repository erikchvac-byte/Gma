# Investigation: Geo-page volatility (why /compare/<cat>/<region> pages wink in and out)

## Hand-off Brief

1. **What happened.** On the 2026-07-30 19:23 seed-refresh redeploy the live sitemap's `/compare/*` set fell 19→14 ("5 geo pages dropped"); by the next pull it had recovered to the full 19 — the drop was **transient**, not a permanent thinning.
2. **Where the case stands.** Root cause **Confirmed**: the derived price-floor data is stable (7 consecutive daily derives, always 4 clusters each carrying all 4 categories with hundreds of floors); the volatility is injected at *request time* by the freshness-status JOIN in `readRegions`/`buildRegions`, which drops a geo page when every floor of that category in the cluster is held only by stores whose last ingest is >3h old.
3. **What's needed next.** Decide durability policy for the SEO surface — the correct fix is **hysteresis / grace on the sitemap+route freshness gate** (don't 404 a citable geo URL on a single stale ingest cycle), not a change to the derivation. See Fix direction.

## Case Info

| Field            | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Ticket           | N/A (spun out of `discovery-crawl-bottleneck-investigation.md` Backlog #6, Finding 12) |
| Date opened      | 2026-07-30                                                                  |
| Status           | Concluded → FIXED 2026-07-31 (ADR-111, story `geo-page-sitemap-durability`, in review) |
| System           | gmaslist.com (Render starter, Express SSR + React SPA); server reads committed derived JSON, read-only |
| Evidence sources | `server/routes/sitemapRoute.ts`, `compareRoute.ts`, `server/utils/regionModel.ts`, `regionalPriceFloor.ts`, `buildApiData.ts`, `storeStatus.ts`; git history of `server/data/derived/regional-price-floor.json`; live `curl` of `/sitemap.xml` |

## Problem Statement

Operator framing: "why did 5 geo pages drop; is the derived data unstable, or correctly reflecting thinner data?" Origin: `discovery-crawl-bottleneck-investigation.md` Finding 12 observed the live sitemap `/compare/*` count fall 19→14 after the 19:23 redeploy and flagged the richest answer pages "wink in and out as derived data shifts." Treated as a **data-stability vs. surface-durability** exploration. The premise ("derived data shifts") is a hypothesis to test against the authoritative sources (committed derives + live sitemap).

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| Committed `regional-price-floor.json`, last 7 daily derives (7/24–7/30) | Available | **Invariant structure**: 4 clusters every day; each ≥2-store cluster carries all 4 categories (Concentrate/Flower/Pre-Rolls/Vaporizers); floor counts vary 255–932/cluster but never approach 0/category. |
| Live `curl https://gmaslist.com/sitemap.xml` (2026-07-30, this case) | Available | **Full 19 `/compare/*`**: 4 disparity-category + 3 region hubs (bellingham/everett/mount-vernon) + 12 region-category (4×3). No pages missing now. |
| `sitemapRoute.ts` / `compareRoute.ts` / `regionModel.ts` | Available | Sitemap geo entries + region-category route both sourced from `readRegions()`; a missing category 404s (`compareRoute.ts:722-726`). |
| `buildApiData.ts` + `storeStatus.ts` | Available | Per-store `status` is **computed at request time** from `lastFetchedAt` vs a 3h window — it is NOT stored in data.json. |
| data.json current statuses | Available | Raw file has no `status` field; derived live → all fresh right now (matches full sitemap). |
| The exact 19:23-era data.json `lastFetchedAt` values | Missing | Would let us name the precise 5 stores/categories that lapsed; not required for root cause (mechanism is Confirmed). |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 7/24–7/30 04:00 daily | Value-facts derive republishes `regional-price-floor.json`; structure invariant (4 clusters × 4 categories) | git `git log -- regional-price-floor.json` | Confirmed |
| 2026-07-30 19:23 | Seed-refresh redeploy; live sitemap `/compare/*` observed at 14 (5 geo pages absent) | `discovery-crawl-bottleneck-investigation.md` Finding 12 | Confirmed (as observed) |
| 2026-07-30 (later, this case) | Live sitemap `/compare/*` back to full 19; all 12 region-category pages present | live curl | Confirmed |

## Confirmed Findings

### Finding 1: The derived price-floor data is stable, not volatile

**Evidence:** git history of `server/data/derived/regional-price-floor.json`, commits `f03c51b`→`a0ee2dd` (7 daily derives 7/24–7/30). Every derive: `totalClusters=4`; the three ≥2-store clusters (`2020-solutions-north-bellingham` s=5, `210-cannabis-arlington` s=12, `cannazone-old-hwy-99` s=6) each carry **all 4 categories** every day; per-category floor counts stay in the hundreds. `kaleafa-oak-harbor` (s=1) is excluded by `MIN_REGION_STORES` (`regionModel.ts:32,123`).

**Detail:** The geo-page URL set implied by the committed floors *alone* is invariant at 15 (12 region-category + 3 hubs). No category ever empties in a cluster. So "the derived data is unstable" is **refuted** — the price derivation is one of the most stable artifacts in the tree.

### Finding 2: The volatile lever is the request-time freshness JOIN, not the derivation

**Evidence:** `compareRoute.ts:428-451` (`readRegions`) joins live store `status` from `buildApiData()` into `statusById` and passes it to `buildRegions`. `buildApiData.ts:22-25` computes `status = deriveStoreStatus(d.lastFetchedAt, now)` at call time. `storeStatus.ts:11,28-29`: a store reads `stale` when `now − lastFetchedAt > 3h` (`STORE_FRESHNESS_WINDOW_MS`), `failed` if the timestamp is missing/unparseable.

**Detail:** The same committed floors project to a **different geo-page set depending on the wall clock** at the moment `/sitemap.xml` (or the region route) is served. The price data is fixed daily; the freshness overlay changes hourly.

### Finding 3: The staleness guard drops a whole geo page when all a category's floor-holders lapse

**Evidence:** `regionModel.ts:139-155`: for each floor, holders are narrowed to non-dead stores (`isDeadStatus` = `stale`/`failed`, `regionModel.ts:84-86`); a floor whose holders are **all** dead is dropped. `regionModel.ts:157-161` builds `region.categories` only from surviving floors. `sitemapRoute.ts:156-170` (`readRegionPaths`) emits `/compare/<cat>/<region>` only for categories present; `compareRoute.ts:722-726` **404s** a region-category URL whose category is absent from `region.categories`.

**Detail:** A `/compare/<cat>/<region>` page disappears (from sitemap AND as a live 404) exactly when every floor of that category in the cluster is held solely by stores whose last ingest is >3h old. The region hub `/compare/<region>` survives (a region is emitted regardless of floor count, `regionModel.ts:163-172`), so a fully-lapsed cluster drops its 4 category pages but keeps its hub — a clean "≈4–5 dropped" signature.

## Deduced Conclusions

### Deduction 1: The 19:23 drop was a transient freshness contraction, now recovered

**Based on:** Findings 1–3 + the timeline.

**Reasoning:** The committed floors at 19:23 were the stable `a0ee2dd` full structure (Finding 1). The redeploy served a data.json snapshot in which some stores' `lastFetchedAt`, measured against the 19:23 `now`, exceeded the 3h window (deals-ingest is a *separate, hourly* pipeline from the *daily* value derive, so at any instant a subset of stores can be mid-lapse — e.g. a missed hourly cron, weekend/outage, or CI skew). Those stale holders emptied 5 region×category cells via the guard (Finding 3). The next good hourly ingest refreshed `lastFetchedAt` → statuses returned to `ok` → the pages reappeared (live-confirmed full 19).

**Conclusion:** "Is the data unstable or correctly reflecting thinner data?" → **Neither the price data nor a bug.** The pages correctly reflected thinner *freshness* (ingest recency), not thinner price coverage. The behavior is by-design-correct (a dead store must not be crowned "cheapest") but it couples a slow, stable SEO surface to a fast-twitch hourly signal with a hard 3h cliff and **zero hysteresis** — that coupling is the real defect.

## Hypothesized Paths

### Hypothesis 1: Dominant-city slug flips are a second, sharper churn vector

**Status:** Refuted as an active problem; latent-low risk (resolved 2026-07-31)

**Theory:** `buildRegions` names a region by its **modal member city**, ties broken lexicographically (`regionModel.ts:71-78,125-127`). If cluster membership shifts (a store loses geo, is stale-excluded upstream, or the daily re-cluster moves a boundary store), the dominant city can flip, renaming the whole region — every `/compare/<cat>/<region>` and `/compare/<region>` URL for it changes at once, old URLs 404. This is worse than Finding 3 (renames the whole family, not one category).

**Supporting indicators:** Live region slugs are `everett`/`mount-vernon` while the cluster ids are `210-cannabis-arlington`/`cannazone-old-hwy-99` — the slug already tracks a *different* token (dominant city) than the cluster anchor, so a membership shift changing the mode is realistic in the 12-store Everett-corridor cluster.

**Would confirm:** A historical derive where a cluster's dominant city differs from today's (compare `dominantCity` output across the 7 committed derives joined to data.json cities).

**Would refute:** Dominant city stable across all derives despite membership/floor churn.

**Resolution:** Computed `dominantCity` per ≥2-store cluster across all 7 committed derives (`f03c51b`→`a0ee2dd`), joining membership to data.json cities. **Slug set invariant 7/7 days**: `bellingham`(5) / `everett`(12) / `mount-vernon`(6) — no flip. Margins: Bellingham 5/5 (safe); Everett 6 vs 1 (safe); Mount Vernon 3 vs Anacortes 1 + 2 unparseable (tightest, a 2-store swing). Critically, the slug is a function of **committed cluster membership only** — the request-time staleness guard narrows floor *holders* but never changes `memberDispensaryIds`, so a slug flip can occur **only on the daily re-cluster cadence**, not on the hourly freshness overlay. It does **not** compound with the Finding-3 churn. Verdict: latent-low, does not block the durability fix (which reads the same stable membership). Residual guard worth adding: a slug-stability test / permanent alias so a future re-cluster rename doesn't silently 404 an indexed family.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| 19:23-era per-store `lastFetchedAt` | Names the exact 5 stores/categories that lapsed (nice-to-have; mechanism already Confirmed) | The data.json committed nearest 19:23 (seed-refresh commit) + replay `deriveStoreStatus` at `now=19:23` |
| Dominant-city stability across derives (Hyp. 1) | Confirms/eliminates the slug-flip churn vector | Join each daily `regional-price-floor.json` cluster membership to data.json cities; compute `dominantCity` per derive |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Page-set origin | `compareRoute.ts:428-451` `readRegions()` → `buildRegions(env.data, cityById, statusById)` — one source for dispatcher, geo pages, and sitemap |
| Volatile input | `buildApiData.ts:22-25` → `storeStatus.ts:21-30` `deriveStoreStatus(lastFetchedAt, now)`, 3h window (`STORE_FRESHNESS_WINDOW_MS`, `storeStatus.ts:11`) |
| The guard that drops pages | `regionModel.ts:139-155` (narrow holders to fresh; drop all-dead floors) → `:157-161` (categories from surviving floors) |
| Sitemap emission | `sitemapRoute.ts:156-170` `readRegionPaths()` (hub + one path per present category) |
| The 404 | `compareRoute.ts:722-726` (region-category absent → 404) |
| Stable substrate (not the cause) | `regionalPriceFloor.ts:160-282` `buildRegionalPriceFloorReport` (daily derive; committed) |

## Conclusion

**Confidence:** High.

The geo-page volatility is **Confirmed** to originate in the request-time freshness JOIN, not the derivation. The committed price-floor data is invariant across 7 daily derives (Finding 1); the live sitemap is currently full (all 12 region-category pages). The 19:23 "5 dropped" was a transient contraction: the ADR-107 page-level staleness guard (`regionModel.ts:139-155`) suppressed floors held only by stores whose `lastFetchedAt` had aged past the 3h `STORE_FRESHNESS_WINDOW_MS`, and it recovered on the next good hourly ingest. Correct-by-design, but it binds a stable, citation-seeking SEO surface to an hourly freshness signal with a hard cliff and no hysteresis — so the richest answer pages 404 in and out on ingest jitter that crawlers then see as churn.

## Recommended Next Steps

### Fix direction

The defect is **surface durability**, not derivation. Options, in preference order:

1. **Add hysteresis/grace to the geo-page freshness gate.** For sitemap emission and the region-category route, treat a floor as live if it was fresh within a longer grace window (e.g. keep a page emitted while the cluster was healthy in the last 24–48h, only 404 on sustained lapse). Widen just the geo surface, not the in-app "cheapest" honesty gate.
2. **Decouple the sitemap from the freshness overlay.** Emit `/compare/<cat>/<region>` from the *committed floor structure* (stable) and let only the *rendered page copy* reflect staleness (e.g. an "as-of" caveat or hide individual stale rows) — the URL never 404s, honesty is preserved in-body. This best serves crawl stability.
3. **Widen `STORE_FRESHNESS_WINDOW_MS` for the geo surface only** (e.g. 6–8h) — smallest change; reduces cliff sensitivity to a single missed hourly cron (the guard was written for a store going *dark*, not one hour late). Does not fix sustained lapses.

Cross-check against `oracle-freshness-gate.md` (the queued today-freshness story) — that gate is the engine-wide superset; this fix should not double-count with it.

### Diagnostic

- Confirm Hypothesis 1 (dominant-city flips) before shipping any URL-stability fix, or a slug rename could still churn the whole family under the new grace window.
- Optional: add the 5 dropped names by replaying `deriveStoreStatus` on the 19:23-era data.json.

## Reproduction Plan

1. Load committed `regional-price-floor.json` (full 4×3 structure) + current data.json.
2. Build `statusById` with a chosen subset of a cluster's stores forced `stale` (set their `lastFetchedAt` >3h before `now`), covering every holder of one category in that cluster.
3. Call `readRegions()` / `buildSitemapXml(...)`; assert the `/compare/<cat>/<region>` URL for that cell is absent and `compareCategoryRegionRoute` returns 404 (`compareRoute.ts:722-726`).
4. Reset those stores fresh; assert the URL returns — reproducing the wink-out/wink-in.

## Side Findings

- The daily value derive (04:00) and the hourly deals ingest are on **different clocks**; the geo surface is gated by the faster one. Any durability fix must reason about the *ingest* cadence, not the derive cadence. (Confirmed: `storeStatus.ts:8-11` documents the hourly-cron basis of the 3h window.)
- `deriveStoreStatus` returns `failed` for a missing/unparseable `lastFetchedAt` (`storeStatus.ts:25-27`) — a brand-new store with no ingest yet would suppress its floors identically to a dead one, a corner of the same coupling.
- Cross-links: `discovery-crawl-bottleneck-investigation.md` (parent, Finding 12 / Backlog #6) and `oracle-freshness-gate.md` (the engine-wide freshness gate this fix must not duplicate).

## Follow-up: 2026-07-31 (fix shipped — ADR-111)

### Additional Findings

The chosen fix (Fix direction option 2 — decouple URL existence from the freshness overlay) was implemented via story `geo-page-sitemap-durability` (bmad-dev-story). The single coupling point identified in Finding 3 — `region.categories` built from the POST-staleness-guard floor set (`regionModel.ts:157-161`) — was broken: the staleness guard no longer drops all-dark floors, so `region.categories` (→ sitemap URL + route existence) is now a pure function of the committed floors. The guard only annotates rows now (`RegionalFloor.stale`); render keeps last-known rows with a per-row "freshness unverified" marker + an all-stale page caveat (Ruling A(b)), and the empty state fires only for a genuinely empty committed category (structural absence, AC2). Slug-flip risk (Hyp 1) is guarded by a failing CI snapshot test; live redirect deferred (`deferred-work.md`).

### Updated Conclusion

Root cause CONFIRMED and REMEDIATED. Server suite 858/858 green; client + server builds clean. ADR-111 records the decision. This case is closed pending the story's own code-review pass.

### Backlog Changes

- Parent `discovery-crawl-bottleneck-investigation.md` Backlog #6 → resolved by ADR-111.
