---
title: 'Reddit mention-monitor (Phase-2 reach, v1 notifier-only)'
type: 'feature'
created: '2026-08-09'
status: 'in-review'
baseline_commit: '1a184c58037fb43c5c3d36c7816a352163252988'
context:
  - '{project-root}/_bmad-output/brainstorming/brainstorming-session-2026-08-09-reddit-monitoring.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reach is the binding constraint and Reddit is a confirmed "you're the source, not a listing" channel (Perplexity already weights reddit.com 7/16 in the citation monitor). North-Sound WA shoppers ask price/trip-economics questions our engine can answer, but we can't see those threads while they're live (they die in 24–48h).

**Approach:** A LOCAL-ONLY daily Node/TS tool in the ADR-106 / Epic-backlink-1 mold: poll North-Sound subreddits' public `.json`, run a precision-biased regex+geo+inventory pre-filter, classify only survivors with Haiku (intent 1–6 + geo-confidence + routed tool), fact-gate every alert at capture via the existing `selectFact`, and append freshness-stamped rows to private JSONL + fire a Windows toast. Notifier only — a human replies by hand. Nothing outward-facing, no posting, no deploy impact.

## Boundaries & Constraints

**Always:**
- Reuse the shared honesty path: `loadPackagerSources` + `selectFact` (NO new fact math). Model-2 composition — no gated fact → no alert.
- Precision over recall (guardrail 3a): a post reaches Haiku only with a hard North-Sound geo token (specific city/store/region slug — NEVER bare "WA"/"Washington") AND an inventory signal (known store name, known brand/product name, OR a product-category term).
- Every alert row embeds `factAsOf` + `factFreshness` (guardrail 2), from the derived envelope `generatedAt` + per-floor `stale`.
- Emit only when Haiku geo-confidence ≥ 0.7.
- Private state under `~/GmaS-data/` only; atomic writes; fail-soft (bad fetch/parse/missing file → 0 alerts stating why, exit 0 — never crash, never fabricate). Dedup via `reddit-seen.json` (`t3_` IDs), expire IDs > 360 days.
- `--dry` writes to an isolated `REDDIT_LOG_PATH` and makes NO network/API call (mirrors the citation-monitor dry-run regression).
- Polite Reddit access: descriptive User-Agent + `REQUEST_GAP_MS` pacing. Each run prints a self-audit precision line `alerts fired / acted-on` (guardrail 3b).

