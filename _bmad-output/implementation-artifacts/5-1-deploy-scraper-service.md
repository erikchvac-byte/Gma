---
baseline_commit: 67bef9fb85c511ed8cb5db94271c7e864be72e14
---

# Story 5.1: Scraper Service Deploy-Readiness (env-parametrize + topology ADR, live deploy deferred)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator of Gma's Helper,
I want the Dutchie scraper coupling de-hardcoded and the Render deploy path documented,
so that live scraping is one wiring step away when I approve a hosting budget — without spending money or changing today's behavior.

## Context & Scope Decision

Live scraping fails on Render today because the three Dutchie scrapers POST to a **hardcoded `http://localhost:8000/scrape`** (`server/utils/scraperClient.ts:9`) — the Python Playwright microservice (`C:\Users\erikc\Dev\Scraper`, ADR-017) that is **not deployed**. By contract, `scraperClient` swallows the failure and returns `[]`, so `runScrapers` marks those dispensaries `stale` and `/api/data` serves bundled/last-known deals.

**Deeper finding (drove the scope):** Happy runs on Render's **free web service, which spins down after ~15 min idle**. The live-scrape model is an **in-process `setInterval`** (`server/index.ts:53-56`, ADR-010) that fires on boot then hourly — so on free tier it **doesn't reliably run at all**. And Playwright+Chromium wants ~2GB shared memory (`../Scraper/docker-compose.yml` → `shm_size: "2gb"`) vs. free tier's 512MB. Truly-free live scraping with Playwright is **not viable** on Render.

**Erik's decisions (2026-06-15):** (1) **Stay free, defer live** — do not create Render services or spend money now; (2) **recommend the topology** in an ADR for when budget is approved.

**Therefore this story is deploy-READINESS + ADR, NOT a deployment.** It does the one free, safe, behavior-preserving code change (env-parametrize the URL) and documents the rest. No Render services are created. No money is spent. Bundled-data fallback behavior is unchanged.

## Acceptance Criteria

