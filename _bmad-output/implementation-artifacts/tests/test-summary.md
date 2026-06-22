# Test Automation Summary — Live Ingest / Freshness Path

**Date:** 2026-06-22
**Scope (requested):** ingest + freshness path — `POST /api/ingest`, `GET /api/data` per-store `ok|stale|failed`, alert-gate `evaluateAlert` (ADR-034 Goals A/B/D + §6)
**Framework:** Vitest 3 + Supertest (project's existing stack — no new deps)

## Gap Analysis

The path was already well unit-covered, but every piece was tested **in isolation with mocks**:

| Unit suite | What it mocks (so the seam is unproven) |
|---|---|
| `routes/ingestRoute.test.ts` | mocks `applyIngest` — never writes a real file |
| `routes/dataRoute.test.ts` | mocks `readFileSync` — never reads a real ingest write |
| `scripts/alertGate.test.ts` | feeds `evaluateAlert` hand-built arrays — not the real `/api/data` payload |
| `utils/applyIngest.test.ts` | exercises `applyIngest` directly, but not via the route or the read-back |

**Missing:** one integration test proving the pieces **compose** — that a real authenticated push becomes visible to a real read, and that the per-store `status` `GET /api/data` emits is the same signal §6's alert gate then acts on.

## Generated Tests

### Integration (API round-trip)
- [x] `server/integration/ingestFreshness.test.ts` — drives the **real** chain (no `applyIngest`/`evaluateAlert` mock) through a single temp `data.json`; only the file *location* is redirected at the `node:fs` layer so `POST /api/ingest` and `GET /api/data` hit the same fixture. 6 tests:
  1. Good push → written → immediately visible to `GET /api/data` as `ok` with active deals; 7h-stale store flips fresh.
  2. Empty/invalid push → `stale` result, last-known-good deals **and** `meta.lastScraperRun` untouched (no false freshness bump).
  3. Rejected push (bad secret) → 401, `data.json` byte-identical (no write on auth failure).
  4. `GET /api/data` derives `ok` / `stale` / `failed` per store from the persisted `lastFetchedAt` (`failed` = no parseable timestamp, Honest Math).
  5. §6 gate over the live payload: one fresh + one persistently-dark (+ a never-ingested, excluded) → `alert`, `totalFailure:false`, `staleStores:['kush21']`.
  6. §6 gate over the live payload: nothing fresh → `totalFailure` alert.

## Coverage
- `POST /api/ingest`: happy path + empty-push + auth-reject end-to-end ✅ (error/shape codes remain in `ingestRoute.test.ts`)
- `GET /api/data` status derivation: ok/stale/failed over a real persisted file ✅
- `evaluateAlert` over the actual served payload: targeted-stale + total-failure ✅
- Server suite: **173 passed (19 files)**, up from 167.

## Run
```
cd server && npx vitest run                                  # full suite
cd server && npx vitest run integration/ingestFreshness.test.ts   # this suite
```

## Next Steps (optional)
- Wire into CI alongside the existing `scrape-ingest` workflow checks.
- A true black-box E2E (boot `server/index.ts`, hit a live port) would also cover the `index.ts` wiring + SPA fallback, but needs a port harness — deferred; the route-level integration above covers the data logic.
