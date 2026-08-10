---
stepsCompleted: [1, 2, 3]
inputDocuments: []
session_topic: 'Phase 2 (active Reddit) — automated Reddit/RSS mention-monitoring system for gmaslist.com'
session_goals: 'Decide what to monitor (subreddits, keywords), what counts as an actionable mention/opportunity, and how it composes with existing unlinked-mention-finder + opportunity-finder tools; reuse the local-only Node/TS Scheduled-Task pattern (aiCitationRun.ts, ADR-106)'
selected_approach: 'ai-recommended'
techniques_used: ['Role Playing', 'Morphological Analysis', 'Failure Analysis']
ideas_generated: 4
technique_execution_complete: true
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Erikc
**Date:** 2026-08-09

## Session Overview

**Topic:** Phase 2 (active Reddit) — an automated Reddit/RSS mention-monitoring system for gmaslist.com

**Goals:**
- Decide *what* to monitor: which subreddits, which keywords/queries
- Define *what counts* as an actionable mention or opportunity (the classification / triage rule)
- Determine *how it composes* with the existing `unlinked-mention-finder` and `opportunity-finder` tools
- Constraint: reuse the local-only Node/TS Scheduled-Task pattern (`aiCitationRun.ts`, ADR-106) — private JSONL state under `~/GmaS-data/`, nothing outward-facing

### Context Guidance

Reach is the current binding constraint (STRATEGY.md). This is Phase 2 of the confirmed reach launch plan. Directories/aggregators are rivals, not distribution — only "you're the source, not a listing" channels are viable. Reddit qualifies. Phase 0 (AI-citation monitor) is the architectural precedent: local-only, weekly Scheduled Task, Haiku + web_search, ~$1/mo, appends JSONL.

### Session Setup

_Session parameters confirmed from invocation args. Proceeding to technique selection._

## Technique 1 — Role Playing (personas → what to monitor + what counts as actionable)

**Sources — the WA cannabis sub-graph (geo-ranked):**
- Tier A (answer with data): r/everett, r/WAents (when thread names North Sound), local Bellingham/Skagit subs
- Tier B (monitor, act rarely — brand mentions / price gripes only): r/seaents, r/seattleweedtalk, r/SeattleWA
- Tier C (noise, mostly out-of-geography): r/Seattle, r/AskSeattle, r/Washington broad
- Decision: **North-Sound-first, don't cast wide.** A match requires topic-filter AND geo-filter (Snohomish/Whatcom/Skagit/Everett/Bellingham/Marysville/Mt Vernon/Ferndale tokens).

**Output posture — DECIDED:**
- v1 = **notifier only** (JSONL alert + optional toast; Erik replies by hand)
- v2 = **draft-assist** (tool drafts reply w/ link + spread number; human edits before posting)
- **Never auto-post** (Reddit anti-self-promo → shadowban risk). Same posture as Phase-0 citation monitor.

**The 6 actionable intents → routed to 3 tools/facts:**

| # | Intent | Persona | Routes to |
|---|---|---|---|
| 1 | "where's it cheapest near me" | Deal Hunter | opportunity-finder → regional-floor / cheapest fact |
| 2 | "anyone tried [brand]?" (unlinked) | Name-Dropper | unlinked-mention-finder |
| 3 | "prices are insane" | Price Griper | opportunity-finder → price-spread fact |
| 4 | "worth the drive to save $X?" ⭐ FLAGSHIP | Drive Calculator | cheapest-**delivered** fact (ADR-085, gas/MPG-netted) |
| 5 | "is this deal still live?" | Stale-screenshot | freshness-gated status (ADR-111) |
| 6 | "which store carries [brand] cheapest" | Brand shopper | brand→store matrix (Epic 1) |

