# Handoff Decision: SEO & AI Crawler Visibility Spec

**Date:** 2026-06-24
**Question asked:** Can the SEO/crawler spec be handed over whole, or must it be broken into epics and stories first?
**Method:** BMad party-mode roundtable (John/PM, Amelia/Dev, Winston/Architect) + direct code trace of the coupling question.
**Related files:** `SPEC.md`, `phases.md`, `../../docs/seo-ai-crawler-visibility-plan.md`

---

## TL;DR

**Do NOT hand it over whole. Break it up.** All three agents converged: the spec is already
near-backlog-shaped, but it must be split at exactly one non-negotiable seam — **Phase 0a vs. 0b** —
because 0b carries a hard external dependency (legal review of WAC 314-55-155) that 0a does not.
Handing it whole would weld a legal blocker onto the change that delivers ~90% of the value, making
the legal review your critical path.

**Code trace confirms the seam is real and clean:** Phase 0a does NOT touch the age gate. It ships
independent of legal sign-off.

**Next step (NOT yet run — Erik wants to talk first):** `bmad-create-epics-and-stories` on the seams below.

---

## Agent verdicts (party-mode, 2026-06-24)

### 📋 John (PM) — "Break it up, but barely. The split is about *who decides*."
The phases already do the work a decomposition pass would. Only one reason not to hand it whole:
Phase 0b needs legal sign-off that is **not an engineering decision**. A whole-handoff lets a dev
workflow walk into 0b and either stall or *guess* a compliance interpretation — on a WA cannabis
site. Fence off anything gated on an outside ruling. Proposed carve:
- **Epic A** — Make the site indexable (0a + 1 + 1a). The ~90%. Pure engineering, hand whole.
- **Epic B** — Age-gate content exposure (0b). **BLOCKED** on legal; don't create stories yet. *(Since unblocked — ADR-066, 2026-06-30.)*
- **Epic C** — Measure (Phase 6). Pull forward right behind A so you can see if A worked.
- **Epic D** — Long tail (2, 3, 4, 5). Low priority. Phase 5 is outside the repo.

Open question he raised → answered by the code trace below.

### 💻 Amelia (Dev) — "~6 dev stories + 1 legal-blocked + 2 non-code tasks."
- **0a** — one story. `server/index.ts`. AC: `GET /` returns `Content-Length > 50KB` w/ snapshot JSON in HTML. Ship first.
- **0b** — hard gate, do NOT bundle. Status `blocked: legal`. Bundling = shipping indexable cannabis content behind an unreviewed gate. *(Since unblocked — ADR-066, 2026-06-30.)*
- **Phase 1** — split: `1-static` (robots/sitemap/meta/OG/JSON-LD in `client/public` + `client/index.html`, no 0a dep) and `1a-routes` (`/store/<slug>` in `server/index.ts`, depends on 0a).
- **Phase 2** — one story (`server/routes/ingestRoute.ts` → `data/data.json`). **Thin AC:** field names/schema shape not specified. Pin exact keys before dev.
- **Phase 3** — folds into `1-static` (same `robots.txt`). Merge.
- **Phase 4** — one-line story, low pri.
- **Phase 5** — out of repo, not a dev story. Drop from workflow.
- **Phase 6** — ops/config checklist, not a dev story.
- **Guard rail:** 0a needs a CI test asserting snapshot freshness vs `data.json` (ADR-043 style: CI, not runtime).
- **Dependency spine:** `0a → (1a-routes, 2)`; `1-static` parallel; `0b` parked on legal.

