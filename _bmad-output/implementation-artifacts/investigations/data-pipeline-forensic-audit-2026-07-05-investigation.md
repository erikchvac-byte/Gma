# Investigation: Data-Collection Pipeline Forensic Audit

## Hand-off Brief

1. **What happened.** A read-only forensic audit of gma's two data assets (`data.json` deals, `products.json` longitudinal prices) found the pipeline is broadly sound and honesty-gated, but carries one **live silent-wrong bug** (15 multi-option pre-roll packs compute wrong $/gram, unflagged, and can leak into disparities), three **dormant collected fields** (terpenes = 0/5090 because the source never sends it; 1,206 Edible/Concentrate records collected but banner-unlinkable by design; effects/subcategory captured with no consumer), and one **near-term architecture wall** (append-only 18.8 MB single-JSON `products.json`, growing ~1.75 MB/day, hits GitHub's 50 MB push warning ~Jul 23 and the 100 MB hard push-block ~Aug 20, 2026).
2. **Where the case stands.** Concluded. Every thread answered with `path:line`-cited evidence graded Confirmed/Deduced/Hypothesized; volumes measured directly from the committed 18.8 MB file and git history.
3. **What's needed next.** Fix the multi-option $/gram silent-wrong path (fix now); take the storage wall to the architect before ~Jul 23 (the file-size clock is running); route the dormant-field decisions (terpenes, Edible/Concentrate linking) to product/technical-research.

## Case Info

| Field            | Value                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Ticket           | N/A (bmad-investigate, Erik-directed forensic audit)                                       |
| Date opened      | 2026-07-05                                                                                 |
| Status           | Concluded                                                                                  |
| System           | Windows 11 / Node 22; Happy repo `C:\Users\erikc\Dev\Happy`; prod = Render free + gmaslist.com |
| Evidence sources | `server/types/index.ts`, `client/src/types/index.ts`, `server/utils/*`, `server/scrapers/*`, `server/routes/*`, `.github/workflows/*`, committed `server/data/products.json` (18.8 MB, measured), git history |

## Problem Statement

Erik's audit questions (verbatim scope): what data do I hold, what am I silently dropping, what am I collecting-but-ignoring, and is my storage sound or near a wall? Grade every finding by evidence strength. Read-only. Two assets: `data.json` (~22 KB, deals via `/api/ingest`) and `products.json` (18.8 MB append-only ProductRecord history, commit-back to git).

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| `server/types/index.ts` | Available | Full RawProduct/ProductRecord/ProductObservation/Disparity/DealScope type surface, read `:1-224` |
| `client/src/types/index.ts` | Available | Deal type + Dispensary, read `:1-85` |
| `server/utils/normalizeProduct.ts` | Available | Normalization + the multi-option skip, read `:1-177` |
| `server/utils/crossStoreValue.ts` | Available | Disparity engine + honesty gates, read `:1-171` |
| `server/utils/productsStore.ts` | Available | Append-only merge + per-request read, read `:1-97` |
| `server/data/products.json` | Available | 18.8 MB; parsed in a Node one-liner (never into context); volumes below are measured, not estimated |
| `server/scrapers/_dutchieProducts.ts` | Partial | Grepped extraction lines (terpenes/effects/quantity/netWeight) `:55-196`; full transform not read |
| `.github/workflows/scrape-products.yml` | Available | Commit-back + `continue-on-error`, read `:1-91` |
| Live `gmaslist.com/api/value/disparities` | Available | Returned 217 disparities (curl) |
| `scraper-svc/` Python scraper internals | Missing | Out of scope; extraction confirmed from Node-side normalize + live data only |

## Confirmed Findings

### Finding 1 — Inventory: what is held (Thread 1)

**Evidence:** `server/types/index.ts:53-120`, `client/src/types/index.ts:1-57`; volumes from `server/data/products.json` (measured 2026-07-05, `lastUpdated: 2026-07-05T10:30:05Z`).

