---
baseline_commit: 3cdb4d66ceaf45c196e3c3b0d1ae68964a09d11b
---

# Story 1.4: Unlinked-mention finder

Status: review

<!-- DECISIONS pre-set from Story 1.1/1.2/1.3 precedent (ADR-113/114/115; Erik: "default to private output unless I say otherwise"):
  1. Output location = PRIVATE under ~/GmaS-data/ (env-overridable MENTIONS_DIR); NOT committed, NOT served, NOT in $derivedFiles. AR-1/AR-3 do NOT apply (same override + rationale as ADR-113/114/115). See Dev Notes "Output location".
  2. SEARCH = reuse the citation monitor's Haiku + web_search / Perplexity path via the shipped shared `server/scripts/searchEngines.ts` (AR-5); NO paid search/backlink API. Fail-soft + --dry keyless path like the monitor/finder.
  3. GSC input = a MANUAL weekly CSV export dropped into a known local path (AR-6, Open Q4). Read-only, fail-soft: if absent/empty/malformed, the finder still runs on the web-search link signal alone and states the reason. It is a CROSS-CHECK that EXCLUDES already-linking domains, never a hard dependency.
  4. Rival/OUT-channel + self-domain exclusion is REUSED from Story 1.3 (`opportunityFinder.isRivalOrOutChannel`) — a chase list is an outreach-target list, and §5 / §10.1 forbid ever targeting an OUT-channel or rival even to "measure" it. gmaslist.com's own domain is never a chase target.
  ONE dev-start GATE (not a silent default): the weekly-schedule wiring (attaching to the Mon 05:00 Task) is AR-4 territory and needs Erik's EXPLICIT per-action go-ahead. The on-demand CLI is the unconditional deliverable; see AC-5 + Task 5 + Dev Notes "Scheduling (AR-4 GATE)". -->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator (Erik),
I want a deduplicated chase list of public web mentions of "gmaslist" / "gma's list" that do NOT link to gmaslist.com,
so that I can turn existing brand mentions into real backlinks without re-reviewing mentions I already chased.

## Acceptance Criteria

**AC-1 — Detect unlinked brand mentions (FR-10)**
- Given the web_search stack (Haiku + web_search / Perplexity — AR-5) plus, when present, a manual GSC Links CSV export at a known local path (AR-6),
- When the finder searches for the brand names ("gmaslist", "gma's list"),
- Then each surfaced result is a real, dated-when-the-source-gives-one, linkable public source (has a resolvable URL) whose text actually mentions the brand;
- And a mention that already links to gmaslist.com is excluded — where "already links" means EITHER the search engine reports the page links to gmaslist.com OR the source's domain appears in the GSC linking-sites export (conservative cross-check);
- And gmaslist.com's own domain is never surfaced (a self-page is not a backlink opportunity).

