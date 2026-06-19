# Deferred Work

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

- **B — Observability fix (Happy/server):** surface explicit per-store status (`ok|stale|failed`) in `/api/data`. (ADR-034 Decision §6) **RE-SCOPED post-C (2026-06-18, multi-goal split):** the original framing ("replace `scraperClient.ts`'s silent error-swallow") assumed in-process scraping on Render. After C retires that trigger, `scraperClient` runs only inside GitHub Actions — the server's sole failure signal becomes **ingest-staleness** (`applyIngest`/`lastFetchedAt`, the `stale` flag already in `/api/data`). So B must target the ingest/staleness surface, not the in-process swallow: derive `failed` (e.g. store stale past N expected cron intervals) vs `stale` vs `ok` from per-store `lastFetchedAt`, and expose it. Build after C lands.
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

- Affirm-gate `AgeGate` has no real focus trap — `aria-modal="true"` is set but there is no key handler / `inert` on the background, so Tab can leave the dialog. Pre-existing (predates the decline-affordance change; noted in ADR-021 deferred-work). The decline dead-end branch's missing focus is tracked separately as a patch in the story.
- `sanitizeDescription` no-space truncation can split a UTF-16 surrogate pair — an 80-char description with no spaces and an astral character on the boundary leaves a lone surrogate, rendered as a replacement char. Negligible real-world likelihood (astral letters in a dispensary deal description landing exactly at the cap).
