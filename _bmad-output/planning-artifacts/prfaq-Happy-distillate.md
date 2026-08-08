---
title: "PRFAQ Distillate: Gmaslist WA Cannabis Price Index"
type: llm-distillate
source: "prfaq-Happy.md"
created: "2026-08-08"
purpose: "Token-efficient context for downstream PRD creation"
---

## Concept
- Growth/reach initiative (NOT a new product): a weekly, public, dated, AI-citable "WA Cannabis Price Index" built on Gmaslist's existing derivation engine + gmaslist.com.
- Thesis: original proprietary data is the #1 AI-cited content format in 2026; the engine already emits it; publish it + actively distribute (Reddit, press) to earn AI citations, since passive SEO publishing already reads 0/8 on the citation monitor.
- Customer = budget-conscious WA cannabis shopper. AI engines / press / Reddit = distribution channels, NOT the customer.

## The provable hook (real engine data, 2026-08-08)
- disparity-rollups.json avg spread by category: Flower 14%, Concentrate 12%, Vaporizers 20%, Pre-Rolls 24% (13–15 stores, 1,331 same-product disparities).
- Worst real cases (disparities.json): Donny Burger flower $14.40→$84 (4.83×); Phat Panda OG Chem $22.50→$60; Night Nurse cart $24→$60.
- Headline claim (honest, provable): same product routinely 12–24% apart, worst cases 2×–5×.

## Rejected / decided framings
- REJECTED soft "find the cheapest near you" headline → chose the hard, provable "5× more" disparity claim.
- CUT fabricated user quote (only ~18 users; no real quote exists). Re-add post-launch with real attribution. Never ship fake attribution.
- FIXED "statewide/across Washington" overclaim → "the Washington dispensaries it tracks, in northwest WA." Confirmed by Erik as a go.
- Founder attribution confirmed by Erik: "built by one person in Marysville / Erik, founder."
- Confirmed true + public-safe (Erik): no paid placement, no data selling, no revenue model yet.

## Requirements signals (for PRD)
- Auto-generate the weekly Index page from existing derived JSON (regional-price-floor.json, disparities.json, disparity-rollups.json, price-vs-own-median.json, cheapest-delivered.json). Must be code, not manual labor.
- Each weekly report = a permanent, dated page (permanence + date = what AI/search need to cite).
- GEO hardening: FAQ schema (JSON-LD), comparison tables, one bolded proprietary stat, visible "updated [date]" — Perplexity re-indexes within hours.
- Extend the existing staleness gate (ADR-086/111) to the PUBLIC surface: a stale price must NEVER be published as a current floor. Published+cited wrong price = credibility + possible legal liability.
- Define success metric: e.g. ≥2/8 monitored queries citing gmaslist.com within 12 weeks (unambiguous kill-switch).

## Competitive intelligence
- Weedmaps/Leafly are LISTINGS (one menu at a time) + pay-for-placement revenue. They can't add "sort by cheapest" without cannibalizing advertiser revenue → won't. THIS is the moat (business-model conflict, not tech). Durable while incumbents monetize placement.
- Directories/aggregators = RIVALS not distribution (prior strategy) → excluded from the plan.

## Distribution stack (ranked by speed to first-100 users)
1. Reddit — #1 AI-cited source, 3.9× ChatGPT citation multiplier. Rules: 2–4 wk credibility build, 90/10, DISCLOSE ownership on first mention, only answer where someone literally asks "cheapest X near [WA town]." UNAUTOMATABLE — the recurring human cost.
2. Press — free HARO stack: Source of Sources (free), Qwoted/Featured free tiers, #journorequest on X/Bluesky. High value / low hit rate.
3. AI citations — compounding long game, measured by existing weekly monitor (baseline 0/8).
- On-page GEO on /compare = fastest measurable feedback loop.

## Open questions / unknowns (flagged in Internal FAQ)
- LEGAL [must resolve before press]: does actively pitching cannabis price data implicate WAC 314-55-155 (WA LCB advertising)? Read the WAC; consult if ambiguous. On-site + Reddit lower-risk, can proceed meanwhile. Posture: facts-not-menus, no health claims, sells nothing (ADR-066).
- BANDWIDTH [Erik decision]: concrete weekly hours for Reddit? If ~0, lose the fastest channel; concept leans on slower AI-only bet.
- THESIS [measured]: will the Index get cited when /compare pages didn't? Kill-switch: 8–12 weeks, watch monitor.

## Scope signals
- IN (MVP): auto-generated weekly Index page + GEO hardening + public staleness gate + Reddit participation.
- IN (supports credibility/coverage): adding more WA stores.
- OUT/FROZEN: engine-first expansion (more Layer-2 derived facts) while the reach bet runs.
- OUT: Product Hunt (wrong audience), directory listings (rivals), paid ads (banned for cannabis).

## Verdict findings as actionable items
- Forged: provable data hook; business-model moat; honest positioning; exact strategic fit.
- Needs more heat: spec the Index artifact (URL/layout/schema/auto-gen); spec Reddit cadence + target subreddits; set a numeric success metric.
- Cracks: (1) unproven citation thesis → measured kill-switch; (2) legal exposure → resolve WAC before press; (3) solo bandwidth → commit weekly Reddit hours or accept AI-only path.
