---
id: SPEC-stale-deal-expiry
companions: []
sources:
  - _bmad-output/implementation-artifacts/investigations/dutchie-special-card-field-capture-2026-07-02.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Stale deal expiry — stop showing deals a store has taken down

## Why

We keep a store's last-known-good deals and re-serve them after an empty/failed scrape (ADR-026). That resilience is correct for a brief hiccup — one flaky scrape should never blank a store. But it has **no upper bound**, so a store that genuinely *ends* a promotion keeps showing its old deals forever, flagged `stale` but still rendered as active.

Live example (investigation 2026-07-02): **Happy Time - Mount Vernon** displays a **"JUNE 2026 SUMMER SALE"** on July 2. Its last successful (non-empty) scrape was **2026-07-01 03:33**; a residential-IP diagnostic re-scraped it 5× and confirmed it now serves **zero** specials — the retailer took the sale down. `the-joint-everett` is in the same state. A shopper can act on — or drive to — a deal that no longer exists. That is a direct **Honest Math** violation (ADR-007/009): we are presenting as current something we have positive evidence is gone.

The fix is a **time bound** on last-known-good: after a store has gone long enough without a fresh successful scrape, treat its cached deals as expired rather than active.

## Capabilities

- id: CAP-1
  intent: A store whose most recent successful (non-empty) ingest is older than a defined expiry threshold has its cached deals treated as EXPIRED — they are not presented as active/current deals in the feed.
  success: Given a dispensary with `lastFetchedAt` older than THRESHOLD relative to now (i.e. no non-empty scrape within the window), its deals do not render as active deal blocks on the card. A store whose `lastFetchedAt` is within THRESHOLD is unaffected and renders its deals exactly as today. The boundary is derived from `lastFetchedAt` (the timestamp applyIngest/runScrapers refresh only on a non-empty scrape), NOT from the `stale` boolean alone — a store scraping fine with an unchanged menu keeps a fresh `lastFetchedAt` and must never expire. Unit tests cover: just-inside-threshold (kept), just-outside (expired), and never-ingested.

- id: CAP-2
  intent: An expired store still appears in the feed honestly — it is not silently dropped — showing that it has no current deals while preserving its identity and trip info (name, address, distance, link).
  success: An expired store renders its card with a clear "No current deals" state and keeps its header (name, address, distance pill, store link) in place — same card position, no re-sorting. It does not show a discount badge, a deal title, or an "active today" status for the expired deals. [RESOLVED D2 = relabel in place (option a). Expired stores are NOT segmented or sorted lower.]

- id: CAP-3
  intent: The expiry threshold is a single named constant, documented and easy to tune, distinct from the existing freshness/alert windows.
  success: One exported constant `DEAL_EXPIRY_MS` governs CAP-1, set to **24h** (`24 * 60 * 60 * 1000`) with a comment stating its value and rationale. It is independent of the `storeStatus` freshness window and the `alertGate` persistent-stale window (which stay as-is); changing it moves only the display-expiry boundary.

## Constraints

- **Do NOT weaken ADR-026 last-known-good.** The cached deals stay in `data.json`; this is a *presentation* bound, not a data deletion. A store that recovers (a later non-empty scrape refreshes `lastFetchedAt`) immediately shows its deals again with no manual step.
- **Derive from `lastFetchedAt`, server-authoritative and Honest-Math clean.** Reuse the existing `storeStatus`/`lastFetchedAt` machinery rather than inventing a parallel signal. The existing `ok|stale|failed` status and its freshness window are NOT redefined by this spec.
- The threshold must be **materially longer than a scrape hiccup** — a single failed hourly run (or a few) must not expire a store. [RESOLVED D1 = 24h.]
- Trip/identity info (name, address, `distanceMiles`, store `url`) is unaffected — an expired store is still a real place a shopper might value knowing about.
- No change to scraping, ingest validation, `normalizeDeals`, or the `sanitizeDescription` chokepoint.

## Non-goals

- Not deleting or pruning cached deals from `data.json`, and not changing when `applyIngest` refreshes `lastFetchedAt`.
- Not changing the `alertGate` alerting thresholds or the `storeStatus` freshness window (this is a display concern, not an ops-alert concern).
- Not detecting per-deal expiry from provider validity stamps (`startStamp`/`endStamp`). That is a separate, finer-grained capability; this spec bounds staleness at the STORE level using data we already persist. (Noted for a future spec.)
- Not hiding stores that simply have zero deals for a benign reason unrelated to staleness beyond what CAP-2 defines.

## Success signal

On the live feed, a store that has stopped running deals no longer advertises an expired promotion. Happy Time - Mount Vernon shows "no current deals" (not a June sale in July), while every store with a fresh scrape is unchanged. A store that resumes deals reappears automatically on its next successful scrape.

## Assumptions

- **[RESOLVED D1 = 24h]** `DEAL_EXPIRY_MS = 24h`. Reference points: `applyIngest` refreshes `lastFetchedAt` hourly on any non-empty scrape; `alertGate` already treats >6h as persistent-stale. A full day with no successful non-empty scrape ⇒ the deals are almost certainly gone. Tunable later via the single constant if we want to be more conservative (e.g. 48h).
- **[RESOLVED D2 = relabel in place (option a)]** An expired store keeps its card in the same feed position, with its deals replaced by a "No current deals" line and header/trip info (name, address, distance, link) preserved. Expired stores are NOT segmented or sorted lower (option b declined) and NOT hidden (option c declined).
- The `stale` boolean remains the ingest-empty/rejected flag (ADR-026); this spec reads `lastFetchedAt` for the time bound, so the two signals stay distinct and neither is repurposed.

## Review checklist (for Erik)

- [x] D1: expiry threshold = **24h**.
- [x] D2: expired-store presentation = **relabel in place** (same position, no segmenting/hiding).
- [x] Expired stores KEEP showing name/address/distance/link.
- [x] Scope stays STORE-level (per-deal `startStamp`/`endStamp` expiry deferred to a later spec).
