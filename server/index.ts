process.env.TZ = 'America/Los_Angeles'

import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import { aboutRoute } from './routes/aboutRoute.js'
import {
  compareIndexRoute,
  compareSegmentRoute,
  compareCategoryRegionRoute,
} from './routes/compareRoute.js'
import { robotsRoute, sitemapRoute, llmsTxtRoute } from './routes/sitemapRoute.js'
import { makeShellRoute } from './routes/shellRoute.js'
import { storeRoute } from './routes/storeRoute.js'
import { healthzRoute } from './routes/healthzRoute.js'
import { dataRoute } from './routes/dataRoute.js'
import { ingestRoute } from './routes/ingestRoute.js'
import { disparitiesRoute, dealScopeRoute, disparityRollupsRoute, priceVsOwnMedianRoute, regionalPriceFloorRoute } from './routes/valueRoute.js'
import { refreshGasPrice } from './utils/refreshGasPrice.js'
import { trailingSlashRedirect } from './middleware/trailingSlashRedirect.js'

const app = express()
const PORT = process.env.PORT || 3001
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

app.use(express.json())

// Collapse trailing-slash URL variants (/about/ -> /about) with a 301 before any
// route runs (SEO audit 2026-07-26). Skips /, /api*, and non-GET methods; see the
// middleware for the full guard list.
app.use(trailingSlashRedirect)

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173' }))
}

// Keep-warm / liveness probe (registered before the SPA fallback so it returns
// JSON, not the React shell). An external uptime monitor pings this every ~5 min
// to defeat Render free-tier spin-down; see healthzRoute for the full rationale.
app.get('/healthz', healthzRoute)

app.get('/api/data', dataRoute)

// Authenticated push-ingest of externally scraped deals (ADR-034 Goal A). The
// GitHub Actions cron scraper POSTs here and is now the SOLE data writer — the
// in-process setInterval scrape (ADR-010) was retired in Goal C, so this Render
// service is read-only over data.json/the store and serves last-known-good.
app.post('/api/ingest', ingestRoute)

// Read-only cross-store value/disparity dataset (SPEC ai-search-data-strategy A1).
// Private/internal surface. ADR-077 Phase 1: served from the precomputed
// server/data/derived/disparities.json (the raw products dataset left git for local SQLite);
// additive and decoupled from /api/data. No public SSR page (Phase 4, legal-gated).
// (/api/products was DROPPED in ADR-077 — Render serves only derived facts, not the raw blob.)
app.get('/api/value/disparities', disparitiesRoute)
// Deal→SKU scope bridge (ADR-070). Same private/decoupled posture; served from the precomputed
// server/data/derived/deal-scope.json. No public page/markup (Phase 4, legal-gated).
app.get('/api/value/deal-scope', dealScopeRoute)
// Cross-store disparity rollups (derivation-1.4, FR11). Same private/decoupled posture; served
// from the precomputed server/data/derived/disparity-rollups.json. No public page/markup.
app.get('/api/value/disparity-rollups', disparityRollupsRoute)
// Price-vs-own-median flagship fact (derivation-3.2, FR13/D6) — the in-app "Real price drops"
// surface's data source. Same private/decoupled/fail-soft posture; served from the precomputed
// server/data/derived/price-vs-own-median.json. Registered before the SPA fallback below.
app.get('/api/value/price-vs-own-median', priceVsOwnMedianRoute)
// Regional price floors + availability gaps (ADR-086), the substrate for the
// geo-scoped /compare/<category>/<region> pages. Same private/decoupled/fail-soft posture.
app.get('/api/value/regional-price-floor', regionalPriceFloorRoute)

// Server-rendered About + FAQ entity page (spec-ai-search-about-faq). Must be
// registered BEFORE the production SPA fallback below so crawlers get real
// HTML here instead of the empty React shell; unconditional so dev serves it too.
app.get('/about', aboutRoute)

// Server-rendered SEO / AI-search comparison surface (derivation-3.1, ADR-066
// legal gate CLOSED): public pages over the shipped cross-store price-disparity
// facts, with Dataset JSON-LD. Registered BEFORE the SPA fallback (same reason as
// /about) and unconditional so dev serves them too.
app.get('/compare', compareIndexRoute)
// Geo-scoped citable pages (ADR-107): /compare/<category>/<region> is the canonical
// answer to "cheapest <category> deals <city> WA today". The two-segment route is
// registered before the single-segment dispatcher; the dispatcher resolves its one
// segment as either a region (landing page) or a category (existing behavior).
app.get('/compare/:category/:region', compareCategoryRegionRoute)
app.get('/compare/:category', compareSegmentRoute)

// Per-store SEO / AI-search pages (Phase 1a / CAP-3+CAP-4): one crawlable
// /store/<id> per licensed WA retailer with LocalBusiness JSON-LD. Same reason
// for registering before the SPA fallback, unconditional so dev serves it too.
app.get('/store/:slug', storeRoute)

// Phase 1 technical-SEO foundation (ADR-080): robots.txt + a sitemap.xml that
// lists /about, /compare, and one URL per live /compare category. Registered
// BEFORE the SPA fallback and express.static so the dynamic sitemap route wins
// over any accidental static file of the same name.
app.get('/robots.txt', robotsRoute)
app.get('/sitemap.xml', sitemapRoute)
// llms.txt (llmstxt.org): Markdown site guide for LLM crawlers. Without this
// route the SPA fallback served the React shell here, failing Lighthouse's
// agentic-browsing llms-txt audit (ADR-081).
app.get('/llms.txt', llmsTxtRoute)

// In production this single service also serves the built React client, so
// gmaslist.com hits one origin for both the app and its API.
if (process.env.NODE_ENV === 'production') {
  // Compiled entry lives at server/dist/server/index.js; the client build is
  // three levels up at <root>/client/dist. Resolve from the module URL so it
  // is independent of the process working directory.
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const clientDist = path.resolve(__dirname, '../../../client/dist')

  // Shell with the /api/data snapshot injected (Phase 0a perf half). Serves
  // /, the literal /index.html, and every SPA deep link. index:false disables
  // static's directory-index resolution only — the explicit /index.html route
  // is what stops the raw file from serving a snapshot-less shell.
  const shellRoute = makeShellRoute(clientDist)
  app.get('/', shellRoute)
  app.get('/index.html', shellRoute)

  app.use(
    express.static(clientDist, {
      index: false,
      // Vite content-hashes every file it emits under /assets/ (JS, CSS, and the
      // externalized webp art — see client/vite.config.ts): a byte change ships a
      // NEW filename, so the bytes at a given URL are immutable. Cache them for a
      // year to kill the per-visit revalidation the SEO audit flagged (fingerprinted
      // assets were served `max-age=0`). Non-hashed root files (favicon.svg, og
      // image) keep static's default short cache — their names are stable, so a
      // long immutable cache there could pin a stale favicon.
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )

  // SPA fallback: any non-API route returns the injected shell so client-side
  // routing works on deep links / refresh. Express 5 (path-to-regexp v8)
  // rejects the bare '*' string route, so match with a RegExp that excludes /api.
  app.get(/^(?!\/api).*/, shellRoute)
}

// immediate refresh on boot, then daily — refreshGasPrice never rejects by
// contract, the .catch is a last line of defense against crashing the server
void refreshGasPrice().catch(console.error)
setInterval(() => {
  void refreshGasPrice().catch(console.error)
}, REFRESH_INTERVAL_MS)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
