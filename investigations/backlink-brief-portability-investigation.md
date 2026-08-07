# Investigation: Will `docs/backlink-tooling-brief.md` work when handed to a fresh Claude instance?

## Hand-off Brief

1. **What happened.** Erik needs to hand `docs/backlink-tooling-brief.md` to a *separate* Claude instance and must know it won't break out-of-context; every one of the brief's ~15 pointers was verified against the repo and **all resolve** (Confirmed).
2. **Where the case stands.** Concluded. The brief is portable for its intended use — a fresh Claude running *inside this repo*. The only non-repo dependency (2 auto-memory pointers in §8) is non-load-bearing and its content is already summarized inline, so the brief degrades gracefully rather than breaking.
3. **What's needed next.** Optional one-line hardening (give `crawlerLogger.ts` its `server/middleware/` path; mark the two Memory pointers as repo-external). No blocker.

## Case Info

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Ticket           | N/A                                                                        |
| Date opened      | 2026-08-01                                                                 |
| Status           | Concluded                                                                  |
| System           | Windows 11 / repo `C:\Users\erikc\Dev\Happy` (git master)                  |
| Evidence sources | The brief itself; repo filesystem; `server/index.ts` route wiring          |

## Problem Statement

Erik: *"I need to know this will not break when handed to a Claude that is not you. A new instance is going to use this as we NEED it to. Is this going to work outside the context of this folder."*

Interpreted: is `docs/backlink-tooling-brief.md` self-contained and accurate enough that a fresh Claude instance (no memory of this session) can act on it correctly — and what, specifically, is the seam where "outside the context of this folder" could bite?

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| The brief | Available | `docs/backlink-tooling-brief.md`, 108 lines, read in full |
| Referenced root docs | Available | `GMAS_LIST_BRIEF.md`, `STRATEGY.md`, `ADR.md` all present |
| Referenced docs/ | Available | `seo-ai-crawler-visibility-plan.md`, `seo-indexing-diagnostic-protocol.md` present |
| Referenced investigation | Available | `investigations/phase0-citation-monitor-0of8-investigation.md` present |
| Referenced code | Available | `server/scripts/citationMonitor.ts`, `server/middleware/crawlerLogger.ts`, `server/package.json` present |
| SSR routes claimed | Available | `server/routes/compareRoute.ts` + `storeRoute.ts` present; `/sitemap.xml` served dynamically by `sitemapRoute.ts` (`server/index.ts:106`) — no static file, as expected |
| Derived JSON claimed | Available | `server/data/derived/*.json` present incl. `price-vs-own-median.json`, `regional-price-floor.json`, `disparities.json` |
| Memory pointers (§8) | Partial | `project_reach-launch-plan.md` + `project_gsc-crawl-not-content.md` exist in `~/.claude/.../memory/` — **outside the repo**; only present on Erik's machine/session, not in a cloned checkout |

## Confirmed Findings

### Finding 1: Every in-repo pointer in the brief resolves
**Evidence:** Filesystem checks of all paths in §4–§8; route wiring at `server/index.ts:14,106`; `server/routes/compareRoute.ts`, `server/routes/storeRoute.ts`, `server/routes/sitemapRoute.ts`.
**Detail:** No dangling reference to a repo file. The brief's factual claims ("served on SSR `/compare/*` and `/store/*`", "sitemap.xml 40 URLs", "citation monitor exists — reuse it") are accurate against the current tree. A fresh instance following the brief inside the repo hits no dead links.

