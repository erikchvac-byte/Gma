# Validation Report — Happy

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/EXPERIENCE.md`
- **Run at:** 2026-06-12T07:49:54-07:00

## Overall verdict

A strong, source-extractable contract. Every `{path.to.token}` reference in both files resolves to DESIGN.md frontmatter, every import link resolves to a real file, all six sources resolve, and every load-bearing decision is either committed or carries an explicit ruling in `.decision-log.md` (sheet presentation, no-Save-step, no refresh button, generic empty copy, radius-token naming). The rubric findings are statement-level polish — unstated contrast pairs, frontmatter metadata lag — not structural gaps; nothing blocks architecture or story-dev consumption.

The two extra lenses shift the picture from "polish" toward "fix before final." The accessibility review's independent arithmetic confirms the spec's declared text pairs genuinely pass AA, but finds the form-field borders at 1.47:1 against the 3:1 non-text floor on the primary cascade flow, a 22px slider thumb that contradicts the spec's own "targets ≥ 44px" claim, an unspecified Notice foreground whose obvious token fails, knife-edge contrast on the tinted urgent badge (4.51:1 — margin 0.01), and silence on document-level basics (title, lang, landmarks, headings). The regulated-content review finds the spec's own voice well-armored but silent exactly where an aggregator's regulatory surface lives: scraped retailer deal copy is republished verbatim with no display constraint, and zero standing disclaimers exist anywhere in the IA — two launch-blocking-shaped gaps, plus counsel-verify items on the no-decline age gate and unqualified gas-cost figures.

## Category verdicts

- Flow coverage — strong
- Token completeness — strong
- Component coverage — strong
- State coverage — strong
- Visual reference coverage — strong
- Bloat & overspecification — strong
- Inheritance discipline — strong
- Shape fit — strong
- Accessibility (extra lens) — well above industry baseline and the declared pairs survive adversarial arithmetic, but self-contradicts on its 44px target claim, fails the 3:1 non-text floor on form-field borders, and omits document-level basics plus WCAG 2.2-specific criteria (2.5.7, 2.4.11); all fixable with token and wording changes, no redesign
- Regulated content (extra lens) — the spec's own voice is well-armored (no youth-coding, no urgency theater, no invented claims), but silent where the aggregator's regulatory surface lives: verbatim scraped retailer copy with no display constraint and zero standing disclaimers — two launch-blocking-shaped gaps

## Findings by severity

### Critical (0)

None.

### High (7)

**[Accessibility]** — Form-field boundary contrast fails 1.4.11 (DESIGN.md → Components → TextField/Select)
`border-strong #d1d5db` on white is **1.47:1** against the 3:1 non-text floor, and the 1px border is the only indicator of TextField/Select extent (`action-secondary-border` shares the token, but secondary buttons have a text label so the border is not load-bearing there). The Year→Make→Model cascade is a primary flow (Flow 2).
Fix: Introduce `border-field: '#6b7280'` (gray-500, 4.83:1) for TextField/Select borders — or at minimum require a second ≥3:1 affordance (filled `surface-sunken` field background plus boundary) and state it in the Select/TextField specs. Leave `border-strong` for the secondary-button outline where it is decorative.

**[Accessibility]** — Slider thumb target contradicts the spec's own floor and risks 2.5.8 (EXPERIENCE.md → Accessibility Floor; DESIGN.md → range-slider)
EXPERIENCE.md declares "Targets ≥ 44px for every interactive element," but `range-slider.thumb-size: 22px` is below even the 24px AA minimum (2.5.8 Target Size), and nowhere does either spine say the *hit target* is larger than the painted thumb. A lone slider may scrape by on the spacing exception, but the spec's stated 44px contract is unmet as written.
Fix: Add to `range-slider`: `thumb-hit-target: 44px` (transparent expanded hit area; painted thumb stays 22px) and a matching sentence in EXPERIENCE.md → Component Patterns → RangeSlider.

