# Epic 4 Context: Live Deal Data via Scraper

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deals shown in the app come from real dispensary websites, refreshed on a 60-minute schedule rather than seed data. Each source is scraped independently so one broken parser never poisons the feed: a failed scrape marks just that dispensary Stale and preserves its last valid deals. Every run appends an operator-readable line to `logs.json` so Erik can spot and fix broken parsers without a database. Two scraping tiers exist: plain-HTML sites use Axios + Cheerio directly in-process; Dutchie/iFrame sites (JS-rendered menus invisible to HTTP clients) route through an existing Python Playwright microservice. Completing the epic makes the app ready for R&D validation against live data.

## Stories

- Story 4.1: Scraper Engine & Orchestrator — done
- Story 4.2: Plain-HTML Dispensary Parsers — done (`remedy-tulalip`)
- Story 4.3: Dutchie/iFrame Dispensary Support — current

## Requirements & Constraints

- Every scraper exports `export default async function scrape(): Promise<Deal[]>`, **never throws**, returns `[]` on any error. The orchestrator owns all stale/storage/logging behavior — parsers only return data.
- A non-empty return updates the dispensary's `deals` and sets `stale: false`; `[]` or a throw sets `stale: true` and preserves the last valid `deals` (never overwrite with empty).
- All `data.json` writes are atomic (tmp file + `renameSync`) and serialized through the data lock. Parsers never touch the filesystem.
- Each run appends `{ runAt, results: { "<store-slug>": "ok | error: ..." } }` to `logs.json`; `logs.json` is operator-only, never served to the frontend.
- Deal classification is uniform across tiers: explicit time window → `type: "happy_hour"` with 24-hour `"HH:MM"` `startTime`/`endTime`; no window → `type: "daily"` with both `null`. `discountPct` is a `number` when parseable, else `null`.
- `daysValid` MUST use full lowercase day names (`"monday"`…`"sunday"`) or the token `"everyday"` — the consumer `filterActiveDeals.ts` silently drops anything else (abbreviations never match → invisible data loss).
- Timezone math is not the parser's job: store raw 24-hour strings; `filterActiveDeals` evaluates windows in `America/Los_Angeles`.
- All JSON fields are camelCase.

## Technical Decisions

- **Two-tier scraping (ADR-016 / ADR-017).** Plain HTML → Axios + Cheerio in the Node process. Dutchie/iFrame → a separate Python Playwright + FastAPI microservice that already exists at `C:\Users\erikc\Dev\Scraper` (port 8000, playwright-stealth, GraphQL network interception, tested against live Dutchie). Epic 4 does **not** build the Python service.
- **Dutchie scraper shape.** A Dutchie scraper file in `server/scrapers/` calls a shared `server/utils/scraperClient.ts` wrapper that POSTs to `http://localhost:8000/scrape`; the TS file transforms the raw intercepted GraphQL JSON (`intercepted[].data`) into `Deal[]`. The `scrape()` contract is identical to plain-HTML scrapers — `runScrapers.ts` is tier-agnostic. If the service is unreachable, `scraperClient.ts` returns `[]` and normal stale-handling applies (the main server must not crash).
- **Registry wiring.** `server/scrapers/index.ts` maps dispensary `id` (exactly as in `data.json`) → that store's `scrape`. An id with no entry is logged `error: no scraper registered` and marked stale.
- **Storage primitives.** `runScrapers.ts` (orchestrator), `atomicWrite.ts`, and `withDataLock` are delivered by Story 4.1 — reuse, do not reinvent. `atomicWrite` is single-writer (deterministic tmp name); the scraper run is serialized under the lock.
- **Persistence is two JSON files (ADR-014):** `data.json` (served) and `logs.json` (operator-only).

## Cross-Story Dependencies

- Story 4.3 builds on 4.1's orchestrator, registry, `_template.ts` contract, and stale/lock/log machinery — it adds only `scraperClient.ts` and per-store Dutchie transforms; no engine changes.
- Story 4.3 has an **external runtime dependency**: the Python Scraper service on port 8000 must be running for Dutchie deals to populate; its absence degrades gracefully to Stale.
- Per the 2026-06-13 live re-scope, the four seeded dispensaries split as: `remedy-tulalip` (plain HTML, 4.2) and three Dutchie sources (4.3) — `kush21-everett-evergreen`, `the-joint-everett` (Dutchie store ID `689cd028ea84b6a605458416`), `jet-cannabis-everett` (Wix→Dutchie; licensed entity "THC Connection"). Investigation HTML fixtures for the latter two already sit in `server/scrapers/__fixtures__/`.
