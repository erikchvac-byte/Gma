---
stepsCompleted: [1, 2, 3, 4, 5, 6]
targetStory: _bmad-output/planning-artifacts/story-price-index.md
inputDocuments:
  - _bmad-output/planning-artifacts/story-price-index.md
  - _bmad-output/planning-artifacts/prfaq-Happy.md
  - _bmad-output/planning-artifacts/prfaq-Happy-distillate.md
  - _bmad-output/planning-artifacts/price-index-execution-plan.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-08
**Project:** Happy (gmaslist.com) — WA Cannabis Price Index story

## Step 1 — Document Discovery

**Target under review:** `story-price-index.md` (Phase 1a is the buildable slice).

**Backing chain (Price Index initiative):**
- `story-price-index.md` — the story
- `prfaq-Happy.md` + `prfaq-Happy-distillate.md` — source PRFAQ (Working Backwards)
- `price-index-execution-plan.md` — 3-phase plan

**Standard BMAD docs present but scoped to OTHER initiatives (excluded from traceability):**
- `prds/prd-Happy-2026-08-06/` + `epics.md` — Backlink tooling
- `epics-derivation-engine.md` — derivation engine
- `architecture.md` (Jun 9) — original product (explicitly excluded per epics.md)
- `ux-designs/ux-Happy-2026-06-11/` — original product UX

**Critical finding at discovery:** No PRD or epic exists for the Price Index. The story traces to a PRFAQ + execution plan, not the normal PRD → epic → story chain. Assessment is therefore reframed as a **self-contained-story readiness check**, not cross-document PRD alignment.

No duplicate/format conflicts.

## Step 2 — Requirements Analysis (PRD-substitute: PRFAQ + execution plan + story)

No Price Index PRD exists. Requirements were reverse-extracted from the PRFAQ distillate, execution plan, and the story's tasks/ACs.

### Functional Requirements

- FR1: Server-rendered `/price-index` page generated from EXISTING committed derived JSON (`disparities.json`, `disparity-rollups.json`), read at request time (mirror `compareIndexRoute`).
- FR2: Hook section — top ~15 same-product disparities, filtered by `isRenderableDisparity`, sorted by `spread` desc, rendered with the cheapest/priciest `.reduce` pattern so the price can never disagree with the named store; skip rows where `highPrice === lowPrice`.
- FR3: Category summary table from `rollups.byCategory.avgSpreadPct` (defensive `Number.isFinite` filters).
- FR4: "Stores most often cheapest" from `byStore.timesCheapest`.
- FR5: Navigation links into `/compare` and region pages (`/compare/<region>`).
- FR6: Dated accounting line via `asOfPhrase(rollups.generatedAt)`.
- FR7: `FAQPage` JSON-LD answering the 8 monitored questions (`citation-questions.json`), with the schema-text == on-page-text invariant (visible "Common questions" section built from one shared Q/A array).
- FR8: `Dataset` JSON-LD (as `/compare`).
- FR9: Route registered in `index.ts` BEFORE the SPA catch-all.
- FR10: `/price-index` added to sitemap `STATIC_PATHS` (lastmod = `generatedAt`) and `buildLlmsTxt`.
- FR11 (Phase 1b, deferred): weekly dated archive `GET /price-index/:date`.
- FR12 (Phase 2, ops): confirm indexation (GSC + Bing), watch the citation monitor, email HARO press.
- FR13 (Phase 3, optional): Reddit participation.

### Non-Functional Requirements

- NFR1 (honesty/staleness): a stale price must NEVER be presented as a current floor; reuse `allStale`/epoch caveat; fail-soft to a safe "check back later" page, never a 500.
- NFR2 (legal/positioning): render `AGE_NOTICE` + `positioningDisclaimer`; WA-only, never "statewide"; facts-not-menus — no full menus, no discount %, no potency, no category leaderboard.
- NFR3 (performance): `Cache-Control: public, max-age=3600`, `res.type('html')`.
- NFR4 (quality): TypeScript strict; real Render build (`tsc -b && vite build`) passes; tests mirror `compareRoute.test.ts` + `sitemapRoute.test.ts`.
- NFR5 (maintainability): extract shared SSR primitives to `server/utils/ssrPage.ts` with NO behavior change to `/compare` (existing tests stay green).
- NFR6 (measurement): success = ≥2/8 monitored queries cite gmaslist.com within 12 weeks; kill-switch at 8–12 weeks.

