import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Request, Response } from 'express'
import { readProducts } from '../utils/productsStore.js'
import { buildMatchReport } from '../utils/crossStoreValue.js'
import { buildDealScopeLinks } from '../utils/dealScope.js'
import type { Dispensary } from '../../client/src/types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '../data/data.json')

// GET /api/value/disparities (SPEC ai-search-data-strategy, Tier A item A1). Serves the
// cross-store price-disparity dataset, read-only, derived live from the committed
// products.json. PRIVATE/internal surface only — no public SSR page and no schema.org
// markup (those are Phase 4, gated on legal review). Mirrors productsRoute: additive,
// never reads data.json / the Deal type, fail-soft via readProducts. The response
// carries the disparity rows plus the audit counts (unmatched/excluded) so the matcher's
// coverage is always inspectable, never hidden.
export function disparitiesRoute(_req: Request, res: Response) {
  try {
    const report = buildMatchReport(readProducts())
    res.json(report)
  } catch (err) {
    console.error('[disparitiesRoute]', err)
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
  }
}

// Read the committed deals file's dispensaries, fail-soft to empty (same posture as
// readProducts) — a missing/malformed data.json degrades to zero links, never throws.
function readDispensaries(dataPath: string = DATA_PATH): Dispensary[] {
  if (!existsSync(dataPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(dataPath, 'utf-8'))
    return Array.isArray(parsed?.dispensaries) ? parsed.dispensaries : []
  } catch {
    return []
  }
}

// GET /api/value/deal-scope (ADR-070). Serves the deal→SKU scope-bridge report, read-only,
// derived live by JOINING committed data.json (deal banners) + products.json (ProductRecords).
// PRIVATE/internal only — no public page/schema.org markup (Phase 4, gated on legal review).
// Uses the RAW dispensary deals, NOT filterActiveDeals: each link carries its deal's temporal
// window so a consumer answers "is SKU X on a deal right now" via isDealScopeLinkActive — a
// pre-filtered view would erase out-of-window deals and defeat AC3. Honesty gates live inside
// buildDealScopeLinks (no banner-% is ever turned into a saving). Fail-soft on both reads.
export function dealScopeRoute(_req: Request, res: Response) {
  try {
    const report = buildDealScopeLinks({ dispensaries: readDispensaries() }, readProducts())
    res.json(report)
  } catch (err) {
    console.error('[dealScopeRoute]', err)
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
  }
}
