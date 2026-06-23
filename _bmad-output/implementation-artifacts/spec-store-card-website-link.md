---
title: 'Clickable store website link on deal cards'
type: 'feature'
created: '2026-06-23'
status: 'done'
route: 'one-shot'
context: []
---

# Clickable store website link on deal cards

## Intent

**Problem:** Store cards show the dispensary's name but give the user no way to reach the store's own website from the deal feed.

**Approach:** Wrap the store name in `DealCard` with a link to the existing `dispensary.url` field, opening in a new tab, only when the value is a well-formed `http`/`https` URL — falling back to plain text otherwise so nothing renders broken. No layout, styling, or other card behavior changes.

## Suggested Review Order

**Link rendering + URL validation**

- Entry point: the name renders as a link only when the url passes validation, else falls back to plain text.
  [`DealCard.tsx:95`](../../client/src/components/DealCard.tsx#L95)

- Guards against malformed/whitespace/`javascript:`/`data:` URIs reaching `href` — `url` is required-but-unvalidated upstream (scraped data).
  [`DealCard.tsx:65`](../../client/src/components/DealCard.tsx#L65)

**Accessibility**

- Screen-reader-only text warns of the new-tab context switch without any visible footprint.
  [`DealCard.tsx:103`](../../client/src/components/DealCard.tsx#L103)

**Styling — visually unchanged**

- Link inherits the existing name's color/font; only adds an underline on hover/focus.
  [`components.css:312`](../../client/src/styles/components.css#L312)

- Standard visually-hidden utility backing the new sr-only span.
  [`components.css:322`](../../client/src/styles/components.css#L322)

**Tests**

- Valid URL renders an accessible `target="_blank"` / `rel="noopener noreferrer"` link with the new-tab notice.
  [`DealCard.test.tsx:64`](../../client/src/components/DealCard.test.tsx#L64)

- Empty and malformed/non-http(s) URLs both fall back to plain text.
  [`DealCard.test.tsx:81`](../../client/src/components/DealCard.test.tsx#L81)
