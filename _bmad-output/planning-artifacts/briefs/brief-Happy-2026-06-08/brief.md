---
title: "Product Brief: Gma's Helper (working title)"
status: complete
created: 2026-06-08
updated: 2026-06-08
---

# Product Brief: Gma's Helper (working title)

## Executive Summary

Gma's Helper is a single-page web app that answers one question: is the cannabis happy-hour deal near you actually worth the drive, right now? Set a distance, and the page shows every active deal within road-driving range of your location — each one paired with a straightforward comparison of what you'd spend in gas to get there against what you'd save on the deal. No store browsing, no discovery rabbit holes, no app-store gatekeeping. Just: here's what's on, here's what it costs you to find out — now decide and go.

It exists because the obvious version of this — a deals aggregator — already exists in fragments across Weedmaps, Leafly, and a dozen dispensary text clubs, but none of them answer the only question that actually matters before you get in the car.

## The Problem

Cannabis happy-hour deals exist, but finding out whether one is *actually* worth pursuing right now is a mess. Deals live scattered across SMS clubs, Instagram stories, and dispensary-by-dispensary listings — there's no single place that shows what's active nearby at this moment. And even when you find one, nothing tells you whether the trip pencils out: a 30%-off deal twenty-five miles away might cost you more in gas than it saves. People are left guessing — driving on a hunch, skipping deals that would've been worth it, or showing up to find the "deal" wasn't what they expected.

This hits hardest for people who aren't deeply plugged into the cannabis world: the returning buyer who's lost track of where to go and what things cost now, the budget-conscious regular who wants to optimize every trip, and the newcomer who doesn't know any of the local shops yet. For all three, the honest answer to "should I go?" simply isn't available anywhere — so they don't go, or they go on a guess.

## The Solution

Set a distance, and Gma's Helper shows every active happy-hour deal currently running within road-driving range — each one paired with a plain-language answer to "is this worth it?" Miles to the shop, gas cost to get there, savings on the deal, side by side. The page works the moment you load it: it estimates your gas cost using the current national average for vehicle efficiency, refreshed daily, no setup required. If you want it dialed in to your car, a small gear icon lets you pick your year, make, and model once — three taps, and it remembers. Either way, the comparison is instant and the math is honest.

## What Makes This Different

Every existing cannabis platform is built to make you browse — explore stores, scroll menus, discover new shops. Gma's Helper refuses that job entirely. It exists to answer one question and get out of your way: *is this worth the drive, right now?* That single-purpose stubbornness is the differentiator — not a bigger database or a slicker map, but the discipline to leave out everything that isn't "should I go."

The gas-cost-vs-savings comparison is the sharpest edge of that: nothing in the market — in cannabis or any deals vertical we could find — pairs a live discount against the real cost of getting to it. It's a simple calculation, which is exactly why no one's bothered to build it as the centerpiece of a product. Here, it *is* the product.

Honestly, this isn't a defensible moat in the technical sense. The math is simple enough that a competitor could copy it if they cared to. What's different is that no one with Gma's Helper's audience and focus is doing it — and being first, narrow, and right is worth something on its own.

## Who This Serves

**The returning buyer.** It's been a while since they last shopped. Prices have changed, favorite shops may have closed, and the landscape feels unfamiliar again. They open Gma's Helper to get re-oriented fast: what's good, what's close, what's actually a deal at today's prices — without re-learning a whole ecosystem first.

**The budget-conscious regular.** They smoke regularly, they're on a fixed or careful budget, and every trip is a small financial decision. They already know how to spot a deal — what they need is the missing half of the math: does this deal beat the cost of getting there? Gma's Helper gives them that answer in one glance, every time.

**The newcomer.** New to the area, or new to legal cannabis altogether — they don't have a mental map of local shops, prices, or norms yet. Gma's Helper hands them a starting point with no learning curve: here's what's near you, here's what it costs, here's whether it's worth going.

All three want the same thing in the end: walk away knowing the trip was worth taking — or skip it knowing they made the smart call.

## Success Criteria

At this stage, success is narrow and concrete on purpose: **does the page tell the truth?**

- A small test group (Erik, his wife, possibly a friend) uses Gma's Helper to find a deal, makes the trip, and confirms the deal shown matches what's actually offered in the store — price, terms, and timing all check out.
- The gas-cost-vs-savings math holds up too: the estimated cost to drive there and the savings on the deal both reflect reality closely enough to trust the "is this worth it?" verdict the page gave.
- No traffic targets. No revenue targets. No engagement metrics. If the information on the page — deals *and* the math behind them — reflects reality when someone walks in the door, the R&D phase has done its job.

This is deliberately a validation bar, not a launch bar — it exists to prove the core promise (the data and the math are both trustworthy) before any growth ambitions enter the picture.

## Scope

**In for v1:**
- Single-page web app, mobile-and-desktop friendly browser experience — no native app, no app-store presence
- User-set distance filter, calculated by road-driving distance (not straight-line radius) from a fixed starting base point: 50 road-miles from zip 98270 (Marysville, WA), excluding any destination requiring a ferry crossing
- Live feed of active happy-hour/deal listings, sourced by scraping/aggregating publicly available dispensary websites and menus — US-only, no manual curation or dispensary self-submission
- Each listing shows: distance to shop, gas-cost-vs-savings comparison
- Gas-cost calculation: defaults to a live, daily-refreshed US national average MPG (no setup required); optional precision mode lets a user select their vehicle's year/make/model (via fueleconomy.gov) and have it remembered
- Non-intrusive advertising (banner/sidebar only — no pop-ups, no interstitials) styled toward budget-aware adults who already know how to spot a good deal — not youth-marketed, not cannabis-culture branded
- An interface that's simply easy and intuitive to use — clarity and low friction for everyone, not a "simplified for seniors" design treatment

**Explicitly out for v1:**
- Store browsing, menu exploration, or any discovery flow beyond "what's active near me right now"
- Manual deal curation or dispensary self-submission/partnership pipelines
- Native mobile apps or app-store presence
- User accounts, profiles, saved favorites, order history
- Ordering, reservations, or any transactional functionality
- Coverage outside the v1 50-road-mile validation zone, or outside the US
- Aggressive monetization (interstitials, pop-ups, sponsored placement that competes with deal information)

The 50-mile zone around 98270 is where R&D and validation happen first — it's a starting point chosen for what Erik can personally verify, not a permanent ceiling on where this could go.

## Vision

If the R&D phase proves the core promise — that Gma's Helper tells the truth about deals and the math behind them — the next horizon is simple: let more people use it where it already works, and let it work in more places. That could mean opening the validation zone to a wider radius, moving or adding base points beyond Marysville, or simply letting word spread organically among the people it was built for.

What it won't become: a sprawling cannabis platform competing with Weedmaps and Leafly on their terms. If it grows, it grows by staying exactly what it is — the fastest, most honest answer to "is this worth the drive?" — for more people, in more places, without losing the thing that made it worth building in the first place.
