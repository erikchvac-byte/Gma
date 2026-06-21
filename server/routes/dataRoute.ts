import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Request, Response } from 'express'
import { filterActiveDeals } from '../utils/filterActiveDeals.js'
import { deriveStoreStatus } from '../utils/storeStatus.js'
import type { ApiDataResponse } from '../../client/src/types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '../data/data.json')

export function dataRoute(_req: Request, res: Response) {
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8')
    const { meta, dispensaries } = JSON.parse(raw)
    // One clock read shared by both derivations so deal-window filtering and
    // per-store status (ADR-034 Goal B) reflect the same instant.
    const now = new Date()
    // `status` is additive (ADR-034 Goal B); deal filtering/omission/count
    // (ADR-022/026) is unchanged — filterActiveDeals still owns the deal array.
    const withStatus = filterActiveDeals(dispensaries, now).map((d) => ({
      ...d,
      status: deriveStoreStatus(d.lastFetchedAt, now),
    }))
    const response: ApiDataResponse = { meta, dispensaries: withStatus }
    res.json(response)
  } catch (err) {
    console.error('[dataRoute]', err)
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
  }
}
