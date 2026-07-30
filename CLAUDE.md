# Happy (gmas list) — project instructions

> **Read the strategy first.** [STRATEGY.md](./STRATEGY.md) is the top of the doc stack — the one-page thesis on why the product wins and the priority between the derivation engine (the moat) and AI-search / crawler reach. Right now **reach is the binding constraint**; do not default to engine-first work.

## Doc stack (read in this order)

1. [STRATEGY.md](./STRATEGY.md) — why the product wins + the priority ruling (top of stack).
2. [GMAS_LIST_BRIEF.md](./GMAS_LIST_BRIEF.md) — binding brand / UX / legal design contract.
3. [ADR.md](./ADR.md) — canonical engineering decision ledger.

The global rules in `~/CLAUDE.md` (ADR upkeep, safety, environment checks, ask/act boundary, etc.) still apply on top of these.

## Diagnosing SEO / crawl / index / reach issues

**Before concluding anything about — or taking any action on — a crawl/index/ranking/AI-citation issue, OR acting on a third-party SEO audit (Semrush, Lighthouse, PageSpeed, an SEO checklist), you MUST follow [docs/seo-indexing-diagnostic-protocol.md](./docs/seo-indexing-diagnostic-protocol.md).**

Non-negotiable rules from that protocol:
- A third-party audit metric is a **hypothesis, not a verdict.** Confirm against the authoritative source (Google Search Console for Google; the Phase-0 citation monitor for AI engines) before acting. Grade every finding `Confirmed` / `Deduced` / `Hypothesized`; act only on `Confirmed`.
- Resolve the fork **`Discovered – not crawled` (crawl problem — page content is irrelevant, Google never fetched it) vs `Crawled – not indexed` (fetched and rejected — only here is thin/duplicate content actionable)** before choosing any remedy. Conflating these produced a real false flag (2026-07-29 "thin content" mis-read; see `investigations/semrush-site-audit-investigation.md`).
- GSC is Google-only — never infer AI-engine reach from it.
