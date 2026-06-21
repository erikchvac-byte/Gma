---
title: '"Arcade" High-Contrast Palette Swap (re-baselined onto Synthwave)'
type: 'chore'
created: '2026-06-20'
status: 'in-review'
baseline_commit: '19a3ec8215116921b33d0fca86264ff5ba038062'
context:
  - '{project-root}/ADR.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Erik wants to replace the live "Synthwave" identity (twin-accent cyan=value / pink=urgency, ADR-040) with a higher-contrast "Arcade" palette. The original command was drafted against a stale pre-Synthwave ("Tidewater") snapshot — its premises (teal `#4FD1C5`/green literals, ADR-039, Maybe/Meh verdict badges, single-accent base) no longer match the code, so the work is re-baselined onto Synthwave reality.

**Approach:** A token-layer value swap in `client/src/styles/`, keeping semantic token NAMES, plus ONE new token for the amber discount color and a CSS-only decorative card-top motif. Arcade is a THREE-color system (decided with Erik): **pink `#ff3d8b`** = brand/interactive accent; **amber `#ffc83d`** = discount-semantic only; **red `#ff5470`** = happy-hour urgency. No data/API/scraper/routing/DOM-structure changes.

## Boundaries & Constraints

**Always:**
- Components reference tokens, never raw hex. The swap happens at the token layer; component rules only repoint to the correct token.
- Keep every existing semantic token NAME. `--accent` stays the brand/interactive token (now pink). `--warning` stays the urgency token (now red — value change only; all urgency consumers keep pointing at it).
- Magnitude of a discount stays a single hue (amber) with a font-weight step only — never a second hue, never an opacity ramp (preserves the ADR-040 decision).
- ADR numbering continues at **ADR-041**. It supersedes the *palette* of ADR-040, retaining ADR-040's reskin-in-place mechanism and ADR-038/039 structure.

**Ask First:**
- Any color role not covered by the agreed mapping (pink=brand, amber=discount, red=urgency) — do not invent a fourth accent.
- Any change to discount TIER thresholds (`high≥30 / mid≥15 / low`) — keep them; the command's phantom "<40%" split does not exist.

**Never:**
- No new tokens BEYOND the single `--discount` amber token. (The amber discount color is a required Arcade palette role with no existing semantic home; this is the one documented, approved deviation from the original AC1 "no new tokens".)
- No data-layer, API, scraper, routing, types, or component DOM-structure changes. No new dependencies.
- No claim that WCAG AA still holds — Arcade contrast is UNVERIFIED.
- No "Worth it / Maybe / Meh" verdict badges — they do not exist (ADR-009: report time, never a verdict).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Brand element | button / active chip / focus ring / wordmark dot / distance pill / gas line | renders pink `#ff3d8b` (via `--accent`) | N/A |
| Discount figure | a deal with `discountPct > 0` | amber `#ffc83d` figure (via `--discount`), magnitude shown by font-weight tier only | null/≤0/non-finite pct → no figure, no "off" (unchanged) |
| Happy-hour urgency | store has a live countdown | red `#ff5470` happy badge + pulse dot + countdown (via `--warning`) | no countdown → neutral daily badge (unchanged) |
| Card-top motif | any deal card (`article.gma-card`) | pink hairline over amber hairline at card top, decoration only | reduced-motion unaffected (static) |
| Palette regression | `tokens.css` contents | new token test asserts Arcade hexes present, Synthwave `#2de2e6`/`#ff2e88` + teal `#4FD1C5` absent | test fails build if old palette reappears |

</frozen-after-approval>

## Code Map

