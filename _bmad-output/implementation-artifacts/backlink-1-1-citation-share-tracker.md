---
baseline_commit: 40f9752bf3f5137c5f1ab4579e96e50d3fd9c383
---

# Story 1.1: Citation-share tracker

Status: review

<!-- DECISIONS CONFIRMED BY ERIK 2026-08-06 (pre-dev):
  1. Output location = PRIVATE measurement state under ~/GmaS-data/ (env-overridable); NOT committed, NOT served, NOT in $derivedFiles. (AR-1/AR-3 do not apply — see Dev Notes.)
  2. Scheduling IS in scope — Erik gave explicit go-ahead to wire the tracker into the weekly citation-monitor Task (AR-4 satisfied) by appending a step inside scripts/ai-citation-local.ps1 (the already-registered Task picks it up; no Scheduled Task re-registration). -->


<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator (Erik),
I want each citation-monitor run recorded as a dated share datapoint and its trend surfaced in a weekly report,
so that I can tell whether reach work is moving our AI-citation share against rivals without re-reading eight engine answers.

## Acceptance Criteria

**AC-1 — Record citation share per run (FR-1)**
- Given a completed citation-monitor run whose per-run "who was cited" data is available in the JSONL log,
- When the tracker runs,
- Then a new dated datapoint is appended to a persisted local JSON series recording gmaslist's citation count (n / total questions) and each rival domain's count over the seed-question set;
- And re-running for the same date updates that date's datapoint rather than duplicating it (idempotent — NFR-2);
- And the series survives across runs (persisted to a local file, not held only in memory).

**AC-2 — Compute trend vs rivals (FR-2)**
- Given a persisted series with at least two datapoints,
- When the report is generated,
- Then it shows the current share, the delta vs the previous datapoint, and the current rival leader with its share;
- And a first-ever citation (0 → ≥1) is called out explicitly, naming which engine and which seed query produced it.

**AC-3 — Surface the trend in the weekly report (FR-3)**
- Given a completed tracker run,
- When output is written,
- Then a one-screen human-readable markdown summary is written alongside the JSON series, containing current share, delta, rival leader, and any new-citation callout;
- And the report is produced both on the weekly schedule and on demand (the script is runnable standalone AND wired into the weekly Task via `ai-citation-local.ps1` — see Dev Notes "Scheduling"; go-ahead granted).

**AC-4 — Extend the monitor, no new engine calls (AR-2)**
- Given the tracker is built to extend the existing citation monitor,
- When it computes a datapoint,
- Then it consumes the monitor's existing JSONL output only and makes no new AI-engine calls beyond what the monitor already made.

**AC-5 — Fail-soft (NFR-1)**
- Given the monitor's log is missing, empty, or contains malformed lines,
- When the tracker runs,
- Then it writes an empty/partial report stating the reason (never crashes, never fabricates a datapoint); malformed JSONL lines are skipped with a noted count rather than aborting the run.

**Cross-cutting (epic-level, apply to this story):**
- Every surfaced item carries a source reference so the operator can verify before acting (NFR-3): each datapoint/report row is traceable back to the engine + seed query that produced it.
- Runs stay within the free-tier stack; the tracker adds zero marginal API cost because it makes no engine calls (NFR-4).
- TypeScript strict mode; tests written for all pure logic; the architectural decision recorded as ADR-113 in `ADR.md`.

## Tasks / Subtasks

