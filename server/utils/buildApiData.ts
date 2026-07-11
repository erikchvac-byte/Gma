import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { filterActiveDeals } from './filterActiveDeals.js'
import { deriveStoreStatus } from './storeStatus.js'
import type { ApiDataResponse } from '../../client/src/types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '../data/data.json')

// Single source for the /api/data payload, shared by dataRoute and the shell
// snapshot injection (spec-phase-0a-data-snapshot-injection) so the two can
// never disagree. Throws on unreadable/malformed data.json — callers decide
// whether that is a 500 (API) or a degrade-to-plain-shell (shell).
export function buildApiData(now: Date = new Date()): ApiDataResponse {
  const raw = readFileSync(DATA_PATH, 'utf-8')
  const { meta, dispensaries } = JSON.parse(raw)
  // `status` is additive (ADR-034 Goal B); deal filtering/omission/count
  // (ADR-022/026) is unchanged — filterActiveDeals still owns the deal array.
  // One clock read shared by both derivations so deal-window filtering and
  // per-store status reflect the same instant.
  const withStatus = filterActiveDeals(dispensaries, now).map((d) => ({
    ...d,
    status: deriveStoreStatus(d.lastFetchedAt, now),
  }))
  return { meta, dispensaries: withStatus }
}
