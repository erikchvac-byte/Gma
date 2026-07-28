---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Launching gmaslist.com — building a portfolio of reach/discovery machines to drive raw visitors'
session_goals: 'Grow raw visitors from ~18/28d baseline. Generate a broad set of concrete, current (2026) marketing/discovery tactics, favoring "set up once, runs itself, tend occasionally" mechanisms. Layman-friendly; end in a detailed prioritized plan.'
selected_approach: 'AI-recommended single technique — Morphological Analysis'
techniques_used: ['Morphological Analysis']
ideas_generated: 12
context_file: ''
technique_execution_complete: true
---

# Brainstorming Session Results

**Facilitator:** Erikc
**Date:** 2026-07-26

## Session Overview

**Topic:** Launching gmaslist.com — going from "site is good" to "people (and AI assistants) actually find it."
**Goals:** Main north star = raw visitors. Build a portfolio of reach machines (set-up-once + tend/monitor). Current 2026 methods only. Layman-guided. End in a detailed prioritized plan.

### Context Guidance

- Reach is the current binding constraint (per STRATEGY.md), not the derivation engine.
- On-site technical SEO largely shipped: sitemap (Google+Bing), robots.txt, /about, /compare, llms.txt, structured data. Gap = off-site demand + discovery.
- Hard constraint: cannabis category → paid ads on Google/Meta effectively banned; GBP eligibility uncertain.
- 2026 reality: AI answer engines (ChatGPT/Claude/Gemini/Google AI Overviews) are a real discovery channel; site's honesty-gated facts are an asset there.
- Four rough territories: AI-search reach · classic organic SEO (built, needs authority) · local/social presence · constrained paid/GBP.

### Session Setup

Baseline: ~18 users / 28 days, near-zero organic. GA4 live (G-Z3EH6D5C89). Solo founder, layman in marketing, engineer instinct = automation + monitoring. Wants "many things set up once that run," plus a few he tends/feeds content.

## Technique: Morphological Analysis — Working Grid

### KEY STRATEGIC INSIGHT (Erik, 2026-07-27)
For most businesses, directories/aggregators are DISTRIBUTION. For gmaslist.com they are RIVALS — anywhere you'd normally "get listed" competes with you or will actively delist you. Therefore viable channels are ONLY ones where you are the SOURCE, not a listing: places you publish into or get cited by. Narrower but cleaner map.

### Column 1 — CHANNEL (locked, pending 2 clarifications)
IN:
- AI answer engines (ChatGPT/Claude/Gemini/Google AI Overviews) — PRIMARY
- Reddit / community forums (r/WAStateWeed, local subs) — high-trust, spam-allergic
- Google organic — baseline, already indexed

OUT:
- Paid social (cannabis ad bans)
- Email / SMS (site is no-signup/no-login by design; no accounts)
- Local/niche directories, Weedmaps-adjacent listings — competitors
- Cannabis deal aggregators — hostile, actively delist/undermine

RESOLVED: local news/blogs = IN 100% (cite-not-list). Organic YouTube/TikTok = IN.

### Column 2 — ASSET (locked)
Asset = ONE honest computed fact, rendered in whatever shape the channel wants (AI-answer page / Reddit reply / one-line stat / news hook / short video). NOT "marketing content" — surface the truth already computed, natively.

Real facts available (verified in derived JSON 2026-07-27):
- Same-SKU cross-store spread — e.g. Donny Burger (DOH) 7g: $14.40 @ 2020 Solutions N Bellingham vs $84 @ 2020 Solutions Pacific Hwy (~5x, same chain). GATE MUST VOUCH before any public use ($84 = possible parse artifact).
- Real drop vs product's OWN median — SugarLab Jealousy 3.5g @ Star Buds Bellingham: $10 vs $25 median = genuine 60% off.
- Regional price floors — clustered by geography (regional-price-floor.json).
- Special-event freshness, brand-store matrix, cheapest-delivered, dormancy.
- /compare already emits Dataset JSON-LD targeting GPTBot / Claude-SearchBot / PerplexityBot.

### Column 3 — AUTOMATION (locked)
A MIX: some fully auto-generated from the nightly pipeline; some tended on a set schedule (specific day/time, recurring). Erik's revealed preference: rank auto-compounding items highest.

### HONESTY / LEGAL RAILS (hard — every idea must obey)
Relational facts only, never a store's full menu. Washington only (WAC 314-55-155). No potency, no health claims, no discount-% banners. No cannabis imagery, age gate.

## Combinations (Channel × honest-fact-skin)

