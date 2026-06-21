---
title: 'All Stores Show Deals — Decouple Visibility from Distance + Seed 18 Dutchie Stores'
type: 'feature'
created: '2026-06-21'
status: 'in-review'
baseline_commit: '8bb35c3'
context:
  - '{project-root}/ADR.md'
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Showing a store's deals is the whole point of the page (gas is the hook), but 18 resolved Dutchie stores can't appear at all. Two coupled rules block them: `applyIngest` only fills deals into a **pre-existing** `data.json` record (no record → `'unknown'` → deals dropped + CI job red), and `normalizeDispensaries` **drops any record lacking a finite `distanceMiles`**. So a store can't exist until someone hand-supplies a distance — backwards from the product's purpose. This is what reverted the earlier Dutchie wiring.

**Approach:** Make distance **optional enrichment, not a visibility gate.** Seed the 18 Dutchie dispensary records (id/name/url, empty deals, stale) and restore the scraper registration so the already-proven ADR-034 CI cron fills their deals on the next run. The 4 existing stores keep their current distance/gas untouched. Per-user distance + honest gas (geocode + ZIP + haversine) is a separate additive follow-up — **Deliverable 2, deferred** (see `deferred-work.md`).

## Boundaries & Constraints

**Always:**
- A store renders on its **own** validity (object + `id` string + `deals` array). Distance is never required for visibility.
- Honest Math (ADR-007/009): a store with no distance shows **no distance pill and no gas line** — never a fake/zero number, never an unguarded `.toFixed`.
- The 4 existing stores' `distanceMiles` stay exactly as-is — no regression to their pill, gas, filter, or sort position.
- Deal population stays on the proven ADR-034 ingest path. This spec only makes records **exist** and scrapers **registered**; it does **not** touch `applyIngest`/`ingestRun`/scrape logic.
- TypeScript strict; update/extend unit tests for every changed module (CLAUDE.md).

**Ask First:**
- The 18 stores' **display `name` and `url`** — derive sensible defaults from each slug, then HALT and have Erik eyeball/correct before commit. Do NOT invent distances.
- Do not restore the stashed `__pycache__/` artifact.

**Never:**
- No per-user location, ZIP, geocoding, or haversine here — that is Deliverable 2.
- Do NOT strip or "fix" the 4 existing stores' `distanceMiles` (that is D2's honesty overhaul, which retires ADR-008/011).
- Do NOT change ingest/scrape pipeline behavior or block the feed behind anything.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior | Error Handling |
|----------|--------------|-------------------|----------------|
| Seeded Dutchie store, not yet scraped | record exists, `deals:[]`, `stale:true` | Hidden by the existing stale filter until first successful scrape | N/A |
| Seeded store, scraped | cron POST fills `deals`, `stale:false` | Appears with its deals; **no** distance pill, **no** gas line | N/A |
| Record without `distanceMiles` | `distanceMiles` absent | **Kept** by normalize; renders w/o pill/gas; distance filter never drops it; sorts after distanced stores | N/A |
| Record with `distanceMiles` present | the 4 originals | Unchanged: pill + gas + filter + nearest-first as today | N/A |
| Record with `distanceMiles` present-but-bad | `NaN`/`Infinity`/`<0` | **Dropped** by normalize (corrupt-record signal preserved) | filtered out |
| Ingest for an unseeded id | id not in `data.json` | `'unknown'`, deals dropped, job red (unchanged) — hence records MUST be seeded | N/A |

</frozen-after-approval>

## Code Map

The blocker is a coupling, not a missing feature: `applyIngest` (`server/utils/applyIngest.ts:32`) updates only existing records; `normalizeDispensaries` drops record-without-distance; `groupDealsByStore`/the DealFeed filter/DealCard all read `distanceMiles` as a guaranteed finite number. Changes localize to: the type, the fetch-boundary validator, the two distance consumers, the seed data, and the scraper registry.

