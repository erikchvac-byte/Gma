---
name: Gma's Helper
description: Experience contract for Gma's Helper (Happy) — IA, behavior, states, interactions, accessibility, journeys. Distilled at Finalize from .decision-log.md and imports/gmas-helper-design-system.
status: final
updated: 2026-06-19
sources:
  - _bmad-output/planning-artifacts/briefs/brief-Happy-2026-06-08/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-Happy-2026-06-08/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-Happy-2026-06-08/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - ADR.md
---

# Gma's Helper — Experience Spine

> Paired with `DESIGN.md` (visual identity; token references below use `{path.to.token}` against its frontmatter). Upstream requirements (UJ-1/2/3, FR-1…FR-13, ADRs) are inherited by reference from `sources` — not restated here. **The spines win on conflict with any mock, the import, or the UI kit.** Composition reference throughout: [imports/gmas-helper-design-system/ui_kits/app/index.html](imports/gmas-helper-design-system/ui_kits/app/index.html) (clickable age gate → feed → settings sheet).
>
> **Visual identity is the dark "Tidewater" reskin (ADR-037, 2026-06-19):** the behavioral contract below is unchanged, but the surface is dark-only with a single teal accent and the lowercase `gmas list` wordmark. "Gma's Helper" remains the internal product/project name; `gmas list` is the user-facing wordmark. Where rows below still read "Gma's Helper" as displayed copy, the shipped legal disclaimer text still uses that name pending an Erik/counsel rename decision.

## Foundation

Single-surface, phone-first web app. UI system = the **Gma's Helper design system** per `DESIGN.md` (ten primitives + composed surfaces, lifted from [imports/gmas-helper-design-system/](imports/gmas-helper-design-system/readme.md)). App context: Vite + React + TypeScript + Tailwind CSS v4 client against a single `GET /api/data` endpoint; server pre-filters to Active Deals; the client filters only by distance (ADR-015). All user state is localStorage (`gma_` keys) — no accounts, no server-side user data (NFR-6).

Stakes are **consumer**: real public users post-R&D. That sets the floor — WCAG AA, 44px targets, visible focus, keyboard complete, calm error states, age-gate rigor.

The product answers one question — "is this deal worth the drive, right now?" — and gets out of the way. Every behavioral rule below serves scan speed and trust; nothing invites browsing.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Age gate | First load (no `gma_age_confirmed`) | 21+ attestation with confirm + returnable decline; blocks all deal content (FR-13) |
| Header | Persistent after the gate | `gmas list` wordmark (page `h1`) + entry to vehicle settings (gear) |
| Deal feed | Default surface after the gate | Distance filter + sorted Active Deal cards + footnote lines (FR-1…FR-6) |
| Vehicle settings sheet | Header gear icon | Optional Year → Make → Model precision mode (FR-8) |

One column, one modal layer: the sheet (or the gate) is the only thing that ever sits above the feed — modal stacks never go two deep.

**IA closure.** Every user-facing PRD need lands on one of these four surfaces: deal visibility, sorting, countdowns, gas math, and the empty state on the **Deal feed** (FR-1–FR-4, FR-6); the radius control on the feed's **RangeSlider** (FR-5); MPG personalization in the **settings sheet** (FR-8); the legal gate on the **Age gate** (FR-13). FR-7 and FR-9–FR-12 are server-side with no user surface — their only UI traces are the "Last updated" line, the stale-source line, and deals simply being current. The operator scraper log (FR-12) is deliberately *not* an app surface; it is the `logs.json` file, read directly by Erik.

## Voice and Tone

Microcopy only — brand voice and aesthetic posture live in `DESIGN.md`. Plain, literal, sentence case, second person, present tense. No emoji, no cannabis-culture slang, no exclamation marks. Numbers are always tabular mono figures ({typography.figure}): `9.8 mi · $1.46 · 24 min left`. Voice specimen: [guidelines/brand-voice.card.html](imports/gmas-helper-design-system/guidelines/brand-voice.card.html).