**Ask First:**
- Registering the daily Scheduled Task — deliver `setup-reddit-monitor-task.ps1` but DO NOT run it (Erik's go-ahead).
- Adding an OAuth (`oauth.reddit.com`) fallback source — only if public `.json` gets rate-limited.

**Never:** auto-post / draft-and-post to Reddit; surface a rival/aggregator link; emit a number `selectFact` didn't vouch for; commit or serve this tool's output; touch server runtime/routes/bundle; add a paid API beyond the existing Haiku key.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Live match | Fresh post: Everett + known store, gated fact exists, conf 0.85 | One alert row w/ intent, routedTool, factSourceUrl, non-empty `factAsOf`/`factFreshness=fresh`; toast fired |
| Geo-only, no inventory | "Bellingham" but no store/brand/category | Dropped BEFORE Haiku (0 classify calls) |
| Broad-WA only | "Washington", no hard local token | Dropped before Haiku |
| No gated fact | Survivor classified, `selectFact`→`none` | No alert (Model-2 gate) |
| Low confidence | geo-confidence 0.5 | No alert |
| Stale fact | Matched regional floor `stale===true` | Row carries `factFreshness=stale` (selectFact already skips stale floors) |
| Reddit 429 / fetch fail | subreddit fetch errors | That sub skipped w/ warning; others proceed; exit 0 |
| No API key | `ANTHROPIC_API_KEY` absent | Dry-run classifier (no cost); pipeline still runs; note printed |
| Dry run | `--dry` | No network call; rows → `REDDIT_LOG_PATH`; real mentions log byte-unchanged |

</frozen-after-approval>

## Code Map

- `server/scripts/redditMonitor.ts` — NEW pure logic (no fs/network): types, `parseListing`, `preFilter`, `buildClassifyPrompt`, `parseClassification`, `buildAlerts`, `expireSeen`, `precisionLine`, `renderAlertsMarkdown`.
- `server/scripts/redditMonitorRun.ts` — NEW IO: fetch `.json`, Haiku classify (native fetch, NO web_search tool, dry-run fallback), `loadPackagerSources` + derived-envelope `generatedAt` + inventory tokens from `buildApiData`, seen/mentions I/O, self-audit line.
- `server/scripts/reddit-subreddits.json` — NEW editable config: North-Sound sub list + tier (mirrors `citation-questions.json`).
- `server/scripts/redditMonitor.test.ts` — NEW unit tests (all pure fns + every I/O-matrix row).
- REUSE (read-only imports, no edits): `factPackager.ts`/`factPackagerRun.ts` (`selectFact`, `resolveGeo`, `NON_WA_TOKENS`, `WA_LOCALITY_TOKENS`, `loadPackagerSources`, `derivedDir`), `searchEngines.ts` (`REQUEST_GAP_MS`, `sleep`, `.env` load), `buildApiData.ts`/`regionModel.ts` (store names + region cities).
- `scripts/reddit-monitor-local.ps1` — NEW runner (mirror `ai-citation-local.ps1`: no worktree, lock, `-Dry`, toast).
- `scripts/setup-reddit-monitor-task.ps1` — NEW registrar, DELIVERED-NOT-RUN.

## Tasks & Acceptance

**Execution:**
- [x] `server/scripts/redditMonitor.ts` -- pure pipeline (parse → preFilter → classify-parse → buildAlerts w/ fact-gate + freshness stamp + 0.7 threshold → expireSeen → render) -- no side effects on import.
- [x] `server/scripts/reddit-subreddits.json` -- seed North-Sound subs (r/everett, r/WAents, r/Bellingham, r/skagit, local) + tier tags -- editable without redeploy.
- [x] `server/scripts/redditMonitorRun.ts` -- IO wiring: fetch (polite UA + gap), Haiku classify (dry-run fallback), sources + envelope `generatedAt` + inventory tokens, read/write seen + mentions JSONL (isolated `REDDIT_LOG_PATH` on `--dry`), precision line -- fail-soft, exit 0.
- [x] `server/scripts/redditMonitor.test.ts` -- cover every I/O-matrix row + threshold/dedup/expiry/gate boundaries (20 tests).
- [x] `scripts/reddit-monitor-local.ps1` -- local runner mirroring `ai-citation-local.ps1` (lock, `-Dry`, end-of-run toast).
- [x] `scripts/setup-reddit-monitor-task.ps1` -- daily ~06:00 registrar w/ retry+battery settings; DELIVERED, NOT executed (Erik's go-ahead required).

**Acceptance Criteria:**
- Given a fresh North-Sound post naming a known store with a gated fact, when the monitor runs live, then exactly one alert row is appended carrying `intent`, `routedTool`, `factSourceUrl`, and non-empty `factAsOf`/`factFreshness`.
- Given the same post on a second run, when it runs, then no duplicate row is written.
- Given a post with a hard geo token but no store/brand/category signal, when it runs, then it is dropped before any Haiku classify call.
- Given `--dry`, when it runs, then `~/GmaS-data/reddit-mentions.jsonl` is byte-unchanged and no network call is made.
- Given `npm run build` and `cd server ; npx vitest run`, when run, then both pass green with the new tests included.

## Design Notes

**Precision gate reconciliation:** the brainstorm locked "hard geo AND in-inventory store/brand." Intent #3 ("prices insane") often names neither, so the inventory signal is store-name OR brand/product-name OR a product-category term (reuse `factPackager` category aliases). Keeps #3 alive while staying precision-biased. Flag if you'd rather require store/brand strictly and drop #3.

**Freshness source:** `CitableFact` carries no timestamp. Read each derived file's envelope `generatedAt` (same `readDerived` envelopes `loadPackagerSources` uses) into a kind→`generatedAt` map; stamp `factAsOf` by matched fact kind. `factFreshness='stale'` only when a regional-floor's `stale===true` (disparity/own-median inherit `'fresh'` — Gate-6 excluded stale upstream, ADR-111). Do NOT re-add the request-time status overlay (the `loadRegions` stale-overlay gotcha).

**Classify call:** plain Haiku messages call, NO web_search tool (retrieval already done by the `.json` fetch) → JSON `{intent:1-6, geoConfidence:0-1, matchedStore, matchedBrand, routedTool}`. Dry-run returns a keyless placeholder (never an alert). Reuse `searchEngines.ts` `.env` load; do not fork a new engine into `selectEngines`.

**Row shape:** `{ ts, subreddit, postId, url, title, intent, confidence, geoTokens[], matchedStore, matchedBrand, routedTool, suggestedFact, factSourceUrl, factAsOf, factFreshness }` — the row is both the notifier payload and the v2 draft-reply seed.

**Post-review notes (2026-08-10, 8-angle high-effort review):** six patches applied — (1) a store/brand-only survivor now passes `topic=''` to `selectFact` (a non-category token can't match a category, so it would have suppressed the region-floor fact); (2) the seen set advances only for deterministic non-survivors + survivors actually classified, so a transient classify error retries next run instead of losing the live thread; (4) both fetches carry an `AbortSignal.timeout`; (6) `buildAlerts` dedups within a run; (7) dead `PreFilterResult.matchedStore` removed; (8) runner `parseArgs` now unit-tested. Two known-and-accepted gaps left as-is (honesty/observability, not bugs): the self-audit `acted-on` count is always 0 until a human hand-marks `acted:true` on a mention row (no capture mechanism in v1 — the load-bearing signal is the alert-fired trend), and `factFreshness` is effectively always `'fresh'` because `selectFact` already excludes stale floors upstream, so the I/O-matrix "stale fact → `factFreshness=stale`" row is unreachable in practice (the human-visible `factAsOf` age carries the freshness signal instead).

## Verification

**Commands:**
- `cd server ; npx tsx scripts/redditMonitorRun.ts --dry` -- runs, 0 network calls, prints precision line + engine note, writes only to `REDDIT_LOG_PATH`.
- `cd server ; npx vitest run scripts/redditMonitor.test.ts` -- new tests green.
- `cd server ; npx vitest run` -- full server suite green (no shared-module regression).
- `npm run build` -- `tsc -b && vite build` clean (real Render build).

**Manual checks:**
- `~/GmaS-data/reddit-mentions.jsonl` untouched after a `--dry` run (compare mtime/bytes).
