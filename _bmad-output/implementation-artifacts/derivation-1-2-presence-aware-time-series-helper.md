---
baseline_commit: aa7ebdfc7e776c0e0e9273647b62c981b91028f9
---

# Story derivation-1.2: Presence-aware time-series helper

Status: done

## Story

As a **fact author**,
I want a shared helper that walks a per-SKU (or per-store) observation series while distinguishing "no observation that day" from "observed, unchanged,"
so that every trend/delta fact (Story 1.2.5's extraction-health fact, Story 1.3's special-event detection, and Epic 2's rolling-median discount) is gap-tolerant by construction rather than by ad-hoc per-fact logic (FR6, Gate 3).

## Scope boundary (read before starting)

This story delivers **only the primitive** — a pure, generic, additive utility module. It has **zero callers** when this story is done, and that is correct, not a defect:

- `epics-derivation-engine.md` Story 1.2's AC text says the helper "ships with at least one real first consumer wired through it... that consumer is Story 1.2.5." Story 1.2.5 (`derivation-1-2-5-source-extraction-health-fact`, sprint-status: `backlog`) is tracked as a **separate story** and is NOT part of this story's scope.
- Do not build the extraction-health fact, do not touch `deriveFactsRun.ts`, do not add a route, and do not invent a synthetic caller just to avoid an "unused export" feeling. If a lint/tsc pass flags the new exports as unused, that is expected for a from-scratch additive module awaiting its next-story consumer — do not delete or gut the module to silence it.
- If you believe 1.2.5 must be built in the same pass for "done" to be meaningful, stop and ask before expanding scope — do not decide this unilaterally.

## Acceptance Criteria

1. **Gap detection (Gate 3).** Given an observation series with a missing calendar day between two observed days, when the helper walks it, the missing day is reported with status `'gap'` and carries no value — never `'unchanged'` and never a change event (FR6).
2. **Unchanged.** Given an observed day whose extracted value equals the value on the most recent prior *observed* day (per the comparator — default strict `===`), when walked, the later day is reported status `'unchanged'` together with that value.
3. **Changed, gap-tolerant.** Given an observed day whose extracted value differs from the value on the most recent prior *observed* day, when walked, the day is reported status `'changed'` with both `value` and `previousValue` — the comparison MUST skip any gap days in between and never diff against a gap (this is the core gap-tolerance behavior FR6 exists for).
4. **First-day safety.** Given the earliest observed day in the walked range, when walked, it is reported status `'first'` with its value — never `'changed'` or `'unchanged'`. There is no prior observed day to compare against, so treating day one as "changed" would fabricate a false transition (e.g., a phantom special-start on day one of a product's history, before any real change occurred) — this guards Story 1.3's forward dependency.
5. **Range control + defaults.** Given optional `startDate`/`endDate` (inclusive, `YYYY-MM-DD`, UTC calendar days), the walk covers exactly that range (days with no observation are `'gap'`, including days before the first or after the last real observation); when omitted, the range defaults to `[earliest observed day, latest observed day]` found in the input items.
6. **Day-bucketing contract.** Given multiple observations on the same calendar day, all same-day items are passed to the caller-supplied `getValue(dayItems)` reducer as an array **in their original input order** (never re-sorted by the helper) — so callers can rely on `dayItems.at(-1)` for "the latest observation that day," mirroring the existing `history.at(-1)` convention already established in `productsDb.ts`.
7. **Additive, generic, unowned by any domain type.** The helper lives as a new module `server/utils/presenceAwareSeries.ts`. It is generic over an arbitrary item type `T` and value type `V` (via `getObservedAt: (item: T) => string` and `getValue: (dayItems: T[]) => V`) and imports nothing from `ProductObservation`/`ProductRecord`/`server/scripts/`/route layers — so it can back a per-SKU consumer (1.3) and a per-store-count consumer (1.2.5) unmodified. No existing type or file's behavior changes (NFR5).
8. **Tests (NFR6).** Strict-typed unit tests cover at minimum: a pure gap case, a pure unchanged case, a changed-after-gap case (proving the comparison skips the gap), the first-observed-day case, an empty-input case (returns `[]`), an explicit `startDate`/`endDate` case that extends the range beyond the real data (extra days are `'gap'`), and a custom-`equals` case (e.g., structural/object equality). The full server vitest suite stays green and `npm run build` (client + server) stays clean.

## Tasks / Subtasks

- [x] **Calendar-day bucketing + walk algorithm** (AC: 1, 2, 3, 4, 5, 6)
  - [x] `toCalendarDay(observedAt: string): string` — UTC `YYYY-MM-DD` extraction via `new Date(observedAt).toISOString().slice(0, 10)`. Trust the input is a well-formed ISO timestamp (it always originates from `productsDb.ts`, an internal boundary already validated — no defensive parsing needed here per project convention).
  - [x] A day-range iterator over UTC calendar-day strings (inclusive `start`..`end`), stepping one day at a time via `setUTCDate` to avoid DST/local-timezone drift.
  - [x] `walkPresenceAwareSeries<T, V>(items: T[], options): DayEntry<V>[]` — bucket `items` by calendar day (preserving each bucket's relative input order — do not sort within a day), determine the day range (explicit `startDate`/`endDate` or default to min/max observed day), then iterate every day in range:
    - no bucket for that day → `{ date, status: 'gap' }`
    - a bucket exists → compute `value = getValue(dayItems)`; find the most recent **prior day with status other than `'gap'`** (i.e., skip gap days when looking backward) — if none exists, emit `'first'`; else compare via `equals` (default `(a, b) => a === b`) and emit `'unchanged'` or `'changed'` (+ `previousValue`).
- [x] **Types** (AC: 6, 7)
  - [x] `export type DayEntry<V> = { date: string; status: 'gap' } | { date: string; status: 'first'; value: V } | { date: string; status: 'unchanged'; value: V } | { date: string; status: 'changed'; value: V; previousValue: V }`
  - [x] `export interface WalkSeriesOptions<T, V> { getObservedAt: (item: T) => string; getValue: (dayItems: T[]) => V; equals?: (a: V, b: V) => boolean; startDate?: string; endDate?: string }`
- [x] **Unit tests** `server/utils/presenceAwareSeries.test.ts` (AC: 8) — gap case; unchanged case; changed-after-gap case (assert `previousValue` comes from the last real observation, not the gap); first-day case; empty-input case (`[]` in → `[]` out); explicit out-of-data `startDate`/`endDate` range case; custom `equals` case with an object-valued `V`.
- [x] **Regression + build** (AC: 7, 8) — run the full server vitest suite (confirm current green count, don't assume the 468 baseline from Story 1.1 without checking) and `npm run build` (client `tsc -b && vite build`; server `tsc && node scripts/copyData.mjs`). Confirm via `git status`/diff that only the two new files were added — nothing else touched.

### Review Findings

- [x] [Review][Patch] `toCalendarDay`'s comment names a specific future caller (`productsDb.ts`), in tension with AC7's "generic, unowned by any domain type" and the Scope Boundary's "zero callers" framing [server/utils/presenceAwareSeries.ts:20-21] — fixed: reworded to the general boundary-trust principle without naming a specific domain module.
- [x] [Review][Patch] `startDate > endDate` silently returns `[]` instead of failing loudly, discarding real observations without any signal to the caller [server/utils/presenceAwareSeries.ts:49-55] — fixed: throws a clear error; covered by a new test.
- [x] [Review][Patch] Default `equals` (`===`) is a reference-equality trap for non-primitive `V` (arrays/objects) and for `NaN`, undocumented next to the option itself [server/utils/presenceAwareSeries.ts:6] — fixed: doc note added on `WalkSeriesOptions.equals`.
- [x] [Review][Patch] When an explicit `startDate` excludes true prior history, the first in-window day is labeled `'first'` even if real earlier data exists outside the window — undocumented, could mislead future windowed consumers (1.2.5/1.3/Epic 2) [server/utils/presenceAwareSeries.ts:1-15] — fixed: doc comment added clarifying `'first'` means "first observed within the queried window."
- [x] [Review][Patch] No test for the "gap, then unchanged" sequence — the most representative real-world outage scenario (price unchanged across a missed scrape day) — only "gap then changed" is covered [server/utils/presenceAwareSeries.test.ts] — fixed: test added.
- [x] [Review][Patch] `nextCalendarDay`/the walk are never tested across a month or year boundary (e.g. Jan 31 → Feb 1) — the class of off-by-one bug this kind of date arithmetic is prone to [server/utils/presenceAwareSeries.test.ts] — fixed: month-boundary test added.
- [x] [Review][Dismiss] No defensive parsing of malformed `observedAt` (NaN dates) — explicitly ruled out by this story's own task text ("no defensive parsing needed here per project convention") and CLAUDE.md's boundary-trust rule.
- [x] [Review][Dismiss] No format validation of `startDate`/`endDate` strings — same boundary-trust reasoning; no AC requires it.
- [x] [Review][Dismiss] No upper bound / large-range guard on the walked range — speculative hardening with no AC requirement and no untrusted-input path (zero callers today); would violate the story's own YAGNI anti-pattern guidance.
- [x] [Review][Dismiss] Bucketing the full input before applying the range window (perf) — premature optimization, no AC requires it, no measured problem.
- [x] [Review][Dismiss] No test for real multi-item value-conflict resolution — `getValue`'s reduction is explicitly the caller's responsibility by design (AC6/AC7); the existing order-preservation test already proves the module's actual contract.
- [x] [Review][Dismiss] Asymmetric `DayEntry` union (`'unchanged'` lacks `previousValue`) — matches the literal type shape mandated in the story's own Tasks/Subtasks text verbatim.
- [x] [Review][Dismiss] Non-UTC timezone offset in `observedAt` mishandled — false positive; `toISOString()` already normalizes any parseable offset to UTC before the calendar day is sliced.
- [x] [Review][Dismiss] Blind Hunter noted a "missing YAML hunk" in the diff it reviewed — an artifact of the review prompt (the YAML change was described in prose, not pasted), not a real code finding.

## Dev Notes

### Why this design generalizes across all three known consumers

FR6 states this helper backs FR8 (Story 1.3, special-event detection — per-SKU `specialPrice` presence/value over time) and FR13 (Epic 2, price vs. own rolling median — per-SKU price over time, not decomposed yet). Story 1.2.5 (extraction-health) additionally needs a per-*store* daily-count series (today's product count vs. that store's own trailing median). All three are "walk a dated series, don't confuse a missing day with an unchanged one" problems over different `T`/`V` — hence the fully generic `<T, V>` signature with caller-supplied `getObservedAt`/`getValue`, rather than anything keyed to `ProductObservation`. Do not narrow the types to `ProductObservation` — that would force 1.2.5's per-store-count use case to route around this helper instead of through it, defeating FR6's "provided once" goal.

### Current-state grounding (read at story-creation time)

- `server/types/index.ts#ProductObservation` (line ~90): `{ observedAt: string; special: boolean; options: ProductOptionObservation[] }`. `server/types/index.ts#ProductRecord` (line ~105): `history: ProductObservation[]`.
- `server/utils/productsDb.ts#readProductsFile` (line ~307): observations are read `ORDER BY id` (insertion order) specifically so `history.at(-1)` is the true latest — this story's day-bucketing must preserve that same ordering discipline inside each day's bucket (AC6), not silently re-sort.
- `server/utils/derivedEnvelope.ts` is the sibling additive module from Story 1.1 — mirror its style (short header comment explaining the "why," named exports, colocated `.test.ts`). This story's output (`DayEntry<V>[]`) is a **plain data structure**, not itself envelope-wrapped — enveloping happens one layer up, in whichever fact (1.2.5, 1.3, Epic 2) consumes this helper and writes a derived artifact. Do not add envelope logic here.
- No existing code in the repo does calendar-day bucketing from ISO timestamps (`grep` for `slice(0, 10)` / `calendarDay` returned nothing) — this is genuinely new, not a duplicate of existing logic.

### Anti-patterns to avoid (LLM-dev-agent disaster prevention)

- **Do not** compare a day's value against the immediately preceding *calendar* day when that day was a gap — always skip backward past gaps to the last real observation. This is the entire point of the story; a naive "compare to yesterday" implementation silently reintroduces the bug FR6 exists to prevent.
- **Do not** classify the first observed day as `'changed'` (there is nothing to have changed from) or `'unchanged'` (nothing was observed before it to be unchanged relative to) — it must be its own `'first'` status (AC4).
- **Do not** import `ProductObservation`/`ProductRecord` into this module — keep it type-generic (AC7).
- **Do not** build Story 1.2.5's extraction-health fact, wire `deriveFactsRun.ts`, or add a route in this story — see Scope boundary above.
- **Do not** add speculative options (e.g., timezone configuration, week/month granularity) not required by any AC — YAGNI; every current and known-future consumer (1.2.5, 1.3, Epic 2's D6) operates on UTC calendar days derived from `observedAt`.

### Testing standards

- TypeScript strict mode; tests for everything (project rule).
- Server suite (vitest) was 468 tests / 40 files as of Story 1.1 (`derivation-1-1...md` Debug Log) — confirm the current count when you run it rather than trusting that number.
- Run the real production build before anything that could auto-deploy: `npm run build` (client + server, `tsc -b && vite build`), not just `tsc --noEmit` + vitest.

### Previous story intelligence (derivation-1.1)

- Established pattern for a new additive `server/utils/*.ts` module: a short header comment stating what it is and why (not a multi-paragraph doc), pure named exports, no defensive code beyond real boundaries, a colocated `*.test.ts`.
- Established a "verify, don't assume" discipline — Story 1.1 found and fixed a test (`crossStoreValue.audit.test.ts`) that broke under a shape change that wasn't in the original task list, by actually running the suite before declaring done. Apply the same discipline here: actually run the full suite and build, don't infer they'd pass.
- No new ADR entry was needed for Story 1.1 (an additive wrapper within ADR-077's existing scope). This story is even more clearly inside ADR-077's existing scope (FR6 was already named in ADR-077/PRD) — no new ADR entry expected unless something architecturally significant emerges during implementation.

### Git intelligence

Recent merges (`8c75a74`, `cad2b23`, `dc80ebf`) are single squash-merged PRs with a `Co-authored-by: Claude Sonnet 5` trailer, each landing a cohesive additive slice plus its tests in one commit. Follow the same shape: this story is one small additive module + its test file, nothing else.

### Project Structure Notes

- New files only: `server/utils/presenceAwareSeries.ts`, `server/utils/presenceAwareSeries.test.ts`. Sits alongside `derivedEnvelope.ts`/`productMatchKey.ts` in the same directory, matching existing module organization.
- No changes to `server/scripts/deriveFactsRun.ts`, `server/routes/valueRoute.ts`, any client file, `data.json`, or any existing type. No new route. No new ADR entry expected (see above).

### References

- [Source: _bmad-output/planning-artifacts/epics-derivation-engine.md#Story 1.2] — written AC text; this story file narrows scope per the "Scope boundary" section above (1.2.5 is the deferred consumer).
- [Source: server/utils/productsDb.ts#readProductsFile] — observation ordering contract (`ORDER BY id`, `history.at(-1)` is latest) this helper's bucketing must respect.
- [Source: server/types/index.ts#ProductObservation, #ProductRecord] — shape the helper stays generic over (does not import).
- [Source: server/utils/derivedEnvelope.ts] — sibling Story-1.1 additive module; style/pattern to mirror.
- [Source: _bmad-output/implementation-artifacts/derivation-1-1-runner-served-artifact-envelope.md] — most recent sibling story; testing/build discipline cited above.
- [Source: ADR.md#ADR-077] — the substrate decision this helper is designed against (FR6/FR13 time-range query coupling, noted in the substrate story).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx vitest run server/utils/presenceAwareSeries.test.ts` — 9/9 passed.
- `cd server && npx vitest run` — full server suite: 41 files / 477 tests passed (up from the 468-test baseline noted in Story 1.1; +9 new tests, 0 regressions, 0 other files touched).
- `npm run build` (repo root) — client (`tsc -b && vite build`) and server (`tsc && node scripts/copyData.mjs`) both completed with no errors.
- `git status --short` after implementation: only the two new files (`server/utils/presenceAwareSeries.ts`, `server/utils/presenceAwareSeries.test.ts`) plus this story file and `sprint-status.yaml` — no existing file touched.

### Completion Notes List

- Implemented `walkPresenceAwareSeries<T, V>` exactly to the algorithm specified in Tasks/Subtasks: buckets items by UTC calendar day without re-sorting within a day (AC6), iterates the day range via a `nextCalendarDay` stepper using `setUTCDate` (DST/local-drift-safe), and tracks `lastObserved` incrementally so gap days are transparently skipped when looking backward for a comparison — this is equivalent to and simpler than a "search backward for the most recent non-gap day" implementation, and preserves the same correctness guarantee (AC1-3).
- First-observed-day emits `'first'` (never `'changed'`/`'unchanged'`) because `lastObserved` starts `undefined` (AC4).
- Range defaults to `[min, max]` of observed calendar days when `startDate`/`endDate` omitted; explicit range values extend past real data as `'gap'` on both ends (AC5).
- Module imports nothing beyond its own two exported types/functions — no `ProductObservation`/`ProductRecord`/script/route imports (AC7).
- All 8 ACs covered by 9 unit tests in `presenceAwareSeries.test.ts` (gap, unchanged, changed-after-gap, first-day, empty-input, explicit out-of-data range, custom `equals` on array values, plus a `toCalendarDay` unit test and an explicit same-day-input-order test proving AC6).
- Zero callers added, per the Scope boundary — Story 1.2.5 remains a separate, not-yet-started story.
- No ADR entry added — additive module fully inside ADR-077's existing scope, consistent with the story's Dev Notes expectation.

### File List

- `server/utils/presenceAwareSeries.ts` (new)
- `server/utils/presenceAwareSeries.test.ts` (new)

## Change Log

- 2026-07-07: Story created via bmad-create-story.
- 2026-07-07: Implemented via bmad-dev-story — `presenceAwareSeries.ts` + tests, 477/477 server tests green, build clean. Status → review.
- 2026-07-07: Code review via bmad-code-review (3-layer adversarial: Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 6 patches applied (comment reword, startDate>endDate guard, equals/window-semantics doc notes, 2 new tests), 8 findings dismissed as noise/out-of-scope/spec-mandated. All patches applied; 480/480 server tests green, build clean. Status → done.
