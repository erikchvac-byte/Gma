import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Request, Response } from 'express'
import { filterActiveDeals } from '../utils/filterActiveDeals.js'
import type { ApiDataResponse } from '../../client/src/types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '../data/data.json')

export function dataRoute(_req: Request, res: Response) {
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8')
    const { meta, dispensaries } = JSON.parse(raw)
    const response: ApiDataResponse = { meta, dispensaries: filterActiveDeals(dispensaries) }
    res.json(response)
  } catch (err) {
    console.error('[dataRoute]', err)
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
  }
}