- `client/src/types/index.ts` -- make `Dispensary.distanceMiles` optional.
- `client/src/utils/normalizeDispensaries.ts` -- keep records when distance is **absent**; still drop when **present but invalid**; require `id:string` + `deals:array`.
- `client/src/components/DealCard.tsx` -- distance pill only when `distanceMiles` is finite; else omit (gas line already conditional).
- `client/src/components/DealFeed.tsx` -- distance filter passes stores with no distance; nearest-first still correct.
- `client/src/utils/sortDeals.ts` -- `groupDealsByStore` treats absent distance as `Infinity` (sorts last), stable.
- `server/data/data.json` -- add 18 Dutchie records (id/name/url, `stale:true`, epoch `lastFetchedAt`, `deals:[]`, **no** distanceMiles).
- `server/scrapers/dutchie-stores.ts` + `server/scrapers/index.ts` -- restore from stash; `...dutchieScrapers` auto-adds all 18 to the CI matrix (`storeIds`).
- `ADR.md` -- ADR-043.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/types/index.ts` -- `distanceMiles?: number`.
- [x] `client/src/utils/normalizeDispensaries.ts` (+ tests) -- keep on absent distance; drop on present-invalid; assert id+deals. Test: no-distance kept, NaN/neg dropped, missing id dropped.
- [x] `client/src/utils/sortDeals.ts` (+ tests) -- `?? Infinity` in the group comparator; test mixed distanced/undistanced ordering.
- [x] `client/src/components/DealCard.tsx` (+ test) -- guard pill on finite distance; null/absent → no pill, no crash.
- [x] `client/src/components/DealFeed.tsx` (+ test) -- filter keeps undistanced stores at any slider value.
- [x] `server/scrapers/dutchie-stores.ts`, `server/scrapers/index.ts` -- restore stashed registration (drop the `__pycache__` from the stash).
- [x] `server/data/data.json` -- seed 18 records from `DUTCHIE_STORE_IDS`; **HALT for Erik to confirm names/URLs** before commit.
- [x] `ADR.md` -- ADR-043: store visibility decoupled from distance; distance now optional enrichment. Cross-ref ADR-008/011 (untouched here; superseded in D2) and the line-77 data-hardening deferral.

**Acceptance Criteria:**
- Given a seeded store record with no `distanceMiles`, when `/api/data` is normalized and rendered, then the store is kept and shown with its deals, no distance pill, and no gas line — and nothing throws.
- Given the 18 scrapers are registered, when `printStores.ts` emits the CI matrix, then all 18 ids are present and `ingestRun --store <id>` resolves a scraper for each.
- Given a successful cron scrape of a seeded Dutchie store, when its deals POST to `/api/ingest`, then `applyIngest` matches the record (not `'unknown'`) and the store goes `stale:false` with deals.
- Given the 4 existing stores, when the feed renders, then their distance pill, gas line, radius filter, and nearest-first order are byte-for-byte unchanged.
- Given a mix of distanced and undistanced stores, when grouped, then distanced stores sort nearest-first and undistanced stores follow, deterministically.

## Design Notes

This deliberately leaves an **honest interim state**: after deploy, the 4 originals show a distance/gas, the 18 show deals only. That matches Erik's sequence (deals → distance → gas) and is non-destructive; Deliverable 2 then geocodes every store and replaces the fixed-origin distances with real per-user ones.

Deals do **not** appear at merge time — seeding makes the records eligible; they populate on the next successful GitHub Actions cron (or a manual `workflow_dispatch`). A store whose cName fails to resolve stays `stale` and simply doesn't show — correct, not a bug.

## Verification

**Commands:**
- `cd client && npx tsc --noEmit && npm test` -- expected: green; new normalize/sort/card/feed cases pass.
- `cd server && npx tsc --noEmit && npm test` -- expected: green; data.json shape valid.
- `cd server && npx tsx scripts/printStores.ts` -- expected: prints a JSON array containing all 18 new ids + the 5 existing.

**Manual checks:**
- Trigger `gh workflow run scrape-ingest.yml`; after it completes, `gmaslist.com/api/data` shows the new stores `stale:false` with deals, no distance/gas fields fabricated.
