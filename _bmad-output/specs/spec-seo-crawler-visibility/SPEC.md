---
title: SEO & AI Crawler Visibility for gmas list
slug: seo-crawler-visibility
status: proposed
date: 2026-06-24
companions:
  - phases.md
sources:
  - ../../docs/seo-ai-crawler-visibility-plan.md
---

# SPEC: SEO & AI Crawler Visibility for gmas list

## Why

gmas list is currently invisible to search engines and non-JS AI crawlers (GPTBot, PerplexityBot, OAI-SearchBot) due to two coupled problems: (1) the Express server delivers an empty HTML shell with zero deal/store content to all routes, relying entirely on client-side React hydration; (2) the age gate prevents content from mounting in the DOM until a client-side check passes. Crawlers that don't execute JavaScript or that execute but hit the gate structure see nothing to index. With zero pages currently indexed (`site:gmaslist.com` returns zero), the site has no discoverable presence for local/regional users searching for dispensary information.

Fixing visibility unblocks local discovery for the 21 WA stores in the dataset and aligns with compliance (WAC 314-55-155 forbids out-of-state targeting; local visibility is the opposite of that problem).

## Capabilities

**CAP-1: Deliver indexable content to non-JS crawlers**
- Intent: Make deal and store information available in the raw HTML that Express serves, not hidden behind React hydration.
- Success: Google Search Console and Bing Webmaster Tools show 22+ pages indexed (home + 21 per-store pages); crawler logs confirm GPTBot, OAI-SearchBot, PerplexityBot fetching and parsing the home page.

**CAP-2: Allow JS-executing crawlers to see past the age gate**
- Intent: Ensure Googlebot and other JS-executing crawlers can access deal content in the DOM, not just the gate overlay.
- Success: Googlebot crawler logs show successful fetch of `/` with Content-Length > 50KB (populated with deal data); Google Search Console reports indexing of `/store/*` URLs.

**CAP-3: Establish crawlable, stable per-store routes**
- Intent: Create route-distinct URLs (`/store/<slug>`) that are stable (stores don't churn), avoid thin-content problems of per-deal URLs, and support local SEO signals (store name, address, geolocation).
- Success: All 21 `/store/*` URLs return 200, each with unique, populated content; Search Console shows all 21 indexed.

**CAP-4: Emit low-risk structured data for local search**
- Intent: Include JSON-LD `LocalBusiness` schema (not product/offer schema) with store addresses, coordinates, names; surface regional summary stats (median price, lowest local price) as plain text.
- Success: Rich result previews in Search Console (local business cards, if available); no structured data errors for any store or home page.

**CAP-5: Inform AI crawler policies**
- Intent: Publish robots.txt allowing citation-search crawlers (Claude-SearchBot, OAI-SearchBot, PerplexityBot) and specify policy for training crawlers (GPTBot, ClaudeBot, Google-Extended).
- Success: robots.txt is served from `/robots.txt`; crawlers respect directives (confirmed via server logs or Google Search Console).

## Constraints

- **No visual or layout rewrite.** Every change is backend, markup-only (meta/JSON-LD/static files), or a behavioral change to AgeGate mounting logic that leaves its visuals untouched.
- **Scope: local/regional discovery only.** The 21 stores are in WA; out-of-state targeting is explicitly prohibited by WAC 314-55-155. Every phase assumes Marysville/Snohomish County and the towns the 21 stores occupy, not national rank.
- **Age gate must remain compliant.** Any change to age-gate behavior (e.g., mounting content in the DOM while visually blocking it) requires legal/compliance review before implementation. The precedent exists in industry (Weedmaps, Leafly), but it is not an engineering call.
- **No SQL, no batch ops.** Information gain (Phase 2) computes stats at ingest time (during the hourly Actions cron), stored alongside deal data in `data/data.json`, not via external batch SQL.
- **Deals-first indexing.** Guard rails (CI tests, not runtime) prevent indexing of non-existent or invalid stores; the schema prioritizes store validation over product/offer metadata (per ADR-043).

## Non-Goals

- National SEO optimization or ranking for broad, non-local keywords.
- Rich result cards for individual products or deals (aggressive commerce schema; Google restricts cannabis category).
- Full server-side rendering (SSR) — disproportionate rewrite for a flat-file, 21-store app.
- Per-deal stable URLs (deals churn hourly; thin, rotten pages are worse than no pages).
- Off-site outreach, backlinks, or Google Business Profile management — outside the codebase scope.

## Success Signal

- **Before:** `site:gmaslist.com` returns 0 pages indexed.
- **After, Phase 0 complete:** `site:gmaslist.com` returns 22+ pages (home + 21 stores); crawler logs show non-JS crawlers (GPTBot, OAI-SearchBot, PerplexityBot) successfully fetching `/` and `/store/*` with populated deal/store data in the HTML response.
- **After, Phases 1–6 complete:** Google Search Console shows 22+ indexed pages, zero crawl errors, local business schema live, and regional summary stats visible on home/store pages.

---

## Assumptions

- Legal review of AgeGate mounting change (Phase 0b) will not block the change (precedent exists, but assumption until confirmed).
- Server logs and Google Search Console are sufficient to validate crawler success (no custom analytics framework required).
- The 21-store dataset will not expand beyond 21 stores during Phase 0–1 implementation.

## Open Questions

- Is mounting content in the DOM while visually/interactively blocking it (via overlay, not conditional render) compliant with WAC 314-55-155? **Flagged for legal review before Phase 0b implementation.**

---

## Notes

- **Leverage hierarchy:** Phase 0 is ~90% of the value (blocker removal). Phases 1–6 are incremental polish on top. Do not deprioritize Phase 0.
- **Deployment order:** Phases 0a + 0b (unlock) → 1 + 1a (foundation) → 6 (measurement) → 2/3/4/5 (incremental).
- See `phases.md` for detailed breakdown of each phase, implementation options, and classification (backend vs. frontend vs. legal).
