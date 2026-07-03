---
stepsCompleted: [1]
inputDocuments: []
workflowType: 'research'
research_type: 'consolidated (market + domain + technical)'
research_topic: 'Monetization options for a WA cannabis deal aggregator PWA'
research_goals: 'List all viable monetization options (ad networks, affiliate/referral, sponsored listings, permit-compliant alternatives) with restrictions/requirements per option. Findings only — no implementation.'
user_name: 'Erikc'
date: '2026-06-23'
web_research_enabled: true
source_verification: true
---

# Research Report: Monetization Options — WA Cannabis Deal Aggregator (Gma's Helper)

**Date:** 2026-06-23
**Author:** Erikc (research by Mary, Business Analyst)

---

## Research Overview

Findings-only survey of monetization paths for Happy (gmaslist.com), an unlicensed third-party PWA that aggregates WA dispensary deals/prices. Method: web search across market (ad networks, affiliate, competitor models), domain (WA cannabis ad law), and light technical (payment-rail) lenses. No implementation recommendation made.

**The governing constraint, stated once:** cannabis is federally Schedule III as of 2026-04-22 but remains federally controlled — Visa/Mastercard/Amex/Discover, Google Ads/AdSense, Meta, and TikTok all categorically prohibit cannabis advertising and, in Google's case, restrict ad inventory on cannabis-*content* publishers, independent of state legality. This closes off the mainstream/default monetization playbook and is the reason most options below route around it rather than through it. **None of this is legal advice — verify with a WA cannabis attorney and/or the WSLCB before committing revenue model.**

---

## A. WA Regulatory Frame (Domain Lens)

