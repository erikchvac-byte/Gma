# Live Pass Findings — 2026-06-13

Service: Python Scraper on `:8000` (live, healthy). Live scrapes succeeded against all three stores. Captured by the dev-story live pass.

## CAP-1 — Service path: ✅ PROVEN
- `GET /health` → `{"status":"ok"}`.
- Live `/scrape` of `the-joint-everett` (`689cd028ea84b6a605458416`): `success:true`, `browser+stealth`, ~5.7s, 8 intercepted GraphQL ops incl. `GetSpecialMenuCards`.
- Note: live ops are served from **`dutchie.com/api-4/graphql`** (and `/graphql`), not just `dutchie.com/graphql`. The existing intercept pattern `dutchie\.com.*(graphql|api-0)` still matches; `pickSpecials`'s `GetSpecialMenuCards` URL test still matches. ✔

## CAP-2 — Embed store IDs: ✅ RESOLVED (both)
| Store | Resolved STORE_ID | Canonical id | Notes |
|-------|-------------------|--------------|-------|
| `jet-cannabis-everett` | `thc-connection` | `JXHb4Chub3or38k4n` | "Jet Cannabis", 13224 Evergreen Way, Everett. Slug works on standard `dutchie.com/embedded-menu/`. |
| `kush21-everett-evergreen` | `kush21-everett` | `E8KjW8WozhMFiMan9` | Serves a custom Dutchie-Plus domain (`everettshop.kush21.com`), BUT `dutchie.com/embedded-menu/kush21-everett` also works on the standard domain and returns all specials — so the existing `dutchieRequest` preset suffices; no custom-domain handling needed. |
| `the-joint-everett` | `689cd028ea84b6a605458416` | (same) | Already committed; confirmed still valid (1 special). |

## CAP-3 — Fixture vs. live shape: ❌ MATERIAL DELTA → BLOCKED (surface-and-stop)

The synthesized fixture and `_dutchie.ts` assumptions are **wrong on every field**. The current transform returns `[]` for all three stores → **the Dutchie integration is 100% non-functional against live data** (every store would be marked stale).

### JSON path
| | Assumed (fixture) | Live (real) |
|---|---|---|
| Operation field | `data.specialMenuCards` | `data.getSpecialMenuCards` |
| Array | `.specials` | `.menuCards` |
| Full path | `data.specialMenuCards.specials` | `data.getSpecialMenuCards.menuCards` |

`pickSpecials` reads the assumed path → finds nothing → `[]`.

### Card fields
| Concept | Assumed field | Live reality |
|---|---|---|
| Title | `title` / `name` | `menuDisplayName` (e.g. `"40% OFF Your Entire Order!"`) |
| Long copy | — | `menuDisplayDescription` (e.g. `"20% OFF ALL ONLINE ORDERS"`; often `""`) |
| Discount % | `discountPercent` (number) | **No numeric field.** Percent is free text, in `menuDisplayName` OR `menuDisplayDescription`. Whole-number percent confirmed (no `0.2` fraction risk). |
| Days | `days: string[]` | **No structured field.** Day restriction is free text in the name (kush21: `"50% off Storewide - Monday & Friday"`). `recurringSchedule` was `null` in every card sampled. |
| Time window | `window: {start,end}` | **Not present.** Time-of-day windows would presumably live in `recurringSchedule`, but it was `null` in all 11 sampled cards — **no live timed special exists right now**, so the `happy_hour` path is unverifiable against live data. |
| Type | — | `specialType: "sale"` (all sampled). Also: `startStamp`/`endStamp` (calendar validity, null), `displayRank`, `applicableCategories`, `isBundledDiscount`, `isRestricted`. |

### Real samples
- the-joint (1): `menuDisplayName:"Join the Joint: Savings for Everyone!"`, `menuDisplayDescription:"20% OFF ALL ONLINE ORDERS"` → percent is in the **description**.
- jet (2): `"40% OFF Your Entire Order!"`, `"50% OFF Bondi Flower"` → percent in the **name**; descriptions empty.
- kush21 (5): `"50% off Select Brands"`, `"50% off Storewide - Monday & Friday"`, `"50% off Ounces"`, `"40% off Storewide"`, `"50% off Storewide"` → percent in the name; **day restriction in free text**; descriptions empty.

## Proposed rework (NOT applied — awaiting Erik per frozen boundary)

`server/scrapers/_dutchie.ts`:
1. `pickSpecials`: path → `data.getSpecialMenuCards.menuCards`.
2. Card interface → `{ menuDisplayName?, menuDisplayDescription?, specialType?, recurringSchedule?, startStamp?, endStamp? }`.
3. `transformSpecials`:
   - `description` ← `menuDisplayName` (primary).
   - `discountPct` ← parse `(\d+)\s*%` from `menuDisplayName + " " + menuDisplayDescription`.
   - `daysValid` ← **product decision needed** (see below).
   - `type`/window ← all live = `daily` (no `recurringSchedule`); `happy_hour` branch stays dormant/defensive until a real timed special is observed (recurringSchedule shape still unknown).
   - optionally filter to `specialType === "sale"`.
4. Replace `__fixtures__/dutchie-specials.json` with a sanitized real capture and update `_dutchie.test.ts` to the real shape.

### Open product decision — day-of-week in free text
Kush21's "50% off Storewide - **Monday & Friday**" has its day restriction only in the display text, with no structured field. Options:
- **(A) Parse weekday names from the text** → correct day-gating, but fragile (depends on copy phrasing).
- **(B) Treat all as `everyday`** → simplest, but a Monday-only deal would show every day — a correctness violation of the Honest-Math goal.
- **(C) Parse if confidently detected, else `everyday`** → middle ground.

## CAP-4 / CAP-5 — were blocked behind CAP-3.

---

# RESOLUTION 2026-06-14 (Erik approved rework + parse-days-if-detected-else-everyday)

- **CAP-3 ✅** `_dutchie.ts` reworked to the real shape (`getSpecialMenuCards.menuCards`; discount/days parsed from text; all-day `daily`). Fixture replaced with a sanitized real capture; `_dutchie.test.ts` reworked (14 tests). See ADR-030.
- **Extra bug found & fixed:** `dutchieRequest.wait_for_pattern` was `dutchie\.com/graphql` → fired before kush21's late `GetSpecialMenuCards` (150+ specials) → 0 deals → stale. Changed to wait on `GetSpecialMenuCards`. This was the difference between 2/3 and 3/3.
- **CAP-2 ✅** Both ids wired (`thc-connection`, `kush21-everett`); guards removed.
- **CAP-4 ✅** Live boot scrape (service up): `data.json` shows the-joint=1, jet=2, kush21=4 deals, all `stale:false`; `GET /api/data` serves them; `logs.json` = `ok` for all 4 sources. Deals contract-valid (everyday, times null, whole-number `discountPct`).
  - Note: kush21's "50% off Storewide - Monday & Friday" card was **absent on Sunday** — Dutchie day-gates some specials server-side, so the free-text day parser (correct + unit-tested) rarely fires on live data. `recurringSchedule` was null on every card → `happy_hour` deferred (new item in `deferred-work.md`).
- **CAP-5 ✅** Service stopped → boot scrape re-run: server did not crash; all 3 Dutchie stores `stale:true` with **deals preserved** (1/2/4, not emptied); `logs.json` = `error: scraper returned no deals` for the 3, `remedy-tulalip` still `ok`.

**Verification:** `tsc --noEmit` clean; 86 server tests pass.
