---
baseline_commit: b0e25061548a699ac71c1d5c11d5aef1cae2d3e9
---

# Story: Compliance Launch Gate — WAC advertiser status, WA warnings, age-gate posture

Status: done

<!-- Cross-cutting launch-blocking story (no parent epic — tracked individually, like data-hardening / 5-1). -->
<!-- Source: planning-artifacts/ux-designs/ux-Happy-2026-06-11/review-regulated-content.md — the 3 "verify with counsel" findings (1 high, 1 high, 1 medium). -->

## Story

As **Erik (solo founder/operator of Gma's Helper)**,
I want **the three open regulatory questions resolved on two tracks — a counsel determination AND a defensible engineering posture shipped regardless of the answer**,
so that **gmaslist.com can go to public launch with documented, good-faith compliance instead of silent regulatory gaps.**

---

## ⚖️ READ FIRST — Two tracks, and what the dev agent may NOT do

These three items are **launch-gating** and each has a genuine **legal** question the spec deliberately left open. Handling them correctly = two parallel tracks:

| Track | Owner | Nature |
|-------|-------|--------|
| **A — Counsel determination** | Erik + a licensed WA attorney | The actual legal answer. NOT implementable by the dev agent. |
| **B — Engineering posture** | dev agent (this story) | Ship the defensible, parameterized implementation now; leave counsel-decision slots where the answer changes behavior. |

🚫 **The dev agent MUST NOT fabricate or assert a legal conclusion.** Do not write code or copy that *claims* the aggregator is/ isn't an "advertiser," is/ isn't bound by WA warnings, or that the age gate is/ isn't legally sufficient. Implement the posture; mark counsel-decision points with `// COUNSEL:` comments and a reserved, easily-toggled slot. The point of Track B is that it is *correct under either counsel answer* (most defensible by default, trivially upgraded if counsel says "must").

✅ **The dev agent OWNS:** the description-sanitization chokepoint, the standing-disclaimer footer with a reserved WA-warning slot, and the age-gate decline affordance (or recorded rationale). All three are implementable now and improve posture no matter what counsel rules.

---

## Acceptance Criteria

### Item 1 — WAC 314-55-155 advertiser status (was: review finding #1, **high**)

The product republishes scraped retailer ad copy (`deal.description`) verbatim with **no display constraint**. Even if counsel rules the aggregator is *not* a licensee-advertiser, importing a youth-appeal / therapeutic-claim string onto the surface is the live risk. Engineering posture, independent of the legal label:

1. **Description sanitization runs at the ingestion chokepoint** — `server/utils/normalizeDeals.ts` (NOT the client, NOT `runScrapers` which was retired by ADR-034 Goal C). Every `deal.description` is, in order: (a) stripped of all HTML/markup, (b) stripped of emoji and non-printable chars, (c) collapsed of repeated whitespace and de-ALL-CAPS'd only if trivially safe, (d) length-capped (~80 chars, truncate on word boundary).
2. **Blocklist suppression**: a description matching an operator-maintained blocklist of therapeutic-claim terms (e.g. "cure", "relieves pain", "treats", "medical benefit") or youth-appeal terms (e.g. "kid", "candy", "gummy"-as-youth-appeal — operator-tunable) causes the deal to render **without the description** (badge + discount + window only). The deal is NOT dropped; only the offending copy is suppressed.
3. Descriptions are **never rewritten or embellished** — only stripped/suppressed. No client-side mutation.
4. The blocklist is a single, commented, exported constant that Erik can edit without touching logic.
5. `DealCard` renders the sanitized string as **plain text only** (it already does — verify no `dangerouslySetInnerHTML` is ever introduced).
6. Unit tests cover: HTML stripped, emoji stripped, over-length truncated, blocklist term → description suppressed (deal still renders), clean description → passes through unchanged.

### Item 2 — WA mandatory-warning applicability (was: review finding #2, **high**)

Zero standing disclaimers exist anywhere in the IA. Three lines are missing; two are pure-posture (ship now), one is counsel-gated (reserve the slot):

7. A **persistent feed-footer `Notice`** (muted variant) is added below the deal feed, present on every load. It carries the **accuracy/affiliation** line, ship-now copy:
   > "Deals are set by each retailer and may change without notice — verify in store. Gma's Helper is not affiliated with any dispensary and sells nothing."
8. The same footer carries the **gas-estimate qualifier** (folds in review finding #4, which is liability-framing, not WAC — cheap to bundle here):
   > "Gas costs are estimates based on average fuel prices and rated MPG."
9. A **reserved WA-warning slot** exists in the footer, **rendered behind a single flag** (`WA_WARNING_ENABLED`, default `false`) with the exact statutory text staged but not shown until counsel says it applies:
   > "This product has intoxicating effects and may be habit forming. Cannabis can impair concentration, coordination, and judgment. Do not operate a vehicle or machinery under the influence of this drug. For use only by adults twenty-one and older. Keep out of the reach of children."
   Flipping the flag to `true` must surface the text with no other code change. Mark with `// COUNSEL: WAC 314-55-155 warnings attach to *licensee* advertising; aggregator applicability unsettled — enable on counsel instruction.`
10. The footer is a single source-of-truth component, not inline strings duplicated per surface.
11. Tests: footer renders the affiliation + gas lines by default; WA-warning text is absent when flag `false` and present when `true`.

### Item 3 — Age-gate no-decline posture defensibility (was: review finding #3, **medium**)

The age gate (`client/src/components/AgeGate.tsx`) has a single affirm button, no decline path, by binding ruling **ADR-021**. The review asks the spec to either add a decline affordance **or** record the defensibility rationale explicitly. **Default to adding the decline affordance** (strictly improves posture, preserves the ADR-021 single-confirm flow for compliant users):

12. A secondary **ghost** action "I am under 21" is added beside "I am 21 or older".
13. Choosing it routes to a **static terminal dead-end screen**: "This site is for adults 21 and over." — no path back into content from that screen (re-entry only via the normal re-gate, i.e. it does NOT set `gma_age_confirmed`).
14. The affirmative path, copy, focus-trap, `localStorage` key (`gma_age_confirmed`), and strict `!== true` check are **unchanged** — decline is additive only.
15. Accessibility preserved: the gate stays a focus-trapped `alertdialog`; both actions are keyboard-reachable; focus still lands inside on mount.
16. **ADR-021 is updated** (not replaced) noting the decline affordance was added per regulated-content review for good-faith defensibility; if Erik instead elects to keep no-decline, record the explicit rationale sentence in ADR-021 in lieu of code (see Dev Notes decision point).
17. Tests: decline button present; clicking it shows the dead-end screen and does NOT set the confirmation flag; affirm path still confirms and persists.

### Cross-cutting

18. No regression: existing AgeGate, DealCard, DealFeed, and ingest tests stay green. TypeScript strict mode clean (`tsc --noEmit`), lint clean.
19. ADR.md gets a new ADR entry (next number, see Dev Notes) recording the compliance-launch-gate decisions, the two-track model, and the counsel-gated items. Change log updated.

---

## Tasks / Subtasks

- [x] **Task 1 — Description sanitization at ingest chokepoint** (AC: 1–6)
  - [x] Add `sanitizeDescription()` + exported `DESCRIPTION_BLOCKLIST` constant in a sibling `server/utils/sanitizeDescription.ts` imported by `normalizeDeals` (chokepoint stays single).
  - [x] Wire it into `normalizeDeals()` so every surviving deal's `description` is sanitized; blocklist hit → description set to `''` (deal kept, never dropped → never trips stale).
  - [x] `DealCard` skips the `<p>` when description is `''` (suppressed copy renders nothing).
  - [x] Tests: `server/utils/sanitizeDescription.test.ts` (12) + `normalizeDeals.test.ts` wiring tests per AC #6.
- [x] **Task 2 — Standing-disclaimer footer + WA-warning slot** (AC: 7–11)
  - [x] Created `client/src/components/DisclaimerFooter.tsx` using the `Notice` primitive (`variant="muted"`).
  - [x] Affiliation line + gas-estimate line always render; WA-warning text behind `WA_WARNING_ENABLED` const (default `false`), exposed via optional prop so tests drive both states without env.
  - [x] Rendered `<DisclaimerFooter />` in `App.tsx` after `<DealFeed />`, inside the page container / `AgeGate`.
  - [x] Tests `DisclaimerFooter.test.tsx` per AC #11 (incl. exact WA text on/off).
- [x] **Task 3 — Age-gate decline affordance** (AC: 12–17)
  - [x] Added ghost "I am under 21" action + terminal dead-end screen state in `AgeGate.tsx`; affirm behavior, storage key, strict check, and focus handling preserved.
  - [x] Tests in `AgeGate.test.tsx` per AC #17.
- [x] **Task 4 — Records & regression** (AC: 16, 18, 19)
  - [x] Updated ADR-021 (age-gate decision) per AC #16.
  - [x] Added ADR-035 + change-log line per AC #19.
  - [x] Full suite green (281 client + 124 server), `tsc` clean both, lint clean on changed files.

---

## Dev Notes

### Source-of-truth & current state of every file being touched

- **`server/utils/normalizeDeals.ts`** (UPDATE) — today: filters out malformed/degenerate deals (bad time windows, bad day vocab) at the ingestion chokepoint; valid deals pass through *unchanged*. It is `export function normalizeDeals(deals: Deal[]): Deal[]`, called from `applyIngest`. **This is the correct and only place** to add description sanitization — it is the single chokepoint all ingested data flows through. Preserve the existing window/day filtering; sanitize description on the deals that survive that filter.
- **`server/utils/applyIngest.ts`** (READ, do not change) — calls `normalizeDeals(entry.deals)` per dispensary; if result is empty, source goes `stale=true` and good data is preserved (last-known-good). Sanitizing inside `normalizeDeals` means suppression-only edits ride this path for free. Do NOT let a blocklist hit empty the *array* (that would falsely trip stale) — it suppresses the *description field*, the deal stays.
- **`server/routes/ingestRoute.ts`** (READ) — auth + shape gate only; no description logic here.
- **`client/src/components/DealCard.tsx`** (UPDATE, minimal) — renders `<p>{deal.description}</p>` as plain text (good — no `dangerouslySetInnerHTML`, keep it that way). Add a guard so an empty/suppressed description renders nothing (no stray `<p>`). All other layout unchanged.
- **`client/src/components/AgeGate.tsx`** (UPDATE) — `role="alertdialog"`, `aria-modal`, focus-to-button on mount, strict `ageConfirmed !== true` gate, `useLocalStorage('gma_age_confirmed', false)`. Add decline as a *second* action + a terminal screen; do not touch the affirm path or storage key.
- **`client/src/App.tsx`** (UPDATE) — mount `<DisclaimerFooter />` after `<DealFeed />` inside the page `<div>`.
- **`client/src/components/ui/Notice.tsx`** (READ, reuse) — `variant="muted"` is exactly the footer treatment the review specified. Use it; don't build a new primitive.

### Why the review's "runScrapers" location is wrong now
The regulated-content review (written 2026-06-11) says put the blocklist "at runScrapers." **ADR-034 Goal C (commit b0e2506, 2026-06-18) retired the in-process scraper** — the server is ingest-only. The live equivalent chokepoint is `normalizeDeals` (invoked by `applyIngest` from `POST /api/ingest`). Implement there. Do not resurrect any scrape path.

### Legal grounding (for context — NOT a license to assert conclusions)
- **WAC 314-55-155** ("Advertising requirements…") is current; last amended **2024-08-31 (WSR 24-16-064)**. Its warning-statement and youth-appeal prohibitions attach to **cannabis *licensee*** advertising. Gma's Helper is a non-commerce informational aggregator and not an LCB licensee — which is precisely why "does the licensee-advertiser regime reach this surface?" is a real question for **WA counsel**, not a thing code can decide. Stage the statutory warning text exactly; gate it; let counsel flip the flag.
- Self-attestation age gates are the prevailing norm for non-commerce informational cannabis sites; the decline affordance is a good-faith *strengthening*, not a legal requirement we're asserting.

### Decision point for Erik (surface as the end-of-story question)
AC #16 offers a fork on Item 3: **(a)** ship the decline affordance (recommended — default), or **(b)** keep ADR-021's no-decline and instead record the explicit defensibility rationale. Default to (a) unless Erik says otherwise; (b) is a one-paragraph ADR edit with no code.

### Testing standards
- TypeScript **strict mode** (CLAUDE.md). Write tests for everything (CLAUDE.md). Vitest + Testing Library is the established stack (see neighboring `*.test.tsx`). Server tests are node-runner `*.test.ts` next to source. Match existing patterns exactly — do not introduce a new test framework.

### Project Structure Notes
- Cross-cutting story, no parent epic (mirrors `data-hardening`, `5-1`). Keyed `compliance-launch-gate` in sprint-status under the cross-cutting follow-up section.
- New files: `client/src/components/DisclaimerFooter.tsx` (+ test). Sanitization may be inline in `normalizeDeals.ts` or a sibling `sanitizeDescription.ts` (+ test) — prefer the sibling for testability, imported by `normalizeDeals`.
- ADR: this is an architectural/compliance decision → **new ADR entry required** (CLAUDE.md ADR rule). Use the next free ADR number (check ADR.md tail; ADR-034 is the latest referenced).

### References
- [Source: planning-artifacts/ux-designs/ux-Happy-2026-06-11/review-regulated-content.md#Findings] — findings 1 (high), 2 (high), 3 (medium), 4 (gas qualifier, folded into AC#8).
- [Source: server/utils/normalizeDeals.ts] — ingestion chokepoint.
- [Source: server/utils/applyIngest.ts] — last-known-good ingest semantics; don't trip stale via suppression.
- [Source: client/src/components/AgeGate.tsx] — current gate; ADR-021 ruling.
- [Source: client/src/components/ui/Notice.tsx] — reuse `variant="muted"` for footer.
- [Source: PRD prd-Happy-2026-06-08/prd.md §4.5, §8] — age gate + legal/ads scope.
- [Source: ADR.md ADR-034] — in-process scraper retired; ingest-only server (why blocklist location moved).
- WAC 314-55-155 (current, amended 2024-08-31): https://app.leg.wa.gov/wac/default.aspx?cite=314-55-155 · LCB advertising FAQ: https://lcb.wa.gov/enforcement/cannabis_advertising_faqs

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, dev-story workflow)

### Debug Log References

- Full client suite: 281 passed (29 files). Full server suite: 124 passed (15 files). Server stderr during run is expected error-path logging inside passing `ingestRun`/scraper tests.
- `tsc -b --noEmit` (client) exit 0; `tsc --noEmit` (server) exit 0; `eslint` on changed files exit 0.

### Completion Notes List

- **Two-track honored.** Only Track B (engineering posture) was implemented; no legal conclusion is asserted in code. Counsel-decision points carry `// COUNSEL:` markers: the WA-warning flag (`DisclaimerFooter.tsx`) and the advertiser-status framing (`sanitizeDescription.ts`).
- **Item 1 — chokepoint correction applied.** The review named `runScrapers` as the blocklist site, but ADR-034 Goal C retired the in-process scraper. Implemented at `sanitizeDescription` (sibling module) wired into `normalizeDeals` ← `applyIngest` ← `POST /api/ingest` — the only inbound path. Suppress-not-drop: a blocklist hit blanks the description only, the deal stays, so the last-known-good/stale contract in `applyIngest` is never falsely tripped.
- **Blocklist judgment calls (documented in-code):** whole-word (word-boundary) matching so legit cannabis vocab isn't false-flagged — `cure` does not catch "cured resin", `kid` does not catch "kidding". `gummy`/`gummies` deliberately NOT blocked (lawful product category). The list is an operator-tunable exported constant; expect to tune it, not the logic.
- **Control-char stripping** is done by code point (not a regex literal) to avoid embedding control bytes in source.
- **Item 2 — WA warning is dark by default** (`WA_WARNING_ENABLED = false`). Flip that single const to surface the exact statutory text; the optional `showWaWarning` prop exists only so tests exercise both states. Folded in the review's gas-estimate qualifier (finding #4) as the second always-on line.
- **Item 3 — decline is session-only** (React state, never persisted, never sets `gma_age_confirmed`); a reload re-shows the normal gate. Affirm path, strict boolean check, dialog a11y, and focus-on-mount unchanged. ADR-021 amended (not replaced).
- **Visual follow-up (non-blocking):** the ghost decline button renders on the dark `surface-inverse` gate background; confirm `gma-btn--ghost` contrast there during review (functionally correct; not a11y-verified visually).

### File List

- `server/utils/sanitizeDescription.ts` (new)
- `server/utils/sanitizeDescription.test.ts` (new)
- `server/utils/normalizeDeals.ts` (modified — import + sanitize surviving deals)
- `server/utils/normalizeDeals.test.ts` (modified — +2 wiring tests)
- `client/src/components/DisclaimerFooter.tsx` (new)
- `client/src/components/DisclaimerFooter.test.tsx` (new)
- `client/src/components/DealCard.tsx` (modified — guard empty description)
- `client/src/components/DealCard.test.tsx` (modified — +1 suppression test)
- `client/src/components/AgeGate.tsx` (modified — decline affordance + dead-end)
- `client/src/components/AgeGate.test.tsx` (modified — +2 decline tests)
- `client/src/App.tsx` (modified — mount DisclaimerFooter)
- `ADR.md` (modified — ADR-035 added, ADR-021 amended, change log)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status tracking)

### Change Log

| Date | Change |
|------|--------|
| 2026-06-18 | Implemented all 4 tasks (3 compliance items). Sanitization at ingest chokepoint + blocklist; standing disclaimer footer with flag-gated WA warning; age-gate decline affordance. ADR-035 added, ADR-021 amended. 281 client + 124 server tests green; tsc + lint clean. Status → review. |

## Review Findings

Code review 2026-06-18 (3 adversarial layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). 3 decision-needed (resolved), 3 patch (applied), 2 defer, 6 dismissed as noise/by-design. All resolved + applied this session; full suite green afterward (282 client + 125 server, tsc + client lint clean).

- [x] [Review][Decision→Patch] **Blocklist defeated by inline markup / emoji obfuscation** — RESOLVED: minimal fix. Emoji/ignorables now strip to a *space* (not '') so `pain🔥relief`→"pain relief" is caught; tag-split (`the<b>rapeutic</b>`) accepted as residual risk (non-adversarial scraped source). [server/utils/sanitizeDescription.ts]
- [x] [Review][Decision→Patch] **Blocklist over-blocks legitimate strain names** — RESOLVED: dropped `candy` from `DESCRIPTION_BLOCKLIST` (collides with "Cotton Candy"/"Candy Kush"); kept `kid`/`cartoon`. [server/utils/sanitizeDescription.ts]
- [x] [Review][Decision→Patch] **De-ALL-CAPS sub-step (AC#1c) silently omitted** — RESOLVED: recorded the intentional skip in-code (the "only if trivially safe" latitude; any safe heuristic would corrupt brand/THC/OG tokens). No behavior change. [server/utils/sanitizeDescription.ts]
- [x] [Review][Patch] **Decline dead-end screen never receives focus (a11y, AC#15)** — FIXED: added a `declined`-keyed focus effect + `tabIndex={-1}` on the dead-end container so focus lands on the alertdialog instead of `<body>`. New test asserts `toHaveFocus`. [client/src/components/AgeGate.tsx]
- [x] [Review][Patch] **Suppressed `''` descriptions can collide DealFeed React keys** — FIXED: appended map index to the row key. [client/src/components/DealFeed.tsx:121]
- [x] [Review][Patch] **DealCard guard not robust to un-normalized data** — FIXED: guard now `deal.description && deal.description.trim() !== ''` (covers undefined/whitespace from non-ingest paths). [client/src/components/DealCard.tsx]
- [x] [Review][Defer] **Affirm-gate has no real focus trap** — `aria-modal` set but no key handler / `inert` background; Tab can leave the dialog. Pre-existing (ADR-021 deferred-work), not introduced by this change. [client/src/components/AgeGate.tsx] — deferred, pre-existing
- [x] [Review][Defer] **Surrogate-pair split on no-space truncation** — an 80-char cap with no space and an astral character on the boundary can leave a lone UTF-16 surrogate. Negligible (astral letters in a deal description, exact-80 boundary); renders as a replacement char. [server/utils/sanitizeDescription.ts:85] — deferred, negligible

**Dismissed (6, by-design or false-positive):** decline bypassable via reload + no in-app recovery (intended per AC#13 — self-attestation, never lock out a shared browser); WA warning dark in prod (intended, counsel-gated AC#9); cross-tab declined/confirmed stuck-state (no cross-tab sync — confirmed in useLocalStorage.ts); near-miss blocklist phrasings (inherent list limitation); empty-string sentinel coupling (no broken consumer; real consequences captured as P2/P3); App.tsx import-path concern (false positive — review-prompt path mislabel; build + 281 tests green).