| Context | Exact copy | Never |
|---|---|---|
| Age gate heading (ask) | "Are you 21 or older?" | "Verify your age to unlock" |
| Age gate sub (ask) | "Cannabis deals are for adults 21 and over only." | — |
| Age gate confirm | "Yes — I'm 21+" | "Enter" / "Let's go" |
| Age gate decline | "No, take me back" | "Exit" / scare copy |
| Age gate remember | "Remember me on this device" (checkbox, default on) | — |
| Age gate out-state (declined) | Heading "Come back at 21" + "You must be 21 or older to view cannabis deals." + "Go back" | A terminal dead-end with no way back |
| Empty feed | "No active deals right now" | "Oops, nothing here!" |
| Load error | "Couldn't load deals. Please try again later." | Raw error text, status codes, "Oops!" |
| Stale sources | "2 sources unavailable" / "1 source unavailable" | Warning banners, icons, alarm color |
| Freshness | "Last updated Jun 10, 7:45 AM" (pinned en-US format, ADR-022) | Relative spin ("Fresh as of…") |
| Discount Display | "30% off — $1.46 to get there" | "You could save up to 30%!" / any net-savings figure |
| Countdown | "24 min left" / "1 hr 36 min left" | "Hurry!" / "Ending soon!" |
| Window ladder (ADR-023) | "9:00 PM – 11:30 PM" / "9:00 PM – close" / "Until 11:30 PM" / "Active today" | Invented windows for malformed data |
| Distance filter | Label "Within", value "25 miles" (singular "1 mile"), ticks "1 mi" / "50 mi" | "Deals near you!" |
| Sheet explainer | "Set it once for exact gas math. Skip it and we use the national average (28 MPG)." | Pressure to configure |
| Vehicle resolved | "Estimated 32 MPG — gas cost will use your vehicle." | Celebration copy |
| Disclaimer footer (persistent, below the footnotes) | "Deals are set by each retailer and may change without notice — verify in store. Gma's Helper is not affiliated with any dispensary and sells nothing. Gas costs are estimates based on average fuel prices and rated MPG." A reserved slot follows for WA mandatory-warning text, pending counsel. | Legalese walls, popups, burying it off-surface |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md → Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Button | Age-gate confirm; sheet actions | One `primary` per surface — it is the single go action. `danger` reserved; no destructive actions exist in v1. Disabled buttons stay visible (50% opacity), never hidden. |
| IconButton | Header gear; sheet close | `aria-label` required ("Vehicle & settings", "Close"). Gear opens the sheet; focus moves into it. |
| Badge | Deal type; source status | `urgent` ⇄ happy hour, `neutral` ⇄ daily deal — type is shown by badge, never by color alone. `fresh`/`stale` (dotted) and `discount` exist for status/specimen use; the v1 feed omits stale dispensaries instead of badging them (ADR-026). |
| Card / Deal card | One per deal row | Purely presentational — all strings (window ladder, countdown, gas text) computed in the feed and passed down (ADR-023). `urgent` tint iff type is happy hour. Cards are not links in v1 — no navigation exists. `interactive` styling only if a future tap action ships. |
| RangeSlider | Distance filter, top of feed | 1–50 whole miles, default 25, persisted as `gma_distance_miles`. Out-of-contract stored values (garbage, fractional, out-of-range) **fall back to 25 — never clamped** (ADR-025). Filtering is `distanceMiles <= max`, client-side on in-memory data: zero network on change. Slider stays visible when filtering empties the feed. Painted thumb is 22px inside a 44px hit target; behaves as (or is) a native `input[type=range]` — a tap on the track sets the value directly, the single-pointer alternative to dragging (2.5.7). Accessible name "Within" programmatically associated; `aria-valuetext` mirrors the visible copy ("25 miles" / "1 mile"). On settle (debounced, never per-tick), one polite status line announces "N deals within X miles" so re-filtering is never silent to screen readers. |
| Select | Year → Make → Model cascade in the sheet | Cascading: each choice populates the next; Model disabled until Make; changing an upstream select resets downstream ones. Data from fueleconomy.gov (`Accept: application/json`, single-entry normalization). MPG resolves via first-trim policy — three dropdowns, never a fourth (ADR-028). On completed selection the resolved MPG applies to every card in the same render pass, the panel collapses to show the vehicle + MPG, and the pair persists (`gma_vehicle_mpg` as a JSON number + `gma_vehicle_label`). The three Selects stack one per row (no 320px reflow breakage; three taps either way). While a menu loads, one polite `role="status"` line speaks ("Loading models…") — copy only, within the ADR-028 deferral of spinners/timeouts. |
| TextField | None on v1 primary surfaces | Reserved (built primitive). Earmarked for a future manual "Your MPG" input (ADR-013 fallback idea). |
| Skeleton / SkeletonFeed | Feed cold load | 3 card-height rows in the feed's exact geometry. Pulse stops under reduced motion. Never used as a spinner replacement elsewhere. |
| Notice | Footnotes, errors, sheet info | `muted` = the quiet lines: "Last updated …" (a `<time datetime="…">` element; visible format unchanged, ADR-022), the stale-source count, and the standing disclaimer footer. The dynamic footnotes form one ordered status region — last-updated/empty first, stale count second; the disclaimer is static text, never announced. `error` = calm fixed copy only — raw errors never render (ADR-022). `default` + fuel icon = the sheet's resolved-MPG line, `role="status"` so the confirmation is heard the moment sighted users see it. |
| Stale source line (Notice muted) | Below the feed | Count derives from the **full API array, radius-independent** (a stale source 40 miles out still counts at any slider setting); strict `stale === true` predicate drives both omission and count so they can't disagree; renders nothing at 0 or non-integer (ADR-026). |
| Header | Persistent | Sticky at top. The lowercase `gmas list` wordmark (Space Grotesk + teal set-dot) is the page's only `h1` and is static (no home navigation — there is nowhere else to go). The scroll container sets `scroll-padding-top` (header height + 8px) so backward tabbing never hides a focused element under the sticky header (2.4.11). |
| Age gate | First load | Two-option gate (ADR-036, builds on ADR-035's decline; supersedes ADR-021): confirm + **returnable** decline ("No, take me back" → "Come back at 21" out-state with a "Go back" return to ask). A "Remember me on this device" checkbox (default on) controls persistence — checked persists `gma_age_confirmed`, unchecked grants a session-only pass. Decline is session-only, never persisted. Strict `=== true` storage check; corrupted values re-show the gate. A real `Tab` focus-trap holds focus inside the gate. |
| Settings sheet | Gear | Bottom sheet over the flat scrim. Focus moves to the sheet title (or first Select) on open and is trapped within the sheet while open; closes via close IconButton, scrim tap, or Esc; on close, focus returns to the gear. Skipping (closing without a vehicle) is always allowed — the default path needs zero setup. A "use national average" action clears the stored vehicle. Per FR-8, a completed Year→Make→Model selection applies immediately — there is no mandatory Save step (the import mock's explicit "Save vehicle" button is superseded by this spine). |

Deal feed assembly order (fixed): omit stale → distance filter → client expiry (only fully-valid timed windows expire client-side; every degenerate time shape mirrors the server and stays) → sort. Sort tiers (ADR-022): **timed happy hours by countdown ascending → untimed happy hours (stable input order) → daily deals by discount descending.** Countdown ticks on a single 60s clock; expired timed deals drop off as their window closes. If the focused element sits inside a card removed by expiry or filtering, focus moves to the next card — or to the slider when none remain — never silently to `<body>`.

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold load | Deal feed | SkeletonFeed (3 rows) below the slider. No spinners, no layout shift on resolve. SkeletonFeed is `aria-hidden="true"` with the feed region `aria-busy="true"` while loading; the always-visible "Last updated …" status line doubles as the loaded announcement (4.1.3). |
| Populated | Deal feed | Sorted cards; "Last updated …" line always visible below the rows (FR-3), with the standing disclaimer footer beneath it (see Voice and Tone). |
| Empty (no deals in range) | Deal feed | Notice muted: "No active deals right now" + the last-updated line. Slider remains visible and usable. Same copy whether the zone is empty or the filter emptied it — ruled 2026-06-12 (ADR-025's Ask-First satisfied). |
| Load error | Deal feed | Notice error: "Couldn't load deals. Please try again later." Fixed copy; nothing technical leaks. |
| Offline | Deal feed | Same as load error on cold load; a populated feed keeps working — all interaction is local (single fetch, client-side filtering). |
| Stale sources | Deal feed footnote | Single muted line, "N source(s) unavailable", `role="status"` — informs without nagging (ADR-026). Coexists with the empty state. |
| Gas cost incomputable | Deal card | Render the discount alone ("30% off") — never a broken fragment, never `$NaN` (ADR-024 null-propagation). |
| No vehicle set | All gas math | Silently uses National Average MPG (28). No prompt, no nag — precision is opt-in (FR-6). |
| Corrupt stored prefs | Gate / slider / MPG | Fallback, never clamp: gate re-shows, slider returns to 25, MPG returns to national average (ADR-021/024/025 shared philosophy). |
| fueleconomy.gov unreachable | Settings sheet | `role="alert"` error **inside the panel only**; the feed silently keeps the national average — this feature can never error the feed (ADR-028, FR-8). |
| Vehicle restored | Settings sheet / feed | On return visit the stored vehicle label + MPG show in the sheet and drive all cards (FR-8). |
| Age unconfirmed | Age gate | Full takeover on {colors.surface-inverse}; no deal content exists in the DOM behind it (FR-13). |
| Reduced motion | Everywhere | Pulse and transitions collapse to none; nothing depends on motion to be understood. |

## Honest Math Rules

The product-specific contract — what makes the page trustworthy. (ADR-009, ADR-024; gas formula demo in [ui_kits/app/data.js](imports/gmas-helper-design-system/ui_kits/app/data.js).)

1. **Never collapse discount and gas cost into a net-savings figure.** The display is always side by side: "30% off — $1.46 to get there." A dollar "you save" number requires knowing basket size, which the app doesn't — inventing one would be lying (ADR-009).
2. **One formula, one home:** round-trip gas cost = `(distanceMiles × 2) × (gasPrice ÷ mpg)`, computed in a single pure module. Any invalid input or non-finite product → null → the card shows the discount alone (ADR-024).
3. **Formats are fixed:** distance to 1 decimal ("9.8 mi"), dollars to 2 ("$1.46"), countdowns in minutes/hours ("24 min left", "1 hr 36 min left"). All in {typography.figure} — tabular, slashed-zero — so ticking values never wiggle. The Discount Display keeps its visual em-dash but the DOM reads as one sentence; an explicit `aria-label` ("30% off, $1.46 to get there") is acceptable if testing shows the dash mis-voices.
4. **MPG precedence:** valid stored Vehicle MPG (JSON number, finite, > 0) → else National Average MPG, silently. Garbage never half-applies.
5. **Feed honesty beats feed breadth** (SM-C1): stale sources are omitted, not badged-and-kept; the unavailable count is stated plainly; "Last updated" is always visible. A smaller true feed wins over a larger doubtful one.
6. **Deal descriptions are third-party retailer copy, displayed under constraint:** plain text only — markup and emoji stripped, length capped (~80 characters); any description matching an operator-maintained blocklist of therapeutic-claim / youth-appeal terms is suppressed entirely, the card rendering badge + discount + window only. Descriptions are never rewritten or embellished client-side. [Pending counsel: whether republishing retailer promotional copy makes the aggregator an advertiser under WAC 314-55-155.]

## Interaction Primitives

- **Tap to act; keyboard for everything.** Every action — confirm gate, drag, tap-the-track, or arrow the slider (arrow keys step 1 mile; tap-to-set per the RangeSlider row), open/close the sheet, drive the cascade — is completable by keyboard alone.
- The sheet closes three ways: close button, scrim tap, Esc. The gate closes one way: the button.
- Distance filtering is instant and local — no spinner, no debounce ceremony, no network.
- Refreshing data = reloading the page; the feed fetches once per mount (ADR-022). No polling, no pull-to-refresh, and no in-page refresh button — ruled 2026-06-12: browser reload is the v1 answer (future consideration logged under Deferred, item 3).
- **Banned everywhere:** pop-ups and interstitials (ADR-005), carousels, infinite scroll, hover-only affordances, drag-to-reorder, modal-on-modal, push/SMS re-engagement, celebratory animation.

## Accessibility Floor

Behavioral; contrast and focus-ring visuals live in `DESIGN.md`. Consumer stakes — this floor is non-negotiable.

- **WCAG 2.2 AA** across the dark Tidewater surface; the teal accent ({colors.accent}) and text tokens are verified AA against the dark base (see DESIGN.md contrast audit). The old light-mode green pairs do not carry over.
- **Document semantics**: `<html lang="en">`; page title "gmas list — cannabis deals worth the drive" (sentence case); landmarks `banner` (header) and `main` (feed); the visible lowercase `gmas list` wordmark is the page's only `h1` (Header); dispensary names are `h2` headings so screen-reader users jump card-to-card.
- **Age gate** (ADR-036): `role="alertdialog"`, `aria-modal="true"`, labelled heading; focus moves into the gate on mount and on return from the out-state, and a real `Tab` focus-trap (`handleKeyDown`, no Escape by design) keeps it there. The feed is unreachable — visually and in the accessibility tree — until confirmed.
- **Settings sheet**: `role="dialog"`, `aria-modal`, labelled; focus enters on open, Esc closes, focus returns to the gear.
- **Targets ≥ {spacing.tap-min}** (44px) for every interactive element; the 36px `sm` size never appears as the only way to reach an action.
- **Visible focus always**: the 2px {colors.focus-ring} ring, offset, on every focusable element — never `outline: none` without the ring replacement.
- **Live regions**: feed updates announce politely — the empty-state line and stale/last-updated footnotes are `role="status"` / `aria-live="polite"`; the sheet's fetch failure is `role="alert"` scoped to the panel. Card countdowns update silently — not in a live region, so screen readers aren't spammed every minute (ruled 2026-06-12; follows from calm-by-default and endorsed by the accessibility review).
- **Icon-only controls** carry `aria-label`; deal type is conveyed by badge text, never color alone; figures use real text, not images.
- **Reduced motion** honored globally (token-level: durations → 0ms).

## Responsive & Platform

| Context | Behavior |
|---|---|
| Phone (primary) | Single column, full-width within {spacing.gutter-page} gutters, capped at {spacing.content-max} (640px). The settings sheet rises from the bottom edge. |
| Tablet / desktop | The same single column, centered on the {colors.surface-page} gray page. No layout reflow, no sidebar, no breakpoint variants. |
| Surrounding desktop space | **Deliberately unspecced** — future consideration (possibly ads; if so, banner/sidebar only, never competing with deal information, per ADR-005). Not a layout today. Note: mainstream ad networks prohibit cannabis-content placement; any future inventory requires a cannabis-compliant network and re-review under WA advertising rules. |
| Platform | Web only — no native app, no app-store presence (NFR-8). Mobile-first because the primary moment is a phone before getting in the car (NFR-5). |
| Color scheme | **Dark-only** — the "Tidewater" identity (ADR-037): dark base ({colors.bg} `#0E1417`), single locked teal accent ({colors.accent} `#4FD1C5`), numbers-as-hero. `<meta name="theme-color" content="#0E1417">`. Light mode is not offered; a light variant would be a future consideration. |

## Inspiration & Anti-patterns

- **Rejected — the browse paradigm (Weedmaps, Leafly):** every existing cannabis platform makes you explore stores and scroll menus. Gma's Helper refuses that job; there is no store page, no menu, nothing to discover. One question, one surface.
- **Rejected — collapsed "you save $X" math:** dishonest without basket size (ADR-009). The side-by-side display *is* the product.
- **Rejected — urgency theater:** no flashing countdowns, no "HURRY!", no scarcity copy. Amber + a mono countdown states the fact; the user supplies the urgency.
- **Rejected — cannabis-culture branding:** no leaf imagery, slang, or youth-coded visuals (PRD §8). The posture is a public-utility tool.
- **Lifted from finance/utility apps:** tabular mono figures, hairline tables-as-cards, calm fixed-copy errors, "last updated" honesty.

## Key Flows

UJ-2 (Linda, laptop) traverses Flow 1 identically — same centered column, no desktop-specific behavior. Her distinctive beat survives the merge: returning after six months away, her decision lands on a daily-deal card at the default 25 miles, zero re-setup.

### Flow 1 — Is tonight worth it? (Stacy, budget-conscious regular, phone, 7:25 PM — realizes UJ-1)

1. Stacy opens Gma's Helper in her kitchen. She confirmed the age gate weeks ago, so the feed is first paint: slider on top (restored to her saved 10 miles), three skeleton rows pulsing.
2. Cards resolve, sorted: a timed happy hour first ("24 min left", amber tint), an untimed "9:00 PM – close" happy hour next, daily deals below.
3. She scans the top card: dispensary name, `4.8 mi` right-aligned, "Happy hour" badge, "Top-shelf flower, every gram."
4. Below the description sits the one line the product exists for — **"30% off — $1.46 to get there."**
5. **Climax:** Stacy reads both numbers side by side and does the only math left — thirty percent off against a buck and a half of gas, with 24 minutes on the clock. Worth it. Nothing on the page told her to go; the numbers did.
6. She checks "Last updated Jun 10, 7:45 AM" under the feed — current — pockets the phone, and leaves. Total time on page: under thirty seconds.

Failure path: the fetch fails → "Couldn't load deals. Please try again later." in a calm error Notice. No retry spinner, no raw error; she reloads once from the browser, and it resolves.

### Flow 2 — Dialing in the gas math (Stacy, same evening, after the trip — realizes FR-8 / addendum precision mode)

1. Back home, Stacy wonders if the $1.46 was right for her truck. She taps the gear in the header.
2. The sheet rises over the dimmed feed: "Your vehicle" — "Set it once for exact gas math. Skip it and we use the national average (28 MPG)."
3. Year → Make → Model: each select populates the next; Model stays disabled until Make is chosen. Three taps.
4. The resolved figure appears in the fuel Notice: "Estimated 21 MPG — gas cost will use your vehicle."
5. **Climax:** the sheet collapses to her vehicle + MPG, and behind it every card's gas figure recalculates in the same instant — $1.46 becomes $1.94. The math just got more honest, and she watched it happen.
6. Next visit, her truck is already there (localStorage) — she never repeats the setup.

Failure path: fueleconomy.gov is unreachable → an error appears inside the panel only (`role="alert"`); she closes the sheet and the feed carries on with the national average, silently (FR-8).

### Flow 3 — First contact (Marco, newcomer, new in town, phone — realizes UJ-3 + FR-13)

1. Marco opens the link a coworker sent. A dark full-screen takeover on the Tidewater base, the `gmas list` wordmark above a card: a "21" tile, "Are you 21 or older?", and two stacked buttons — "Yes — I'm 21+" and "No, take me back" — with "Remember me on this device" checked by default. Focus is already inside the card. (Had he tapped decline, he'd hit the returnable "Come back at 21" screen with a "Go back" button — no dead-end.)
2. He taps "Yes — I'm 21+." Because "Remember me" is checked, the pass persists and the gate never appears for him again. (Unchecked, it would re-gate next visit — the shared-device default.)
3. The feed loads on the default 25 miles — zero setup. Five dispensaries he's never heard of, each with distance, discount, and gas cost already computed from the national average.
4. **Climax:** without knowing a single store name, Marco compares two cards — closer-but-smaller discount vs. farther-but-bigger — purely on the numbers, and picks. The app handed a stranger a working mental map of the local market in one screen.

Failure path: no deals in his range → "No active deals right now" plus the last-updated line; he widens the slider to 50 miles and the feed repopulates instantly, no network round-trip.

## Deferred & Future Considerations

All triaged with Erik 2026-06-12 — none block this spine.

1. **Future happy hours ("Starts at HH:MM")** — FR-1's later-today label conflicts with ADR-015 server pre-filtering to Active deals only; Erik deferred during Story 3.2 (needs a server filter change; tracked in `_bmad-output/implementation-artifacts/deferred-work.md`). When picked up, it also needs a starts-at sort tier (ADR-022 amendment).
2. **Vehicle cascade feedback** — loading indicator/fetch timeout, mid-cascade retry, and empty-menu messaging deferred per ADR-028. Today the selects sit disabled while a menu loads.
3. **Manual refresh affordance** — declined for v1 (browser reload; ADR-022 single-fetch stands over PRD §4.1 prose). Revisit only if real users ask.
4. **Implementation delta (sheet)** — the shipped app renders the vehicle UI as an inline panel with an ⚙️ emoji trigger; this spine's ruled bottom-sheet-with-scrim + Lucide gear supersedes it. Rework lands when the design system is applied to `client/src`.
