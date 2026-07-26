import type { Request, Response, NextFunction } from 'express'

// Collapse duplicate trailing-slash URL variants to their canonical no-slash form
// with a 301. The SEO audit (2026-07-26) flagged that /about/ and /store/<id>/
// resolve 200 alongside /about and /store/<id> — Express runs non-strict routing
// plus a `/^(?!\/api).*/` SPA catch-all, so every page has a slash and no-slash
// twin. Canonical tags already point at the no-slash form, but a 301 removes the
// duplicate crawlable URL outright instead of relying on consolidation.
//
// Guards, in order (each one is load-bearing):
//  - GET/HEAD only — never rewrite a POST (the /api/ingest cron POSTs deals here).
//  - Never touch /api* — the JSON API + ingest live there and must be byte-exact.
//  - Never the root '/' — that trailing slash IS the canonical home URL.
//  - Preserve the query string on the redirect target.
//  - 301 is browser-cached/sticky, so this is covered by unit tests before deploy.
export function trailingSlashRedirect(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()

  // originalUrl carries the query; split it off so the pathname test is clean and
  // the query can be reattached to the canonical target.
  const url = req.originalUrl
  const qIndex = url.indexOf('?')
  const pathname = qIndex === -1 ? url : url.slice(0, qIndex)
  const query = qIndex === -1 ? '' : url.slice(qIndex)

  if (pathname.length > 1 && pathname.endsWith('/') && !pathname.startsWith('/api')) {
    // Strip ALL trailing slashes (so //, /about// collapse too); fall back to '/'
    // if that leaves nothing, so a pathological all-slashes path never 301s to ''.
    const canonical = (pathname.replace(/\/+$/, '') || '/') + query
    res.redirect(301, canonical)
    return
  }

  next()
}
