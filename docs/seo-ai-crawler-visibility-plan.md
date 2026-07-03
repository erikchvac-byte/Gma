# gmas list — Visibility Plan (Search, AI Crawlers, Site Visits)

> Status: planning artifact, not yet implemented. Written 2026-06-24. Point to this file for the full plan; do not re-derive it from scratch.
>
> Constraint honored throughout: **no visual/layout/style rewrite.** Every item below is backend, markup-only (meta/JSON-LD/static files), or — in exactly one case (Phase 0b) — a *behavioral* change to `AgeGate.tsx` that does not touch its visuals.

## 0. Framing: this is local/regional discovery, not national SEO

gmas list only has value to someone who can drive to one of the 21 WA stores in the dataset. WAC 314-55-155 also explicitly prohibits targeting out-of-state users (`GMAS_LIST_BRIEF.md` §7). Ranking nationally would be wasted effort and mild compliance friction — out-of-state visits don't convert and aren't supposed to be solicited. Every phase below is framed around **local/regional discovery** (Marysville/Snohomish County and the towns the 21 stores sit in), not broad national visibility. If you want to optimize for national reach instead, say so explicitly — it changes the schema and content strategy and reopens the out-of-state-targeting question.

## Leverage hierarchy — read this before the phases

Phase 0 is roughly 90% of the value. Everything after it is incremental polish on top of a site that, today, has **nothing to polish** — confirmed live via `site:gmaslist.com`, which returns **zero indexed pages**. Not even the age-gate shell is indexed. Phases 1–6 are real but secondary; don't let them crowd out Phase 0.

---

## Phase 0 — Make the site visible to crawlers at all (the blocker)

**Current state, confirmed from code:**
- `server/index.ts` serves the same static `client/dist/index.html` for every route (SPA fallback regex). There are zero server-rendered, route-distinct URLs.
- `client/index.html` is a bare shell: `<div id="root"></div>` + a script tag. No content exists in the HTML Express sends.
- `client/src/components/AgeGate.tsx:37` — `if (isIn) return <>{children}</>`. Until age is confirmed (client-side state/localStorage), `children` — `Header`, `DealFeed` (every deal/store), `DisclaimerFooter` — is **never mounted into the DOM**. Only the gate's own text exists.

**Why this is two coupled problems, not one:**
- Non-JS-executing crawlers (most AI crawlers per the validated research this session: GPTBot, PerplexityBot, OAI-SearchBot) fetch raw HTML and don't run JavaScript. They need deal content present in the HTML *as delivered by Express* — today that's an empty shell, so they get nothing no matter what AgeGate does.
- JS-executing crawlers (Googlebot) do run the React app, but hit AgeGate's conditional mount and see only "Are you 21 or older?" — never the deals.

Fixing only one half doesn't fix visibility. Both are needed.

### 0a. Server-side content delivery (backend-only, no visual change)
Options, lightest to heaviest:
- **Lightest:** Express injects a snapshot of current deal/store data into `index.html` server-side before sending it (string templating into the existing static file, no new framework). Cheapest, smallest blast radius.
- **Heavier:** Pre-render at build/ingest time (since data already refreshes hourly via the Actions cron → `/api/ingest`) into a static HTML fragment Express serves.
- **Heaviest:** Full SSR (React server rendering). Not recommended here — disproportionate rewrite for a 21-store flat-file app.
- **Recommendation:** start with the lightest option (server-side data injection into the existing shell). It's backend work, touches `server/index.ts` and possibly a new template step, and changes zero CSS/layout.

### 0b. AgeGate: keep content mounted, gate it visually instead of structurally
Today AgeGate withholds `children` from the DOM entirely. The common, compliant pattern other legal cannabis sites use (Weedmaps, Leafly) is the inverse: mount the real content, but overlay the gate on top (fixed-position dialog, `aria-modal`, focus-trap, `pointer-events` blocked on the underlying content) so a human visitor cannot interact with or meaningfully see the page until they confirm — while the markup is present for anything that fetches the HTML.

**This requires legal/compliance review before implementing — it is not my call to bless.** `GMAS_LIST_BRIEF.md` §7 mandates the age gate, the 21+ language, and that mandated warnings appear "in advertising/marketing surfaces" — but it doesn't explicitly address whether content may exist in page markup while visually/interactively blocked from a human. That's a real distinction with real precedent in the industry, but it's a WA cannabis-advertising-law question, not an engineering one. Flag it, get a yes/no, then implement.

**Visual impact:** zero. The overlay dialog still looks and behaves exactly as it does now to a human visitor; only the DOM-mounting logic changes.

---

## Phase 1 — Basic technical SEO foundation (all backend / markup-only, no visual change)

None of these exist today (confirmed via repo search — zero hits for any of them):

- `client/public/robots.txt` — allow everything except `/api/*`.
- `client/public/sitemap.xml` — list stable pages only (home + per-store, see Phase 1a). **Do not generate per-deal URLs** — deals churn hourly and would produce thin, constantly-rotting pages that hurt rather than help.
- `<link rel="canonical">`, `<meta name="description">`, Open Graph + Twitter Card tags in `client/index.html` (or injected server-side alongside Phase 0a). Currently `index.html` has only a `<title>` — no description, no OG, no canonical.
- **JSON-LD: `LocalBusiness`, not `Product`/`AggregateOffer`.** The blueprint document (fact-checked earlier this session) pushed aggressive cannabis product/offer schema hard — that's a Google-restricted category with real risk and little rich-result upside. The 21 stores are real entities with real addresses and already-committed `lat`/`lng` (ADR-044) — that's accurate, low-risk, locally-relevant structured data. Emit `LocalBusiness` blocks per store (name, address, geo, url) instead of product-level commerce schema.

