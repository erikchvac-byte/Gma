---
title: 'Uniform SSR positioning disclaimer + header subtitle'
type: 'feature'
created: '2026-07-28'
status: 'in-review'
baseline_commit: '2dc82be'
context:
  - '{project-root}/investigations/positioning-footer-audit-investigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The "independent information service — not a cannabis seller" positioning is missing on exactly the crawler-facing surfaces built for AI-citation reach: all four `/compare` SSR variants (index, category, region index, region category — all route through `page()`, `server/routes/compareRoute.ts:103`) and the crawler-visible home body (`renderShellBody`, `server/utils/renderShellBody.ts:59`). The human-visible home footer (`DisclaimerFooter.tsx`) is client-only React, so a non-JS crawler never receives it. Separately, the header is a bare wordmark with no positioning line (`client/src/components/Header.tsx`).

**Approach:** Extract the negation copy already living inline at `storeRoute.ts:316-321` into one shared server helper, and render it on `page()` and in `renderShellBody` (and refactor `storeRoute` to consume it, so wording has a single source and can't drift). Add a one-line positioning subtitle under the wordmark in `Header.tsx` as a `<p>`, keeping the wordmark the sole `<h1>`.

## Boundaries & Constraints

**Always:** Reuse the exact `storeRoute.ts:316-321` wording as the single source of truth (keeps "worth the drive", links to `/about` and `/compare`). Static literal HTML only — no interpolation, no new data. The footer must appear on every page that renders through `page()` (all 4 compare variants) and on `renderShellBody`. The wordmark `<h1>` stays the only `<h1>` on the home page (a `<p>` subtitle, never a heading). WA-only positioning; honesty gates unchanged.

**Ask First:** Any change to the disclaimer WORDING beyond what `storeRoute` already ships. Any change that would add a second `<h1>` or alter the locked wordmark itself.

**Never:** Do not touch `DisclaimerFooter.tsx` (client footer is a separate, working surface — out of scope). Do not add Product/Offer schema, potency/health claims, discount banners, or a category leaderboard. Do not introduce area-code / zip discoverability (deferred #3). Do not change `page()`'s existing body, canonical, or JSON-LD.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Compare index/category rendered | any envelope (incl. empty) | HTML ends with the disclaimer `<p>` (negation + `/about` + `/compare` links) inside `<main>` | N/A |
| Region index / region category rendered | any region | Same disclaimer present (shared `page()`) | N/A |
| Home crawler body | `renderShellBody(data)`, deals or empty | Output contains the disclaimer text + `/about` link | N/A |
| Store page rendered | any store | Negation still present (now via shared helper); "worth the drive" retained | N/A |
| Header rendered | always | Exactly one `<h1>` ("gmas list") + a `<p>` subtitle; no `<button>` | N/A |

</frozen-after-approval>

## Code Map

- `server/utils/positioningDisclaimer.ts` -- NEW. Exports `positioningDisclaimerHtml(className?: string): string` returning the canonical negation `<p>` (optional class attr). Single source of the wording.
- `server/routes/compareRoute.ts:103` -- `page()`: render `positioningDisclaimerHtml('disclaimer')` after `${opts.bodyHtml}`, before `</main>`; add a muted `.disclaimer` CSS rule to the inline `<style>`.
- `server/utils/renderShellBody.ts:59` -- append `positioningDisclaimerHtml()` (no class; crawler-only body, text is what matters) after `sections`.
- `server/routes/storeRoute.ts:316` -- replace the hardcoded negation `<p class="notice">…</p>` with `positioningDisclaimerHtml('notice')` (keeps existing `.notice` styling + AGE_NOTICE paragraph untouched).
- `client/src/components/Header.tsx` -- add a `<p>` subtitle under the wordmark; wrap `<h1>`+`<p>` in a flex-column div so layout holds; muted design token, small text.

## Tasks & Acceptance

**Execution:**
- [x] `server/utils/positioningDisclaimer.ts` -- create helper with canonical wording + optional className -- single source of truth for the negation copy.
- [x] `server/utils/positioningDisclaimer.test.ts` -- unit-test the matrix: contains "independent information service", "not a cannabis seller", "worth the drive", `href="/about"`, `href="/compare"`; className variant emits `class="…"`, no-arg variant omits it.
- [x] `server/routes/compareRoute.ts` -- render disclaimer in `page()` + add `.disclaimer` style -- covers all 4 compare variants in one edit.
- [x] `server/utils/renderShellBody.ts` -- append disclaimer to crawler home body.
- [x] `server/routes/storeRoute.ts` -- consume the shared helper for its negation paragraph.
- [x] `client/src/components/Header.tsx` -- add positioning `<p>` subtitle under the wordmark.
- [x] `server/utils/renderShellBody.test.ts`, `server/routes/compareRoute.test.ts` (+ `compareRegionRoute.test.ts`), `client/src/components/Header.test.tsx` -- add assertions per the AC below.

**Acceptance Criteria:**
- Given any `/compare`, `/compare/:category`, `/compare/:region`, or `/compare/:category/:region` response, when rendered, then the HTML contains the negation disclaimer with links to `/about` and `/compare`.
- Given `renderShellBody(data)` for any store set (including all-empty), when rendered, then the output contains the disclaimer text and the `/about` link.
- Given the store page, when rendered, then it still contains "worth the drive" and "not a cannabis seller" (no regression) sourced from the shared helper.
- Given `Header`, when rendered, then there is exactly one level-1 heading named "gmas list", a visible positioning subtitle paragraph, and still no `<button>`.

## Design Notes

Canonical wording (verbatim from `storeRoute.ts:316-321`, the single source):

> Gmas List is an independent information service — not a cannabis seller. It organizes publicly available deals from licensed Washington retailers so shoppers can decide whether a deal is [worth the drive](/about). See [cross-store price comparisons](/compare).

Helper shape:

```ts
export function positioningDisclaimerHtml(className?: string): string {
  const cls = className ? ` class="${className}"` : ''
  return `<p${cls}>Gmas List is an independent information service — not a cannabis seller. …</p>`
}
```

On a `/compare` page the "cross-store price comparisons" self-link is acceptable (a hub link); uniformity is the goal. Header subtitle copy: "Independent guide to WA cannabis deals worth the drive." — a `<p>`, muted, never an `<h2>`/`<h1>` (EXPERIENCE.md doc-semantics: wordmark is the only `<h1>`).

## Verification

**Commands:**
- `npm run build` -- expected: `tsc -b && vite build` clean (real Render build, not just `tsc --noEmit`).
- `npx vitest run` -- expected: full suite green, incl. new positioningDisclaimer, renderShellBody, compare, and Header assertions.
