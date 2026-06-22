---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
ideas_generated: ['#1 kill-marysville-origin', '#2 no-static-list', '#3 distance-only-sort', '#4 geoloc+zip-two-doors', '#5 location-on-agegate', '#6 centroid-cold-start-seed', '#E1 geocode-all-22', '#E2 slider-personal-reach-default-25', '#E3 ferry-chip']
workflow_completed: true
session_topic: 'Zone boundary honesty — rethink the 50-mile radius cap as something more dynamic'
session_goals: 'Replace fixed 50mi/98270/no-ferry cap with user-relative + honesty-labeled + soft-slider model; surface edge decisions (no-distance stores, ferry, drive-time vs miles)'
selected_approach: 'AI-recommended'
techniques_used: ['First Principles Thinking', 'Role Playing', 'Constraint Mapping']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Erikc
**Date:** 2026-06-21

## Session Overview

**Topic:** Zone boundary honesty — Bellingham/Ferndale/Port Townsend stores are valid; rethink the fixed 50-mile radius cap (ADR-008/011 origin 98270, no-ferry) as something more dynamic.

**Goals:** _(pending)_

### Session Setup

Approach: AI-Recommended. Planned flow: First Principles → Role Playing → Constraint Mapping.
Session ran decision-dense — Phase 1 (First Principles) resolved the spine; personas/constraints
folded in inline as edge questions rather than as separate phases.

## Technique Execution Results

### Phase 1 — First Principles Thinking (core decisions)

**[Principle #1] Marysville Was Never Load-Bearing.** The 98270 origin is an R&D fossil, not a
requirement. Distance is always user-relative. Retires ADR-008 (fixed origin) and ADR-011
(hand-distances).

**[Principle #2] No Static List Survives.** Ranking is computed live from location every load.
Nothing pre-sorted or hardcoded.

**[Principle #3] Rank by Distance to User, Period.** Feed orders nearest→farthest store. Deal
urgency (happy-hour countdown / expiry) shows on the card but NEVER reorders the list. One sort
axis, zero ambiguity. (Explicit correction: not "soonest-closing.")

**[Principle #4] Two Doors to Location, No Dead Ends.** Offer "📍 Use my location" (Geolocation
API, one tap, exact) AND a ZIP box (typed, familiar) side by side. Confident users tap; cautious
users type; the honest "no location yet" state covers anyone who does neither. Resolves
elderly-trust vs. exactness by refusing to pick one.

**[Idea #5] Location Lives on the 21+ Gate.** Fold the location ask into the existing AgeGate
screen everyone already passes (AgeGate.tsx wraps the whole app). After "Yes — I'm 21+", show the
location/ZIP controls right there. Reuses a mandatory interrupt; no second hurdle.

**[Idea #6] Store-Centroid as Cold-Start Seed (not a displayed number).** If the user skips
location, order the feed by distance from the DERIVED store centroid (currently ~Mount Vernon /
Skagit County — shifted north when the 18 were added; original-4 center was ~98270, which is *why*
Marysville worked early). Centroid SORTS the list into a sane geographic shape but shows NO
"X mi / $gas" until real location exists. Accepted trade-off: a skipping Bellingham user sees a
reasonable-but-not-hers order until she localizes. Preserves Honest Math (ADR-007/009).

**Data reality check:** 0 of 22 stores currently have lat/lng — `distanceMiles` is the legacy
98270 number only. Centroid must be derived after geocoding (Deliverable 2 work).

### Phase 3 — Constraint Mapping (edge decisions resolved)

**[Edge #1 → RESOLVED] Geocode all 22, not just the 4.** One-time dev script (Nominatim, free,
no key) geocodes every store address → lat/lng on the record. Avoids shipping a half-distanced
feed twice. Cost: confirm/derive 18 store street addresses for the script.

**[Edge #2 → RESOLVED] Slider becomes personal-reach control; default SHRINKS 50 → 25mi.** No
longer a hidden zone rule — it's the user's own "how far I'll drive" trim. Sort does the heavy
lifting; slider trims the tail. New default 25mi (realistic drive radius now that distance is
user-relative; widen-able to ~60). Tunable — 20/30 acceptable.

**[Edge #3 → RESOLVED] Manual per-store "🚤 ferry" flag.** Boolean on the store record (we know
which need a boat, e.g. Salish Coast / Port Townsend), rendered as a small chip on the card.
No routing engine/API. Doesn't affect sort — just tells the truth next to a road-distance that
can't see water. Honors the session's opening intent ("label effort truthfully").

## Idea Organization and Prioritization

### Thematic Organization

**Theme A — User-Relative Positioning** (the core reframe)
- Kill the 98270 static origin; distance is always user⇄store (#1)
- No static/pre-sorted lists; rank live every load (#2)
- Single sort axis: nearest store first; urgency shows on card, never reorders (#3)
- *Pattern:* "there is no zone, only relative distance." Retires ADR-008 + ADR-011.

**Theme B — Getting Location Honestly** (cold-start & input)
- Two doors: Geolocation API tap + ZIP box, no dead ends (#4)
- Put the ask on the existing 21+ AgeGate everyone passes (#5)
- Skip → order by derived store-centroid seed, but show NO distance/gas number until real
  location (#6). Preserves Honest Math (ADR-007/009).
- *Pattern:* exactness for the willing, familiarity for the cautious, honesty for the undecided.

**Theme C — Truthful Effort & Reach** (the edges)
- Geocode all 22 stores once (Nominatim dev script), so every store has real distance (#E1)
- Slider = personal-reach control, default shrinks 50 → 25mi (#E2)
- Manual "🚤 ferry" chip on stores that need a boat (#E3)
- *Pattern:* show far stores, but tell the truth about the cost — the session's founding goal.

### Prioritization (build order)

1. **Geocode all 22 + add lat/lng to records & type** — unblocks everything else (Theme C/E1, A).
2. **Location input on AgeGate (geolocation + ZIP) + "no location yet" state** (Theme B #4/#5).
3. **Live user-relative distance → feed roundTripGasCost + distance-only sort** (Theme A #3).
4. **Centroid cold-start seed, number-suppressed** (Theme B #6).
5. **Slider reframe, default 25** (Theme C/E2).
6. **Ferry chip** (Theme C/E3) — smallest, can ship last.

### Open items carried to the spec
- Confirm/derive 18 Dutchie store **street addresses** for the geocode script.
- Final slider default value (25 assumed; 20/30 acceptable).
- Which stores get the ferry flag (Salish Coast confirmed; check Whatcom cluster).

### Relationship to existing plans
This **supersedes and absorbs** the deferred "Deliverable 2" (per-user distance + gas) in
`deferred-work.md` — same geocode/ZIP/haversine engine, now expanded to all 22 stores + centroid
cold-start + ferry honesty + slider reframe. Will need a new ADR (proposed **ADR-044**:
"User-Relative Positioning Supersedes Fixed-Origin Distance") retiring ADR-008 and ADR-011.

## Session Summary and Insights

**Key Achievements:**
- Reframed a "boundary/cap" problem into a "reference-point" problem — the 50mi cap was never the
  bug; the static Marysville origin was.
- Produced a complete, internally-consistent positioning model in one focused pass.
- Resolved all three edge cases (geocode scope, slider meaning, ferry honesty) on the spot.

**Session Reflections:**
Erik ran in decision-mode — First Principles did the heavy lifting and the personas/constraints
folded in as targeted forks rather than open ideation. The single sharpest moment: recognizing the
original-4 centroid *was* ~98270, which is exactly why Marysville worked early and broke at scale.
