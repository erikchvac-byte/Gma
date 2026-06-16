# Investigation: Review of story 5-1-deploy-scraper-service

## Hand-off Brief

1. **What happened.** Forensic review of story `5-1-deploy-scraper-service.md` against the codebase; its load-bearing code claims were **Confirmed accurate**, with one should-fix gap — it ignored that **ADR-032 already logged this follow-up as a Known Issue** (`ADR.md:291,329`).
2. **Where the case stands.** Concluded — and the should-fix gap is now **closed and verified** (Follow-up 2026-06-16): the story was amended, implemented via `dev-story`, and the live `ADR.md` reconcile confirmed against evidence. Story is at `review`.
3. **What's needed next.** Nothing on the ADR gap — resolved. Only Open thread is Hypothesis 1 (Render internal-URL form), correctly deferred to go-live and flagged in `ADR.md:309`.

## Case Info

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Ticket           | N/A (story review)                                                         |
| Date opened      | 2026-06-16                                                                  |
| Status           | Concluded                                                                  |
| System           | Happy (Node/Express + Vite/React, TS strict); Win11; Render free tier      |
| Evidence sources | source code, ADR.md, story file, sprint-status, ../Scraper repo artifacts  |

## Problem Statement

Erik asked to "review the story" — i.e. verify `5-1-deploy-scraper-service.md` is accurate, complete, and free of claims that would mislead the dev agent. Treated as an exploration/review case: verify each load-bearing claim against evidence; surface inaccuracies, gaps, and disasters.

## Evidence Inventory

| Source   | Status     | Notes     |
| -------- | ---------- | --------- |
| `server/index.ts` | Available | Read in full — scrape scheduler + dotenv |
| `server/utils/scraperClient.ts` | Available | Read in full — hardcoded URL, contract |
| `server/utils/scraperClient.test.ts` | Available | Read in full — URL assertion at :65 |
| `ADR.md` | Available (grep) | ADR-017, 031, 032 references to localhost:8000 |
| `../Scraper` Dockerfile/compose/reqs | Available | Image, port, shm_size confirmed |
| Render private-service URL form & pricing | Missing | External; not verifiable from repo |

## Confirmed Findings

### Finding 1: Hourly scrape interval is accurate
**Evidence:** `server/index.ts:15` `const SCRAPE_INTERVAL_MS = 60 * 60 * 1000`; used at `:54-56` after a boot-time `runScrapers()` at `:53`.
**Detail:** Story's "fires on boot then hourly" is exactly right. (Gas refresh is the separate 24h `REFRESH_INTERVAL_MS` at `:14,47-49`.)

### Finding 2: The hardcoded URL exists in exactly one production location
**Evidence:** Repo-wide grep (node_modules excluded): production hit only at `server/utils/scraperClient.ts:9` (`const SERVICE_URL = 'http://localhost:8000/scrape'`), plus test assertion `scraperClient.test.ts:65`.
**Detail:** Story's single-file scope (AC1, Task 1) is complete — no other prod file needs the env change.

### Finding 3: The []-on-failure contract is as the story describes
**Evidence:** `server/utils/scraperClient.ts:37-53` (try/catch, `success===true && Array.isArray` guard, 50000ms timeout); consumed by `server/utils/runScrapers.ts` (per-dispensary `stale=true` on empty/throw, rest of run still writes).
**Detail:** AC2's "no new throw paths / fallback preserved" is grounded.

### Finding 4: ../Scraper deploy facts are accurate
**Evidence:** `../Scraper/Dockerfile` (`FROM mcr.microsoft.com/playwright/python:v1.60.0-noble`, `EXPOSE 8000`, `CMD uvicorn api.server:app ... --port 8000`); `docker-compose.yml` `shm_size: "2gb"`; `requirements.txt` pins `playwright==1.60.0`.
**Detail:** Runbook (AC5) facts and the spin-down/RAM rationale (ADR-033) check out.

## Deduced Conclusions

