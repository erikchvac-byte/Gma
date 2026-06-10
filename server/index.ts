process.env.TZ = 'America/Los_Angeles'

import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { dataRoute } from './routes/dataRoute.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173' }))
}

app.get('/api/data', dataRoute)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
