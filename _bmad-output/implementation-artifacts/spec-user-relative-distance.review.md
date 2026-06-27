# Code Review — chunk 2 (user-relative distance, CAP-2 + CAP-3)

High-effort multi-angle review (8 finder angles → dedup → per-candidate verify against source). Scope: the uncommitted chunk-2 diff on `feat/user-relative-distance`. 10 findings, correctness first.

**Resolution (2026-06-26):** FIXED in chunk 2 → #2 (status bleed), #3 (impossible-coord guard), #5 (exact-gas wiring test). DEFERRED to chunk 3 → #1 (empty feed = the out-of-scope slider reframe). OPTIONAL polish, not done → #4, #6, #7, #8, #9, #10.

```json
[
  {
    "file": "client/src/components/DealFeed.tsx",
    "line": 109,
    "summary": "Setting a location can empty the feed: the radius filter keeps undefined-distance stores but drops finite ones over maxDistance, hard-capped at MAX_DISTANCE_MILES=50.",
    "failure_scenario": "No location -> all distanceMiles undefined -> filter keeps everything (CAP-2, deals list). User sets a location whose nearest store is >50 road-mi away (e.g. Spokane 99201 — present in zipCentroids.wa.json — or any GPS coords; cap is hard, slider max is 50). Every store now exceeds the cap and is filtered out -> 'No active deals right now'. Setting a location flips the feed from full to empty. This is the ADR-057 #5 (slider reframe) gap, but it is user-visible now."
  },
  {
    "file": "client/src/components/LocationInput.tsx",
    "line": 59,
    "summary": "Transient status (zip-not-found / denied / unavailable) bleeds across LocationInput instances and across edits because the single useLocation status drives the error, never reset on field change or onboarding->bar transition.",
    "failure_scenario": "User types a non-WA ZIP in onboarding -> status='zip-not-found'. Clicks 'Not now' -> App renders LocationBar/LocationInput on the SAME hook instance -> the bar's empty ZIP field immediately shows 'Enter a Washington ZIP code.' on an untouched field. Same bleed for a GPS denial notice. Within one field: type bad ZIP -> error; edit to a valid ZIP -> the red error persists until the next submit (error is bound to status, not to current input)."
  },
  {
    "file": "client/src/hooks/useLocation.ts",
    "line": 30,
    "summary": "validate() accepts any finite lat/lng, including physically-impossible coordinates — no [-90,90]/[-180,180] (or WA) range check.",
    "failure_scenario": "A corrupted/hand-edited gma_location = {lat:1000,lng:5000,source:'gps'} passes validate() and is treated as a real location. applyUserDistance computes a huge bogus distance pill and gas figure presented as exact — a Honest-Math violation. Low likelihood (GPS/ZIP doors only ever write valid coords) but cheap to guard."
  },
  {
    "file": "client/src/components/LocationBar.tsx",
    "line": 37,
    "summary": "The bar's editor auto-collapses after a successful ZIP submit but NOT after a successful GPS set; `expanded` is also initialized once from `location===null` and never re-derived.",
    "failure_scenario": "User opens the bar (Change), taps 'Use my location', GPS resolves -> location set, but only handleZipSubmit calls setExpanded(false), so the editor stays open showing the two doors + 'Clear location' while the toggle reads 'Done' — inconsistent with the ZIP path which collapses to the summary. Recoverable via the toggle, but reads as a bug."
  },
  {
    "file": "client/src/components/DealFeed.distance.test.tsx",
    "line": 1,
    "summary": "No test asserts an exact gas value derived from a real haversine distance; every exact-gas assertion runs under a mocked/hardcoded distanceMiles, and the real-transform paths assert gas with only a loose /^\\$\\d+\\.\\d{2}$/ shape.",
    "failure_scenario": "A regression in the distance->gas wiring that still yields a dollar-shaped value — feeding great-circle instead of road distance, applying the 1.3 factor twice, or dropping the round-trip x2 into roundTripGasCost — produces a wrong-but-shaped $NN.NN and passes the entire client suite. Add one assertion: real coords -> known distance -> exact expected gas."
  },
  {
    "file": "client/src/App.tsx",
    "line": 33,
    "summary": "Onboarding step can flash for one paint when gma_location is set but gma_location_onboarded is false (key desync); initial `onboarded` is not derived from location presence.",
    "failure_scenario": "A returning visitor whose location persisted but whose onboarded flag was lost (partial storage clear, or a swallowed useLocalStorage write in private mode) renders LocationOnboarding on first paint (!onboarded), then the mount effect sets onboarded=true -> the modal visibly flashes over the feed. Fix: initialize onboarded as `stored || location !== null`."
  },
  {
    "file": "client/src/components/DealFeed.tsx",
    "line": 98,
    "summary": "applyUserDistance (.map + haversine + object clone for every store) plus the 6-pass filter/sort/group pipeline recompute on every render — including each useNow tick — with no useMemo; compounded by useLocation returning a NEW `location` object identity every render.",
    "failure_scenario": "Every ~60s clock tick (and every settings-sheet open / unrelated re-render) re-runs all haversines + clones + filters + sort + group, producing new array identities that defeat child memoization. validate() also returns a fresh {lat,lng,source} each render, so any future useMemo keyed on `location` would never hit cache. Wrap `located` in useMemo([data.dispensaries, location]) and stabilize the location object (memo on the raw stored value)."
  },
  {
    "file": "client/src/components/LocationOnboarding.tsx",
    "line": 15,
    "summary": "Focus-trap (FOCUSABLE const + Tab-wrap handleKeyDown + mount-focus useEffect) and all five modal style objects (overlay/card/tile/heading/context) are duplicated verbatim from AgeGate.",
    "failure_scenario": "An a11y fix to the focus trap (empty/single-focusable edge, dynamically-added focusables) or any modal design-token change must be made in two near-identical places and will silently drift between the age gate and the location step. Extract a shared useFocusTrap hook + a ModalShell (in components/ui) consumed by both."
  },
  {
    "file": "client/src/hooks/useLocation.ts",
    "line": 33,
    "summary": "Coordinate-validity is defined in ~4 places and WA-bounds literals triplicated; normalizeDispensaries' coord-strip is redundant with applyUserDistance's own self-guard.",
    "failure_scenario": "'finite lat/lng' is spelled out in useLocation.validate, normalizeDispensaries (strip), withUserDistance (typeof guard), and distance.ts (NaN guard) — with the transform's guard being a weaker `typeof` that silently relies on normalize running first. WA bounds (45.5–49.0 / −124.85 to −116.9) appear in geocodeStores.ts, the table-gen script, and zipCentroids.test.ts. A future change to either rule must be mirrored across copies or they diverge. Consolidate to one isFiniteCoord() and one exported WA-bounds predicate."
  },
  {
    "file": "client/src/utils/zipCentroids.ts",
    "line": 1,
    "summary": "zipCentroids.wa.json (605 entries) is statically imported at module top, landing in the main bundle and parsed at startup for every visitor including GPS users and skippers.",
    "failure_scenario": "Every first paint downloads + JSON-parses the full WA ZIP table before the feed is interactive, on a constrained Render-free bundle, even though it's only needed when a user types a ZIP. Lazy-load via `await import(...)` inside lookupZipCentroid (or code-split LocationInput)."
  }
]
```

## Known limitation (not a ranked finding)
- **Ferry / water crossings:** haversine x 1.3 understates trips that require a ferry (the table includes ferry-only USER ZIPs like 98250 Friday Harbor, 98070 Vashon). The spec explicitly scopes routing/ferry out ("approximate road distance only"), and the retired fixed-origin code never modeled ferries either — so this is an accepted approximation, not a regression. Worth a "~" prefix on the pill or a chunk-3 note.

## Verified clean
nearest-first sort handles undefined via `?? Infinity`; radius filter intentionally keeps undefined-distance stores (ADR-043); staleCount/freshDispensaries compute correctly on `located`; gas line guarded against undefined distance; normalize coord-strip IS wired into the runtime (useDeals); all ./ui primitives match usage; GPS error uses the spec-defined PERMISSION_DENIED idiom (works in all real browsers); no CLAUDE.md rule violations (TS strict, tests present, ADR-057 recorded).