### Additional constraints
- Phase 1a: NO change to `derive-facts-local.ps1` / `$derivedFiles`; no new committed data file.
- Phase 1b pipeline gotcha: `$derivedFiles` is an explicit no-glob list by design — must not add a glob for an archive dir.

### Requirements-source completeness assessment
Strong for Phase 1a: the story enumerates concrete tasks, ACs, honesty/legal invariants, and file targets. Weaker downstream: Phases 1b/2/3 are intentionally lighter (ops/human), acceptable given the sequencing and kill-switch.

## Step 3 — Coverage Validation (story tasks vs requirements)

No Price Index epic exists; the story is the unit of work. Coverage = each requirement maps to a concrete story task.

| Req | Requirement | Story task | Status |
| --- | --- | --- | --- |
| FR1 | SSR `/price-index` from committed derived JSON, read at request time | Task 2 | ✓ |
| FR2 | Hook: top-N disparities, reduce-paired price/store, skip zero-spread | Task 2 | ✓ |
| FR3 | Category table from `byCategory.avgSpreadPct` | Task 2 | ✓ |
| FR4 | Stores most often cheapest | Task 2 | ✓ |
| FR5 | Nav into `/compare` + region pages | Task 2 | ✓ |
| FR6 | `asOf` dated line | Task 2 | ✓ |
| FR7 | `FAQPage` JSON-LD, schema==on-page invariant | Task 3 | ✓ |
| FR8 | `Dataset` JSON-LD | Task 1 (helper) + AC only | ⚠ partial — in ACs, not an explicit task line |
| FR9 | Register before SPA catch-all | Task 5 | ✓ |
| FR10 | sitemap + llms.txt | Task 6 | ✓ |
| FR11 | Dated archive `/price-index/:date` | Phase 1b (deferred) | ✓ scoped-out |
| FR12 | Findability + press | Phase 2 | ✓ scoped-out |
| FR13 | Reddit | Phase 3 (optional) | ✓ scoped-out |
| NFR1 | Staleness/fail-soft | Task 2 + Task 4 | ✓ |
| NFR2 | Legal/positioning | Task 4 | ✓ |
| NFR3 | Caching | Task 4 | ✓ |
| NFR4 | Strict TS, real build, tests | Task 7 | ✓ |
| NFR5 | Extract `ssrPage.ts`, no `/compare` change | Task 1 | ✓ |
| NFR6 | Success metric + kill-switch | Phase 2 + Kill-switch | ✓ |

### Coverage statistics
- Requirements (Phase 1a in scope): 10 FR + 6 NFR = 16
- Fully tasked: 15/16 (94%)
- Partial: 1 (FR8 Dataset JSON-LD — implied by "a second script" in Task 3 and named in ACs, but not its own task line). Low risk; the helper (`datasetJsonLd`) is extracted in Task 1.

No requirement is uncovered. No orphan task lacks a requirement.

## Step 4 — UX Alignment

### UX document status
No dedicated UX doc for the Price Index (expected — like the Backlink tooling, this is a generated SSR surface, not an app screen). The binding UX/brand/legal contract is `GMAS_LIST_BRIEF.md`; the visual precedent is the live `/compare` page.

### Alignment
- ✓ Presentation inherited by construction: Task 1 reuses `/compare`'s `page()` shell (dark theme, AA-verified) — no new design surface to review.
- ✓ Legal/brand contract honored via NFR2 (age notice, disclaimer, facts-not-menus, WA-only).
- ✓ Content is plain crawlable text (no numbers trapped in images/iframes) — matches the GEO intent.

### Warnings (minor)
- ⚠ Human discoverability gap: the story adds links FROM `/price-index` INTO `/compare`/regions, and bots are covered via sitemap + llms.txt, but nothing links the app/homepage TO `/price-index`. For the citation thesis this is fine (bots + external distribution are the path). If human traffic to the page is ever wanted, add an in-app entry point later — NOT required for Phase 1a.
- ⚠ `AGE_NOTICE` string is duplicated server-side and must stay in sync with the client `legal.ts` constant (pre-existing constraint the story already flags).

## Step 5 — Story Quality Review

Applied epics-and-stories standards to the story (single-story unit; "epic" = the initiative).

### Data assumption VERIFIED (was the top implementation risk)
The hook depends on being able to name the cheapest AND priciest store per row. Verified live against `server/data/derived/disparities.json`: rows live at `data.disparities[]`; each row has `storesCarrying[{ dispensaryId, price, quantityAvailable }]` plus `lowPrice/highPrice/spread/spreadPct`. The Donny Burger row resolves to `2020-solutions-north-bellingham $14.40 → 2020-solutions-pacific-highway $84`. The reduce-over-`storesCarrying` pattern is fully supported. ✅ Confirmed.

