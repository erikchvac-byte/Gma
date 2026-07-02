# Investigation: Are we dropping deal data elsewhere? — full Dutchie special-card capture

**Date:** 2026-07-02
**Trigger:** Remedy Tulalip's "…Following Customer Groups (with Proof of Valid ID)" card
showed no group names. Fixing it surfaced a general question from Erik: *"Do we have issues
like this other places?"* → *"Run all Dutchie stores, I want to look at every one of them."*
**Method:** Booted the vendored Python stealth-browser service (`scraper-svc/.venv`) locally on
a residential IP and ran the **exact production scrape path** (`dutchieRequest` + `pickSpecials`
from `server/scrapers/_dutchie.ts`) against all 17 Dutchie stores, dumping the **raw
`GetSpecialMenuCards` cards** instead of the transformed `Deal[]`.
**Raw data:** `dutchie-special-card-capture-2026-07-02.raw.json` (this folder).

---

## The two failure classes we were looking for

1. **Truncation** — `sanitizeDescription` capped every description at 80 chars.
2. **Dropped fields** — a transform fetches a field, uses part of it, discards the rest
   (Remedy dropped its `.el-content` list; the Dutchie transform keeps `menuDisplayName`
   as the description and discards everything else on the card).

### Class 1 (truncation) — RESOLVED, scope was tiny
Across the live feed (37 deals) **only Remedy's 124-char card** ever exceeded ~76 chars.
Cap raised 80 → 160 (commit `2e4f168`); nothing else was being cut.

### Class 2 (dropped fields) — this capture

The raw card exposes **15 fields**; the transform uses only `menuDisplayName` (description),
plus `menuDisplayDescription` **for percent/day parsing only** before discarding it:

```
__typename, _id, applicableCategories, applicablePreOrderTypes, displayRank,
endStamp, isBundledDiscount, isRestricted, menuDisplayDescription,
menuDisplayImage, menuDisplayName, posDiscountId, recurringSchedule,
specialType, startStamp
```

---

## What the 17-store capture found

**8 of 17 stores returned ZERO special cards** (separate concern — see below):
happy-time-mt-vernon, cannazone-old-hwy-99, sweet-relief-mt-vernon, hangar-420-everett,
hangar-420-west, cannazone-bellingham, starbuds-bellingham, the-joint-everett.

**9 stores had cards (22 cards total).** Field-by-field signal in the fields we drop:

| Field we drop | Populated? | Where / value |
|---|---|---|
| `menuDisplayDescription` | **1 / 22** | **evolve-cannabis-bellingham**: `"Order ahead online for your 50% off deals!\n\n*Discount does not apply to paraphernalia*"` |
| `applicableCategories` | **2 / 22** | **both 2020 Solutions** glass sale: `["Accessories","Hide"]` — tells us the deal is Accessories/glass |
| `startStamp` / `endStamp` | **2 / 22** | both 2020 Solutions glass sale: **starts 2026-07-01, ends 2026-08-01** ("July Glass Sale") |
| `specialType` | **21 sale, 1 bogo** | **salish-coast-cannabis** "40% Off Online Orders Sun,Tues,Thurs Min $80" is typed **`bogo`**, not a flat % off — we mislabel it |
| `recurringSchedule` | **0 / 22** | null everywhere → confirms no live Dutchie happy-hour (ADR-030 defer still valid) |
| `menuDisplayImage` | most | the retailer's own promo image (we intentionally use Erik's icons instead) |

### The one genuinely-dropped description (Evolve)
Card title is `"40% Off Storewide!!!"` but the discarded description says
`"Order ahead online for your 50% off deals! *Discount does not apply to paraphernalia*"` —
i.e. a **higher 50% online tier** and a **paraphernalia exclusion**. Both are lost today.
(The badge still shows 40% correctly — `resolveDiscountPct` takes the first percent in the
title, so surfacing the description would not change the badge.)

---

## Verdict

- **Truncation is not a problem anywhere else** — Remedy was the only case; fixed.
- **The Dutchie description drop is real but RARE.** Exactly **1 of 22** live cards
  (Evolve) carries description text worth showing. This confirms and generalizes the
  earlier single-store Silvana finding: Dutchie stores almost never populate
  `menuDisplayDescription`.
- **Two other fields carry occasional signal we currently ignore:**
  - `applicableCategories` + `startStamp/endStamp` → for the 2020 Solutions glass sale we
    actually know it's *Accessories, July 1 – Aug 1*. This is the only card where the "which
    products?" question (the whole Silvana ambiguity) is answerable from the source.
  - `specialType` → salish-coast is a **BOGO** we render as a plain % discount.

## Recommendations (NOT yet actioned — for Erik to choose)

1. **Low effort, low yield:** append `menuDisplayDescription` to the Dutchie description the
   same way we fixed Remedy. Helps exactly one store today (Evolve), but is the symmetric
   fix and future-proofs any store that starts using the field. Fits under the new 160 cap.
2. **Medium:** surface `specialType === 'bogo'` distinctly (a BOGO badge) so salish-coast
   isn't mislabeled as a straight % off.
3. **Medium:** use `endStamp` to show/verify sale end dates ("ends Aug 1") where present.
4. **Separate issue — 8 zero-card stores.** Needs its own look: some genuinely have no
   specials, but `the-joint-everett` has a *confirmed* embed id yet returned 0 — worth
   checking whether it's an empty-specials store or a load/pattern miss. Not a data-drop.

---

---

# Round 2 (same day) — Erik's follow-ups: what/why/when, flakiness, and "does capturing hurt?"