**Flagship = trip-economics (intent #4).** Gas-adjusted cheapest-delivered is unanswerable by Weedmaps/Leafly — it's the moat surfaced as a Reddit reply.

## Technique 2 — Morphological Analysis (the machine, parameter × option)

Locked decisions:

| Parameter | Decision | Fallback / notes |
|---|---|---|
| **1. Source** | RSS/`.json` on subreddit+search URLs (no auth) | OAuth API (`oauth.reddit.com`, `fetch`, no PRAW) as fallback if rate-limited. Polite User-Agent + low cadence. Never n8n/Zapier (breaks local-only). |
| **2. Classifier** | Hybrid: cheap regex+geo pre-filter → Haiku classifies survivors | Reuses WA-allowlist/geo tokens. Haiku emits intent(1–6) + geo-confidence + matched store/brand + routed tool. ~$1/mo. |
| **3. Confidence** | Haiku emits a score; **alert threshold 0.7** (tunable) | binary later if needed |
| **4. Cadence** | **Daily** Scheduled Task (~06:00) | twice-daily if good threads age out; NOT weekly (threads die in 24–48h). New task ≠ weekly citation task; registering needs Erik's explicit go-ahead. |
| **5. State/dedup** | `~/GmaS-data/reddit-seen.json` (`t3_` IDs) + `~/GmaS-data/reddit-mentions.jsonl` (alert rows) | **Expire seen IDs > 360 days.** `--dry` MUST use isolated `REDDIT_LOG_PATH` (citation-monitor dry-run regression). Private state, NOT git-committed. |
| **6. Composition** | **Model 2 — fact-gate every alert at capture** via existing `selectFact` | No gated+fresh fact → no alert. Enforced "you're the source" invariant. Load via `loadPackagerSources` (NOT buildRegions+status map — stale-overlay gotcha). |

**Row shape:** `{ ts, subreddit, postId, url, title, intent, confidence, geoTokens[], matchedStore/brand, routedTool, suggestedFact }` — the row *is* the notifier payload (and the v2 draft-reply seed).

## Technique 3 — Failure Analysis (pre-mortem on the locked machine)

Frame: "It's Feb 2027; the monitor ran daily for 6 months and failed." Each failure vector worked backwards into a guardrail baked into the v1 spec. Participation posture confirmed: **mostly lurk-and-answer, links rare** — this reprioritized the vectors.

**4 failure vectors → 4 guardrails:**

| # | Failure vector | Story | Guardrail (DECIDED) |
|---|---|---|---|
| 1 | **Shadowban death-spiral** | Tool works too well → link-per-reply pattern → mod/automod shadowban → channel burned | **Downgraded to minor** by lurk-and-answer posture (naturally ~9:1). Light: per-subreddit link counter, nudge only if links-per-week > 1. No hard throttle. |
| 2 | **Wrong-fact reply** ⭐ now #1 | Alert hands a *stale* trip-economics price; posted confidently with fake precision; a local calls it out → **discredited** (worse than banned — we claimed to be the source) | **Every alert row embeds the fact's `as-of` timestamp + source-freshness status; notifier renders the age on open** so staleness is impossible to miss at reply-time (closes the 06:00-capture → evening-reply gap that a daily-freshness gate/ADR-111 leaves open). No hard same-day refusal — judgment stays with Erik. Adds `factAsOf` / `factFreshness` to the row shape. |
| 3 | **Alert fatigue (quiet death)** | Loose geo → 5-of-6 junk rows → skim → stop opening the file → the one flagship thread scrolls past. Default fate of any solo-founder alerting system. Bias hard toward **precision** (a missed thread is unmeasurable; a false alert costs the scarcest resource — attention) | **Both:** (3a) precision gate — a *hard* North-Sound token (specific city/store, never bare "WA") AND an in-inventory store/brand match required *before* Haiku runs; (3b) self-audit line — each run logs its own precision (`alerts fired / acted-on`) so drift is visible, not silent. |
| 4 | **Null result (worked perfectly, still failed)** | Flawless machine, ~20 correct helpful replies, and nothing moved — reach never materialized; effort-per-visitor never justified a daily task. The one failure the local optima can't see. | **Pre-committed kill-switch (before any code):** run daily **8 weeks**; **win = measurable referral clicks from reddit.com (GA4)**; miss → downgrade to weekly or kill. Mirrors the price-index ≥2/8 discipline; 3b supplies the numbers. |

**Updated row shape (v1):** `{ ts, subreddit, postId, url, title, intent, confidence, geoTokens[], matchedStore/brand, routedTool, suggestedFact, factAsOf, factFreshness }`

## Session Synthesis

**What the three techniques produced — a build-ready v1 contract:**

- **What to monitor (T1):** North-Sound-first sub-graph (Tier A r/everett, r/WAents-when-North-Sound, local Bellingham/Skagit subs); a match needs topic AND geo token. Notifier-only v1, never auto-post. 6 actionable intents routed to 3 existing tools/facts; **flagship = intent #4 trip-economics** (gas-adjusted cheapest-delivered, the moat as a Reddit reply).
- **The machine (T2):** RSS/`.json` source (OAuth fallback) → hybrid regex+geo pre-filter → Haiku classifier (intent + geo-confidence + routed tool), alert threshold 0.7, **daily** Scheduled Task ~06:00, JSONL state under `~/GmaS-data/` (isolated `REDDIT_LOG_PATH` for `--dry`), **Model-2 fact-gate every alert at capture** via `selectFact` (load via `loadPackagerSources`, not buildRegions+status map).
- **The guardrails (T3):** freshness-stamped rows, precision-biased gate + self-audit, link-cadence nudge, and an 8-week referral-clicks kill-switch.

**Priority ranking of the guardrails:** (2) freshness stamp and (3) precision gate are load-bearing for v1 — without them the tool actively harms or gets abandoned. (4) kill-switch is a pre-build commitment, not code. (1) link counter is nice-to-have.

**Open items carried forward:**
- Registering the new daily Scheduled Task needs Erik's explicit per-action go-ahead (standing rule).
- v2 (draft-assist) explicitly deferred; the row shape already seeds it.
- Exact `as-of` staleness threshold that reads as "verify before quoting" — tune during build.

### Recommended next step

This is a local-only Node/TS tool in the exact mold of the Epic-backlink-1 tools (ADR-106 precedent) — it does **not** need a PRD/architecture cycle. Next is a build: **[QQ] `bmad-quick-dev`** or a **[DS] dev-story**, run in a fresh context window, using this session as the spec. New ADR on merge; kill-switch clock starts at first daily run.


