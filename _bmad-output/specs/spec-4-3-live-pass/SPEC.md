---
id: SPEC-4-3-live-pass
companions:
  - live-pass-runbook.md
sources:
  - ../../implementation-artifacts/4-3-dutchie-iframe-dispensary-support.md
  - ../../implementation-artifacts/deferred-work.md
  - ../../implementation-artifacts/epic-4-context.md
  - ../../../../Scraper/HANDOFF.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Story 4.3 Live Pass — Dutchie Integration End-to-End Verification

## Why

A **deferred verification mandate.** Story 4.3 shipped the Dutchie/iFrame integration fully fixture-tested but never run against the live Python Scraper service (Erik deferred the live pass, 2026-06-13). Two of the three Dutchie stores ship with empty embed store IDs (`STORE_ID = ''` + a guard returning `[]`), so today they always degrade to Stale and never reach the feed. The synthesized `dutchie-specials.json` fixture is the *assumed* GraphQL shape, never reconciled against a real `GetSpecialMenuCards` capture — meaning the transform's discount-unit and time-window assumptions are unproven. Until this pass clears, Epic 4's promise — "deals come from real dispensary websites" — is unproven for the entire Dutchie tier, which is three of the four seeded dispensaries. This blocks R&D validation against live data.

## Capabilities

- id: CAP-1
  intent: An operator/agent can bring up the Python Scraper service and confirm Happy can reach it, so the live tier is exercisable.
  success: `GET http://localhost:8000/health` returns `{"status":"ok"}`, and a `scraperClient.postScrape` call from Happy against a known-good embed URL returns a non-empty `intercepted[]` (not `[]`).

- id: CAP-2
  intent: An operator/agent can resolve the live Dutchie embed store IDs for `jet-cannabis-everett` and `kush21-everett-evergreen` and wire them into their scraper files, so both stores stop short-circuiting to Stale.
  success: Both `server/scrapers/jet-cannabis-everett.ts` and `server/scrapers/kush21-everett-evergreen.ts` carry a non-empty `STORE_ID` confirmed to load a real Dutchie menu (intercept yields `GetSpecialMenuCards`); the unresolved-id guard is no longer the active code path for either.

- id: CAP-3
  intent: The team can confirm the live `GetSpecialMenuCards` GraphQL shape matches the `transformSpecials` assumptions, so real deals map correctly instead of silently wrong.
  success: A real intercepted capture is checked against the fixture on three points — JSON path (`data.specialMenuCards.specials`), discount unit (whole-number percent like `20`, not fraction `0.2`), and time-window representation (`happy_hour` vs `daily` split). Either the shapes match and `dutchie-specials.json` is replaced with a sanitized real capture, OR any material delta is documented and the pass halts for Erik per the frozen 4.3 boundary — `transformSpecials` is NOT silently reworked.

- id: CAP-4
  intent: All three Dutchie stores flow real deals end-to-end through the orchestrator into served data, so the live tier is proven.
  success: After a `runScrapers` run with the service up, `server/data/data.json` shows non-empty, schema-valid `deals` with `stale: false` for all three Dutchie dispensaries (`the-joint-everett`, `jet-cannabis-everett`, `kush21-everett-evergreen`), `GET /api/data` returns them, and `logs.json` records `ok` for each. Deals satisfy the Epic 4 contract: `daysValid` full-lowercase-or-`everyday`, 24h `HH:MM` window strings, `discountPct` number-or-null.

- id: CAP-5
  intent: The orchestrator stays crash-proof when the live service is unavailable mid-run, so a service outage degrades gracefully rather than poisoning the feed.
  success: With the service stopped, a `runScrapers` run completes without the Express process crashing; each Dutchie store is marked `stale: true`, its last valid `deals` are preserved (not overwritten with `[]`), and `logs.json` records the error per store.

## Constraints

- The frozen 4.3 contract holds. The `<frozen-after-approval>` Intent/Boundaries block in `4-3-dutchie-iframe-dispensary-support.md` is human-owned. `transformSpecials`/`scraperClient` are reworked only when a live delta forces it (CAP-3), and only after surfacing the delta to Erik — never silently.
- Do not build or modify the Python service at `C:\Users\erikc\Dev\Scraper`. It is a separate, already-tested project. This pass only runs it and consumes its API.
- Do not edit the orchestrator/storage primitives — `runScrapers.ts`, `atomicWrite.ts`, `dataStore.ts`/`withDataLock`. They are Story 4.1 deliverables; the live pass reuses them unchanged.
- Navigate only the Dutchie embed URL (`https://dutchie.com/embedded-menu/<storeId>`), never a dispensary's own site — the host page's lazy embed + broken proxy make it unreliable (HANDOFF).
- An embed ID that cannot be resolved BLOCKS the pass and is escalated to Erik. It is not silently re-deferred and the pass is not marked done with it outstanding (per the "all three stores live" done bar).
- No live network calls in `*.test.ts`. Existing tests remain offline/deterministic against fixtures; live verification is manual/operational, not a committed automated test.
- All changes preserve the scraper contract: `scrape(): Promise<Deal[]>`, never throws, `[]` on any error.

## Non-goals

- Relocating the four Dutchie-evidence HTML fixtures in `server/scrapers/__fixtures__/`. Stays a separate housekeeping item in `deferred-work.md` (Erik, this pass).
- `FilteredProducts` product scraping or pagination. Deals only — `GetSpecialMenuCards` only.
- Timezone math in the transform. Raw 24h strings are stored; `filterActiveDeals` evaluates in `America/Los_Angeles`.
- Deployment / Dockerizing the service or the 60-minute production schedule. This pass is local end-to-end verification only.
- The pre-launch verify-with-counsel register (WAC advertiser status, mandatory warnings, age-gate posture). Tracked separately in `deferred-work.md`.

## Success signal

With the Python Scraper service running locally, a single `runScrapers` invocation populates real, current Dutchie deals for all three Everett stores into `data.json`, `GET /api/data` serves them, and `logs.json` shows `ok` for each — and the synthesized fixture has either been confirmed accurate or replaced with a real capture. The Dutchie tier is proven against live data, closing the last open item in Epic 4.

## Assumptions

- The Python service runs locally on `:8000` for this pass (HANDOFF run instructions); production deployment is out of scope.
- `the-joint-everett`'s committed embed ID (`689cd028ea84b6a605458416`) is still valid; if it has gone stale it is treated the same as the unresolved IDs in CAP-2.
- Each target store currently has at least one active special. The orchestrator (`runScrapers.ts:42`) maps an empty/normalized-away return to `stale: true` + `error: scraper returned no deals` — so a store with *genuinely* zero specials is indistinguishable from a scrape failure in `data.json` and is told apart only by the `logs.json` message. The "all three live" done bar therefore presumes all three stores have active specials during the pass; a store legitimately showing zero specials is escalated to Erik, not silently counted as done.
- `runScrapers` has no standalone CLI trigger; it runs on server boot (`server/index.ts:32`) and hourly. The pass triggers a live run via `npm run dev` (boot scrape). Adding a one-off `scrape` script is out of scope unless Erik approves.

## Open Questions

- ~~If a store's host page yields no discoverable embed ID, is a manual browser inspection by Erik an acceptable fallback, or does that store get re-deferred?~~ **RESOLVED 2026-06-13 (Erik): BLOCK + escalate.** An unresolvable embed ID halts the pass and is surfaced to Erik with findings; not silently re-deferred, store not marked done. Reaffirms SPEC Constraint 5.