1. **Env-parametrized scraper URL.** `server/utils/scraperClient.ts` reads the target from `process.env.SCRAPER_URL`, falling back to `http://localhost:8000/scrape` when unset. The env value is read **per call inside `postScrape`** (not captured once at module load), so it is overridable at runtime and in tests.
2. **Behavior unchanged when env is unset.** With `SCRAPER_URL` unset (local dev, current Render), `postScrape` POSTs to exactly `http://localhost:8000/scrape` as before. The `[]`-on-any-failure contract (service down / non-2xx / `success:false` / timeout / malformed body) is fully preserved — no new throw paths.
3. **Tests cover the env behavior.** Existing `scraperClient.test.ts` suite stays green. Add a test asserting `postScrape` POSTs to a custom `SCRAPER_URL` when set, and to the default when unset. Use `vi.stubEnv` (and re-import / lazy read as needed) — do not leak env state across tests.
4. **Topology ADR recorded AND reconciled with prior ADRs.** `ADR.md` gains **ADR-033** documenting: the free-tier spin-down + RAM/shm finding; the **recommended target topology** (see Dev Notes — in-process model + Scraper as a Render **private** Docker service, both always-on paid, ~$14/mo); the cost-optimization alternative (cron + cached store, ~$7/mo, bigger refactor); the security rationale (private service keeps the scrape endpoint off the public internet); the **ephemeral-disk consequence** (Render's disk is not persistent — `data.json` resets on redeploy, self-heals via the boot-time `runScrapers()` at `server/index.ts:53`); and the explicit **deferral** decision (stay free for now). ADR-033 **cross-links ADR-031/032**, and the existing **Known Issues** entry at `ADR.md:329` (and the consequence note at `ADR.md:291`) are updated to point at ADR-033 and note the env-var half is now addressed (deploy still deferred) — so ADR-032 no longer presents this as fully open.
5. **Deploy runbook written.** A new `docs/deploy-scraper-runbook.md` gives step-by-step instructions to go live when budget is approved, including a **paste-ready `render.yaml` Blueprint for the `../Scraper` repo** and the `SCRAPER_URL` value to set on the Happy service (Render internal hostname form). The runbook lives in the Happy repo only — it does **not** modify the separate `../Scraper` git repo.
6. **Project state reflects the park.** `_bmad-output/implementation-artifacts/deferred-work.md` records that live scraping is parked pending budget, pointing at ADR-033 and the runbook.
7. **No spend, no services.** No Render services, cron jobs, databases, or disks are created. No changes are made to the `../Scraper` repo. Full server test suite passes; no regressions.

## Tasks / Subtasks

- [x] **Task 1 — Env-parametrize the scraper URL** (AC: 1, 2)
  - [x] In `server/utils/scraperClient.ts`, replace the module-level `const SERVICE_URL = 'http://localhost:8000/scrape'` with a per-call read: e.g. `const url = process.env.SCRAPER_URL || 'http://localhost:8000/scrape'` inside `postScrape`, used in the `axios.post(url, req, …)` call.
  - [x] Update the header comment (currently says "FastAPI on :8000") to note the URL is now `SCRAPER_URL`-overridable, default unchanged.
  - [x] Confirm the `[]`-on-failure contract and the 50000ms timeout are untouched.
- [x] **Task 2 — Tests for env behavior** (AC: 3)
  - [x] Update the existing "POSTs to the Python service /scrape endpoint" test if needed so it still asserts the default `http://localhost:8000/scrape` when `SCRAPER_URL` is unset.
  - [x] In the default-URL test, explicitly ensure `SCRAPER_URL` is unset (e.g. `vi.stubEnv('SCRAPER_URL', '')` — empty is falsy → default applies) so a stray ambient env value can't break it.
  - [x] Add a test: with `vi.stubEnv('SCRAPER_URL', 'http://scraper.internal:8000/scrape')`, `postScrape` POSTs to that URL. Unstub/restore after (no cross-test leakage).
  - [x] Run the full `scraperClient.test.ts` suite — all green.
- [x] **Task 3 — ADR-033 topology decision + reconcile prior ADRs** (AC: 4)
  - [x] Append ADR-033 to `ADR.md` in the house format (Status/Date/Context/Decision/Rationale/Consequences/Testing). Status: **Accepted (deferred — not yet deployed)**. Date: 2026-06-15.
  - [x] Capture: spin-down/RAM finding; recommended topology + cost; alternative + cost; security (private service); ephemeral-disk consequence (data.json resets on redeploy, self-heals on boot); deferral. Cross-link ADR-031/032.
  - [x] Update the existing **Known Issues** line at `ADR.md:329` and the consequence note at `ADR.md:291` to reference ADR-033 and note the env-var half is now addressed (deploy deferred) — do not leave them implying the whole issue is still open.
- [x] **Task 4 — Deploy runbook** (AC: 5)
  - [x] Create `docs/deploy-scraper-runbook.md` with: prerequisites (budget approved), the paste-ready Scraper `render.yaml` (Docker, `mcr.microsoft.com/playwright/python:v1.60.0-noble`, port 8000, private service), how to set `SCRAPER_URL` on the Happy Render service to the Scraper's internal hostname, how to upgrade Happy off free tier so the hourly `setInterval` runs, and a two-part verification step: (a) curl the scraper `/health` → `{"status":"ok"}` to confirm the service is up, then (b) hit `/api/data` and confirm Dutchie dispensaries flip `stale:false`.
  - [x] Do NOT touch the `../Scraper` repo — the runbook embeds the config for Erik to paste there later.
- [x] **Task 5 — Park the live work** (AC: 6)
  - [x] Add a section to `deferred-work.md` noting live scraping is parked pending budget, linking ADR-033 and the runbook.
- [x] **Task 6 — Validate, no-spend check** (AC: 7)
  - [x] Run the full server test suite (`cd server && npx vitest run` or the repo's configured command) — confirm no regressions. **87/87 pass (11 files); `tsc --noEmit` clean.**
  - [x] Confirm no Render service/cron/db/disk was created and `../Scraper` is unchanged (`git -C ../Scraper status` clean). **Zero Render API/MCP calls made this session; `git -C ../Scraper status` → clean (exit 0).**
  - [x] Update File List + Change Log.

## Dev Notes

### What to touch (all in the Happy repo)
- `server/utils/scraperClient.ts` — **UPDATE** (env var)
- `server/utils/scraperClient.test.ts` — **UPDATE** (env tests)
- `ADR.md` — **UPDATE** (append ADR-033)
- `docs/deploy-scraper-runbook.md` — **NEW**
- `_bmad-output/implementation-artifacts/deferred-work.md` — **UPDATE** (park note)

### `scraperClient.ts` — current state & required change
Current (`server/utils/scraperClient.ts:9, 41`):
```ts
const SERVICE_URL = 'http://localhost:8000/scrape'   // module-load constant
...
const res = await axios.post<ScrapeResponse>(SERVICE_URL, req, { timeout: 50000 })
```
**Guardrail — read env per call, not at module load.** A module-level `const` capturing `process.env.SCRAPER_URL` is evaluated once at import; a test that stubs the env after import would not see it. Read inside `postScrape` so it is runtime-overridable and `vi.stubEnv`-testable. Match the project env convention (`server/index.ts:13` `process.env.PORT || 3001`; `refreshGasPrice.ts:20` `process.env.EIA_API_KEY`) — i.e. `process.env.SCRAPER_URL || 'http://localhost:8000/scrape'`.

**Preserve the contract (ADR-017):** `postScrape` must NEVER throw — every failure returns `[]` so `runScrapers` degrades that one dispensary to `stale=true` (`server/utils/runScrapers.ts`) and the rest of the run still writes. Do not alter the try/catch, the `success===true && Array.isArray` guard, or the 50000ms timeout.

### Existing test coupling
`scraperClient.test.ts:61-69` asserts the exact URL `'http://localhost:8000/scrape'`. With the default preserved and env unset, this passes unchanged. Keep `vi.mock('axios')`; the new env test only changes the expected first arg of `mockedPost`.

### Recommended target topology (for ADR-033 — NOT built in this story)
**Recommendation: keep the in-process scrape model; deploy `../Scraper` as a Render private Docker service; run both services always-on (paid).**
- **Why:** zero refactor of the proven `runScrapers` → `normalizeDeals` → `atomicWriteJson(data.json)` pipeline and the per-scraper GraphQL→`Deal[]` transforms (ADR-030). Lowest risk. The only code change is the `SCRAPER_URL` env (done in this story).
- **Security:** a Render **private service** keeps `/scrape` off the public internet, reachable only via Render's internal hostname from the Happy service. (A public web service would expose the scrape endpoint.)
- **Cost:** two always-on Starter instances (~$14/mo). Happy must leave free tier so the hourly `setInterval` (`server/index.ts:53-56`) fires reliably; Chromium needs the paid tier's RAM/shm headroom.
- **Alternative (cost-optimization, ~$7/mo, deferred):** a Render **Cron Job** runs scraping on a schedule and writes to a shared store (Postgres/persistent disk); Happy stays cheap and reads the cache. Decouples scrape latency from requests and survives spin-down, but is a **bigger refactor** (move scraping out of the Node process, add a persistence layer, drop `setInterval`) and adds a store dependency. Note it; do not build it.

### Render deploy facts (from existing infra)
- Happy is already on Render as a **manual** Node web service (ADR-031/032); `render.yaml` exists at repo root for the web app, but the live service is manual, so render.yaml is not authoritative there.
- `../Scraper` is Dockerized and deploy-ready: `Dockerfile` (`FROM mcr.microsoft.com/playwright/python:v1.60.0-noble`, `EXPOSE 8000`, `CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"]`), `requirements.txt` pins `playwright==1.60.0` to the image tag. Browsers are pre-baked — do not `playwright install`.
- Render internal service URLs take the form `http://<service-name>:<port>` (private networking). The runbook's `SCRAPER_URL` should use this form, e.g. `http://gmaslist-scraper:8000/scrape`. **Verify this exact form against current Render docs at go-live** (Hypothesized — not verifiable from this repo).
- Config channel: `server/index.ts:7` already loads `dotenv/config`, so `.env` is the local config source (same as `EIA_API_KEY`). On Render, set `SCRAPER_URL` as a **dashboard environment variable** (not a committed `.env`) on the Happy service.

### Testing standards
- Framework: **Vitest** (`server/`), TypeScript strict mode (CLAUDE.md). Tests colocate as `*.test.ts`.
- Use `vi.stubEnv` / `vi.unstubAllEnvs` for env; never mutate `process.env` directly without restore.
- Red-green: write the failing custom-URL test first, then make it pass via the env read.

### Project Structure Notes
- This is a cross-cutting follow-up story with no parent epic — same pattern as `data-hardening` and `4-3-live-pass` in `sprint-status.yaml`. It is tracked individually under a new `5-1-deploy-scraper-service` key.
- All file changes are confined to the **Happy** repo. The `../Scraper` repo is intentionally untouched (Safety Rule: don't modify other systems without permission; runbook embeds its config instead).
- Per CLAUDE.md ADR rule: ADR.md MUST be updated this story (ADR-033) — that is an explicit AC, not optional.

### References
- [Source: server/utils/scraperClient.ts#L9,L41] — hardcoded URL to parametrize
- [Source: server/index.ts#L53-56] — in-process hourly `setInterval` scrape (spin-down problem)
- [Source: server/utils/runScrapers.ts] — `[]`/stale degradation the contract relies on
- [Source: ADR.md#ADR-017] — Python Scraper microservice contract & port 8000
- [Source: ADR.md#ADR-031, ADR-032] — current single-service Render deploy reality
- [Source: ../Scraper/Dockerfile, ../Scraper/docker-compose.yml, ../Scraper/requirements.txt] — Scraper image/port/deps & shm_size
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — existing park log

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- RED: new "POSTs to SCRAPER_URL when set" test failed against hardcoded `localhost:8000` (1 failed / 7 passed) — confirmed test correctness before the code change.
- GREEN: after env-parametrizing `postScrape`, `scraperClient.test.ts` 8/8 green.
- Full server suite: 87/87 pass (11 files). The `dataRoute.test.ts` stack trace in output is an intentional `readFileSync`-error mock (test passes). `tsc --noEmit` exit 0.

### Completion Notes List

- **AC1/AC2 (env-parametrize, behavior unchanged):** `scraperClient.ts` reads `process.env.SCRAPER_URL || DEFAULT_SERVICE_URL` **per call inside `postScrape`** (not at module load), so it is runtime-/test-overridable. Default `http://localhost:8000/scrape` preserved → no behavior change when unset. `[]`-on-any-failure contract, try/catch, and 50000ms timeout untouched; no new throw paths. Header comment updated to note `SCRAPER_URL` override (ADR-033).
- **AC3 (tests):** existing default-URL test tightened to explicitly stub `SCRAPER_URL=''` (falsy → default) so ambient env can't break it; added custom-URL test via `vi.stubEnv`; added `vi.unstubAllEnvs()` in `afterEach` to prevent cross-test leakage. 8/8 green.
- **AC4 (ADR-033 + reconcile):** ADR-033 appended (Accepted, deferred). Documents free-tier spin-down + RAM/shm finding, recommended topology (Scraper as Render private Docker service, both always-on ~$14/mo), ~$7/mo cron alternative, private-service security rationale, ephemeral-disk self-heal consequence, and the deferral. Cross-links ADR-031/032. ADR-031 consequence note + the Known-Issues "live scraping" line both updated to reflect env-var half done / deploy deferred. Change Log entry added.
- **AC5 (runbook):** `docs/deploy-scraper-runbook.md` created with paste-ready `../Scraper` `render.yaml` (private `pserv`, Docker, `/health` check, port 8000), `SCRAPER_URL` internal-hostname guidance (with go-live verify caveat), off-free-tier step, and two-part verification (`/health` → `{"status":"ok"}`, then `/api/data` Dutchie `stale:false`). Runbook lives in Happy only.
- **AC6 (park):** `deferred-work.md` gains a top "PARKED — Live scraping on Render" section linking ADR-033 + runbook.
- **AC7 (no spend):** zero Render API/MCP calls this session; `git -C ../Scraper status` clean (exit 0); 87 server tests pass, no regressions.

### File List

- `server/utils/scraperClient.ts` — UPDATED (per-call `SCRAPER_URL` read; header comment)
- `server/utils/scraperClient.test.ts` — UPDATED (default-when-unset tightened + custom-URL test + `vi.unstubAllEnvs`)
- `ADR.md` — UPDATED (ADR-033 appended; ADR-031 consequence + Known-Issues line reconciled; Change Log entry)
- `docs/deploy-scraper-runbook.md` — NEW
- `_bmad-output/implementation-artifacts/deferred-work.md` — UPDATED (park section)
- `_bmad-output/implementation-artifacts/5-1-deploy-scraper-service.md` — UPDATED (frontmatter baseline_commit, task checkboxes, Dev Agent Record, status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — UPDATED (status → review)

## Change Log

| Date | Description |
|------|-------------|
| 2026-06-15 | Story drafted (create-story). Scope set by Erik: stay free / defer live; deploy-readiness + ADR only. |
| 2026-06-16 | Amended per investigate review (`investigations/story-5-1-review-investigation.md`): AC4/Task 3 now reconcile ADR-031/032 + Known-Issues line; ADR-033 ephemeral-disk consequence; runbook `/health` check; default-URL test asserts SCRAPER_URL unset; dotenv/Render env-var note. No scope change. |
| 2026-06-16 | Implemented (dev-story). All 6 tasks done, 7 ACs satisfied. `SCRAPER_URL` env-parametrized (default unchanged, +2 tests); ADR-033 added + ADR-031/Known-Issues reconciled; runbook + deferred-work park written. 87 server tests pass, tsc clean. No Render spend; `../Scraper` untouched. Status → review. |
| 2026-06-16 | Review-verified (investigate follow-up): should-fix ADR reconcile confirmed against live `ADR.md` (ADR-033 + `:291`/`:338` lines). All backlog items closed; only Render internal-URL form remains (deferred to go-live). Status → done. |
