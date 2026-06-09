---
title: "Addendum: Gma's Helper (working title)"
status: draft
created: 2026-06-08
updated: 2026-06-08
---

# Addendum: Gma's Helper

Detail captured during brief drafting that belongs in downstream PRD / architecture / dev work — preserved here so it isn't lost between now and then.

## Gas Cost Calculator — Technical Specification

**Default behavior (no user input required):**
- Savings math uses the current US national average vehicle MPG.
- Sourced via a live web lookup, refreshed on a 24-hour cycle. No hardcoded value.
- The page is fully functional on this default — precision tuning is optional, never required.

**Precision mode (opt-in):**
- A small gear icon near the gas-savings display opens three cascading dropdowns: Year → Make → Model (each filters the next).
- Data source: [fueleconomy.gov public API](https://www.fueleconomy.gov/feg/ws/) — free US government API with proper endpoints intended for third-party use. (No scraping needed for this piece — confirmed legitimate public API.)
- Three taps total. Selection persists in the browser (e.g., localStorage) — user never repeats the setup.
- Panel collapses back to just displaying the resulting MPG number once set.
- Savings column uses the national average silently until/unless a user opts into their specific vehicle.

## Geography / Distance Constraint (technical detail)

- Service radius: 50 **road**-miles from zip 98270 (Marysville, WA), US only.
- Must be driving-route distance, not straight-line/as-the-crow-flies radius.
- Explicitly excludes any destination requiring a ferry crossing (e.g., Olympic Peninsula, Bremerton) — even if within straight-line range.
- Implies a routing/driving-distance API is needed (not simple geo-radius math) — a meaningfully different, and costlier, technical approach than a naive radius filter.

## Deal Sourcing — Constraints & Open Risk

- Sourcing method: scrape/aggregate from publicly available dispensary websites and menus only. No manual curation, no dispensary self-submission planned at launch.
- Open risk flagged during brief discussion: scraping carries ToS/legal exposure and operational fragility (breaks when a dispensary changes its site layout). Not a blocker for the brief, but something architecture/PRD work should address head-on — e.g., monitoring for breakage, a fallback when a source goes stale, and a position on scraping legality/ethics for cannabis retail sites specifically.

## Development Process Guidance (not brief content — travels with the project)

Erik wants implementation to start with a coaching/guided, step-by-step approach, and explicitly wants to be stopped and consulted if scope starts to bloat or expand silently. This is a standing instruction for whoever — or whatever agent — picks up downstream PRD/architecture/dev-story work on this project: not a product fact, but process guidance that should not get lost in translation.
