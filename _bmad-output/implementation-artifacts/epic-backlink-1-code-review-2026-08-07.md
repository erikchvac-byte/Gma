# Code Review — Epic `backlink-1` (Stories 1.1–1.4)

**Date:** 2026-08-07
**Reviewer:** bmad-code-review (3 parallel adversarial layers — Blind Hunter, Edge Case Hunter, Acceptance Auditor; all Opus 4.8, fresh context)
**Scope:** `40f9752..HEAD` restricted to tool code (16 files, +3,482 / −175); data-refresh commits excluded.
**Spec:** `epics.md` (all 12 FRs + per-story ACs); PRD + 4 story files as context.

**Outcome:** 2 decision-needed, 5 patch, 6 defer, ~7 dismissed. All findings verified against the actual code before listing (several raw layer findings were false positives or spec-mandated and were dropped).

---

## Decision-needed (require Erik's call — the fix is ambiguous)

### D1 — Out-of-WA geo not in `NON_WA_TOKENS` is served a statewide WA fact instead of refused
`server/scripts/factPackager.ts` `resolveGeo` (L166-172) + `selectFact` (L271-298). Refusal is opt-in via a finite token set (`or/id/ca/nv/az/…` + a few cities). A geo like `--geo "Denver"` / `"Chicago"` matches nothing, resolves to `{kind:'uncovered'}`, and `selectFact` falls through to `bestDisparity` (statewide) → returns a real WA fact under an out-of-WA label. Violates Story 1.2 **AC-1** ("a geo outside WA is rejected with no out-of-state fact returned"). Mitigation: the copy still says "across licensed Washington retailers," and this is an operator-only tool. Fix is a posture choice: (a) accept as-is (operator knows the dataset is WA-only); (b) flip to a WA-allowlist (refuse anything not recognized as WA — risks refusing unknown WA cities); (c) keep the blocklist and just widen it (whack-a-mole).

### D2 — Cross-store disparity HIGH side is emitted as "a real cross-store price gap," guarded only by `positivePrice`
`server/scripts/factPackager.ts` `bestDisparity` (L205-232) + `renderCopy` (L312-317); inherited by `opportunityFinder.ts` `factHeadline` (L245-249). The low side is correctly the only *citable* number, but `renderCopy` also prints `runs up to $<highPrice> elsewhere, a real cross-store price gap`. `highPrice` is guarded only by `positivePrice` (finite, >0) — an unflagged mis-parsed high (the "$84 Donny Burger" class) would flow through as the ceiling, and `bestDisparity` ranks by `spreadPct` DESC so the *largest*-spread (most suspicious) row is preferentially chosen. ADR-114 deliberately keeps the high side as a "contrast ceiling," and flagged/`excluded[]` artifacts are already removed upstream, so this is a residual risk, not a clear FR-6 breach. Fix is Erik's call: (a) keep as-is per ADR-114; (b) drop the high-side phrase entirely (cite low only); (c) add a high-side plausibility cap (e.g. skip when `highPrice/lowPrice` exceeds a ratio). NOTE: the concrete, unambiguous slice — a *zero-spread* row rendering "$X … up to $X … a real price gap" — is split out as patch **P2**.

---

## Patch (unambiguous fix)

