---
title: 'AI-search entity surface: server-rendered /about + FAQ + JSON-LD + footer identity'
type: 'feature'
created: '2026-07-10'
status: 'done'
context: []
baseline_commit: '7a30fc8ec8074e7ad634a29965e95fd6a401c061'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** gmaslist.com has zero AI-search/entity presence: the server serves an empty SPA shell, there is no About/FAQ content anywhere, no JSON-LD, and `client/index.html` has no meta description. Erik has four vault notes (GMASLIST folder) defining the entity strategy, an about-page draft, a FAQ draft, and a JSON-LD plan that need consolidating into shipped pages.

**Approach:** Serve a static, server-rendered `/about` page (plain HTML from Express, crawlable without JS) containing the polished About + FAQ content consolidated from the vault notes, with Service + FAQPage JSON-LD whose answer text matches the visible text word-for-word. Add WebSite + Organization JSON-LD and a meta description to `client/index.html`. Add a short identity statement + About link to the existing `DisclaimerFooter`.

## Boundaries & Constraints

**Always:**
- FAQ visible text and FAQPage JSON-LD text come from ONE shared constant (single source of truth) so they cannot diverge.
- Lead every description with the positive entity identity ("independent consumer information service…"); state "does not sell cannabis" crisply once per relevant answer — never the 6× repetition of the raw draft.
- Fix all typos from the vault drafts; polished copy only.
- `areaServed` = Washington State (WAC 314-55-155: no out-of-state targeting); coverage framed as WA / Snohomish County area.
- `/about` route registered before the production SPA fallback regex; must work in dev too.
- New content uses the name "Gmas List"; existing footer disclaimer lines stay untouched.

