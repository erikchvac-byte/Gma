---
title: 'Make discount-prefix dedup apply to every store (badge-anchored + guard)'
type: 'bugfix'
created: '2026-06-22'
status: 'done'
baseline_commit: '2a486681fa4b37fb415102fff982b0778c310784'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The ADR-046 stutter fix only fires on stores whose scraped description *begins* with a bare `N% off` (its regex is start-anchored and requires the literal `off`). Most badge-bearing stores embed the magnitude behind a lead-in — sale banners (`JUNE 2026 SUMMER SALE 30% Off Flower`), qualifiers (`Up to 50% Off`), brand/day prefixes (`Dabstract - 50% off`, `STOREWIDE 30% OFF`), or percent-without-`off` (`40% ONLINE ORDERS`) — so the card still shows the magnitude twice (badge + title).

**Approach:** Make the strip **badge-anchored**: remove the badge's *exact* `discountPct` magnitude wherever it appears in the title (optional `off`, surrounding separators), not just at the start. Add a **multi-tier guard**: if the title carries 2+ distinct `N%` figures (a layered "Up to … Sale" string), leave the whole title untouched rather than mangle it. Display-only — `deal.description`, the server, and the badge are untouched.

## Boundaries & Constraints

**Always:** Strip only the badge's own magnitude (`discountPct`), so a *different* number in the title (e.g. a THC `30%` when the discount is `50%`) is never removed. Stay display-only — confine changes to `client/src`. Caller strips only when the percent badge renders (`discountTier(discountPct) !== null`), preserving ADR-046's badge-anchored rule. An empty result still falls back to the kind label, never a blank title.

**Ask First:** Any change outside `client/src` (server, scraper, normalize, `sanitizeDescription`). Mutating `deal.description` or the badge.

**Never:** Touch `deal.description`, `discountPct`, or the badge DOM. Strip non-percent prefixes (`$5 off`, BOGO — still deferred). Produce a non-empty garbage title from a multi-tier string. Add a 2nd hue/accent.

## I/O & Edge-Case Matrix

`stripDiscountPrefix(title, discountPct)` — display-only, never mutates input:

| Scenario | Input / State | Expected Output | Notes |
|----------|--------------|-----------------|-------|
| Leading bare phrase | `'50% off Select Brands'`, 50 | `'Select Brands'` | ADR-046 case still works |
| Mid-string banner | `'JUNE 2026 SUMMER SALE 30% Off Flower PULLMAN'`, 30 | `'JUNE 2026 SUMMER SALE Flower PULLMAN'` | strip mid, collapse space |
| Trailing magnitude | `'STOREWIDE 30% OFF'`, 30 | `'STOREWIDE'` | trailing separator/space trimmed |
| Brand/day prefix | `'Dabstract - 50% off'`, 50 | `'Dabstract'` | dangling ` - ` trimmed |
| Percent, no "off" | `'40% ONLINE ORDERS'`, 40 | `'ONLINE ORDERS'` | `off` optional |
| Multi-tier (guard) | `'Up to 50% Off Sale - 50% Off Brands'`, 50 | `'Up to 50% Off Sale - 50% Off Brands'` | 2+ `N%` figures → kept whole |
| Multi-tier mixed | `'Up to 50% Off Sale - 40% Off Brands'`, 50 | unchanged | 2+ figures → kept whole |
| Different number | `'Contains 30% THC blend'`, 50 | unchanged | badge magnitude (50%) absent → no-op |
| No percent in title | `'Join the Joint: Savings!'`, 20 | unchanged | nothing to strip (no stutter) |
| Whole title is phrase | `'50% off'`, 50 | `''` | caller → kind-label fallback |
| Case-insensitive | `'15% OFF Edibles'`, 15 | `'Edibles'` | `off`/`Off`/`OFF` |

</frozen-after-approval>

## Code Map

