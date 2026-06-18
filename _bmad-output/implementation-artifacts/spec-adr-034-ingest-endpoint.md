---
title: 'ADR-034 Goal A — Authenticated /api/ingest endpoint (push-ingest of scraped deals)'
type: 'feature'
created: '2026-06-18'
status: 'done'
baseline_commit: '8b44649'
context:
  - '{project-root}/ADR.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ADR-034 inverts scraping from pull to push: a GitHub Actions runner will scrape Dutchie in a real browser and POST results to Render. That push target does not exist yet. This is Goal A only — the load-bearing ingest contract; the Actions workflow, scraper changes, observability rework, and retiring in-process scraping (Goals B/C/D) are deferred (`deferred-work.md`).

**Approach:** Add an authenticated `POST /api/ingest` to the Express app. It accepts a normalized per-store payload, validates shape + a shared secret, and writes **last-known-good** into `data.json` — reusing the proven `withDataLock` → `normalizeDeals` → `atomicWriteJson` pipeline that `runScrapers` already uses. Per-store partial success is allowed; good data is **never** overwritten with empty/invalid input.

## Boundaries & Constraints

**Always:**
- Reuse the existing write pipeline unchanged: `withDataLock` → `normalizeDeals` → `atomicWriteJson`. No second data-write path.
- Mirror `runScrapers` per-dispensary semantics: accepted deals → set `deals`, `lastFetchedAt=now`, `stale=false`; empty-after-normalize → leave `deals`/`lastFetchedAt` untouched, set `stale=true`.
- Only **update existing** dispensaries (match by `id` via `.find`) — never create, never index an object by a request key (prototype-pollution safe).
- Compare the secret with `crypto.timingSafeEqual`, length-guarded so it never throws.
- Fail closed: `INGEST_SECRET` unset → reject every request.

**Ask First:**
- Changing the request envelope away from `{ stores: [{ dispensaryId, deals }] }`.
- Writing to `logs.json` or surfacing richer per-store status — that is Goal B, out of this slice.

**Never:**
- Touch `runScrapers`/`scraperClient`/`setInterval` boot scraping (Goals B/C); ingest and in-process scrape coexist, serialized by `withDataLock`.
- Modify the `Deal`/`Dispensary`/`ApiDataResponse` types or `data.json` schema; build any Actions/registry/`../Scraper` change (Goal D).
- Add deps — use Node `crypto` + existing `express.json`.

## I/O & Edge-Case Matrix

Request: `POST /api/ingest`, header `x-ingest-secret: <secret>`, body `{ "stores": [{ "dispensaryId": string, "deals": Deal[] }, ...] }`.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Accepted store | valid secret; one store whose deals survive `normalizeDeals` | `200 { results: { <id>: "ok" } }`; that dispensary `deals` replaced, `lastFetchedAt`=now, `stale`=false; `meta.lastScraperRun`=now; atomic write | N/A |
| Empty/invalid deals | deals normalize to `[]` | `200 { results: { <id>: "stale" } }`; dispensary's prior `deals`+`lastFetchedAt` untouched, `stale`=true | never overwrite good data |
| Unknown dispensary | `dispensaryId` not in `data.json` | `200 { results: { <id>: "unknown" } }`; no write for that entry | per-entry skip, others still apply |
| Mixed batch | `[good A, empty B, unknown C]` | `200 { results: { A:"ok", B:"stale", C:"unknown" } }`; only A written | partial success |
| Missing/wrong secret | absent or mismatched `x-ingest-secret` | `401 { error, code:"UNAUTHORIZED" }`; no read/write | constant-time compare; generic message |
| Server misconfigured | `INGEST_SECRET` env unset | `503 { error, code:"INGEST_DISABLED" }`; no write | fail closed |
| Malformed body | not an object, `stores` missing/non-array/empty, or an entry missing `dispensaryId`/`deals` | `400 { error, code:"BAD_REQUEST" }`; no write | reject whole request |

</frozen-after-approval>

## Code Map

- `server/index.ts` -- add `app.post('/api/ingest', ingestRoute)`; global `express.json()` already mounted; SPA fallback regex already excludes `/api`.
- `server/routes/dataRoute.ts` (+ `.test.ts`) -- route + `{ error, code }` shape, and the supertest + `vi.mock('node:fs')` test pattern to copy.
- `server/utils/runScrapers.ts` -- canonical per-dispensary update semantics + `withDataLock`/`atomicWriteJson` write the ingest util mirrors.
- `server/utils/{normalizeDeals,atomicWrite,dataStore}.ts` -- reused verbatim (chokepoint, atomic publish, in-process mutex).
- `client/src/types/index.ts` -- canonical `Deal`/`Dispensary`/`ApiDataResponse` (do not edit); `server/types/index.ts` -- add the ingest entry type.

## Tasks & Acceptance

