---
title: 'Repo hygiene closeout: doc-staleness fixes + grouped commits + lockfile/CRLF cure'
type: 'chore'
created: '2026-07-02'
status: 'done'
baseline_commit: '473fba5'
context: ['{project-root}/_bmad-output/implementation-artifacts/investigations/repo-hygiene-audit-investigation.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The 2026-07-02 hygiene audit confirmed: three docs claim work is "open" that shipped (HANDOFF_DECISION TODOs vs ADR-052/066; age-gate spec `in-review` vs merged `de1b87f`; FIXES.md item 6 vs the fix-6 verdict), a misspelled findings doc sits at repo root with unearned "CONFIRMED" labels, and ten days of unpushed work sits tangled in the tree (3 uncommitted doc deletions, lockfile drift + CRLF churn, 24MB unmanaged images).

**Approach:** Batch A — four doc-staleness edits so every pointer matches reality. Batch B — move images out of the repo, cure lockfile CRLF churn with `.gitattributes`, then land everything as per-topic commits on master and push (Erik-approved 2026-07-02).

## Boundaries & Constraints

**Always:** Per-topic commits (no omnibus); each deletion commit states its rationale; run the real `npm run build` before pushing (auto-deploy); move images to `C:\Users\erikc\Dev\Happy-assets\` intact (move, never delete).

**Ask First:** Any additional file deletion beyond the 3 already-staged doc deletions; any content rewrite of the dispensary findings beyond the header/labels specified; force-push or history rewrite (never expected).

**Never:** No code changes. No edits inside other specs' frozen blocks (status frontmatter only). No `npm install`/dependency changes beyond committing the existing root lockfile diff. Don't touch the four WA legal warnings or any shipped client/server source.

</frozen-after-approval>

## Code Map

- `_bmad-output/specs/spec-seo-crawler-visibility/HANDOFF_DECISION.md:116-119` -- stale TODO checkboxes (legal + ADR are done)
- `ADR.md:488,618` -- ADR-052 (0a/0b split) and ADR-066 (legal gate closed) — the receipts the TODOs point to
- `_bmad-output/implementation-artifacts/spec-age-gate-logo-21plus-scrim.md:5` -- `status: 'in-review'` though shipped as `de1b87f`
- `_bmad-output/implementation-artifacts/investigations/FIXES.md` -- items 1/6 resolved by `fix6-basePrice-verdict.md` (item 2 affirmed as the only honest path), doc never annotated
- `unverifyed-dispensary-findings.md` (repo root) -- misspelled, mislocated, overreaching labels, no supersession note
- `GmasINCOlist/`, `Area icon image.jpg` -- 24MB untracked images to move out
- `package-lock.json` -- real dev-dep drift (concurrently 9.2.1→9.2.3, shell-quote 1.8.3→1.8.4); `client/`+`server/package-lock.json` -- CRLF-only phantom modifications (core.autocrlf=true, no .gitattributes)

## Tasks & Acceptance

**Execution — Batch A (edits):**
- [x] `_bmad-output/specs/spec-seo-crawler-visibility/HANDOFF_DECISION.md` -- tick the legal TODO (annotate "✅ resolved by ADR-066, 2026-06-30") and the ADR TODO ("✅ logged as ADR-052, 2026-06-24"); leave Phase-2-schema and epics-generation TODOs open -- doc must stop contradicting ADR.md
- [x] `_bmad-output/implementation-artifacts/spec-age-gate-logo-21plus-scrim.md` -- frontmatter `status: 'in-review'` → `'done'` -- shipped as `de1b87f`
- [x] `_bmad-output/implementation-artifacts/investigations/FIXES.md` -- add a dated "Status update 2026-07-02" block at top: item 6 answered by `fix6-basePrice-verdict.md` (basePrice = real list price but flat promo rate); verdict kills item 1's replacement input and the "1,665 carry ≥2 obs" premise (all obs in one 52-min window); item 2 remains the honest path, time-gated -- stops re-litigation
- [x] `unverifyed-dispensary-findings.md` -- `git mv`-equivalent (untracked: plain move) to `_bmad-output/implementation-artifacts/investigations/dispensary-recon-98274-2026-06-28.md`; add header note: superseded by the Phase-2 Weedmaps registry (PR#44, merged 2026-06-29) for scrapeable-store ground truth; retitle "CONFIRMED" sections to "Observed (source not recorded per row)" -- honesty labels

**Execution — Batch B (tree ops + commits):**
- [x] Move `GmasINCOlist/` and `Area icon image.jpg` → `C:\Users\erikc\Dev\Happy-assets\` (create dir); add `.gitignore` entries `GmasINCOlist/` and `Area icon image.jpg` to guard recurrence
- [x] `.gitattributes` (new, repo root) -- `package-lock.json text eol=lf` -- pins all three lockfiles LF at any depth; then restore clean working copies of `client/package-lock.json` + `server/package-lock.json` so their phantom-M clears
- [x] Commit series on master (landed as `baf4904`, `f48dfa9`, `2b9f28b`, `34f0236`, `52f503d`) (message prefixes indicative): (1) `docs(investigations): remove 3 superseded case files` — deletions + rationale (all covered work shipped: ADR-047, stories 5.1/6.1); (2) `docs(seo): sync HANDOFF_DECISION TODOs with ADR-052/066` — includes committing the untracked HANDOFF_DECISION.md + `docs/seo-ai-crawler-visibility-plan.md`; (3) `docs(spec): age-gate spec shipped — status done` — includes the untracked spec file; (4) `docs(investigations): commit accumulated investigation artifacts` — FIXES.md, value-analysis, monetization docs, `_bmad-output/planning-artifacts/research/`, deal-source inventory, capture raw.json, moved dispensary recon, hygiene-audit case file, this spec; (5) `chore(deps): lockfile refresh + .gitattributes LF pin for lockfiles`
- [x] Push master after `npm run build` passes (build ✅ exit 0 pre-commit-5 and re-run at closeout; pushed with the closing review-patch commit)

**Acceptance Criteria:**
- Given the commit series lands, when `git status --porcelain` runs, then output is empty (no dirty, no untracked).
- Given ADR.md, when reading HANDOFF_DECISION TODOs, then no checkbox contradicts ADR-052/ADR-066.
- Given a fresh `npm install` in any package, when `git status` runs, then no lockfile shows phantom modification (LF pinned).
- Given the push, when GitHub is checked, then origin/master contains all five commits and the build passed locally beforehand.

## Design Notes

Commit 5 keeps the root-lockfile dev-dep refresh (floating-range `npm install` artifact; reverting just recreates it next install). `.gitattributes` uses the basename pattern so one line covers all three lockfiles. `[skip ci]` is NOT used — CI on doc commits is cheap and validates nothing regressed; Render redeploy on push is low-risk (docs + dev-dep lockfile only, no runtime code; post-redeploy data reset self-heals via the ADR-047 commit-back seed + the push-triggered scrape run from PR#24).

## Verification

**Commands:**
- `npm run build` -- expected: client + server build clean (required before push per recorded feedback)
- `git status --porcelain` -- expected: empty after final commit
- `git log --oneline -6` -- expected: the 5 new commits atop `473fba5`

**Manual checks (if no CLI):**
- `C:\Users\erikc\Dev\Happy-assets\` contains GmasINCOlist (40 top-level entries: 39 JPEGs + `Store sale tags/` subdir; 72 files total) + Area icon image.jpg; repo root has neither. ✅ verified post-move.

## Suggested Review Order

**Doc-staleness reconciliation (the core of the change)**

- Ticked TODOs + sync note; the doc stops contradicting ADR-052/066
  [`HANDOFF_DECISION.md:116`](../specs/spec-seo-crawler-visibility/HANDOFF_DECISION.md#L116)

- Review patch: in-body `blocked: legal` markers annotated (three spots), not just the checkbox
  [`HANDOFF_DECISION.md:104`](../specs/spec-seo-crawler-visibility/HANDOFF_DECISION.md#L104)

- Shipped spec unstuck: `in-review` → `done` (work merged as `de1b87f`)
  [`spec-age-gate-logo-21plus-scrim.md:5`](spec-age-gate-logo-21plus-scrim.md#L5)

- Dated status block: item 6 answered, item 1's input killed, item 2 the honest path
  [`FIXES.md:3`](investigations/FIXES.md#L3)

**Honesty labels & supersession banners**

- Moved from repo root, misspelling fixed; supersession header + leads-not-facts framing
  [`dispensary-recon-98274-2026-06-28.md:4`](investigations/dispensary-recon-98274-2026-06-28.md#L4)

- "CONFIRMED" → "OBSERVED (source not recorded per row)" on all three sections
  [`dispensary-recon-98274-2026-06-28.md:84`](investigations/dispensary-recon-98274-2026-06-28.md#L84)

- Review patch: banner flags debunked figures + missing `data-snapshots/` (never committed)
  [`value-analysis-2026-06-24.md:3`](investigations/value-analysis-2026-06-24.md#L3)

- Review patch: 4 docs' dangling `unverifyed-…` pointers redirected to the new path
  [`weedmaps-source-wiring.md:30`](weedmaps-source-wiring.md#L30)

**Tree-hygiene config**

- One basename line pins all three lockfiles LF — kills the phantom-M churn at the root cause
  [`.gitattributes:3`](../../.gitattributes#L3)

- Review patch: patterns anchored to root so a future curated asset subset can't be silently ignored
  [`.gitignore:15`](../../.gitignore#L15)

**Peripherals**

- Five review findings deferred (lockfile-drift policy, provenance comments, pre-existing doc nits)
  [`deferred-work.md:3`](deferred-work.md#L3)

- The investigation behind every edit; review-patched image-count + Deduction-1 wording
  [`repo-hygiene-audit-investigation.md:1`](investigations/repo-hygiene-audit-investigation.md#L1)