**Volumes (Confirmed, measured):**
- **5,090 product records**, **29,669 observations**, window **2026-06-24 → 2026-07-05** (11 days).
- **24 store ids** present in `products.json` coverage.
- **217 disparities** live (`/api/value/disparities`, up from 177 in the 2026-07-03 audit).
- Categories: Flower 1,310 · Vaporizers 1,566 · Pre-Rolls 1,008 · **Edible 485 · Concentrate 721**.
- Potency coverage: **thc 2,766/5,090 (54%)** · cbd 1,662 · effects 1,836 · subcategory 2,094 · **totalTerpenes 0/5,090**.

**Field classification (Confirmed from code):**

| Field | Where captured | Status |
| ----- | -------------- | ------ |
| `Deal.description/discountPct/start-end/daysValid/specialType` | `client/src/types/index.ts:1-18` | **Surfaced** (feed) + `discountPct` used in deal-scope (temporal only, never a saving — `types:166-171`) |
| `Deal.providerNote` | `client/src/types/index.ts:14-17` | **Dormant** — captured to study, "NOT displayed yet" |
| `ProductObservation.pricePerGram / specialPricePerGram` | `types:82,85` | **Derivation** (disparity price basis is `specialPrice ?? basePrice`, not $/g — but $/g is the stored honest unit) |
| `pricePerItem / specialPricePerItem` | `types:83,86` | **Derivation** (pre-rolls only; $/joint) |
| `quantityAvailable` | `types:86` | **Derivation** — gate 4 sold-out exclusion (`crossStoreValue.ts:102`); 4,699/5,653 latest-options non-null |
| `thc / cbd` | `types:113-114` | **Derivation-ready, not yet surfaced** — record-level identity, refreshed per scrape |
| `effects` | `types:116` | **Dormant** — 1,836 records carry it; no consumer found |
| `subcategory` | `types:117` | **Dormant** — 2,094 records; used only for Concentrate matcher keying (spec-category-expansion), not surfaced |
| `totalTerpenes` | `types:64-68,115` | **Dormant + source-empty** — see Finding 4 |
| `flags` | `types:118` | **Derivation** — poison-gate for disparities (`crossStoreValue.ts:31,81`) |

### Finding 2 — LIVE silent-wrong path: multi-option packs skip weight reconciliation (Thread 3, highest priority)

**Evidence:** `server/utils/normalizeProduct.ts:109-151`; 15 live records confirmed by data scan.

**Detail:** `parseGrams(o.option)` (`:110`) reads the option label as the **total** weight and never multiplies by `packCount`. The reconciliation that would catch a per-unit label (`:136-151`) runs **only when `raw.options.length === 1`** (`:137`). For single-option packs this fires and produces the **556 `weight-mismatch` flags** (all Pre-Rolls) that the disparity engine then excludes — the safety net works. But **multi-option packs bypass the net entirely**. 15 such records exist live and compute wrong $/gram with **no flag**. Concrete case (measured):

```
"Fire Bros | NYC Vapor | Pre-Roll 2 Pack DOH"  pack:2  flags:(none)
  option "1g"    → pricePerGram $12/g   (2 joints × 1g = 2g total → true $6/g)
  option "1/4oz" → pricePerGram $1.69/g
```

The `1g`/$12 row is a per-unit label on a 2-pack; the stored $/g is 2× reality. Because it is **unflagged**, `crossStoreValue.ts:81` does NOT exclude it, and `canonicalWeightGrams("1g")=1g` with `price=$12` lets it be compared **as if it were a single 1g pre-roll at $12** against genuine singles elsewhere — a false disparity vector. Confirmed reaching the derivation layer.

**Scope (Deduced):** Impact is bounded — 15 multi-option pre-roll records, of which **2 are the actionable silent-wrong bug** (`packCount > 1`: "Fire Bros 2 Pack", "Velvet Koffee 2-pack"). The other 13 have `packCount === 1` (single joints in a 1g/¼oz size ladder) and are honest, as are the 355 multi-option **Flower** records (genuine total-weight-per-option size ladders). The code comment at `:131-135` already predicted exactly this ("revisit if a multi-option pre-roll pack ever appears live") — it has appeared live.

