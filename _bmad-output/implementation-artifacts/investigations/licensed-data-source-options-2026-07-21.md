# Licensed / Paid Data-Source Options vs. Current Scraping

**Date:** 2026-07-21 · **Pricing corrected 2026-07-24**
**Context:** All deal + pricing data currently rides on undocumented private APIs, defeated anti-bot protection, and pinned selectors. Question: is there a legitimate paywall we can pay to cross for any of it?

> **2026-07-24 correction.** The original draft called CannMenus "enterprise/sales-gated, price unknown." That was wrong. CannMenus publishes **public, self-serve API pricing** (`cannmenus.com/pricing`): **API Standalone $500/mo** base, 3 states included, 10,000 requests/state/month, self-serve signup — no sales call, no need to surface ourselves. WA is one state, so we fit inside the base tier. The blocking unknown is resolved, and it **strengthens** the standing decision (ADR-095): the number is ~$6,000/yr for a $0-Render, ~18-users/28d project, to launder a ToS risk that may not even disappear. Verdict = known price, not worth it now; revisit only when traffic/revenue justifies it. **No inquiry email needed or sent.**

## Verdict

For our exact need — live per-store menu + pricing across ~21 WA dispensaries we do **not** own — there is **no cheap, self-serve paywall on Dutchie or Weedmaps themselves**. Both official APIs are gated behind the *dispensary owner's* authorization. The one paid path that fits our third-party model is a **licensed aggregator (CannMenus)** — and it turns out to be self-serve at **$500/mo** (see correction above), not enterprise-gated. A cheaper middle option (managed scrapers) removes fragility but **not** the ToS risk.

## What's questionable right now

- **Defeating anti-bot protection** on every source:
  - Dutchie private GraphQL behind the 403 JS-wall (hash-lifting, apollo-preflight spoof).
  - Vercel "Security Checkpoint" 429s beaten via browser-tier raw_html.
  - Weedmaps 406-walls datacenter IPs → routed through a residential runner to look human.
  - Not illegal per se (public data, no auth bypass), but a clear ToS violation on each platform and deliberately evasive. Realistic risk = cease-and-desist that kills the data path, not a lawsuit.
- **Data honesty:** WebFetch has hallucinated deals (a 15% discount not in the DOM); staleness gate at `buildMatchReport` not yet shipped.
- **Fragility:** undocumented private APIs + pinned selectors break without notice; real outages have been silent (a stopped Scheduled Task looks like fresh data).

## Option 1 — Dutchie / Weedmaps official APIs (DO NOT FIT)

Both are built for *the store* (or a POS/e-commerce partner acting on its behalf) to push its own menu out.

- **Dutchie:** a customer's account admin must request an API key for an *approved partner*; key issued ~3 business days.
  - https://support.dutchie.com/hc/en-us/articles/27660267271187-Dutchie-POS-API-key-request-process-for-third-party-integrations
  - Dutchie Plus (headless ecommerce API): https://dutchie.com/business/ecommerce/dutchie-plus
- **Weedmaps:** OAuth2 ClientCredentials; access requires authorization from a **Weedmaps Listing Owner**.
  - https://developer.weedmaps.com/docs/overview
  - https://developer.weedmaps.com/docs/oauth

**Why it fails us:** we'd need each of 21 stores to individually authorize us. Non-starter as a third party surfacing stores we don't own.

## Option 2 — Licensed aggregator: CannMenus (BEST FIT, price now known: $500/mo)

Directly matches our data path. Aggregates Dutchie, Weedmaps, Leafly, and Jane menus with real-time pricing; sold via REST API to "developers & data teams." No requirement to own the listings — **they** carry the ToS/legal/fragility risk.

- https://cannmenus.com/ · https://cannmenus.com/pricing · https://docs.cannmenus.com/

**Public, self-serve pricing** (confirmed 2026-07-24):

| Tier | Price | Includes | Requests | Signup |
|------|-------|----------|----------|--------|
| API Standalone | **$500/mo** base | 3 states | 10,000/state/mo | self-serve (`/products/api/setup`) |
| +additional state | $100/state/mo | — | 10,000/state/mo | self-serve |
| Nationwide API | $2,000/mo flat | all states | 250,000/mo, 60 req/min | contact sales |

Annual prepay = 15% off (≈$5,100/yr). WA is **one** state → we fit inside the base $500/mo tier and use 1 of 3 states. Our usage is trivial: ~21 stores pulled daily ≈ 600 requests/month vs. a 10,000 ceiling. **No sales call required** — there was never a need to email them or reveal the project. The real decision is purely economic: $500/mo (~$6k/yr) vs. $0 scraping.

## Option 3 — Managed scrapers: Apify (cheaper, same legal posture)

Off-the-shelf Dutchie and Weedmaps scrapers, pay-per-run, self-serve.

- https://apify.com/tfmcg3/dutchie-dispensary-scraper

**Reality check:** does NOT fix the questionable part — still scraping against ToS. Buys less fragility (outsourced plumbing + anti-bot arms race), not more legitimacy.

## Decision matrix

| Goal | Path | Cost | Removes ToS risk? | Removes fragility? |
|------|------|------|-------------------|--------------------|
| Legitimacy | CannMenus licensed feed | $500/mo (self-serve) | Claimed — unverified | Yes |
| Fragility only | Apify / managed scraper | Pay-per-run, self-serve | No | Partial |
| Direct API | Dutchie / Weedmaps | N/A | — | — (not eligible as non-owner) |

## Next step — RESOLVED 2026-07-24

The blocking unknown (CannMenus pricing) is answered: **$500/mo, self-serve, no outreach required.** Decision stands with ADR-095 — do **not** buy; the moat is the derivation engine, the source is a pluggable commodity beneath it. Shelve CannMenus as a known-price option to revisit only when traffic/revenue makes $6k/yr defensible. The drafted inquiry email was deleted (premise dead — nothing to ask, no one to email).

## Sources

- https://support.dutchie.com/hc/en-us/articles/27660267271187-Dutchie-POS-API-key-request-process-for-third-party-integrations
- https://dutchie.com/business/ecommerce/dutchie-plus
- https://developer.weedmaps.com/docs/overview
- https://developer.weedmaps.com/docs/oauth
- https://cannmenus.com/
- https://docs.cannmenus.com/
- https://apify.com/tfmcg3/dutchie-dispensary-scraper
