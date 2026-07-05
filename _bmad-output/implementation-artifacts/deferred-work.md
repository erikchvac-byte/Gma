# Deferred Work

## DEFERRED — Banner-linking Edible/Concentrate + concentrate banner cues (from review of spec-category-expansion, 2026-07-04)

Collection fix #2 shipped Edible/Concentrate COLLECTION; the deal-scope bridge deliberately does NOT link them (`BANNER_LINKABLE_CATEGORIES` in `dealScope.ts` pins the pre-expansion output). Deferred decisions, surfaced by the 3-reviewer pass:

- **Concentrate banner cues:** `parseDealScope` has no concentrate-family words. Today "30% off all concentrates" → `unresolved` (counted, linked to nothing — honest but blind, even though the category is now populated). Options when taken up: add a `category: 'Concentrate'` cue (requires widening `ScrapedCategory` + link rules) or at minimum add wax/dab/shatter/rosin/concentrate to `UNSUPPORTED_CUES` so the report buckets them by name.
- **Pre-existing false-friend (NOT introduced by fix #2):** "concentrate ounces $99" trips the `isOunce` cue → classified Flower@28g and linked to the store's Flower 28g SKUs. Existed before this change; fix alongside the concentrate cue work.
- **Edible banner linking:** stays `unsupported-category` until an honest per-item/$-mg basis exists (derivation engine).

## DEFERRED — Collection fixes #2 and #3 (split from data-collection-audit quick-dev, 2026-07-03)

Source: `investigations/data-collection-audit-2026-07-03.md` + `products-data-first-look-2026-07-03.md`. Erik split the three collection fixes; **#1 (potency extraction) taken now** via `spec-potency-extraction`. Remaining:

- **#2 — Category expansion:** widen `DEFAULT_PRODUCT_CATEGORIES` (`server/scrapers/_dutchieProducts.ts`) beyond Flower/Vaporizers/Pre-Rolls — Edibles/Concentrates already arrive in the FilteredProducts payload and are dropped in `transformProducts`. Design questions to settle in the spec: edibles are mg-THC-based so $/gram is dishonest for them (unit economics need an edible-appropriate basis — likely $/mg once potency lands, which is why this comes AFTER #1); weight-parse flags/matcher honesty gates (`EXCLUDED_FLAGS`) need review for non-weight categories; payload/products.json size growth on the daily commit-back. Weedmaps `normalizeCategory` has the same launch-category constraint.
- **#3 — Deal-banner history snapshot:** data.json is overwritten by each hourly ingest, so deal history has NO retention ("new promotions today" is unanswerable — audit §14). Persist a snapshot of each store's deals (e.g. append-only committed file à la products.json, or snapshot-before-overwrite in the ingest path) without touching the Deal contract or `/api/data`. Entirely separate subsystem from #1/#2.

## DEFERRED — from review of spec-potency-extraction (2026-07-03)

Surfaced by the 3-reviewer pass; both are policy calls, not drive-by fixes. Erik was AFK at the review checkpoint — the shipped semantics were the spec-as-approved defaults. **RATIFIED by Erik 2026-07-03 ("keep both"): totalTerpenes stays collected-verbatim/unit-undocumented, and honest-null overwrite stays.** The two escalation triggers below remain live (act only if accrued data shows out-of-range values / field-level flakiness):

- **Potency magnitude sanity bounds** — `potency()` now rejects negatives (impossible under any unit) but any positive finite value commits as truth, so the known POS-typo class ("21.5% entered as 2150") is served verbatim by `/api/products` with no flag. A guard needs a unit-aware policy (PERCENTAGE ≤ 100 is obvious; MILLIGRAMS bounds are not) — decide once real out-of-range values appear in the accrued data.
- **Enrichment retention on provider glitch (null-clobber)** — record-level `thc`/`cbd`/etc. refresh to the latest scrape like `name`/`brand`, so one scrape with a missing/malformed `THCContent` overwrites known potency with `null` until the payload heals (both hunters' top finding). Kept deliberately: honest-null mirrors the latest payload, scrapes are daily so a glitch heals in ~a day. If accrued data shows real field-level flakiness, add keep-last-known-on-null (or a glitch flag) in `applyProductObservations` — note that changes merge semantics and needs Erik's sign-off.

## DEFERRED — from review of spec-repo-hygiene-closeout (2026-07-02)

Surfaced by the 3-reviewer pass on the hygiene closeout; all pre-existing content defects in docs the closeout merely committed, or policy calls needing Erik:

- **Lockfile floating-range drift policy** — `.gitattributes` cures only the CRLF branch; the next time a floating dev dep (e.g. `concurrently ^9.0.0`) publishes, `package-lock.json` re-dirties with *real* drift (same mechanism as the bump committed 2026-07-02; `scrape-ingest.yml:175-178` documents the CI-side variant). Pick a policy: accept-and-commit the churn as it appears, or pin exact versions.
- **GmasINCOlist provenance comments dangle** — `client/src/utils/dealIconAssets.ts:3`, `client/src/components/AgeGate.tsx:13`, and `ADR.md:572` cite `GmasINCOlist/`, which now lives at `C:\Users\erikc\Dev\Happy-assets\` (moved 2026-07-02). Comment-only edits were out of the closeout's "no code changes" boundary; append "(now Dev/Happy-assets)" when next touching those files.
- **Monetization docs internal nits (pre-existing, 2026-06-23):** the summary and research docs number the same options differently (licensing #6 vs #7, donations 7 vs 8, white-label 8 vs 9) — "Option N" citations are ambiguous; and `monetization-ad-revenue-investigation.md` grades Hypothesis 1 "Confirmed (qualified)" while its own confirm-condition (live primary-source re-check) is marked not done.
- **`docs/seo-ai-crawler-visibility-plan.md` store-count drift** — says "21 WA stores" twice and "20 stores" once; current registry is 20 (ADR-056). Fix the two 21s when next editing the plan.
- **`data-snapshots/` never existed in-repo** — `value-analysis-2026-06-24.md` + `FIXES.md` anchor reproducibility on snapshot files absent from repo and disk (now flagged in the value-analysis status banner). If the snapshots still exist anywhere, commit them; otherwise FIXES #7 (save scripts + inputs next to analyses) is the standing rule.

## DEFERRED — Weedmaps accrual freshness alerting (from Phase-3 residential-ingest review, 2026-06-29)

Blind + edge reviewers of `spec-weedmaps-residential-ingest` flagged that the residential nightly runner can stall **silently for weeks** (residential IP also starts 406-ing, Node/git falls off the Scheduled-Task PATH, or the scrape otherwise stops appending) while every run reports green — and the CI `alert-gate` (`server/scripts/alertGate.ts`) deliberately **excludes** weedmaps. v1 mitigation shipped: a runner PATH preflight + a `last-success.txt` heartbeat under the worktree's `.weedmaps-ingest\` (stale timestamp = stall). **Deferred:** real alerting — e.g. extend `alertGate`/a small heartbeat-age check to red a run (or notify) when weedmaps observations haven't advanced in N days. Gated on Erik wanting active monitoring vs. periodic manual heartbeat inspection.


## DEFERRED — Integer-validate MPG at the fueleconomy source (from chunk-3/CAP-5 review, 2026-06-27)

Edge-case reviewer of `spec-obvious-vehicle-control`: `resolveMpg` (`client/src/hooks/useFuelEconomy.ts:140`) does `Number(comb08)` gated only by `isPositiveFinite` — no integer enforcement. EPA `comb08` is documented as an integer so this is not reachable with real data, but both display sites — the new `VehicleBar` and the pre-existing `VehicleSelector.tsx:153` — render `${mpg} MPG` raw, so a non-integer would show decimals in two places. Fix belongs at the source (round/validate to integer in `resolveMpg`) so both consumers stay consistent — NOT in `VehicleBar` alone (that would diverge from the unchanged sheet). Pairs naturally with the already-deferred CAP-5 fueleconomy.gov hardening (timeout/spinner/retry/empty-result).


## ~~DEFERRED~~ RESOLVED — duplicate store kushmans-everett-evergreen-way (from chunk-1 review, 2026-06-26)

Surfaced by the blind-hunter + edge-case reviewers of `spec-card-address-and-remove-mpg-default`: `kush21-everett-evergreen` and `kushmans-everett-evergreen-way` carried the identical address `"8911 Evergreen Way, Everett, WA 98208"` (verbatim from the cited `STORE_ADDRESSES` map; "same site as Kush21 Evergreen") and already shared `lat`/`lng`. **RESOLVED 2026-06-26 (Erik's call): they are the same physical shop, so `kushmans-everett-evergreen-way` was removed entirely** — from `server/data/data.json` (21→20 stores), `server/data/products.json` (−272 product entries), `DUTCHIE_STORE_IDS` (`dutchie-stores.ts`), and `STORE_ADDRESSES` (`geocodeStores.ts`). `kush21-everett-evergreen` is retained. Guard rail `storeRegistry.test.ts` re-verified (no orphan registry/product-scrape ids).


## DEFERRED — User-Relative Positioning #2–#6 (brainstorm split, 2026-06-21)

Source: `_bmad-output/brainstorming/brainstorming-session-2026-06-21-1721.md` (proposed **ADR-044** "User-Relative Positioning Supersedes Fixed-Origin Distance", retires ADR-008 fixed-origin + ADR-011 hand-distances). The brainstorm **supersedes & absorbs** the older "Deliverable 2" section below — same geocode/haversine engine, expanded to all 22 stores + Geolocation two-door + centroid cold-start + ferry honesty + slider reframe. Decomposed into 6 build-order deliverables; **#1 (geocode all 22 + lat/lng on records & type) taken now** via bmad-quick-dev (`spec-geocode-stores-latlng`). Remaining, in dependency order:

- **#2 — Location input on AgeGate (Theme B #4/#5):** fold "📍 Use my location" (Geolocation API, one tap, exact) **and** a ZIP box side-by-side into the existing `AgeGate.tsx` after the 21+ yes. Plus the honest "no location yet" state. Confident users tap; cautious users type; undecided get the honest empty state. Persist location for the distance engine.
- **#3 — Live user-relative distance → gas cost + distance-only sort (Theme A #3):** `haversine(user, store) × 1.3` road factor feeds existing `roundTripGasCost` + nearest-first sort. **Single sort axis = distance to user**; deal urgency shows on the card but NEVER reorders. Depends on #1 (lat/lng) + #2 (user location). **Carry-in from #1 review:** `normalizeDispensaries` does not validate `lat`/`lng` (only `id`/`deals`/`distanceMiles`) — when #3 makes a consumer read coords, add a finite-coord drop-rule there so a poisoned `lat: NaN` can't reach the haversine/sort path (mirrors the existing present-but-invalid `distanceMiles` rule).
- **#4 — Centroid cold-start seed, number-suppressed (Theme B #6):** if user skips location, sort the feed by distance from the DERIVED store centroid (post-geocode) but show NO distance/gas number until real location exists. Preserves Honest Math (ADR-007/009). Depends on #1.
- **#5 — Slider reframe, default 25mi (Theme C #E2):** reframe the radius slider as a personal-reach trim, not a zone rule. Default shrinks 50 → 25mi (tunable 20/30, widen-able ~60).
- **#6 — Ferry chip (Theme C #E3):** manual `ferry` boolean on the store record → small "🚤 ferry" chip on the card. No routing engine; doesn't affect sort. Smallest, fully standalone. Salish Coast / Port Townsend confirmed; check Whatcom cluster.

Open items carried to the specs: confirm/derive 18 Dutchie store **street addresses** for the geocode script (#1); final slider default (#5); which stores get the ferry flag (#6).

## DEFERRED (SUPERSEDED by User-Relative Positioning split above, 2026-06-21) — Deliverable 2: per-user distance + honest gas (split from deals-first, 2026-06-21)

Split out of `spec-all-stores-show-deals.md` (Deliverable 1) at Erik's direction — **deals first, then distance, then gas**. D1 makes distance *optional* so all stores show their deals; D2 then makes the distance/gas **real and per-user**, retiring the fixed-origin placeholder.

- **Problem it solves:** every store's `distanceMiles` is a fixed distance from ZIP 98270 (ADR-008) — identical for every user regardless of where they are. A fabricated number that violates Honest Math (ADR-007/009). After D1, the 4 originals still show this fixed number and the ~18 Dutchie stores show no distance at all — an honest but inconsistent interim state D2 resolves.
- **Approach (zero runtime external dep, zero API key — works on Render free plan):**
  1. **Geocode every store once** via free OpenStreetMap **Nominatim** (dev-time script `server/scripts/geocodeStores.ts` with an inline `id→address` map; addresses are dev input, NOT a runtime schema field). Writes `lat`/`lng` into each `data.json` record. Re-runnable; only fills records missing coords (covers the D1-seeded Dutchie stores too). **Unblocks Dutchie distances without Erik hand-supplying 18 numbers.**
  2. **User ZIP input** (audience = elderly; ZIP preferred over a GPS permission prompt). Persist in `localStorage` `gma_zip`, validated at the use site like `gma_vehicle_mpg`. Resolve ZIP→`{lat,lng}` from a committed **WA Census ZCTA centroid** JSON (public domain; WA-only matches the local Snohomish/Skagit/Whatcom audience — a non-WA ZIP resolves to `null` = "not recognized", correct not a crash). Widening to a national set is a later bundle-size call.
  3. **Compute distance client-side**: `haversine(user, store) × 1.3` road factor → feeds the EXISTING consumers (`roundTripGasCost`, distance filter, nearest-first sort). Gas line already null-safe, so it lights up automatically when a distance exists.
- **Honest Math:** until a usable ZIP is entered there is NO distance — suppress pill + gas, never fake a number (the D1 optional-distance plumbing already supports this).
- **Retires:** **ADR-008** (fixed origin 98270) and **ADR-011** (hardcoded road-distance lookups) → new ADR. Approximating road distance with haversine×1.3 honors ADR-002's road-distance intent at zero runtime cost.
- **Touch set (≈6 new + ~6 edits):** `distance.ts` (+test), `zipCentroids.wa.json` + `zipCentroids.ts` (+test), `useLocation.ts` (+test), `LocationInput.tsx` (+test), `geocodeStores.ts`; edits to types (`lat`/`lng`), `data.json`, `normalizeDispensaries`, `DealCard`, `DealFeed`, `DistanceFilter`, ADR. **Ask-First:** if the stores' street addresses can't be sourced confidently, HALT (don't hallucinate coords); if WA-only proves too narrow, HALT before adding a national dataset.
- Out of scope (D3 / later): driving-time, traffic, GPS Geolocation API.

## DEFERRED — from review of spec-adr-034-ingest-endpoint (2026-06-18)

Surfaced by the 3-reviewer pass on the ingest endpoint. All pre-existing or low-priority hardening; none block Goal A (which shipped review-clean). Most touch the **shared** `normalizeDeals`/`express.json` layer, so they affect the in-process `runScrapers` path equally and deserve a focused change rather than a drive-by in the ingest story.

- **`normalizeDeals` does not validate scalar Deal fields** (`server/utils/normalizeDeals.ts`) — `isUsableDeal` checks the time window + `daysValid` but not `type` (should be `'happy_hour'|'daily'`), `description` (should be string), or `discountPct` (should be `null` or a finite number). A deal with valid window/days but garbage scalars passes the chokepoint into `data.json`. Pre-existing (same gap for `runScrapers`); the client `useDeals` boundary validator (data-hardening) is the current backstop. The new `/api/ingest` makes this reachable from network JSON, so harden the shared normalizer + add tests + re-verify `runScrapers` when picked up.
- **Duplicate `dispensaryId` in one `/api/ingest` batch** — last entry silently wins, `accepted`/`mutated` double-count, and the `results` map collapses to one key so the caller can't detect the collision. Our Actions matrix sends unique stores, so low risk; reject-or-dedupe with a distinct result if it ever matters.
- **No `express.json({ limit })` on the ingest body** (`server/index.ts`) — default ~100kb; an oversized multi-store batch would 413 from body-parser *outside* the route's `{error,code}` envelope. Won't trigger at current few-KB payloads; size the parser if batch sizes grow (note: global limit change is cross-cutting).
- **`daysValid` is case-sensitive** (`normalizeDeals`) — `"Monday"` is dropped (only lowercase names + `everyday` pass). Pre-existing contract; document in the Goal-D scraper that day names must be lowercased (or lowercase in the normalizer).

## DEFERRED — post-redeploy data-freshness gap (from Goal C review, 2026-06-18)

Surfaced by the edge-case reviewer on the Goal C diff. **Now that the in-process boot scrape is retired (Goal C), nothing repopulates `data.json` at startup.** Render's disk is ephemeral, so every redeploy resets `server/data/data.json` to the committed seed (currently stale, `lastScraperRun` 2026-06-14), and the file only refreshes on the **next hourly GitHub Actions cron POST** to `/api/ingest`. Worst case: a redeploy landing just after the top of the hour serves ~59 min of stale data, and `filterActiveDeals` can return an **empty/wrong-day** deal list until the next cron. Design-acknowledged per ADR-034 (last-known-good, minutes-stale is fine) and **not a blocker** — but the boot self-heal that previously closed this window is gone. Mitigations (pick when it matters): (a) fire `gh workflow run scrape-ingest.yml` on deploy (or a Render deploy-hook → `workflow_dispatch`) so a fresh scrape lands immediately post-redeploy; (b) commit a fresher seed; (c) shorten the cron interval. Runbook (`docs/deploy-scraper-runbook.md`) already corrected to stop documenting the removed self-heal.

## DEFERRED — ADR-034 goals B/C/D (split from ingest-endpoint build, 2026-06-18)

ADR-034 ("Playwright on GitHub Actions cron → authenticated ingest") was sliced for the build. **Goal A — the `POST /api/ingest` endpoint** (shared-secret auth + last-known-good store + per-store timestamps) is being built first (`spec-adr-034-ingest-endpoint`, branch `feat/adr-034-ingest-endpoint`) because it is the load-bearing contract the runner targets and is independently testable inside the Happy repo. The rest are deferred in dependency order **A → D → C** (Erik's call, 2026-06-18):

- ~~**B — Observability fix (Happy/server):** surface explicit per-store status (`ok|stale|failed`) in `/api/data`. (ADR-034 Decision §6)~~ **✅ BUILT + REVIEW-CLEAN 2026-06-21** (via bmad-quick-dev + 3-layer review). Derived purely from ingest-staleness as the re-scope intended: `server/utils/storeStatus.ts` → `deriveStoreStatus(lastFetchedAt, now)` (pure, `now` injectable per ADR-026), single constant `STORE_FRESHNESS_WINDOW_MS = 3h` (3× the hourly cron). `ok` = within window, `stale` = older, `failed` = never-ingested / malformed timestamp (fail-open, never `ok` — ADR-007/009). `dataRoute` maps an **additive** `status` onto each dispensary (ADR-022/026 deal sort/omission/count untouched; the existing empty-push `stale` boolean is distinct from the new ingest-recency `status`). Shared `StoreStatus` union in `client/src/types`; `Dispensary.status` optional (client doesn't consume it yet). **Erik's call (2026-06-21): dropped the original §6 "error-vs-empty POST signal"** — `failed` is from `lastFetchedAt` alone; the Actions workflow + ingest pipeline are untouched. Tests: +17 storeStatus, +2 dataRoute; 316 client + 144 server green. See ADR.md change log 2026-06-21. **This was the last open ADR-034 goal — A/D/C/B all shipped.**
- **C — Retire in-process scraping (Happy/server):** kill the boot/`setInterval` `runScrapers()` (ADR-010) so Render becomes read-only over `data.json`/store. **Only safe after A + D prove the push path** (else no data source). (ADR-034 Decision §5) **IN PROGRESS 2026-06-18** (`spec-adr-034-goal-c-retire-scrape`) — prereq now satisfied: D proven live (see below).
- ~~**D — Actions cron + store registry + scraper POST**~~ **✅ BUILT 2026-06-18** (`spec-adr-034-goal-d-actions-ingest`, branch `feat/adr-034-actions-ingest`). Hourly GitHub Actions cron runs the **Node** pipeline (`server/scripts/ingestRun.ts`, the push counterpart to `runScrapers`) against the Python scraper **vendored into `scraper-svc/`** and booted in-job, POSTing each store's `Deal[]` to `gmaslist.com/api/ingest`. Store matrix derived from the `scrapers` registry (`storeIds`); per-store isolation (`fail-fast:false`); job-failure = the alert. Correction baked in: runner is Node not Python (transform lives in TS). Verified: 108 tests pass, tsc clean, live remedy-tulalip end-to-end. **✅ PROVEN LIVE 2026-06-18 19:14 UTC** — PR #2 merged (`62f8399`); manual `workflow_dispatch` (run `27783178172`) went all-green and flipped all 3 Dutchie sources (`kush21-everett-evergreen`, `the-joint-everett`, `jet-cannabis-everett`) to `stale:false` with fresh `lastFetchedAt` on `gmaslist.com/api/data`. Push path is now the confirmed data source — C's prereq is met. **Carry-forward:** `scraper-svc/` is a copy — re-sync from `C:\Users\erikc\Dev\Scraper` when the upstream scraper changes (see `scraper-svc/README.md`).

## PARKED — Live scraping on Render (from 5-1-deploy-scraper-service, 2026-06-16)

**Live Dutchie scraping is parked pending an approved hosting budget (~$14/mo).** Erik's call (2026-06-15): stay free / defer live. The code is go-live-ready — `server/utils/scraperClient.ts` now reads `SCRAPER_URL` (default `http://localhost:8000/scrape`, behavior unchanged) — so what remains is purely a hosting decision, not code.

- **Why deferred:** truly-free live scraping isn't viable on Render — the free web tier spins down after ~15 min idle (so the in-process hourly `setInterval` scrape doesn't reliably run), and Playwright+Chromium needs ~2GB shared memory vs. free tier's 512MB.
- **To go live:** follow [`docs/deploy-scraper-runbook.md`](../../docs/deploy-scraper-runbook.md) — deploy `../Scraper` as a Render **private** Docker service, set `SCRAPER_URL` on the Happy service to its internal hostname, and upgrade Happy off free tier.
- **Recommended topology + cost + alternative:** see **ADR-033** (cross-links ADR-031/032).

## Deferred from: 4-3-dutchie-iframe-dispensary-support (live pass, 2026-06-13)

> **✅ LIVE PASS COMPLETE 2026-06-14 (`_bmad-output/specs/spec-4-3-live-pass/`, see `live-findings-2026-06-13.md`).** All 5 capabilities verified live; all 3 Dutchie stores flow real deals. The two items below are CLEARED; the evidence-fixture relocation (third bullet) remains an open housekeeping item (was explicitly out of live-pass scope).

Story 4.3 shipped the TypeScript Dutchie integration fixture-tested; live end-to-end verification was deferred by Erik, then completed in the live pass:

- ~~**Resolve embed store ids for `jet-cannabis-everett` and `kush21-everett-evergreen`**~~ **✅ CLEARED** — resolved as cName slugs that work on the standard embed URL: `jet`→`thc-connection` (id `JXHb4Chub3or38k4n`), `kush21`→`kush21-everett` (id `E8KjW8WozhMFiMan9`; also runs Dutchie-Plus custom domain `everettshop.kush21.com`, but the standard URL works). Wired into the scraper files; unresolved-id guards removed.
- ~~**Reconcile `__fixtures__/dutchie-specials.json` against a real `GetSpecialMenuCards` capture**~~ **✅ CLEARED (material delta found + fixed, Erik-approved)** — real shape is `data.getSpecialMenuCards.menuCards` (not `specialMenuCards.specials`); no numeric discount field (percent parsed from `menuDisplayName`/`menuDisplayDescription` text — whole-number, no fraction risk); no structured days (parsed from text, else everyday); no `window` (every live card all-day `daily`). `_dutchie.ts`, fixture, and tests reworked; `dutchieRequest` now waits on `GetSpecialMenuCards` (late-emitting large menus). See ADR-030.
  - **NEW deferred (from live pass): `happy_hour`/timed Dutchie specials unsupported** — `recurringSchedule` was `null` on every live card sampled, so its shape is unverified and the transform maps all Dutchie specials to `daily`. Add timed-window support when a real timed special appears. (Also note: Dutchie day-gates some specials server-side, so the free-text day parser may rarely fire.)

- **(carried from 4.2) Relocate the four Dutchie-evidence HTML fixtures** — `the-joint-everett.html`, `jet-cannabis-everett.html`, `joint-everett-menu.html`, `jet-menu-420.html` in `server/scrapers/__fixtures__/` are investigation evidence (now partly cited in 4.3 code comments), not used by any test. Move to a 4.3 evidence/docs location or trim once the live ids are resolved. (Requires Erik's OK per the no-delete safety rule.)

## Deferred from: code review of spec-3-2-vehicle-precision-mode, pass 2 (2026-06-12)

- **`loadMakes`/`loadModels` flash empty options on every cascade step** — the stale-response-invalidation fix now clears `makes`/`models` synchronously before each fetch, so even fast successful requests briefly blank the downstream dropdown. Same bucket as the existing "no loading indicator" deferral below — needs Erik's call on the affordance.
- **`toMenuValues` dedupes by `value` only** — entries with the same `value` but different `text` (e.g. "2020" vs "2020 (alt)") collapse to one option, discarding the display-text distinction. Pre-existing information loss (the function already dropped `text`), not introduced by the patch pass; revisit only if fueleconomy.gov data shows this matters in practice.

## Deferred from: code review of 4-2-first-dispensary-html-parsers (2026-06-13)

- **`parseWindow` infers start meridiem from the end time** (`server/scrapers/remedy-tulalip.ts`) — correct for "7-8am" (both am) but wrong for a cross-meridiem window like "11-1am" (would yield 11:00–01:00 instead of 23:00–01:00). No current trigger: Remedy's only timed deal is the 7–8am early bird, and this parser is Remedy-specific. Revisit if Remedy adds a window that straddles am/pm.
- **Page-wide `li.el-item` selection + loose `/off/i` filter can over-capture** (`server/scrapers/remedy-tulalip.ts`) — any `el-item` carrying a "%" and "off" anywhere on `/promos/` is treated as a deal. The fixture test pins the count at 9, so a structural change is caught against the fixture, but live template drift (a new promo slider/banner) could silently inject junk deals. Tighten the selector scope if Remedy's template changes cause noise.
- **Four Dutchie-evidence HTML fixtures live in `server/scrapers/__fixtures__/`** (the-joint-everett, jet-cannabis-everett, joint-everett-menu, jet-menu-420; ~2.4k lines) but aren't used by any Story 4.2 test — they were committed as investigation evidence for Story 4.3. Relocate to a 4.3 fixtures dir or docs when 4.3 begins.

## PRE-LAUNCH GATE — verify-with-counsel register (from UX Reviewer Gate, 2026-06-12)

**These three items MUST be cleared with counsel before public launch** (source: `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/{.decision-log.md, review-regulated-content.md}`):

1. **WAC 314-55-155 advertiser status** — does republishing scraped retailer promotional copy make the aggregator an "advertiser" under WA cannabis advertising rules? (Meanwhile, EXPERIENCE.md Honest Math rule 6 constrains display: plain text, ~80-char cap, blocklist suppression — implement before launch.)
2. **WA mandatory-warning applicability** — do any mandatory warning statements ("This product has intoxicating effects…" family) apply to a non-commerce aggregator? The specced disclaimer footer reserves a slot for this text.
3. **Age-gate no-decline posture** — ADR-021's single-button attestation (no decline path) needs defensibility confirmation; industry norm is a two-option gate.



- **No loading indicator and no fetch timeout in the vehicle panel** — `useFuelEconomy` exposes `isLoading` but `VehicleSelector` never renders it, and `fetchJson` has no AbortController/timeout, so a hung fueleconomy.gov connection leaves a permanently empty Year dropdown with no spinner, no error, no recovery. UX polish beyond the 3.2 spec; needs Erik's call on the affordance (spinner vs. disabled state vs. timeout-to-error).
- **Failed mid-cascade load has no retry path** — if `loadMakes`/`loadModels` fails transiently, the error shows but re-selecting the same value fires no change event and reopening the panel skips `loadYears` once populated; the only recovery is switching to another value and back. Retry affordance is a UX design decision.
- **HTTP 200 with an empty menu is a silent dead end** — `{ menuItem: [] }` (or an unrecognized shape) renders a placeholder-only dropdown with the next select disabled and no message; "no data" feedback distinct from success needs copy/design input.

## Deferred from: code review of spec-3-1-eia-gas-price-refresh (2026-06-11)

- **`atomicWriteJson` is single-writer only** — the tmp filename is deterministic (`data.tmp.json`) and `refreshGasPrice` does an unserialized read-modify-write of the whole file. Safe today (one writer, sync read+write in one tick), but Epic 4's scraper engine reusing this utility MUST add writer serialization (shared mutex/queue) and unique tmp names (pid/random suffix) first — otherwise lost updates and tmp collisions. Blocker-grade for Story 4.1, noted in `atomicWrite.ts` comment.
- **`copyData.mjs` build behavior vs. live data** — `npm run build` overwrites `dist/server/data/data.json` with the seed copy, silently reverting any refreshed gas price (recovered at next boot refresh only if the EIA key works); `cpSync` over a live-serving target is also non-atomic. Revisit at deployment time (pm2/VPS) — e.g., skip copy when dist data exists, or copy via tmp+rename. Relates to ADR-018.
- **Optional plausibility bounds on gas price** — the finite>0 gate accepts an absurd-but-finite value (e.g. 443.9 if EIA ever changed scale); a $1–$15/gal sanity range would cap blast radius on every card's math. Product call on the range — Erik to decide if wanted.

## Deferred from: code review of spec-2-5-distance-filter (2026-06-10)

- **`distanceMiles` payload shape is trusted blindly** — `useDeals` validates only the array shape, so a dispensary with `distanceMiles` missing/`NaN`/`Infinity` is now silently dropped by the distance filter at any slider setting, and `null` (coerces to 0 in `<=`) passes the filter then crashes `DealCard`'s `.toFixed(1)` — a pre-existing crash path. Proper fix: validate/normalize dispensary shape at the `useDeals` boundary (one home), not per-consumer. Candidate to batch with Epic 4 scraper-data hardening. *(2.6 review extends this: a `null`/non-object element inside `dispensaries[]` now crashes at the stale predicate — first property access — and a garbage `stale` value fails open to "fresh" by the frozen strict-`=== true` rule; both resolved by the same boundary validation.)*
- **Filter-aware empty-state copy** — when the distance filter hides all deals, the feed shows the generic "No active deals right now", which doesn't hint that widening the slider would help (e.g. "No active deals within 10 miles"). Explicitly Ask-First in the 2.5 spec; needs Erik's call on copy.

## Deferred from: code review of spec-2-3-deal-cards (2026-06-10)

- **Long-open tab resurrects stale deals** — the 60s tick re-evaluates `isDealActive` over the original (never-refetched) payload, so on a tab left open past midnight, yesterday's deals reappear when their clock window next matches, ignoring `daysValid`. The no-refetch rule is a frozen 2.3 boundary; fixing properly means either monotonic removal or periodic refetch — candidate for Epic 3 or a small follow-up story.
- **No `visibilitychange` resync** — mobile browsers throttle background intervals; on tab resume the feed can briefly show expired deals until the next tick. Cheap fix (refresh `useNow` on visibility), batch with the item above.
- **Server-side tautological windows** — `start === end` (and end-only `00:00`) are treated as 24h-active by the server filter too (`server/utils/filterActiveDeals.ts` overnight branch). Scraper validation (Epic 4) should normalize or reject zero-length windows at ingestion.

## Deferred from: code review of spec-2-2-deal-feed (2026-06-10)

- **Feed does not re-evaluate deal activity over time** — `sortDeals` is computed once per render with `new Date()` and nothing re-renders on a timer, so a deal whose window closes while the tab is open stays visible; worse, once `endTime` passes, the overnight-wrap heuristic (`diff < 0 → +1440`) ranks it as "ending tomorrow" because `startTime` is ignored. Unreachable today (server strips inactive deals at fetch time) but becomes live the moment Story 2.3 adds the 60s countdown tick — 2.3 MUST make expiry checking startTime-aware (drop expired deals client-side), not just re-sort.

## Deferred from: Story 2.2 spec planning (2026-06-10)

- **Upcoming Happy Hours with "Starts at HH:MM" label** (Story 2.2 AC3, epics.md:293-295) — the server (`server/utils/filterActiveDeals.ts`, ADR-015) strips deals that aren't active right now, so later-today Happy Hours never reach the client. Implementing requires extending the server filter to keep `happy_hour` deals starting later today plus client-side active-vs-upcoming labeling. Deferred by Erik 2026-06-10; Story 2.2 ships active-only.

## Deferred from: code review of 6-2-primitive-component-library (2026-06-16)

- **RangeSlider unlabelled slider has no accessible name** — when `label` prop is omitted, the `<input type="range">` has no accessible name (no `aria-label`, no `aria-labelledby`). Currently all 6-3 usages will provide a label, but a future consumer using RangeSlider without a label will fail an accessibility audit. Consider adding an `aria-label` fallback or a dev-mode warning.
- **Interactive Card not keyboard-accessible** — `interactive=true` adds `cursor: pointer` and hover styles to a `<div>` but no `tabIndex`, `role`, or keyboard handler. Consumers needing a keyboard-reachable interactive card must use `as="a"` (with `href`) or `as="button"`. Document this constraint when Card is consumed in 6-3.
- **Card `as` accepts void elements** — `as="img"` / `as="br"` with children produces invalid HTML (React dev warning). The type `keyof React.JSX.IntrinsicElements` is broader than the intended set. A narrower union (`'div' | 'article' | 'section' | 'li' | 'a' | 'button'`) would be safer; defer to a future design-system alignment if the as prop is ever documented.
- **IconButton has no CSS disabled state** — `.gma-btn:disabled` exists in `components.css` but `.gma-iconbtn:disabled` does not. `disabled` on an `<IconButton>` disables the button functionally but renders no visual change (opacity, cursor). The gap is in the design system source; fix by adding `.gma-iconbtn:disabled { opacity: 0.4; cursor: not-allowed; }` to the local `components.css`, or raise with the upstream design system.
- **SkeletonFeed `rows=0` emits an empty live region** — `role="status" aria-label="Loading deals"` renders with zero children. Screen readers announce "Loading deals" but nothing is visible. Guard with `Math.max(1, rows)` or add a check if a "truly empty" loading state is intentional.
- **Select duplicate option values cause React key collision** — `key={opt.value}` in the `options` array map will produce duplicate keys if a consumer passes options with repeated `value` strings. React recovers but prints a warning. Low risk (consumer data quality issue); note in consumer docs.
- **SkeletonFeed index-as-key** — `Array.from({length: rows}).map((_, i) => <Skeleton key={i} />)` is safe for a static count list but unreliable if `rows` changes frequently at runtime (animation state reuse). For the current use case (page load skeleton) this is acceptable.
- **RangeSlider `min > max` unchecked** — browsers treat `min > max` by locking the slider at a single position; no guard or warning. Consumer responsibility; document as a known caveat in the RangeSlider contract.

## Deferred from: code review of 2-1-age-gate (2026-06-10)

- No cross-tab/multi-instance localStorage sync in `useLocalStorage` (no `storage` event listener / `useSyncExternalStore`) — two tabs or two consumers of the same key diverge until reload. Out of MVP scope; worst case the age gate stays up in a second tab.
- `setValue` lacks a functional-update form (`setValue(prev => ...)`), so future read-modify-write consumers risk stale closures; `T` including `undefined` serializes to the literal string `"undefined"`. No current consumer affected.
- `useLocalStorage` ignores `key` prop changes after mount (value read once in the lazy initializer). No consumer changes keys today.

## Deferred from: code review of compliance-launch-gate (2026-06-18)

- ~~Affirm-gate `AgeGate` has no real focus trap~~ **RESOLVED 2026-06-19 by ADR-036** — the Tidewater gate added a real `Tab` focus-trap (`handleKeyDown`) on the ask/out states; `aria-modal="true"` is now backed by a trap.
- `sanitizeDescription` no-space truncation can split a UTF-16 surrogate pair — an 80-char description with no spaces and an astral character on the boundary leaves a lone surrogate, rendered as a replacement char. Negligible real-world likelihood (astral letters in a dispensary deal description landing exactly at the cap).

## Deferred from: "Arcade" palette swap (ADR-041, 2026-06-20)

- ~~**Re-run the WCAG 2.2 AA contrast audit for the Arcade palette**~~ **SUPERSEDED + DONE 2026-06-21.** Arcade was replaced by the **Daylight** light theme (ADR-042) before its audit ran, so the audit was performed against the Daylight values instead. **WCAG 2.2 AA VERIFIED** — full per-pair sRGB table in DESIGN.md → Colors → Contrast; DESIGN.md re-toned to Daylight and set `status: final`. All load-bearing pairs pass AA, most essential text AAA. One fix shipped: `--discount` deepened `#b45309`→`#ad4f08` so the 22px discount figures clear AA (4.5:1) on `--surface-raised` (was 4.37). `--text-faint #8a8780` (~3.3:1) stays confined to placeholder/incidental (WCAG 1.4.3 exempt; live stale indicator uses `--text-muted`).

## Deferred from: code review of GMAS_LIST_BRIEF.md / Tidewater reskin (2026-06-19)

- ~~**Full dark-palette WCAG AA contrast audit**~~ **DONE 2026-06-19** (see DESIGN.md → Colors → Contrast table). All shipped essential text passes AA (text 14.4, all text-muted contexts 6.5–8.3 incl. legal small print + stale line, action button 9.95, semantics 6.1–9.9). Polish follow-ups:
  - ~~(a) **hairline borders** too faint on the dark card edge — raise card/gate borders to `--border-strong #3C4D55`~~ **DONE 2026-06-19**: `.gma-card` + the age-gate card now use `--border-strong`; `--border` (#2C3A41) kept for subtle dividers + the secondary-button resting border (which still brightens to `--border-strong` on hover). DESIGN.md card-border statements updated to `{colors.border-strong}`.
  - ~~drop the now-dead `--status-stale` alias~~ **DONE 2026-06-19**: removed from `tokens.css` (StaleIndicator uses Notice `muted` = `--text-muted`).
  - (b) **`--text-faint #5E6E76`** (3.16–3.51:1) — STILL OPEN (low priority): fine while confined to placeholder / struck-price / unrendered specimens, but must be bumped toward AA if ever promoted to readable copy.
- **Self-host the web fonts** — fonts now load from Google Fonts CDN (ruled intentional). Resilience downside: the legally-required age gate depends on a third-party CDN; if blocked, `display=swap` falls back to system fonts (text still renders, not invisible). Re-vendor Space Grotesk / Plus Jakarta Sans / Space Mono as woff2 for offline/trust parity with the prior build.
- **Checkbox visibility on UAs that ignore `accent-color`** — the "Remember me" native checkbox is themed only via `accentColor`; on browsers ignoring it (older Safari) the unchecked box may be near-invisible on `--bg`. Add a bordered/box fallback.
- **"Remember me" write-failure is silent** — `useLocalStorage` swallows `setItem` failures (pre-existing); in private-browsing/quota-exceeded a user who checked "Remember me" is silently re-gated next visit with no feedback. Consider surfacing a notice.

## ~~Store-wide deals invisible under a product-category selection~~ RESOLVED 2026-07-05 (from spec-icon-category-filter-bar review)
**RESOLVED same day: Erik chose the wildcard** — `filterByCategory` now matches store-wide deals under every PRODUCT selection (scope selections stay exact). Shipped with the filter-bar polish PR.
The icon filter bar treats scope tags (store-wide / price-drop / special-pricing) as their own categories (Erik's explicit choice). Because the `dealIcons` matcher is exclusive for store-wide/order-scope deals, a "25% off everything" store carries ONLY `store-wide` — so pressing a product icon (e.g. Vapes) hides that store even though its deal does discount vapes. Product decision for Erik: should store-wide deals also match every product-category selection? (Would need `filterByCategory` to treat `store-wide` as a wildcard; presence semantics unchanged.) Related: matcher false-negatives now hide deals under a selection instead of just mis-tagging a visible card.
