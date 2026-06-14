---
title: 'Data hardening — validate dispensary shape at the client boundary and reject degenerate deals at ingestion'
type: 'bugfix'
created: '2026-06-13'
status: 'done'
baseline_commit: '374c34cb59ff392c20f1ae8d49373534560b4e06'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-retro-2026-06-13.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Malformed scraped/seed data can crash the app or surface junk. At the client, `useDeals` validates only the top-level array — a `null`/non-object dispensary element crashes `DealFeed` (`dispensary.stale`), and a `null`/`NaN`/`Infinity` `distanceMiles` crashes `DealCard` (`.toFixed(1)`) or slips past the distance filter via `0` coercion. At the server, a degenerate scraped window (`startTime === endTime`, or unparseable times) reaches `filterActiveDeals`, hits the overnight branch, and is promoted to **always-active**.

**Approach:** Add one validation home per boundary. Client: a pure `normalizeDispensaries` drops any record that fails the crash-path rules (Erik's call: drop the whole record), wired into `useDeals` so only well-formed dispensaries reach React. Server: a pure `normalizeDeals` rejects degenerate-window and malformed deals at the `runScrapers` ingestion chokepoint (Erik's call: reject the deal), before the empty-deals/stale check.

## Boundaries & Constraints

**Always:**
- Client drops a dispensary record unless ALL hold: it is a non-null object, `distanceMiles` is a finite number `>= 0`, and `deals` is an array. These are the three real crash paths.
- Server rejects an individual deal (keeps the dispensary's other deals) when its window is degenerate: both times present but `startTime === endTime`, or any present time fails 24-hour `HH:MM` parsing. A both-null window (all-day) and a one-sided window (one time null, the other parseable) stay valid. An overnight window (`end < start`) stays valid.
- Server also rejects a deal whose `daysValid` is not a non-empty array of valid tokens (the seven lowercase day names or `everyday`) — carried from retro lesson 2/action-item-3b (silent `filterActiveDeals` vocabulary mismatch).
- After `normalizeDeals`, an emptied deal list reuses the existing `runScrapers` contract: `deals.length === 0` → `stale = true`, `deals`/`lastFetchedAt` untouched.
- Both helpers are pure, exported, unit-tested, TypeScript strict.

**Ask First:**
- Any change to a `<frozen-after-approval>` predicate elsewhere (e.g. `DealFeed`'s strict `stale === true`, `filterActiveDeals`'s overnight logic). Do not modify them — fix upstream only.
- Expanding client validation to per-*deal* shape (currently server-only). If a client deal-element crash surfaces, HALT and ask before widening scope.

**Never:**
- No re-fetch, no React/UI behavior changes, no new dependencies.
- Do not "repair" a bad `distanceMiles` to a fabricated number, and do not normalize a degenerate window to all-day (would resurrect the always-active bug).
- Do not touch `filterActiveDeals`, `DealCard`, or `DealFeed` logic — once inputs are clean they already behave correctly.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean payload | Well-formed dispensaries + deals | All pass through unchanged | N/A |
| Null/non-object element | `dispensaries: [null, {...}]` | `null` dropped; valid kept | No throw |
| Bad distance | `distanceMiles` is `null`/`NaN`/`Infinity`/`-3` | Record dropped | No throw |
| `deals` not array | `deals: "x"` / missing | Record dropped | No throw |
| Zero-length window | deal `09:00`–`09:00` | Deal rejected at ingestion | Logged via existing run results |
| Unparseable time | deal `startTime: "9am"` / `"25:00"` | Deal rejected | No throw |
| Bad daysValid | `daysValid: ["Mon"]` / `[]` / `"monday"` | Deal rejected | No throw |
| All deals rejected | every deal degenerate | dispensary `stale = true`, prior deals untouched | Existing contract |
| Overnight window | `22:00`–`02:00` | Kept (valid) | N/A |

</frozen-after-approval>

## Code Map

- `client/src/hooks/useDeals.ts` — fetch boundary; today validates only top-level shape. Wire `normalizeDispensaries` over `json.dispensaries` before `setData`.
- `client/src/utils/normalizeDispensaries.ts` — **NEW** pure helper; sibling of `gasCost.ts`/`dealTime.ts`.
- `client/src/components/DealCard.tsx:20`, `DealFeed.tsx:84,90,96` — crash/coercion sites (context; unchanged — inputs become clean upstream).
- `server/utils/runScrapers.ts:37-47` — ingestion chokepoint for both scraper tiers; apply `normalizeDeals` to `scrape()` output before the `deals.length > 0` check.
- `server/utils/normalizeDeals.ts` — **NEW** pure helper; sibling of `filterActiveDeals.ts`.
- `server/utils/filterActiveDeals.ts` — defines deal validity (context; unchanged).
- `client/src/types/index.ts`, `server` shared `Deal`/`Dispensary` types — the shapes being validated.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/utils/normalizeDispensaries.ts` — export `normalizeDispensaries(raw: unknown[]): Dispensary[]`; keep only non-null objects with finite `distanceMiles >= 0` and array `deals`; drop the rest.
- [x] `client/src/hooks/useDeals.ts` — after the existing top-level guard, set `dispensaries` to `normalizeDispensaries(json.dispensaries)` before `setData`.
- [x] `server/utils/normalizeDeals.ts` — export `normalizeDeals(deals: Deal[]): Deal[]`; reject deals failing the window rule (both-present-and-equal, or unparseable present time) or the `daysValid` rule; keep valid ones.
- [x] `server/utils/runScrapers.ts` — apply `normalizeDeals` to `scrape()` output; use the cleaned array for the length check and the `dispensary.deals` assignment.
- [x] `client/src/utils/normalizeDispensaries.test.ts` & `server/utils/normalizeDeals.test.ts` — cover every I/O Matrix row.
- [x] `server/utils/runScrapers.test.ts` — add a case: a scraper returning a degenerate-only deal list yields `stale = true` with prior deals untouched. Also fixed pre-existing fixtures' `daysValid` to full lowercase names (retro lesson 2 — abbreviations were silently invalid).

**Acceptance Criteria:**
- Given a `/api/data` payload containing a `null` element and a record with `distanceMiles: NaN`, when the feed renders, then no exception is thrown and only well-formed dispensaries appear.
- Given a scraper returns a deal with `startTime === endTime`, when `runScrapers` ingests it, then that deal is absent from `data.json` and never becomes always-active.
- Given a scraper's deals are all rejected, when ingestion completes, then the dispensary is marked `stale` and its previous `deals`/`lastFetchedAt` are unchanged.
- Given clean data, when both helpers run, then output equals input (no false drops).

## Spec Change Log

## Design Notes

Time validity regex: `/^([01]\d|2[0-3]):[0-5]\d$/`. "Degenerate" = both times present and equal (zero-length). Overnight (`end < start`) is intentional and stays. One-sided windows (one time `null`) are an intended product state ("9:00 PM – close") — keep, but if the present time is unparseable, reject the deal.

Valid `daysValid` tokens (must match `filterActiveDeals`'s consumer exactly): `sunday monday tuesday wednesday thursday friday saturday everyday`, lowercase, array non-empty.

Client keeps validation at the dispensary level only — per-deal shape on the client is deliberately out of scope (server owns deal cleanliness for scraped data); see Ask First.

## Verification

**Commands:**
- `npm test --prefix server -- --run` — expected: all pass, incl. new `normalizeDeals` + updated `runScrapers` tests.
- `npm test --prefix client -- --run` — expected: all pass, incl. new `normalizeDispensaries` + `useDeals` tests.
- `npm run build` — expected: `tsc` clean on both client and server (no strict-mode errors).

## Suggested Review Order

**Server ingestion hardening**

- Entry point — the single chokepoint where scrape output is cleaned before the count/write.
  [`runScrapers.ts:41`](../../server/utils/runScrapers.ts#L41)

- The window rule: both-null/one-sided/overnight kept; unparseable rejected.
  [`normalizeDeals.ts:27`](../../server/utils/normalizeDeals.ts#L27)

- The crux — `start === end` zero-length window rejected (not normalized to all-day, which would resurrect the always-active bug).
  [`normalizeDeals.ts:31`](../../server/utils/normalizeDeals.ts#L31)

- daysValid vocabulary gate — rejects abbreviations the consumer drops silently (retro lesson 2).
  [`normalizeDeals.ts:38`](../../server/utils/normalizeDeals.ts#L38)

**Client boundary hardening**

- Drop malformed dispensary records before they reach render — one validation home.
  [`useDeals.ts:34`](../../client/src/hooks/useDeals.ts#L34)

- The three crash-path rules: non-object, bad `distanceMiles`, non-array `deals`.
  [`normalizeDispensaries.ts:19`](../../client/src/utils/normalizeDispensaries.ts#L19)

**Tests (peripheral)**

- Deal-level matrix: zero-length, unparseable, overnight, daysValid, null elements.
  [`normalizeDeals.test.ts:1`](../../server/utils/normalizeDeals.test.ts#L1)

- Dispensary-level matrix: null/non-object, NaN/Infinity/negative distance, non-array deals.
  [`normalizeDispensaries.test.ts:1`](../../client/src/utils/normalizeDispensaries.test.ts#L1)

- Ingestion integration: degenerate-only scrape → stale, prior deals preserved (+ fixtures fixed to valid vocabulary).
  [`runScrapers.test.ts:205`](../../server/utils/runScrapers.test.ts#L205)