**Execution:**
- [x] `server/types/index.ts` -- add `IngestEntry` (`{ dispensaryId: string; deals: Deal[] }`) and the result type (`'ok' | 'stale' | 'unknown'`) -- shared contract for util + route + tests.
- [x] `server/utils/applyIngest.ts` -- export `applyIngest(entries, dataPath?)`: inside `withDataLock`, read `data.json`, for each entry `.find` the dispensary, `normalizeDeals(entry.deals)`, apply success/stale/unknown semantics, set `meta.lastScraperRun` when ≥1 entry accepted, `atomicWriteJson`; return the per-store results map. Default `dataPath` resolves like `runScrapers` (module-URL relative) -- keep test-overridable.
- [x] `server/routes/ingestRoute.ts` -- export `ingestRoute(req,res)`: 503 if `INGEST_SECRET` unset; constant-time, length-guarded secret check → 401; validate body is `{ stores: non-empty array }` with each entry well-formed → 400; else `await applyIngest(entries)` → `200 { results }`. Wrap in try/catch → `500 { error, code:'SERVER_ERROR' }`.
- [x] `server/index.ts` -- import and register `app.post('/api/ingest', ingestRoute)`.
- [x] `server/utils/applyIngest.test.ts` -- unit-test the matrix's write semantics against a temp `data.json` (accepted / empty-kept / unknown / mixed-batch / concurrent-lock; assert atomic last-known-good and untouched-on-empty).
- [x] `server/routes/ingestRoute.test.ts` -- supertest the auth + body-validation matrix rows (401 missing/wrong secret, 503 unset env, 400 malformed, 200 happy + results map, 500 on throw). Mock `applyIngest`.

**Acceptance Criteria:** (system-level; per-request behaviors are in the I/O Matrix)
- Given a successful ingest, when `GET /api/data` is called next, then the new deals appear for that source with `stale: false`.
- Given an ingest write and an in-process `runScrapers` write occur concurrently, when both run, then they serialize through `withDataLock` and `data.json` is never left partially written.
- Given the full server test suite, when run, then all prior tests still pass and `tsc --noEmit` is clean.

## Spec Change Log

## Design Notes

**Batch `{ stores: [...] }`** satisfies ADR-034's "per-store payload" + "partial success" in one shape; a length-1 array is exactly what one Actions matrix job sends. **`meta.lastScraperRun`** is refreshed only when ≥1 entry is accepted, so `/api/data` freshness reflects real ingestion, not a rejected POST.

**Constant-time secret check** — hash both sides to a fixed digest so the compare never branches on length (a raw length-guard leaks the secret length via timing; review patch):
```ts
import { createHash, timingSafeEqual } from 'node:crypto'
function secretOk(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
```

**Infra (not code, go-live):** set `INGEST_SECRET` on Render (mirror as a GitHub Actions secret in Goal D). Until set, the endpoint is fail-closed (503) — safe to deploy dark.

## Verification

**Commands:**
- `cd server && npx vitest run` -- expected: all suites pass, including `applyIngest.test.ts` + `ingestRoute.test.ts`.
- `cd server && npx tsc --noEmit` -- expected: no type errors.

**Manual checks:**
- With `INGEST_SECRET=test` set, `curl -s -X POST localhost:3001/api/ingest -H 'content-type: application/json' -H 'x-ingest-secret: test' -d '{"stores":[{"dispensaryId":"remedy-tulalip","deals":[]}]}'` → `200` with `{ results: { "remedy-tulalip": "stale" } }`; same call without the header → `401`.

## Suggested Review Order

**Endpoint contract & auth (entry point)**

- Start here: the HTTP handler — auth → body-shape gate → delegate, with the `{error,code}` envelope.
  [`ingestRoute.ts:26`](../../server/routes/ingestRoute.ts#L26)
- Constant-time secret check; hashes both sides so the compare never branches on length (review patch).
  [`ingestRoute.ts:10`](../../server/routes/ingestRoute.ts#L10)
- Per-entry body validation — every store must carry a string `dispensaryId` + array `deals`.
  [`ingestRoute.ts:17`](../../server/routes/ingestRoute.ts#L17)

**Last-known-good write (the load-bearing change)**

- The locked read-modify-write; mirrors `runScrapers`, reuses `normalizeDeals` + `atomicWriteJson`.
  [`applyIngest.ts:20`](../../server/utils/applyIngest.ts#L20)
- Update existing dispensaries only via `.find` (prototype-pollution safe); unknown ids skipped.
  [`applyIngest.ts:32`](../../server/utils/applyIngest.ts#L32)
- Empty-after-normalize never overwrites good data — only flags `stale` (the core safety invariant).
  [`applyIngest.ts:50`](../../server/utils/applyIngest.ts#L50)
- Single atomic write gated on a real mutation; `lastScraperRun` bumped only on accept.
  [`applyIngest.ts:56`](../../server/utils/applyIngest.ts#L56)

**Wiring & contract types**

- Route registered alongside `/api/data`; in-process scraping left intact (coexists via the lock).
  [`index.ts:28`](../../server/index.ts#L28)
- The `IngestEntry` / `IngestResult` push contract.
  [`types/index.ts:9`](../../server/types/index.ts#L9)

**Tests (peripheral)**

- Write-semantics matrix incl. last-known-good + concurrent-lock.
  [`applyIngest.test.ts:46`](../../server/utils/applyIngest.test.ts#L46)
- Auth + body-validation matrix (401/503/400/200/500).
  [`ingestRoute.test.ts:24`](../../server/routes/ingestRoute.test.ts#L24)
