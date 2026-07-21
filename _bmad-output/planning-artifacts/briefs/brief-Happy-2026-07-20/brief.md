---
title: "Gma's Helper — B2B Data Licensing (WA Cannabis Price/Deal Dataset)"
status: final
created: 2026-07-20
updated: 2026-07-20
---

# Product Brief: Gma's Helper — B2B Data Licensing

## Executive Summary

Gma's Helper already runs a freshness-gated data pipeline that captures advertised shelf prices and
deals across Washington dispensaries and derives honest, comparative facts from them (for example,
"this price is a real drop versus the store's own median," not just a "% off" sticker). The same
engine that powers the consumer site is, underneath, a proprietary, longitudinal, store-level view
of what WA cannabis actually costs on the shelf, updated continuously — an asset most players in the
market do not have.

This brief proposes turning that asset into Gma's first real revenue stream: licensing the derived
price/deal intelligence to businesses, led by Washington dispensaries who are fighting a five-year
price war largely blind to where they actually sit against nearby competitors. The market research
(`market-wa-cannabis-deal-aggregation-market-research-2026-07-20.md`) identified this direction as
the neutrality-safe monetization path — one that pays before the consumer site reaches the traffic
scale that ad revenue requires, and that does not compromise the consumer-facing honesty that is
Gma's core advantage. The core claim — that dispensaries will pay for competitive price
intelligence — is a hypothesis this brief frames for validation, not an established fact (see Key
Risks & Unknowns).

The bet: a solo founder cannot out-spend Weedmaps or out-panel Headset, but can own a narrow,
truthful, hyperlocal slice of ground truth — real advertised WA shelf prices and deal depth, store by
store, over time — and sell that clarity to the people making pricing decisions.

## The Problem

Washington dispensaries are competing on price in a shrinking market (legal sales down five straight
years to ~$1.14B in 2025; an eighth of flower fell from ~$40 to ~$15), yet most are making pricing
and promotion decisions without a clear, current view of what competitors near them are charging.

How they cope today:
- Manually checking rivals' menus one by one — slow, partial, quickly stale.
- POS-panel analytics (e.g., Headset) that report aggregate market trends, not the specific "what is
  the store down the road advertising on flower right now, and how deep is their deal" granularity a
  store needs to react this week.
- Guessing, or matching the loudest "% off" banner — which the research shows is a noisy, unreliable
  value signal (the same product can be $25 / $35 / $45-with-a-sticker across three stores).

The cost of the status quo: mispriced shelves in a market where price is the primary driver of which
store a shopper chooses (77% of shoppers say promotions decide where they go). Under-cutting leaves
margin on the table; over-pricing loses the trip. Neither is visible without competitive ground truth.

## The Solution

License Gma's derived competitive price/deal intelligence for Washington, delivered as a recurring
product (not a one-off report):

- Where you sit: a store's advertised prices vs. nearby competitors, by category, refreshed
  continuously and freshness-stamped so buyers trust its currency.
- Deal depth, honestly measured: real discounting vs. the store's own baseline and vs. the local
  field — cutting through "% off" noise.
- Trends over time: the longitudinal WA price/deal history the pipeline has been accruing — useful
  for spotting drift, price-floor movements, and competitor patterns.

Delivered as a simple subscription: a lightweight dashboard and/or a periodic data feed
(CSV/API), scoped to a buyer's local market. The exact dashboard/feed mix is settled during validation. The emphasis is clarity and trustworthy recency, not a
heavy analytics suite — the same "honest, easy to believe" principle as the consumer product.

Critically, this is the derived/analytical layer (comparisons, medians, deal-depth facts), which is
both more valuable and more defensible than reselling raw scraped menus — and materially safer on the
data-rights question below.

## What Makes This Different

- Ground-truth granularity vs. panels. Headset and similar sell aggregate POS-panel market analytics.
  Gma's has actual advertised shelf prices and deal depth at named stores, updated continuously.
  Different altitude, directly actionable for a store's next pricing move.