- **Governing rule:** WAC 314-55-155 (advertising requirements/promotional items), under RCW 69.50.369. LCB finalized updated rules effective 2026-07-04 (per ESB 5206, effective 2026-01-01) — expands signage but keeps content/placement restrictions. [WAC 314-55-155](https://apps.leg.wa.gov/wac/default.aspx?cite=314-55-155) · [Gleam Law summary](https://www.gleamlaw.com/blog/cannabis-law/new-cannabis-advertising-rules-in-washington/)
- **Does it reach an unlicensed aggregator?** Per the [LCB Cannabis Advertising FAQ](https://lcb.wa.gov/enforcement/cannabis_advertising_faqs): an independent, unlicensed website **can** accept ad revenue from cannabis businesses without itself being licensed. But content placed *as cannabis advertising* (e.g., a paid featured/sponsored store slot) likely must still carry the same substantive restrictions licensees face — this is the open question worth confirming with counsel.
- **If treated as cannabis advertising, mandatory content rules apply:**
  - 4 required warning statements (intoxicating/habit-forming; impairment while driving; health risk disclosure; 21+/keep from children)
  - No appeal to minors (no toys, cartoons, youth-coded imagery)
  - No therapeutic/curative health claims
  - No ads within 1,000 ft of schools, parks, playgrounds, daycares, libraries, arcades (geofencing relevant mainly for billboards/physical, less so for a PWA, but in-app store-locator features should be aware of it)
- **No explicit technical age-gate mandate found** for websites (only "caution" guidance for social media) — but 21+ framing is already Happy's posture.

---

## B. Monetization Options

### 1. Direct sponsored / featured store placement — **Highest viability**
Dispensary pays the platform directly for a featured card, priority sort position, or "boosted" deal — the Weedmaps/Leafly model, applied at much smaller scale. Happy already has the store relationships this depends on.
- **Precedent:** Weedmaps charges retailers $400–$1,500/mo (up to $10k+ in competitive markets) for featured listings; Leafly runs $600–$4,000/mo display packages on CPM. [CannaPlanners comparison](https://cannaplanners.com/learn/weedmaps-vs-leafly) · [isenselogic pricing](https://isenselogic.com/how-much-does-leafly-weedmaps-charge/)
- **Restrictions:** Almost certainly counts as "cannabis advertising" → 4 warning statements + no health claims + no youth appeal apply to the sponsored unit. Payment must travel over ACH/cash/cashless-ATM, not card rails (see §6).
- **Requirements:** Direct merchant agreements with each dispensary; no licensure needed for Happy per LCB FAQ, but compliance content (warnings) should be baked into the sponsored-card component, not assumed away.

### 2. Cannabis-vertical ad networks (Mantis, Traffic Roots)
Programmatic/display networks built specifically to accept cannabis/CBD/hemp creative that mainstream networks reject.
- **Mantis Ad Network** — DSP for licensed dispensaries + CBD/hemp/Delta-8/9 brands; reported to pay out more than Traffic Roots on display. [mantisadnetwork.com](https://www.mantisadnetwork.com/) · [review](https://thcaffiliates.com/mantis-ad-network/)
- **Traffic Roots** — display-only, cannabis-focused, San Diego-based since 2016. [dabconnection.com overview](https://dabconnection.com/traffic-roots/)
- **Restrictions:** Still subject to the same WA content rules if serving WA cannabis ads; revenue share/CPMs are modest vs. mainstream networks given the limited demand pool. Worth confirming current payout terms directly — third-party reviews vary.

### 3. Affiliate / referral programs — **Split finding, mostly low viability for core product**
Search turned up many affiliate programs, but almost all are for **hemp-derived/CBD/Delta-8 brands** (TribeTokes, Koi, PAX, Canna River, TRĒ House, Zamnesia) — these are federally legal-ish interstate commerce, hence affiliate-friendly with normal commission/cookie infrastructure (15–35% CPS typical). [Katalys guide](https://katalys.com/industries/marijuana-affiliate-programs/) · [Business of Apps CBD affiliates](https://www.businessofapps.com/affiliate/cbd/)
- **State-licensed THC dispensary affiliate programs are rare to nonexistent** in this search — consistent with the payment-rail problem (§6): there's no compliant way to pay an affiliate commission tied to an actual in-store THC sale through normal affiliate networks (Impact, ShareASale, etc., which run on card-network rails).
- **Viable affiliate layer:** accessories/glass, CBD/hemp products, food-delivery-to-the-munchies cross-sell, or non-THC adjacent retail — these can use normal affiliate infrastructure since they're not Schedule-anything goods.
- **Not viable (as found):** commission-per-THC-sale from a WA dispensary, absent a custom direct deal (which collapses back into Option 1).

### 4. Mainstream programmatic/display ads (Google AdSense/Ads, Meta, TikTok) — **Not viable**
- Google: AdSense/Ads "Dangerous Products" policy blocks marijuana promotion outright, and **publisher restrictions limit ad inventory on cannabis-content sites** regardless of what's being advertised — i.e., Happy's content itself, not just the ad creative, is the problem. Limited Canada-only pilot (search, Aug 2025–Dec 2026) doesn't apply to WA. [Google Ads policy update](https://support.google.com/adspolicy/answer/16851502?hl=en) · [Dangerous Products policy](https://support.google.com/adspolicy/answer/6014299?hl=en)
- Meta: blanket ban on all cannabis/THC/CBD ads, no exceptions, confirmed as of March 2026.
- TikTok: blanket ban on paid promotion of ingestible/smokeable cannabis, no certification path.
- **Conclusion:** this is the closed-off "default" path — confirms why cannabis-specific networks (Option 2) and direct deals (Option 1) exist as a category.

### 5. Freemium / subscription features — **Fully compliant, no cannabis-ad exposure**
Charge end-users (not dispensaries) for premium app features: deal alerts/push notifications, advanced filters, ad-free experience, multi-store route planning, price-history charts.
- **Restrictions:** None cannabis-specific — this is a SaaS subscription, not advertising. Still needs a card-payment-compliant flow (subscriptions to *the app* are not cannabis transactions, so normal Stripe/Apple/Google Pay rails should be fine — confirm with payment processor that the underlying business isn't flagged as "cannabis" by MCC code).
- **Requirements:** Needs enough perceived value to clear willingness-to-pay; thin margin on a free-data-aggregator unless premium tier is meaningfully differentiated.

### 6. Payment-rail reality check (Technical lens, brief)
- Visa/Mastercard/Amex/Discover prohibit cannabis transactions on interchange outright — this governs Options 1–3 if money flows *from dispensaries for cannabis advertising*. [cannabisregulations.ai 2026 payments overview](https://www.cannabisregulations.ai/cannabis-and-hemp-regulations-compliance-ai-blog/hemp-cannabis-payments-banking-2026)
- Compliant rails in active use industry-wide: ACH, cashless ATM, direct bank transfer/invoicing. Implies sponsored-placement deals (Option 1) get invoiced/ACH'd, not run through a card checkout.
- End-user subscriptions (Option 5) are a different transaction category (app subscription, not cannabis sale) and likely clear normal card rails — but get this confirmed by whichever processor is used, since some processors flag any cannabis-adjacent MCC.

### 7. Data licensing / aggregated insights
Sell anonymized, aggregated price/trend data (not individual user data) to brands, analysts, or market-research firms who want WA cannabis pricing trends.
- **Restrictions:** Not advertising, so the WAC 314-55-155 content rules likely don't attach — but WA consumer privacy law (My Health My Data Act covers some consumer data broadly) and general data-licensing diligence apply if any user-level data is involved. Aggregate-only data is the safer posture.
- **Viability:** Plausible secondary revenue line once there's enough data volume/history to be valuable; not a near-term primary option.

### 8. Donations / tip jar / Patreon-style support
No cannabis-advertising exposure at all — purely a "support this free tool" model.
- **Restrictions:** None cannabis-specific. Platform fees (Patreon, Buy Me a Coffee, Ko-fi) apply normally; some platforms' own policies on cannabis-adjacent creators should be spot-checked (not all are categorically hostile the way Meta/Google are).
- **Viability:** Realistically a minor supplementary line, not a primary revenue plan, given the typical yield of donation models at this audience size.

### 9. White-label / B2B licensing
License the aggregator platform itself (not ad space) to a dispensary chain, a different state's deal-aggregator entrant, or a media/local-news partner wanting a "deals" feature.
- **Restrictions:** Not advertising; this is a software-licensing deal, no WAC 314-55-155 exposure, ordinary commercial-contract terms.
- **Viability:** Speculative, depends entirely on finding a buyer; flagged for completeness, not assessed further here.

---

## C. Aggregator vs. Dispensary: How Each Platform Actually Draws the Line

Follow-up research question: does *showing deals/prices* (Happy's actual feature set) get treated the same as *direct sales promotion* by ad networks, Google, and social platforms — or is there a safe lane for informational/aggregator content? Findings below are platform-by-platform; the honest answer is **it depends which kind of platform you mean** — ad-buying platforms, ad-serving/monetization platforms, and app-distribution platforms each draw the line differently, and only one of the three gives aggregators a real break.

### Google Ads (buying paid search/display ads)
**No informational carve-out found.** Policy prohibits "ads for products or services marketed as facilitating recreational drug use" *and separately* "ads for instructional content about producing, purchasing, or using recreational drugs" — the second clause catches purely informational content too. A dispensary locator/directory could be read as "linking to" a sale even with no checkout. [Dangerous Products policy](https://support.google.com/adspolicy/answer/6014299?hl=en) · [analysis](https://cannaplanners.com/learn/google-ads-for-dispensaries)
**Verdict:** closed for both dispensaries and aggregators — no advantage to being "just a deals site" here.

### Google AdSense (monetizing your own content via Google's ad network)
**Also no informational carve-out — this is the most important negative finding of this pass.** Publisher Restrictions treat cannabis content uniformly as restricted "dangerous content," with no exception for journalism/education/aggregation. The policy explicitly states Google Ads won't serve on content labeled this way, regardless of whether the content sells anything. [Publisher Restrictions](https://support.google.com/adsense/answer/10437795?hl=en)
**Verdict:** Happy showing deals (vs. a dispensary showing deals) makes **no difference** to AdSense eligibility — the content topic itself, not the transaction, is what's restricted. This rules out AdSense as a lever regardless of tone or framing.

### Meta (paid ads)
**A real, explicit carve-out exists here — sharper than Google's.** Meta's hemp/cannabis policy permits ads that "educate, advocate, or give public service announcements," but prohibits ads that "promote or offer the sale of" THC/cannabis products. [Meta Transparency Center](https://transparency.meta.com/policies/ad-standards/content-specific-restrictions/hemp)
**Verdict:** the line is about ad *creative*, not who runs the platform. A deal card reading "$5 off [Strain] at [Store] today" plausibly reads as "offering for sale" even though Happy doesn't transact — so this carve-out likely doesn't rescue a deals-display ad, but a purely educational ad about the app's existence ("compare legal cannabis prices near you") might.

### TikTok
Blanket ban on paid promotion of ingestible/smokeable cannabis, no certification path, no informational exception identified. Same as Google Ads: closed regardless of aggregator framing.

### Apple App Store (app distribution)
**Most permissive of all five.** Since 2021, Apple explicitly allows apps to facilitate the *actual sale* of cannabis for licensed dispensaries (geo-restricted to the legal jurisdiction, from a legal entity) — Weedmaps added in-app purchase under this policy. [Ganjapreneur](https://ganjapreneur.com/apple-lifts-ban-on-cannabis-delivery-apps-in-app-store/) · [MJBizDaily](https://mjbizdaily.com/apples-new-cannabis-app-rules-benefit-marijuana-businesses-but-google-a-holdout/)
**Verdict:** Apple doesn't need the aggregator/dispensary distinction at all — informational locator apps are fine, and even a transactional app would be fine if Happy ever wanted to add checkout (not in scope here, findings only).

### Google Play (app distribution)
**This is the clearest, most actionable line found in this entire research pass.** Google Play prohibits apps with an in-app shopping cart, in-app arrangement of delivery/pickup, or facilitation of THC sale — but **apps that provide information and location services related to dispensaries remain compliant**, per Google's own stated guidance that developers can stay compliant by moving the shopping-cart flow outside the app. [IndicaOnline](https://indicaonline.com/blog/google-changes-policy-prohibit-cannabis-apps-play-store/) · [Gummicube](https://www.gummicube.com/blog/google-play-restricts-apps-for-marijuana-alcohol-and-tobacco/)
**Verdict:** the line is "does the app itself execute or arrange the transaction?" — not whether prices/deals are shown. **Happy's current feature set (price/deal display, no in-app checkout) already sits on the compliant side of this line as designed.**

### Cannabis-vertical ad networks (Mantis, Traffic Roots)
Built specifically to accept what mainstream networks reject — no informational/transactional split needed because the whole network exists outside that framework. Serves both dispensaries and cannabis media/aggregator sites without distinction.

### The line, synthesized
- **Ad-buying platforms (Google Ads, Meta, TikTok):** the line is about what the *ad creative* says, not who operates the site. Meta is the only one with an explicit informational exception, and even that likely doesn't cover a literal price/deal display.
- **Ad-serving/self-monetization (AdSense):** no line at all — cannabis-topic content is excluded uniformly, aggregator or not. This closes off the most common "just monetize your own traffic" path.
- **App-distribution platforms (Apple, Google Play):** the only place a *bright, actionable* line exists, and it's about **transaction execution, not content** — no in-app cart/checkout/delivery-arrangement. Happy's current no-checkout design already clears this bar on both stores.
- **Net implication for monetization (ties back to Section B):** the platforms that would make self-serve ad monetization easy (Google/Meta/TikTok) are closed regardless of aggregator framing, which is why Section B's top options (direct sponsored placement, cannabis-vertical ad networks, subscription) remain the realistic paths — this round didn't surface a new "safe ad lever," it confirmed the existing one (AdSense) is closed and clarified that app-store distribution is *not* currently a compliance risk for Happy's no-checkout design.

---

## Summary Table

| # | Option | Compliance exposure | Payment rail | Viability (as researched) |
|---|--------|---------------------|---------------|----------------------------|
| 1 | Direct sponsored/featured store placement | High — counts as cannabis ad | ACH/invoice, not card | **Highest** |
| 2 | Cannabis-vertical ad networks (Mantis, Traffic Roots) | High — cannabis ad content rules | Network-handled | Moderate |
| 3 | Affiliate/referral (THC dispensary) | High, and largely unavailable in market | N/A — rarely offered | Low/near-absent |
| 3b | Affiliate (CBD/hemp/accessories cross-sell) | Low | Normal affiliate networks | Moderate, secondary |
| 4 | Mainstream ad networks (Google/Meta/TikTok) | Categorically blocked | N/A | **Not viable** |
| 5 | Freemium/subscription (end-user) | None (not cannabis ad) | Normal card/Stripe, verify MCC | Moderate–High |
| 6 | — (payment rail constraint, not a revenue option) | — | — | — |
| 7 | Aggregated data licensing | Low if aggregate-only | Standard B2B invoicing | Speculative, secondary |
| 8 | Donations/tip jar | None | Platform-standard | Minor, supplementary |
| 9 | White-label/B2B licensing | None (software, not ad) | Standard B2B | Speculative |

---

## Open Questions / Recommended Next Verification

1. Does a paid "featured" card on an unlicensed aggregator legally require the 4 WAC warning statements? (LCB FAQ implies yes if it's "cannabis advertising," but ambiguous for unlicensed-platform-originated content — ask WSLCB or counsel directly.)
2. Current live payout terms for Mantis/Traffic Roots at Happy's likely traffic scale (review sources are third-party, not the networks' own current rate cards).
3. Whether any WA-licensed dispensary chain currently runs an affiliate program directly (not found in this pass — may need direct outreach rather than web search).

---

*Findings only, per request — no implementation taken.*
