# Review Role 3 — Acceptance Auditor (diff + spec + project + context docs)

> **Status: REVIEWED — 2026-06-16 (Erik).** Completed; no findings submitted for loopback processing.

Run this in a **fresh session**, ideally a **different LLM**. Use the acceptance-audit lens.

## What you get
- The diff at `_bmad-output/implementation-artifacts/review-6-3/diff.patch`.
- The spec at `_bmad-output/implementation-artifacts/6-3-surface-reskin-and-vehicle-sheet.md` — read it fully, including the `<frozen-after-approval>` Intent / Boundaries / I-O Matrix.
- **Read access to the project** at `C:\Users\erikc\Dev\Happy`.
- The spec's `context:` frontmatter docs — read each:
  - `_bmad-output/implementation-artifacts/epic-6-context.md`
  - `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/EXPERIENCE.md`
  - `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/ui_kits/app/feed.jsx`
  - `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/imports/gmas-helper-design-system/ui_kits/app/settings.jsx`
  - Also useful: the ruling log `…/ux-Happy-2026-06-11/.decision-log.md` and `DESIGN.md`.

## Your job
Audit the implementation against the spec's Acceptance Criteria, the I/O & Edge-Case Matrix, the Boundaries (Always / Never), and the EXPERIENCE.md accessibility floor. For each AC and matrix row, state **met / not met / partial** with evidence (file:line). Specifically verify:
- **Behavior frozen:** every filter/sort/gas/expiry rule and the vehicle auto-resolve cascade (no Save button) produce identical outcomes; DealCard null-handling unchanged.
- **A11y contract:** `banner` + `main` landmarks; exactly one `h1` "Gma's Helper"; dispensary names `h2`; sheet = `role="dialog"` aria-modal, focus enters on open, Esc/scrim/close all work, focus returns to the gear; age gate keeps `alertdialog`; icon-only controls have `aria-label`.
- **Ruled decisions honored:** bottom sheet with dimmed scrim; no Save button (`.decision-log.md:43,65`); gear-only header (saved vehicle shown in the sheet); `--border-field` token added and consumed by `.gma-select`/`.gma-input`; generic empty-state copy kept.
- **Boundaries — "Never":** no server/hook/util changes; no new npm runtime dep; no hardcoded hex; no filter-aware empty state / manual refresh / cascade spinner.
- **Deviations to scrutinize:** focus-return is implemented via `document.activeElement` capture (spec Design Notes mention a `gearRef`) — confirm the AC ("focus returns to the gear") is actually satisfied. The sticky-header `scroll-padding-top` (EXPERIENCE.md) was NOT implemented — flag as a gap if you consider it AC-bearing.

## Output
A per-AC / per-matrix-row verdict table, then a list of any **violations** (with severity + file:line) of acceptance criteria, boundary rules, or context-doc principles. Classify each violation as a **spec deviation** vs a **design-doc deviation**.
