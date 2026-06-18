---
title: 'ADR-034 Goal D — GitHub Actions cron scrape → POST /api/ingest (push pipeline)'
type: 'feature'
created: '2026-06-18'
status: 'done'
baseline_commit: '614bb52'
context:
  - '{project-root}/ADR.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-adr-034-ingest-endpoint.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Goal A shipped the `POST /api/ingest` push target, but nothing pushes. 3 of 4 Dutchie sources still show `stale` on live `gmaslist.com` because the only scrape trigger is the in-process `setInterval` on Render's free tier (spins down) calling a Python scraper at `localhost:8000` that isn't hosted. ADR-034 inverts this to push: a scheduled CI runner does the scraping and POSTs results in.

**Approach:** An hourly GitHub Actions cron (in the `Gma` repo) runs the **existing Node pipeline** — `server/scrapers` registry → `normalizeDeals` — against a Python scraper service **booted inside the CI job**, then POSTs each store's `Deal[]` to `https://gmaslist.com/api/ingest` with the shared secret, instead of writing `data.json`. The Python scraper is vendored into the Gma repo so one checkout runs the whole pipeline. A new `server/scripts/ingestRun.ts` is the push counterpart to `runScrapers` (scrape → POST, not scrape → write). Goals B/C stay deferred.

## Boundaries & Constraints

**Always:**
- Reuse the proven pipeline unchanged: per store, `normalizeDeals(await scrapers[id]())` → assemble `{ stores: [{ dispensaryId, deals }] }` → POST. No new transform, no new scrape logic — only the trigger (cron, not setInterval) and destination (HTTP POST, not `data.json` write) move.
- The runner reads `INGEST_URL`, `INGEST_SECRET`, `SCRAPER_URL` from env. Missing `INGEST_URL`/`INGEST_SECRET` → exit nonzero before scraping.
- Per-store job isolation: matrix with `fail-fast: false`, one store per job, so one store's failure never blocks others.
- Store list is single-source: `server/scrapers/index.ts` (the registry). The workflow matrix derives store ids from it at runtime — adding a store stays a one-line registry diff.
- Runner exit code surfaces silent failures: exit nonzero if the POST is non-200/unreachable OR any store's result is not `"ok"` (a `"stale"`/`"unknown"` result means that source got no fresh data). A red scheduled job is the failure alert (GitHub emails the owner).
- Vendored Python under `scraper-svc/` is a copy; `C:\Users\erikc\Dev\Scraper` remains the dev source-of-truth (note this in `scraper-svc/README.md`).

**Ask First:**
- Treating a `"stale"` result as success instead of job failure (would silence the exact silent-failure class this fixes).
- Changing cadence away from hourly, or the target away from `gmaslist.com`.
- Adding an explicit alerting integration (Slack/email step) beyond GitHub's built-in scheduled-failure email.

**Never:**
- Touch Goal B (`scraperClient.ts` error-swallow / per-store status in `/api/data`) or Goal C (retire `setInterval` `runScrapers` on Render) — both still deferred; in-process scrape and push ingest coexist (serialized by `withDataLock` server-side).
- Modify `applyIngest`/`ingestRoute`/the `/api/ingest` contract or the `Deal`/`IngestEntry` types — the runner is a pure client of the shipped Goal A endpoint.
- Port any TS transform to Python, or have the workflow write `data.json` directly.
- Commit the secret — it comes only from `secrets.INGEST_SECRET` (already set on the repo + Render).

## I/O & Edge-Case Matrix

Runner: `npx tsx server/scripts/ingestRun.ts --store <id>` (omit `--store` = all registered stores). Env: `INGEST_URL`, `INGEST_SECRET`, `SCRAPER_URL`.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh deals | store scrape yields deals; POST → `{results:{<id>:"ok"}}` | logs `<id>: ok`; exit 0 | N/A |
| Empty scrape | scrape normalizes to `[]`; POST → `{results:{<id>:"stale"}}` | logs `<id>: stale`; **exit 1** | good data kept server-side; job goes red |
| Unknown store flag | `--store` id not in registry | exit 1 before any scrape/POST; message lists valid ids | reject early |
| Missing env | `INGEST_URL` or `INGEST_SECRET` unset | exit 1, no scrape | fail closed |
| POST rejected | 401/503/400, or network/timeout | exit 1; status + body logged | caught; no partial-success masking |
| All stores (no flag) | every registered store scraped + POSTed | exit 0 only if every result is `"ok"`; else exit 1 | per-store result logged |

