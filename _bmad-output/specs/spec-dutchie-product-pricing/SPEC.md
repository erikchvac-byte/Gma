---
id: SPEC-dutchie-product-pricing
companions:
  - ../../implementation-artifacts/investigations/menu-pricing-source-inventory.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Decoupled Dutchie Product / Menu Pricing Scraper

## Why

An opportunity to capture, gated by a mandate. gmaslist.com shows deals but never an actual product price — the live specials feed (`GetSpecialMenuCards`) carries only free-text percent-off. Live recon this session confirmed Dutchie's `FilteredProducts` operation exposes real per-weight prices, special prices, and pack/inventory data (verified: a 2g pre-roll 2-pack at $8, $4 on special). The goal is **not a price display** — it is a backend **price-comparison engine and a longitudinal dataset Erik owns**: normalize products to true unit economics (price per gram, price per item such as per-joint) so unlike packs compare correctly (a 3-pack vs a 5-pack are not "joints alone"), find the best deal *right now*, and track how prices move over time. This spec adds that as a **new, additive capability** that must not touch the hardened, in-production deals pipeline. Capturing whole-product pricing + quantity + inventory across 21 stores on a schedule is a materially heavier extraction than the promo feed prod runs today; that ToS/legal dimension is carried as a **non-blocking reminder** (revisit before public/commercial use), not an implementation gate.

## Capabilities

- id: CAP-1
  intent: System can fetch a store's product menu (name, category, per-weight prices, stock) from Dutchie `FilteredProducts` via a new scraper module that is separate from the specials scrape.
  success: Given a live Dutchie embed, the new module returns ≥1 `Product` with category and weight-keyed price arrays; the specials scrape's output and the existing 177 server tests are unchanged.

- id: CAP-2
  intent: Each product option carries its correct base price and, when on special, its correct discounted price, with no cross-weight mis-mapping.
  success: For a multi-option product, every option's base and special price matches the live source (e.g. Space Kush Flower: 1g $11/$5.50, 3.5g $35/$17.50); a fixture-backed test asserts `Options[i] ↔ Prices[i] ↔ recSpecialPrices[i]` alignment and that base price comes from `POSMetaData.children[]` while special price comes from positional `recSpecialPrices[]`.

- id: CAP-3
  intent: A product scrape captures the whole menu despite the empty-products race and pagination, never silently yielding a partial or empty menu.
  success: A store scrape waits for the `FilteredProducts` op, retries on an empty response (mirroring `scrapeDutchieSpecials`), and assembles products across all paginated responses; an early/empty read triggers retry rather than a silent partial result.

- id: CAP-4
  intent: Product pricing is persisted and served as a new `Product` data type, additive to the API, without altering deals.
  success: Products are reachable via a new field/endpoint; the `Deal` type, `filterActiveDeals`, and the `/api/data` deals response shape are byte-for-byte unchanged and their consumers untouched.

- id: CAP-5
  intent: Each product normalizes to comparable unit economics — price per gram and price per item (e.g. per-joint) — correctly accounting for pack count and total weight, including pack counts that appear only in the free-text `Name` (e.g. "2pk", "5-pack").
  success: A 3-pack and a 5-pack of equal total weight yield different per-item prices and correct per-gram prices; a fixture test covers a name-embedded pack count (e.g. "PR 2pk" + Options "2g" → 2 items, $/g = price/total-grams, $/item = price/2). An unparseable pack/weight is flagged, never silently treated as quantity 1.

- id: CAP-6
  intent: Each scrape appends a timestamped price observation per product/option rather than only overwriting the latest, so price changes are trackable and the dataset is exportable over time.
  success: Querying a product returns its price history across ≥2 scrape times, and a price change between two scrapes is detectable from stored data.

## Constraints

- MUST NOT modify `server/scrapers/_dutchie.ts` (`dutchieRequest` / `pickSpecials` / `transformSpecials`), the `Deal` type, `filterActiveDeals`, or the `/api/data` deals contract.
- The product capability lives in a NEW module (e.g. `server/scrapers/_dutchieProducts.ts`) issuing a SEPARATE scrape request with `wait_for_pattern=FilteredProducts`; the specials request's navigation, timing, and retry budget are left as-is.
- Reuse the existing `scraper-svc` Playwright boundary via `postScrape`/`scraperClient`; introduce no new scraping infrastructure or service.
- Base price MUST be read from the self-describing `POSMetaData.children[]`; special price MUST be read from the positional `recSpecialPrices[]` (no special price exists inside `children[]`), preserving index alignment to `Options[]`. (Verified shape + alignment: see companion investigation.)
- Pack count and per-unit weight that are NOT structured fields (pack count is often embedded in `Name`, e.g. "2pk") MUST be parsed into structured quantity to drive unit normalization; the raw `weight` field's unit is unresolved (the verified sample shows `weight:1000` for a "2g"/2-pack pre-roll — likely per-unit mg) and MUST be reconciled before per-gram math is trusted.
- Storage MUST retain historical observations (a time series), not only the latest snapshot — change-tracking and dataset export are first-class, not a snapshot view.
- The existing 177 server tests are the regression net and MUST stay green — they are the proof the specials path is unchanged.

> **Reminder (non-blocking):** Whole-product pricing + live `quantityAvailable` across the store set is a materially heavier extraction than the live promo feed, with a WAC advertiser / ToS dimension. Per Erik's decision (2026-06-24), this does **NOT** gate R&D / private-dataset implementation. Keep it on the radar to review before any **public surfacing, redistribution, or commercial use** of this data.

## Non-goals

- Any change to the specials/deals scrape, transform, filtering, or contract — that pipeline is out of scope except as the thing this work must not disturb.
- UI surfacing or redesign of product pricing (this spec is the data-capture path only; presentation is a separate effort).
- Surfacing medical or wholesale pricing — `medicalPrices`/`wholesalePrices` may be captured but rec pricing is the only launch target; no medical/wholesale display.
- A live-stock accuracy guarantee — `quantityAvailable` is captured as-scraped, not under a real-time inventory SLA.
- Implementation itself — this SPEC is the plan/contract, not the code; building is the next phase (no longer counsel-gated; see the reminder above).

## Success signal

The engine can rank, across stores, the best real value for a comparable unit — e.g. "cheapest $/joint and $/gram for pre-rolls right now" — from source-accurate normalized prices (the verified 2g/2-pack at $8 → $4 on special yields the correct per-joint and per-gram figures), AND show how that figure changed over time from stored history. Meanwhile the deals experience on gmaslist.com is provably unchanged (deals contract byte-identical, 177 server tests green).

## Assumptions

- Rec pricing is the launch target (Washington rec market; `recPrices`/`recSpecialPrices`), with medical/wholesale captured-but-not-surfaced.
- Scope is three categories per store — **Pre-Rolls, Flower, Vaporizers** — not the entire menu (Edibles, Concentrate excluded at launch). All three are weight/pack-based, so no mg-THC comparison basis is needed yet.
- Comparison normalizes to a **per-category canonical unit**: Flower and Vaporizers → $/gram; Pre-Rolls → $/gram **and** $/item (per-joint).
- History **appends a timestamped observation every scrape** (max granularity — an unchanged price is recorded too).
- Refresh runs at a LOWER frequency than the hourly deals cron (prices move slowly; payload is heavy), reusing the existing push-ingest path rather than new infra.
- Live `quantityAvailable` (stock count) is captured-but-optional; the load-bearing quantity is PACK count + weight, not store stock — lean conservative on retaining live stock pending counsel.

## Open Questions

- Time-series retention horizon and dataset-export shape: how long is history kept, and in what export format does the dataset need to come out?