## A. Why do 8 stores return 0 cards? Is it a race or real? (the-joint-everett + happy-time)

Re-scraped 4 stores **5× each, single attempt**, recording per attempt whether the
`GetSpecialMenuCards` operation *fired* and how many raw `menuCards` it carried, plus one
production 3×-retry run each:

| store | 5× single-attempt result | prod 3×-retry | verdict |
|---|---|---|---|
| the-joint-everett | fired=Y, cards=**0** — all 5 | 0 | **genuinely empty** (id is fine — op fires, 14–18 intercepts = menu loads) |
| happy-time-mt-vernon | fired=Y, cards=**0** — all 5 | 0 | **genuinely empty right now** |
| hangar-420-everett | fired=Y, cards=**1** — all 5 | 1 | stable 1 (was 0 in the capture ~40 min earlier → changed over TIME) |
| kush21 (control) | fired=Y, cards=**3** — all 5 | 3 | stable, matches capture |

**Conclusions:**
- **Not a race, not a wrong id, not a flaky scrape.** Within a scrape window the op fires
  reliably and the count is deterministic (5/5 identical every store). ADR-051's retry-on-empty
  isn't masking anything here — a truly-empty store is empty on all 3 retries too.
- **the-joint-everett's confirmed embed id is correct.** It simply has **no active specials**
  right now. Zero deals is the true state, not a bug.
- **The intermittency Erik sees is REAL retailer behavior over time, not our flakiness.**
  hangar went 0 → 1 between the two runs (~40 min); happy-time had a "JUNE 2026 SUMMER SALE"
  on 2026-07-01 03:33 (last good fetch, now `stale:true` in the seed) and serves **0** today —
  the retailer ended the sale. Dutchie's `GetSpecialMenuCards` returns only **currently-active**
  specials; when a store's promo ends, the card set drops to empty on the very next scrape.

## B. What/why/when we get each field — and is the "when" a problem?

- **`menuDisplayName`** (we use it): always present; the special's headline. No timing issue.
- **`menuDisplayDescription`** (we drop it): optional free text the retailer *may* fill.
  WHEN present: rare (1/22). It's not time-sensitive itself — it's there whenever the store
  typed a body, gone when they didn't. The "when" that bites us is **B/§A intermittency**:
  we only ever see it during a scrape where the store has an active special, so we capture it
  opportunistically, never historically.
- **`startStamp` / `endStamp`** (we drop them): the special's validity window. **This is the
  "when" worth flagging.** Today we store NOTHING about validity (`Deal` has no stamp field and
  nothing reads one). We rely entirely on Dutchie only serving active specials — evidenced by
  the-joint/happy-time returning empty the moment their promo ends. So **display safety is
  handled upstream by Dutchie**, BUT with one gap: our **last-known-good cache (ADR-026)** keeps
  showing a store's final deals, `stale`-flagged, after the retailer pulls them. happy-time is
  the live example — the site currently shows its **expired June sale** (flagged stale, but the
  content is gone from source). That's the real "when" problem: **stale ≠ removed**, and we
  render removed deals until something replaces them.
- **`specialType`** (we drop it): almost always `sale`, but **salish-coast = `bogo`** — a
  buy-one-get-one we currently render as a flat "40% off". A genuine mislabel.
- **`applicableCategories`** (we drop it): null 20/22, but populated for the 2 2020-Solutions
  glass-sale cards (`Accessories`) — the only place the "which products?" question is source-
  answerable.
- **`recurringSchedule`**: null everywhere → no live Dutchie happy-hour (ADR-030 defer holds).

## C. Does it HURT us to stop dropping `menuDisplayDescription`? (Erik: capture it to investigate)

**Merging it into the displayed `description` (what I did for Remedy) is NOT free of risk:**
1. **Compliance coupling** — `sanitizeDescription`'s blocklist SUPPRESSES the *entire*
   description on a hit. Today only the short `menuDisplayName` is exposed to that. Folding in
   free-text retailer copy means a store writing e.g. "cures anxiety" in the body would blank
   the whole card's text (name included). New failure surface.
2. **Contradiction** — Evolve's body says "50% off" while the title/badge says 40%; naive
   concatenation can look self-contradictory.
3. Length is fine (160 cap covers it).

**Minimal, harmless way to "take it in for a minimum to investigate":** capture the raw
`menuDisplayDescription` into a **separate optional field** on `Deal` (e.g. `providerNote`),
**sanitized independently** and **not rendered**. Additive, no display/compliance coupling, and
it accumulates real samples over time so we learn how often/which stores use it before deciding
whether to surface it. Cost: a schema field that is `null` on ~21/22 deals + a transform line +
validation/tests. **Proposed, not yet built — awaiting Erik's go-ahead on the schema change.**

## D. Separate follow-up surfaced: stale ≠ removed
happy-time (and any store that ends a promo) keeps displaying its last-known-good deals,
`stale`-flagged, indefinitely. Worth deciding a policy: after N hours/days stale, stop showing
the deals (show the store as "no current deals") rather than an expired sale. Not a data-drop;
a freshness-display policy question.

---

## Provenance / reproducing
- Service: `scraper-svc/.venv/Scripts/python -m uvicorn api.server:app --port 8000`
  (residential IP required — datacenter IPs are 406-walled).
- Capture: production `dutchieRequest(cName)` → `postScrape` → `pickSpecials`, one store at a
  time. cNames: 14 batch stores use id===cName; originals map
  the-joint-everett→`689cd028ea84b6a605458416`, jet→`thc-connection`, kush21→`kush21-everett`.
- Temp capture script was removed after the run; raw output preserved as the `.raw.json`
  beside this file.