### 🔴 Critical violations
None.

### 🟠 Major issues
None. (The one candidate — un-nameable stores — was disproven above.)

### 🟡 Minor concerns
1. **Sort-key ambiguity (product decision).** Task 2 says sort by `spread` (absolute $). The PRFAQ headline sells "5× more" (`spreadPct`). Absolute-$ ranking biases toward big-ticket flower; %-ranking surfaces the drama. The top row ($14→$84) happens to win on both, but rows 2–15 differ by sort key. Decide deliberately, or render both a $ and a × column. Grade: Confirmed.
2. **Data-access precision.** Rows are at `disparitiesEnv.data?.disparities` (guard with `Array.isArray`, per `compareRoute.ts:344`), not `.data` directly. Build by mirroring compareRoute's disparity read; the story's shorthand ("rows from disparities.json") is directionally right but could mislead. Grade: Confirmed.
3. **Staleness posture mismatch.** NFR1 borrows the region-page `allStale`/per-floor `stale` language, but `disparities.json` rows carry NO per-row stale flag (freshness is whole-file via `generatedAt`; note `coverage.staleRecords` is a build-time count, not a per-row mark). Implement freshness here as `asOf(generatedAt)` + an age check — do NOT look for a per-row stale field that doesn't exist in this dataset. Grade: Confirmed.
4. **Highest-risk task is the refactor (Task 1).** Extracting shared primitives from the LIVE `/compare` route is the only change that can regress an existing surface. Mitigation is already specified (keep `compareRoute.test.ts` green) — run that suite immediately after the extract, before writing the new route. Grade: Deduced.
5. **AC format.** ACs are a checklist, not Given/When/Then. Acceptable for a solo build and they are testable; noted as a standards deviation only.
6. **Mixed work-types in one doc.** Phase 1a (code, ready) sits with Phases 2–3 (ops/human). Fine as a plan, but only 1a is "ready for dev" — track 2/3 separately so they aren't mistaken for buildable stories.

### Strengths (best-practice compliance)
- ✓ Dependency direction correct: 1a stands alone; 2/3 depend on 1a; no forward deps. Phase 1b correctly isolated as the ONLY pipeline-touching work.
- ✓ Strong test guards named: schema==on-page invariant, no-"statewide" string, empty/epoch/malformed → safe page (error paths covered).
- ✓ Brownfield integration points explicit: route-registration order, sitemap/llms.txt, compareRoute extraction.
- ✓ Scope discipline: Phase 1a provably needs no pipeline/`$derivedFiles` change; honest kill-switch with a numeric metric.

## Summary and Recommendations

### Overall Readiness Status
**READY** (Phase 1a). Phases 1b/2/3 intentionally scoped behind it and NOT claimed ready.

### Critical issues requiring immediate action
None. No 🔴 Critical or 🟠 Major findings survived verification. The single biggest implementation risk (can the hook name both stores?) was checked against live data and **confirmed supported**.

### Recommended next steps (all Minor — do at kickoff, none block starting)
1. **Decide the sort key** before writing Task 2: absolute `spread` ($) vs `spreadPct` (×), or render both columns. The PRFAQ sells "5×," so lead the copy with the × even if the table sorts by $.
2. **Build the disparity read by copying compareRoute's pattern** (`Array.isArray(env.data?.disparities)`), and implement freshness as `asOf(generatedAt)` + age check — there is no per-row stale flag in this dataset (drop the region-page `allStale` language).
3. **Sequence the refactor safely:** do Task 1 (extract `ssrPage.ts`), then run the existing `compareRoute.test.ts` immediately to prove no `/compare` regression, before writing the new route.
4. Track Phases 2–3 as separate ops items so they aren't mistaken for buildable stories.

### Final note
This assessment reviewed 16 Phase-1a requirements across 5 steps and found 0 critical, 0 major, 6 minor items. The story is unusually build-ready for a solo effort: concrete file targets, correct dependency direction, strong honesty/legal test guards, and a verified data foundation. Proceed to implementation of Phase 1a whenever you choose to name it.

---
*Assessor: Claude (bmad-check-implementation-readiness). Date: 2026-08-08. Note: no PRD/epic/UX exists for this initiative — assessed as a self-contained story derived from the PRFAQ + execution plan.*
