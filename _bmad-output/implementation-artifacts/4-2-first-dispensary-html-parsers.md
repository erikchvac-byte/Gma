---
baseline_commit: 260d975
context: []
---

# Story 4.2: Plain-HTML Dispensary Parsers

Status: review (re-scoped 2026-06-13 to plain-HTML sources only = `remedy-tulalip`; The Joint + Jet + Kush21 → Story 4.3)

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cannabis deal seeker**,
I want deal data to come from real dispensary websites (plain HTML sources),
So that the deals shown in the feed are live and verified against the actual source.

## Acceptance Criteria

1. **Given** the initial R&D dispensary set (seeded in Story 1.2), **When** `runScrapers()` executes, **Then** every plain-HTML dispensary in the seed has a working scraper in `server/scrapers/<store-slug>.ts` that fetches and parses real deals from its live site. As of 2026-06-13 that is exactly one source: `remedy-tulalip`. (The Joint, Jet, and Kush21 are all Dutchie → Story 4.3. The count is intentionally open — adding a future plain-HTML seed entry is a new additive increment, not a reopening of this story. Scope resolved — see Open Questions / Risks #1.)
2. **Given** a parsed deal with an explicit time window, **When** stored in `data.json`, **Then** its `type` is `"happy_hour"`, and `startTime` / `endTime` are 24-hour strings (e.g., `"09:00"`, `"22:00"`) — never 12-hour format (`"9am"`).
3. **Given** a parsed deal with no time window, **When** stored in `data.json`, **Then** its `type` is `"daily"`, and `startTime` / `endTime` are both `null`.
4. **Given** a parsed deal, **When** stored, **Then** `discountPct` is a `number` if parseable from the deal text, or `null` if not. (Note: the `Deal` type currently declares `discountPct: number` — see **Open Questions / Risks** #2; this story needs `number | null`.)
5. **Given** a scraper file, **When** inspected, **Then** it lives at `server/scrapers/<store-slug>.ts`, uses Axios + Cheerio for HTML parsing, follows the `_template.ts` contract (`export default async function scrape(): Promise<Deal[]>`, never throws, returns `[]` on any error), and is registered in `server/scrapers/index.ts` keyed by the dispensary's `id`.
6. **Given** a dispensary site changes its HTML structure, **When** the parser fails (selector misses / network error / unparseable page), **Then** the scraper returns `[]` and `runScrapers()` marks the source `stale: true` without overwriting the last valid `deals` (this is already enforced by Story 4.1's orchestrator — do not re-implement stale logic in the parser).

## Tasks / Subtasks

- [x] Task 1: In-scope dispensaries (AC: 1) — RESOLVED, one plain-HTML source
  - [x] Live HTML investigation (2026-06-13): only `remedy-tulalip` (`/promos/`) is plain-HTML scrapeable; `the-joint-everett`, `jet-cannabis-everett`, `kush21-everett-evergreen` are all Dutchie → Story 4.3 (see Dev Agent Record / Debug Log).
- [x] Task 2: Build the Remedy Tulalip parser as a testable pure function (AC: 2, 3, 4, 5)
  - [x] Created `server/scrapers/remedy-tulalip.ts` exporting `export default async function scrape(): Promise<Deal[]>`.
  - [x] Factored parsing into a pure exported `parse(html: string): Deal[]`; `scrape()` does only `axios.get('https://remedytulalip.com/promos/', { timeout: 15000, User-Agent })` → `parse(data)`, in try/catch returning `[]`.
  - [x] Maps `/promos/` `el-item` cards → `Deal`: day-named cards → `daily` with weekday `daysValid`; the 7–8am card → `happy_hour` `07:00`–`08:00` `['everyday']`; group-discount card → `daily` `['everyday']`. `discountPct` from leading "NN% Off" (number, else `null`). `daysValid` uses full lowercase names / `'everyday'`. Verified: parses exactly 9 deals from the live fixture.
- [x] Task 3: Register the parser (AC: 5)
  - [x] Added `'remedy-tulalip': remedyTulalipScrape` to `server/scrapers/index.ts`, keyed as in `data.json`.
- [x] Task 4: Resolve the `discountPct` type (AC: 4)
  - [x] Changed `discountPct` to `number | null` in `client/src/types/index.ts`; handled null in `DealCard.tsx` (gas cost alone / line omitted, never "null% off") and `sortDeals.ts` (null sorts last among dailies). `tsc` clean in client + server.
- [x] Task 5: Tests, co-located (AC: 2, 3, 4, 5, 6)
  - [x] `server/scrapers/remedy-tulalip.test.ts` asserts `parse(fixture)` against `__fixtures__/remedy-tulalip.html`: happy_hour 07:00–08:00, daily/null windows, all 7 weekdays, numeric `discountPct`, full-name `daysValid`, and empty/malformed/deal-free HTML → `[]` (AC6). Added 2 `DealCard.test.tsx` cases for the null-discount render branches. Fixtures only — no live calls in tests.
- [x] Task 6: End-to-end sanity (AC: 1, 6)
  - [x] Ran a real scrape into a temp copy of `data.json`/`logs.json` (live Remedy fetch): `remedy-tulalip` → `stale: false`, 9 deals, `ok`; the three Dutchie stores → `stale: true`, `error: no scraper registered`; `meta.lastScraperRun` updated. Committed seed untouched.

## Dev Notes

### 🚨 CRITICAL: `daysValid` must use full lowercase day names or `'everyday'`

`server/utils/filterActiveDeals.ts` is the consumer of every scraped deal. It matches `daysValid` against **full lowercase day names** — `'sunday'`, `'monday'`, `'tuesday'`, `'wednesday'`, `'thursday'`, `'friday'`, `'saturday'` — or the special token `'everyday'` (see `filterActiveDeals.ts:3` and `:12`). A parser that emits 3-letter abbreviations (`'mon'`, `'fri'`) will produce deals that **silently never match** and never appear in the feed — a invisible data-loss bug. Always emit full names or `'everyday'`. (Note: Story 4.1's test fixtures used `['mon',...]`, but those tests never exercise `filterActiveDeals`, so the mismatch was never caught — do not copy that abbreviation style.)

### Deal classification rules (AC2/AC3/AC4)

`Deal` shape (`client/src/types/index.ts`):
```ts
interface Deal {
  type: 'happy_hour' | 'daily'
  description: string
  discountPct: number          // story needs number | null — see Open Questions #2
  startTime: string | null     // "HH:MM" 24-hour, or null
  endTime: string | null       // "HH:MM" 24-hour, or null
  daysValid: string[]          // full lowercase day names or ['everyday']
}
```
- **Explicit time window present** → `type: 'happy_hour'`, `startTime`/`endTime` as 24-hour `"HH:MM"`. Convert any 12-hour source text (`"9am"`, `"4:20pm"`) to 24-hour (`"09:00"`, `"16:20"`). Architecture mandate: never store 12-hour format in `data.json` (architecture.md:379–380).
- **No time window** → `type: 'daily'`, `startTime: null`, `endTime: null`.
- `discountPct`: parse a number from text when present (e.g. "20% off" → `20`); otherwise `null`. Do not guess.
- **Pacific Time is NOT the parser's job.** Parsers store raw 24-hour strings; `filterActiveDeals` evaluates active windows in `America/Los_Angeles` (set via `process.env.TZ` in `server/index.ts:1`). Do not apply timezone math in the parser.

### Scraper file contract (AC5) — reuse `_template.ts`, do not reinvent

`server/scrapers/_template.ts` (from Story 4.1) is the copy-paste starting point. The binding contract (architecture.md:413–420, AC of Story 4.1):
```ts
export default async function scrape(): Promise<Deal[]>
// Returns [] on any error. NEVER throws. Caller (runScrapers) handles stale marking.
// Plain HTML: use Axios + Cheerio directly.
```
Recommended structure (splits I/O from parsing for testability):
```ts
import axios from 'axios'
import * as cheerio from 'cheerio'
import type { Deal } from '../../client/src/types/index.js'

const URL = 'https://thejointllc.com/pot-store-daily-specials/'

export function parse(html: string): Deal[] {
  const $ = cheerio.load(html)
  // ...select, map to Deal[], classify happy_hour/daily, 24h times, discountPct, daysValid...
  return deals
}

export default async function scrape(): Promise<Deal[]> {
  try {
    const { data } = await axios.get(URL, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GmaHelper/1.0)' },
    })
    return parse(data)
  } catch {
    return []  // runScrapers marks the source stale
  }
}
```
- Use `import type { Deal } from '../../client/src/types/index.js'` (the `.js` ESM extension, NodeNext) — match the import style already in `server/scrapers/_template.ts` and `runScrapers.ts`. (Architecture's template snippet writes `'../types'`; the real codebase imports `Deal` from `client/src/types/index.js` — follow the codebase, not the snippet.)
- Set an `axios.get` `timeout` (≈15s) and a `User-Agent` header — many sites 403 a default Node/axios agent, and an unbounded request could stall a scrape run.

### Registry registration (AC5) — the wiring that actually runs your parser

`server/scrapers/index.ts` is a static map from dispensary `id` → that dispensary's default `scrape`. Story 4.1 shipped it empty; this story fills it. `runScrapers` looks up `registry[dispensary.id]` (`runScrapers.ts:24`); an id with no entry is logged `'error: no scraper registered'` and marked stale. So the `id` key MUST match `server/data/data.json` exactly:
```ts
import theJointEverettScrape from './the-joint-everett.js'
import jetCannabisScrape from './jet-cannabis-everett.js'

export const scrapers: Record<string, () => Promise<Deal[]>> = {
  'the-joint-everett': theJointEverettScrape,
  'jet-cannabis-everett': jetCannabisScrape,
}
```

### What Story 4.1 already gives you — do NOT re-implement

- **Storage / stale logic / logging**: `runScrapers.ts` reads `data.json`, calls each registered `scrape()`, applies AC2/AC3 semantics (non-empty → `stale:false` + update `deals`/`lastFetchedAt`; `[]`/throw → `stale:true`, preserve last valid), writes `data.json` + appends `logs.json`, all under `withDataLock`. Your parser only returns `Deal[]`. (Story 4.1 even hardened the run so a parser that throws or returns a non-array degrades to stale for just that source — but honor the contract anyway: never throw, always return an array.)
- **Atomic writes**: handled by `atomicWrite.ts` inside `runScrapers`. Parsers never touch the filesystem.

### Dispensary classification (live research, 2026-06-13)

| id | Site | Source type | Deals path | 4.2? |
|---|---|---|---|---|
| `the-joint-everett` | thejointllc.com | Plain HTML | `/pot-store-daily-specials/` | ✅ build |
| `jet-cannabis-everett` | jetcannabisco.com | Plain HTML | `/daily-deals` | ✅ build |
| `remedy-tulalip` | remedytulalip.com | Plain HTML — `/promos/` page (confirmed: per-day specials + a 7–8am window deal + everyday discounts, all as page text) | `/promos/` | ✅ build |
| `kush21-everett-evergreen` | kush21.com | Dutchie (`everettshop.kush21.com`) | n/a | ❌ Story 4.3 |

`remedy-tulalip` `/promos/` carries rich structured data: day-named daily specials (e.g. "Munchie Monday — 15% Off Edibles + Drinks" → `daily`, `daysValid: ['monday']`), a "20% Off Everyday 7–8am" deal (→ `happy_hour`, `startTime: '07:00'`, `endTime: '08:00'`, `daysValid: ['everyday']`), and everyday loyalty/veteran discounts. Good `happy_hour`-vs-`daily` coverage for tests. Re-confirm each site is still plain HTML before building — if a "specials" section has gone JS-rendered/empty in the raw HTML, that source is Dutchie-class and belongs in 4.3.

### Libraries (already installed — no install needed)

- `axios@1.17.0`, `cheerio@1.2.0` (confirmed in `server/node_modules`; declared `^1.0.0` in `server/package.json`). ESM: `import * as cheerio from 'cheerio'`, `import axios from 'axios'`. Cheerio 1.x API: `cheerio.load(html)` → `$`, then jQuery-style selectors (`$('.deal').each(...)`, `.text()`, `.attr()`).

### Testing (co-located, fixture-based — architecture.md:432)

- Capture each site's real specials HTML once into `server/scrapers/__fixtures__/<store-slug>.html`; assert `parse(fixture)` output in `server/scrapers/<store-slug>.test.ts`. Vitest is the runner (`server/package.json` → `"test": "vitest"`); follow the existing `runScrapers.test.ts` / `dataStore.test.ts` style.
- Cover per parser: happy_hour with 24-hour window, daily with nulls, `discountPct` number AND null cases, full-name `daysValid`, and empty/malformed HTML → `[]` (AC6).
- Keep tests offline (no live `axios.get`) — fixtures make them deterministic and CI-safe.

### Project Structure Notes

Adds: `server/scrapers/the-joint-everett.ts`, `server/scrapers/jet-cannabis-everett.ts` (+ any verified `remedy-tulalip.ts`), their `*.test.ts`, and `server/scrapers/__fixtures__/*.html`.
Modifies: `server/scrapers/index.ts` (register parsers); possibly `client/src/types/index.ts` (`discountPct: number | null`).
Naming: `kebab-case.ts` matching the store slug / dispensary `id` (architecture.md:321, :347).

### References

- Epics: Story 4.2 ACs (`_bmad-output/planning-artifacts/epics.md:589–620`), FR-9/FR-10 (`:99–100`), Epic 4 summary (`:543–545`)
- Architecture: Scraper File Contract (`architecture.md:413–420`), Scraper Template (`:568–584`), Deal time fields 24-hour rule (`:379–380`), camelCase/never-throw enforcement (`:426–438`), scrapers naming (`:321`, `:347`), data.json schema (`:170–205`)
- Story 4.1 (`_bmad-output/implementation-artifacts/4-1-scraper-engine-and-orchestrator.md`) — orchestrator/registry/stale semantics this story plugs into; `_template.ts` contract; `withDataLock`
- Code to read before implementing: `server/utils/filterActiveDeals.ts` (the `daysValid` + 24-hour-time consumer — the daysValid contract above comes from here), `server/utils/runScrapers.ts` (registry lookup + stale handling), `server/scrapers/_template.ts` (contract), `server/data/data.json` (dispensary `id`s to key the registry), `client/src/types/index.ts` (`Deal` shape)
- ADR-016 (Axios+Cheerio scraper contract), ADR-010 (single Node process), ADR-014 (data.json/logs.json + atomic writes)

## Open Questions / Risks

1. **"At least four plain HTML scrapers" vs reality — RESOLVED 2026-06-13 (Erik approved).** Live inspection found three of the four seeded dispensaries are plain HTML (`the-joint-everett`, `jet-cannabis-everett`, `remedy-tulalip`) and one is Dutchie (`kush21-everett-evergreen`). Resolution: Story 4.2 covers the three plain-HTML sources; Story 4.3 covers Kush21 via the Dutchie path; the epic's "four live sources" milestone is met across 4.2 + 4.3. No new dispensaries seeded (no scope expansion). The epic AC (`epics.md` Story 4.2) was updated to match.
2. **`Deal.discountPct` type is `number`, AC4 requires `number | null`.** `client/src/types/index.ts` declares `discountPct: number`. AC4 needs `null` when a discount isn't parseable. Changing to `number | null` may ripple to consumers (deal-card rendering, gas-cost calc). Verify with `tsc --noEmit` in client and server and handle the `null` case in any consumer. Confirm the type change with Erik if it touches rendered UI.
3. **Dynamic/JS-rendered specials.** If a "plain HTML" site actually injects its specials via JS (empty in the raw `axios.get` response), it cannot be scraped with Axios+Cheerio and is effectively Dutchie-class (Story 4.3). Verify the raw HTML actually contains the deal text before committing to a parser.

## Change Log

- 2026-06-13: Started dev-story; completed Task 1 (live-source verification) and **paused**. Investigation found only `remedy-tulalip` is plain-HTML scrapeable; `the-joint-everett` and `jet-cannabis-everett` both serve menus via Dutchie (→ Story 4.3), joining `kush21-everett-evergreen`. Story needs a re-scope decision before parser work proceeds. See Dev Agent Record / Debug Log.
- 2026-06-13: Erik approved re-scope (plain-HTML only; open count). Updated epic + story specs. Built and registered the `remedy-tulalip` parser (9 deals, happy_hour + daily classification), resolved `discountPct: number | null` across the type + consumers, added parser and DealCard tests, and verified end-to-end against the live site. Server 53 / client 192 tests pass, `tsc` clean. Status → review.

## Dev Agent Record

### Agent Model Used

### Debug Log References

**2026-06-13 — Live-source investigation (dev-story paused after Task 1).** Captured the real deal-page HTML for all three "plain-HTML" candidates and inspected the raw markup (fixtures under `server/scrapers/__fixtures__/`). Findings overturned the homepage-nav-based classification:

| Dispensary | Deal page | Raw-HTML reality | Verdict |
|---|---|---|---|
| `remedy-tulalip` | `/promos/` | 9 fully structured deals in static `el-item` markup (7 day-named dailies + a 7–8am happy hour + a group discount) | ✅ Genuine plain-HTML — buildable in 4.2 |
| `the-joint-everett` | `/pot-store-daily-specials/` → `/everett-cannabis-menu/` | Specials page is a store-selector/loyalty signup (zero deal text). Menu page embeds **Dutchie**: `dutchie.com/api/v2/embedded-menu/689cd028ea84b6a605458416.js` | ❌ Dutchie → Story 4.3 |
| `jet-cannabis-everett` | `/daily-deals`, `/menu-420` | Wix marketing page ("50% off" copy only); menu is a Wix HTML-component iframe (`filesusr.com`) loading **Dutchie** at runtime. Corroborated by `dutchie.com/dispensary/thc-connection` (Jet's licensed entity "THC Connection"); direct Dutchie fetch returns 403 (anti-bot, as expected for the 4.3 headless path) | ❌ Dutchie → Story 4.3 |

**Conclusion:** Of the four seeded dispensaries, only `remedy-tulalip` is plain-HTML scrapeable. The other three (`kush21-everett-evergreen`, `the-joint-everett`, `jet-cannabis-everett`) are all **Dutchie** → Story 4.3 (Python Scraper microservice per AR-4 / ADR). This is a re-scope of Story 4.2 (from "≥4 plain-HTML parsers" to effectively one) and a decision for Erik before any parser is written — **paused pending that decision**. No parser code written; no `discountPct` type change made.

**Artifacts left in tree (pending Erik's direction, not yet committed):** `server/scrapers/__fixtures__/*.html` (5 captured pages) and scratch scripts `server/_capture.mjs`, `server/_capture2.mjs`. Remove or keep per the chosen path.

### Completion Notes List

- Re-scoped Story 4.2 to plain-HTML sources only after live investigation: `remedy-tulalip` is the lone plain-HTML seed source; the other three are Dutchie → Story 4.3. Updated epic + story specs and the 4.3 scope note accordingly.
- Built `server/scrapers/remedy-tulalip.ts` as `parse(html)` (pure, unit-tested) + `scrape()` (axios w/ 15s timeout + User-Agent, returns `[]` on any error). Parses Remedy's `/promos/` `el-item` cards into 9 deals: 7 weekday dailies, one 7–8am `happy_hour` (07:00–08:00), one everyday group discount. `daysValid` uses full lowercase day names / `'everyday'` (the vocabulary `filterActiveDeals` requires).
- Registered it in `server/scrapers/index.ts`.
- Resolved AC4's `discountPct: number | null`: updated the shared `Deal` type and both consumers (`DealCard.tsx` null-discount render branches; `sortDeals.ts` null-sorts-last). Remedy yields no nulls, but the type/consumers now support it.
- Tests: 7 parser tests (incl. AC6 empty/malformed → `[]`) + 2 new DealCard null-discount tests. Server 53 pass, client 192 pass, `tsc` clean both sides.
- E2E: live scrape into a temp data/logs copy → Remedy `stale:false` (9 deals, `ok`); Dutchie trio `stale:true` (`no scraper registered`). Committed seed not mutated.
- **Cleanup pending Erik's OK (safety rule — won't delete unprompted):** scratch scripts `server/_capture.mjs`, `server/_capture2.mjs`, `server/_probe.mjs`, `server/_e2e.mjs`. The four investigation fixtures (`the-joint-everett.html`, `jet-cannabis-everett.html`, `joint-everett-menu.html`, `jet-menu-420.html`) are useful 4.3 evidence — recommend keeping (or moving under a 4.3 fixtures dir).

### File List

- `server/scrapers/remedy-tulalip.ts` (new — parser)
- `server/scrapers/remedy-tulalip.test.ts` (new — parser tests)
- `server/scrapers/index.ts` (modified — registered remedy-tulalip)
- `server/scrapers/__fixtures__/remedy-tulalip.html` (new — test fixture)
- `client/src/types/index.ts` (modified — `discountPct: number | null`)
- `client/src/components/DealCard.tsx` (modified — null-discount render handling)
- `client/src/components/DealCard.test.tsx` (modified — 2 null-discount tests)
- `client/src/utils/sortDeals.ts` (modified — null discount sorts last)
- `server/scrapers/__fixtures__/the-joint-everett.html` (new — investigation evidence, 4.3)
- `server/scrapers/__fixtures__/jet-cannabis-everett.html` (new — investigation evidence, 4.3)
- `server/scrapers/__fixtures__/joint-everett-menu.html` (new — shows Dutchie embed, 4.3)
- `server/scrapers/__fixtures__/jet-menu-420.html` (new — investigation evidence, 4.3)
- `server/_capture.mjs`, `server/_capture2.mjs`, `server/_probe.mjs`, `server/_e2e.mjs` (scratch — pending removal approval)
</content>
</invoke>
