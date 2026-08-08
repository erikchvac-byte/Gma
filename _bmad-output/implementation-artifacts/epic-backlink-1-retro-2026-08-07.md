# Retrospective — Epic `backlink-1`: Backlink Measure-and-Surface Toolkit

**Date:** 2026-08-07
**Facilitator:** Dev (AI)
**Participant:** Erik (solo founder / sole stakeholder / operator)
**Type:** First retrospective for this epic. No previous retro to follow up on; no next epic (`epic-backlink-2`) planned.

## Epic summary

Four local-only tools that **measure and surface** reach/backlink opportunities — no automated placement, a human does every act of outreach. Delivered in confirmed extend-first / cost order. Each story was independently valuable and depended only on prior stories.

| Story | Tool | FRs | ADR | PR | Tests added |
|-------|------|-----|-----|----|-------------|
| 1.1 | Citation-share tracker | FR-1..3 | ADR-113 | #125 | +28 |
| 1.2 | Citation-ready fact packager | FR-4..6 | ADR-114 | #126 | +19 |
| 1.3 | Opportunity finder | FR-7..9 | ADR-115 | #127 | +22 |
| 1.4 | Unlinked-mention finder | FR-10..12 | ADR-116 | #128 | +22 |

- **Scope covered:** all 12 FRs + cross-cutting NFR-1..4 and AR-1..8.
- **Quality:** server suite grew to **954/954 green**; real `npm run build` clean before every push. All four merged to master.
- **Status caveat:** all four sit at `review`. Independent code-review (different LLM) was deliberately deferred, so none are `done`. Epic remains `in-progress` until they flip.
- **Cost:** within the free-tier stack (~$1/mo citation monitor). No paid backlink/search API in v1 (NFR-4 held).

## What went well

1. **Extend-first ordering compounded.** Each tool reused the prior's tested primitives rather than standing up a silo: `searchEngines.ts`, `factPackager.selectFact`, `isRivalOrOutChannel` / `suggestChannel`, `looseJsonArray`. Later stories were cheap because earlier stories left behind shared, proven parts.
2. **The honesty gate was inherited, not re-litigated.** The anti-fabrication posture from the derivation engine (low-side-only; never emit a parse-artifact value such as an implausible "$84 Donny Burger") flowed into the packager and finder for free — no new honesty surface to audit.
3. **The private-output decision was made once and held.** ADR-113 consciously overrode the planning artifacts' AR-1/AR-3 ("write to `server/data/derived` + register in `$derivedFiles`"): tool output is private measurement state under `~/GmaS-data/` (env-overridable), off-git, not served. Applied consistently across all four; nothing leaked into the repo or the deployed server.
4. **Zero-marginal-cost held.** 1.1/1.2 add no engine calls at all; 1.3/1.4 reuse the existing `web_search` path.
5. **Behavior-preserving extraction with a regression guard** became the house pattern for sharing code between the *live* scheduled monitor and a *new* on-demand tool — one source of truth, proven unregressed each time (monitor `--dry` stayed clean).
6. **Isolation discipline improved mid-epic.** The 1.3 dry-run-pollution lesson was applied in 1.4: regression/smoke runs were pointed at isolated `MENTIONS_DIR` / `CITATION_LOG_PATH` so the real `~/GmaS-data` was untouched.

## What was hard / friction

1. **The `@'...'@` commit-message bug.** In the Bash tool, PowerShell here-string syntax made the 1.4 commit title literally `@`, landing as "@ (#128)" on master — required an authorized force-push to correct.
2. **The seed-refresh cron races master constantly** (~hourly), which rejected the force-push twice. `--force-with-lease` did its job (the rejection was the safety net working), but rewriting history against a live automated pusher was fiddly.
3. **The 1.3 dry-run pollution footgun.** A `--dry` regression run appended real rows to `~/GmaS-data/citation-log.jsonl` (the monitor always appends), and the no-delete-under-`GmaS-data` rule then blocked cleanup. Caught after the fact; 8 stray rows remain (Erik's call 2026-08-07: leave them — harmless, the tracker's dated-datapoint idempotency tolerates them).
4. **Planning encoded the wrong default.** The PRD/epics AR-1/AR-3 said "commit + serve + register" — the opposite of the right answer (private off-git state). Caught at 1.1 dev-start and flagged, but the artifacts still carried the wrong cross-cutting default for all four stories.

## Lessons (carry forward)

- In the Bash tool, never use `@'...'@` for a commit message — that is PowerShell here-string syntax, not bash. Use a real heredoc or `git commit -F <file>`. *(saved to memory)*
- Any tool that appends to a shared `~/GmaS-data` log MUST be pointed at an isolated path during regression/smoke runs; the no-delete rule makes pollution permanent. *(saved to memory)*
- When a PRD's cross-cutting AR conflicts with an established runtime pattern (e.g. private measurement state), catch it at story-1 dev-start and correct the default before it propagates to every downstream story. ADR-113 supersedes AR-1/AR-3 for these tools.
- Behavior-preserving extraction + a regression guard is the right way to share code between a live scheduled tool and a new on-demand tool.

## Readiness assessment

- **Testing & quality:** 954/954 green, real build clean. Strong. **Gap:** no independent code-review yet; all four are `review`, not `done`.
- **Deployment:** N/A by design — local-only, nothing deployed. 1.1 + 1.4 wired to the existing Mon 05:00 weekly Scheduled Task (AR-4 go-ahead granted, no Task re-registration); 1.2 + 1.3 on-demand.
- **Stakeholder acceptance:** Erik is sole stakeholder and drove every dev-start decision.
- **Outcome reality check:** these tools *measure and surface* reach — they do not move it. The 0/8 AI-citation baseline and ~0 backlinks are unchanged. The epic delivered instrumentation + a pre-vetted worklist; the human outreach that converts it is the next real-world step and is outside this epic.

## Action items

1. **Code-review (different LLM) on 1.1–1.4, then flip review → done.** Owner: Erik (triggers `/code-review`; the AI cannot launch it). Decision 2026-08-07: this is the chosen close-out path. Until then the four stay `review` and the epic stays `in-progress`.
2. **Stray dry-run rows in `~/GmaS-data/citation-log.jsonl`.** Decision 2026-08-07: **leave them** (harmless; no cleanup action).
3. *(Optional / backlog)* Consider a guard so any tool `--dry` run refuses to write to a real shared log — defense-in-depth against the 1.3 footgun. Not scheduled.
4. *(Doc hygiene)* If these tools ever inform a future PRD, note that ADR-113 supersedes AR-1/AR-3 (private output, not committed/served).

## Next steps

- No next epic. The real next move is operational: run the opportunity + unlinked-mention finders, do outreach on the worklist, and watch the citation-share tracker move against rivals.
- Run code-review to close out the four stories when ready.

---
*Retrospective conducted 2026-08-07. Party-mode multi-agent dialogue was adapted to Erik's context (solo founder, direct communicator, plain formatting) — substantive analysis retained, dramatized team theater omitted.*
