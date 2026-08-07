# Addendum — Backlink Measure-and-Surface Tooling

Downstream (architecture / solution-design / dev) depth that does not belong in the capability-level PRD. Not authoritative for scope; the PRD is.

## Mechanism / transport decisions (volunteered during Discovery)

- **Citation-share tracker** extends the existing `server/scripts/citationMonitor.ts` output rather than adding new engine calls. It consumes the monitor's per-run "who was cited" data and appends a time series. Confirm the monitor's current output shape at build time.
- **Output pattern** mirrors the citation monitor exactly: local-only `server/scripts/*.ts` scripts that write `server/data/derived/*.json` (machine record) plus a `.md` human summary. Nothing runs inside the deployed server. Any new `server/data/derived/*.json` must be appended to `$derivedFiles` in `derive-facts-local.ps1` or it never republishes (existing repo gotcha).
- **Scheduling:** the citation-share tracker + unlinked-mention finder attach to the existing weekly citation-monitor Scheduled Task (Mon 05:00). Registering/altering Scheduled Tasks needs Erik's explicit per-action go-ahead (existing repo rule) — do not wire it silently.
- **Search stack:** opportunity finder + unlinked-mention finder reuse the citation monitor's Haiku + `web_search` path; Perplexity Sonar is available as a second engine. No paid search/backlink API in v1.
- **GSC input:** GSC Links is browser-only/manual (the Chrome-extension read path has been blocked before). Assume a manual weekly export dropped into a known local path is the tracker/mention-finder's GSC input (Open Q4).
- **Fact packager** reads the already-derived JSON (`price-vs-own-median.json`, `regional-price-floor.json`, cross-store spread / `disparities.json`) served on SSR `/compare/*` + `/store/*`. It re-renders; it never re-computes.

## Deferred / phase-2 (rejected-for-now alternatives)

- **Paid backlink/SEO API** (Ahrefs/Semrush/free-tier equivalent) for referring-domain graphs and new/lost-link feeds — deferred (§6.2, Open Q1). Would most help the unlinked-mention finder and a future "referring domains over time" view GSC Links can't fully provide.
- **HTML dashboard** aggregating the four reports — deferred; markdown summaries suffice for a single operator.
- **Scheduling the opportunity finder + fact packager** — deliberately on-demand.

## Provenance

- Primary input: `backlink-tooling-brief.md` (the detached-safe brief; sole surviving copy currently in the `Happy Hunter Seeker` folder).
- Related repo context (per the brief's provenance list): `STRATEGY.md`, `GMAS_LIST_BRIEF.md`, `docs/seo-indexing-diagnostic-protocol.md`, `investigations/phase0-citation-monitor-0of8-investigation.md`, and the in-repo `investigations/backlink-brief-portability-investigation.md`.
