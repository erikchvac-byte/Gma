# Story: Honesty-safe crawlable depth for the thin store pages (Semrush "21 low word count")

Status: ready-for-dev

<!-- Cross-cutting SEO/reach story — no parent epic (tracked individually, like
     oracle-freshness-gate / crawler-visible-homepage-and-agegate). Source of record:
     _bmad-output/implementation-artifacts/investigations/semrush-site-audit-investigation.md -->

<!-- ⚠️ NEEDS ERIK GO-AHEAD TO BUILD. create-story only PLANNED this. The core decision
     (enrich vs leave lean) is a genuine strategic judgment call — see DEV-START DECISION
     below. Do NOT start dev until Erik rules on it. -->

## Story

As the operator of gmaslist.com (reach is the binding constraint — STRATEGY.md),
I want each thin `/store/<id>` page to carry a little more *durable, honest, extractable fact prose* — the kind an AI answer engine lifts as a citation — without padding, fabricating, or dumping a menu,
so that the site's per-store entity surface reads as a real answer to "deals at <store>" instead of a near-empty stub, and the Semrush "21 low word count" flag clears as a side effect of adding real value (not by gaming a word count).

## The strategic frame (read before writing any code)

The Semrush audit flagged 21/44 pages as "low word count": the **18 `/store/<id>` pages + the 3 `/compare/<region>` landing hubs** (Finding 3, Confirmed — 18+3=21 exact). The audit is otherwise a clean bill of health (Site Health 96%, AI Search Health 99%, 0 errors, 0 pages blocked from any AI/search crawler).

**Word count is a Google-era ranking proxy, NOT an AI-citation proxy.** A short page that answers one long-tail question with a hard, sourced fact is exactly what a citation crawler wants. So the trap to avoid — explicitly — is treating "21 low word count" as a bug to fix by fattening pages. Padding would violate the honesty contract (no menu dumps, no fabricated offers, no leaderboards) and add zero fact value.

The genuinely-open, unresolved question is *whether thin auto-pages help or hurt AI citation* — and that cannot be settled from the Semrush Overview export (counts only, no per-URL lists) or from word count at all. It needs Search Console index-status evidence for these URLs. **This story does not try to settle that question.** It does the one thing that is net-positive under *either* answer: add real, evergreen, honesty-safe fact content that makes each page a better citation target. If the "thin is fine for AI" hypothesis is right, richer honest pages still cite at least as well; if the "thin hurts" hypothesis is right, this is the fix. Word-count clearance is a byproduct, never the goal.

## Scope

**In scope:** the **18 `/store/<id>` pages** (`server/routes/storeRoute.ts`, `renderStoreHtml`). Add honest, evergreen, crawlable fact prose sourced only from data Render already holds.

