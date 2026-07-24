# Implementation Phases

> **STATUS 2026-07-23 — Phase 0 SHIPPED (ADR-097, story `crawler-visible-homepage-and-agegate`).** Phase 0a perf half = ADR-082 (`__GMA_DATA__` snapshot). Phase 0a crawler-HTML half + Phase 0b = ADR-097: `shellRoute.ts` server-renders escaped deal/store HTML inside `#root` (non-JS crawlers), and both content gates (`AgeGate` + `LocationOnboarding`) now mount children `inert` behind their unchanged overlays (JS crawlers) — Erik released the 0b legal go-ahead on the ADR-066 basis. Zero human visual change. 599 client + 726 server green; live-curl-verified. Still open below: Phase 1 OG/Twitter meta + per-store `LocalBusiness` JSON-LD, Phase 1a per-store routes, Phase 6 Search Console submission.

## Phase 0 — Make the Site Visible to Crawlers (The Blocker)

### Current State
- Express serves the same static `client/dist/index.html` for every route (SPA fallback).
- The HTML is a bare shell: `<div id="root"></div>` + script tag. No content exists server-side.
- AgeGate conditionally mounts `children` only after client-side age check passes.
- Non-JS crawlers: see empty HTML.
- JS crawlers (Googlebot): execute React, hit AgeGate's conditional render, see only "Are you 21 or older?" text.

### 0a. Server-Side Content Delivery (Backend-only)

**Options:**
- **Lightest:** Express injects a snapshot of current deal/store data into `index.html` server-side (string templating into the existing static file). Cheapest, smallest blast radius.
- **Heavier:** Pre-render at build/ingest time into a static HTML fragment Express serves.
- **Heaviest:** Full SSR (React server rendering). Not recommended — disproportionate rewrite for this app.

**Recommendation:** Start with the lightest option. Touches `server/index.ts` and possibly a new template step. Backend work, zero CSS/layout changes.

### 0b. AgeGate: Keep Content Mounted, Gate It Visually

**Current behavior:** AgeGate withholds `children` from the DOM entirely until age is confirmed.

**Proposed:** Mount real content but overlay the gate on top (fixed-position dialog, `aria-modal`, focus-trap, `pointer-events` blocked on underlying content). Content is in the markup for crawlers; invisible and non-interactive for humans until they confirm.

**Industry precedent:** Weedmaps, Leafly use this pattern.

**Blocker:** This requires legal/compliance review before implementing. WAC 314-55-155 mandates the age gate and warnings, but does not explicitly address whether content may exist in page markup while visually/interactively blocked. **Flag for legal review; do not implement without approval.**

**Visual impact:** Zero. The overlay dialog looks and behaves exactly as now to a human visitor.

---

## Phase 1 — Basic Technical SEO Foundation (Backend / Markup-only)

None of these exist today (confirmed via repo search):

- **`client/public/robots.txt`** — allow everything except `/api/*`.
- **`client/public/sitemap.xml`** — list stable pages only (home + per-store). Do NOT generate per-deal URLs (deals churn hourly; thin, rotten pages hurt more than they help).
- **Meta tags in `client/index.html`** — `<link rel="canonical">`, `<meta name="description">`, Open Graph, Twitter Card. Currently only `<title>` exists.
- **JSON-LD `LocalBusiness` schema** — per store (name, address, geo, URL). Do NOT use product/offer schema (Google-restricted cannabis category, high risk, low upside).

### 1a. Stable Per-Store Routes

Add server-routed, crawlable URLs per store (e.g., `/store/<slug>`) that render that store's current deals using the Phase 0a content-delivery mechanism. Stable because stores don't churn (21 fixed entities). This is backend routing + reusing existing visual components. No new design.

---

## Phase 2 — Honest Information Gain (Backend, Computed at Ingest)

Compute regional stats (median price, lowest local price, savings delta) inside the existing ingest step (`server/routes/ingestRoute.ts`, run hourly via Actions cron) and store them alongside deal data in `data/data.json`.

Surface as plain, honestly-labeled text on home/store pages (e.g., "Regional median: $45.50 · Lowest nearby: $34.99").

**Note:** The original blueprint's SQL-batch approach doesn't fit this stack. Drop that framing entirely; compute at ingest time instead.

---

## Phase 3 — Crawler Access Policy (robots.txt Directives)

From validated research:

| Crawler Type | Examples | Decision |
|---|---|---|
| Citation-search (cite sources in answers) | Claude-SearchBot, OAI-SearchBot, PerplexityBot | **Allow** — local discovery visibility |
| Training (feed pretraining, not search answers) | ClaudeBot, GPTBot, Google-Extended | **Allow** — maximize crawler coverage; no negative impact on visits or compliance |
| Agentic dev tools | Claude Code, Cursor, MCP servers | Not a robots.txt decision; they fetch like a browser |

**Decision:** Allow all major crawlers (both citation-search and training) to maximize visibility. No blockers for discovery or compliance.

---

## Phase 4 — llms.txt (Low Priority, Correctly Scoped)

**Status:** Low priority. Google Search and AI Overviews explicitly ignore `llms.txt`; it's fetched mainly by IDE/agentic tools (Cursor, Claude Code, MCP servers), not AI search crawlers.

**Do not treat as an Overview-visibility lever.** If you want it anyway for the dev-tool audience, it's cheap (one static text file, no visual or architectural impact) — fine to add in Phase 1 alongside robots.txt/sitemap.

---

## Phase 5 — Off-Site / General Visit Growth (Outside the Codebase)

Outward-facing work:

- **Google Business Profile** — confirm none of the 21 stores' GBP listings conflict with how gmas list represents them.
- **Local press/community mentions** — Marysville/Snohomish County local news, Reddit communities, local Facebook groups. Backlinks from locally-relevant sources help local search far more than generic backlinks.
- **Bing Webmaster Tools** — submit sitemap (same as Google), low effort, non-trivial search traffic share.

**Flag before acting** (per Ask/Act boundary).

---

## Phase 6 — Measurement

- **Google Search Console + Bing Webmaster Tools** — verify ownership, submit the new sitemap, watch indexing status (before/after: currently zero pages).
- **Server-side crawler log monitoring** — watch for GPTBot, ClaudeBot, Googlebot, etc. hitting `/` and `/store/*` routes. Confirms Phase 0/1 are actually being fetched.

---

## What Touches What

| Phase | Backend-only | Frontend markup-only | Frontend behavior (visual unchanged) | Needs legal review |
|---|---|---|---|---|
| 0a server content delivery | ✅ | | | |
| 0b AgeGate mounting | | | ✅ | ✅ **yes** |
| 1 robots/sitemap/meta/OG/JSON-LD | | ✅ | | |
| 1a per-store routes | ✅ (reuses components) | | | |
| 2 Information Gain stats | ✅ | | | |
| 3 crawler access policy | ✅ (robots.txt) | | | |
| 4 llms.txt | ✅ | | | |
| 5 off-site | n/a (outside repo) | | | flag before publishing |
| 6 measurement | n/a (tooling) | | | |

---

## Recommended Deployment Order

1. **Phase 0a + 0b together** (the actual unlock) — *legal review required for 0b*
2. **Phase 1 + 1a** (foundation)
3. **Phase 6** (confirm it worked)
4. **Phase 2/3/4/5** (incremental, any order)

---

## Key Principle

**Phase 0 is ~90% of the value.** Everything after it is incremental polish on top of a site that today has nothing to polish. Do not let later phases crowd out Phase 0.