### 1a. Stable per-store pages (this is the one route-architecture change)
Add server-routed, crawlable URLs per store (e.g. `/store/<slug>`) that render that store's current deals using the same Phase 0a content-delivery mechanism. Stable because stores don't churn (21 fixed entities); avoids the thin-content problem of per-deal URLs. This is backend routing + the existing visual components reused as-is — no new design.

---

## Phase 2 — Honest "Information Gain" content (backend, computed at ingest)

The original blueprint's claim that an aggregator needs computed proprietary metrics to avoid being flagged as low-value duplicate content is directionally reasonable (and matches Google's actual "doesn't reproduce existing content" guidance) — but its execution (real-time SQL set-based batch ops) doesn't fit this stack. **There is no SQL database; the store is `data/data.json`.** Drop the SQL-batch framing entirely.

Instead: compute regional stats (median price, lowest local price, savings delta) inside the existing ingest step (`server/routes/ingestRoute.ts` / the hourly Actions cron path) and store them alongside the deal data already being written. Surface them as plain, honestly-labeled text on the home/store pages (e.g. "Regional median: $45.50 · Lowest nearby: $34.99"). No "algorithmic E-E-A-T" framing — that term was debunked in the earlier fact-check as not a real Google ranking mechanism; this is just useful, accurate summary text.

---

## Phase 3 — Crawler access policy (robots.txt directives — your call, here's the recommendation)

From this session's validated research:
- **AI search-citation crawlers** (cite sources in answers): `Claude-SearchBot`, `OAI-SearchBot`, `PerplexityBot`. Recommend **allow** — this is exactly the kind of local-discovery visibility you want once Phase 0 makes there be something to cite.
- **AI training crawlers** (feed model pretraining, not search answers): `ClaudeBot`, `GPTBot`, `Google-Extended`. Your call — allowing them doesn't drive visits, blocking them doesn't cost visits either. No strong recommendation either way; default allow is fine unless you have a reason to restrict training use of the data.
- **Agentic dev-tool fetchers** (Claude Code, Cursor, MCP servers): not really a robots.txt decision — they fetch like a browser/CLI tool, not a bulk crawler.

---

## Phase 4 — llms.txt (low priority, correctly scoped)

Per the fact-check completed earlier this session and your own follow-up confirmation: Google Search and AI Overviews **explicitly ignore** llms.txt; it's fetched almost entirely by IDE/agentic dev tools (Cursor, Claude Code, MCP servers), not AI search crawlers. **Do not treat this as an Overview-visibility lever.** If you want it anyway for the dev-tool audience, it's cheap (one static text file, no visual or architectural impact) — fine to add in Phase 1 alongside robots.txt/sitemap, but it should not be prioritized or expected to move search visibility.

---

## Phase 5 — Off-site / general visit growth (outside the codebase)

Since the stated goal includes site visits broadly, not just crawler optimization:
- **Google Business Profile** — not for gmas list itself (it's not a physical business), but worth confirming none of the 20 stores' GBP listings conflict with how gmas list represents them.
- Local press/community mentions (Marysville/Snohomish County local news, Reddit r/washingtonstoners-style communities, local Facebook groups) — backlinks from locally-relevant sources help local search far more than generic backlinks.
- Bing Webmaster Tools submission — same sitemap as Google, low effort, non-trivial share of search traffic.

These are outward-facing (publishing, submitting to third-party tools) — flag before acting, per the Ask/Act boundary.

---

## Phase 6 — Measurement

- Google Search Console + Bing Webmaster Tools — verify ownership, submit the new sitemap, watch indexing status (currently: zero pages indexed, so this will show the before/after directly).
- Server-side log monitoring for crawler user-agents (GPTBot, ClaudeBot, Googlebot, etc.) hitting `/` and `/store/*` — confirms Phase 0/1 are actually being fetched, not just theoretically fixed.

---

## What touches what (classification recap)

| Phase | Backend-only | Frontend markup-only (no visual change) | Frontend behavior (visual unchanged, logic changes) | Needs legal review first |
|---|---|---|---|---|
| 0a server content delivery | ✅ | | | |
| 0b AgeGate mounting | | | ✅ | ✅ **yes** |
| 1 robots/sitemap/meta/OG/JSON-LD | | ✅ | | |
| 1a per-store routes | ✅ (+ reuses existing components) | | | |
| 2 Information Gain stats | ✅ | | | |
| 3 crawler access policy | ✅ (robots.txt) | | | |
| 4 llms.txt | ✅ | | | |
| 5 off-site | n/a (outside repo) | | | flag before publishing |
| 6 measurement | n/a (tooling) | | | |

**Recommended order:** 0a + 0b together (the actual unlock) → 1 + 1a (foundation) → 6 (confirm it worked) → 2/3/4/5 (incremental, any order).