> **Update 2026-07-06 (fix shipped):** resolved via the `unreconciled-pack` flag — a weight-based record that is multi-option AND `packCount > 1` is flagged and excluded from the disparity engine (`EXCLUDED_FLAGS`). `packCount > 1` is the exact discriminator isolating the 2 bad packs from the 368 honest multi-option records. See `spec-fix-multi-option-weight-flag.md`. Three residual gaps (single-option null-`netWeight` packs, unparsed pack-words, stored-$/g not corrected) logged in `deferred-work.md`.

### Finding 3 — BATCH "0-product" stores: 1 genuinely empty, 2 are removed ghosts (Thread 3)

**Evidence:** `server/scrapers/dutchie-stores.ts:15-30,63-71`; source grep; data scan.

**Detail:**
- `the-vault-silvana` **is** registered (`:19`) but returns 0 products — root cause is **genuinely empty menu** ("COMING SOON", per the 2026-07-01 finding in memory), NOT extraction failure. The scrape succeeds and returns `[]`; fail-soft (`scrapeProductsRun.ts:59`) records `0`, no error.
- `cannazone-mt-vernon` and `bud-hut-camano-island` are **not referenced anywhere** in `server/` or `client/` source (grep returned nothing). They are removed ghost stores; "0 products" is stale framing — they are not scraped at all. Confirmed.

### Finding 4 — totalTerpenes is collected but the source never sends it (Thread 2)

**Evidence:** `server/scrapers/_dutchieProducts.ts:77,195` (`totalTerpenes: num(p.totalTerpenes)`), `server/types/index.ts:64-68`; data scan **0/5,090 non-null**.

**Detail:** The extraction path exists and runs (`:195`), so the null is not a code gap — the Dutchie payload field is empty for every scraped store. The type's caveat ("do NOT compare across stores until the unit is established") is **moot**: with zero data points, the unit can never be established empirically from this source. This is dormant *and* structurally un-fillable from the current provider. Product decision, not a bug.

### Finding 5 — Edible + Concentrate collected but banner-unlinkable by design (Thread 2)

**Evidence:** `server/types/index.ts:173-180` (`ScrapedCategory = 'Flower' | 'Vaporizers' | 'Pre-Rolls'`), `normalizeProduct.ts:24` (`WEIGHT_BASED_CATEGORIES` includes Concentrate, excludes Edible); data scan.

**Detail:** **1,206 records (Edible 485 + Concentrate 721)** sit outside the 3-category banner-linkable set. This is **deliberate, counted, not silent**: `crossStoreValue.ts:76-79` counts them as `nonComparableCategoryCount` and skips; the type comment (`:176-179`) states linking them is "a deliberate FUTURE decision." Note the asymmetry — Concentrate *is* in `WEIGHT_BASED_CATEGORIES` (honest gram axis) so it **does** enter disparity comparison, but is **not** in `ScrapedCategory` so it is **not** banner-linkable. Edible is excluded from both (mg-THC labels, no honest weight). Dormant-by-design; the gap is product intent, not defect.

### Finding 6 — Drop-accounting exists and is honest, but no human sees it (Thread 3, bookkeeping)

**Evidence:** `crossStoreValue.ts:51-61,156-163` (MatchReport counters), `valueRoute.ts:20-28` (exposed at `/api/value/disparities`), `server/types/index.ts:211-223` (DealScopeReport), `scrape-products.yml:31-33,74-91`.

**Detail:** Every drop **is** counted — `MatchReport{unmatchedCount, excludedFlagCount, nonComparableCategoryCount, placedRecords}` and `DealScopeReport{unresolvedCount, zeroMatchCount, unsupportedCategoryCount}`. Both are served on private JSON endpoints (`valueRoute.ts:23,51`). **But there is no dashboard and no alert** — nobody reads a private endpoint routinely. The product scrape workflow is explicitly `continue-on-error: true` and self-describes as "NOT an alert source" (`scrape-products.yml:31-33`); a push failure only emits `::warning::` (`:90`). So drops are *inspectable on demand* but *operationally invisible*. Deliberate posture (private R&D dataset), but a monitoring gap if this data ever becomes load-bearing.

