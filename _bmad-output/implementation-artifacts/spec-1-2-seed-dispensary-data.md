---
title: 'Seed Dispensary Data'
type: 'feature'
created: '2026-06-09'
status: 'done'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
baseline_commit: '9682d85abe3cf2e144c553789c9eaa338e794b15'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `server/data/data.json` and `server/data/logs.json` don't exist yet. The API endpoint (Story 1.3) and scraper (Epic 4) both need a populated, schema-correct `data.json` to read from and write to.

**Approach:** Create `server/data/data.json` conforming to the canonical schema (`meta` + `dispensaries[]`), seeded with real, ferry-free dispensaries within 50 road-miles of zip 98270 (Marysville, WA). Create `server/data/logs.json` initialized to `{ "runs": [] }`.

## Boundaries & Constraints

**Always:**
- Conform exactly to schema: `{ meta: { lastScraperRun, gasPrice, nationalMpg, gasPriceUpdatedAt }, dispensaries: [...] }` (full schema in epic-1-context.md)
- Each dispensary entry: `id` (kebab-case store slug), `name`, `url`, `distanceMiles` (number, road miles from 98270 per driving directions), `stale: false`, `lastFetchedAt` (ISO timestamp), `deals: []`
- `meta.nationalMpg = 28`; `meta.gasPrice` = a plausible current WA regular-gas dollar value (placeholder until Epic 3 EIA integration); `meta.gasPriceUpdatedAt` and `meta.lastScraperRun` = ISO timestamps
- camelCase for all JSON field names — never snake_case
- No dispensary requiring a ferry crossing from 98270 (Whidbey Island, Kitsap/Olympic Peninsula) is included
- At least 2 real, currently-operating dispensaries within 50 road-miles are seeded, each with `deals: []` (scraper populates later)

**Ask First:**
- If fewer than 2 verifiable real dispensaries within the constraints can be identified, halt and ask before fabricating or guessing entries.

**Never:**
- Do not implement the `GET /api/data` route or define `Deal`/`Dispensary`/`Meta`/`ApiDataResponse` TypeScript types — both are Story 1.3 scope.
- Do not modify anything under `client/`.

</frozen-after-approval>

## Code Map

- `server/data/data.json` -- new file, seed data conforming to canonical schema
- `server/data/logs.json` -- new file, empty operator log

## Tasks & Acceptance

**Execution:**
- [x] Research 2-4 real cannabis dispensaries within 50 road-miles of zip 98270 (Marysville, WA), excluding ferry-dependent areas (Whidbey Island, Kitsap/Olympic Peninsula) -- collect store name, website URL, kebab-case slug, and approximate driving distance from 98270
- [x] `server/data/data.json` -- create with `meta` block (`lastScraperRun`, `gasPrice`, `nationalMpg: 28`, `gasPriceUpdatedAt`) and `dispensaries[]` array per schema -- establishes the data foundation Story 1.3 and the Epic 4 scraper read/write
- [x] `server/data/logs.json` -- create with `{ "runs": [] }` -- operator log placeholder for Epic 4

**Acceptance Criteria:**
- Given `server/data/data.json`, when validated, then it matches `{ meta: {...}, dispensaries: [...] }` exactly with no extra/missing top-level keys
- Given each entry in `dispensaries[]`, when inspected, then it has exactly `id`, `name`, `url`, `distanceMiles`, `stale: false`, `lastFetchedAt`, `deals: []`
- Given the `dispensaries[]` array, when reviewed, then none require a ferry crossing from 98270, and at least 2 entries have `distanceMiles <= 50`
- Given `meta.nationalMpg`, then it equals `28`
- Given `meta.gasPrice`, then it is a plausible positive dollar value (e.g. between 3.50 and 5.50)
- Given `server/data/logs.json`, when read, then it equals `{ "runs": [] }`

## Verification

**Manual checks (if no CLI):**
- Open `server/data/data.json` and `server/data/logs.json` in an editor; confirm both are valid JSON and match the schema/AC above
- Spot-check that each seeded dispensary URL resolves to a real, currently active website

## Suggested Review Order

**Data schema**

- Entry point: meta block establishes gas price, national MPG, and scrape timestamps consumed by the API endpoint and gas-cost calculations.
  [`data.json:1`](../../server/data/data.json#L1)

**Seeded dispensaries**

- Four real Snohomish County dispensaries, all mainland/no ferry, with road-mile estimates from zip 98270.
  [`data.json:8`](../../server/data/data.json#L8)

**Operator log**

- Empty run log placeholder ready for Epic 4 scraper to append `{ runAt, results }` entries.
  [`logs.json:1`](../../server/data/logs.json#L1)

**Sprint tracking**

- Story 1.2 marked in-progress as part of this workflow run.
  [`sprint-status.yaml:48`](sprint-status.yaml#L48)
