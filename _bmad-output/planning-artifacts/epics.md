---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Happy-2026-08-06/addendum.md
---

# Happy — Backlink Measure-and-Surface Tooling — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Backlink Measure-and-Surface Tooling, decomposing the requirements from the PRD (`prd-Happy-2026-08-06`) and its companion addendum (tech mechanism) into implementable stories. No UX document exists — these are local-only CLI tools with no UI. The June 2026 `architecture.md` belongs to the original gmaslist product and is deliberately excluded.

## Requirements Inventory

### Functional Requirements

**Citation-Share Tracker (extends the citation monitor)**
- FR-1: Record citation share per run — for each citation-monitor run, record gmaslist's citation count and each rival domain's count over the seed-question set, appended to a persisted time series (dated datapoint; same-date re-run updates not duplicates; survives across runs via a local file).
- FR-2: Compute trend vs rivals — show current share, delta vs previous datapoint, and the current rival leader with its share; a first-ever citation (0 → ≥1) is called out explicitly (which engine, which query).
- FR-3: Surface the trend in the weekly report — write a one-screen human-readable markdown summary alongside the JSON series; written on the weekly schedule and on demand.

**Citation-Ready Fact Packager**
- FR-4: Select a gated fact for a query/geo — operator supplies topic/category + WA geo; return the most relevant gated fact from derived data; return "no citable fact available" if none passes the honesty gate; reject geo outside WA.
- FR-5: Render channel-shaped, caveat-baked copy — render the fact as short copy for a named IN-channel with its honesty caveat inline; include the number, plain-English caveat, and a source reference to the live gmaslist page; no health/potency claim, no discount-hype, never implies gmaslist sells product.
- FR-6: Refuse when no gated fact vouches — with no qualifying fact, emit an explicit "nothing citable" result, never a fabricated/ungated number; a parse-artifact-flagged value (e.g. "$84 Donny Burger") is never emitted.

**Opportunity Finder**
- FR-7: Find answerable public questions — find recent public questions/threads (Reddit, local community, journalist queries) a gated fact could answer; each candidate is a real, dated, linkable item paired with the specific fact that answers it (or discarded if none does).
- FR-8: Constrain to WA + IN-channels — filter candidates to WA relevance and IN-channels; no candidate resolves to an OUT-channel or rival domain; out-of-WA candidates dropped.
- FR-9: Output a ranked worklist — write a short ranked candidate report (opportunity + matched fact + suggested IN-channel), highest-fit first, on demand; each row actionable by a human in one read.

**Unlinked-Mention Finder**
- FR-10: Detect unlinked mentions — find public mentions of "gmaslist" / "gma's list" that contain no link to gmaslist.com; exclude mentions that already link; each result a real, dated, linkable source.
- FR-11: Deduplicate against prior runs — mentions surfaced in a prior run are not re-reported as new; the persisted known-mention set grows monotonically unless a source disappears.
- FR-12: Output a chase list — write a report of new-since-last-run unlinked mentions by default, with source + context snippet; written on the weekly schedule and on demand.

### NonFunctional Requirements

- NFR-1 (Fail-soft): a tool that can't reach a data source writes an empty/partial report with a clear reason — never a crash, never a fabricated result.
- NFR-2 (Idempotent runs): re-running for the same date/query updates rather than duplicates (supports FR-1, FR-11).
- NFR-3 (Traceable output): every surfaced item and packaged fact carries its source reference so the operator can verify before acting ("confirm before acting").
- NFR-4 (Low/zero marginal cost): stays within the free-tier stack; any run cost on the order of the existing ~$1/mo citation monitor.

### Additional Requirements

*From the addendum (tech mechanism) and PRD §10 Constraints:*