### Finding 2: The only non-repo dependency is two auto-memory pointers, and it is non-load-bearing
**Evidence:** `docs/backlink-tooling-brief.md:101-102` cite `Memory project_reach-launch-plan` and `Memory project_gsc-crawl-not-content`; these files live in `C:\Users\erikc\.claude\projects\C--Users-erikc-Dev-Happy\memory\`, not in the repo.
**Detail:** They appear under §8 "authoritative, **if deeper context is needed**" — explicitly supplementary. Their load-bearing content (reach is the binding constraint; backlinks are the durable crawl-budget lever; ~0 backlinks; 0/8 citation baseline) is already stated inline in §1 and §5. A fresh instance that cannot see auto-memory loses nothing required.

## Deduced Conclusions

### Deduction 1: "Outside the context of this folder" has two meanings; the brief is built for the one that matters
**Based on:** Findings 1–2 + the brief's own stated purpose (line 3).
**Reasoning:** (a) *Fresh Claude running inside a checkout of this repo, no session/conversation memory* — every relative path and route claim resolves (Finding 1); the two external memory pointers degrade gracefully (Finding 2). (b) *Claude given only the brief file, no repo access at all* — every §8 pointer and embedded path breaks, but the brief never claims to work detached: it says "respect the repo's engineering norms," cites relative paths, and is a repo-resident hand-off.
**Conclusion:** For the realistic hand-off (a new instance working in the repo), the brief works. It is not a standalone document divorced from the codebase, and doesn't claim to be.

### Deduction 2: The brief self-defends against staleness
**Based on:** §3/§5 point-in-time numbers + §8 diagnostic-protocol pointer.
**Reasoning:** The hard facts (~18 users, ~0 backlinks, 0/8) are dated 2026-08-01 and the brief instructs the instance to confirm against live instruments (GSC, citation monitor) before acting — the same "audit metric is a hypothesis, not a verdict" rule from the diagnostic protocol.
**Conclusion:** A fresh instance reading this weeks later is told the numbers are point-in-time and how to re-verify, so stale figures won't silently mislead it.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Whether the target instance runs on Erik's machine vs. a bare clone | Determines if the 2 memory pointers resolve; if a bare clone, they are dead (but non-load-bearing) | Ask Erik where the new instance runs |

## Conclusion

**Confidence:** High

**Confirmed:** The brief is internally accurate and portable for its intended use — a fresh Claude instance working inside this repo without this conversation's context. All ~15 file/route/data references resolve; all factual claims match the tree.

**The one real seam:** the two auto-memory pointers in §8 live outside the repo. They are marked optional and their content is duplicated inline, so they *degrade* the brief (a slightly thinner appendix) rather than *break* it. If the new instance runs on a bare clone with no auto-memory, nothing required is lost.

**What would break it:** handing the `.md` file alone to a Claude with **no repo access**. The brief is a repo-resident hand-off, not a free-standing document, and does not claim otherwise.

## Recommended Next Steps

### Fix direction (optional, ~2 min — none are blockers)
1. §8: annotate the two `Memory …` bullets as "auto-memory, present only in Erik's session; content summarized in §1/§5" so a bare-clone instance doesn't hunt for files it can't reach.
2. §5 line 66: give `crawlerLogger.ts` its real path `server/middleware/crawlerLogger.ts` (currently pathless; a fresh instance must grep). Same optional treatment for the citation monitor path is already correct (`server/scripts/citationMonitor.ts`).
3. Optional: add a one-line preamble — "Use inside a checkout of the gmaslist repo; paths are repo-relative" — to kill the detached-file misread.

### Diagnostic
Confirm with Erik whether the new instance runs in this repo (on his machine or a clone). If in-repo: ship as-is. If detached: the brief needs its referenced facts inlined, which is a larger rewrite — not recommended over just giving it repo access.

## Side Findings
- `/sitemap.xml` is generated by `sitemapRoute.ts` from the same derived source `/compare` indexes from (`server/index.ts:106`, `sitemapRoute.ts:16-17`) — there is intentionally **no** static `sitemap.xml` file. A future instance searching for a static file will (correctly) not find one; the brief's "sitemap.xml (40 URLs)" phrasing could be misread as a static asset. Minor.

## Follow-up: 2026-08-01

### New Evidence
Erik confirmed the operative case is the **detached** one: *"A Claude given only the .md file outside this repo."* No repo access at all — exactly the branch Deduction 1(b) flagged as breaking. The question is no longer "is it portable in-repo" (settled: yes) but "does the brief stand alone as its only artifact, with zero repo access."

### Additional Findings

**Finding 3: The conceptual core survives detachment; the repo-coupled instructions do not.**
- **Survives fully (self-contained inline prose):** §1 the why, §2 the rival-not-distribution rule (the crown jewel, entirely inline), §3 the hard rails, §4 the asset-model *concept*, §5 the baseline numbers, §6 the safe/dangerous scope line. A detached Claude reading these gets the complete mental model and every guardrail — ~85% of the document's value, and it transfers cleanly.
- **Breaks when detached (3 classes):**
  1. **"Go read this file" pointers** — all of §8, plus inline cites (`GMAS_LIST_BRIEF.md`, `STRATEGY.md`, the two Memory pointers). A detached Claude cannot open them; risk is it **hallucinates their contents** or stalls.
  2. **"Check the repo before building" instructions** — §5 "reuse it, don't rebuild it", §7.2 "check whether the capability already exists ... extend rather than duplicate." A detached Claude cannot inspect `citationMonitor.ts`/`crawlerLogger.ts`, so "check" is impossible; it must instead **treat these as given facts** ("these already exist — do not propose rebuilding them").
  3. **"Pull a live fact / integrate with the code" actions** — §4 "served on SSR /compare/*", §7.3 engineering norms (`server/package.json`, `ADR.md`). A detached Claude can neither read a real derived number nor write code into a tree it can't see.

**Finding 4: The unresolved fork is the *deliverable*, not the brief.** A detached Claude cannot build-and-run a measuring tool (needs repo/GSC/API access). Its realistic output is a **design/plan/spec** (or code Erik pastes back), not a live tool. The brief never states which — §7.1 says "confirm which tool," which presumes repo access. This ambiguity, not any missing fact, is the real portability risk.

### Updated Conclusion
**Confidence: High.** As-is, the brief is **~85% detached-safe**: the mental model and all rails transfer, but three classes of repo-coupled instruction (read-a-file, check-the-repo, integrate-code) will make a detached Claude hallucinate file contents, propose rebuilding things that already exist, or attempt integration it can't do. Fix = a **detached-safe rewrite**: add a "you have no repo access; this doc is the complete source of truth; do not try to open referenced paths; if you think you need one, STOP and ask" preamble; convert §8 + inline cites to provenance-only; reframe §5/§7.2 "check" into "these exist as givens — don't rebuild"; and state the intended deliverable explicitly. Blocked on one decision: **what should the detached Claude produce** (design/plan vs. code-to-paste), which shapes the preamble.

### Backlog Changes
- DONE: confirm the detached Claude's intended output → Erik chose **orient-only** ("just orient it, no build yet"; the brief is pure context transfer, waits for Erik to name the first tool).
- DONE: produced the detached-safe version of the brief.

### Resolution (2026-08-01)
Applied 4 edits to `docs/backlink-tooling-brief.md` to make it detached-safe for the orient-only use:
1. Rewrote the purpose block + added a **"⚠️ You do not have the repo"** callout at the top: this doc is the complete source of truth; all paths/filenames/`Memory …` refs are provenance-only and must not be opened; if it thinks it needs a referenced file's contents it must STOP and ask, never guess/reconstruct; do not build — orient and wait for Erik to name the tool.
2. §5 citation-monitor line reframed from "reuse it, don't rebuild it" (implies repo inspection) to "already exists — treat as a built given; extend, not rebuild."
3. §7 rewritten: item 1 = orient-don't-build; item 2 = the existing capabilities are **givens, not things to check in the repo** (kills the "propose rebuilding the citation monitor" failure mode); item 3 = repo norms apply *when a design is named, confirmed in-repo at build time*.
4. §8 heading changed to **"Where these facts came from (provenance — you cannot open these)"** with an explicit "you have no access; STOP and ask if you think you need one" intro.

**Status: Concluded.** The three detachment failure modes (hallucinate file contents / propose rebuilding existing capabilities / attempt repo integration) are each now directly guarded in the document text. The brief is detached-safe for orient-only hand-off. Not committed — working-tree only, per Erik's control of pushes.