**[Accessibility]** — No single-pointer non-dragging alternative specced for the slider, 2.5.7 Dragging Movements (EXPERIENCE.md → Component Patterns → RangeSlider)
EXPERIENCE.md offers "drag/arrow the slider" — keyboard does **not** satisfy 2.5.7, which requires a single-pointer alternative to dragging.
Fix: Spec the control as (or behaving as) a native `input[type=range]` where a tap on the track sets the value directly, and state "tap-to-set on track" explicitly in the RangeSlider behavioral rules. (Native range also gets this for free.)

**[Accessibility]** — Notice `default` foreground is unspecified and the obvious token fails (DESIGN.md → Components → Notice)
`default` gets a `surface-sunken` box with no fg color; if implementers reach for `text-muted` (the Notice family's signature color per the `muted` variant), the result is **4.39:1 — below AA**. This is the sheet's resolved-MPG line ("Estimated 32 MPG…"), a key confirmation.
Fix: Pin `notice.default` fg to `{colors.text-body}` (9.4:1 on sunken) in the component spec; add "text-muted never sits on surface-sunken or gray-100" to Do's and Don'ts.

**[Accessibility]** — Document-level requirements are absent from both spines (EXPERIENCE.md → Accessibility Floor)
No page title (2.4.2), no `lang` (3.1.1), no landmark structure or heading hierarchy (1.3.1, 2.4.1/2.4.6). Is the wordmark an `h1`? Are dispensary names `h2`/`h3`? Is the feed a `main` landmark with the header a `banner`? The spec is silent.
Fix: Add a short "Document semantics" block to EXPERIENCE.md → Accessibility Floor: `<html lang="en">`; `<title>Gma's Helper — cannabis deals worth the drive</title>` (or similar, sentence case); landmarks `banner` / `main`; visually-hidden `h1` ("Gma's Helper") with dispensary names as `h2` headings so SR users can jump card-to-card.

**[Regulated content]** — No rule constraining display of scraped deal descriptions (EXPERIENCE.md → Component Patterns → Card; Flow 1 step 3)
The card renders "the description in {typography.body}"; Flow 1 step 3 renders "Top-shelf flower, every gram" verbatim; import `data.js` confirms descriptions are pass-through retailer copy. The app republishes third-party promotional text it does not control. WAC 314-55-155-family rules prohibit licensee advertising that appeals to minors, makes curative/therapeutic claims, or is false/misleading — a scraped description ("relieves pain", "kid-approved gummies", emoji, ALL-CAPS hype) would flow straight onto the page, simultaneously violating the brand's own no-slang/no-emoji rule and potentially importing a WAC violation onto Erik's surface.
Fix: Add a spec rule under Honest Math Rules or Component Patterns: "Deal descriptions are third-party retailer copy, displayed as plain text only: strip markup/emoji, cap length (~80 chars), and suppress (render the deal with badge + discount + window only) any description matching an operator-maintained blocklist of therapeutic-claim and youth-appeal terms. Descriptions are never rewritten or embellished client-side." **Verify with counsel** whether republishing retailer promotional copy makes the aggregator an "advertiser" under WAC 314-55-155.

**[Regulated content]** — Zero standing disclaimers anywhere in the IA (EXPERIENCE.md → Information Architecture; Voice and Tone)
Four surfaces, no footer/legal surface; the Voice and Tone table has no disclaimer row. Three distinct lines are missing: (1) accuracy/affiliation — deals are set and honored by retailers, the site is not affiliated with any dispensary, and listings may be out of date despite "Last updated"; (2) the WA mandatory-warning family ("This product has intoxicating effects and may be habit forming…", "…may be purchased or possessed only by persons twenty-one years of age or older") — these attach to licensee advertising, and an aggregator's obligation is unsettled; (3) "informational only — nothing is sold here." The "Last updated" Notice is honest but is not a disclaimer.
Fix: Add a persistent feed-footer Notice (muted), e.g.: "Deals are set by each retailer and may change without notice — verify in store. Gma's Helper is not affiliated with any dispensary and sells nothing." Reserve a slot for WA warning text pending counsel. **Verify with counsel** which (if any) WAC warning statements apply to a non-commerce aggregator.

### Medium (12)

**[Token completeness + Accessibility]** — Amber/red text-on-tint contrast pairs unstated; urgent badge pair is knife-edge — merged finding (DESIGN.md → Colors, line 241; Components → Badge, line 290)
Contrast targets are stated only for the gray/green pairs. The unstated load-bearing pairs: `{colors.text-urgent}` on `{colors.surface-urgent}` (computes 4.84:1, passes), `{colors.text-error}` on `{colors.surface-error}` (5.91:1, passes), and the Badge `urgent` pair amber-700 on amber-100 at 12px uppercase (small text under WCAG). Both reviewers reported the amber-badge pair; accessibility's computed number stands: **4.510:1 — passes by 0.01; any token drift fails it**.
Fix: Add these pairs to the AA statement in Colors; pin the amber pair with a frontmatter comment ("do not lighten amber-700 / darken amber-100 — AA margin is 0.01") so token drift can't silently break it. If it ever lands under 4.5:1, darken the badge foreground to a stated value.

**[Accessibility]** — Sticky header can obscure focused elements, 2.4.11 Focus Not Obscured — Minimum (EXPERIENCE.md → Header)
The spec names a sticky header but says nothing about keyboard-scroll behavior; tabbing backward up the feed will scroll focused cards/controls under the header.
Fix: Spec `scroll-padding-top: <header height + 8px>` on the scroll container in the Header behavioral rules.

**[Accessibility]** — Slider accessible name/value semantics unspecified, 4.1.2 / 1.3.1 (EXPERIENCE.md → Component Patterns → RangeSlider)
Label "Within", value "25 miles" — a native range announces only "25".
Fix: Add to RangeSlider rules: accessible name "Within" (programmatically associated label) and `aria-valuetext` of "25 miles" / "1 mile" matching the visible singular/plural copy.

**[Accessibility]** — Feed re-filter and re-sort are silent to screen readers (EXPERIENCE.md → Deal feed)
Dragging the slider from 25→10 silently drops cards; only the *empty* outcome announces (the empty-state line is `role="status"`). A SR user gets no confirmation the filter did anything until it does everything.
Fix: Add one polite, debounced status line to the feed (visually-hidden or doubling as visible copy): "N deals within X miles" — re-announced on settle, not per-tick of the drag.

**[Accessibility]** — Vehicle-applied confirmation is not in a live region (EXPERIENCE.md → Flow 2 / Settings sheet)
Flow 2's climax — MPG resolves, every card recalculates, the panel collapses — has no specced announcement; only failures (`role="alert"`) speak.
Fix: Make the sheet's resolved-MPG Notice ("Estimated 32 MPG — gas cost will use your vehicle.") `role="status"` so the confirmation is heard at the moment sighted users see it.

**[Accessibility]** — Skeleton→content transition unannounced and skeletons unsilenced, 4.1.3 (EXPERIENCE.md → State Patterns, cold load)
Nothing specs `aria-hidden` on SkeletonFeed or a loading/loaded announcement; a SR user on cold load hears nothing, then a feed exists.
Fix: Spec `SkeletonFeed` as `aria-hidden="true"` with the feed region carrying `aria-busy="true"` while loading; the always-visible "Last updated …" `role="status"` line then serves as the natural "loaded" announcement on resolve.

**[Accessibility]** — Sheet focus contract is incomplete (EXPERIENCE.md → Settings sheet)
"Focus enters on open" names no initial target, and a focus *trap* is never stated for the sheet (it is stated for the gate). `aria-modal` hints at it but the contract should not rely on inference.
Fix: "Focus moves to the sheet title (or first Select) on open; focus is trapped within the sheet while open; all three close paths return focus to the gear" (the return is already specced — keep it).

**[Accessibility]** — Focus loss when a focused card expires (EXPERIENCE.md → feed assembly rules)
Countdown ticks can remove the card a keyboard user is currently on (expiry drops deals off mid-session), sending focus to `<body>` — disorienting and unspecced.
Fix: Add to the feed assembly rules: if the focused element is inside a removed card, move focus to the next card (or the slider when none remain).

**[Accessibility]** — Cascade loading silence — accessibility cost of the ADR-028 deferral (EXPERIENCE.md → Settings sheet; .decision-log.md 2026-06-12 OQ-4)
"The selects sit disabled while a menu loads" gives SR and keyboard users zero feedback — a disabled Model select after choosing Make is indistinguishable from a broken one. Not re-litigating the deferral of spinners/timeouts; flagging that *total silence* is the accessibility cost being accepted.
Fix (minimal, within the ruling): One polite `role="status"` line in the sheet ("Loading models…") — copy only, no new UI.

**[Accessibility]** — Three Selects "in a row" likely break at 320px reflow, 1.4.10 (DESIGN.md → Settings sheet)
Three selects in one row at 320px viewport is ~90px per select — model names ("Grand Cherokee") will truncate or force horizontal scroll.
Fix: Spec the cascade as stacked (one select per row) below a stated breakpoint, or stacked always — three taps either way.

**[Regulated content]** — Age gate has no decline path, by binding ruling — weakens good-faith posture under scrutiny (EXPERIENCE.md → Component Patterns → Age gate, ADR-021; Flow 3 steps 1–2)
Self-attestation is the industry norm for non-commerce informational cannabis sites, and the specced copy is appropriately plain. But the prevailing norm is a two-option gate where decline exits or shows a terminal "you may not view this content" screen; a gate whose only affordance is affirmation reads as a formality if ever scrutinized. The decision-log ruling stands — this finding asks the spec to either add the decline affordance or record the defensibility rationale explicitly. (The accessibility lens flags the same design decision's SR-exit consequence as a separate low finding.)
Fix: Prefer a secondary (ghost) "I am under 21" action leading to a static dead-end screen ("This site is for adults 21 and over."); failing that, add a spec sentence: "No decline path is a deliberate posture for a non-commerce informational site [ruled, ADR-021]." **Verify with counsel** before public launch.

**[Regulated content]** — Gas figures present estimates as fact with no qualifier (EXPERIENCE.md → Honest Math Rules 2–3; DESIGN.md → Brand)
"$1.46 to get there" reads "as measured fact," but the number is derived from a national-average or first-trim rated MPG, a regional EIA average price, and a road-distance lookup — it is an estimate, and the spec's own sheet copy already concedes this ("Estimated 32 MPG…") while the card does not. An unqualified dollar figure invites "your site said $1.46, it cost me $3" accuracy complaints and undercuts the honesty brand if ever challenged.
Fix: One global qualifier, not per-card clutter — extend the proposed footer disclaimer with: "Gas costs are estimates based on average fuel prices and rated MPG." Alternatively spec "est. $1.46 to get there" as the Discount Display string. Liability framing, not WAC; counsel optional.

### Low (14)

**[Flow coverage]** — UJ-2 (Linda) realized only by the one-line traversal note above Flow 1 (EXPERIENCE.md → Key Flows, line 149)
"Traverses Flow 1 identically." Defensible on a single-surface app, but Linda's distinctive beat — returning after six months to a *daily deal* at default radius — is never exercised by any flow's climax.
Fix: Extend the note one sentence ("her decision lands on a daily-deal card at the default 25 miles") or accept as-is.

**[Token completeness]** — Shadows and motion live solely in the import beside a conflicting wrong source (DESIGN.md → Elevation & Depth, line 266)
The only token families whose values live solely in the import (`tokens/elevation.css`, made load-bearing by reconciliation override O3) while a conflicting wrong source (`_imported-CLAUDE.md.txt`) sits in the same import tree. Spec-permitted inheritance-by-reference, but one wrong copy/paste away from O3 regressing.
Fix: Restate the three shadow values inline in Elevation & Depth, or add "never quote `_imported-CLAUDE.md.txt` for values" to the section (it currently lives only in reconcile §4).

**[State coverage]** — No explicit offline state (EXPERIENCE.md → State Patterns)
Cold-load offline collapses into the load-error row and post-load the app is fully local (single fetch, client-side filtering), so behavior is actually determined — but the walk closes by inference rather than statement.
Fix: One row: "Offline | Deal feed | Same as load error on cold load; populated feed keeps working — all interaction is local."

**[Visual reference coverage]** — 27 per-component .jsx/.d.ts/.prompt.md files linked as a class, not individually (DESIGN.md → Components, line 286)
The pattern resolves deterministically, so this is acceptable; noted only because a consumer extracting, say, the Notice contract must construct the path.
Fix: None required.

**[Inheritance discipline]** — EXPERIENCE.md frontmatter `updated: 2026-06-11` predates the 2026-06-12 rulings baked into its body (EXPERIENCE.md frontmatter; body lines 87, 113, 184)
Empty-state ruling, refresh ruling, and triage note are 2026-06-12 rulings.
Fix: Bump to 2026-06-12.

**[Inheritance discipline]** — Both spines are `status: draft` while serving as the downstream contract; the lone [ASSUMPTION] is not yet ruled (DESIGN.md / EXPERIENCE.md frontmatter; EXPERIENCE.md line 125)
The countdown-excluded-from-aria-live assumption is tagged per the working mode but not yet ruled.
Fix: On reviewer-gate exit, get Erik's nod on the aria-live assumption and flip both files to `status: final`.

**[Accessibility]** — `stale` badge variant fails AA as specced (DESIGN.md → Components → Badge)
Gray-500 on gray-100, 4.39:1 at 12px. Unused in the v1 feed (ADR-026 omits stale dispensaries) but it ships in the system.
Fix: Change `stale` badge fg to `{colors.gray-600}` (6.87:1), matching the neutral badge.

**[Accessibility]** — `status-stale` token fails non-text contrast wherever it would render as a status dot (DESIGN.md → Colors)
Gray-400, 2.54:1 on white. ADR-026's "deliberately non-intrusive" is the ruling; the consequence is that the token cannot legally carry meaning alone.
Fix: Note in DESIGN.md → Colors that `status-stale` must always be paired with text (it is today — "N sources unavailable") and never used as a sole indicator.

**[Accessibility]** — Age gate has no decline path — no in-page exit for SR users (consequence flag only, binding ADR-021) (EXPERIENCE.md → Age gate)
Focus is trapped in an alertdialog whose only exit is affirmation; an under-21 or non-consenting SR user has no in-page exit and no explanation of how to leave. 2.1.2 is satisfied only because the browser itself is the exit.
Fix (within the ruling): One sentence of plain text inside the gate — "If you are under 21, please close this page." — no second button, no navigation.

**[Accessibility]** — Em-dash in "30% off — $1.46 to get there" mis-voices on screen readers (EXPERIENCE.md → Discount Display)
Most SRs skip or mis-voice "—", yielding "30% off $1.46 to get there" — momentarily parseable as a price for the discount.
Fix: Keep the visual em-dash; spec the DOM so the line reads as one sentence and note that an explicit `aria-label` of "30% off, $1.46 to get there" on the line is acceptable if testing shows confusion.

**[Accessibility]** — "Last updated Jun 10, 7:45 AM" omits the year and assumes the AM/PM convention (EXPERIENCE.md → last-updated line; pinned en-US, ADR-022 — binding)
Fine for the consumer audience, but AT and reader modes deserve the unambiguous machine value.
Fix: Spec the timestamp as a `<time datetime="…">` element.

**[Accessibility]** — Three sibling `role="status"` regions all announce on initial load (EXPERIENCE.md → Deal feed footnotes)
Last-updated, stale count, and empty-state line will queue three polite messages. Acceptable, but unordered.
Fix: Note an ordering expectation (empty/"last updated" first, stale count second) or merge the footnotes into one status region.

**[Accessibility]** — Text spacing (1.4.12) risk on overline badges (DESIGN.md → Badge)
12px uppercase pills with fixed `4px/8px` padding may clip when users apply letter/word-spacing overrides.
Fix: One line in DESIGN.md → Badge: pills size from content (no fixed width/height; padding, not clipping).

**[Regulated content]** — Future desktop-margin ads carry a platform-risk note the spec omits (EXPERIENCE.md → Responsive & Platform; DESIGN.md → Layout; PRD §8)
Mainstream ad networks (AdSense, most programmatic) prohibit serving on cannabis-content pages, and WA constrains cannabis ad placement; the realistic inventory is cannabis-adjacent networks with their own compliance regimes.
Fix: One sentence where ads are mentioned: "Note: mainstream ad networks prohibit cannabis-content placement; any future ad inventory requires a cannabis-compliant network and re-review under WA advertising rules."

## Reviewer files

- `review-rubric.md`
- `review-accessibility.md`
- `review-regulated-content.md`