- AR-1 (Local-only, out of runtime): all tools follow the citation-monitor pattern — local-only `server/scripts/*.ts` writing to `server/data/derived/*.json` + a `.md` human summary; nothing runs inside the deployed server.
- AR-2 (Extend, don't fork the monitor): the citation-share tracker extends `server/scripts/citationMonitor.ts` output — it consumes the monitor's per-run "who was cited" data and appends a time series; no new engine calls. Confirm the monitor's current output shape at build time.
- AR-3 (Derived-JSON registration): any new `server/data/derived/*.json` must be appended to `$derivedFiles` in `derive-facts-local.ps1` or it never republishes (existing repo gotcha).
- AR-4 (Scheduling gate): the tracker + unlinked-mention finder attach to the existing weekly citation-monitor Scheduled Task (Mon 05:00); registering/altering Scheduled Tasks needs Erik's explicit per-action go-ahead — never wire it silently.
- AR-5 (Search stack): opportunity finder + unlinked-mention finder reuse the citation monitor's Haiku + `web_search` path; Perplexity Sonar available as a second engine; no paid search/backlink API in v1.
- AR-6 (GSC input): GSC Links is browser-only/manual; assume a manual weekly export dropped into a known local path is the tracker/mention-finder's GSC input (Open Q4).
- AR-7 (Fact packager reads derived JSON): reads already-derived JSON (`price-vs-own-median.json`, `regional-price-floor.json`, cross-store spread / `disparities.json`) served on SSR `/compare/*` + `/store/*`; re-renders, never re-computes.
- AR-8 (Repo norms): TypeScript strict mode; tests for everything; any architectural decision recorded in `ADR.md`.

### UX Design Requirements

None — local-only CLI tooling, no UI. (No UX document exists for this PRD.)

### FR Coverage Map

- FR-1: Epic 1 / Story 1.1 — record citation share per run (time series)
- FR-2: Epic 1 / Story 1.1 — compute trend vs rivals + first-citation callout
- FR-3: Epic 1 / Story 1.1 — surface trend in weekly markdown report
- FR-4: Epic 1 / Story 1.2 — select a gated fact for a query/geo
- FR-5: Epic 1 / Story 1.2 — render channel-shaped, caveat-baked copy
- FR-6: Epic 1 / Story 1.2 — refuse when no gated fact vouches
- FR-7: Epic 1 / Story 1.3 — find answerable public questions
- FR-8: Epic 1 / Story 1.3 — constrain to WA + IN-channels
- FR-9: Epic 1 / Story 1.3 — output a ranked worklist
- FR-10: Epic 1 / Story 1.4 — detect unlinked mentions
- FR-11: Epic 1 / Story 1.4 — deduplicate against prior runs
- FR-12: Epic 1 / Story 1.4 — output a chase list

*Cross-cutting on all four stories:* NFR-1..NFR-4 (fail-soft, idempotent, traceable output, low/zero cost) and AR-1..AR-8 (local-only out-of-runtime, extend the monitor, register derived JSON, scheduling go-ahead gate, free-tier search stack, manual GSC input, packager reads derived JSON, TS-strict + tests + ADR).

## Epic List

### Epic 1: Backlink Measure-and-Surface Toolkit
Erik can see the reach/backlink gap move over time and get a short, pre-vetted, honesty-gated worklist of real link-earning moves — all from local JSON + markdown reports, with no automated placement. Four independently-valuable local tools sharing the citation-monitor pattern, delivered in confirmed build order (extend-first / cost order).
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12
**Stories:** 1.1 Citation-share tracker (FR-1..3) → 1.2 Citation-ready fact packager (FR-4..6) → 1.3 Opportunity finder (FR-7..9) → 1.4 Unlinked-mention finder (FR-10..12)

## Epic 1: Backlink Measure-and-Surface Toolkit

Erik can see the reach/backlink gap move over time and get a short, pre-vetted, honesty-gated worklist of real link-earning moves — all from local JSON + markdown reports, with no automated placement. Stories ship in confirmed build order (extend-first / cost order); each is independently valuable and depends only on prior stories, never future ones.

*Cross-cutting acceptance (applies to every story in this epic): output is local JSON + a markdown summary written under `server/data/derived/` (nothing runs in the deployed server); any new `server/data/derived/*.json` is registered in `$derivedFiles` in `derive-facts-local.ps1`; a tool that can't reach a data source writes an empty/partial report with a stated reason rather than crashing or fabricating (NFR-1); re-running for the same date/query updates rather than duplicates (NFR-2); every surfaced item carries a source reference (NFR-3); runs stay within the free-tier stack (NFR-4); TypeScript strict mode, tests written, and any architectural decision recorded in `ADR.md`.*

### Story 1.1: Citation-share tracker

As the operator (Erik),
I want each citation-monitor run recorded as a dated share datapoint and its trend surfaced in a weekly report,
So that I can tell whether reach work is moving our AI-citation share against rivals without re-reading eight engine answers.

**Acceptance Criteria:**

**Given** a completed citation-monitor run whose per-run "who was cited" data is available
**When** the tracker runs
**Then** a new dated datapoint is appended to a persisted local JSON series recording gmaslist's citation count (n/total) and each rival domain's count over the seed-question set
**And** re-running for the same date updates that date's datapoint rather than duplicating it
**And** the series survives across runs (persisted to a local file, not held only in memory) — realizes FR-1.

**Given** a persisted series with at least two datapoints
**When** the report is generated
**Then** it shows the current share, the delta vs the previous datapoint, and the current rival leader with its share
**And** a first-ever citation (0 → ≥1) is called out explicitly, naming which engine and which seed query produced it — realizes FR-2.

**Given** a completed tracker run
**When** output is written
**Then** a one-screen human-readable markdown summary is written alongside the JSON series containing current share, delta, rival leader, and any new-citation callout
**And** the report is produced both on the weekly schedule and on demand — realizes FR-3.

**Given** the tracker is built to extend the existing citation monitor
**When** it computes a datapoint
**Then** it consumes the monitor's existing output and makes no new engine calls beyond what the monitor already made (AR-2)
**And** if the monitor's output is missing or malformed, the tracker writes an empty/partial report stating the reason rather than crashing (NFR-1).

### Story 1.2: Citation-ready fact packager

As the operator (Erik),
I want a copy-paste-ready honest fact for a given topic/geo with its caveat already attached,
So that I never pitch a number the derivation engine can't vouch for when I answer a thread.

**Acceptance Criteria:**

**Given** a supplied topic/category and a WA geo
**When** the packager runs
**Then** it returns the most relevant gated fact drawn from existing derived JSON (cross-store spread / real-drop-vs-own-median / regional price floor), reading only — it never re-scrapes or re-computes (AR-7)
**And** a geo outside WA is rejected with no out-of-state fact returned
**And** a fact is returned only if it passes the honesty gate — realizes FR-4.

**Given** a qualifying gated fact and a named IN-channel
**When** copy is rendered
**Then** the output includes the number, its plain-English caveat (e.g. "below its own recent usual price, not a fake sale"), and a source reference to the live gmaslist page
**And** the copy contains no health or potency claim, no discount-hype framing, and never implies gmaslist sells product — realizes FR-5.

**Given** no honesty-gated fact answers the supplied query
**When** the packager runs
**Then** it emits an explicit "nothing citable" result and never a fabricated or loosely-computed number
**And** a parse-artifact-flagged value (e.g. an implausible "$84 Donny Burger") is never emitted — realizes FR-6.

### Story 1.3: Opportunity finder

As the operator (Erik),
I want a short ranked list of recent WA public threads that a gated gmaslist fact can answer, each paired with the fact and a suggested channel,
So that outreach this week is a 20-minute task instead of a research project.

**Acceptance Criteria:**

**Given** the existing Haiku + web_search / Perplexity stack (no paid API, no Reddit write access — AR-5)
**When** the finder searches IN-channels for recent public questions/threads (Reddit, local community, journalist queries)
**Then** each candidate is a real, dated, linkable public item
**And** each candidate is paired with the specific gated fact that answers it, or is discarded if no gated fact does — realizes FR-7.

**Given** a set of candidate threads
**When** filtering is applied
**Then** no candidate resolves to an OUT-channel or a rival domain (weedmaps/leafly/leafbuyer/yelp/directories)
**And** out-of-WA candidates are dropped — realizes FR-8.

**Given** filtered, fact-matched candidates
**When** the report is written on demand
**Then** it is a short ranked list, highest-fit first
**And** each row is actionable by a human in one read — link, matched gated fact, and suggested IN-channel — realizes FR-9.

### Story 1.4: Unlinked-mention finder

As the operator (Erik),
I want a weekly deduplicated chase list of public mentions of "gmaslist" / "gma's list" that don't link to gmaslist.com,
So that I can turn existing brand mentions into real backlinks.

**Acceptance Criteria:**

**Given** the web_search stack plus a manual GSC Links export dropped into a known local path (AR-6)
**When** the finder searches for the brand names
**Then** each result is a real, dated, linkable source that contains no link to gmaslist.com
**And** a mention that already links to gmaslist.com is excluded — realizes FR-10.

**Given** a persisted set of previously-seen mentions
**When** a new run completes
**Then** a mention surfaced in a prior run is not re-reported as new
**And** the persisted known-mention set grows monotonically unless a source disappears — realizes FR-11.

**Given** a completed run
**When** the report is written
**Then** it lists only new-since-last-run mentions by default, each with its source and a context snippet
**And** the report is produced both on the weekly schedule and on demand — realizes FR-12.

**Given** the tool is a candidate to attach to the existing weekly citation-monitor Scheduled Task (Mon 05:00)
**When** scheduling is wired
**Then** it is not registered or altered without Erik's explicit per-action go-ahead (AR-4).
