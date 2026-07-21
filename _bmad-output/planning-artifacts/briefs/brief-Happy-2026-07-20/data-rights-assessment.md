# Data-Rights Assessment — Gma's Helper B2B Data Licensing

Not legal advice. I'm not a lawyer. This is a research-grounded risk map whose job is to
tell you where the real exposure is and to make a WA attorney conversation cheap and sharp
instead of open-ended. It advances (does not close) the data-rights gating risk in the brief.

Date: 2026-07-20. Grounded in current (2024–2026) US scraping case law, Dutchie's terms, and
copyright-of-facts doctrine — sources at the bottom.

## Bottom line up front

The thing you'd sell — derived factual analysis (medians, price-position, deal-depth, trends),
not raw menu dumps — is the single most defensible category of data to resell under US law.
Prices are facts, and facts aren't copyrightable (Feist). So copyright is a weak threat to you.

Your real exposure is not copyright and not criminal hacking law. It's breach of contract —
Dutchie's Terms of Service, which explicitly forbid scraping and forbid reselling/derivative
works. Whether those terms actually bind Gma's is genuinely uncertain and fact-specific, and it
turns on things in your own pipeline you can control. That's the good news: the biggest lever is
yours.

## The four risk vectors, ranked

1. Breach of contract / Dutchie ToS — the real one. Dutchie's terms explicitly prohibit
   "data mining, robots, scraping or similar" and prohibit "modifying, copying, framing, scraping,
   renting, leasing, loaning, selling, distributing or creating derivative works based on the
   Service or Service Content." A paid B2B product built on that data is squarely what those words
   target. The open question is whether you're bound by them at all (see "the hinge" below).

2. Circumventing access controls — the multiplier. Dutchie's terms specifically prohibit
   evading IP blocks ("masking their IP address or using a proxy IP address"). Your pipeline
   currently beats the Vercel "Security Checkpoint" using residential IPs. For a free consumer site
   that's a gray area; for a paid product it's the weakest point in an otherwise strong "we only
   read public data" defense. In hiQ, the scraper's evasion/fake-account behavior is exactly what
   turned a winning case sour. Evasion converts "accessing public data" (defensible) into
   "circumventing controls" (not).

3. Whose relationship you're straining. Dutchie is the platform, but the menus are the
   dispensaries' own listings. Selling Store A its rivals' scraped prices can (a) extend ToS/IP
   exposure to your buyer, and (b) sour the very stores you depend on for data. This is a
   business-relationship risk as much as a legal one.

4. WA-specific privacy (low, but flag it). Washington's My Health My Data Act is aggressive on
   "consumer health data," and cannabis is health-adjacent. This almost certainly does NOT bite you
   because you handle product/price/menu data, not consumer purchase or identity data — but the
   moment any consumer-level data enters the product, this becomes a landmine. Keep the B2B product
   strictly product-and-price, never consumer.

## The hinge: are you even bound by Dutchie's terms?

This is the whole ballgame, and current case law cuts partly in your favor:

- Meta v. Bright Data (2024): a court declined to hold a scraper in breach for scraping public,
  logged-out Facebook/Instagram pages, reasoning that the terms govern account holders and users —
  not logged-out visitors. Gma's scrapes public, embedded, logged-out menus. That's the same shape.
- hiQ v. LinkedIn: scraping public data isn't a federal computer-crime (CFAA) violation. So the
  criminal-law threat is largely off the table as long as you stay logged-out and don't evade blocks.
- But the trend is toward enforceability against commercial, "sophisticated" actors. In OCLC v.
  Anna's Archive (Jan 2026), a court held a sophisticated party bound by browsewrap terms merely by
  accessing the service. A paid B2B data company is exactly the "sophisticated commercial actor" a
  court is least sympathetic to.

Net: if the scraping identity never holds a Dutchie account, never clicks "I agree," stays
logged-out, and doesn't evade access controls, you have a real Bright Data–style argument that
you're not bound. Every one of those conditions you break moves you toward OCLC territory.

## What the "derived facts only" posture actually buys you

It's the right call and the research backs it hard:

- Feist v. Rural (1991): raw facts and bare compilations aren't copyrightable; the Supreme Court
  killed the "sweat of the brow" theory. Prices are uncopyrightable facts.
