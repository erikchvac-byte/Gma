process.env.TZ = 'America/Los_Angeles'

import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import { dataRoute } from './routes/dataRoute.js'
import { ingestRoute } from './routes/ingestRoute.js'
import { refreshGasPrice } from './utils/refreshGasPrice.js'
import { runScrapers } from './utils/runScrapers.js'

const app = express()
const PORT = process.env.PORT || 3001
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
const SCRAPE_INTERVAL_MS = 60 * 60 * 1000

app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173' }))
}

app.get('/api/data', dataRoute)

// Authenticated push-ingest of externally scraped deals (ADR-034 Goal A). The
// GitHub Actions scraper POSTs here; in-process scraping (below) still runs.
app.post('/api/ingest', ingestRoute)

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

// immediate scrape on boot, then hourly — runScrapers never rejects by
// contract, the .catch is a last line of defense against crashing the server
void runScrapers().catch(console.error)
setInterval(() => {
  void runScrapers().catch(console.error)
}, SCRAPE_INTERVAL_MS)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
