---
title: 'Real Price Drops — in-app clarity + freshness'
type: 'feature'
created: '2026-07-25'
status: 'done'
baseline_commit: '79e70c0dc9d8ed40a3f9eef4753b793a17abe6a8'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/investigations/real-price-drops-spec-validation-investigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The in-app "Real price drops" strip (`ValueDropStrip`) says "{pct}% below its usual" with no definition of "usual", never states the baseline is the store's OWN price history, and shows no freshness for the drops fact. The feed's "Last updated" describes the deal-scrape run, not the price-vs-own-median derive — so drops carry no honest freshness signal. (Investigation 2026-07-25, Fix 1a/1b/1c — the validated, aligned subset.)

**Approach:** Add a short same-store explainer to the strip (reuse the accurate sentence already shipped server-side at `storeRoute.ts:198`) and surface the drops envelope's own `generatedAt` as the strip's freshness. Pure in-app UI + one hook field; no derive/route/schema changes.

## Boundaries & Constraints

**Always:** "usual" must be framed as THIS store's own recent typical price (same-store 30-day median) — reuse existing wording. Freshness must read the drops `generatedAt`, NOT `data.meta.lastScraperRun`. Keep the strip fail-soft: missing/epoch/malformed freshness renders no freshness line, never a wrong date. Preserve the existing per-row aria-label and the amber discount figure exactly.

**Ask First:** Moving freshness to a feed-level (once) location instead of per-strip. Any change to the `/api/value/price-vs-own-median` envelope or the derive runner.

**Never:** No JSON-LD Product/Offer/AggregateOffer schema anywhere (ratified WAC 314-55-155, test-enforced in `storeRoute.test.ts`). No cross-store "vs $X at [Other Store]" wording (this fact is same-store only). No changes to the homepage crawler HTML / `renderShellBody` (deferred as a separate goal). No new date/relative-time library — reuse `formatLastUpdated`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh derive | envelope `generatedAt` = a real recent ISO | strip renders explainer note + "Prices as of {formatted}" | N/A |
| Never derived / fail-soft | `generatedAt` = `1970-01-01T00:00:00.000Z` (EMPTY_GENERATED_AT epoch) | explainer note renders; freshness clause OMITTED | treat epoch as "no freshness" |
| Absent / malformed | no snapshot + fetch not yet returned, or bad JSON → `generatedAt` null | explainer note renders; freshness clause OMITTED | fail-soft to null, never throw |
| No renderable drops | `renderableDrops(drops)` empty | strip absent entirely (unchanged) | N/A |

</frozen-after-approval>

## Code Map

- `client/src/hooks/useValueDrops.ts` -- data source; currently returns only rows via `selectDrops`. Add `generatedAt: string | null` to `UseValueDropsResult`, extracting `env.generatedAt` and mapping the epoch/absent/malformed value to `null`.
- `client/src/components/ValueDropStrip.tsx` -- the strip. Add a same-store explainer note under the `<h3>`, plus an optional freshness clause driven by a new `generatedAt?: string | null` prop.
- `client/src/components/DealFeed.tsx:85,301-311` -- destructure `generatedAt` from `useValueDrops()` and pass it into `DealCard`.
- `client/src/components/DealCard.tsx:224-226` -- accept `generatedAt` prop, forward to `ValueDropStrip`.
- `client/src/utils/formatTime.ts` -- reuse `formatLastUpdated` for the freshness date; no change.
- `server/routes/storeRoute.ts:198` -- source of the canonical same-store wording to reuse (read-only reference).
- `client/src/styles/components.css:578+` -- add `.gma-value-drops__note` caption style (muted caption tokens, matching existing strip styles).
- Tests: `useValueDrops.test.ts`, `ValueDropStrip.test.tsx`, `DealCard.test.tsx`, `DealFeed.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/hooks/useValueDrops.ts` -- added `generatedAt: string | null` to `UseValueDropsResult` and `selectGeneratedAt(raw)` (returns the envelope string, or null when absent/non-string OR the epoch sentinel `new Date(0).toISOString()`); wired through snapshot + fetch paths.
- [x] `client/src/components/ValueDropStrip.tsx` -- added `generatedAt?: string | null` prop and one `<p className="gma-value-drops__note">` under the heading: explainer "Below this store's own recent typical price." + "Prices as of {formatLastUpdated}" only when a real time is present. Per-row markup/aria-label unchanged.
- [x] `client/src/components/DealFeed.tsx` -- destructured `generatedAt` from `useValueDrops()` and passed `dropsGeneratedAt` to each `DealCard`.
- [x] `client/src/components/DealCard.tsx` -- accepts `dropsGeneratedAt` (default null) and forwards to `ValueDropStrip`.
- [x] `client/src/styles/components.css` -- added `.gma-value-drops__note` (font-caption / text-muted) between heading and rows.
- [x] tests -- `selectGeneratedAt` (real / epoch→null / absent→null) + generatedAt surfacing in `useValueDrops.test.ts`; explainer + freshness-shown + freshness-omitted in `ValueDropStrip.test.tsx`; threading in `DealCard.test.tsx` / `DealFeed.test.tsx`. All green (134 tests).