- Public factual data (prices, inventory, public offers) is described across the sources as "the
  most defensible thing to resell… the bread and butter of legitimate competitor price monitoring."
- Selling medians/comparisons/deal-depth is doubly safe: it's factual AND transformed, not a
  verbatim copy of Dutchie's compilation. Copying the whole original compilation could infringe;
  publishing derived analysis of the underlying facts does not.
- The EU/UK "sui generis database right" (which can protect even factual compilations) does NOT
  apply — you're WA-only, US-only. One less thing.

So: never sell raw menu dumps. Sell analysis. You already decided this; it's well-founded.

## Cheap de-risking moves (do these regardless of the lawyer)

1. Keep the scraping identity account-less and logged-out. No Dutchie login, ever, on the
   ingest path. This preserves the Bright Data defense.
2. Treat IP-block evasion as the thing to fix or justify. This is your weakest point. Options:
   reduce reliance on it for the B2B data path, or be ready to explain it. Talk to the lawyer about
   this specifically before you build the paid product on top of it.
3. Sell "market intelligence / analysis," never "menu data." Language matters; frame and price
   the derived layer.
4. Turn buyers into authorizers (the elegant move). If the dispensaries who buy the product
   also agree — in the pilot contract — to authorize use of their own menu data and to receive
   competitive analysis, you convert unilateral scraping into a consented data arrangement for
   participants. A store that pays you for the intel has little standing to object to its own data
   being in it. This can shrink both the ToS and the relationship risk at once. Explore it in the
   discovery calls.
5. Keep it strictly non-consumer data. No purchase data, no shopper identity — stays clear of
   WA My Health My Data Act.

## The actual validation step: questions for a WA attorney

You don't need a big engagement — you need a scoped read (a few hours) answering:

1. Given Gma's scrapes public, logged-out Dutchie-embedded menus with no account, are we bound by
   Dutchie's Terms of Service at all? (Cite Meta v. Bright Data; ask how a WA court would likely
   treat it.)
2. Does our current practice of using residential IPs to pass a "Security Checkpoint" / avoid
   blocking change that answer or create separate exposure? What would we need to change?
3. Is licensing DERIVED factual analysis (medians, price-position, deal-depth, trends) — not raw
   menus — legally defensible to sell commercially in WA?
4. Would having buyer dispensaries contractually authorize use of their own menu data materially
   reduce our risk?
5. Any WA My Health My Data Act exposure if the product stays strictly product/price and never
   touches consumer data?
6. What contract language on the buyer side limits their exposure (and ours) if Dutchie objects?

If the answers come back "you're likely not bound if you fix the IP-evasion point, and derived
facts are defensible," the gating risk is effectively cleared. If they come back "a WA court would
probably bind you as a commercial actor and the derivative-works clause reaches your product,"
that's a real stop sign — and better to know for a few hundred dollars now than after you've built
and sold it.

## Verdict on the gating risk

Downgraded from "unknown, possibly fatal" to "known, likely manageable, one control to fix and one
lawyer call to confirm." The derived-facts posture is sound. The one thing in your own pipeline
that most weakens your position is the IP-block circumvention, and that's yours to change. This is a
de-riskable gate, not a wall — but it is not cleared until a WA attorney signs off on the six
questions above.

## Sources

- Dutchie Terms of Service (scraping / derivative-works / IP-evasion prohibitions):
  https://dutchie.com/terms
- Meta v. Bright Data (2024) and hiQ v. LinkedIn (CFAA / public-data): summarized in
  https://scrapingapi.ai/blog/legal-battles-that-changed-web-scraping and
  https://use-apify.com/docs/what-is-apify/is-apify-legal
- Browsewrap enforceability / breach-of-contract as the primary tool; OCLC v. Anna's Archive
  (Jan 2026): https://www.crowell.com/en/insights/client-alerts/recent-court-rulings-provide-warnings-on-the-use-of-browsewrap-agreements
  and https://www.ropesgray.com/en/insights/alerts/2026/05/web-scraping-in-the-age-of-ai-guidance-for-data-owners-and-scrapers
- Feist v. Rural / facts-not-copyrightable / selling public factual data:
  https://www.bitlaw.com/copyright/database.html and
  https://scraping.pro/what-is-legal-scrape-or-scrape-sell-or-code-scraper/