- `client/src/utils/dealView.ts` -- `stripDiscountPrefix`: signature changes to `(title, discountPct)`; replace the start-anchored `DISCOUNT_PREFIX` regex with badge-anchored strip + multi-tier guard.
- `client/src/components/DealCard.tsx` -- `dealTitle(deal, badgeRendering)`: pass `deal.discountPct` into `stripDiscountPrefix` (call site already gated on `tier !== null`, i.e. a positive finite pct).
- `client/src/utils/dealView.test.ts` -- existing `stripDiscountPrefix` suite updated for the 2-arg contract + new cases.
- `client/src/components/DealCard.test.tsx` -- existing dedup render tests updated for the new behavior.
- `server/data/data.json` -- live corpus (read-only) used to verify zero garbage titles across all 65 deals.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/utils/dealView.ts` -- replace `stripDiscountPrefix(title)` with `stripDiscountPrefix(title, discountPct)`: (1) **guard** — if title contains ≥2 `\d+(?:\.\d+)?\s*%` figures, return title unchanged; (2) **strip** — build a regex from the exact `discountPct` (`\b<pct>\s*%\s*(?:off\b)?` with surrounding separators, escape any decimal point), replace all matches with a single space; (3) collapse runs of whitespace, trim, and strip dangling leading/trailing separators (`· : • – — - *`). Never mutate input. Update the doc comment.
- [x] `client/src/components/DealCard.tsx` -- in `dealTitle`, when `badgeRendering`, call `stripDiscountPrefix(deal.description, deal.discountPct as number)`; empty result still falls through to `kindFallback`.
- [x] `client/src/utils/dealView.test.ts` -- update the `stripDiscountPrefix` suite to the 2-arg contract and add every I/O Matrix row (leading, mid, trailing, no-`off`, both multi-tier guards, different-number no-op, whole-phrase-empty, case variants, no-mutation).
- [x] `client/src/components/DealCard.test.tsx` -- update dedup render assertions for the new behavior (badge still shows the figure; title no longer stutters it; multi-tier title rendered whole).

**Acceptance Criteria:**
- Given any of the 65 live `data.json` deals with a positive `discountPct`, when `stripDiscountPrefix(description, discountPct)` runs, then the result is either a clean title with the badge magnitude removed **or** the unchanged original (multi-tier / different-number) — and is **never** a non-empty mangled fragment (no dangling leading qualifier left by removing a percent it didn't fully clear). Verified by re-running the dump script over all 65.
- Given a multi-tier title (`Up to 50% Off Sale - 40% Off Brands`), when rendered, then the title is shown whole and the badge still shows `50% off`.
- Given a title whose only percent is a *different* number than the badge (`Contains 30% THC`, badge 50), when stripped, then it is returned unchanged.

## Spec Change Log

- **2026-06-22 — step-04 review patches (no loopback).** Three adversarial reviewers ran; acceptance auditor verdict PASS. Applied three behavior-preserving patches to `dealView.ts` (all 65 corpus outputs unchanged): (1) full `escapeRegExp` on the magnitude instead of a `.`-only escape; (2) `Number.isFinite(discountPct)` early no-op backing the caller's `as number` cast; (3) **dangling-qualifier guard** — a *single-figure* title whose qualifier governs the magnitude (`Up to 50% Off Sale`) would strip to `Up to Sale`, so when the stripped result still leads with `up to|save|spend|get|extra` the whole original is kept (same spirit as the multi-tier guard). Closes the one real gap vs the "no dangling leading qualifier" AC; absent from the current corpus but latent for future scrapes. Rejected as working-as-designed / caller-guarded / not-in-corpus: float-never-matches, THC same-value, `\b`-vs-`$50`, global-flag, empty→kind-label, interior `*` (auditor: out-of-scope).

## Design Notes

Guard = count of `\d+(?:\.\d+)?\s*%` matches ≥ 2 ⇒ multi-tier sale ⇒ return original (this is what keeps `Up to … Sale - … Brands` from collapsing to `Up to Sale - Brands`). Anchoring the strip to the *exact* `discountPct` is what makes a single-percent `30% THC` (badge 50) a safe no-op rather than eating `30%`. Making `off` optional is required for real rows like `40% ONLINE ORDERS` / `20% ALL Pre-Rolls` where the scraper still derived a `discountPct`; the exact-magnitude + single-figure guard bounds the THC-style risk. Replace matches with a space (not empty) so `2026 40% Off Ounces` → `2026 Ounces`, not `2026Ounces`.

Golden (pct in parens):
```
'50% off Select Brands' (50)                       -> 'Select Brands'
'JUNE 2026 SUMMER SALE 30% Off Flower PULLMAN' (30) -> 'JUNE 2026 SUMMER SALE Flower PULLMAN'
'STOREWIDE 30% OFF' (30)                            -> 'STOREWIDE'
'40% ONLINE ORDERS' (40)                            -> 'ONLINE ORDERS'
'Up to 50% Off Sale - 50% Off Brands' (50)          -> unchanged (guard)
```

## Verification

**Commands:**
- `cd client && npm test -- dealView DealCard` -- expected: all green, including new cases.
- `npm run build` (client+server real build per project rule) -- expected: clean (`tsc -b && vite build`).
- Re-run the analysis script over `server/data/data.json` applying the new `stripDiscountPrefix` -- expected: zero non-empty garbage titles across all 65 deals; every single-figure badge row de-stuttered; every multi-figure row unchanged. (Ran: 62 badge rows, 53 de-stuttered, 0 mangled.)

## Suggested Review Order

**The strip logic (the whole fix lives here)**

- Entry point — the generalized, badge-anchored strip + both guards; read top-down.
  [`dealView.ts:67`](../../client/src/utils/dealView.ts#L67)

- Multi-tier guard: 2+ percent figures ⇒ keep the title whole (no `Up to Sale - Brands`).
  [`dealView.ts:74`](../../client/src/utils/dealView.ts#L74)

- Anchor to the deal's EXACT magnitude wherever it appears — never a different number.
  [`dealView.ts:78`](../../client/src/utils/dealView.ts#L78)

- Dangling-qualifier guard (review patch): single-figure `Up to 50% Off Sale` kept whole.
  [`dealView.ts:91`](../../client/src/utils/dealView.ts#L91)

**Call site (display-only binding)**

- Strip only when the percent badge renders; pass the badge's own `discountPct`.
  [`DealCard.tsx:39`](../../client/src/components/DealCard.tsx#L39)

**Tests**

- Unit contract: leading/mid/trailing/no-`off`, multi-tier, qualifier, different-number, no-mutation.
  [`dealView.test.ts:99`](../../client/src/utils/dealView.test.ts#L99)

- Render: badge shows the figure once; multi-tier title rendered whole.
  [`DealCard.test.tsx:259`](../../client/src/components/DealCard.test.tsx#L259)