**Ask First:**
- Adding robots.txt / sitemap / per-store routes (Phase 1/1a of the SEO spec — separate stories).
- Any age-verification FAQ question (compliance-sensitive; not in Erik's notes).

**Never:**
- No SearchAction in WebSite JSON-LD (no /search endpoint exists — schema must not claim capabilities the site lacks).
- No product/offer/deal schema (Google restricts cannabis commerce markup; SEO spec CAP-4 non-goal).
- No deal-data injection into index.html (that is Phase 0a, a separate story).
- No React/SPA rendering for /about — it must be plain HTML in the Express response body.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Crawler fetches about page | GET /about, no JS | 200, text/html, full About + FAQ text + Service/FAQPage JSON-LD in body | N/A |
| Dev-mode fetch | GET /about with NODE_ENV != production | Same 200 HTML (route is unconditional) | N/A |
| SPA fallback unaffected | GET /some-client-route in production | Still serves index.html shell | N/A |
| API routes unaffected | GET /api/data | Unchanged JSON response | N/A |
| JSON-LD integrity | Parse each `<script type="application/ld+json">` on /about | Valid JSON; every FAQPage answer string appears verbatim in visible HTML | test fails if divergent |

</frozen-after-approval>

## Code Map

- `server/index.ts` -- route registration; prod static + SPA fallback at lines 46–61; `/about` must be added before that block
- `server/routes/aboutRoute.ts` -- NEW: about-page handler + content constants
- `server/routes/aboutRoute.test.ts` -- NEW: supertest coverage (pattern: `server/routes/dataRoute.test.ts`)
- `client/index.html` -- head: add meta description + WebSite/Organization JSON-LD (currently has GA tag, fonts, title only)
- `client/src/components/DisclaimerFooter.tsx` -- existing footer (inside AgeGate); add identity Notice + /about link
- `client/src/components/DisclaimerFooter.test.tsx` -- extend for new Notice
- Source content: vault notes at `C:\Users\erikc\Desktop\DesktopFolder\MeNew\GMASLIST\` (NEED might be answer.md = base structure; GmasList_AI_Search_Intent_Strategy.md = entity definition + intent clusters; JSON-LD schema.md = schema shapes; MAKE A FAQ PAGE.md = FAQ additions)

## Tasks & Acceptance

**Execution:**
- [x] `server/routes/aboutRoute.ts` -- create: export `FAQ_ITEMS` (array of `{question, answer}`), `ENTITY_DESCRIPTION` const, and `aboutRoute` handler returning a complete HTML page built at module load. Page: title "About Gmas List | Cannabis Deals Worth the Drive", meta description, canonical `https://gmaslist.com/about`, dark minimal inline CSS (bg `#0E1417`, system fonts, readable max-width), H1 + opening entity statement, sections (What Is Gmas List / How It Helps Shoppers Save / Information Service Not a Retailer / Why Gmas List Exists), FAQ section rendered from `FAQ_ITEMS`, link back to `/`. Two JSON-LD blocks: Service (provider Organization, areaServed WA) and FAQPage (mainEntity generated from `FAQ_ITEMS`). FAQ set ≈9: what is / does it sell cannabis / retailer-or-marketplace / represent businesses / worth-the-drive meaning / where data comes from / coverage area (WA, Snohomish County area) / how fresh / is it free.
- [x] `server/index.ts` -- register `app.get('/about', aboutRoute)` above the production block -- crawlable in all envs, wins over SPA fallback.
- [x] `client/index.html` -- add `<meta name="description">` (entity-led copy) + one `<script type="application/ld+json">` with `@graph` of WebSite (`@id` `#website`) and Organization (`@id` `#organization`), no SearchAction.
- [x] `client/src/components/DisclaimerFooter.tsx` -- add one Notice: short identity statement ("Gmas List is an independent information service. We don't sell cannabis — we help you find deals from licensed WA retailers worth the drive.") + `<a href="/about">About Gmas List</a>`.
- [x] `server/routes/aboutRoute.test.ts` -- create: 200 + text/html; entity phrases present; extract all ld+json blocks, JSON.parse each; FAQPage answers each appear verbatim in stripped visible HTML; Service JSON-LD names Gmas List + WA; page contains no `<div id="root">`.
- [x] `client/src/components/DisclaimerFooter.test.tsx` -- extend: identity Notice text + /about link render; existing disclaimers still present.

**Acceptance Criteria:**
- Given a non-JS HTTP client, when it GETs `/about`, then the response body contains the full FAQ text and parseable Service + FAQPage JSON-LD with no React mount point.
- Given the built client, when `index.html` is inspected, then it carries a meta description and valid WebSite + Organization JSON-LD.
- Given an onboarded app view, when the feed renders, then the footer shows the identity statement with a working /about link alongside the existing disclaimers.
- Given production route order, when any non-API, non-/about path is requested, then the SPA fallback still serves the shell.

## Verification

**Commands:**
- `cd server && npx vitest run` -- expected: all suites green including new aboutRoute tests
- `cd client && npx vitest run` -- expected: green including DisclaimerFooter
- `npm run build` -- expected: client+server production build clean (standing rule before any push)

**Manual checks (if no CLI):**
- `curl localhost:3001/about` in dev shows full HTML with FAQ + JSON-LD.

## Suggested Review Order

**Entity content + single source of truth**

- The one entity definition AI search should learn; feeds visible HTML and Service JSON-LD.
  [`aboutRoute.ts:18`](../../server/routes/aboutRoute.ts#L18)

- Canonical 9-item FAQ array — visible text and FAQPage schema both generate from it.
  [`aboutRoute.ts:35`](../../server/routes/aboutRoute.ts#L35)

- Static page template: title/canonical/meta, four About sections, FAQ rendered from the array.
  [`aboutRoute.ts:150`](../../server/routes/aboutRoute.ts#L150)

**Schema emission + hardening**

- Service schema: areaServed locked to Washington (WAC 314-55-155 local-only).
  [`aboutRoute.ts:110`](../../server/routes/aboutRoute.ts#L110)

- FAQPage mainEntity mapped from FAQ_ITEMS — word-for-word match by construction.
  [`aboutRoute.ts:133`](../../server/routes/aboutRoute.ts#L133)

- `<` escaped as unicode escape sequence u003c in JSON-LD so copy can never terminate the script element (review patch).
  [`aboutRoute.ts:106`](../../server/routes/aboutRoute.ts#L106)

- WebSite + Organization @graph and meta description on the SPA shell; no SearchAction.
  [`index.html:20`](../../client/index.html#L20)

**Routing**

- /about registered unconditionally, before the production static + SPA-fallback block.
  [`index.ts:48`](../../server/index.ts#L48)

- Handler: hour-long Cache-Control on a page that's static until redeploy (review patch).
  [`aboutRoute.ts:228`](../../server/routes/aboutRoute.ts#L228)

- Dev proxy forwards /about to Express so the footer link works under Vite (review patch).
  [`vite.config.ts:19`](../../client/vite.config.ts#L19)

**Footer identity**

- One quiet site-wide identity line + About link beside the existing disclaimers.
  [`DisclaimerFooter.tsx:49`](../../client/src/components/DisclaimerFooter.tsx#L49)

**Tests**

- Schema↔HTML word-for-word integrity and no-SPA-shell assertions.
  [`aboutRoute.test.ts:83`](../../server/routes/aboutRoute.test.ts#L83)

- Source-order guard: /about stays ahead of the SPA fallback.
  [`aboutRoute.test.ts:96`](../../server/routes/aboutRoute.test.ts#L96)

- Parse-validity + entity-drift tripwire for the hand-written index.html JSON-LD (review patch).
  [`indexHtml.test.ts:20`](../../client/src/indexHtml.test.ts#L20)

- Footer identity line + /about link coverage.
  [`DisclaimerFooter.test.tsx:21`](../../client/src/components/DisclaimerFooter.test.tsx#L21)
