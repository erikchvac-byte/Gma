# Epic derivation-3 Context: Feed the surfaces

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->
<!-- SCOPE NARROWED: only the SEO / AI-search comparison-pages surface is in scope this run.
     The other Epic-3 goal (in-app value cards) is DEFERRED — it depends on the parked Epic 2. -->

## Goal

Epic 3 turns the honest relational facts already produced by the Epic 1 derivation engine into the product's public, discoverable surface: server-rendered comparison pages that expose the cross-store price-disparity facts as extractable HTML plus structured data (AggregateOffer / Dataset JSON-LD), so AI-search crawlers and Google can find, cite, and understand gmaslist.com. This run builds ONLY the SEO comparison-pages slice — the in-app value cards (the other Epic-3 goal) are deferred because they depend on Epic 2's D6 rolling-median history, which is parked. This slice extends the already-shipped `/about` + FAQ entity surface (ADR-078) with a second class of server-rendered page whose content is the derived disparity facts rather than static copy.

## Stories

Not yet decomposed at story granularity for this slice. Orient around one deliverable: server-rendered cross-store comparison page(s) that consume the shipped derived disparity artifacts and emit matching JSON-LD. (Story breakdown is expected to follow; treat this file as the surface's binding context.)

## Requirements & Constraints

- Publish COMPUTED RELATIONAL FACTS, never verbatim menus or inventory. This is both the legal posture and the search-value strategy — reproducing store menus is redistribution risk and low information-gain; publishing derived disparity/spread facts is transform-not-copy and higher RAG value.
- Honesty Contract (hard on every fact surfaced): Gate 1 — $/gram comparisons are honest ONLY same-product cross-store; never a whole-catalog leaderboard. Gate 2 — the flat banner/product-special discount % carries no signal; do not present it as "how good a deal is." Gate 3 — gap-tolerance (a missing observation day is not "unchanged"). Gate 4 — a missed scrape is not a delisting. Gate 5 — potency-dependent facts are gated at ≥80% category coverage (potency is a NON-GOAL here; do not add a potency dimension). Inspectability — anything surfaced should trace back to the fact's own `excluded[]`/coverage accounting.
- Local/regional framing only. gmaslist.com serves ~21 licensed Washington stores; `areaServed` is Washington State. WAC 314-55-155 forbids out-of-state targeting — do not optimize for national reach, do not emit US-wide schema.
- No health claims, nothing deceptive/unfair (WA UDAP still applies to the aggregator). Do not host or transfer licensee ad creative.
- Do not generate per-deal URLs (deals churn hourly → thin, rotting pages). Stable entities only (categories, stores, brands — things that don't churn).
- Zero request-time compute: pages read pre-committed derived JSON; Render never recomputes a fact or opens the home DB. A missing/malformed artifact must degrade to a safe empty page, never a 500.

## Technical Decisions

- Legal gate is CLOSED (ADR-066): public fact-pages are cleared. The remaining constraint is data-quality (disparity facts must be accrued/honest), not permission. Retained caveats above (no licensee creative, no health/UDAP-deceptive copy, facts-not-menus).
- Consume the SHIPPED derived artifacts under `server/data/derived/` — do not recompute. Directly relevant to this slice: `disparities.json` (the keystone MatchReport of same-product cross-store price disparities) and `disparity-rollups.json` (pre-summarized by category and by store: disparityCount, avgSpreadPct, distinctStoresInvolved, per-store timesCheapest/timesPriciest + lat/lng). Other artifacts (brand-store-matrix, special-events, brand-personas, new-arrival-dormancy) exist and are candidate future surfaces but are not required for the disparity comparison pages.
- Every artifact is wrapped in the uniform honesty envelope `{ data, excluded[], coverage, generatedAt }` (`server/utils/derivedEnvelope.ts`, `isEnvelope`). Read them the way `valueRoute.ts` already does via `readDerived(path, EMPTY_*_ENVELOPE)`: existsSync → JSON.parse → `isEnvelope` shape-check → else fall back to a referentially-stable empty envelope (`generatedAt` = epoch, NOT "now"). Follow this fail-soft posture exactly; the load-bearing rule is Render never reaches for raw product data.
- SSR + JSON-LD conventions to mirror from the shipped `server/routes/aboutRoute.ts` (ADR-078):
  - Build the HTML string once at module load; register the route BEFORE the production SPA fallback in `server/index.ts`; proxy it in Vite dev; set `Cache-Control: public, max-age=3600`.
  - Single source of truth for content: the visible HTML text and the JSON-LD are generated from the SAME data so Google's "schema text must match on-page text" requirement holds by construction (enforce with a test, as `aboutRoute` does).
  - JSON-LD escaping: emit `<` as `<` inside `<script type="application/ld+json">` so page copy can never terminate the script element; text-node escape `& < >` in visible HTML.
  - Include `<link rel="canonical">`, `<meta name="description">`, per-page `<title>`.
- Schema choice caution: the SEO plan (`docs/seo-ai-crawler-visibility-plan.md`) recommends conservative `LocalBusiness` markup over aggressive `Product`/`AggregateOffer` (a Google-restricted category with real risk, little rich-result upside). The Epic-3 definition names AggregateOffer/Dataset explicitly. Resolve this tension at story time: `Dataset` schema over the honest cross-store comparison facts is the lower-risk, information-gain-aligned choice; do not emit product/offer commerce schema that implies the aggregator sells or that reproduces menus. When in doubt, favor the plan's conservatism and the facts-not-menus rule.
- Additive only: new route module(s) + registration; no change to `data.json`, the deals pipeline, `/api/data`, or existing types' behavior. Strict TypeScript, tests for the SSR output and the schema↔page-text match.

## Cross-Story Dependencies

- Depends on the shipped Epic 1 derived artifacts (`disparities.json`, `disparity-rollups.json`) and the `readDerived`/envelope machinery in `valueRoute.ts` — already live; this surface only reads them.
- Extends ADR-078's server-rendered entity surface (`/about`, FAQ, entity JSON-LD) — same SSR pattern, new content class.
- The in-app value-cards half of Epic 3 is DEFERRED behind Epic 2 (D6 rolling-median history, parked). Do not build it in this run.

## Gaps found

- No dedicated, story-level SEO comparison-pages spec exists yet. The real planning corpus for this surface is spread across: the Epic breakdown's Epic 3 stub + Honesty Contract (`epics-derivation-engine.md`), the SEO/AI-crawler plan (`docs/seo-ai-crawler-visibility-plan.md`, which predates the derivation engine and frames the disparity facts as "Phase 2 Information Gain" over `data.json`, not the derived artifacts), and ADR-066/077/078. The AggregateOffer/Dataset schema decision is unresolved between the Epic-3 name and the plan's LocalBusiness recommendation — flagged above; needs a call at story time.
- URL/route architecture for the comparison pages (per-category? per-store? single index?) is not specified in any source; must be designed. Constraint: stable entities only, no per-deal URLs.
