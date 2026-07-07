# Derivation Engine PRD — Addendum

Technical-how and rejected-alternative rationale that belongs downstream (architecture / substrate story), kept out of the capability-level PRD.

## Mechanism (owned by ADR-077 + the substrate story)

- **Substrate:** `products.db` (local SQLite on Erik's home machine). Schema and one-time import defined in `products-storage-sqlite-phase-1.md` (AC1–2). The derivation engine reads it via a **DB-backed reader** returning the same `ProductsFile` shape `buildMatchReport` / `buildDealScopeLinks` already consume — so the pure fact-functions stay byte-identical (that's what makes the parity test meaningful).
- **Runner transport:** `scripts/derive-facts-local.ps1` mirrors `scripts/scrape-weedmaps-local.ps1` — detached worktree, hard-reset to origin/master, run `server/scripts/deriveFactsRun.ts`, commit-back only `server/data/derived/*.json` with `[skip ci]`, push master → Render auto-deploys.
- **Time-range queries (FR6/FR13):** the `observation` table's `(product_key, observedAt)` key + `observedAt` / `(dispensaryId, observedAt)` indices provide per-store per-day presence and the range scans the trend facts need. Designed into the substrate story now (coupling note #1).

## Rejected alternatives

- **Live compute on Render (status quo, `buildMatchReport(readProducts())` per request).** Rejected: the raw file hits the git file-size wall (~Jul 23 warning) and risks per-request OOM on the 512 MB free instance. Superseded by ADR-077.
- **Paid Docker self-host (ADR-033).** Parked. This engine is explicitly the **$0 local** path; NFR3 forbids new paid infra.
- **Serving a bounded `/api/products` snapshot instead of dropping it.** Considered (option B in the open decision); rejected because there is no known consumer and keeping any raw-product read on Render erodes the "derived facts only" spine. Re-add a bounded derived view only if a real consumer appears.
- **Intraday freshness for disparities.** Considered; rejected for uniform daily to keep one derivation run and avoid re-introducing request-time compute.

## Downstream consumers (Epic 3, out of scope here)

- **AI-search / SEO surfacing** (ai-strategy Goal 2, S1–S5): derived facts become `AggregateOffer` / `Dataset`-schema comparison pages — the "compute don't copy" information-gain moat. Legal-cleared (ADR-066), data-gated on FR13 accrual.
- **In-app value surfaces:** cheapest-delivered (FR14), disparity cards (FR11), "on sale vs its own history" (FR13).
