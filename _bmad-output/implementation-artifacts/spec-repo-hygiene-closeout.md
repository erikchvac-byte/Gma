---
title: 'Repo hygiene closeout: doc-staleness fixes + grouped commits + lockfile/CRLF cure'
type: 'chore'
created: '2026-07-02'
status: 'in-progress'
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
- `_bmad-output/implementation-artifacts/investigations/FIXES.md` -- items 1/2/6 outdated by `fix6-basePrice-verdict.md`
- `unverifyed-dispensary-findings.md` (repo root) -- misspelled, mislocated, overreaching labels, no supersession note
- `GmasINCOlist/`, `Area icon image.jpg` -- 24MB untracked images to move out
- `package-lock.json` -- real dev-dep drift (concurrently 9.2.1→9.2.3, shell-quote 1.8.3→1.8.4); `client/`+`server/package-lock.json` -- CRLF-only phantom modifications (core.autocrlf=true, no .gitattributes)

## Tasks & Acceptance

**Execution — Batch A (edits):**
- [ ] `_bmad-output/specs/spec-seo-crawler-visibility/HANDOFF_DECISION.md` -- tick the legal TODO (annotate "✅ resolved by ADR-066, 2026-06-30") and the ADR TODO ("✅ logged as ADR-052, 2026-06-24"); leave Phase-2-schema and epics-generation TODOs open -- doc must stop contradicting ADR.md
- [ ] `_bmad-output/implementation-artifacts/spec-age-gate-logo-21plus-scrim.md` -- frontmatter `status: 'in-review'` → `'done'` -- shipped as `de1b87f`
- [ ] `_bmad-output/implementation-artifacts/investigations/FIXES.md` -- add a dated "Status update 2026-07-02" block at top: item 6 answered by `fix6-basePrice-verdict.md` (basePrice = real list price but flat promo rate); verdict kills item 1's replacement input and the "1,665 carry ≥2 obs" premise (all obs in one 52-min window); item 2 remains the honest path, time-gated -- stops re-litigation
- [ ] `unverifyed-dispensary-findings.md` -- `git mv`-equivalent (untracked: plain move) to `_bmad-output/implementation-artifacts/investigations/dispensary-recon-98274-2026-06-28.md`; add header note: superseded by the Phase-2 Weedmaps registry (PR#44, merged 2026-06-29) for scrapeable-store ground truth; retitle "CONFIRMED" sections to "Observed (source not recorded per row)" -- honesty labels

**Execution — Batch B (tree ops + commits):**
- [ ] Move `GmasINCOlist/` and `Area icon image.jpg` → `C:\Users\erikc\Dev\Happy-assets\` (create dir); add `.gitignore` entries `GmasINCOlist/` and `Area icon image.jpg` to guard recurrence
- [ ] `.gitattributes` (new, repo root) -- `package-lock.json text eol=lf` -- pins all three lockfiles LF at any depth; then restore clean working copies of `client/package-lock.json` + `server/package-lock.json` so their phantom-M clears
- [ ] Commit series on master (message prefixes indicative): (1) `docs(investigations): remove 3 superseded case files` — deletions + rationale (all covered work shipped: ADR-047, stories 5.1/6.1); (2) `docs(seo): sync HANDOFF_DECISION TODOs with ADR-052/066` — includes committing the untracked HANDOFF_DECISION.md + `docs/seo-ai-crawler-visibility-plan.md`; (3) `docs(spec): age-gate spec shipped — status done` — includes the untracked spec file; (4) `docs(investigations): commit accumulated investigation artifacts` — FIXES.md, value-analysis, monetization docs, `_bmad-output/planning-artifacts/research/`, deal-source inventory, capture raw.json, moved dispensary recon, hygiene-audit case file, this spec; (5) `chore(deps): lockfile refresh + .gitattributes LF pin for lockfiles`
- [ ] Push master after `npm run build` passes

**Acceptance Criteria:**
- Given the commit series lands, when `git status --porcelain` runs, then output is empty (no dirty, no untracked).
- Given ADR.md, when reading HANDOFF_DECISION TODOs, then no checkbox contradicts ADR-052/ADR-066.
- Given a fresh `npm install` in any package, when `git status` runs, then no lockfile shows phantom modification (LF pinned).
- Given the push, when GitHub is checked, then origin/master contains all five commits and the build passed locally beforehand.

## Design Notes

Commit 5 keeps the root-lockfile dev-dep refresh (floating-range `npm install` artifact; reverting just recreates it next install). `.gitattributes` uses the basename pattern so one line covers all three lockfiles. `[skip ci]` is NOT used — CI on doc commits is cheap and validates nothing regressed; Render redeploy on push is harmless (doc-only).

## Verification

**Commands:**
- `npm run build` -- expected: client + server build clean (required before push per recorded feedback)
- `git status --porcelain` -- expected: empty after final commit
- `git log --oneline -6` -- expected: the 5 new commits atop `473fba5`

**Manual checks (if no CLI):**
- `C:\Users\erikc\Dev\Happy-assets\` contains GmasINCOlist (40 files) + Area icon image.jpg; repo root has neither.
