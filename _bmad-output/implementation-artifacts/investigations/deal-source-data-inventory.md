# Deal/Specials Source Data Inventory — Reconnaissance

**Date:** 2026-06-24
**Scope:** Read-only recon of the deal/specials sources wired into this repo. Discovers what data is available per source and how each field is accessed. NOT a plan, recommendation, or feasibility judgment.

**Method / provenance:**
- Field shapes taken from the repo's **real captured fixtures** (`server/scrapers/__fixtures__/`).
- Static source (`remedy-tulalip`) additionally **live-probed this session** → HTTP 200.
- Dutchie shape is from a **captured fixture (2026-06-13)**, NOT a fresh live capture this session.
- Coverage derived from a **live read of `https://gmaslist.com/api/data`** this session.

Two source TYPES: `dutchie-embed` (20 stores) and `static-html` (1 store).

---

## TYPE 1 — `dutchie-embed`

- **type:** `dutchie-embed`
- **access:** `https://dutchie.com/embedded-menu/<cName>` (navigate the embed URL directly, not the dispensary's own site — the host embed is lazy/flaky)
- **fetch:** `js-render(browser)` — Playwright + stealth + GraphQL network interception via `scraper-svc` (FastAPI + Playwright). Blockers: Next.js SPA, **JS-required** (invisible to axios/cheerio); the GraphQL op `GetSpecialMenuCards` can **emit late** on large menus (e.g. kush21, 150+ specials) — must wait specifically for that op, not the first generic `dutchie.com/graphql` call, or zero cards are captured. No Cloudflare/checkpoint observed in the captured fixture.
- **container:** intercepted response whose URL matches `GetSpecialMenuCards`; root JSON path **`data.getSpecialMenuCards.menuCards`** (array of `SpecialMenuCard`).

### Field table — one `menuCard` object

| field | location (JSON path) | example value | notes / nullable? |
|---|---|---|---|
| `_id` | `…menuCards[]._id` | `"6965e55dca3f9f0076adb980"` | Mongo-style hex id. Not consumed by current transform. |
| `menuDisplayName` | `…menuCards[].menuDisplayName` | `"50% off Storewide - Monday & Friday"` | The **displayed title**. Free text; percent + weekday restrictions parsed out of it. Can be `""` (empty → card skipped). |
| `menuDisplayDescription` | `…menuCards[].menuDisplayDescription` | `"20% OFF ALL ONLINE ORDERS"` | Often `""`; frequently not visually rendered. Nullable/absent. |
| `specialType` | `…menuCards[].specialType` | `"sale"` | Observed value `"sale"` on all sampled cards. |
| `recurringSchedule` | `…menuCards[].recurringSchedule` | `null` | **null on every sampled card.** Intended to hold time-of-day/recurrence for timed specials — **shape unverified** (see uncertain). |
| `startStamp` | `…menuCards[].startStamp` | `null` | Present on some cards, `null` in sample. Nullable. |
| `endStamp` | `…menuCards[].endStamp` | `null` | Present on some cards, `null` in sample. Nullable. |
| `__typename` | `…menuCards[].__typename` | `"SpecialMenuCard"` | GraphQL type tag. |

There is **no** numeric discount field, **no** structured day field, and **no** structured time-window field in the raw payload — percent (`NN%`) and weekday names are embedded in the free display text only.

**Uncertain:** `recurringSchedule` (null in all samples → object shape never observed; would carry timed/happy-hour data); presence/population of `startStamp`/`endStamp` on timed specials.

### Raw captured sample — one real `menuCard`
Provenance: `server/scrapers/__fixtures__/dutchie-specials.json`, captured **2026-06-13** from the-joint-everett (`689cd028ea84b6a605458416`). A fixture, **not** a live capture this session. (Real card — hex `_id`; the fixture also contains synthetic zero-`_id` test cards which are excluded here.)

```json
{
  "_id": "6965e55dca3f9f0076adb980",
  "menuDisplayName": "50% off Storewide - Monday & Friday",
  "menuDisplayDescription": "",
  "specialType": "sale",
  "recurringSchedule": null,
  "startStamp": null,
  "endStamp": null,
  "__typename": "SpecialMenuCard"
}
```

### cName mapping (id === cName unless noted)
- the-joint-everett → `689cd028ea84b6a605458416`
- jet-cannabis-everett → `thc-connection`
- kush21-everett-evergreen → `kush21-everett`
- All others: id === cName — happy-time-mt-vernon, cannazone-old-hwy-99, sweet-relief-mt-vernon, cannazone-mt-vernon, the-vault-silvana, bud-hut-camano-island, kushmart-north, local-roots-everett-128th, kushmans-everett-evergreen-way, hangar-420-everett, hangar-420-west, evolve-cannabis-bellingham, cannazone-bellingham, 2020-solutions-north-bellingham, 2020-solutions-pacific-highway, starbuds-bellingham, salish-coast-cannabis

---

## TYPE 2 — `static-html`

- **type:** `static-html`
- **access:** `https://remedytulalip.com/promos/` (single fixed URL; only `remedy-tulalip` uses this type)
- **fetch:** `static` — axios GET + cheerio parse, UA `Mozilla/5.0 (compatible; GmaHelper/1.0)`. **No blockers** for the promos page itself: live-probed this session → **HTTP 200, 54 KB, 17 `.el-item` nodes**. (The site has a JS age-gate overlay and reCAPTCHA assets, but the promo HTML is server-rendered and fully present without interacting with them.)
- **container:** CSS selector **`li.el-item`** (repeated). Per card: title in **`.el-title`**, body in **`.el-content`**.

> Container caveat: the page has **17 `.el-item`** nodes, but most are social/nav icon links. Real deal cards are the ~9 in the *Daily Deals* / *Early Bird Happy Hour* / *Group Discounts* lists. The parser keeps only `.el-item`s whose combined text matches both `\d+\s*%` and `/off/i` — so 17 ≠ deal count.

### Field table — one `li.el-item` deal block

| field | location (CSS selector / derivation) | example value | notes / nullable? |
|---|---|---|---|
| title | `li.el-item .el-title` (text) | `"Munchie Monday:"` | Weekday name (if any) parsed from here. |
| body | `li.el-item .el-content` (text) | `"15% Off Edibles + Drinks (Excluding Capsules)"` | Carries the offer text; may contain nested `<ul>` fine print. |
| discountPct | regex `(\d+)\s*%` over `title + body` | `15` | `null` if no percent present. |
| time window | regex (e.g. `7-8am`, `9am-9pm`) over combined text | `"7-8am"` → `07:00`/`08:00` | Absent on most cards → daily; present → happy_hour. Nullable. |
| daysValid | weekday name found in title, else `everyday` | `["monday"]` / `["everyday"]` | Derived, not a DOM field. |

**Uncertain:** none — all fields are derived from these two selectors.

### Raw captured sample — one `.el-item` block
Provenance: live fetch of `https://remedytulalip.com/promos/` this session (matches `__fixtures__/remedy-tulalip.html`).

```html
<li class="el-item">
  <h3 class="el-title uk-margin-remove uk-h5">Munchie Monday:</h3>
  <div class="el-content uk-panel">15% Off Edibles + Drinks (Excluding Capsules)</div>
</li>
```

A timed (happy-hour) example puts the offer + window in the title:

```html
<li class="el-item">
  <h3 class="el-title uk-margin-remove uk-h5">20% Off Your Purchase Everyday from <strong>7-8am*</strong></h3>
  <div class="el-content uk-panel"><em>*You must complete your transaction before 8am to receive the discount.</em></div>
</li>
```

---

## SOURCE COVERAGE — 21 sources

Live read of `https://gmaslist.com/api/data`, `meta.lastScraperRun = 2026-06-24T13:22:32Z`.

**Reachability is anchored on `lastFetchedAt`/`stale` (scrape-success recency), NOT on deal count.** The API's `deals` array is run through `filterActiveDeals(dispensaries, now)` in `server/routes/dataRoute.ts`, so it is day/time-filtered to "active today" (this session was a Wednesday). A reachable store whose specials run only on other days legitimately shows 0 active deals. Two clean clusters of `lastFetchedAt` (≈2.8 h and ≈13.3 h ago) indicate two distinct successful run times.

**Static (1):**
- `remedy-tulalip` — reachable: **yes** — live HTTP 200 this session + scraped 2.8 h ago (`status=ok`)

**Dutchie embeds (20):**

| source-id | reachable | note |
|---|---|---|
| kush21-everett-evergreen | yes | fetched 2.8h ago, status=ok |
| jet-cannabis-everett | yes | fetched 2.8h ago, status=ok |
| happy-time-mt-vernon | yes | fetched 2.8h ago, status=ok |
| the-vault-silvana | yes | fetched 2.8h ago, status=ok |
| kushmart-north | yes | fetched 2.8h ago, status=ok |
| local-roots-everett-128th | yes | fetched 2.8h ago, status=ok |
| kushmans-everett-evergreen-way | yes | fetched 2.8h ago, status=ok |
| evolve-cannabis-bellingham | yes | fetched 2.8h ago, status=ok |
| the-joint-everett | yes (at last success) | fetched 13.3h ago, status=stale; not refreshed in recent runs |
| cannazone-old-hwy-99 | yes (at last success) | fetched 13.3h ago, status=stale |
| sweet-relief-mt-vernon | yes (at last success) | fetched 13.3h ago, status=stale |
| hangar-420-everett | yes (at last success) | fetched 13.3h ago, status=stale |
| hangar-420-west | yes (at last success) | fetched 13.3h ago, status=stale |
| cannazone-bellingham | yes (at last success) | fetched 13.3h ago, status=stale |
| 2020-solutions-north-bellingham | yes (at last success) | fetched 13.3h ago, status=stale |
| 2020-solutions-pacific-highway | yes (at last success) | fetched 13.3h ago, status=stale |
| salish-coast-cannabis | yes (at last success) | fetched 13.3h ago, status=stale |
| cannazone-mt-vernon | no | `lastFetchedAt` = epoch (never successfully fetched/ingested) |
| bud-hut-camano-island | no | `lastFetchedAt` = epoch (never successfully fetched/ingested) |
| starbuds-bellingham | no | `lastFetchedAt` = epoch (never successfully fetched/ingested) |

**Note (fact, not recommendation):** `/api/data` cannot distinguish *reached-but-no-specials* from *fetch-failed* for a `stale`/empty store — the `_dutchie.ts` transform returns `[]` for both. The 3 epoch stores have no successful ingest on record.

---

## Key repo references
- `server/scrapers/_dutchie.ts` — shared Dutchie request preset + `GetSpecialMenuCards` transform
- `server/scrapers/dutchie-stores.ts` — config-driven Dutchie store ids (17 standard)
- `server/scrapers/{the-joint-everett,jet-cannabis-everett,kush21-everett-evergreen}.ts` — 3 stores whose id ≠ cName
- `server/scrapers/remedy-tulalip.ts` — static axios/cheerio scraper
- `server/utils/scraperClient.ts` — typed boundary to the Python service
- `server/routes/dataRoute.ts` + `server/utils/filterActiveDeals.ts` — day/time filtering of `/api/data` deals
- `scraper-svc/` — Python FastAPI + Playwright service (tiers: browser / tls / cloudflare)
- Fixtures: `server/scrapers/__fixtures__/{dutchie-specials.json,remedy-tulalip.html}`