### Finding 7 — products.json survives Render, but a push failure loses one observation window (Thread 3, runtime loss)

**Evidence:** `productsStore.ts:8-16`, `scrape-products.yml:3-12,74-91`.

**Detail:** Confirmed: Render's disk is ephemeral, so `data.json` resets to the committed seed on every deploy — but `products.json` is durable **because** it is committed back to git, not written by the server. The single loss vector: if the commit-back `git push` fails both retries (`:85-90`), that day's freshly-appended observations exist only on the ephemeral Actions runner and are **never persisted** — one lost daily window. Warns, does not red. Low frequency, real.

### Finding 8 — Storage: single 18.8 MB JSON, per-request full parse, near the GitHub file wall (Thread 4)

**Evidence:** file stat 18.8 MB; git blob sizes; `productsStore.ts:30-41`; `valueRoute.ts:22,51`, `productsRoute.ts:12`.

**Detail (all Confirmed / Deduced from measurement):**
- **Model:** one append-only JSON object keyed `${dispensaryId}::${productId}`, parsed whole into memory. **No query layer** — `buildMatchReport` does full linear scans (`crossStoreValue.ts:66,73`).
- **Growth (measured from git):** 11.9 MB (Jul 1) → 15.9 MB (Jul 4) → 19.0 MB (Jul 5) ≈ **~1.75 MB/day**; ~2,000–3,500 observations/day at ~664 bytes/obs.
- **Per-request cost:** `readProducts()` reads + `JSON.parse`es the **entire file on every call**, uncached — `/api/products` serves the whole 18.8 MB blob to the client (`productsRoute.ts:12`), `/api/value/*` parse it twice per request pair (`valueRoute.ts:22,51`). At Render free 512 MB, a 50 MB+ parse per request is an OOM risk (V8 heap ~3–5× file size).
- **The wall (Deduced, linear extrapolation):** GitHub **warns at 50 MB / hard-blocks push at 100 MB per file**. From 18.8 MB at 1.75 MB/day → **50 MB ≈ 2026-07-23**, **100 MB ≈ 2026-08-20**. `.git` is 33 MB today and grows with every daily full-blob commit (delta-packed, but unbounded). **This is the nearest wall and it is weeks out, not months.**

## Deduced Conclusions

### Deduction 1 — The honesty architecture is working; the one leak is the un-netted multi-option pack

**Based on:** Findings 2, 5, 6. **Reasoning:** the disparity engine's five gates (`crossStoreValue.ts:14-27`) and the flag-poison exclusion catch the *single-option* weight errors (556 flagged + excluded) and the non-comparable categories (1,206 counted). The only class that slips every gate is the *multi-option* pack, because the reconciliation that produces the poison flag is `options.length === 1`-only. **Conclusion:** closing Finding 2 restores the invariant that "every weight-unsafe record is flagged and excluded."

### Deduction 2 — "Collected-but-ignored" splits into three distinct dispositions