- Freshness as a feature. The ok/stale/failed freshness gating that protects the consumer site
  becomes a selling point to data buyers who have been burned by stale menus — every figure carries
  its recency.
- Honest derived facts, not "% off" noise. The "vs. own median / real drop" derivation is a genuinely
  differentiated signal that headline-discount data cannot replicate.

## Data Rights & Legal Posture (gating risk)

The dataset is assembled largely by scraping Dutchie-powered and other store menus. A research-grounded
assessment (`data-rights-assessment.md` in this folder; not legal advice) downgraded this from an
unknown, possibly-fatal risk to a known, likely-manageable one — one control to fix and one scoped
lawyer call to confirm. It remains one of the two gating risks alongside unvalidated demand. What the
assessment found:
- Copyright is a weak threat. Prices are uncopyrightable facts (Feist), and licensing derived
  analysis (medians, comparisons, deal-depth, trends) — not raw menus — is the most defensible category
  of data to resell. This reaffirms the committed posture: sell analysis, never raw menu dumps.
- The real exposure is contract, not copyright — Dutchie's terms forbid scraping and reselling. The
  hinge is whether Gma's is bound at all: recent case law (Meta v. Bright Data) says terms govern
  account holders, not logged-out visitors, which is how Gma's scrapes public embedded menus — a real
  defense, though courts increasingly bind "sophisticated commercial actors."
- The biggest self-inflicted weakness is evading Dutchie's access controls (residential IPs past the
  "Security Checkpoint"). Evasion converts defensible public-data access into circumvention; this is the
  one control to fix or justify before building the paid product.
- Elegant mitigation: have buyer dispensaries contractually authorize use of their own menu data —
  shrinks both the ToS and store-relationship risk. Probe in the discovery calls.
- Validate-first, not ship-now: the gate is not cleared until a WA attorney signs off on the six
  scoped questions in the assessment.

Honest about the moat: the advantage is narrow-and-current WA ground truth, honest derivation, and an
already-running pipeline — not proprietary technology a funded competitor couldn't rebuild. The
defensibility is focus and freshness, not secrecy.

## Key Risks & Unknowns

Ranked. The first two are co-equal and gate the go/no-go decision; the rest shape whether and how it
works.

1. Demand and willingness-to-pay are unvalidated (biggest risk). No dispensary has confirmed it would
   pay for competitive price intelligence, or at what price. The whole direction rests on this
   untested behavior. Collapsing this risk takes real buyer conversations, not more analysis.
2. Data-rights / legal footing — co-gating, but now assessed and downgraded to likely-manageable
   pending a scoped WA attorney read; see Data Rights & Legal Posture above.
3. Value over do-it-yourself. Competitor menus are public; a store can check them manually or task a
   cheap VA. Gma's has to be enough faster/cheaper/clearer than DIY to justify a recurring fee. Unproven.
4. Coverage density is a precondition, not a feature. The intel is only useful to a buyer whose actual
   local competitors are covered. Current coverage (~21 stores, one region) limits who can be sold today;
   selling requires dense local clusters around each buyer.
5. Dutchie concentration. Dutchie is at once the data source, the platform whose ToS creates the legal
   exposure, and the menu host for many prospective buyers. One access change or objection breaks source
   and product together.
6. Buyer complicity and store relationships. Selling a dispensary its rivals' scraped prices may extend
   the ToS/IP exposure to the buyer and can sour relationships with the stores Gma's relies on for data.
7. Brand/neutrality optics. Serving the same dispensaries the consumer site judges risks eroding the
   shopper-side trust that is Gma's only moat, if it becomes known — distinct from the (already-guarded)
   rule that buyers can't influence the consumer view.
8. Spend into a shrinking market. The price war that creates the need is also squeezing the software
   budgets Gma's would sell into.
