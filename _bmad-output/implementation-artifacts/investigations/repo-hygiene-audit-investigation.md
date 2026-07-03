# Investigation: Repo hygiene & documentation-integrity audit (12 claims)

## Hand-off Brief

1. **What happened.** A 12-point external audit of the Happy working tree (2026-07-02) was verified claim-by-claim; 5 claims Confirmed, 2 partially Confirmed, 3 Refuted, 2 moot (target doc removed by Erik pre-investigation).
2. **Where the case stands.** Concluded. The audit's tree-hygiene claims (untracked bloat, lockfile churn, uncommitted deletions, workstream tangle) are real; its documentation-integrity claims are largely wrong — the 0a/0b ADR exists (ADR-052), the legal gate was closed (ADR-066), the age-gate spec shipped (`de1b87f`), and the "orphaned" capture JSON has a companion analysis doc.
3. **What's needed next.** A doc-staleness batch (4 small edits) + a tree-hygiene batch (grouped commits + GmasINCOlist disposition decision from Erik).

## Case Info

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Ticket           | N/A                                                                |
| Date opened      | 2026-07-02                                                         |
| Status           | Concluded                                                          |
| System           | Windows 11 Pro, repo C:\Users\erikc\Dev\Happy, branch master @ 473fba5 |
| Evidence sources | git status/log/diff, ADR.md, working-tree docs, AgeGate.tsx, raw capture JSON, file mtimes |

## Problem Statement

Twelve claims from a prior adversarial review, registered as H1–H12 (full text preserved in conversation; abbreviated below with verdicts).

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| `git status --porcelain` 2026-07-02 | Available | Stronghold; matches surface shape of H7/H8/H9/H12 |
| "Its an idea.md" (H1/H2 target) | Missing (removed) | Erik found and removed it during this investigation; zero trace in tree (no `*idea*` file; `Jinja2\|product_analytics\|Next.js ISR\|strictly adhere` grep = 0) |
| `spec-seo-crawler-visibility/HANDOFF_DECISION.md` | Available | TODOs read (lines 115–119) |
| `ADR.md` | Available | ADR-052 (line 488), ADR-066 (line 618), changelog 06-24 (line 745) |
| `spec-age-gate-logo-21plus-scrim.md` + `client/src/components/AgeGate.tsx` + git history | Available | Shipped-state cross-check done |
| `unverifyed-dispensary-findings.md` | Available | Read in full |
| Lockfile diffs (`git diff`, `--ignore-cr-at-eol`) | Available | Root = real drift; client/server = pure line-ending churn |
| `investigations/FIXES.md`, `fix6-basePrice-verdict.md`, `sprint-status.yaml` | Available | Cross-checked |
| `dutchie-special-card-capture-2026-07-02.raw.json` + `...field-capture-2026-07-02.md` | Available | cardCounts tallied; companion doc read |
| Untracked-path mtimes | Available | Window 2026-06-23 16:22 → 2026-07-02 17:06 |

## Confirmed Findings

### Finding 1: Working-tree shape matches audit surface (stronghold)
**Evidence:** `git status --porcelain` 2026-07-02 — 3 deleted tracked docs, 3 modified lockfiles, 12 untracked paths; master @ `473fba5`.

### Finding 2: ADR-052 IS the 0a/0b split ADR; ADR-066 closed the legal gate (refutes H3's core)
**Evidence:** `ADR.md:488-493` (ADR-052, logged per changelog `ADR.md:745` on 2026-06-24 — same day as HANDOFF_DECISION); `ADR.md:618-621` + changelog `ADR.md:737` (ADR-066, 2026-06-30: founder determination — WAC 314-55-155 binds licensed retailers, not aggregators; "The SEO spec's Phase 0b legal flag is resolved by this same determination").
**Detail:** The audit's "ADR never done, legal question unowned" is false. What survives: `HANDOFF_DECISION.md:116-119` checkboxes were never ticked — the doc is stale, not the work undone. Residual genuinely-open TODO: pin Phase 2 field schema; `bmad-create-epics-and-stories` not yet run (held per Erik's "talk first").

### Finding 3: Age-gate spec SHIPPED; checkboxes are true; only the status field is stale (refutes H4)
**Evidence:** `git log -- client/src/components/AgeGate.tsx` → `de1b87f feat(age-gate): shared scrim backdrop + 21+ labels (ADR-061)` on master; `AgeGate.tsx:150,181,191` ("21+"), `:221` (`--text-4xl`), `:259-262` (scrim, zIndex 50); baseline `995153d` verified an ancestor of HEAD (normal, not a defect).
**Detail:** Tree shows no client changes *because the work is merged*. Defects that remain: spec status still `in-review` (`spec-age-gate-logo-21plus-scrim.md:5`) and the spec file itself is untracked.

### Finding 4: No z-index contradiction in the spec (refutes H5)
**Evidence:** Boundaries (`spec:20`): "layered below the card (z-index 51)" — the parenthetical attaches to *the card*. Tasks (`spec:45`): scrim `z-index: 50`. Design Notes (`spec:56`): scrim 50, card 51. Shipped code agrees: `AgeGate.tsx:262` (scrim 50), `:278` (card 51).
**Detail:** Grammatically ambiguous phrasing at worst; all three sections and the code are consistent. No implementer was misled — it shipped correctly.

