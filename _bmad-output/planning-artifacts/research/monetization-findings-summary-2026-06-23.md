# Findings: Monetization Options for a WA Cannabis Deal Aggregator (Happy / Gma's Helper)

**Date:** 2026-06-23 · **Status:** Findings only — no implementation taken · **Not legal advice** — verify with a WA cannabis attorney and/or the WSLCB before committing to a revenue model.

---

## Executive Summary

- Mainstream ad rails (Google Ads, **Google AdSense**, Meta, TikTok) are closed to cannabis content **regardless of whether the site sells anything or just shows deals/prices**. AdSense in particular applies a blanket content-based exclusion with no informational/journalism carve-out — this rules out "just monetize your own traffic" as a lever entirely.
- The clearest legally-actionable line found anywhere in this research is **Google Play's app-store policy**: apps are fine as long as they don't execute the transaction in-app (no cart, no checkout, no delivery arrangement). Happy's current no-checkout, price-display design already sits on the compliant side of that line.
- Highest-viability revenue paths are **direct sponsored/featured store placement** (Weedmaps/Leafly model, paid via ACH/invoice, not card) and **end-user subscription/freemium** (normal Stripe rails, no cannabis-ad exposure). Cannabis-vertical ad networks (Mantis, Traffic Roots) are a viable but modest secondary lever.
- **Affiliate/referral commissions tied to actual THC sales are effectively unavailable** in the market today — no compliant payment rail exists for it. Affiliate programs that do exist are for hemp/CBD/accessory brands, not licensed WA dispensaries.
- If Happy ever runs a paid "featured" placement, it likely counts as cannabis advertising under WAC 314-55-155, which means it would need the 4 mandatory warning statements and no health claims — confirm this with WSLCB/counsel, as the rule's reach to *unlicensed* platforms is not 100% explicit in the public FAQ.

---

## 1. The Governing Constraint

Cannabis was reclassified federally to Schedule III on 2026-04-22, but **remains federally controlled**. Visa, Mastercard, Amex, and Discover all prohibit cannabis transactions on interchange; Google Ads/AdSense, Meta, and TikTok all categorically prohibit cannabis advertising/monetization, independent of state legality. This is why the options below largely route *around* the mainstream ad/payment stack rather than through it.

