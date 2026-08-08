---
baseline_commit: 1e66563288ce54a50570bcd5b8072529acab9b21
---

# Story 1.3: Opportunity finder

Status: done  <!-- code-review 2026-08-07 (bmad-code-review, 3 adversarial layers): patches P1 (HIGH — NON_WA_TOKENS free-text false-drop), P5 (city word-boundary), P6 (matchFact statewide downgrade) applied; F4/F6 deferred → deferred-work.md; full findings in epic-backlink-1-code-review-2026-08-07.md. 965/965 server green, build clean. -->

<!-- DECISIONS pre-set from Story 1.1/1.2 precedent (ADR-113/ADR-114; Erik: "default to private output unless I say otherwise"):
  1. Output location = PRIVATE under ~/GmaS-data/ (env-overridable OPPORTUNITY_DIR); NOT committed, NOT served, NOT in $derivedFiles. AR-1/AR-3 do NOT apply (same rationale as ADR-113/114). See Dev Notes "Output location".
  2. NOT scheduled — this is an ON-DEMAND tool (FR-9 says "on demand"). AR-4 (Scheduled-Task go-ahead) is NOT triggered; do not touch ai-citation-local.ps1 or any setup-*-task.ps1.
  3. SEARCH = reuse the citation monitor's Haiku + web_search path (AR-5); NO paid search/backlink API. Perplexity Sonar available as the second engine. Fail-soft + --dry keyless path like the monitor.
  4. FACT-PAIRING = reuse Story 1.2's factPackager (selectFact/resolveGeo/topicMatchesCategory over the same committed server/data/derived/*.json, read-only). A candidate keeps its row ONLY if a gated fact answers it; else it is discarded (FR-7). No new fact math.
  Two design choices left to dev-start are RECOMMENDED (not open blockers) in Dev Notes "Search-engine reuse" and "Source-loading reuse"; proceed on the recommendation with the stated regression guard. -->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator (Erik),
I want a short ranked list of recent WA public threads that a gated gmaslist fact can answer, each paired with the fact and a suggested channel,
so that outreach this week is a 20-minute task instead of a research project.

## Acceptance Criteria