### Finding 5: Dispensary-findings doc — sloppy labels Confirmed; "contradiction" is arguable (H6 partial)
**Evidence:** `unverifyed-dispensary-findings.md:30` (Happy Time: "Dutchie JS-gated + bot block" under *no accessible MENU data*) vs `:84` (Happy Time 30%-off + 3 happy-hour windows under *CONFIRMED DEAL STRUCTURES*); `:2` lists sources "Weedmaps, Leafly, store websites".
**Detail:** Menu/product data ≠ deal schedule — the deal info can come from the store website, so the dual listing is not strictly contradictory, but the doc never says which source backs the Happy Time row, so "CONFIRMED" is unearned. The "CONFIRMED PRICE COMPARISONS" table (`:118-127`) containing `unconfirmed`/`est.` cells is Confirmed overreach. Misspelled filename at repo root: Confirmed. No supersession note: Confirmed — Phase-2 Weedmaps registry (merged 06-29, PR#44) covers the scrapeable-store ground; this 06-28 doc reads as its input and says nothing about being superseded.

### Finding 6: GmasINCOlist bloat + AI-batch composition (confirms H7)
**Evidence:** `du -sh` = 24MB; 39 JPEGs (73–500KB) + `Store sale tags/` subdir; 13 filenames generator-stamped `202606270932` (e.g. `Minimalist_cookie_icon_app_UI_202606270932.jpeg`); none webp; untracked; plus root-level `Area icon image.jpg` (untracked, mtime 06-26).
**Detail:** No disposition recorded anywhere. The generator-stamped subset sits in tension with recorded feedback rejecting AI redraws ([[feedback_deal-icon-style]]), though merely storing candidates is not shipping them.

### Finding 7: Three tracked case files deleted, uncommitted, no recorded rationale (confirms H8's state)
**Evidence:** `git diff --stat` = 482 deletions across `stale-last-updated…`, `story-5-1-review…`, `story-6-1-investigation.md`; added in `9a2d4dc`/`a1c1674`/`4ce5b37`.
**Detail:** All three cover long-shipped work (commit-back seed ADR-047 done per `sprint-status.yaml:81`; stories 5.1/6.1 shipped) — deliberate cleanup is the plausible intent, but intent is unrecorded and the deletion sits uncommitted. Git history preserves the content either way, so "contradicts preserve-context discipline" is soft — nothing is lost on commit.

### Finding 8: Lockfile state exactly as claimed (confirms H9)
**Evidence:** Root `package-lock.json`: real 14-line diff — `concurrently 9.2.1→9.2.3`, `shell-quote 1.8.3→1.8.4` (dev deps, floating-range refresh; no package.json change). `client/`+`server/package-lock.json`: `git diff --stat` shows zero content lines; git flags them modified purely on LF→CRLF normalization warnings.

### Finding 9: FIXES.md untracked-in-planning and internally stale (confirms H10)
**Evidence:** No FIXES.md item appears in `sprint-status.yaml` (grep). `fix6-basePrice-verdict.md` (dated 2026-06-24) answers item 6 — and its verdict **kills item 1's replacement input too** ("Do not feed product-special discount % into break-even math") — while `FIXES.md:34-36` still lists item 6 as open and item 1's fix as viable. FIXES.md also still claims "1,665 products already carry ≥2 obs," which the verdict debunks (all 5,469 obs in one ~52-min window).

### Finding 10: Raw capture JSON is NOT orphaned (refutes H11)
**Evidence:** Companion doc `dutchie-special-card-field-capture-2026-07-02.md` (same folder) cites the raw file by name (`:11`) and explicitly interprets the zero-card stores (`:42-44`: "8 of 17 stores returned ZERO special cards (separate concern — see below)").
**Detail:** The audit's count is also wrong: raw tally = **8** stores at `cardCount: 0` (all `error: null`), not 3.

### Finding 11: Ten-day multi-workstream dirty window (confirms H12, one overstatement)
**Evidence:** mtimes — monetization research 06-23, value-analysis + FIXES 06-24, SEO handoff 06-24 / docs plan 06-26, images 06-26–06-30, age-gate spec + dispensary findings 06-28, capture 07-02, lockfiles 07-02; none pushed (untracked/uncommitted by definition).
**Detail:** Tangle and no-remote-backup Confirmed. "Atomic commits are now impossible" is overstated: no two workstreams touch the same file, so per-topic commits remain cleanly separable by path.

## Deduced Conclusions

### Deduction 1: The audit is reliable on tree mechanics, unreliable on project history
**Based on:** Findings 2, 3, 4, 10 (refutations) vs 1, 6, 7, 8, 9, 11 (confirmations).
**Reasoning:** Every claim checkable from `git status` alone verified; every claim requiring knowledge of ADR.md, merged commits, or sibling docs was wrong or overstated. The auditor read the dirty tree but not the repo's decision record.
**Conclusion:** Treat the audit as a hygiene TODO list, not as evidence of process failure — the process artifacts (ADRs, shipped commits, companion analyses) largely exist; the *stale pointers to them* are the real defect class.

## Hypothesized Paths

| # | Claim (abbrev.) | Status | Resolution |
|---|---|---|---|
| H1 | "Its an idea.md" contradicts architecture, cloaking risk | **Moot** | Doc removed by Erik pre-sweep; content unverifiable in-repo; disposition resolved |
| H2 | Same doc ignores WAC legal gate | **Moot / premise outdated** | Doc removed; the gate itself was closed 06-30 by ADR-066 anyway |
| H3 | HANDOFF TODOs unchecked; ADR never logged | **Refuted (core) / Confirmed (staleness)** | ADR-052 logged same-day; legal answered by ADR-066; only the checkbox text is stale (Finding 2) |
| H4 | spec-age-gate checkboxes false or spec stale | **Refuted as defect** | Shipped `de1b87f`; checkboxes true; status field stale + spec untracked (Finding 3) |
| H5 | z-index contradiction | **Refuted** | Parenthetical attaches to card; spec + code consistent (Finding 4) |
| H6 | Findings doc contradiction + confirmed-overreach | **Partially Confirmed** | Labels overreach + no supersession note; Happy Time dual-listing defensible (Finding 5) |
| H7 | 24MB image dump, no disposition | **Confirmed** | Finding 6 |
| H8 | 3 deletions uncommitted, no rationale | **Confirmed (state); intent likely deliberate cleanup** | Finding 7 |
| H9 | Lockfile drift + CRLF churn | **Confirmed** | Finding 8 |
| H10 | FIXES.md untracked + item 6 stale | **Confirmed** | Finding 9 |
| H11 | Raw JSON orphaned | **Refuted** | Companion doc exists and interprets it; count was 8 not 3 (Finding 10) |
| H12 | 10-day tangle, no backup | **Confirmed (one overstatement)** | Finding 11 |

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Intent behind the 3 doc deletions | Confirms deliberate cleanup vs accident before committing | Erik states it (one sentence in the commit message suffices) |
| GmasINCOlist disposition | Decides keep-local / Drive / .gitignore / partial-commit | Erik decides |

## Conclusion

**Confidence: High.**

The tree-hygiene half of the audit is Confirmed: 24MB unmanaged images (H7), uncommitted deletions with unrecorded intent (H8), lockfile drift + CRLF churn (H9), a stale untracked FIXES.md (H10), and a ten-day unpushed multi-workstream window (H12). The documentation-integrity half is largely Refuted: the 0a/0b ADR exists (ADR-052), the legal gate was explicitly closed (ADR-066), the age-gate spec shipped and its checkboxes are true (`de1b87f`), the z-index "contradiction" is a misparse, and the capture JSON has a companion analysis. The recurring real defect is **stale pointers**: three docs (HANDOFF_DECISION TODOs, spec-age-gate status, FIXES.md) say "open" about work that is done.

## Recommended Next Steps

### Fix direction (two batches)

**Batch A — doc staleness (pure edits, ~15 min):**
1. Tick/annotate `HANDOFF_DECISION.md:116-119` — legal ✅ ADR-066, ADR ✅ ADR-052; leave Phase-2-schema + epics-generation genuinely open.
2. Flip `spec-age-gate…md:5` status `in-review` → `done`.
3. Annotate `FIXES.md`: item 6 answered by `fix6-basePrice-verdict.md` (and its verdict invalidates item 1's replacement input + the "1,665 ≥2 obs" line).
4. `unverifyed-dispensary-findings.md`: fix filename, move into `investigations/`, add a supersession header pointing at the Phase-2 Weedmaps registry, cite the Happy Time deal source or soften "CONFIRMED".

**Batch B — tree hygiene (needs Erik's go-ahead per commit rules):**
5. Per-topic commits of the untracked docs + the 3 deletions (with rationale line) — paths don't overlap, atomic commits are straightforward.
6. Lockfiles: commit the root dev-dep refresh (or `git checkout -- package-lock.json` to defer); `git checkout` the two CRLF-only lockfiles; optionally add `.gitattributes` (`package-lock.json text eol=lf`) to end the churn permanently.
7. GmasINCOlist + `Area icon image.jpg`: Erik picks — move out of repo (Drive/local), or `.gitignore`, or commit a curated webp subset. Recommend move-out + `.gitignore`; raw JPEGs at 24MB don't belong in every clone.

### Diagnostic
None required — no code defect found.

## Reproduction Plan
N/A (documentation/state audit; all evidence citations above are re-runnable commands).

## Side Findings

- The companion capture doc surfaces real product findings the audit missed: Evolve's dropped 50%-online tier + paraphernalia exclusion, the Salish Coast `bogo` mislabel, and 2020 Solutions' date-bounded July Glass Sale (`dutchie-special-card-field-capture-2026-07-02.md:50-60`) — possible future story input.
- `feedback_verify-before-asserting-state` vindicated again: two of the audit's strongest-worded claims (H3, H4) failed exactly because state was asserted from doc surfaces instead of the decision record.
