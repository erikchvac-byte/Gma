# Storage Re-Architecture — Corpus Validation & Reconciliation Memo

**Date:** 2026-07-06
**Author:** Mary (Business Analyst)
**Purpose:** The corpus synthesis (`investigations/corpus-synthesis-distilled-truth-2026-07-06.md`, Pillar 5) names storage as the single hardest deadline. Before scoping anything new, I checked whether it was *already* scoped. **It is** — ADR-077 (Accepted 2026-07-06) + `plans/products-storage-local-sqlite-plan.md`. This memo therefore does NOT re-plan it. It (1) validates that plan against the full body of evidence, and (2) flags what the corpus adds that the plan does not yet capture.

---

## Verdict: the existing plan is sound and corpus-aligned. Do not re-plan — execute it.

ADR-077's "local SQLite + push-derived-facts" decision is the correct call and is consistent with every relevant corpus finding. Specifically it satisfies all three constraints the forensic audit raised:

| Audit finding (Pillar 5) | ADR-077 answer | Validated? |
|---|---|---|
| **P1** — git 50 MB warning ~Jul 23, 100 MB block ~Aug 20 | Raw history leaves git entirely (`git rm products.json`) | ✅ Kills the wall permanently, not deferred |
| **P2** — uncached whole-file parse → OOM on Render free | Phase 0 mtime-cache + Render only reads small derived files | ✅ Addressed twice over |
| Cannot compute deltas on a whole-file re-parse | SQLite substrate + indices when B1 needs them | ✅ Unblocks the time series |

The plan also correctly preserves the invariants the corpus treats as load-bearing: honesty gates run **at derivation time, unchanged**; the deals pipeline (`data.json` / `/api/data`, ADR-043/053) is untouched; no history pruning; and it is explicitly *not* a revival of the parked paid-Docker self-host (ADR-033). The "Render never queries the home DB" rule is the right safety spine.

**One-line judgment:** the plan is boring, reversible, $0, and matches the evidence. The only risk is schedule — and that is an execution risk, not a design gap.

---

## What the corpus ADDS that the plan does not yet name

These are not objections — they are three items the synthesis surfaces that the plan should absorb.

### 1. The storage move and the derivation-engine PRD are ONE coupled program, not two
The plan hands off the query layer as a future "Rule of Three" item ("Add SQLite indices when B1 needs time-range queries"). The corpus reframes this: **the derivation engine (Pillar 3, the unbuilt value) is gated on this storage move.** You cannot compute special-start/end events, brand personas, dormancy feeds, or vs-own-median discounts efficiently on a whole-file re-parse — they need exactly the DB substrate Phase 1 creates.
→ **Reconciliation:** treat the SQLite schema in Phase 1 as the *foundation the derivation engine builds on*, and design the `observation` table's `observedAt` indexing with the derivation engine's time-range queries in mind now (cheap to include, expensive to retrofit). The two deliverables share a substrate; sequence storage-first, derivation-second, but design them together. See `derivation-engine-prd-scope-2026-07-06.md`.

### 2. The gappy time series is a schema-and-derivation requirement, not just an analytics caveat
Pillar 3's emphatic finding — Weedmaps misses days, so trend logic must tolerate missing days or it manufactures false signals — has a **storage implication the plan doesn't state**: the derivation runner must be able to distinguish "no observation that day" from "observed, unchanged." That is a property of how observations are keyed and queried.
→ **Reconciliation:** ensure the `observation` schema makes per-store, per-day presence explicitly queryable (it does, via `(product_key, observedAt)`), and write the gap-tolerance rule into the derivation runner's contract, not just the analytics layer.

### 3. Two data-completeness threads feed the DB and deserve a checkpoint before "one machine owns all raw data" (Phase 2)
The synthesis flags two loose threads that directly affect what lands in `products.db`:
- **`caravan-cannabis-burlington`** — likely a *silent extraction failure*, not an empty menu. If it is, moving Dutchie/Weedmaps fully local (Phase 2) without fixing it bakes a silent hole into the raw asset.
- **Weedmaps residential runner not yet proven at full nightly volume** (datacenter IPs 406-walled). Phase 2 makes the home machine the *sole* owner of raw data — so runner reliability becomes single-point-of-failure for accrual.
→ **Reconciliation:** add a pre-Phase-2 checkpoint — confirm the residential runner fires reliably at full volume and resolve the caravan silent-failure — before retiring the Actions cron that currently provides a redundant path.

---

## Net recommendation

1. **Execute ADR-077 as written** — it needs no re-planning. Phase 0 (mtime-cache) and Phase 1 "remove the wall" before ~Jul 23 are the deadline-critical steps.
2. **Fold the three reconciliation notes above into the plan doc** (they are additive — one schema-design note, one runner-contract note, one Phase-2 checkpoint).
3. **Sequence:** storage Phase 0 + Phase 1 first (hard deadline), then the derivation engine on top of the new substrate. They are coupled; storage is the foundation.
4. **Route:** the plan already names it — `bmad-create-story` for the Phase 1 multi-part story, then `bmad-dev-story`. Winston (architect) owns the schema call; the coupling note (#1) is the one thing worth his eyes before the schema freezes.

**Bottom line:** the running clock already has a good plan. The synthesis's contribution is to show that this plan is also *step one of the value program* — the derivation engine is waiting on the substrate it builds.
