process.env.TZ = 'America/Los_Angeles'

import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { dataRoute } from './routes/dataRoute.js'
import { refreshGasPrice } from './utils/refreshGasPrice.js'

const app = express()
const PORT = process.env.PORT || 3001
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173' }))
}

app.get('/api/data', dataRoute)

// immediate refresh on boot, then daily — refreshGasPrice never rejects by
// contract, the .catch is a last line of defense against crashing the server
void refreshGasPrice().catch(console.error)
setInterval(() => {
  void refreshGasPrice().catch(console.error)
}, REFRESH_INTERVAL_MS)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