**Based on:** Findings 4, 5, 1. **Reasoning:** terpenes = source-empty-forever (can't fix by decision); Edible/Concentrate = deferred-linking (a real product choice with data ready); effects/subcategory/providerNote = captured-with-no-consumer (study-then-decide). **Conclusion:** these are three different queues, not one backlog — only the middle one is a "turn it on" decision.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Whether any *single-option* record slips the 2% `approxMg` tolerance and mis-computes silently | Would size the silent-wrong class beyond the 15 multi-option | Scan single-option records where `netWeightMg`/`weightField` are null (reconciliation preconditions unmet, `:139-141`) |
| Python `scraper-svc` extraction fidelity for terpenes | Confirm 0/5090 is source-empty vs. a Node-side `num()` coercion bug | Read scraper-svc payload capture; out of this audit's scope |
| Actual Render peak memory on `/api/products` | Confirm the OOM projection | Render metrics / load test |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | `server/utils/normalizeProduct.ts:110` (`parseGrams` label-as-total) + `:137` (`options.length === 1` guard on reconciliation) |
| Trigger | A multi-option product whose option label states **per-unit** weight (pre-roll pack) is normalized |
| Condition | `raw.options.length > 1` AND label is per-unit AND `packCount > 1` → wrong `pricePerGram`, no flag |
| Related files | `crossStoreValue.ts:81,95,103` (unflagged record enters disparity at face-value weight/price) |

## Conclusion

**Confidence:** High. Root causes are Confirmed with `path:line` and reproduced against the live 18.8 MB dataset; the storage wall is a linear extrapolation from measured git blob sizes (Deduced, High).

The pipeline is fundamentally sound and its honesty gates do real work. Three things need owners: (1) **fix now** — the 15-record multi-option $/gram silent-wrong path leaks into disparities; (2) **architect now** — the append-only single-JSON store crosses GitHub's file-push wall in ~2.5–7 weeks and already does an uncached full parse per request; (3) **product decisions** — dormant terpenes (source-empty), Edible/Concentrate linking (data ready, deferred by design), and effects/subcategory/providerNote (no consumer).

## Recommended Next Steps

### Ranked "look into this" list

**Silent bugs — fix now (route to `bmad-quick-dev`):**
1. **Multi-option weight reconciliation gap** (Finding 2) — either extend the reconciliation past `options.length === 1`, or flag any multi-option pack whose label parses as per-unit (packCount > 1) so it is excluded like its single-option siblings. 15 live records, actively corrupting disparities.

**Scaling risks — architect now, clock is running (route to `bmad-technical-research`/architect):**
2. **products.json file-size wall** (Finding 8) — GitHub 50 MB warning ~Jul 23, 100 MB push-block ~Aug 20, 2026. Needs a storage decision (per-store shards / SQLite-committed / external store / observation pruning) before late July.
3. **Uncached per-request full parse** (Finding 8) — add an mtime-cached read or in-memory dataset; `/api/products` serving the whole blob is both a memory and a payload problem independent of the file wall.

**Dormant data — product decisions (route to product / research):**
4. **Edible + Concentrate banner-linking** (Finding 5) — 1,206 records ready, `ScrapedCategory` is the one-line gate; Concentrate already has an honest weight axis.
5. **totalTerpenes** (Finding 4) — accept it as source-empty and either drop the field from active expectation or find a provider that sends it (external-source question — out of this audit's scope).
6. **effects / subcategory / providerNote** (Finding 1) — captured with no consumer; decide surface-or-drop.

**Ops hygiene (low, optional):**
7. **Drop-accounting is invisible** (Finding 6) and **push-failure loses a window** (Finding 7) — fine for a private R&D dataset; revisit if this data becomes load-bearing.

### Diagnostic

To size the silent-wrong class fully before fixing: scan `products.json` for single-option records where `netWeightMg === null || weightField === null` (reconciliation preconditions unmet at `:139-141`) — those also skip the net and are the untested remainder.

## Side Findings

- **`/api/value/disparities` is live at 217** (curl 2026-07-05), up from 177 in the 2026-07-03 audit — the disparity signal is accruing as designed.
- **effects sample** is a name→score map (`{Energetic:9, Happy:9, ...}`) — richer than a boolean; usable for "strain persona" surfacing if a consumer is ever built (`types:69,116`).
- **`weight-mismatch` is 99.6% Pre-Rolls** (556/558; 1 Flower, 1 Vaporizer) — the flag is almost entirely doing its intended pre-roll-pack job, evidence the single-option net is well-targeted.
- **This audit is the deeper successor** to `data-collection-audit-2026-07-03.md`; it confirms that file's counts have grown (disparities 76→177→217; records to 5,090) and hardens the silent-wrong lead into a reproduced live bug.
