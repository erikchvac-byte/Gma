---
title: "PRD: Backlink Measure-and-Surface Tooling"
status: final
created: 2026-08-06
updated: 2026-08-06
finalized: 2026-08-06
---

# PRD: Backlink Measure-and-Surface Tooling
*Working title — confirm.*

## 0. Document Purpose

This PRD is for Erik (solo founder, builder-and-operator) and any downstream BMad workflow (`bmad-create-epics-and-stories`, `bmad-sprint-planning`, `bmad-dev-story`). It scopes **all four** backlink tools as one coherent area of work. It is built directly on the backlink brief (`backlink-tooling-brief.md`) and inherits that brief's rival-not-distribution rule and legal/honesty rails verbatim — it does not re-argue them. Vocabulary is Glossary-anchored; features are grouped with globally numbered FRs nested under them; assumptions are tagged `[ASSUMPTION]` inline and indexed in §9. Tech mechanism (which file to extend, transport, scheduling wiring) lives in the companion `addendum.md`, not here.

## 1. Vision

gmaslist.com's growth is bottlenecked by **reach**, not product, and the single durable lever that raises crawl budget sitewide — external links from real sources — is essentially absent today (~0 backlinks; 0/8 AI-citation baseline). This tooling gives the operator a repeatable way to **see** that gap and **act** on it without violating the one rule that makes gmaslist different: directories and aggregators are rivals, not distribution.

