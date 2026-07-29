# Investigation: Positioning & Footer Coverage Audit (gmaslist.com)

## Hand-off Brief

1. **What happened.** Audit of SSR/crawler-facing markup for four claims: geo granularity (zip/area codes), long-tail citability, header positioning, and footer-negation uniformity.
2. **Where the case stands.** Concluded on Confirmed code evidence. Three of four user assumptions Confirmed; one (footer gap) Confirmed and **broader than stated** — negation is missing on all four `/compare` SSR variants *and* the crawler-visible home shell.
3. **What's needed next.** One shared SSR footer partial applied to `page()` (compareRoute) + `renderShellBody`, plus the Header subtitle. Both are `bmad-quick-dev`-sized.

## Case Info

| Field            | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Ticket           | N/A                                                                    |
| Date opened      | 2026-07-28                                                             |
| Status           | Concluded                                                             |
| System           | Windows 11 / Express+TS SSR / React SPA (Vite) / Render               |
| Evidence sources | source code (server/routes, server/utils, client/src/components)      |

## Problem Statement

User asked to verify four assumptions: (1) is zip/area-code data in markup or only names/cities/addresses; (2) are pages citable answers to long-tail queries like "cheapest concentrate deals Bellingham WA today"; (3) header is a bare wordmark with positioning relegated to the footer — propose a subtitle; (4) `/about` and `/store` carry a "not a seller" footer but `/compare` index/category omit it — should it be uniform.

## Confirmed Findings

### Finding 1: Zip present on /store JSON-LD only; nowhere else structured. Area/phone codes absent everywhere.
**Evidence:** `server/routes/storeRoute.ts:115-123` emits `postalCode` inside a `PostalAddress` (falls back to `addressRegion: 'WA'` when unparseable). `server/utils/renderShellBody.ts:46-49` renders the full `store.address` string (which *contains* the zip as free text) on the crawler home body. `server/routes/compareRoute.ts:174` region/index Datasets use `spatialCoverage` = `State`/`Place` with a **city name only** — no zip. `server/utils/regionModel.ts` carries `cities[]`, never postal codes.
**Detail:** Zip is a structured signal on `/store` alone. Region pages geo-locate by city name inside WA (`"Bellingham, Washington" containedInPlace Washington`). No telephone/area code appears in any markup or JSON-LD.

### Finding 2: Long-tail geo pages are strongly citable; the geo key is city-name, not zip.
**Evidence:** `compareRoute.ts:570-626` (`renderRegionCategoryHtml`) — H1 "Cheapest {Category} in the {City}, WA area", canonical `/compare/{cat}/{region}`, Dataset JSON-LD with local `Place`, "as of {date}" stamp, honest per-product-low framing.
**Detail:** Matches the target query shape ("cheapest concentrate deals Bellingham WA today") on city + category + freshness. Zip is not required to answer that query; its absence is a granularity gap, not a citability defect.

### Finding 3: Header is a bare wordmark — no positioning subtitle.
**Evidence:** `client/src/components/Header.tsx:6-53` renders only the `gmas list` wordmark + accent dot as the sole `<h1>`. No tagline. Positioning lives in `DisclaimerFooter.tsx:46-50` (SPA, client-rendered) and on `/about` + `/store`.

### Finding 4: "Not a seller" negation missing on ALL /compare SSR pages AND the crawler home body (broader than the user's assumption).
**Evidence:** The shared `page()` helper `compareRoute.ts:103-149` emits **no footer** — so `/compare`, `/compare/:category`, `/compare/:region`, `/compare/:category/:region` all lack negation. `renderShellBody.ts:59-63` (crawler-visible `/`) emits only H1 + `AGE_NOTICE`, no negation. Contrast: `storeRoute.ts:317-321` and `aboutRoute.ts:49-62,220-222` carry full negation ("not a cannabis seller / not a dispensary, retailer, delivery service, or marketplace").

## Deduced Conclusions

### Deduction 1: A crawler citing a /compare or a "/" result gets the price fact without the entity disclaimer.
**Based on:** Findings 3 + 4.
**Reasoning:** `DisclaimerFooter` is client-rendered React; a non-JS crawler of `/` receives `renderShellBody` output, which has no negation. `/compare/*` SSR never had a footer. So exactly the surfaces built for AI-citation reach are the ones missing the "independent information service, not a seller" line that the honesty/positioning contract wants travelling *with* the fact.
**Conclusion:** The negation gap is a reach/compliance concern, not just a UX inconsistency — it should be uniform across every SSR page, and the fix is the same partial for both `page()` and `renderShellBody`.

## Source Code Trace

| Element       | Detail                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| Origin        | `compareRoute.ts:103` `page()` (no footer); `renderShellBody.ts:59` (no footer) |
| Positioning   | `Header.tsx:6` (no subtitle); `DisclaimerFooter.tsx:46` (SPA-only)              |
| Correct model | `storeRoute.ts:316-321`, `aboutRoute.ts:220-222` (full negation footer)          |
| Zip           | `storeRoute.ts:115` (only structured emitter)                                   |

## Conclusion

**Confidence:** High (all four resolved on Confirmed source evidence).

- **Q1 (zip/area codes):** Confirmed — zip is structured on `/store` only and free-text in the home address string; region pages key on city name; **no area/phone codes anywhere**. Gap, low urgency.
- **Q2 (long-tail):** Confirmed strong. Region-category pages are purpose-built canonical answers. No action required.
- **Q3 (header):** Confirmed. Bare wordmark; proposed subtitle is a valid, low-risk fix.
- **Q4 (footer):** Confirmed **and broader** — negation is missing on all four `/compare` SSR variants and the crawler home body, not just compare index+category. Yes, it should be uniform.

## Recommended Next Steps

### Fix direction
1. **Shared SSR negation footer.** Extract one partial ("Gmas List is an independent information service — not a cannabis seller…") and render it in `page()` (covers all 4 compare variants) and in `renderShellBody`. Reuse `storeRoute.ts:316-321` verbatim for wording parity. Highest value (closes Deduction 1).
2. **Header subtitle.** Add one line under the wordmark in `Header.tsx` (e.g. "Independent guide to WA cannabis deals worth the drive"). Keep it a `<p>`, not an `<h2>`, so the wordmark stays the sole `<h1>` (EXPERIENCE.md doc-semantics rule).
3. **(Optional) Zip granularity.** Only if a zip-level query gap shows up in the citation monitor — not warranted now.

### Diagnostic
None needed; findings are Confirmed. Verify post-fix by curling `/compare`, `/compare/flower`, `/compare/bellingham`, `/compare/flower/bellingham`, and `/` (crawler body) for the negation string.

## Side Findings

- `DisclaimerFooter` (the SPA footer humans see on `/`) is well-worded but **client-only** — it never reaches a non-JS crawler. Any positioning that must be crawler-visible cannot live there alone. (Confirmed: `DisclaimerFooter.tsx` is a React component; `renderShellBody` is the crawler sink.)
- Wording is inconsistent across surfaces ("not a cannabis seller" vs "does not sell cannabis" vs "sells nothing"). A single shared literal would also unify phrasing.