**Acceptance Criteria:**
- Given a strip with renderable drops and a recent `generatedAt`, when rendered, then it shows the same-store explainer AND a "Prices as of …" line using the drops derive time (not the deal-scrape time).
- Given `generatedAt` is the epoch fail-soft value or null, when rendered, then the explainer still shows but no freshness line and no "1970" date ever appears.
- Given a store with no renderable drops, when rendered, then no strip and no note appear (unchanged behavior).
- Given the served/SSR HTML, when inspected, then it still contains NO Offer/Product/AggregateOffer schema (existing `storeRoute.test.ts` assertions stay green).

## Spec Change Log

- 2026-07-25 — 3-layer adversarial review (Blind + Edge-Case + Acceptance Auditor, Opus 4.8). No intent_gap / bad_spec; auditor verdict COMPLIANT (all ACs + boundaries met). Applied 4 patches (no re-derivation): (1) `selectGeneratedAt` epoch check made numeric (`Date.parse ≤ 0`) — robust to server ISO-format drift, also rejects unparseable strings; (2) added a `freshnessLabel` defense-in-depth guard in `ValueDropStrip` (rejects epoch / NaN / future) so the strip is safe for any caller, not just via the hook; (3) strengthened DealCard/DealFeed/strip tests to assert the rendered VALUE (exact string, no fragile unescaped regex); (4) added epoch-format-drift + future-date + garbage-string tests. One finding deferred (deferred-work.md): the "Prices as of" date has no year / staleness window — scope-expanding product decision touching the shared `formatLastUpdated`. Tests: 138 passing; production build green.

## Design Notes

Freshness lives per-strip (one `generatedAt` for the whole derive, repeated on each card) so each card is honest standalone and screen-reader users hit it in card context. Feed-level (once) is the accepted alternative but is an Ask-First change. Reuse `formatLastUpdated` for date format parity with the existing "Last updated" line. The epoch guard matters: `valueRoute.ts:32` fail-soft sets `generatedAt` to `new Date(0).toISOString()` for "never derived" — that must map to null, never render as a date.

## Verification

**Commands:**
- `cd client && npm run test -- useValueDrops ValueDropStrip DealCard DealFeed` -- expected: all pass, new cases green.
- `npm run build` -- expected: full production build succeeds (tsc strict + vite), no type errors from the new hook field/prop.

**Manual checks:**
- Run the app; a store card with drops shows "Below this store's own recent typical price." and "Prices as of {date}" under "Real price drops"; the date differs from the feed's "Last updated" when the two pipelines have run at different times.

## Suggested Review Order

**Freshness extraction (data source)**

- Entry point — the honest freshness value at its source; numeric epoch/garbage guard (review-hardened).
  [`useValueDrops.ts:36`](../../client/src/hooks/useValueDrops.ts#L36)

- New hook state + return field so consumers get the derive time alongside drops.
  [`useValueDrops.ts:147`](../../client/src/hooks/useValueDrops.ts#L147)

**Presentation (clarity + freshness)**

- Defense-in-depth render guard — rejects epoch/NaN/future so the strip never shows a wrong date.
  [`ValueDropStrip.tsx:42`](../../client/src/components/ValueDropStrip.tsx#L42)

- The same-store explainer note + conditional "Prices as of …" clause under the heading.
  [`ValueDropStrip.tsx:94`](../../client/src/components/ValueDropStrip.tsx#L94)

- Muted caption styling to match the strip.
  [`components.css:606`](../../client/src/styles/components.css#L606)

**Wiring (threading one derive time to every card)**

- Destructure `generatedAt` from the hook and pass it down per card.
  [`DealFeed.tsx:85`](../../client/src/components/DealFeed.tsx#L85)

- New optional prop, forwarded to the strip.
  [`DealCard.tsx:228`](../../client/src/components/DealCard.tsx#L228)

**Tests (peripheral)**

- Selector: epoch (any ISO form) / garbage / absent → null; freshness surfaced on snapshot + fetch.
  [`useValueDrops.test.ts:80`](../../client/src/hooks/useValueDrops.test.ts#L80)

- Strip: explainer renders; freshness shown for a real time, omitted for null/epoch/future.
  [`ValueDropStrip.test.tsx:100`](../../client/src/components/ValueDropStrip.test.tsx#L100)

- Threading proof (value asserted, sourced from the drops hook not the deal scrape).
  [`DealFeed.test.tsx:984`](../../client/src/components/DealFeed.test.tsx#L984)