The product is four small, local-only tools that **measure and surface** — they never place links. Two measure the gap over time (how our AI-citation share moves against rivals; where we're mentioned but not linked). Two surface opportunities to close it (threads/questions a gated gmaslist fact can answer; a citation-ready package of that fact with its honesty caveat baked in). The human — Erik — does every act of outreach. The tools' job is to make an honest computed fact easy to cite and to track who cites it.

Success is unglamorous and operational: Erik runs these weekly, they consistently surface a short, trustworthy worklist of real link-earning moves, and citation share against rivals climbs off zero.

## 2. Target User

### 2.1 Jobs To Be Done
- **As the operator**, I want to know whether our AI-citation share vs rivals is moving, so I can tell if reach work is paying off — without manually re-reading eight engine answers.
- **As the operator**, I want a short, pre-vetted list of places I could earn a link *this week* (a thread asking a question our fact answers; a site that mentioned us without linking), so outreach is a 20-minute task, not a research project.
- **As the operator**, I want a copy-paste-ready, honest fact for a given topic/geo — caveat already attached — so I never pitch a number the engine can't vouch for.
- **As the builder**, I want these to fit the existing local-only, out-of-runtime pattern the citation monitor set, so they add no server risk or cost.

### 2.2 Non-Users (v1)
Not for end visitors of gmaslist.com, not for any external/team user, not for automated agents that post on Erik's behalf. Single-operator, local-only.

### 2.3 Key User Journeys

- **UJ-1. Erik runs the Monday reach check.**
  Erik, solo operator, opens his terminal Monday morning. The weekly Scheduled Task has already run the **citation-share tracker** and the **unlinked-mention finder**; both wrote fresh local reports. He reads a one-screen markdown summary: citation share went 0/8 → 1/8 (first citation — on which engine, which query), and two new unlinked mentions appeared. He copies the two mentions into his outreach notes. Two minutes, no browser archaeology. Realizes FR-1, FR-3, FR-10, FR-12.

- **UJ-2. Erik answers a live thread with a vetted fact.**
  Later that week Erik runs the **opportunity finder** on demand. It returns three WA threads asking "cheapest X in <metro>?" — each already paired with the specific gated fact that answers it and the suggested IN-channel. He picks one, runs the **fact packager** for that query/geo, and gets citation-ready copy with the honest caveat already in it ("below its own recent usual price, not a fake sale"). He pastes it into his own Reddit reply, reputation-first. Realizes FR-4, FR-5, FR-7, FR-9.

## 3. Glossary

- **Citation** — an AI answer engine naming/quoting gmaslist in its answer to a seed question. The AI-search analogue of a backlink (authority signal, not a classic hyperlink).
- **Citation share** — gmaslist's count of citations across the seed-question set, expressed against the rival field (e.g. "1/8; weedmaps 8/8"). Tracked over time.
- **Citation monitor** — the already-built, local-only capability (weekly Scheduled Task) that runs the seed questions through the engines and logs who was cited, including rival domains. Two engines today (the original web_search stack + Perplexity Sonar).
- **Rival domain** — a domain that competes with gmaslist for the same citation/link and must never be an outreach target: weedmaps, leafly, leafbuyer, yelp, deal aggregators, WA business directories.
- **Gated fact** — a computed price fact the derivation engine's honesty gates vouch for (e.g. same-SKU cross-store spread; real-drop-vs-own-median; regional price floor), served from derived JSON. The *only* class of number these tools may surface publicly.
- **IN-channel** — a channel where gmaslist is the source, not a listing: AI answer engines, Reddit/local community, Google organic, local news (cite-not-list). The only valid link/citation sources.
- **OUT-channel** — directories, aggregators, business listings, link farms, PBNs, comment/forum-signature spam. Never an outreach target.
- **Unlinked mention** — a public web mention of "gmaslist" / "gma's list" that does not link to gmaslist.com; a candidate to chase into a link.
- **Opportunity** — a specific public question/thread whose answer is a gated fact, paired with the fact and a suggested IN-channel.
- **Report** — the local JSON + markdown output a tool writes (never a deployed page). JSON is the machine record; markdown is the human summary.

## 4. Features

Features are ordered by the confirmed build sequence (extend-first / cost order). FRs are numbered globally so downstream artifacts have stable references.

### 4.1 Citation-Share Tracker *(extends the citation monitor)*
**Description:** Turns the citation monitor's per-run "who was cited" data into a **time series** of gmaslist's citation share against the rival field, and surfaces the trend. It does not re-run the engines or rebuild the monitor — it consumes/extends what the monitor already produces. Realizes UJ-1. `[ASSUMPTION: builds on the citation monitor's existing output; no new engine calls beyond what the monitor already makes.]`

**Functional Requirements:**

#### FR-1: Record citation share per run
The system records, for each citation-monitor run, gmaslist's citation count and each rival domain's citation count over the seed-question set, appended to a persisted time series.
**Consequences (testable):**
- Given a completed monitor run, a new dated datapoint is appended (gmaslist n/total + per-rival counts).
- Re-running for the same date updates rather than duplicates that date's datapoint.
- The series survives across runs (persisted to a local report file, not memory).

#### FR-2: Compute trend vs rivals
The operator can see how gmaslist's share changed vs the prior run and vs the rival leader.
**Consequences (testable):**
- Report shows current share, delta vs previous datapoint, and the current rival leader with its share.
- A first-ever citation (0 → ≥1) is called out explicitly (which engine, which query).

#### FR-3: Surface the trend in the weekly report
The tracker writes a human-readable markdown summary alongside the JSON series.
**Consequences (testable):**
- Markdown summary is one screen: current share, delta, rival leader, and any new-citation callout.
- Report is written on the weekly schedule and on demand.

### 4.2 Citation-Ready Fact Packager
**Description:** Given a topic/query and geo, selects the single best **gated fact** and renders it as citation-ready copy with the honest caveat baked in, shaped for the target IN-channel. It reads only from gated/derived data — it never re-scrapes or re-computes. Realizes UJ-2. `[ASSUMPTION: reads the existing derived JSON (cross-store spread / real-drop-vs-own-median / regional price floor); no new fact computation.]`

**Functional Requirements:**

#### FR-4: Select a gated fact for a query/geo
The operator supplies a topic/category and WA geo; the system returns the most relevant gated fact from derived data.
**Consequences (testable):**
- Returns a fact only if it passes the honesty gate; otherwise returns "no citable fact available" (see FR-6).
- Geo outside WA is rejected (no out-of-state facts).

#### FR-5: Render channel-shaped, caveat-baked copy
The selected fact is rendered as short copy for a named IN-channel, with its honesty caveat included inline.
**Consequences (testable):**
- Output includes the number, its plain-English caveat (e.g. "below its own recent usual price, not a fake sale"), and a source reference to the live gmaslist page.
- Copy contains no health/potency claim, no discount-hype ("SLASHED"), and never implies gmaslist sells product.

#### FR-6: Refuse when no gated fact vouches
If no honesty-gated fact answers the query, the packager withholds rather than inventing or loosely computing one.
**Consequences (testable):**
- With no qualifying fact, output is an explicit "nothing citable" result, never a fabricated or ungated number.
- A parse-artifact-flagged value (e.g. an implausible "$84 Donny Burger") is never emitted.

### 4.3 Opportunity Finder
**Description:** Searches IN-channels for public questions/threads whose answer is a gated gmaslist fact, filters to WA + IN-channels (excluding all OUT-channels and rivals), and outputs a ranked candidate list — each paired with the matching fact and a suggested channel. Surfaces only; the human does the posting. Realizes UJ-2. `[ASSUMPTION: uses the existing Haiku + web_search stack; no paid search API, no Reddit write access.]`

**Functional Requirements:**

#### FR-7: Find answerable public questions
The system finds recent public questions/threads (Reddit, local community, journalist queries) that a gated fact could answer.
**Consequences (testable):**
- Each candidate is a real, dated, linkable public item.
- Each candidate is paired with the specific gated fact that answers it (or is discarded if none does).

#### FR-8: Constrain to WA + IN-channels
Candidates are filtered to WA relevance and IN-channels; OUT-channels and rival domains are excluded.
**Consequences (testable):**
- No candidate resolves to an OUT-channel or a rival domain.
- Out-of-WA candidates are dropped.

#### FR-9: Output a ranked worklist
The finder writes a ranked candidate report (opportunity + matched fact + suggested IN-channel).
**Consequences (testable):**
- Report is a short ranked list (highest-fit first), written on demand.
- Each row is actionable by a human in one read (link, matched fact, channel).

### 4.4 Unlinked-Mention Finder
**Description:** Searches the web for mentions of "gmaslist" / "gma's list" that do **not** link to gmaslist.com, deduplicates against previously seen mentions, and outputs a chase list. Realizes UJ-1. `[ASSUMPTION: uses the existing web_search stack + GSC Links manual export as a cross-check; no paid backlink API.]`

**Functional Requirements:**

#### FR-10: Detect unlinked mentions
The system finds public mentions of the brand names that contain no link to gmaslist.com.
**Consequences (testable):**
- A mention that already links to gmaslist.com is excluded.
- Each result is a real, dated, linkable source.

#### FR-11: Deduplicate against prior runs
Mentions already surfaced in a prior run are not re-reported as new.
**Consequences (testable):**
- A mention seen last week does not appear in this week's "new" list.
- The persisted set of known mentions grows monotonically unless a source disappears.

#### FR-12: Output a chase list
The finder writes a report of new unlinked mentions to pursue.
**Consequences (testable):**
- Report lists only new-since-last-run mentions by default, with source + context snippet.
- Written on the weekly schedule and on demand.

## 5. Non-Goals (Explicit)

- **No automated link placement of any kind** — no auto-posting to Reddit/forums/comments, no outreach email blasts, no directory submission. Every act of placement is a human (Erik) decision. `[NON-GOAL for MVP]`
- **Not building toward OUT-channels** — no tool ever targets a directory, aggregator, business listing, link farm, PBN, or rival domain, even to "measure" it as an outreach target.
- **Not a public/deployed surface** — no in-app page, no admin route in the running server; local-only reports.
- **Not a new fact engine** — these tools consume gated/derived facts; they never re-scrape, re-compute, or invent numbers.
- **Not a paid-data product (v1)** — no paid backlink/SEO API; free-tier sources only.

## 6. MVP Scope

### 6.1 In Scope
- All four tools (§4.1–§4.4), local-only, writing JSON + markdown reports.
- Citation-share tracker + unlinked-mention finder wired into the existing weekly Scheduled Task.
- Opportunity finder + fact packager runnable on demand.
- Free-tier data only: GSC Links (manual export), the existing Haiku + web_search stack, Perplexity Sonar.

### 6.2 Out of Scope for MVP
- Paid backlink/SEO API integration (referring-domain graphs, new/lost-link feeds) — `[NOTE FOR PM]` genuinely useful for the mention finder; revisit as phase 2 if free-tier coverage proves thin (Open Q1).
- Any automated outreach/posting (permanent non-goal, not just deferred).
- A rendered HTML dashboard aggregating the four reports — deferred; markdown summaries suffice for a single operator.
- Scheduling the opportunity finder + fact packager (kept on-demand by choice).

## 7. Success Metrics

**Primary**
- **SM-1**: Citation share off zero — gmaslist cited in ≥1/8 seed questions, then trending up, as recorded by the tracker. Validates FR-1, FR-2, FR-3.
- **SM-2**: Operator actually earns links — ≥1 real link/citation per month traceable to an opportunity or unlinked-mention the tools surfaced. Validates FR-7, FR-9, FR-10, FR-12.

**Secondary**
- **SM-3**: Weekly habit holds — Erik runs/reads the weekly reports most weeks and the on-demand tools when doing outreach. Validates the whole set (UJ-1, UJ-2).
- **SM-4**: Zero honesty incidents — no packaged fact ever published that the engine couldn't vouch for. Validates FR-5, FR-6.

**Counter-metrics (do not optimize)**
- **SM-C1**: Volume of surfaced opportunities/mentions — a longer worklist is *not* better; padding it with low-fit or OUT-channel items defeats the "20-minute, pre-vetted" purpose. Counterbalances SM-2.
- **SM-C2**: Number of facts packaged — packaging more facts is worthless if any is ungated; withholding (FR-6) is the correct behavior, not a failure. Counterbalances SM-4.

## 8. Open Questions

1. Does the free-tier stack (GSC Links manual export + web_search) give the unlinked-mention finder enough coverage, or will a paid backlink API be needed for referring-domain data? (Gates the §6.2 phase-2 item.)
2. What exactly is the seed-question set and rival list the tracker reads from the citation monitor — fixed, or does the tracker need to tolerate it changing over time? (Confirm at build time against the monitor.)
3. For the opportunity finder, is there any acceptable programmatic access to Reddit search, or is it web_search-only? (Affects freshness/recall, not scope.)
4. GSC access is manual (browser). Is a manual weekly export into a known local path acceptable as the tracker/mention-finder's GSC input, or is that friction a problem?

## 9. Assumptions Index

- §4.1 — Citation-share tracker builds on the citation monitor's existing output; no engine calls beyond the monitor's.
- §4.2 — Fact packager reads existing derived JSON (cross-store spread / real-drop-vs-own-median / regional price floor); no new computation.
- §4.3 — Opportunity finder uses the existing Haiku + web_search stack; no paid search API, no Reddit write access.
- §4.4 — Unlinked-mention finder uses web_search + a manual GSC Links export cross-check; no paid backlink API.
- General — all four tools follow the citation monitor's local-only, out-of-server-runtime pattern (see Constraints).

## 10. Constraints and Guardrails

### 10.1 Legal + honesty rails (inherited, non-negotiable — from `GMAS_LIST_BRIEF.md` / brief §3)
- **WA-only** in every keyword, geo signal, and piece of outreach copy (WAC 314-55-155 posture).
- **No health/potency claims** in any generated text.
- **No discount-hype framing** ("SLASHED!", fake-sale language). The promise is *honest*.
- **Positioning:** gmaslist is an independent information service, not a cannabis seller; copy must never imply it sells product.
- **Honesty gate is load-bearing:** never surface or package a number the derivation engine's honesty gates can't vouch for (FR-6 enforces this).
- **Rival-not-distribution:** no tool ever targets an OUT-channel or rival domain (FR-8 enforces this for the opportunity finder; §5 enforces it globally).

### 10.2 Architecture / cost constraints
- **Local-only, out of the server runtime** — same pattern as the citation monitor; adds no server dependency or deploy risk.
- **Free-tier data only** (v1) — GSC Links (manual), the existing web_search + Perplexity stack; no paid API.
- **Reports, not placement** — every tool's output is a local JSON + markdown report a human acts on.
- **Repo norms (confirmed at build time):** TypeScript strict mode; tests for everything; any architectural decision recorded in `ADR.md`; any new `server/data/derived/*.json` must be registered in the derive/republish pipeline (per existing repo convention).

## 11. Cross-Cutting NFRs

- **Fail-soft:** a tool that can't reach a data source writes an empty/partial report with a clear reason, never a crash and never a fabricated result.
- **Idempotent runs:** re-running for the same date/query updates rather than duplicates (FR-1, FR-11).
- **Traceable output:** every surfaced item and packaged fact carries its source reference so the operator can verify before acting (the diagnostic-protocol "confirm before acting" rule applies).
- **Low/zero marginal cost:** stays within the free-tier stack; any run cost is on the order of the existing ~$1/mo citation monitor.