**AC-1 — Find answerable public questions, each paired with a gated fact (FR-7)**
- Given the existing Haiku + web_search / Perplexity stack (no paid API, no Reddit write access — AR-5),
- When the finder searches IN-channels for recent public questions/threads (Reddit, local community, journalist queries) about WA cannabis pricing/value,
- Then each surfaced candidate is a real, dated, linkable public item (has a URL; a posted/last-seen date when the source gives one);
- And each candidate is paired with the single specific honesty-gated gmaslist fact that answers it (via Story 1.2's `selectFact` over the committed derived JSON) — a candidate that no gated fact answers is discarded, never surfaced fact-less.

**AC-2 — Constrain to WA + IN-channels (FR-8)**
- Given a set of candidate threads,
- When filtering is applied,
- Then no surfaced candidate resolves to an OUT-channel or a rival/aggregator domain (weedmaps / leafly / leafbuyer / yelp / other directories — see Dev Notes "Rival / OUT-channel list");
- And out-of-WA candidates are dropped (a candidate whose only geo signal is a non-WA state/city is not surfaced);
- And a candidate with no resolvable link is dropped (NFR-3: every surfaced row is verifiable).

**AC-3 — Output a ranked worklist, on demand (FR-9)**
- Given filtered, fact-matched candidates,
- When the report is written on demand,
- Then it is a short ranked list, highest-fit first (ranking defined in Dev Notes "Ranking");
- And each row is actionable by a human in one read — the thread link, the matched gated fact (one line, with its source gmaslist URL), and the suggested IN-channel;
- And the worklist is capped to a small N (default 10, `--limit`-overridable) so it stays a 20-minute task.

**AC-4 — Honesty inheritance: only gated facts, low-side only, no fabrication (FR-6 carried, load-bearing)**
- Given the matched fact is produced by `selectFact`,
- When a row is rendered,
- Then the fact copy is exactly what Story 1.2 renders (its caveat + source URL + positioning line) — the packager's honesty guards are inherited verbatim (disparity LOW side only / no "$84 Donny Burger" high side, stale floors skipped, sub-1%/premium own-median suppressed, non-finite/≤0 rejected, no potency, no discount-hype, never implies gmaslist sells);
- And the finder itself invents no number and no claim beyond what `selectFact` returned.

**AC-5 — Fail-soft, low cost, idempotent shape (NFR-1, NFR-4, NFR-2)**
- Given the search engine is unavailable (no key), returns nothing, or returns unparseable output, or a derived JSON input is missing/empty/malformed,
- When the finder runs,
- Then it writes an empty/partial worklist stating the reason (never crashes, never fabricates a candidate or a fact), exit 0;
- And with `--dry` it runs the whole pipeline with no key and no cost (keyless placeholder, like the monitor);
- And live search stays within the free-tier stack — capped `web_search` uses per run, on the order of the ~$1/mo monitor (NFR-4);
- And re-running for the same topic/geo produces the same-shaped worklist from the same inputs (NFR-2; on-demand, no cross-run persistence in this story — that is Story 1.4's job).

**Cross-cutting (epic-level, apply to this story):**
- Every surfaced item and matched fact carries its source reference (thread URL + live gmaslist fact URL) so the operator can verify before acting (NFR-3).
- TypeScript strict mode; tests written for all pure logic; the architectural decision recorded as ADR-115 in `ADR.md`.

## Tasks / Subtasks

- [x] Task 1 — Pure opportunity-finder logic module, unit-tested (AC-1, AC-2, AC-3, AC-4)
  - [x] Created `server/scripts/opportunityFinder.ts` as a PURE module (no `fs`, no network), mirroring the pure/IO split in `citationMonitor.ts` / `factPackager.ts`.
  - [x] `parseCandidates(answerText): RawCandidate[]` — extracts the model's JSON array (whole → ```json fence → widest `[ ]` slice → `{ }` slice); tolerates a single object; skips entries with no string `url`; returns `[]` on garbage/empty (NFR-1, never throws).
  - [x] `isRivalOrOutChannel(url)` — reuses `citationMonitor.urlToDomain`; true for a host (or `.rival` subdomain) in `RIVAL_DOMAINS` (weedmaps/leafly/leafbuyer/yelp/allbud/dutchie/iheartjane/wikileaf/cannabis.net/bud.com) OR an unparseable/linkless URL (AC-2).
  - [x] `candidateGeoIsWa(candidate, regions)` — reuses `factPackager.resolveGeo` + exported `NON_WA_TOKENS`: keep `region`/`statewide`, drop `out-of-wa`; uncovered/empty → keep only on a clear WA text signal (region city / `WA_LOCALITY_HINTS` / "wa"/"washington") with no non-WA signal, else drop (conservative).
  - [x] `matchFact(candidate, sources, defaults)` — `selectFact(topic, resolveGeo(geo, regions), sources)`; returns the `CitableFact` or `null` when `kind==='none'` (discard). Topic/geo fall back to run-level values only when the candidate omits its own.
  - [x] `buildWorklist(raw, sources, opts)` — filter → pair → rank → cap. `Opportunity` carries `fact`, `factHeadline` (compact one-liner), `factCopy` (full `renderCopy`, AC-4), `factSourceUrl`, `fitScore`. `Worklist` carries `scanned`/`kept`/`reason`.
  - [x] `suggestChannel(candidate)` — reddit → "Reddit reply (r/…)", news/.gov → "Local-news tip / comment", .edu → forum, else "IN-channel reply" (never an OUT-channel).
  - [x] `factHeadline` + `renderWorklistMarkdown` + `renderWorklistJson` — one-screen numbered rows (link, matched-fact one-liner, gmaslist source URL, channel); empty worklist → explicit "No opportunities this run — <reason>", no fabricated/`$`-bearing row.
  - [x] Wrote `server/scripts/opportunityFinder.test.ts` (22 tests): parse (fence/bare/array/object/garbage→[]); rival + linkless drop; out-of-WA drop + WA keep (region/statewide/text-signal); matchFact pair vs discard; ranking + `--limit` cap; the "$84 Donny Burger" low-side inheritance; empty-worklist reason; markdown shape; CLI helpers.
- [x] Task 2 — Search-engine reuse (shared module) + regression guard (AC-1, AC-5, AR-5)
  - [x] PATH TAKEN = shared module: extracted `anthropicEngine`/`perplexityEngine`/`dryRunEngine`/`selectEngines`/`sleep`/`CITATION_MODEL`/`PERPLEXITY_MODEL`/`REQUEST_GAP_MS` + the root-`.env` load into a new side-effect-free `server/scripts/searchEngines.ts`. Refactored `aiCitationRun.ts` to import from it (behavior-preserving; its `main()`/JSONL/summary path unchanged).
  - [x] Regression guard: full server suite 932/932 green; `npx tsx scripts/aiCitationRun.ts --dry` still prints the monitor summary (8 questions, cited 0/8) — run against an ISOLATED temp `CITATION_LOG_PATH` so the real log is untouched; real `npm run build` clean. No fallback needed.
  - [x] The finder's engine call uses `max_uses: 5` and `user_location` = Washington/US (inherited from the shared `anthropicEngine`; AR-5, NFR-4).
- [x] Task 3 — IO runner + CLI (AC-1, AC-3, AC-5)
  - [x] Created `server/scripts/opportunityFinderRun.ts` (IO): parses `--topic`/`--geo`/`--limit` (default 10)/`--dry`; `buildSearchPrompt` instructs the engine to return a JSON array and to exclude rivals + non-WA; runs `search()` across `selectEngines` (per-engine try/catch, dedup by URL); `parseCandidates` the answer.
  - [x] Reuses Story 1.2's loader: exported `loadPackagerSources(dir)` + `derivedDir` from `factPackagerRun.ts` (refactored its `main()` to use `loadPackagerSources`) so the freshness-overlay omission lives in ONE place; the finder imports both.
  - [x] `buildWorklist` over parsed candidates + sources; writes `opportunities-<topic>-<geo>.md` + `.json` under `OPPORTUNITY_DIR` (default `~/GmaS-data/`) via atomic write; stdout = banner + markdown.
  - [x] Fail-soft: engine unavailable/empty/unparseable/missing derived JSON → empty worklist with a stated reason, exit 0; `import.meta.url` guard; top-level `.catch` → `process.exitCode = 0`.
- [x] Task 4 — ADR + header comments (cross-cutting)
  - [x] Header comments on all new files point at ADR-115 + the reach-launch-plan ("reuses the monitor search path, pairs candidates to gated facts via the packager, private output, on-demand, MEASURE-AND-SURFACE only").
  - [x] Wrote ADR-115 in `ADR.md` (context/decision/search-reuse-path-taken/source-reuse/honesty-inheritance/output-location override/rationale/consequences/testing) + a change-log row.
  - [x] Did NOT touch any Scheduled Task / ps1 (on-demand tool; AR-4 not triggered).

## Dev Notes

### What this tool is (and is NOT)
A MEASURE-AND-SURFACE tool: it finds real WA public threads a gated fact can answer and hands Erik a short ranked worklist. It performs NO outreach, NO posting, NO Reddit write access (AR-5) — a human does every act of outreach. It is the third of four backlink tools; build order is extend-first, and 1.1 (citation-share tracker) + 1.2 (fact packager) are already shipped (review). See `project_backlink-tooling` + `project_reach-launch-plan`.

### Architecture — pure/IO split (mirror the monitor + packager)
- `opportunityFinder.ts` — PURE: parse candidates, filter (rival/out-channel, WA, has-link), pair to a gated fact (delegates to `factPackager.selectFact`), rank, render markdown/JSON. No fs, no network. This is what makes the filters + ranking + honesty inheritance unit-testable.
- `opportunityFinderRun.ts` — IO: CLI, the web_search engine call, reading the derived JSON, writing the private report. Fail-soft everywhere.
- `searchEngines.ts` (new shared) — the pluggable engine set, extracted from `aiCitationRun.ts` (Task 2).

### Search-engine reuse (AR-5) — RECOMMENDED path + regression guard
`aiCitationRun.ts` today defines `anthropicEngine` / `perplexityEngine` / `dryRunEngine` / `selectEngines` as module-local consts and calls `main()` at top level with NO `import.meta.url` guard — so importing that file would trigger a live monitor run (unacceptable). RECOMMENDED: move the engines into a new side-effect-free `searchEngines.ts` and have BOTH `aiCitationRun.ts` and `opportunityFinderRun.ts` import them (one source of truth for the capped `pause_turn` loop + the `web_search_20250305` tool version pinned for Haiku). This honors AR-5 "reuse, don't fork the search path." Because the monitor's decision logic is already in the separately-tested `citationMonitor.ts`, the extraction only moves IO wiring; the regression guard is: full suite green + `aiCitationRun.ts --dry` still summarizes + build clean. FALLBACK (if the extraction shows any risk to the LIVE scheduled monitor): a self-contained capped web_search call inside `opportunityFinderRun.ts`, `aiCitationRun.ts` untouched. Record the path taken in ADR-115.

The engine returns `EngineAnswer { answerText, citedUrls, citationCount }` (see `citationMonitor.ts`). We read `answerText` (parse the candidate JSON out of it) and may use `citedUrls` as supplementary candidate links.

### Fact-pairing reuse (FR-7) — delegate to Story 1.2, do NOT re-implement fact math
For each candidate: `const geo = resolveGeo(candidate.geo ?? '', regions); const fact = selectFact(candidate.topic ?? '', geo, sources);` — keep the row iff `fact.kind !== 'none'`. This reuses every honesty guard in `factPackager.ts` (AC-4) and the exact source URLs the copy cites. Render the fact one-liner from the returned `CitableFact` (either call `renderCopy` and take its headline, or a compact one-line variant — keep the number + caveat truthful). The candidate's `topic` maps to a derived category via the packager's `topicMatchesCategory` + `CATEGORY_ALIASES` (already handles "vape"/"carts"/"dab"…). A candidate with no topic → `selectFact('', geo, …)` matches any category; the strongest fact for that geo is used (still gated).

### Source-loading reuse (freshness-overlay gotcha is LOAD-BEARING)
Load `PackagerSources { disparities, regions, ownMedianRows }` exactly as Story 1.2 does. RECOMMENDED: export `loadPackagerSources(derivedDir)` from `factPackagerRun.ts` (refactor its `main()` to use it) so the finder does not duplicate the read. CRITICAL: `loadRegions` must NOT pass a store→status map to `buildRegions` — the request-time 3h freshness overlay reads local `data.json` (hours-stale on a checkout) and falsely suppresses EVERY regional floor; committed floors are freshness-invariant per ADR-111 and Gate 6 is applied upstream (see ADR-114 + `factPackagerRun.ts:66-86`). Reuse, don't re-derive this.

### Rival / OUT-channel list (FR-8, load-bearing)
Directories/aggregators are RIVALS = OUT-channels, NEVER surfaced (the rival-not-distribution rule; `project_backlink-tooling`). Seed `RIVAL_DOMAINS` with at least: `weedmaps.com`, `leafly.com`, `leafbuyer.com`, `yelp.com`, `allbud.com`, `dutchie.com`, `iheartjane.com`, `where-to-get-weed`-style directories. Match on host equality OR `host.endsWith('.'+rival)` (reuse the `hostnameMatches` shape from `citationMonitor.ts`, or `urlToDomain` + set membership). IN-channels to search/keep: Reddit (r/CannabisWA, r/Seattle, r/washington, local city subs), local-community forums, local news, journalist queries. gmaslist.com's own domain is not a candidate.

### WA relevance (FR-8)
Reuse `factPackager.resolveGeo` + the `NON_WA_TOKENS` set (OR/ID/CA/portland/boise/…). A candidate is WA iff its geo signal resolves to `region` or `statewide`, OR (when `uncovered`/empty) a WA token / covered region city appears in the title+snippet. A clearly non-WA candidate (`out-of-wa`) is dropped. When in doubt with no WA signal, DROP (conservative — better to miss than to surface an out-of-state thread).

### Ranking (FR-9 "highest-fit first")
Fit score, descending: (1) fact strength in `selectFact`'s own precedence — regional-floor (geo+category specific) > disparity (statewide, larger `spreadPct` ranks higher) > own-median drop; (2) topic/category specificity of the match (a candidate whose topic named the matched category outranks a generic one); (3) recency (a parseable `postedDate` closer to now ranks higher; undated sinks below dated); (4) stable tiebreak by URL. Cap to `--limit` (default 10). Keep it a one-screen worklist.

### Search prompt (IO layer)
Instruct the engine (system/user) to: search recent public WA cannabis-shopper threads/questions on Reddit + local community + local news where a price-comparison fact would help; return ONLY a JSON array of objects `{url, title, snippet, topic, geo, postedDate}` (topic = the product/category asked about; geo = the WA locality if stated; postedDate = ISO or as-seen); exclude weedmaps/leafly/leafbuyer/yelp/directory results; prefer the last ~90 days. Keep `max_uses` ≤ 5. Parsing is defensive (`parseCandidates`) — the model may wrap JSON in prose or fences.

### Output location — DECISION (private; mirrors ADR-113/114)
Operator work-product (a worklist), not a served fact; PRD §5 says these tools are not a deployed/public surface. Primary deliverable = stdout; a private record `opportunities-<topic>-<geo>.md` + `.json` under `OPPORTUNITY_DIR` (default `~/GmaS-data/`), NOT committed, NOT served, NOT in `$derivedFiles`. AR-1/AR-3 deliberately not applied (record the override in ADR-115). The tool READS the committed `server/data/derived/*.json` (input, read-only) for fact-pairing.

### On-demand only (AR-4 NOT triggered)
FR-9 is explicit: the worklist is written "on demand." This story adds NO Scheduled Task and touches NO ps1. (Story 1.4, the unlinked-mention finder, is the one with a weekly-schedule question — and even that needs Erik's explicit per-action go-ahead under AR-4.)

### Testing standards
- Framework: vitest. Co-locate `opportunityFinder.test.ts`. Pure tests use hand-built `RawCandidate[]` + hand-built `PackagerSources` (reuse the fixture style from `factPackager.test.ts`: a disparity with a high/low pair, a clean regional floor, an own-median row) so the whole filter→pair→rank→render path is exercised with zero fs/network.
- Include the Donny-Burger inheritance test (a candidate matched to a high/low disparity → the row cites the LOW, never the $84 high) and the discard test (a candidate whose topic has no gated fact is not surfaced).
- Run `cd server` then the repo test command (vitest). Run the real `npm run build` before done — `tsc --noEmit` + vitest can pass while the production build fails (repo lesson).
- Manual verify: `cd server ; npx tsx scripts/opportunityFinderRun.ts --dry` (keyless, no cost — proves the pipeline + fail-soft on empty search); with a key, `--topic "cheapest flower" --geo bellingham`; and a missing-`DERIVED_DIR` run (fail-soft, exit 0). Also `npx tsx scripts/aiCitationRun.ts --dry` to prove the monitor didn't regress if Task 2 extraction was taken.

### Project Structure Notes
- New files: `server/scripts/opportunityFinder.ts` (pure), `server/scripts/opportunityFinderRun.ts` (IO), `server/scripts/opportunityFinder.test.ts`, `server/scripts/searchEngines.ts` (new shared engines, if the recommended Task 2 path is taken).
- Modified (recommended paths): `aiCitationRun.ts` (import engines from `searchEngines.ts`, behavior-preserving), `factPackagerRun.ts` (export `loadPackagerSources`), `ADR.md` (ADR-115), sprint-status.yaml.
- Import convention is the `.js` extension in TS imports (e.g. `./factPackager.js`, `./citationMonitor.js`).
- No client / server-runtime code is touched; nothing is added to the Express app or the served bundle (PRD §5). The tool imports server utils/scripts but runs only via `tsx` locally.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3: Opportunity finder] — story + ACs (FR-7/8/9)
- [Source: _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/prd.md] — FR-7/FR-8/FR-9, PRD §5 (not a deployed surface), §10 constraints
- [Source: _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/addendum.md] — AR-5 (search stack), AR-1/AR-3 (overridden here), AR-4 (scheduling gate — not triggered), AR-7 (reads derived JSON), AR-8 (repo norms)
- [Source: _bmad-output/implementation-artifacts/backlink-1-2-citation-ready-fact-packager.md] — the shipped fact packager: `selectFact`/`resolveGeo`/`topicMatchesCategory`/`CitableFact`, the freshness-overlay omission, private-output decision (ADR-114) to reuse
- [Source: _bmad-output/implementation-artifacts/backlink-1-1-citation-share-tracker.md] — pure/IO split, private-output (ADR-113), fail-soft + `import.meta.url` guard patterns
- [Source: server/scripts/factPackager.ts] — `selectFact`, `resolveGeo`, `topicMatchesCategory`, `CATEGORY_ALIASES`, `NON_WA_TOKENS`, `CitableFact`, `renderCopy`, `POSITIONING_LINE`
- [Source: server/scripts/factPackagerRun.ts] — source loading (`readDerived` + empty envelopes, `loadRegions` freshness-overlay omission) to reuse via an exported `loadPackagerSources`
- [Source: server/scripts/citationMonitor.ts] — `urlToDomain`, `hostnameMatches`, `EngineAnswer`, `CitationEngine`, `parsePerplexityResponse` (pure search-stack pieces)
- [Source: server/scripts/aiCitationRun.ts] — the Haiku + web_search engine wiring (Anthropic pause_turn loop, `web_search_20250305` for Haiku, Perplexity Sonar, `--dry`, root-`.env` load) to extract/reuse (AR-5)
- [Source: server/scripts/citationShareRun.ts] — IO runner pattern (env paths, atomic write, `import.meta.url` guard, fail-soft exit 0)
- [Source: server/data/derived/{disparities,regional-price-floor,price-vs-own-median}.json] — the live fact inputs (read-only)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- New unit tests: `opportunityFinder.test.ts` 22/22 passing (incl. the CLI helpers of the runner).
- Full server suite: 932/932 passing (72 files) — was 910 before this story (+22).
- Server production build (`npm run build`): clean (tsc + copyData).
- Monitor regression after the engine extraction: `npx tsx scripts/aiCitationRun.ts --dry` prints the normal summary (8 questions × 1 engine [dry-run], cited 0/8) — run against an isolated temp `CITATION_LOG_PATH`.
- Finder dry smoke: `--dry --topic "cheapest flower" --geo bellingham` → 0 candidates (dry engine makes no live search), empty-worklist-with-reason, exit 0, private record written to an isolated `OPPORTUNITY_DIR`.
- End-to-end smoke against the REAL committed derived data (throwaway script, 5 sample candidates): weedmaps (rival) + Portland OR (out-of-WA) dropped; 3 matched — #1 Bellingham flower → regional floor $4.80 `/compare/flower/bellingham`; #2 statewide vape carts → disparity as-low-as $23.00 (up to $60 elsewhere) `/compare/vaporizers`; #3 edibles → own-median 35% drop `/store/hangar-420-everett`. Ranking regional-floor > disparity > own-median; sources loaded 3 regions / 1267 disparities / 77 own-median rows.

### Completion Notes List

- Composes the two shipped tools: the citation-monitor search path (Story 1.1 chain) finds candidates; Story 1.2's `factPackager.selectFact` pairs each to a gated fact. The finder invents NO fact math — a row exists only when `selectFact` returns a `CitableFact`, so every honesty guard (disparity LOW side only / never the "$84 Donny Burger" high side, stale/sub-1%/premium suppressed, non-finite/≤0 rejected, no potency/hype/selling claim) is inherited verbatim (AC-4, proven by a dedicated low-side test).
- **Search-engine reuse (AR-5), path taken = shared module:** extracted the engines out of `aiCitationRun.ts` into a new side-effect-free `searchEngines.ts` that BOTH the live monitor and the finder import — one source of truth for the capped `web_search` pause_turn loop + the Haiku `web_search_20250305` tool-version pin. Behavior-preserving (monitor `--dry` regression clean); no fallback needed.
- **Source-loading reuse:** exported `loadPackagerSources(dir)` + `derivedDir` from `factPackagerRun.ts` (refactored its `main()`), so the load-bearing freshness-overlay omission (`loadRegions` must NOT pass a store→status map; ADR-111/114) lives in ONE place; the finder imports it.
- Rival-not-distribution rule enforced by `RIVAL_DOMAINS` (weedmaps/leafly/leafbuyer/yelp + aggregators) — directories are OUT-channels, never surfaced (FR-8). WA relevance is conservative: an ambiguous/no-signal candidate is dropped rather than surfaced.
- Output-location decision (ADR-115, mirrors ADR-113/114): worklist printed to stdout (deliverable) + recorded to `~/GmaS-data/opportunities-<topic>-<geo>.md/.json` (`OPPORTUNITY_DIR`-overridable) — NOT committed/served/in `$derivedFiles`. AR-1/AR-3 deliberately not applied; INPUT is the committed derived JSON (read-only).
- On-demand only — NOT scheduled; AR-4 not triggered; no ps1/Scheduled Task touched.
- Small additive export: `factPackager.NON_WA_TOKENS` (was module-private) so the finder's WA filter reuses the exact same non-WA token set as `resolveGeo`.
- ⚠️ Note for Erik: a `--dry` regression run I did early appended 8 dry-run rows (all `2026-08-07`, engine `dry-run`) to `~/GmaS-data/citation-log.jsonl`; the auto-mode classifier (correctly) blocked me from pruning them per the "never delete under ~/GmaS-data without asking" rule. They are harmless (cited:false) but would add one dry-run datapoint to the Story-1.1 share series — say the word and I'll remove exactly those 8 lines.

### File List

- server/scripts/opportunityFinder.ts (new — pure logic)
- server/scripts/opportunityFinderRun.ts (new — IO runner + CLI)
- server/scripts/opportunityFinder.test.ts (new — 22 unit tests)
- server/scripts/searchEngines.ts (new — shared pluggable search engines, extracted from aiCitationRun.ts)
- server/scripts/aiCitationRun.ts (modified — imports engines from searchEngines.ts; behavior-preserving)
- server/scripts/factPackager.ts (modified — export NON_WA_TOKENS)
- server/scripts/factPackagerRun.ts (modified — export loadPackagerSources + derivedDir; main() uses loadPackagerSources)
- ADR.md (modified — ADR-115 + change-log entry)
- _bmad-output/implementation-artifacts/backlink-1-3-opportunity-finder.md (this story)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status updates)

### Change Log

- 2026-08-07: Implemented Story 1.3 (opportunity finder) — pure `opportunityFinder.ts` + IO `opportunityFinderRun.ts` + 22 tests; extracted shared `searchEngines.ts` (reused by the monitor) and exported `loadPackagerSources` from `factPackagerRun.ts`; finds WA IN-channel threads, pairs each to a gated fact via `factPackager.selectFact`, filters rivals/out-of-WA, ranks a worklist; private output under `~/GmaS-data/`; ADR-115. Status → review.
