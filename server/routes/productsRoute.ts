import type { Request, Response } from 'express'
import { readProducts } from '../utils/productsStore.js'

// GET /api/products (SPEC-dutchie-product-pricing CAP-4, ADR-053). Serves the
// committed longitudinal product-price dataset, read-only. Entirely separate from
// /api/data — it never reads data.json, the Deal type, or filterActiveDeals, so the
// deals contract is byte-for-byte unchanged. Fail-soft: readProducts degrades a
// missing/malformed file to an empty dataset, so this returns 200 with an empty
// dataset rather than erroring before any scrape has been committed.
export function productsRoute(_req: Request, res: Response) {
  try {
    res.json(readProducts())
  } catch (err) {
    console.error('[productsRoute]', err)
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
  }
}