**AC-2 — Constrain to real, chase-worthy sources (FR-10 carried, rival-not-distribution)**
- Given a set of candidate mentions,
- When filtering is applied,
- Then no surfaced mention resolves to an OUT-channel or rival/aggregator domain (weedmaps / leafly / leafbuyer / yelp / directories — reuses Story 1.3's `RIVAL_DOMAINS` via `isRivalOrOutChannel`), because a chase list is an outreach-target list and §5 / §10.1 forbid ever targeting an OUT-channel;
- And a candidate with no resolvable link is dropped (NFR-3: every surfaced row is verifiable).

**AC-3 — Deduplicate against prior runs, monotonic known set (FR-11, NFR-2)**
- Given a persisted local set of previously-seen mentions,
- When a new run completes,
- Then a mention surfaced in a prior run is NOT re-reported as new (matched by a normalized mention key — host + normalized path, www/case/trailing-slash/query-insensitive);
- And the persisted known-mention set grows monotonically across runs (this run's surfaced mentions are unioned into it; v1 never prunes — "unless a source disappears" is satisfied by never shrinking);
- And re-running the same day against the same search results reports zero new mentions (idempotent — NFR-2).

**AC-4 — Output a chase list (FR-12)**
- Given a completed run,
- When the report is written,
- Then it lists only new-since-last-run unlinked mentions by default, each row actionable in one read: the source URL, a context snippet, the posted/seen date when known, and a suggested IN-channel;
- And a one-screen human-readable markdown summary is written alongside the JSON chase list (JSON = machine record, markdown = human summary);
- And the report is producible both on demand and (subject to AC-5) on the weekly schedule.

**AC-5 — On-demand always; weekly schedule only with explicit go-ahead (FR-12, AR-4)**
- Given the tool is a candidate to attach to the existing weekly citation-monitor Scheduled Task (Mon 05:00),
- When the story is implemented,
- Then the on-demand CLI is delivered unconditionally (runnable via `tsx`, like the monitor/tracker/finder);
- And the weekly wiring (a non-fatal call appended to `scripts/ai-citation-local.ps1`, mirroring the Story 1.1 tracker) is NOT added, and NO Scheduled Task is registered or altered, without Erik's explicit per-action go-ahead (AR-4). If go-ahead is withheld at dev-start, the story still ships complete as an on-demand tool.

**AC-6 — Fail-soft, low cost, idempotent shape (NFR-1, NFR-4, NFR-2)**
- Given the search engine is unavailable (no key), returns nothing, or returns unparseable output, OR the GSC export is missing/empty/malformed, OR the known-mention file is missing/corrupt,
- When the finder runs,
- Then it writes an empty/partial chase list stating the reason (never crashes, never fabricates a mention), exit 0 — a corrupt known-mention file is treated as empty and rebuilt, never a crash and never a loss that would re-flag the whole world as "new" silently (the reason is stated);
- And with `--dry` it runs the whole pipeline with no key and no cost (keyless placeholder, like the monitor);
- And live search stays within the free-tier stack — capped `web_search` uses per run, on the order of the ~$1/mo monitor (NFR-4).

**Cross-cutting (epic-level, apply to this story):**
- Every surfaced mention carries its source reference (URL + context snippet) so the operator can verify before acting (NFR-3).
- TypeScript strict mode; tests written for all pure logic; the architectural decision recorded as ADR-116 in `ADR.md`.

## Tasks / Subtasks

- [x] Task 1 — Pure unlinked-mention logic module, unit-tested (AC-1, AC-2, AC-3, AC-4)
  - [x] Created `server/scripts/unlinkedMentionFinder.ts` as a PURE module (no `fs`, no network), mirroring the pure/IO split in `opportunityFinder.ts` / `citationShareTracker.ts`.
  - [x] Types: `RawMention`, `Mention` (output row), `KnownMention`, `KnownMentionSet`, `ChaseList`, `BuildOptions` — exactly as specified.
  - [x] `parseMentions` lives in the runner (IO layer, since it maps engine output); it reuses the SHARED tolerant extractor `looseJsonArray` (extracted from `opportunityFinder.parseCandidates` — see Dev Notes "JSON-extraction reuse"). Pure module exposes the extractor via `opportunityFinder.looseJsonArray`.
  - [x] `mentionsBrand(m)` — collapses apostrophes/spaces (`collapseForBrand`) and matches `gmaslist` / `gmas list` / `gma s list`; guards against off-topic engine results.
  - [x] `mentionKey(url)` — host (www-stripped, lowercased) + normalized pathname (trailing slash trimmed, query + fragment dropped); `''` for an unparseable URL.
  - [x] `normalizeGscDomains(csvText)` — tolerant CSV parse (comma/tab/semicolon), pulls the first domain-like token per row (bare host or URL), www-strip + lowercase, ignores headers/blanks; `Set<string>`, empty on garbage.
  - [x] `alreadyLinks(m, gscDomains)` — `m.linksToTarget === true` OR `urlToDomain(m.url)` ∈ `gscDomains` (conservative cross-check).
  - [x] `buildChaseList(rawMentions, known, opts)` — filter (rival/OUT-channel + linkless via `isRivalOrOutChannel`, drop `TARGET_DOMAIN` self incl. subdomains, `mentionsBrand`, `alreadyLinks`) → `mentionKey` → dedup vs `known` + within the run → NEW rows; `updatedKnown` = monotonic union of `known` + the SHOWN rows; dated-newest sort; returns `{ chaseList, updatedKnown }`.
  - [x] `suggestChannel` — REUSED from `opportunityFinder.suggestChannel` by passing a `{ url }` object (it reads only `.url`). Not forked.
  - [x] `renderChaseListMarkdown` + `renderChaseListJson` + `renderKnownSetJson` — one-screen numbered rows (source URL, context, date, channel); empty → explicit "No new unlinked mentions this run — <reason>", no fabricated row.
  - [x] Wrote `server/scripts/unlinkedMentionFinder.test.ts` (22 tests): brand match incl. apostrophe variants + off-brand reject; `mentionKey` normalization; `normalizeGscDomains`; `alreadyLinks` engine-flag + GSC cross-check; rival/self/already-linked/off-brand/linkless drop; new-vs-known dedup + idempotency (0 new on re-run); monotonic growth; within-run dedup; `--limit` overflow-resurfaces; empty-with-reason; dated-newest sort; markdown shape; CLI `parseArgs`/`buildSearchPrompt`.
- [x] Task 2 — Reuse the shared search stack (AC-1, AC-6, AR-5)
  - [x] Imports `selectEngines`/`sleep`/`REQUEST_GAP_MS` from the shipped `searchEngines.ts` — no fork, no re-extraction, no `aiCitationRun.ts` change.
  - [x] The engine call inherits `max_uses: 5` + `user_location` = Washington/US from the shared `anthropicEngine` (AR-5, NFR-4).
- [x] Task 3 — IO runner + CLI (AC-1, AC-3, AC-4, AC-6)
  - [x] Created `server/scripts/unlinkedMentionFinderRun.ts` (IO): parses `--limit` (optional; default = no cap) / `--dry`; `buildSearchPrompt` targets unlinked brand mentions and asks for a JSON array `{url,title,snippet,context,linksToTarget,postedDate}`, excluding self + rivals/aggregators; `search()` runs `selectEngines` (per-engine try/catch, dedup by URL), `parseMentions` via `looseJsonArray`, then brand-verifies.
  - [x] Reads the GSC export (`GSC_LINKS_EXPORT`, default `~/GmaS-data/gsc-links-export.csv`) → `normalizeGscDomains`; fail-soft absent/unreadable (empty set + stated reason).
  - [x] Reads the known set (`MENTIONS_DIR`, default `~/GmaS-data/`; `unlinked-mentions-known.json`); fail-soft absent (empty) or corrupt (empty + warning, mirrors `citationShareRun.readExistingDatapoints`).
  - [x] `buildChaseList` → atomic-writes `unlinked-mentions.md` + `.json` (NEW chase list) AND `unlinked-mentions-known.json` (monotonic ledger); stdout = banner + markdown.
  - [x] Fail-soft: engine unavailable/empty/unparseable → empty chase list with a stated reason, exit 0; `import.meta.url` guard; top-level `.catch` → `process.exitCode = 0`.
- [x] Task 4 — ADR + header comments (cross-cutting)
  - [x] Header comments on all new files point at ADR-116 + the reach-launch-plan.
  - [x] Wrote ADR-116 in `ADR.md` (context / decision / not-the-finder / search+JSON-reuse / GSC cross-check / dedup+monotonic-ledger / output-location override / scheduling go-ahead / rationale / consequences / testing) + a change-log row.
- [x] Task 5 — Weekly-schedule wiring (AC-5, AR-4) — Erik's explicit go-ahead GRANTED
  - [x] Go-ahead granted ("Task via ai-citation-local.ps1 should be weekly-schedule wiring to the Mon 05:00 Task"). Appended a NON-FATAL call to `scripts/ai-citation-local.ps1` after the citation-share tracker block (logged exit code, never propagated). No Scheduled Task re-registered — the existing Mon 05:00 Task already invokes this script.
  - [x] Verified: `ai-citation-local.ps1 -Dry` (with isolated `CITATION_LOG_PATH`/`CITATION_SHARE_DIR`/`MENTIONS_DIR`/`GSC_LINKS_EXPORT`) ran monitor → tracker → mention finder in sequence, all exit 0, real `~/GmaS-data` untouched.

## Dev Notes

### What this tool is (and is NOT)
The fourth and last of the four backlink tools. A MEASURE-AND-SURFACE tool: it finds real public pages that mention the brand but don't link, and hands Erik a deduplicated chase list. It performs NO outreach, NO posting, NO link placement (§5 permanent non-goal) — a human does every act of outreach. 1.1 (citation-share tracker), 1.2 (fact packager), 1.3 (opportunity finder) are all shipped (status review). See `project_backlink-tooling` + `project_reach-launch-plan`.

### Architecture — pure/IO split (mirror the finder + tracker)
- `unlinkedMentionFinder.ts` — PURE: parse mentions, filter (rival/out-channel, self, brand-real, already-linked, has-link), dedup against the known set, render markdown/JSON. No fs, no network. This is what makes the filters + dedup unit-testable.
- `unlinkedMentionFinderRun.ts` — IO: CLI, the web_search engine call, reading the GSC CSV + known-mention JSON, writing the private chase list + updated known set. Fail-soft everywhere.
- No new shared module: the search engines already live in `searchEngines.ts` (extracted in Story 1.3 / ADR-115). Import them; do not re-extract.

### Distinct from the opportunity finder (do NOT re-derive facts)
1.3 finds *questions a gated fact answers* and pairs each to a `factPackager` fact. 1.4 is different: it finds *mentions of the brand* — it does NOT read `server/data/derived/*.json`, does NOT call `factPackager`, and has NO fact-pairing or honesty-gate-inheritance path. There is therefore NO freshness-overlay gotcha here (that was a factPackager/regions concern). The only shared code is the search stack (`searchEngines.ts`) and two small helpers from `opportunityFinder.ts` (`isRivalOrOutChannel`, `suggestChannel`).

### JSON-extraction reuse (parseCandidates ↔ parseMentions)
`opportunityFinder.parseCandidates` already implements the exact defensive extraction we need (fence/prose/array/object/garbage-tolerant → `[]`). RECOMMENDED: extract its inner loose-JSON step into a tiny shared helper (e.g. `extractLooseJsonArray(text): unknown[]` — the whole/fence/`[ ]`/`{ }` cascade only, no field mapping) and have BOTH `parseCandidates` and `parseMentions` map their own fields off it — behavior-preserving for 1.3 (guard: 1.3's suite stays green). ACCEPTABLE FALLBACK: duplicate the ~25-line cascade in `parseMentions` (it is small and independently tested), leaving 1.3 untouched. Either is fine; record the choice in ADR-116. Not a blocker.

### GSC cross-check (AR-6, Open Q4)
GSC "Links → Top linking sites" lists domains that ALREADY link to gmaslist.com. The finder uses that set to EXCLUDE candidates whose domain already links (so we never chase a domain that's already a backlink source). This is a conservative exclusion: a domain can have some linking and some non-linking pages, so a GSC-domain match may drop a genuinely-unlinked page — that is the SAFE direction for a chase list (don't double-chase). The strong per-page signal is the engine's `linksToTarget`; GSC is the cross-check that catches pages the engine mislabels. The export is MANUAL (browser-only; the Chrome-extension read path has been blocked before — `project_gsc-crawl-not-content`), dropped at `GSC_LINKS_EXPORT` (default `~/GmaS-data/gsc-links-export.csv`). Fully fail-soft: no file → web-search link signal only, reason stated. Parse tolerantly — GSC export column layouts vary; pull the first domain-like token per row, skip headers/blanks.

### Dedup + monotonic known set (FR-11, NFR-2)
Persist `unlinked-mentions-known.json` = `{ generatedAt, targetDomain, mentions: KnownMention[] }`. A candidate is NEW iff its `mentionKey` is absent from the known set. After a run, `updatedKnown` = union(known, surfaced-this-run) — it only grows (v1 never prunes; "unless a source disappears" is satisfied by never shrinking). Mirror the idempotency precedent of `citationShareTracker.mergeDatapoints` (same-key updates, never duplicates). Idempotency test: run twice over the same `rawMentions` → second run's `newCount === 0`, `knownCount` unchanged.

### Known-set growth vs --limit
Default: NO cap — show ALL new unlinked mentions (unlinked brand mentions for a ~0-backlink brand are rare, and SM-2 wants every real one). If `--limit N` is passed, truncate the DISPLAYED list to N and add ONLY the displayed ones to `updatedKnown`, so the overflow resurfaces next run rather than being silently swallowed. Document this precisely in the runner + ADR. (Counter-metric SM-C1: do not pad the list; a long chase list is not better.)

### Rival / self exclusion (§5 / §10.1)
Reuse Story 1.3's `RIVAL_DOMAINS` via `isRivalOrOutChannel(url)` — directories/aggregators are OUT-channels and a chase list must never target one (§5 "no tool ever targets a directory... even to measure it as an outreach target"). Also drop `TARGET_DOMAIN` (gmaslist.com) itself and any unparseable/linkless URL. IN-channels to keep: independent blogs, local news, Reddit/community, journalist pages, `.gov`/`.edu`.

### Search prompt (IO layer)
Instruct the engine to web-search recent public pages mentioning "gmaslist" or "gma's list" (the WA cannabis price-comparison site gmaslist.com); return ONLY a JSON array of objects `{url, title, snippet, context, linksToTarget, postedDate}` where `context` = the sentence around the mention, `linksToTarget` = whether the page hyperlinks gmaslist.com, `postedDate` = ISO or as-seen; exclude weedmaps/leafly/leafbuyer/yelp/directory results; prefer results that mention the brand but do NOT link. Keep `max_uses` ≤ 5. Parsing is defensive (`parseMentions`).

### Output location — DECISION (private; mirrors ADR-113/114/115)
Operator work-product (a chase list + a private known-mention ledger), not a served fact; PRD §5 says these tools are not a deployed/public surface. Primary deliverable = stdout; private records `unlinked-mentions.md` + `.json` (the new chase list) and `unlinked-mentions-known.json` (the monotonic ledger) under `MENTIONS_DIR` (default `~/GmaS-data/`), NOT committed, NOT served, NOT in `$derivedFiles`. AR-1/AR-3 deliberately not applied (record the override in ADR-116). The GSC CSV is a read-only local input.

### Scheduling (AR-4 GATE — load-bearing)
FR-12 says the report is written "on the weekly schedule and on demand." The weekly half attaches to the existing Mon 05:00 citation-monitor Scheduled Task by appending a non-fatal call to `scripts/ai-citation-local.ps1` (the same script that Task already runs — no Task re-registration). BUT altering the scheduled path is AR-4 territory and needs Erik's EXPLICIT per-action go-ahead (standing repo rule; `feedback_sprint-status-upkeep`/`project_reach-launch-plan`). Story 1.1's tracker was wired this way; do the same ONLY on go-ahead. The on-demand CLI ships unconditionally, so the story is complete regardless of the scheduling decision.

### Testing standards
- Framework: vitest. Co-locate `unlinkedMentionFinder.test.ts`. Pure tests use hand-built `RawMention[]` + a hand-built `KnownMentionSet` + a hand-built GSC domain set — zero fs/network. Reuse the fixture style from `opportunityFinder.test.ts`.
- Include the dedup/idempotency test (run twice → 0 new the second time), the monotonic-growth test, the `--limit` overflow-resurfaces test, the GSC-cross-check exclusion test, the apostrophe-variant brand-match test, and the rival/self drop test.
- Run `cd server` then the repo test command (vitest). Run the real `npm run build` before done — `tsc --noEmit` + vitest can pass while the production build fails (repo lesson — `feedback_run-production-build-before-deploy`).
- Manual verify: `cd server ; npx tsx scripts/unlinkedMentionFinderRun.ts --dry` (keyless, no cost — proves the pipeline + fail-soft empty). With a key: a live run; then an immediate second run to prove 0-new idempotency. A run with a missing `GSC_LINKS_EXPORT` (fail-soft, exit 0) and with a corrupt `unlinked-mentions-known.json` (rebuilt, reason stated, exit 0).

### Project Structure Notes
- New files: `server/scripts/unlinkedMentionFinder.ts` (pure), `server/scripts/unlinkedMentionFinderRun.ts` (IO), `server/scripts/unlinkedMentionFinder.test.ts`.
- Modified: `ADR.md` (ADR-116), `sprint-status.yaml`; OPTIONALLY `server/scripts/opportunityFinder.ts` (extract the shared loose-JSON helper — only if the recommended reuse path is taken, behavior-preserving); `scripts/ai-citation-local.ps1` ONLY on Erik's AR-4 go-ahead.
- Import convention is the `.js` extension in TS imports (e.g. `./searchEngines.js`, `./opportunityFinder.js`, `./citationMonitor.js`).
- No client / server-runtime code is touched; nothing is added to the Express app or the served bundle (PRD §5). The tool imports server scripts but runs only via `tsx` locally.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: Unlinked-mention finder] — story + ACs (FR-10/11/12) + the AR-4 scheduling AC
- [Source: _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/prd.md] — FR-10/11/12, §5 non-goals (no automated placement, never target OUT-channels), §7 SM-2/SM-C1, §10 constraints, §11 NFRs
- [Source: _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/addendum.md] — AR-1/AR-3 (overridden here), AR-4 (scheduling gate — GATED), AR-5 (search stack), AR-6 (manual GSC export input), AR-8 (repo norms)
- [Source: _bmad-output/implementation-artifacts/backlink-1-3-opportunity-finder.md] — the shipped finder: pure/IO split, `parseCandidates` defensive extraction, `isRivalOrOutChannel`/`suggestChannel`/`RIVAL_DOMAINS` to reuse, private-output decision (ADR-115), fail-soft + `import.meta.url` guard
- [Source: _bmad-output/implementation-artifacts/backlink-1-1-citation-share-tracker.md] — persisted-series + idempotent same-key merge (`mergeDatapoints`), corrupt-file rebuild, weekly-Task non-fatal wiring, private-output (ADR-113)
- [Source: server/scripts/opportunityFinder.ts] — `parseCandidates`, `isRivalOrOutChannel`, `suggestChannel`, `RIVAL_DOMAINS`, the pure/IO split to mirror
- [Source: server/scripts/searchEngines.ts] — the shared pluggable engines (`selectEngines`/`sleep`/`REQUEST_GAP_MS`, capped `web_search_20250305` pause_turn loop, Perplexity Sonar, root-`.env` load) to reuse (AR-5)
- [Source: server/scripts/citationMonitor.ts] — `TARGET_DOMAIN`, `BRAND_NEEDLE`, `urlToDomain`, `hostnameMatches` (brand/URL matching primitives)
- [Source: server/scripts/citationShareRun.ts] — IO runner pattern (env paths, `readExistingDatapoints` corrupt-file rebuild, atomic write, `import.meta.url` guard, fail-soft exit 0)
- [Source: server/scripts/citationShareTracker.ts] — `mergeDatapoints` same-key-update idempotency precedent for the monotonic known set
- [Source: scripts/ai-citation-local.ps1] — the weekly Task script + the Story 1.1 tracker's non-fatal wiring block to mirror ONLY on AR-4 go-ahead

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- New unit tests: `unlinkedMentionFinder.test.ts` 22/22 passing (incl. the runner's `parseArgs`/`buildSearchPrompt` via dynamic import).
- 1.3 regression after the `looseJsonArray` extraction: `opportunityFinder.test.ts` 22/22 still green.
- Full server suite: 954/954 passing (73 files) — was 932 before this story (+22).
- Server production build (`npm run build`): clean (tsc + copyData).
- `--dry` IO smoke against an ISOLATED `MENTIONS_DIR` (scratchpad): 0 candidates (dry engine makes no live search), empty-chase-list-with-reason, exit 0; wrote all three files (`unlinked-mentions.md`/`.json` + `unlinked-mentions-known.json`); GSC-missing handled ("using the engine link signal only"); a second run reported 0 new (idempotent).
- Weekly-wiring regression: `pwsh/powershell scripts/ai-citation-local.ps1 -Dry` with isolated `CITATION_LOG_PATH`/`CITATION_SHARE_DIR`/`MENTIONS_DIR`/`GSC_LINKS_EXPORT` ran monitor (exit 0) → citation-share tracker (1 datapoint) → unlinked-mention finder (0 new) in sequence; real `~/GmaS-data` untouched.

### Completion Notes List

- Fourth and LAST backlink tool. Finds public "gmaslist"/"gma's list" mentions that don't link to gmaslist.com, dedupes against a monotonic ledger, writes a NEW-since-last-run chase list. MEASURE-AND-SURFACE only.
- **Distinct from Story 1.3 (deliberate):** reads NO `server/data/derived/*.json`, does NOT call `factPackager`, has NO fact-pairing / honesty-inheritance / freshness-overlay path. This is about brand mentions, not price facts — so none of the packager surface (or its regions/freshness gotcha) is touched.
- **Search + JSON reuse (AR-5):** imports the shared `searchEngines.ts` (no re-extraction, `aiCitationRun.ts` untouched). Extracted the tolerant loose-JSON cascade out of `opportunityFinder.parseCandidates` into an exported `looseJsonArray` used by both `parseCandidates` and the runner's `parseMentions` (behavior-preserving; 1.3 suite regression-clean). Reused `isRivalOrOutChannel` + `suggestChannel` from Story 1.3.
- **GSC cross-check (AR-6):** the manual "Top linking sites" CSV export (`GSC_LINKS_EXPORT`) is parsed tolerantly and used to exclude already-linking domains — conservative (safe direction for a chase list). Fully fail-soft when absent/unreadable.
- **Dedup + monotonic ledger (FR-11):** `unlinked-mentions-known.json` grows monotonically (never prunes in v1); corrupt ledger → treated as empty + warning (never a crash). `--limit` truncates DISPLAY and folds only shown rows into the ledger so overflow resurfaces next run (default = no cap; SM-C1).
- **Output-location decision (ADR-116, mirrors ADR-113/114/115):** chase list + ledger are private under `~/GmaS-data/` (`MENTIONS_DIR`-overridable) — NOT committed/served/in `$derivedFiles`. AR-1/AR-3 deliberately not applied. GSC CSV is a read-only local input.
- **Scheduling (AR-4 go-ahead GRANTED by Erik):** non-fatal call wired into `scripts/ai-citation-local.ps1` after the tracker block → runs on the existing weekly Mon 05:00 Task (no Task re-registration). Still runnable on demand.
- Design deviation from the story's Task-1 letter: `parseMentions` + the search prompt live in the IO runner (they map engine output — an IO concern), while the pure module owns the filter/dedup/render logic. The pure module reuses the shared `looseJsonArray` rather than duplicating the cascade.

### File List

- server/scripts/unlinkedMentionFinder.ts (new — pure logic)
- server/scripts/unlinkedMentionFinderRun.ts (new — IO runner + CLI)
- server/scripts/unlinkedMentionFinder.test.ts (new — 22 unit tests)
- server/scripts/opportunityFinder.ts (modified — extracted the shared `looseJsonArray`; `parseCandidates` now uses it, behavior-preserving)
- scripts/ai-citation-local.ps1 (modified — non-fatal weekly call to the mention finder, after the tracker block; AR-4 go-ahead granted)
- ADR.md (modified — ADR-116 + change-log entry)
- _bmad-output/implementation-artifacts/backlink-1-4-unlinked-mention-finder.md (this story)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status updates)

### Change Log

- 2026-08-07: Implemented Story 1.4 (unlinked-mention finder) — pure `unlinkedMentionFinder.ts` + IO `unlinkedMentionFinderRun.ts` + 22 tests; extracted the shared `looseJsonArray` from `opportunityFinder.ts`; reused `searchEngines.ts` + `isRivalOrOutChannel`/`suggestChannel`; GSC linking-sites cross-check; monotonic known-mention ledger with idempotent dedup; private output under `~/GmaS-data/`; wired non-fatally into the weekly Mon 05:00 Task via `ai-citation-local.ps1` (AR-4 go-ahead granted); ADR-116. 954/954 server green, build clean. Status → review.