### Deduction 1: The env approach is compatible with the existing config pattern
**Based on:** Finding (index.ts:7 `import 'dotenv/config'`) + `refreshGasPrice.ts:20` `process.env.EIA_API_KEY`.
**Reasoning:** dotenv is already loaded by the entrypoint and `process.env` is the established config channel. `process.env.SCRAPER_URL || default` read inside `postScrape` fits the convention and is `vi.stubEnv`-testable (tests don't import index.ts, so no dotenv interference).
**Conclusion:** AC1/AC3 are implementable as written; the per-call-read guardrail is correct and necessary.

## Hypothesized Paths

### Hypothesis 1: Render private-service internal URL form `http://<name>:<port>`
**Status:** Open
**Theory:** Story Dev Notes assert `SCRAPER_URL=http://gmaslist-scraper:8000/scrape` for internal networking.
**Supporting indicators:** Matches Render's documented private-service internal addressing pattern.
**Would confirm:** Render docs / a live private service's internal address at deploy time.
**Would refute:** Render requiring a different internal hostname scheme.
**Resolution:** Deferred — verify at go-live (runbook step). Low risk; does not affect the code change this story actually ships.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Render private-service URL form + current pricing | Affects runbook accuracy + ADR-033 cost figures (estimates only) | Render docs / dashboard at budget-approval time |

## Source Code Trace

| Element       | Detail                                      |
| ------------- | ------------------------------------------- |
| Change origin | `server/utils/scraperClient.ts:9,41` (URL const → per-call env read) |
| Trigger       | `runScrapers()` (boot + hourly, `index.ts:53-56`) → Dutchie scrapers → `postScrape` |
| Condition     | `SCRAPER_URL` unset → default `localhost:8000` (unchanged); set → overridden target |
| Related files | `runScrapers.ts`, `scrapers/index.ts`, `ADR.md`, `docs/deploy-scraper-runbook.md` (new) |

## Conclusion

**Confidence:** High

The story's code-facing claims are **Confirmed accurate** (Findings 1–4): correct interval, correct single-file scope, correct contract, correct deploy facts, and a correct, necessary "read env per call" guardrail. It is dev-ready. The defects are **completeness gaps in the ADR task**, not errors — most important: the story does not account for the pre-existing ADR-032 record of this very follow-up, risking duplicate/contradictory ADR content.

## Recommended Next Steps

### Fix direction (amend the story before dev-story)
1. **[Should-fix] AC4 / Task 3 — reconcile with existing ADRs.** Instruct the dev agent to: cross-link ADR-033 ⇄ ADR-031/032; and update the **Known Issues** line `ADR.md:329` (and the consequence at `:291`) to point at ADR-033 and note the env-var half is now addressed (deploy still deferred). Without this, ADR-032 keeps presenting the issue as fully open.
2. **[Minor] Runbook — add scraper `/health` check.** Verification should curl `<SCRAPER_URL host>/health` → `{"status":"ok"}` (per spec-4-3 runbook) before checking `/api/data` flips `stale:false`.
3. **[Minor] ADR-033 consequences — note ephemeral disk.** In-process model on Render: `data.json` resets on redeploy, self-heals via boot-time `runScrapers()`. Worth one line so it isn't a future surprise.
4. **[Minor] Tests — guarantee unset in the default-URL case.** The "default URL" test should ensure `SCRAPER_URL` is explicitly unset/empty so a stray env value can't break it.

### Diagnostic
None required — review complete.

## Side Findings

- `import 'dotenv/config'` at `server/index.ts:7` (Confirmed) — `.env` is the live config channel locally; on Render, `SCRAPER_URL` would be a dashboard env var. Runbook could state this explicitly.
- Memory note "no real EIA_API_KEY in .env yet" implies `.env` exists but is sparse — consistent with the env approach.

## Follow-up: 2026-06-16

**Trigger.** Erik asked to act on the should-fix ADR gap, then to verify it actually landed (the story had already been amended *and* implemented via `dev-story` after this case originally concluded — the original Hand-off Brief's "amend before dev-story" had gone stale).

**Verification result — should-fix gap CLOSED (Confirmed against live `ADR.md`):**

| Claim | Status | Evidence |
| ----- | ------ | -------- |
| ADR-033 exists, full house format, topology + cost + alternative + deferral | Confirmed | `ADR.md:303-310` |
| ADR-033 cross-links ADR-031/032 | Confirmed | `ADR.md:309` ("amends the deploy reality of ADR-031/032 … by adding a second service at go-live") |
| Ephemeral-disk consequence (data.json resets/self-heals) | Confirmed | `ADR.md:309` |
| ADR-031 consequence (`:291`) reconciled | Confirmed | "hardcoded `localhost:8000` has since been env-parametrized (`SCRAPER_URL`, ADR-033) … deferred pending budget (ADR-033)" |
| Known-Issues line reconciled | Confirmed | `ADR.md:338` — now "Live scraping deferred on Render (env-var half done)", cites ADR-033 + runbook; no longer presents the issue as fully open |

**Citation drift note.** The Known-Issues line moved `:329` → `:338` because inserting ADR-033 above it shifted line numbers. Content correct; only the original `:329` citation is now stale.

**Backlog resolution.**
- **[Should-fix] AC4/Task 3 ADR reconcile → DONE** (amended 2026-06-16, implemented dev-story, verified above).
- **[Minor] runbook `/health` check → DONE** (`docs/deploy-scraper-runbook.md`; also referenced `ADR.md:310`).
- **[Minor] ADR-033 ephemeral-disk note → DONE** (`ADR.md:309`).
- **[Minor] tests assert `SCRAPER_URL` unset in default case → DONE** (`scraperClient.test.ts`, `vi.stubEnv('SCRAPER_URL','')`).
- **Hypothesis 1 (Render internal-URL form) → still Open**, correctly deferred to go-live, flagged in `ADR.md:309` and the runbook.

**Status:** Concluded. All actionable backlog items closed; remaining Open item (H1) requires unavailable evidence (Render docs at go-live).