</frozen-after-approval>

## Code Map

- `server/scrapers/index.ts` -- the `scrapers` registry (id → `() => Promise<Deal[]>`); add `export const storeIds = Object.keys(scrapers)` as the single source for the CI matrix.
- `server/utils/normalizeDeals.ts` -- ingestion chokepoint, reused verbatim (runner mirrors `applyIngest`'s normalize-then-decide).
- `server/utils/scraperClient.ts` -- already `SCRAPER_URL`-overridable; the runner sets it to the CI-local service. Untouched.
- `server/utils/runScrapers.ts` -- canonical per-store loop the runner mirrors (scrape → normalize → decide), minus the `data.json` write.
- `server/types/index.ts` -- `IngestEntry`/`IngestResult` contract the runner builds + reads. Do not edit.
- `C:\Users\erikc\Dev\Scraper` -- source of the vendored Python service (`scraper/`, `api/`, `requirements.txt`); FastAPI `POST /scrape` + `GET /health`, booted via `uvicorn api.server:app`.

## Tasks & Acceptance

**Execution:**
- [x] `scraper-svc/` -- vendor the Python service from `C:\Users\erikc\Dev\Scraper`: copy `scraper/`, `api/`, `requirements.txt` (exclude `__pycache__`, `.pytest_cache`). Add `scraper-svc/README.md` stating the dev source-of-truth + re-sync note.
- [x] `server/scrapers/index.ts` -- add `export const storeIds = Object.keys(scrapers)`.
- [x] `server/scripts/ingestRun.ts` -- push-runner. Export `runIngest({ stores, ingestUrl, secret, registry?, postFn? }): Promise<{ ok: boolean; results: Record<string,IngestResult> }>`: for each store run `normalizeDeals(await registry[id]())`, assemble `{ stores: [{dispensaryId,deals}] }`, POST via `postFn` (default: `axios.post` with header `x-ingest-secret`), merge `results`, `ok` = POST succeeded AND every result `=== 'ok'`. Thin CLI wrapper: parse `--store`, read env, validate ids+env, call `runIngest`, log per-store results, `process.exit(ok?0:1)`.
- [x] `server/scripts/printStores.ts` -- `console.log(JSON.stringify(storeIds))`; the workflow's `prepare` job captures this into the matrix.
- [x] `.github/workflows/scrape-ingest.yml` -- `on: schedule: cron '0 * * * *'` + `workflow_dispatch`. Job `prepare`: checkout, setup-node 22, `npm install` (cwd server), run `printStores.ts` → `stores` output. Job `scrape`: `needs: prepare`, `strategy: { fail-fast: false, matrix: { store: ${{ fromJSON(needs.prepare.outputs.stores) }} } }`; steps: checkout, setup-node 22, `npm install`; **Dutchie-only** (`if: matrix.store != 'remedy-tulalip'`) setup-python 3.13, `pip install -r requirements.txt`, `python -m playwright install --with-deps chromium`, boot `uvicorn api.server:app` (cwd `scraper-svc`, port 8000, background) + poll `/health`; then run `ingestRun.ts --store ${{ matrix.store }}` with env `INGEST_URL=https://gmaslist.com/api/ingest`, `INGEST_SECRET=${{ secrets.INGEST_SECRET }}`, `SCRAPER_URL=http://127.0.0.1:8000/scrape`.
- [x] `server/scripts/ingestRun.test.ts` -- vitest the I/O matrix against an injected fake `registry` + `postFn`: ok→`{ok:true}`; empty/`stale`→`{ok:false}`; `postFn` throws→`{ok:false}`; correct body shape + `x-ingest-secret` header asserted; unknown store (registry miss) rejected; `parseStoreArg` covered.
- [x] `ADR.md` + `deferred-work.md` -- log Goal D build in the change log; move Goal D from deferred to done (B/C remain deferred).

**Acceptance Criteria:**
- Given the workflow run manually via `workflow_dispatch`, when it completes, then each Dutchie store job boots the scraper, POSTs, and a follow-up `GET https://gmaslist.com/api/data` shows that source with fresh `deals` and `stale: false`.
- Given a store whose scrape returns no deals, when its job runs, then the job fails (red) and `/api/data` still serves that source's prior last-known-good deals.
- Given the server test suite, when run, then `ingestRun.test.ts` passes and `cd server && npx tsc --noEmit` is clean.

## Spec Change Log

## Design Notes

**Why the runner is Node, not Python:** the Python service only returns raw intercepted GraphQL JSON (HANDOFF.md "What Is Not Built Yet"); the `GetSpecialMenuCards → Deal[]` transform lives in `server/scrapers/_dutchie.ts` (ADR-030). So CI boots Python *and* runs the Node pipeline against it — exactly `runScrapers` with the write swapped for a POST. The runner needs only **server** deps (`axios`, `tsx`); client imports in the scrapers are type-only and erased by `tsx`.

**remedy-tulalip** scrapes via Axios+Cheerio in-process (no Python) — hence the `if:` guard skipping the ~90s Playwright install for that job, saving CI minutes on the hourly run.

**Failure = red job:** ADR-034 §6 wants a job-failure alert. Exiting nonzero on any non-`ok` result makes GitHub's built-in scheduled-failure email the alert at zero cost, without building Goal B's `/api/data` per-store status surface.

## Verification

**Commands:**
- `cd server && npx vitest run` -- expected: all suites pass incl. `ingestRun.test.ts`.
- `cd server && npx tsc --noEmit` -- expected: no type errors.
- `INGEST_URL=https://gmaslist.com/api/ingest INGEST_SECRET=<secret> SCRAPER_URL=http://127.0.0.1:8000/scrape npx tsx server/scripts/ingestRun.ts --store remedy-tulalip` (local, no Python needed) -- expected: logs `remedy-tulalip: ok`, exit 0; then `/api/data` shows remedy fresh.

**Manual checks:**
- Trigger the workflow via `workflow_dispatch` from the Actions tab; confirm 4 matrix jobs, Dutchie jobs boot the scraper, and `/api/data` sources flip to `stale: false`.

## Suggested Review Order

**The push runner (the load-bearing change)**

- Start here: scrape → normalize → POST loop; the push counterpart to `runScrapers`, write swapped for an HTTP POST.
  [`ingestRun.ts:63`](../../server/scripts/ingestRun.ts#L63)
- Exit semantics = the alert: `ok` only if POST succeeds AND every per-store result is `'ok'` (stale/unknown/throw → red).
  [`ingestRun.ts:99`](../../server/scripts/ingestRun.ts#L99)
- Backstop timeout so one hung scrape can't pin the job for 6h (review patch).
  [`ingestRun.ts:88`](../../server/scripts/ingestRun.ts#L88)
- Default transport: POST with `x-ingest-secret`; rejects array/missing `results` (review patch).
  [`ingestRun.ts:31`](../../server/scripts/ingestRun.ts#L31)

**CLI + store selection**

- `--store` present-but-empty errors instead of silently scraping all (review patch).
  [`ingestRun.ts:132`](../../server/scripts/ingestRun.ts#L132)
- Empty store list fails loudly — no green no-op (review patch).
  [`ingestRun.ts:67`](../../server/scripts/ingestRun.ts#L67)

**Matrix as one source of truth**

- Registry is the only store list; `storeIds` feeds the CI matrix so adding a store is a one-line diff.
  [`index.ts:20`](../../server/scrapers/index.ts#L20)
- Workflow: hourly cron, per-store isolated matrix from `fromJSON`, Python booted only for Dutchie stores.
  [`scrape-ingest.yml:47`](../../.github/workflows/scrape-ingest.yml#L47)

**Tests (peripheral)**

- Runner I/O matrix: ok / stale / unknown / throw / empty / registry-miss, body + header asserted.
  [`ingestRun.test.ts:18`](../../server/scripts/ingestRun.test.ts#L18)
