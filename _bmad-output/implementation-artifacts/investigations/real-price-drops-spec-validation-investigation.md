# Investigation: "Real Price Drops — Clarity & AI Visibility Fix Spec" — Claim Validation

## Hand-off Brief
An outsider spec critiques the "Real price drops" surface on three axes (unclear "usual", no freshness, invisible to
crawlers) and asks which of three methodologies (A same-store / B cross-store / C store-declared) is implemented. The
methodology is decisively **(A) same-store rolling median** (`server/utils/priceVsOwnMedian.ts`), and the code
*deliberately rejected* the weakest option (C) as dishonest — so the "Real" label is earned, not misleading. The
spec's UI-clarity and per-entry-freshness critiques are valid, but its two central AI-visibility asks are
already-half-done or actively counter-indicated: drops **are** server-rendered as crawler HTML on `/store/<id>` pages
(the outsider only saw the homepage), and the spec's flagship Fix-3 recommendation — JSON-LD Product/Offer schema —
**directly violates a ratified WAC 314-55-155 compliance decision** to never emit seller/offer schema.

## Case Info
- Status: Concluded
- Confidence: High (all claims traced to `path:line`)
- Mode: read-only validation (exploration + premise-check)
- Date: 2026-07-25

## Evidence Inventory
| Artifact | Status | Role |
|---|---|---|
| `client/src/components/ValueDropStrip.tsx` | Available | In-card render of a drop row |
| `client/src/hooks/useValueDrops.ts` | Available | Data source (`__GMA_DROPS__` snapshot / fetch) |
| `server/routes/valueRoute.ts` | Available | `/api/value/price-vs-own-median` served fact |
| `server/utils/priceVsOwnMedian.ts` | Available | The methodology (decisive) |
| `server/routes/shellRoute.ts` | Available | Homepage SSR: snapshot + crawler body |
| `server/utils/renderShellBody.ts` | Available | Homepage crawler HTML (deals only) |
| `server/routes/storeRoute.ts` | Available | `/store/<id>` SSR (drops ARE rendered) |
| `client/src/components/DealFeed.tsx` | Available | Feed-level "Last updated" indicator |

## Claim-by-claim verdict

### Methodology (spec Fix 2, A/B/C) — RESOLVED: (A), Confirmed
`priceVsOwnMedian.ts:56-68,193-197`: each SKU's current effective price vs its **own** rolling median over a 30-day
window (`ROLLING_WINDOW_DAYS = 30`, `MIN_OBSERVED_DAYS = 7`), `pctVsMedian = (current − median)/median`. Series key is
(product, option) at ONE store — "it compares one listing's price to ITSELF" (`priceVsOwnMedian.ts:20`). Not
cross-store (B); not store-declared MSRP (C).
- **Notable:** the code *explicitly and structurally rejects (C)*. `priceVsOwnMedian.ts:5-13` — the banner/promo
  discount % is "a flat store/brand promo rate with NO per-item signal" and is designed not to compile into this fact
  (decision F). So the spec's worry that "Real" might just be repeating an inflated retailer markdown is **refuted**:
  the opposite is true — the honest own-median baseline is the whole point (fix6 / Gate 2).

### Fix 1a — "usual" is undefined in the UI — Confirmed (valid gap)
`ValueDropStrip.tsx:84-90` renders `"{pct}% below its usual"` and `"{price} vs {median} usual"` with no inline
definition, no tooltip, and no section-level explainer link anywhere in the component or `DealFeed.tsx`. A user cannot
tell "usual" = this store's own 30-day median.

### Fix 1b — no freshness indicator on drops — Confirmed, with nuance
No per-entry timestamp in `ValueDropStrip.tsx`. There IS one feed-level `"Last updated {lastUpdated}"`
(`DealFeed.tsx:231,315-317`) but it reads `data.meta.lastScraperRun` — the **deal-scrape** time, not the
price-vs-own-median **derive** time (a separate home-runner pipeline that can lag). The drops envelope carries
`generatedAt` (`valueRoute.ts:32,92`) but it is never surfaced. So: drops have no honest freshness signal shown.

### Fix 1c — same-store baseline is never labelled as such — Confirmed
Card = one store; the strip drops the store name from the row by design (`ValueDropStrip.tsx:8-10,80-82`) and never
states the baseline is same-store. Valid ambiguity. **But** the spec's suggested cure — cross-store wording
"…vs $18.00 at [Other Store]" — would be **factually wrong** for this fact (it is not cross-store). Correct fix is
same-store framing, e.g. "below this store's own recent typical price".

### Fix 3 — "AI crawlers see none of it" — PARTIALLY REFUTED
- **Homepage (`/`): Confirmed true.** `shellRoute.ts:66,74` injects drops only as the `window.__GMA_DROPS__` JS
  global; the crawler-visible body `renderShellBody.ts:39-63` renders **deals only** — drops are absent from raw
  homepage HTML. A non-JS crawler sees no drops on `/`.