- [x] Task 1 — Pure tracker logic module, unit-tested (AC-1, AC-2, AC-4, AC-5)
  - [x] Create `server/scripts/citationShareTracker.ts` as a PURE module (no `fs`, no network), mirroring the split in `citationMonitor.ts`. Import `CitationCheck`, `rivalDomainRanking`, `TARGET_DOMAIN` types/helpers from `./citationMonitor.js`.
  - [x] `groupChecksIntoRuns(checks, gapMs)`: sort by `timestamp`, split into runs on any gap larger than `gapMs` (default ~10 min; weekly runs are far apart, in-run checks are ~1.5s + API latency apart). Errored checks stay in their run.
  - [x] `computeShareDatapoint(runChecks)`: produce one datapoint (see recommended schema in Dev Notes) — per-engine gmaslist cited-question count / total questions, per-rival domain counts (reuse `rivalDomainRanking`), a run date (YYYY-MM-DD from the run's representative timestamp), question count, and per-check traceability (engine + questionId for any gmaslist citation).
  - [x] `mergeSeries(existing, derived)`: upsert derived datapoints into the existing series by date key; log-derived wins for dates present in the log; pre-existing datapoints for dates no longer in the log are retained (monotonic history, survives log rotation).
  - [x] `computeTrend(series)`: current share, delta vs previous datapoint, current rival leader + share.
  - [x] `detectFirstCitation(previousSeries, latestDatapoint)`: return the (engine, seed query) of any 0 → ≥1 transition, else null.
  - [x] `renderMarkdown(series, trend, firstCitation)`: one-screen summary — current share, delta, rival leader, new-citation callout, run date.
  - [x] Write `server/scripts/citationShareTracker.test.ts` (vitest, mirror `citationMonitor.test.ts` style) covering: run grouping (gap boundary, single run, errored checks), datapoint math (per-engine + per-rival), idempotent same-date upsert, monotonic merge, two-datapoint trend + delta, first-citation callout (engine + query named), and empty/malformed input → empty datapoint.
- [x] Task 2 — IO runner (AC-1, AC-3, AC-5)
  - [x] Create `server/scripts/citationShareRun.ts` (IO entry point, mirrors `aiCitationRun.ts`): resolve the monitor log path the SAME way `aiCitationRun.ts` does (`process.env.CITATION_LOG_PATH ?? ~/GmaS-data/citation-log.jsonl`); read + parse JSONL (skip malformed lines, counting them); load the existing series JSON if present; call the pure functions; write the series JSON and the markdown summary atomically.
  - [x] Resolve output paths (see Dev Notes "Output location — DECISION"): series JSON `citation-share.json` and markdown `citation-share.md`, defaulting alongside the monitor state under `~/GmaS-data/`, overridable by env (`CITATION_SHARE_PATH` / reuse the log's directory).
  - [x] Fail-soft: on missing/empty log, write a report stating the reason and exit 0; never throw an unhandled error (match `aiCitationRun.ts`'s `main().catch(...)` pattern).
  - [x] Add a run banner + console summary like `aiCitationRun.ts` (question count, engines seen, output path).
- [x] Task 3 — Wiring note + ADR (cross-cutting)
  - [x] Add a header comment to both new files pointing at ADR-113 and the reach-launch-plan, matching the existing citation files' comment style.
  - [x] Write ADR-113 in `ADR.md` (title, status Accepted, date, context, decision, rationale, consequences, testing) covering the output-location decision and the extend-don't-fork approach; add a change-log line.
  - [x] Wire the tracker into the weekly Task (AR-4 go-ahead GRANTED by Erik 2026-08-06): append a step in `scripts/ai-citation-local.ps1` that runs `npx tsx scripts/citationShareRun.ts` after the monitor run completes (inside the same `try`, cwd=server, after the monitor output is logged). The already-registered Scheduled Task invokes this ps1, so it picks up the new step automatically — do NOT re-register or alter the Scheduled Task itself, and do NOT touch `scripts/setup-ai-citation-task.ps1`. The tracker step must fail-soft in the runner (a tracker error must not fail the monitor run or the task).

## Dev Notes

### Confirmed monitor output shape (AR-2 — build-time confirmation, Open Q2)
- The monitor's per-run record is an append-only JSONL log of `CitationCheck` objects, one line per (engine × question). Written by `server/scripts/aiCitationRun.ts` (`fs.appendFileSync(outPath, JSON.stringify(check) + '\n')`).
- Log path: `process.env.CITATION_LOG_PATH ?? path.join(os.homedir(), 'GmaS-data', 'citation-log.jsonl')`. This log is home-machine measurement state — deliberately NOT committed and NOT served (comment in `aiCitationRun.ts`: "like products.db, this is home-machine measurement state").
- `CitationCheck` fields (from `citationMonitor.ts`): `timestamp` (ISO), `engine`, `model`, `questionId`, `question`, `cited` (hard: gmaslist.com in cited sources), `mentionedInText` (soft), `matchedUrls`, `citedDomains` (deduped, www-stripped, includes our own when present), `citationCount`, `answerSnippet`, `error?`.
- Reusable pure helpers already exist: `rivalDomainRanking(checks, domain)` (ranks rival domains by questions-cited-in, excludes our own + errored) and `summarize(checks)`. Use `rivalDomainRanking` for the per-run rival counts.
- Seed-question set: 8 questions in `server/scripts/citation-questions.json` (so `total` = 8 today). The set is operator-editable over time — do NOT hardcode 8; derive `total` from the distinct questionIds in the run. Tolerate the set changing between runs (Open Q2 answer: read it from the log, don't assume a fixed set).
- Two engines run today: `anthropic` (Haiku + web_search) and `perplexity` (Sonar). Because FR-2 requires naming "which engine" for a first citation, compute share PER ENGINE, and also expose a union headline (cited by either engine).

### Architecture — pure/IO split (mirror the monitor)
`citationMonitor.ts` is pure (unit-testable, no fs/network); `aiCitationRun.ts` is the IO half. Follow the same discipline: all share math and rendering in `citationShareTracker.ts` (pure), all reading/writing in `citationShareRun.ts`. This is what keeps AC-4 true — the tracker never calls an engine; it only reads the log the monitor already wrote.

### Recommended series + datapoint schema (guidance, not a rigid contract)
```
CitationShareSeries = { generatedAt: ISO, targetDomain: 'gmaslist.com', datapoints: CitationShareDatapoint[] }  // datapoints sorted by date asc
CitationShareDatapoint = {
  date: 'YYYY-MM-DD',
  runTimestamp: ISO,             // representative (max) timestamp of the run
  questionCount: number,         // distinct questionIds in the run
  engines: {
    [engine: string]: {
      model: string,
      gmaslistCitedQuestions: number,   // questions where cited === true
      mentionedOnlyQuestions: number,
      erroredQuestions: number,
      rivals: { [domain: string]: number },  // questions-cited-in, excluding gmaslist.com
      citedQueryIds: string[]                 // questionIds where we were cited (traceability, NFR-3)
    }
  },
  overall: { gmaslistCitedQuestions: number, questionCount: number }  // union across engines
}
```
Keep the schema additive-friendly; downstream stories don't read it, so exact field names are the dev's call as long as ACs are met.

### Idempotency + "one datapoint per run" (AC-1)
Group the full log into runs by timestamp gap, compute one datapoint per run, then `mergeSeries` upserts by date key. This makes same-date re-runs update rather than duplicate (NFR-2) automatically, and lets a first run backfill the whole series from existing log history. Preserve pre-existing datapoints whose date is absent from the current log so history is monotonic even if the log is rotated/truncated. (If timestamp-gap grouping ever proves fragile, the fallback is to stamp a per-run id in `aiCitationRun.ts` — an additive, backward-compatible field — but prefer the read-only gap approach to keep the tracker a pure consumer.)

### Output location — DECISION (confirm before dev-story; see closing note to Erik)
The planning artifacts (epic cross-cutting AC / addendum AR-1 / AR-3) say "write to `server/data/derived/*.json` and register in `$derivedFiles`." Reading the actual code, that conflicts with two hard facts:
1. The monitor this story extends keeps its state OFF git in `~/GmaS-data/` on purpose; and PRD §5 says these tools are "not a public/deployed surface." Writing the share series into `server/data/derived/` would commit reach-measurement data to a public repo and serve it via Render.
2. `$derivedFiles` in `scripts/derive-facts-local.ps1` is the commit list for files written by `deriveFactsRun.ts` inside the *derive* worktree/Scheduled Task (driven by `products.db`). The tracker runs on the *citation-monitor* schedule and reads the JSONL log — a different pipeline. Registering `citation-share.json` there would be a category error; that task never runs the tracker.

CONFIRMED BY ERIK 2026-08-06: treat the share series + markdown as private measurement state, written alongside the monitor's log under `~/GmaS-data/` (overridable by env), NOT committed, NOT served, and NOT registered in `$derivedFiles`. AR-1/AR-3 do not apply to this file. Default output dir = the monitor log's directory (`dirname(CITATION_LOG_PATH)`), overridable via `CITATION_SHARE_DIR`; series file `citation-share.json`, markdown `citation-share.md`.

### Scheduling (AR-4 — go-ahead GRANTED, IN scope)
The tracker runs right after the monitor on the existing weekly Scheduled Task (Mon 05:00). The monitor is invoked by `scripts/ai-citation-local.ps1` (cwd=server, `npx tsx scripts/aiCitationRun.ts`); the task is registered by `scripts/setup-ai-citation-task.ps1`. Append a second `npx tsx scripts/citationShareRun.ts` step after the monitor run inside `ai-citation-local.ps1`'s `try` block (log its output the same way, capture its exit code separately). Because the already-registered Scheduled Task invokes this ps1, the new step runs weekly automatically — do NOT re-register the Scheduled Task and do NOT touch `setup-ai-citation-task.ps1`. The tracker step must be non-fatal to the monitor: log a WARN on non-zero tracker exit, still `exit 0`.

### Testing standards
- Framework: vitest (see `server/scripts/citationMonitor.test.ts`). Co-locate `citationShareTracker.test.ts` next to the module.
- Run: `cd server` then the repo's test command (vitest). Also run the production build (`npm run build`) before considering done — `tsc --noEmit` + vitest can pass while the real build fails (repo lesson).
- Manual verify: `cd server ; npx tsx scripts/citationShareRun.ts` against the real local log; and against a temp `CITATION_LOG_PATH` pointing at a missing file (fail-soft) and a hand-written 2-run fixture (trend + first-citation callout).

### Project Structure Notes
- New files: `server/scripts/citationShareTracker.ts` (pure), `server/scripts/citationShareRun.ts` (IO), `server/scripts/citationShareTracker.test.ts`. Import path convention is `./citationMonitor.js` (note the `.js` extension in TS imports, per existing files).
- No client/server-runtime code is touched; nothing is added to the Express app or the served bundle (PRD §5).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1: Citation-share tracker] — story + ACs
- [Source: _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/prd.md#4.1 Citation-Share Tracker] — FR-1/FR-2/FR-3
- [Source: _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/addendum.md] — AR-1..AR-4 mechanism
- [Source: server/scripts/citationMonitor.ts] — pure types/helpers (CitationCheck, rivalDomainRanking, TARGET_DOMAIN); the module being extended
- [Source: server/scripts/aiCitationRun.ts] — log path, JSONL append, fail-soft pattern; the monitor output being consumed
- [Source: server/scripts/citationMonitor.test.ts] — vitest style to mirror
- [Source: server/scripts/citation-questions.json] — seed-question set (8 today, operator-editable)
- [Source: scripts/ai-citation-local.ps1 + scripts/setup-ai-citation-task.ps1] — where scheduling would attach (AR-4, gated)
- [Source: scripts/derive-facts-local.ps1#$derivedFiles] — the derive-pipeline commit list (why AR-3 does not apply here — see Output-location decision)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- Full server suite: 891/891 passing (70 files), incl. 28 new tracker tests.
- Server production build (`npm run build`): clean (tsc + copyData).
- End-to-end smoke: 2-run temp fixture → delta +1, rival leader weedmaps 2/2, first-citation callout named `[anthropic] "Best cannabis deals near Marysville, WA?"`; missing-log path → report-with-reason, exit 0. Also ran against the real `~/GmaS-data/citation-log.jsonl` (4 runs, latest 0/8).

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- Confirmed monitor output shape at build time (AR-2): tracker reads the append-only JSONL log `~/GmaS-data/citation-log.jsonl`, makes no engine calls.
- Output-location decision (ADR-113, confirmed by Erik): series JSON + markdown are private measurement state under `~/GmaS-data/` (`CITATION_SHARE_DIR` overridable) — NOT committed, NOT served, NOT in `$derivedFiles`. AR-1/AR-3 deliberately not applied; rationale in ADR-113.
- Idempotency (NFR-2) + monotonic history: series is recomputed from the log per run (runs split by timestamp gap) then upserted by date; prior-date datapoints survive log rotation.
- Fail-soft (NFR-1): missing/empty/corrupt log or unreadable existing series → report stating the reason + exit 0; malformed JSONL lines skipped and counted; runner never crashes the weekly task.
- Scheduling (AR-4, go-ahead granted): appended a NON-FATAL `citationShareRun.ts` step to `scripts/ai-citation-local.ps1` after the monitor run; the already-registered weekly Task picks it up (no Task re-registration; `setup-ai-citation-task.ps1` untouched).
- Added an `import.meta.url` direct-execution guard to the runner so importing `parseLog` in tests has no side effects (caught during test authoring — the import had run `main()` against the real log once).
- Note for Erik: that pre-guard test run created `~/GmaS-data/citation-share.json` + `.md` (correct real data, latest 0/8). It's the tool's intended private output; left in place (per safety rule, not deleting your data without asking) — remove it if you'd rather regenerate fresh.

### File List

- server/scripts/citationShareTracker.ts (new — pure logic)
- server/scripts/citationShareRun.ts (new — IO runner)
- server/scripts/citationShareTracker.test.ts (new — 28 unit tests)
- scripts/ai-citation-local.ps1 (modified — non-fatal tracker step wired into the weekly Task)
- ADR.md (modified — ADR-113 + change-log entry)
- _bmad-output/implementation-artifacts/backlink-1-1-citation-share-tracker.md (this story)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status updates)

### Change Log

- 2026-08-06: Implemented Story 1.1 (citation-share tracker) — pure tracker module + IO runner + 28 tests; wired into the weekly monitor Task; ADR-113. Status → review.