WA-specific rule: **WAC 314-55-155** (under RCW 69.50.369), updated by ESB 5206 (effective 2026-01-01, LCB rules effective 2026-07-04). Per the [LCB Cannabis Advertising FAQ](https://lcb.wa.gov/enforcement/cannabis_advertising_faqs), an unlicensed independent site **can** accept ad revenue from cannabis businesses without itself being licensed — but content that functions as cannabis advertising likely still has to carry the same substantive restrictions licensees face:

- 4 mandatory warning statements (intoxicating/habit-forming; impairment while driving; health-risk disclosure; 21+/keep from children)
- No appeal to minors (no cartoons/toys/youth-coded imagery)
- No therapeutic/curative health claims
- No placement within 1,000 ft of schools, parks, playgrounds, daycares, libraries, arcades

No explicit technical age-gate is mandated for websites (only "caution" guidance for social media).

---

## 2. Monetization Options, Ranked

| # | Option | Compliance exposure | Payment rail | Viability |
|---|--------|---------------------|---------------|-----------|
| 1 | **Direct sponsored/featured store placement** (Weedmaps/Leafly model) | High — likely counts as cannabis ad → 4 warnings, no health claims | ACH/invoice, not card | **Highest** |
| 2 | **Cannabis-vertical ad networks** (Mantis, Traffic Roots) | High — same content rules apply | Network-handled | Moderate |
| 3 | **Affiliate/referral — actual THC dispensary** | High, and largely unavailable in market | No compliant rail found | Low / near-absent |
| 3b | Affiliate — CBD/hemp/accessories cross-sell | Low | Normal affiliate networks | Moderate, secondary only |
| 4 | Mainstream ad networks (Google Ads/AdSense, Meta, TikTok) | Categorically blocked, content-based not transaction-based | N/A | **Not viable** |
| 5 | **Freemium / subscription** (end-user pays for premium features) | None — not a cannabis ad | Normal Stripe/card rails (verify MCC) | Moderate–High |
| 6 | Aggregated/anonymized data licensing | Low if aggregate-only | Standard B2B invoicing | Speculative, secondary |
| 7 | Donations / tip jar | None | Platform-standard | Minor, supplementary |
| 8 | White-label / B2B platform licensing | None (software, not ad) | Standard B2B | Speculative |

**Detail on each option, including precedent pricing (Weedmaps $400–$1,500/mo featured listings, Leafly $600–$4,000/mo CPM packages) and sourcing, is in the companion working file:** `monetization-wa-cannabis-deal-aggregator-research-2026-06-23.md`.

---

## 3. Aggregator vs. Dispensary: How Each Platform Draws the Line

The question: does *showing deals/prices* (no checkout) get treated better than direct sales promotion? Answer — it depends which kind of platform:

| Platform | Type | Informational vs. transactional carve-out? | The actual line |
|---|---|---|---|
| Google Ads | Paid ads | None | Bans both "facilitating" *and* purely "instructional/informational" drug content |
| **Google AdSense** | Self-monetization | **None** | Cannabis-topic content is uniformly restricted as "dangerous content" — no journalism/aggregator exception. **Closes off self-serve ad revenue entirely**, regardless of tone |
| Meta | Paid ads | **Partial** — explicit exception for "educate/advocate/PSA" vs. "promote/offer sale" | A literal price/deal card ("$5 off at Store Y today") likely still reads as "offering for sale" |
| TikTok | Paid ads | None | Blanket ban, no exception found |
| Apple App Store | App distribution | N/A — most permissive | Allows even full in-app cannabis checkout for licensed dispensaries since 2021 |
| **Google Play** | App distribution | **Yes — clearest line in this research** | Bans in-app cart/checkout/delivery arrangement; informational/location apps are explicitly compliant |
| Mantis / Traffic Roots | Cannabis-vertical ad networks | N/A — built outside the mainstream framework | Accept both dispensary and aggregator/media content without distinction |

**Synthesis:** Ad-*buying* platforms judge the ad creative's claim (promotional vs. educational), not who runs the site. Ad-*serving* self-monetization (AdSense) doesn't distinguish at all — it's closed regardless of framing. App-*distribution* platforms are the only place a bright, actionable line exists, and it's about transaction execution, not content — Happy's current no-checkout design already clears that bar on both Apple and Google Play.

This round did not surface a new safe ad lever; it confirmed AdSense is closed and clarified that app-store distribution is not currently a compliance risk for Happy's design.

---

## 4. Open Questions (flagged, not resolved)

1. Does a paid "featured" card on an *unlicensed* aggregator legally require the same 4 WAC warning statements licensees must use? LCB FAQ implies yes but doesn't say so explicitly for third-party platforms — ask WSLCB or counsel.
2. Current live payout terms for Mantis/Traffic Roots at Happy's traffic scale (sources reviewed were third-party, not the networks' own current rate cards).
3. Whether any WA-licensed dispensary chain runs a direct affiliate program (not found via web search — may require direct outreach).

---

## Key Sources

- [WAC 314-55-155](https://apps.leg.wa.gov/wac/default.aspx?cite=314-55-155) · [LCB Cannabis Advertising FAQ](https://lcb.wa.gov/enforcement/cannabis_advertising_faqs) · [Gleam Law — 2026 rule changes](https://www.gleamlaw.com/blog/cannabis-law/new-cannabis-advertising-rules-in-washington/)
- [Mantis Ad Network](https://www.mantisadnetwork.com/) · [Traffic Roots overview](https://dabconnection.com/traffic-roots/)
- [Weedmaps vs. Leafly pricing](https://cannaplanners.com/learn/weedmaps-vs-leafly) · [isenselogic pricing detail](https://isenselogic.com/how-much-does-leafly-weedmaps-charge/)
- [Cannabis payments/banking 2026 overview](https://www.cannabisregulations.ai/cannabis-and-hemp-regulations-compliance-ai-blog/hemp-cannabis-payments-banking-2026)
- [Google Ads — Dangerous Products policy](https://support.google.com/adspolicy/answer/6014299?hl=en) · [Google AdSense Publisher Restrictions](https://support.google.com/adsense/answer/10437795?hl=en)
- [Meta — hemp/cannabis ad policy](https://transparency.meta.com/policies/ad-standards/content-specific-restrictions/hemp)
- [Apple lifts cannabis app ban (2021)](https://ganjapreneur.com/apple-lifts-ban-on-cannabis-delivery-apps-in-app-store/) · [MJBizDaily on Apple vs. Google](https://mjbizdaily.com/apples-new-cannabis-app-rules-benefit-marijuana-businesses-but-google-a-holdout/)
- [Google Play cannabis app policy](https://indicaonline.com/blog/google-changes-policy-prohibit-cannabis-apps-play-store/) · [Gummicube summary](https://www.gummicube.com/blog/google-play-restricts-apps-for-marijuana-alcohol-and-tobacco/)