- `client/src/styles/tokens.css` -- the swap's center: `:root` palette + Tailwind `@theme` mirror. Swap surface/border/accent values; add `--discount` (+ `@theme` `--color-discount`); change `--warning` value pink→red; update the file header comment to Arcade/ADR-041.
- `client/src/styles/components.css` -- repoint `.gma-deal-block__pct` and `.gma-badge--discount` to `--discount` (amber); add `article.gma-card::before` card-top motif; update stale "teal"/"cyan"/"Synthwave" comments to Arcade.
- `client/src/components/DealCard.tsx` -- comment-only: "cyan value accent"→"amber discount"; no logic/DOM change.
- `client/src/components/Header.tsx` -- comment-only: "teal set-dot"→"pink set-dot" (dot already uses `var(--accent)`).
- `client/src/utils/dealView.ts` -- comment-only: line ~7 "single teal accent (ADR-037)"→"amber discount accent (ADR-041)".
- `client/src/styles/tokens.test.ts` -- NEW: read `tokens.css`, assert Arcade palette present / old palette absent (AC6).
- `client/src/components/DealCard.test.tsx` -- update comments ("cyan distance pill"→"pink", "pink badge/countdown"→"red"); class-based assertions already pass.
- `ADR.md` -- add ADR-041; mark ADR-040 palette superseded-by-041 (mechanism retained).
- `_bmad-output/planning-artifacts/ux-designs/ux-Happy-2026-06-11/DESIGN.md` -- migrate Colors block to Arcade (currently still documents Tidewater), `status: final`→`draft`, void the WCAG AA section, add Change Log entry.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/styles/tokens.css` -- swap palette to Arcade values, add `--discount` amber token (+ `@theme` mirror), set `--warning` to red `#ff5470`, repoint `--card-border`/`--accent-soft`/fills to pink/red, rewrite header comment to "Arcade (ADR-041)" -- the value swap (AC1, AC2, AC4-implied)
- [x] `client/src/styles/components.css` -- repoint `.gma-deal-block__pct` + `.gma-badge--discount` to `var(--discount)`; add `article.gma-card::before` pink-over-amber decorative motif; refresh comments -- discount goes amber + the motif (AC1, AC2)
- [x] `client/src/components/{DealCard,Header}.tsx`, `client/src/utils/dealView.ts` -- comment-only accuracy updates (teal/cyan → pink/amber, ADR ref → 041) -- no behavior change
- [x] `client/src/styles/tokens.test.ts` -- NEW token-regression test asserting Arcade present + Synthwave/teal absent -- AC6 palette guard
- [x] `client/src/components/DealCard.test.tsx` -- update color-naming comments; confirm class-based assertions still green -- AC6
- [x] `ADR.md` -- write ADR-041 (pink brand / amber discount / red urgency / one new `--discount` token / card-top motif / consequences); mark ADR-040 palette superseded-by-041 -- AC3
- [x] `DESIGN.md` -- migrate Colors to Arcade, `status: draft`, void WCAG AA section ("AA contrast UNVERIFIED — re-audit before final"), add Change Log entry -- AC4, AC5

**Acceptance Criteria:**
- Given `tokens.css`, when inspected, then `--accent`=`#ff3d8b`, `--discount`=`#ffc83d`, `--warning`=`#ff5470`, `--bg`=`#050507`, `--surface`=`#121016`, `--tw-border`=`#2a2330`; and `#2de2e6`, `#ff2e88`, `#4FD1C5`, `--green-700`, `#15803d` appear nowhere in `client/src`.
- Given a deal card, when rendered, then discount figures are amber (`--discount`), brand/interactive elements are pink (`--accent`), happy-hour urgency is red (`--warning`), and a pink-over-amber hairline decorates the card top.
- Given `DESIGN.md`, when opened, then `status: draft`, the WCAG section states AA is UNVERIFIED, the Colors block shows Arcade values, and a Change Log entry records the swap. No prose implies AA still holds.
- Given the repo, when `npm test`, `tsc -b`, `eslint .`, and `vite build` run in `client/`, then all pass.

## Design Notes

**Token mapping (the crux).** Three Arcade roles onto the existing two-accent system + one new token:

```css
--accent:  #ff3d8b;   /* pink — brand/interactive (was cyan #2de2e6) */
--warning: #ff5470;   /* red  — urgency, VALUE change only (was pink #ff2e88);
                         every urgency consumer keeps aliasing --warning, so
                         happy badge / pulse / countdown turn red for free */
--discount: #ffc83d;  /* amber — NEW token; the one approved AC1 deviation.
                         Discount has no existing semantic home now that
                         --accent (its old cyan host) is the pink brand color. */
```

Repoint pink-soft fills (`--accent-soft`, `--card-border`, `--fill-distance`) to pink alpha, and red-soft fills (`--warning-soft`, `--fill-happy`) to red alpha — mechanical, mirrors how ADR-040 set its alpha fills.

**Card-top motif (CSS-only, no DOM change).** Deal cards are the only `article.gma-card`, so scope by element — no new className needed:

```css
article.gma-card { position: relative; }
article.gma-card::before {
  content: ""; position: absolute; inset: 0 0 auto 0;
  height: 6px; border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background:
    linear-gradient(var(--accent) 0 0)   top    / 100% 2px no-repeat,
    linear-gradient(var(--discount) 0 0) bottom / 100% 2px no-repeat;
  /* 2px pink line, gap, 2px amber line; surface shows through the gap */
}
```
Add ~`var(--space-1)` top padding to deal cards so content clears the 6px motif. Decoration only — amber here is the sole sanctioned non-discount use of amber.

**Why red urgency (not pink).** Pink is now the brand accent, so urgency needs its own hot hue to stay distinguishable from interactive chrome. Erik chose a distinct red. `--danger` stays an error red; nudge it if it visually collides with `--warning`.

## Verification

**Commands** (run from `client/`):
- `npm test` -- expected: full vitest suite green, including the new `tokens.test.ts`
- `npx tsc -b` -- expected: no type errors
- `npx eslint .` -- expected: clean
- `npm run build` -- expected: `vite build` succeeds

**Manual checks:**
- Run the app: discount figures read amber, buttons/chips/distance/wordmark-dot read pink, a live happy hour reads red with a pink/amber line across the card top. Confirm no cyan or old hot-pink remains anywhere.
