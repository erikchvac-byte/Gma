// Single source of truth for the site's entity-positioning disclaimer: the
// "independent information service — not a cannabis seller" line. Lifted verbatim
// from the /store page footer (storeRoute.ts) so every server-rendered surface
// speaks the same words — a positioning-footer audit (investigations/
// positioning-footer-audit-investigation.md) found this negation was missing on
// all four /compare SSR variants and on the crawler-visible home body
// (renderShellBody), exactly the surfaces built for AI-citation reach.
//
// Static literal HTML — no interpolation, no escaping needed. Links to /about
// (entity page) and /compare (comparison hub). Pass a className to style it in a
// document that has CSS for it (e.g. the /compare `page()` shell or /store's
// `.notice`); omit it for the crawler-only home body, where the text is what
// matters and the element is wiped on hydration anyway.
export function positioningDisclaimerHtml(className?: string): string {
  const cls = className ? ` class="${className}"` : ''
  return (
    `<p${cls}>Gmas List is an independent information service — not a cannabis seller. ` +
    `It organizes publicly available deals from licensed Washington retailers so shoppers ` +
    `can decide whether a deal is <a href="/about">worth the drive</a>. ` +
    `See <a href="/compare">cross-store price comparisons</a>.</p>`
  )
}