### Batch 1 — with Erik's ranking
1. AI-answer page × cross-store spread (auto-updates) — RANK 1
6. Machine-readable facts feed × AI crawlers (set-once, auto) — RANK 2
5. Organic short "deal autopsy" video (tend ~1/wk) — RANK 3
2. Reddit micro-answer × real-drop-vs-own-history (tend) — RANK 4
3. Local-news hook × "same product 5x price" — PARKED (Erik: fragile; one wrong public number unrecoverable; $84 parse-risk. Correct instinct.)
4. One killer stat × disparity rollups — no love, likely kill (pending confirm)

### Batch 2 — spun, awaiting reaction
7. Question-mining loop — auto-generate answer pages from ACTUAL queries (GSC, Reddit, PAA). (auto + light tend)
8. Freshness as a weapon — visible "as of today" on every page; nightly cron = ranking signal. (fully auto)
9. Honesty gate as the whole brand — "the tool that tells you when a deal is fake"; brand spine, through-line of all content.
10. Auto-generated local pages, one per store-cluster/town ("Weed price watch: Bellingham"). (auto)
11. Monthly Reddit value report — mod-approved, genuinely useful, builds standing. (tend, low-freq)
12. AI-citation monitor — scheduled job asks ChatGPT/Claude/Perplexity target Qs, logs whether gmaslist is cited; dead-man's-switch for REACH. (auto-monitor — matches Erik's stated wish)

### Batch 2 — Erik's dispositions
7. KEEP — but as the TARGETING system feeding #1/#10, not a standalone channel. "Pull actual phrases": Google Search Console (already connected via 7/25 sitemap; thin now due to low traffic, compounds as reach grows) + Bing Webmaster Tools; seed early from Google autocomplete, People Also Ask, Reddit search, Google Trends (WA). Competitor keyword recon (Semrush/Ahrefs/Similarweb free tiers on weedmaps.com/leafly.com) = modeled/estimated; mine their GAPS (local + price-comparison intent they answer badly), never copy their national head terms.
8. KEEP — nightly baseline; add midday run ONLY if prices move intraday. Freshness claim MUST be gated on successful ingest (never say "today" if cron failed).
9. KEEP but REFRAMED (Erik correction): self-referential/pro-shopper standard ("we only show a drop when it's genuinely below its OWN history — no fake banners"), NOT accusatory "we catch fake deals / others lie". Publicly calling out licensed retailers invites WA ad-rule trouble.
10. KEEP (strong) — regional-price-floor.json already clusters stores geographically (shipped). One SSR page per cluster serves BOTH humans (readable) and crawlers (JSON-LD), like /compare.
11. REJECTED as "timid monthly" — Erik wants ACTIVE community presence; folded into #2. Reddit direction captured: r/WAStateWeed + local city subs; 9:1 helpful:promo; mods-first + whitelist ask; disclose authorship; reputation-first (domain can be spam-filtered).
12. LOCKED — definite build.

DROPPED: #3 (parked — fragile public single-number risk), #4 (killed), #5 (dropped — highest effort, cannabis-throttled, uncertain).

## FINAL PRIORITIZED PLAN (Erik-confirmed ordering 2026-07-27)

North star: raw visitors. Rails: relational facts only, WA-only, no potency/health-claims/discount-banners, never publish a number the honesty gate can't vouch for ($84 parse-risk).

### Phase 0 — Instrument & aim (this week, cheap, set-once)
1. AI-citation monitor [set-once auto] — stand up FIRST to capture a baseline before any change. (#12)
2. Targeting research [research, ~afternoon] — ranked list of ~30 real questions/products/towns from autocomplete + PAA + Reddit + competitor-gap recon. Aims Phase 1. (#7)

### Phase 1 — Compounding page machines (auto; extends /compare SSR + derived JSON; biggest lever)
3. AI-answer pages × cross-store spreads [set-once auto] (#1)
4. Local pages per cluster ("Weed price watch: <town>") [set-once auto] (#10)
5. Freshness stamp, gated on successful ingest [set-once auto] (#8)
6. Expand machine-readable JSON-LD / llms feed to new pages + real-drops + floors [set-once auto] (#6)
7. Honesty-standard page + template through-line [set-once, small] (#9 reframed)

### Phase 2 — Tended habit (start now in parallel; ramps over months)
8. Active community presence [tend, ~weekly] — reputation-first Reddit (#2 + real #11)

### Phase 3 — Optional/parked
- #5 video DROPPED. #3 local-news PARKED (revisit only after gate vouches a killer number).

### The loop (monthly "come back and check" ritual)
Read citation monitor + Search Console → see winning pages/questions → feed winners back into the Phase 0 target list → build more of what works. Machines run nightly; founder tends the aim monthly.

Sequencing logic: monitor first (see) → aim second (don't guess) → build auto machines third (max compounding leverage, Erik's strength) → tend community in parallel (slowest to ripen) → video/news optional upside.
