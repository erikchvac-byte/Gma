import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Request, Response } from 'express'
import { buildApiData } from '../utils/buildApiData.js'
import { renderShellBody } from '../utils/renderShellBody.js'
import { readPriceVsOwnMedian } from './valueRoute.js'

// Escape a JSON string so it can't break out of the inline <script> or trip a pre-ES2019 JS
// parser: "<" (so "</script>"/"<!--" can never terminate the tag) and the U+2028/U+2029 line
// terminators (legal in JSON, bare line terminators to old JS parsers). JSON.parse of the
// escaped form yields identical data. Applied to BOTH snapshots — deal/store/product names are
// scraped and hostile-by-premise.
function escapeForScript(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

// Serves the SPA shell with the current /api/data payload injected as an
// inline window.__GMA_DATA__ script (spec-phase-0a-data-snapshot-injection):
// useDeals initializes synchronously from it and skips the fetch, so first
// render paints real cards instead of the skeleton -> fetch -> cards chain
// that Lighthouse measured as the LCP path (ADR-081 follow-up).
//
// It also injects window.__GMA_DROPS__ — the precomputed "Real price drops"
// envelope (/api/value/price-vs-own-median) — so useValueDrops hydrates on the
// FIRST render too. Without it, that ungated post-paint fetch re-rendered the
// feed (drop strips expand cards, a nearer drop-only store slots in at the top),
// shifting the first card's deal grid: the sole remaining past-gate mobile CLS
// once fonts were fixed (ADR-090/091). ADR-092.
//
// It ALSO server-renders human-readable deal/store HTML (renderShellBody) INSIDE
// <div id="root"> — the crawler-visible half of Phase 0a. That sink is wiped by
// React's createRoot on hydration (client/src/main.tsx), so humans never see
// un-gated deal content in steady state; only non-JS crawlers (GPTBot, Perplexity,
// OAI-/Claude-SearchBot) and the sub-second pre-hydration DOM read it. Unblocked by
// Erik's Phase 0b legal go-ahead 2026-07-23 (ADR-066 basis). No new exposure: the
// same buildApiData() payload already serves publicly, un-gated (/api/data), and
// /compare already publishes deal-derived facts as crawler HTML.
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
      // buildApiData() is the critical payload — it can throw on a malformed data.json, and when
      // it does neither snapshot is injected (the page still works via each hook's fetch
      // fallback). readPriceVsOwnMedian() is fail-soft (missing/malformed -> empty envelope), so
      // the drops snapshot never throws on its own; it's coupled to the data path deliberately so
      // the "no __GMA_DATA__ when data is broken" contract also holds for drops.
      // ONE buildApiData() call feeds BOTH the __GMA_DATA__ snapshot and the
      // crawler-visible body HTML, so the two can never derive from different data.
      const apiData = buildApiData()
      const json = escapeForScript(JSON.stringify(apiData))
      const dropsJson = escapeForScript(JSON.stringify(readPriceVsOwnMedian()))
      if (html.includes('</head>')) {
        // function replacement, NOT a string: String.replace expands $-patterns
        // ($$, $&, $`, $') inside string replacements, which would let scraped
        // text like "SAVE $$$" corrupt the snapshot or splice raw document text
        // (including an unescaped </head>) into the script (review finding)
        html = html.replace(
          '</head>',
          () => `<script>window.__GMA_DATA__ = ${json};window.__GMA_DROPS__ = ${dropsJson}</script></head>`,
        )
      } else {
        // shell lost its </head> marker (minifier/template change) -- the page
        // still works via fetch fallback, but the perf win silently regresses,
        // so make the regression observable
        console.error('[shellRoute] no </head> marker in shell; snapshot not injected')
      }

      // Crawler-visible HTML half (Phase 0a-HTML): render human-readable deal/store
      // HTML INSIDE #root. FUNCTION replacement again — renderShellBody escapes < > &
      // but NOT `$`, and deal text routinely contains `$` (e.g. "$5 off"), which a
      // string replacement would expand as a $-pattern.
      const rootMarker = '<div id="root"></div>'
      if (html.includes(rootMarker)) {
        const bodyHtml = renderShellBody(apiData)
        html = html.replace(rootMarker, () => `<div id="root">${bodyHtml}</div>`)
      } else {
        // shell lost its empty-#root marker -- humans still get the hydrated app
        // via the __GMA_DATA__ snapshot, but crawlers see no body content, so make
        // the regression observable
        console.error('[shellRoute] no empty <div id="root"></div> marker; body HTML not injected')
      }
    } catch (err) {
      // snapshot is an enhancement -- a data failure must never 500 the page;
      // the un-injected shell falls back to the client-side fetches
      console.error('[shellRoute] snapshot skipped:', err)
    }

    // the payload changes hourly (ingest) -- revalidate every load, never cache stale deals
    res.set('Cache-Control', 'no-cache')
    res.type('html').send(html)
  }
}