### 🏗️ Winston (Architect) — "Coupling of *purpose* is not coupling of *risk*."
0a and 0b share a goal ("crawler sees real content") but are different risk classes. 0a is pure
engineering, controllable, testable, ships on your timeline. 0b's downside is **regulatory, not a
failed test**. Weld them together and the fast/safe work sits hostage behind the slow/external gate.
Recommended (lean — don't over-shard a solo founder):
- **Epic 1: Crawler Content Delivery** — Story 1 = 0a (ships alone); Story 2 = 0b (blocked pending legal, tracked as a precondition not a code task).
- **Epic 2: Discoverability** — Phase 1 + 1a, depends on 0a landing first.
- **Epic 3: Enrichment & Measurement** — Phases 2–6, lower priority.
- **ADR discipline:** log an ADR — *"0a/0b split: shared goal, divergent risk class; 0a ships independent of legal gate."* Gives 0b a paper trail for when legal asks how 314-55-155 was handled.

---

## Code trace: does Phase 0a touch the age gate? (answers John's open question)

**Verdict: NO. 0a and 0b are cleanly separable — different files, layers, and execution phases.**

| | Phase 0a target | Phase 0b target |
|---|---|---|
| File | `server/index.ts:44-46` (SPA fallback) | `client/src/components/AgeGate.tsx` |
| Layer | Express, *before* React boots | React component, *after* boot |
| Blocks | Non-JS crawlers (CAP-1) | JS crawlers / Googlebot (CAP-2) |

**Mechanism that guarantees separation:** `client/src/main.tsx:6` mounts with
`createRoot(...).render()`, **not** `hydrateRoot`. `createRoot` *discards* whatever is inside `#root`
and renders fresh. Therefore server-injected content survives only for clients that never execute React:

- **Non-JS crawler (GPTBot/PerplexityBot):** never runs React → sees injected deal HTML. ✅ 0a's entire job (CAP-1).
- **Human / Googlebot:** runs React → `createRoot` wipes `#root` → `AgeGate` mounts and gates exactly as today
  (`App.tsx:17` wraps the whole app; `AgeGate.tsx:37` renders children only when `isIn`). ✅ Gate unchanged.

So **0a fully satisfies CAP-1 with zero legal dependency.** CAP-2 (Googlebot past the gate) genuinely
requires 0b + legal review. The spec's 0a/0b seam is correct; the code proves 0a ships without the lawyer.

### Two caveats to pin on the 0a story (neither blocks it)
1. **Injection target is the load-bearing AC:** inject *inside* `#root` (a crawler-only sink React wipes),
   **NOT** as human-visible markup outside it (sibling div / visible `<noscript>`). Inside `#root` = invisible
   to humans (createRoot clears it). Outside = leaks deal content past the gate to humans → drags 0a into
   0b's compliance territory. Make *"content injected inside `#root`, erased on hydration"* an explicit AC.
2. **One sub-issue for the legal pile (does NOT gate 0a):** even inside `#root`, there's a sub-second
   pre-hydration window where raw deal HTML exists in a human's DOM before `createRoot` wipes it. A much
   weaker version of the 0b question (transient flash vs. content persistently parked behind an overlay).
   One line to whoever does the 0b legal review; steady state is fully gated, so it doesn't block 0a.

---

## Synthesized epic/story breakdown (proposed — confirm before generating)

All three agents agree on the spine. Granularity differs (Winston: 3 lean epics; Amelia: ~6 stories +
1 blocked + 2 non-code; John: 4 epics). A reconcilable middle:

- **Epic 1 — Crawler Content Delivery**
  - Story 1.1: **Phase 0a** server content delivery (`server/index.ts`). AC: `Content-Length > 50KB`,
    snapshot JSON inside `#root`, CI freshness guard-rail test. *No legal dependency — ships now.*
  - Story 1.2: **Phase 0b** AgeGate mount-but-visually-gate. **Status: `blocked: legal` (WAC 314-55-155).**
    Do not enter workflow until legal answers the open question. *(Since unblocked — ADR-066, 2026-06-30,
    resolved the legal question; 1.2 is now schedulable on its engineering merits.)*
- **Epic 2 — Discoverability** (depends on 0a)
  - Story 2.1: `1-static` — robots.txt + sitemap.xml + meta/OG/Twitter + JSON-LD LocalBusiness (also absorbs Phase 3). No 0a dep; can parallel.
  - Story 2.2: `1a-routes` — stable `/store/<slug>` routes (`server/index.ts`). Depends on 0a.
- **Epic 3 — Enrichment & Measurement** (low priority)
  - Story 3.1: **Phase 2** info-gain stats at ingest. *AC needs sharpening — pin `data.json` field schema first.*
  - Story 3.2: **Phase 4** llms.txt (one-liner, optional).
  - Task 3.3: **Phase 6** measurement (GSC/Bing + log monitoring) — ops checklist, not a dev story.
- **Out of scope for the dev workflow:** **Phase 5** off-site (outside the repo; marketing/ops, flag before acting).

### Pre-generation TODOs (raised by the agents)
- [x] **Answer the legal question** for 0b (WAC 314-55-155) — ✅ resolved by **ADR-066** (2026-06-30, founder determination): WAC 314-55-155 binds licensed retailers, not unlicensed aggregators; the Phase 0b legal flag is explicitly resolved by that ADR.
- [ ] **Pin Phase 2 field schema** (`data.json` keys for info-gain stats) before that story is dev-ready.
- [x] **Log an ADR** for the 0a/0b risk-class split (Winston) — ✅ logged as **ADR-052** (2026-06-24, same day as this decision).
- [ ] Then run `bmad-create-epics-and-stories` — **per Erik, talk first before running it.**

> **Status sync 2026-07-02:** checkboxes above reconciled with `ADR.md` (ADR-052, ADR-066) after the repo-hygiene audit found them stale. With the legal gate closed, Story 1.2 (Phase 0b) is no longer `blocked: legal`.
