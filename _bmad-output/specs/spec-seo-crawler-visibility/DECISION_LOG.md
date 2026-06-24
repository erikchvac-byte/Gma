# Decision Log

## Session 2026-06-24: Spec Creation from Planning Document

**Operation:** Create (no prior spec existed).

**Source:** `docs/seo-ai-crawler-visibility-plan.md` — a pre-authored, well-structured planning document.

**Distillation method:** Express (structured input, direct lift; no elicitation needed).

### Self-Validation Verdict

**Pass 1 — Coherence (Spec Law):**
- ✅ Rule 1 (Capabilities have intent & success): All five CAP entries define clear intent and concrete success signals (Search Console indexing, crawler logs, page count).
- ✅ Rule 2 (WHAT not HOW): Capabilities describe visibility/content availability, not implementation techniques. Implementation details (injection vs. pre-render, overlay pattern, routing strategy) live in `phases.md`.
- ✅ Rule 3 (Constraints bend decisions): All four constraints rule out specific design choices (no visual rewrite, local-only scope, age-gate compliance boundary, no SQL). Each is load-bearing.
- ✅ Rule 4 (Non-goals explicit): Five non-goals listed (national SEO, product schema, SSR, per-deal URLs, off-site work). Each rules out a tempting but out-of-scope direction.
- ✅ Rule 5 (Success signal testable): "Zero pages indexed → 22+ pages indexed; crawler logs show specific bots fetching content" is concrete and measurable via Search Console and server logs.
- ✅ Rule 6 (Capability IDs stable): Five capabilities assigned CAP-1 through CAP-5; no reuse or renumbering planned.
- ✅ Rule 8 (Lean prose): Every sentence carries load-bearing content; no decoration or throat-clearing.

**Pass 2 — Preservation:**
- ✅ Core problem statement: "invisible to search engines and crawlers" + coupled problems (empty HTML, age gate blocking) → preserved in Why and Capabilities.
- ✅ Compliance context: WAC 314-55-155 local-only framing → preserved in Constraints and framing note.
- ✅ Phase structure and deployment order: Lifted into `phases.md` companion with same detail level as source.
- ✅ Legal review blocker: Prominent in Constraints and Phase 0b, marked as assumption/open question.
- ✅ Non-JS vs. JS crawler distinction: Captured in CAP-1 and CAP-2.
- ✅ Schema recommendation (LocalBusiness not product): In CAP-4 and Phase 1.
- ✅ Measurement approach: Phase 6 details in `phases.md` and Success Signal.

**Wrapper-only content:** None. Every load-bearing claim in the source landed in the spec or companion.

### Decisions Made

1. **Training crawler policy (GPTBot, ClaudeBot, Google-Extended).** Decision: **Allow all crawlers** to maximize visibility and crawler coverage. No impact on visits or compliance. Phase 3 robots.txt will permit these crawlers.

2. **Phase 0b legal review gate.** Decision: **Flag for legal review** before implementation; proceed with Phases 0a/1/1a in parallel. The exact legal boundary — whether content can exist in markup while visually blocked under WAC 314-55-155 — requires counsel confirmation, but precedent exists (Weedmaps, Leafly). Not a blocker for visibility phases.

### Assumptions

One assumption recorded in the spec:

- **Server logs and Google Search Console are sufficient for validation.** No assumption of custom analytics framework. Status: sound; both tools are already available.

### Open Questions

One question remains:

- **WAC 314-55-155 compliance for AgeGate mounting (Phase 0b).** Requires legal/counsel review before implementation. Does not block Phases 0a/1/1a/2/3/4.

### Validation Outcome

**Status: Ready for downstream consumption.** SPEC.md kernel and `phases.md` companion provide a complete contract for implementation (bmad-quick-dev, bmad-dev-story, or equivalent). No structural gaps; legal review and one user decision (training-crawler policy) are recorded as blockers, not omissions in the spec itself.

The spec correctly trades off breadth (six phases, each with implementation options) against conciseness (five capabilities, four constraints, one success signal). Downstream work can run Phases 0a/1/1a/2/3/4 in any order after legal clears Phase 0b, or omit lower-priority phases (4, 5) without breaking the contract.

---

**Spec folder:** `_bmad-output/specs/spec-seo-crawler-visibility/`  
**Created:** 2026-06-24  
**Next action (recommended):** Legal review on Phase 0b (AgeGate mounting + WAC compliance); then begin Phase 0a (server-side content injection) in parallel.
