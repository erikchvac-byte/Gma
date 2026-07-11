import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Request, Response } from 'express'
import { buildApiData } from '../utils/buildApiData.js'

// Serves the SPA shell with the current /api/data payload injected as an
// inline window.__GMA_DATA__ script (spec-phase-0a-data-snapshot-injection):
// useDeals initializes synchronously from it and skips the fetch, so first
// render paints real cards instead of the skeleton -> fetch -> cards chain
// that Lighthouse measured as the LCP path (ADR-081 follow-up).
//
// This is the Phase 0a PERF half only. The crawler-visible HTML half is
// deferred pending the Phase 0b legal decision -- do NOT render human-readable
// deal content here. The JSON carries no new exposure: /api/data already
// serves it publicly, un-gated.
//
// Factory takes the client dist path so tests can point it at a fixture dir;
// production passes the same module-URL-resolved path server/index.ts already
// computes for express.static.
export function makeShellRoute(clientDistPath: string) {
  const shellPath = path.join(clientDistPath, 'index.html')

  return function shellRoute(_req: Request, res: Response) {
    let html: string
    try {
      html = readFileSync(shellPath, 'utf-8')
    } catch (err) {
      // no shell at all -- nothing meaningful to degrade to (sendFile 500'd here too)
      console.error('[shellRoute] shell unreadable:', err)
      res.status(500).type('text').send('Internal server error')
      return
    }

    try {
      // Escapes on scraped text (deal/store names are hostile-by-premise):
      // "<" so "</script>"/"<!--" can never terminate the inline tag, and
      // U+2028/U+2029 (legal in JSON, line terminators to pre-ES2019 JS
      // parsers). JSON.parse of the escaped form yields identical data.
      const json = JSON.stringify(buildApiData())
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
      if (html.includes('</head>')) {
        // function replacement, NOT a string: String.replace expands $-patterns
        // ($$, $&, $`, $') inside string replacements, which would let scraped
        // text like "SAVE $$$" corrupt the snapshot or splice raw document text
        // (including an unescaped </head>) into the script (review finding)
        html = html.replace('</head>', () => `<script>window.__GMA_DATA__ = ${json}</script></head>`)
      } else {
        // shell lost its </head> marker (minifier/template change) -- the page
        // still works via fetch fallback, but the perf win silently regresses,
        // so make the regression observable
        console.error('[shellRoute] no </head> marker in shell; snapshot not injected')
      }
    } catch (err) {
      // snapshot is an enhancement -- a data failure must never 500 the page;
      // the un-injected shell falls back to the client-side /api/data fetch
      console.error('[shellRoute] snapshot skipped:', err)
    }

    // the payload changes hourly (ingest) -- revalidate every load, never cache stale deals
    res.set('Cache-Control', 'no-cache')
    res.type('html').send(html)
  }
}