**Out of scope (with rationale):**
- The **3 `/compare/<region>` hubs** are navigational category-link indexes (like the `/compare` index and `/about`). The investigation's verdict is they are thin *appropriately* — a hub's job is to route, not to prose. Do NOT bulk them up. (If Erik wants a single one-line methodology sentence added to `renderRegionIndexHtml` for parity, that's a trivial optional add — see Task 4 — but the default is leave them.)
- The **region-category `/compare/<cat>/<region>` pages** — NOT thin (509–1,893 words, Finding 4). Untouched.
- The **`/` low text-HTML-ratio** notice — expected SPA/`__GMA_DATA__` artifact (Finding 6 / ADR-082). Untouched.
- The **6 long-title** warning — already fixed (ADR-110, commit `4c5a07e`, region-category title tail trimmed). Do NOT re-open.
- Any **new derived fact / products-DB read on Render.** Render holds `data.json` + committed `server/data/derived/*.json` only. If a fact isn't already on Render, it is out of scope here.

## DEV-START DECISION (Erik must rule before build)

**Approve honesty-safe evergreen enrichment of the 18 store pages now, vs. leave them lean pending Search Console index-status evidence?**

- **Recommended: enrich now.** It is net-positive under both citation hypotheses, cheap, and reversible; it does not depend on the unresolved help-or-hurt question. Waiting for GSC evidence gains little because the enrichment doesn't risk anything the honesty contract protects.
- **Alternative: leave lean.** Defensible if Erik would rather first confirm (via GSC Coverage/Performance on `/store/*`) that these pages are even being indexed/cited before investing, to avoid enriching pages nothing reads.

Also confirm at dev-start:
1. **Enrichment content set** — which of the honest enrichers in Task 2 to include (recommend the evergreen methodology paragraph + area/city context; the store-count-in-area sentence is a nice-to-have).
2. **Word-count guardrail test** — add a per-store minimum-visible-word assertion (Task 3) as a regression floor? Recommend yes (cheap, catches a future template regression that would re-thin the pages), but the floor is a *guardrail*, not the story's goal.

## Acceptance Criteria

1. **Real fact content, not padding.** Each `/store/<id>` page gains at least one evergreen, honesty-safe block of extractable prose sourced only from data already on Render (store name/address/city/region/`lastFetchedAt`, active deals, price drops, region-floor links, and standing methodology/positioning facts). No fabricated offers, dates, ranks, or menu dumps.
2. **Honesty contract intact.** LocalBusiness JSON-LD only — never Product/Offer/AggregateOffer (`buildStoreJsonLd` unchanged in shape). No banner/promo % framed as a per-item discount (only the existing price-vs-own-median "real price drops" survive). No fixed distance number. `geo` still emitted only for finite lat/lng. No "as of <date>" printed for the `<2021` seed sentinel (`asOfDate` posture preserved).
3. **The thinnest page is materially richer.** The floor case — a confirmed-empty store with no deals, no drops, and no region (e.g. `the-vault-silvana`, measured at 152 visible words) — renders visibly more honest fact prose than today, and still says something true and useful (it exists, it's a licensed WA retailer in its city, how we track it, that it currently has no active deals).
4. **Existing sections unregressed.** Direct-answer lede (`buildDirectAnswer`), deals list / no-deals fallback, "Real price drops" strip (status-gated + `renderableStoreDrops`), "Cheapest in the <area>" links (`renderAreaLinksHtml`), age notice, and positioning disclaimer all render exactly as before. Fail-soft paths (missing region artifact, malformed drops artifact, `buildApiData` throw → 500) all preserved.
4b. **Region hubs untouched by default.** `renderRegionIndexHtml` output is byte-identical unless Erik opts into the optional one-line sentence (Task 4). The region-category and `/` pages are not touched at all.
5. **Guardrail (if approved in DEV-START Q2).** A test asserts every store page's *visible* word count (scripts/styles/JSON-LD stripped) exceeds a modest floor, so a future template change can't silently re-thin the pages. The floor is set from the enriched output, not reverse-engineered to just pass.
6. **Tests + build green.** New/updated tests for the enriched `renderStoreHtml` (including the empty-store floor case and the honesty assertions); full server suite green; production `npm run build` clean (`tsc -b && vite build`, exit 0).
7. **FR16 / type posture.** No new type that could carry a price-pair or potency claim into an honesty-gated surface. Enrichment prose is descriptive/structural only.

## Tasks / Subtasks

- [ ] **Task 1 — Ground the current template (AC: 3, 4).** Re-read `server/routes/storeRoute.ts` `renderStoreHtml` (239–322) and its helpers. Confirm the exact current section order and every conditional (deals fallback, `dropsHtml`, `renderAreaLinksHtml`, address/site-link guards). Note which stores fall into the floor case (no deals + no drops + no region).
- [ ] **Task 2 — Add honesty-safe evergreen enrichers (AC: 1, 2, 3).** Add a small pure, exported builder (mirror the `buildDirectAnswer` / `renderAreaLinksHtml` pattern — pure, exported, unit-tested) that emits one or more of:
  - [ ] 2.1 An evergreen **"About this page / how prices are tracked"** paragraph: what Gmas List is (independent info service, not a seller — reuse `positioningDisclaimerHtml`'s framing, don't duplicate its text), that the page shows the *current* publicly-available active deals which are set by the retailer and change through the day, and that "real price drops" (when shown) are a SKU priced below its own observed rolling median — the honest facts already true site-wide, scoped to this store. Evergreen ⇒ present on every store page including the empty floor case.
  - [ ] 2.2 A **place/entity sentence**: `<store>` is a licensed Washington cannabis retailer in `<city>` (reuse `parseCity(store.address)`; fall back to "Washington" when city unknown, exactly like `buildDirectAnswer`).
  - [ ] 2.3 (Nice-to-have, gated on DEV-START Q1) An **area-context sentence** when the store resolves to a region: how many licensed retailers Gmas List compares in that area, linking onward to the region page — sourced from the already-resolved `Region` (no new data). Keep it consistent with `renderAreaLinksHtml`; don't double-state.
  - [ ] Wire the block into `renderStoreHtml` at a sensible spot (recommend after the deals/drops, before or beside the area links), preserving all existing sections and order elsewhere.
- [ ] **Task 3 — Guardrail test (AC: 5, 6), if approved.** Add a test that strips `<script>`/`<style>`/JSON-LD and counts visible words for a representative set including the empty floor store, asserting each exceeds the floor. Set the floor from real enriched output.
- [ ] **Task 4 — (Optional, gated on DEV-START) region-hub one-liner (AC: 4b).** Only if Erik opts in: add a single evergreen methodology sentence to `renderRegionIndexHtml`'s accounting paragraph. Default: skip entirely.
- [ ] **Task 5 — Verify + document (AC: 6).** Full server suite + `npm run build`. Fetch/inspect the built-server render of 2–3 store pages (empty floor, deals-only, deals+drops+region) to confirm richer honest prose and no regression. Add **ADR-111** to `ADR.md` (decision, honesty rationale, the enrich-vs-lean call, what was deliberately left thin) and a change-log line. Update `sprint-status.yaml` to `done` the same session it ships.

## Dev Notes

### Where everything is
- **Store page template:** `server/routes/storeRoute.ts` — `renderStoreHtml` (239), `buildDirectAnswer` (190), `renderAreaLinksHtml` (223), `storeDrops` (95), `buildStoreJsonLd` (132), `asOfDate` (171), `escapeHtml`/`escapeAttr` (43/49). Route handler `storeRoute` (343) resolves region fail-soft (`regionForStore(readRegions().regions, store.id)`), caches 300s.
- **Region hub (out of scope by default):** `server/routes/compareRoute.ts` — `renderRegionIndexHtml` (523). Navigational category-link index, ~180 words. Leave it.
- **Shared honesty helpers to REUSE (do not re-implement):** `positioningDisclaimerHtml` (`server/utils/positioningDisclaimer.ts`), `AGE_NOTICE` (`server/utils/renderShellBody.ts`), `parseCity` / `regionForStore` / `Region` (`server/utils/regionModel.ts`), `socialMetaTags`, `GA_HEAD_SNIPPET`.
- **Data available on Render:** `buildApiData()` → `data.json` (18 store ids; per-store `deals`, `address`, `lat`/`lng`, `url`, `status`, `lastFetchedAt`) + committed `server/data/derived/*.json` (incl. `price-vs-own-median.json` via `readPriceVsOwnMedian`, region floors via `readRegions`). Render **never** queries the home products SQLite DB — do not introduce any read of it.

### Honesty constraints (load-bearing — these are why the pages are thin *by design*)
- LocalBusiness schema only; never Product/Offer/AggregateOffer (implies a seller/advertiser — WAC 314-55-155). See the header comment block, storeRoute.ts:22-36.
- No fabricated validity dates — "active today" framing only; deals churn hourly. `asOfDate` returns '' for unparseable OR pre-2021 seed-sentinel timestamps.
- The ONLY honest per-item discount is price-vs-own-median (Gate 2, FR13) — a SKU below its own rolling median, rendered as plain prose, never schema. A `failed`/`stale` store carries NO drops (its current price is untrustworthy); sub-1%-display movers suppressed (`renderableStoreDrops`).
- Distance is user-relative ⇒ deliberately omitted (no fixed number for a location-less crawler).
- `geo` emitted only when `lat`/`lng` are finite.
- Enrichment must be *descriptive/structural* fact prose. It must not invent, rank, or price anything. Everything it states must already be true and already on Render.

### Why word count is the wrong target
Per the investigation follow-up (High confidence): the thin surface is store pages (150–300 words) + region hubs (~180), NOT the money geo pages (rich, 100-row caps). The store page is thin because it's mostly a short deals list; the floor (`the-vault-silvana`) is a confirmed-empty store at 152 words. Adding honest evergreen prose is the right move *for citation value*; the word-count clearance is incidental. Do not chase a number — chase extractable facts.

### Testing standards
- TypeScript strict; write tests for everything (project rule).
- `server/routes/storeRoute.test.ts` (or the existing store route test) already mocks `readRegions` for determinism — follow that. Assert: (a) the empty floor store now renders the evergreen block; (b) honesty assertions (no `Offer`/`Product`/`AggregateOffer` in output; no fabricated `$`-discount phrasing beyond the existing drops; no "as of" for a seed-sentinel `lastFetchedAt`); (c) existing sections still present; (d) optional visible-word floor.
- Run the FULL server suite and the real `npm run build` (not just `tsc --noEmit`) before declaring done — the Render build is `tsc -b && vite build` and can fail where a narrow typecheck passes.

### Project Structure Notes
- New builder(s) live in `storeRoute.ts` next to `buildDirectAnswer` / `renderAreaLinksHtml` (pure, exported for tests) — consistent with the established pattern; no new module needed unless the block grows large.
- Additive only. No change to `Deal`, `Dispensary`, `data.json`, `buildApiData`, or any derived-fact schema. No route signature change.

### References
- [Source: _bmad-output/implementation-artifacts/investigations/semrush-site-audit-investigation.md] — Findings 3–6, Hypotheses 1–2, "trap to avoid", Recommended Next Steps.
- [Source: server/routes/storeRoute.ts#renderStoreHtml] — current template + honesty header.
- [Source: server/routes/compareRoute.ts:523 #renderRegionIndexHtml] — region hub (out of scope).
- [Source: ADR.md#ADR-107] — /store deepening (direct-answer lede + area links); [ADR-110] — region-category title trim (the already-shipped sibling fix); [ADR-082] — `__GMA_DATA__` (the `/` low-ratio artifact); [ADR-066] — facts-not-menus legal posture.
- [Source: server/utils/positioningDisclaimer.ts], [server/utils/regionModel.ts], [server/utils/renderShellBody.ts] — reusable helpers.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