- **Per-store (`/store/<id>`): Refuted.** `storeRoute.ts:192-205` server-renders each store's drops as plain,
  crawler-visible prose HTML ("Products currently priced below their own recent typical price at this store…"),
  status-gated and capped at 12. The outsider evidently only inspected the homepage. A crawlable HTML surface for
  drops already exists per store (added 2026-07-24).

### Fix 3 — "add JSON-LD Product + Offer schema" — COUNTER-INDICATED (refutes the recommendation)
`storeRoute.ts:19-21,27-29`: a ratified compliance rule — **"LocalBusiness only — NEVER Product/Offer/AggregateOffer
schema"** (WAC 314-55-155, Erik 2026-07-24) — because Offer schema implies being a seller/advertiser. The drops are
therefore rendered as prose, "NEVER Offer/Product schema" by explicit decision. Implementing the spec's flagship Fix-3
structured-data ask would reverse a deliberate legal decision, not fill an oversight.

## Final Conclusion
The spec is a competent outside read but was written against the homepage only and without the compliance context.
- **Correct & actionable:** define "usual" in-UI; add a real drops-derive freshness signal; the A/B/C question
  resolves to **(A)**.
- **Correct diagnosis, wrong prescribed wording:** the same-store ambiguity is real, but the cross-store "vs $X at
  [Other Store]" fix would misstate the fact.
- **Wrong / already-done:** crawler invisibility is homepage-only (per-store pages already SSR the drops); and the
  Product/Offer JSON-LD recommendation is explicitly forbidden by a ratified WAC 314-55-155 decision.

## Fix direction (if pursued)
1. Same-store explainer + one section-level "What is a real price drop?" link (methodology A wording).
2. Surface the price-vs-own-median `generatedAt` as the drops' own freshness, distinct from the deal-scrape time.
3. If more crawler reach for drops is wanted, extend the **homepage** `renderShellBody` (prose, mirroring
   `storeRoute`) — do NOT add Offer/Product JSON-LD.

## Follow-up: 2026-07-25 (re-verification, no-assumptions pass)

Re-traced every load-bearing claim to source. All original findings hold. Two refinements:

- **Methodology (A) is airtight at BOTH boundaries.** The runner keys price series by `dispensaryId::productId`
  (`deriveFactsRun.ts:400`) and reduces each option to `effectivePrice = specialPrice ?? basePrice` —
  "Gate 2: single reduced (never the pair)" (`deriveFactsRun.ts:408`). The base/special pair (spec option C) is
  structurally discarded before the pure fn runs; the pure fn (`priceVsOwnMedian.ts`) compares a SKU only to its own
  30-day median. Same-store self-comparison, confirmed end-to-end.
- **The Offer/Product ban is TEST-ENFORCED, not just a comment (strengthens the Fix-3 counter-indication).**
  `storeRoute.test.ts:111-113,225-226` assert the served HTML does NOT contain `AggregateOffer`, `"@type":"Offer"`,
  or `"@type":"Product"`. Enumerated every `@type` emitted by the SSR routes: `/about` → Service, FAQPage,
  Organization, Audience, State, Question, Answer; `/compare` → Dataset, Organization, State, WebPage; `/store/<id>` →
  LocalBusiness, PostalAddress, State, GeoCoordinates. No Product/Offer/AggregateOffer anywhere. Implementing the
  spec's Fix-3 structured-data ask would break committed regression tests, not merely violate a comment.

Confirmed exactly:
- **Two** drop surfaces only: in-app `ValueDropStrip` (client JS, via `DealCard.tsx:224-226` — passed only
  `storeId`/`drops`/`divided`, no freshness/explainer) and the `/store/<id>` SSR prose. `/about` matched the first
  grep only on the word "usually" (`aboutRoute.ts:201`) — it renders no drops. The old standalone top-of-feed section
  (3-2) is retired.
- **`lastScraperRun` is the deal-ingest time, confirmed.** Set by `applyIngest.ts:71` (on accepted deal push) and
  `runScrapers.ts:62` — a field on the deals `data.json`, entirely separate from the drops envelope's `generatedAt`.
  So the feed's "Last updated" (`DealFeed.tsx:231`) does not describe drop freshness.
- **`/store/:slug` is registered unconditionally** (`index.ts:74`, before the SPA fallback and outside the
  `NODE_ENV==='production'` block) → reachable in dev and prod.

New useful finding (not in the original report):
- **The crawler-facing surface already EXPLAINS the baseline; the in-app human UI does not.** `storeRoute.ts:198`
  renders "Products currently priced below their **own recent typical price at this store**, based on observed price
  history" — an accurate same-store methodology sentence. The in-app `ValueDropStrip` says only "below its usual".
  So the spec's Fix 1 (in-app clarity) is the genuinely high-value item, and correct wording already exists in the
  codebase to reuse.

Verdict: original validation stands, no material correction. Confidence: High.

## Status: Concluded
