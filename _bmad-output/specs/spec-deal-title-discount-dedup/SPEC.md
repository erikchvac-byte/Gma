---
id: SPEC-deal-title-discount-dedup
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Deal title — suppress redundant discount prefix

## Why

A pain to solve, hitting every shopper on the deal feed. Each discount deal card renders its magnitude twice: once in the large styled badge (`gma-deal-block__pct` + "off", e.g. "50% off") and again at the head of the title, because the scraped `deal.description` already embeds that same phrase ("50% off Select Brands"). The card therefore reads as a stutter — "50% off · 50% off Select Brands" — which undercuts the deliberate badge-plus-clean-title layout of the redesigned card (DealCard.tsx). The badge is the canonical place for the magnitude; the title should carry only the descriptive remainder.

## Capabilities

- id: CAP-1
  intent: A discount deal whose scraped description begins with a percent-off phrase the badge is already showing renders its title with that leading phrase suppressed, so the badge carries the magnitude and the title carries only the descriptive remainder — for any percentage, not a single hardcoded value.
  success: Given `deal.description = "N% off Select Brands"` and a percent badge rendering "N% off" (`discountPct = N`, for any N — e.g. 10, 25, 50), the rendered title is "Select Brands" — no leading "N% off". The whole leading phrase is consumed as one unit — the number, the percent sign, the word "off", AND the separating whitespace — so no orphan word and no leading space survive. The match is case-insensitive: `deal.description = "15% Off Edibles + Drinks (Excluding Capsules)"` renders as "Edibles + Drinks (Excluding Capsules)" — NOT "Off Edibles + Drinks (Excluding Capsules)" (dangling "Off") and NOT the full unstripped string. The badge element and its value are unchanged, and `deal.description` is unchanged in memory and storage. A unit test asserts the de-prefixed title across multiple N values AND across casings of "off" ("off", "Off", "OFF").

## Constraints

- Display-only: the fix transforms the rendered title string at render time (the `dealTitle` derivation in DealCard.tsx). It must NOT mutate `deal.description` nor change the value at ingest/server side.
- The badge element (`gma-deal-block__pct` / `gma-deal-block__off`) and its computation (`discountTier`, `deal.discountPct`) are out of bounds — do not touch them.
- **Badge-anchored:** strip the leading phrase only when the percent badge is actually rendering that magnitude (i.e. `discountTier(deal.discountPct)` is non-null). When no percent badge renders, the title is left intact — never strip a discount the card shows nowhere else.
- Strip only a leading "N% off"-style percent phrase, not arbitrary leading words. A description with no such leading phrase renders unchanged.
- **Case-insensitive, whole-phrase:** the match must ignore the casing of "off" — real scraped descriptions use "Off"/"OFF" while the badge renders lowercase "off" (a case-sensitive match against "off" would silently no-op on most live data). The strip must consume the entire phrase as one unit (number + "%" + "off" + the trailing whitespace/separator) so the title never starts with a dangling "Off" or a leading space; trim the result defensively.
- If suppressing the prefix would leave an empty or whitespace-only title, fall back to the existing `dealTitle` behavior (kind fallback / omit) rather than rendering a blank title.

## Non-goals

- Not changing how the badge computes, styles, or renders the discount magnitude.
- Not re-scraping, normalizing, or rewriting `deal.description` server-side or at ingest — the stored value stays exactly as scraped.
- Not touching the meta line or daily/happy-hour labels (`dealMeta`), nor any non-discount deal type.
- **Deferred to a later session:** non-percent discount prefixes ("$5 off", "BOGO"/"buy one get one", etc.). Because the badge is percent-only, these have nothing to duplicate today; stripping them would erase the card's only discount text. Out of scope here.

## Success signal

On a discount deal card the magnitude appears exactly once: the styled badge plus a clean title (e.g. badge "50% off" + title "Select Brands"), with no doubled "50% off" stutter anywhere in the card.

## Assumptions

- The in-scope redundant prefix is the percent-off phrase the badge shows. Resolved decision (2026-06-22): applies to **any** percentage, not a single hardcoded value, and fires only when the percent badge is rendering (badge-anchored). Non-percent forms are deferred (see Non-goals).