9. Solo-founder capacity. Productizing — dashboard, sales, support, legal — is a real, ongoing load on
   top of running the consumer site and pipeline.

Open questions: Which dense local WA cluster is the first sellable market? Will a paid pilot or signed
LOI — not a verbal yes — confirm demand at a price that clears the ~$1–2K/month target?

## Who This Serves

Primary — Washington dispensaries (competitive price intelligence). Chosen as the lead buyer (see
addendum for rationale — closest buyer, sharpest price-war pain, reachable by a solo founder). Note:
Leafbuyer's success selling marketing SaaS to stores is suggestive, not proof — competitive price
intelligence is a different product with a different budget (see Key Risks & Unknowns). They need to know where they stand on price versus nearby competitors, this week, to set
shelves and promotions. Success for them: fewer mispriced SKUs, sharper promotions, less manual
menu-checking.

Secondary — brands / producers. Want visibility into where their products land on shelves across
stores, and how deeply they're being discounted. Fewer, larger buyers; harder to reach; a later target.

Secondary — analysts / researchers / media / investors. Value the longitudinal, honest WA price/deal
history. Lowest volume, but low-effort to serve once the data is packaged.

## Success Criteria

- Validation (near-term): a defined ideal first customer in a WA cluster where their local competitors
  are already covered; ~5–10 real buyer conversations; ≥1 dispensary signals demand
  through a paid pilot or signed letter of intent — not a verbal yes, which is cheap talk.
- First revenue: ≥1 paying pilot for the WA price-intelligence product.
- Product integrity: buyers can trust recency — freshness clearly surfaced; no stale-data incidents
  in delivered feeds.
- Data-rights clarity: an explicit, documented legal posture the founder is comfortable selling on.
- Economics: pricing that clears a founder income target of ~$1–2K/month MRR at low buyer counts
  (roughly 10–20 stores at low-hundreds/month) — the whole point of B2B over scale-gated ads.

## Validation Plan (do this before building)

The go/no-go gate is demand, and it is tested by customer conversations — not by building the product
first. Formal first step:

- Run 5–10 discovery calls with WA dispensary owners/managers who set pricing, starting in the North
  Puget Sound cluster already covered (so any "yes" is a store Gma's could serve today). Script:
  `discovery-call-script.md` in this folder.
- These are learning calls, not sales calls: probe what they already do and already spend on
  competitor pricing. Past behavior and spent money are the only real signal; "sounds useful" is not.
- Proceed to build only if the pattern shows real, currently-expensive pain AND at least one store
  commits via a paid pilot or signed LOI (not a verbal yes).
- Resolve the data-rights posture (legal read) in parallel — the other gating risk.
- If calls come back lukewarm, that is a valid answer: do not build. It saves the weeks a false
  positive would cost.

## Scope

In (v1):
- WA-only, dispensary-facing competitive price intelligence.
- Only local markets where competitor coverage is already dense enough to be useful — coverage is a
  precondition to selling, not a later fix.
- Derived facts: competitive price position by category, deal depth vs. own baseline + local field,
  basic longitudinal trend.
- Simple delivery: lightweight dashboard and/or periodic feed (exact mix settled during validation).
- A resolved, documented data-rights posture.

Out (v1):
- Raw-menu redistribution.
- Brands and analyst products (sequenced later).
- Expansion beyond WA.
- Heavy BI/analytics tooling, real-time API at scale, predictive modeling.
- Anything that lets a buyer influence what the consumer site shows (would break neutrality).

## Vision

If it works, Gma's becomes the trusted source of ground truth on what cannabis actually costs in
Washington — the honest price/deal record for the state — serving shoppers on the front end and
businesses on the back end from the same pipeline. The consumer audience and the dataset compound each
other: more coverage makes the consumer product better and the data product more valuable. From there,
the same playbook (own one state's honest ground truth, license the derived intelligence) could extend
to a second market — but only after WA proves the model pays.
