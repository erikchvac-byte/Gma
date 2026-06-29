import type { Request, Response } from 'express'
import { readProducts } from '../utils/productsStore.js'
import { buildMatchReport } from '../utils/crossStoreValue.js'

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
