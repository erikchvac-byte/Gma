# WA Cannabis Price Index — Execution Plan

**Source:** `prfaq-Happy.md` + `prfaq-Happy-distillate.md` (PRFAQ completed 2026-08-08)
**Created:** 2026-08-08
**Principle:** Reddit is deferred and optional. The code foundation (Phases 1–2) carries the thesis on its own. Nothing here is gated on Reddit.

---

## Phase 1 — The citable asset (pure code, zero external risk) — DO FIRST

Goal: a permanent, dated, machine-citable Price Index page auto-generated from data the engine already produces. This is the whole foundation; everything else points at it.

1. **Auto-generate a weekly Index page** from existing derived JSON — no new derivation needed:
   - Sources already on disk: `regional-price-floor.json`, `disparities.json`, `disparity-rollups.json`, `price-vs-own-median.json`, `cheapest-delivered.json`.
   - Content: "Biggest same-product price gaps this week" (the 2×–5× hook), lowest price by category × region, biggest week-over-week drops.
   - Route: e.g. `/price-index` (current) + `/price-index/<YYYY-MM-DD>` (permanent dated archive). Permanence + a visible date = what AI/search need to trust and cite.
2. **GEO hardening** (the format 2026 research says gets cited):
   - JSON-LD structured data (Dataset + FAQPage schema).
   - A comparison table per section; one bolded proprietary stat up top; visible "Updated <date>."
   - Plain crawlable text (no numbers trapped in images/iframes).
3. **Public staleness gate** — extend the existing gate (ADR-086/111) to this public surface: a stale price must NEVER be published as a current floor. A published + AI-cited wrong price is the one thing that erodes the trust asset. Fail-soft to "data pending" over showing stale.
4. **Voluntary legal guardrails** (from WAC 314-55-155 review): visible 21+ notice; no health/therapeutic claims; factual/editorial tone; no "buy at store X" push; WA-scoped.
5. **Wire into the weekly pipeline** — MUST append the new page's data file to `$derivedFiles` in `derive-facts-local.ps1` (per prior lesson: anything not in that list never republishes) so the Index regenerates automatically each cycle.

**Definition of done:** a live, dated, schema-marked Index page that regenerates itself weekly with no manual step, and can never show a stale floor.

---

## Phase 2 — Make it findable + press (familiar channels, low risk)

Goal: get the asset discovered and measure the citation thesis. No Reddit required.

1. **Submit / ping:** add the Index routes to `sitemap.xml`; confirm in Google Search Console + Bing Webmaster Tools. Add to `/llms.txt`.
2. **Watch the monitor:** the existing weekly AI-citation monitor (baseline 0/8) is the scoreboard. Set the numeric target: **≥2/8 monitored queries citing gmaslist.com within 12 weeks.**
3. **Press via email (the HARO stack — familiar, not Reddit):**
   - Free: Source of Sources (Peter Shankman, honor system), Qwoted / Featured free tiers.
   - Watch #journorequest on X/Bluesky for WA / cannabis / cost-of-living queries.
   - You're a legitimate quotable data source: "one-person WA site tracking real dispensary price gaps." A single WA-news backlink is a top-tier discovery + citation signal.
   - (Optional cheap insurance before a big push: a short attorney read of RCW 69.50 advertising scope. Not a blocker for the small HARO responses.)

**Definition of done:** Index is in both webmaster tools, target metric set, and at least a few genuine HARO/press responses sent.

---

## Phase 3 — Reddit (OPTIONAL, deferred, hand-held) — only if Phases 1–2 are live

Goal: tap the fastest channel *if it fits*. Not a commitment; a toe-dip. Skippable with no loss to the core thesis.

1. **Read-only first.** Spend time just reading the WA cannabis subreddits to learn the culture. No posting.
2. **Small, genuine, disclosed.** When someone literally asks "cheapest X near [WA town]," answer with the real derived number and link, disclosing it's your site on first mention. 90/10 rule (help far more than you promote). No marketing language. No sockpuppets.
3. **Low volume, hand-held.** A handful of genuine answers, walked through together — not "N hours/week forever." If it feels wrong, stop. The thesis still runs on Phases 1–2.

**Decision deferred:** you do not commit Reddit hours now. Revisit only after the foundation is live.

---

## Kill-switch (honesty guardrail)

If the AI-citation monitor still reads ~0 after **8–12 weeks** of the Index being live + Phase-2 distribution, the citation thesis is falsified. Pivot — do not run it on faith. Cost to reach this verdict is low because Phases 1–2 are mostly automated.

## What this consciously freezes

Engine-first expansion (more Layer-2 derived facts) pauses while the reach bet runs — except adding WA stores, which directly improves coverage/credibility and helps the reach goal.

## Sequencing summary

1. Phase 1 (code) — the asset. **Start here.**
2. Phase 2 (findability + email press) — measure + light outreach.
3. Phase 3 (Reddit) — optional, deferred, only after 1–2.
4. Kill-switch check at 8–12 weeks.
