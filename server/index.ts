process.env.TZ = 'America/Los_Angeles'

import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import { dataRoute } from './routes/dataRoute.js'
import { ingestRoute } from './routes/ingestRoute.js'
import { disparitiesRoute, dealScopeRoute, disparityRollupsRoute } from './routes/valueRoute.js'
import { refreshGasPrice } from './utils/refreshGasPrice.js'

const app = express()
const PORT = process.env.PORT || 3001
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173' }))
}

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

// In production this single service also serves the built React client, so
// gmaslist.com hits one origin for both the app and its API.
if (process.env.NODE_ENV === 'production') {
  // Compiled entry lives at server/dist/server/index.js; the client build is
  // three levels up at <root>/client/dist. Resolve from the module URL so it
  // is independent of the process working directory.
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const clientDist = path.resolve(__dirname, '../../../client/dist')

  app.use(express.static(clientDist))

  // SPA fallback: any non-API route returns index.html so client-side routing
  // works on deep links / refresh. Express 5 (path-to-regexp v8) rejects the
  // bare '*' string route, so match with a RegExp that excludes /api.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
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