- **P1 (HIGH)** `candidateGeoIsWa` matches `NON_WA_TOKENS` (incl. `"or"`, `"id"`, `"ca"`, `"mt"`, `"nv"`, `"az"`, `"ak"`) against free prose (`title + snippet + geo`), so **any** candidate whose text contains the word "or" gets `hasNonWa=true` and is dropped. Guts the text-signal keep-path for FR-7/FR-8 (only candidates whose structured `geo` resolves survive). `opportunityFinder.ts:182-185`. Fix: in free-text matching, match only full state/place names; keep the ≤2-letter abbreviations for the structured geo-input path in `resolveGeo`.
- **P2 (MED)** `bestDisparity` has no `highPrice > lowPrice` guard, so a zero/near-zero-spread row can render "as low as $X … runs up to $X elsewhere, a real cross-store price gap" (false). `factPackager.ts:206-214`. Fix: add `d.highPrice > d.lowPrice` to the candidate filter. (Concrete slice of D2; also fixes `opportunityFinder.factHeadline`.)
- **P3 (MED)** `buildDatapointsFromLog` keeps a datapoint with `date === ''` (from an unparseable-but-string timestamp), which sorts ahead of every real date and persists forever via the monotonic merge. `citationShareTracker.ts:170`. Fix: `.filter(d => d.questionCount > 0 && d.date !== '')`.
- **P4 (LOW)** `topicMatchesCategory` two-way substring false-matches ("credible" ⊃ "edible"; alias "oz" ⊃ "dozen"/"amazon") and empty topic matches every category → weak/irrelevant fact pairings in the finder. `factPackager.ts:141-149`. Fix: word-boundary/exact match for short tokens; reconsider treating empty topic as a match on the finder pairing path.
- **P5 (LOW)** `candidateGeoIsWa` city detection uses raw `text.includes(city)` ('kent' ⊃ 'Kentucky'; region slug 'mount-vernon' never matches spaced prose). `opportunityFinder.ts:196`. Fix: token/word-boundary match against WA localities.

---

## Defer (real but pre-existing, low-probability, or consistent-by-design)

- **F1** `atomicWrite` uses a fixed `<file>.tmp` sidecar in all four runners → two concurrent writers to the same file race on the identical tmp path, and a failed `renameSync` leaks the tmp. Low-probability (ps1 single-instance lock; manual runs rare). Add a pid/random suffix. `citationShareRun.ts:80` (+ 3 sibling runners).
- **F2** `readExistingDatapoints` returns `parsed.datapoints` with no per-element shape validation → a hand-corrupted series datapoint (missing `overall`) makes `renderMarkdown` throw, the top-level catch sets exit 0, and the run writes nothing (silent, not graceful). Only reachable via manual file corruption. Validate datapoint shape on read. `citationShareRun.ts:67-78`.
- **F3** `mentionKey` drops the query string, so query-addressed forum threads (`viewtopic.php?t=1` vs `?t=2`) collapse to one key and the 2nd is silently treated as already-known. Errs toward under-reporting (the safe direction — no false chase). `unlinkedMentionFinder.ts:99-112`.
- **F4** `anthropicEngine.ask` iterates `data.content` unguarded → a schema-drift 200 with no `content` throws; contained by the callers' per-engine try/catch but add `?? []`. `searchEngines.ts:124`.
- **F5** Own-median drops of 0.5–0.99% round up to display "1% below" (`Math.round`). Consistent-by-design: mirrors the live `storeRoute.renderableStoreDrops` convention; already a known deferred item. `factPackager.ts:123-124`.
- **F6** "Dated" not enforced — undated candidates/mentions are surfaced (sorted last) though FR-7/FR-10 say "dated." Prompts request `postedDate`; low. `opportunityFinder.ts` `buildWorklist` / `unlinkedMentionFinder.ts` `buildChaseList`.

---

## Dismissed (false positive / spec-mandated / not surfaced)

- Same-UTC-day two runs "overwrite" — **spec-mandated** same-date upsert (FR-1: "re-running for the same date updates that date's datapoint rather than duplicating it").
- ps1 `npx`/`node` not-on-PATH terminating — **guarded** by the precondition check at `ai-citation-local.ps1:57-62` (aborts before any block).
- `searchEngines.ts` top-level `loadEnv` "side effect on import" — documented; dotenv does not overwrite existing vars and is a no-op in tests without a `.env`.
- Per-engine vs union rival tally divergence — per-engine rivals are stored but **not rendered**; only the union leader is surfaced, so no user-visible inconsistency.
- `lowStoreId` vs `d.lowPrice` mismatch — `lowStoreId` is carried in the fact but **not rendered** in the disparity copy.
- Unlinked-mention ledger "unbounded growth" — **monotonic by spec** (FR-11).
- `weightGrams` NaN/0 in copy — upstream weight-category-gated; not observed.
