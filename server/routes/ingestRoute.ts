import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { applyIngest } from '../utils/applyIngest.js'
import type { IngestEntry } from '../types/index.js'

// Constant-time secret comparison. Hash both sides to a fixed 32-byte digest
// first so the comparison never branches on length: timingSafeEqual throws on
// unequal-length buffers, and a raw `a.length === b.length` guard would leak the
// secret's length through timing. Equal hashes ⇔ equal secrets (collision-safe).
function secretOk(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function isValidEntry(x: unknown): x is IngestEntry {
  if (x === null || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return typeof e.dispensaryId === 'string' && Array.isArray(e.deals)
}

// POST /api/ingest (ADR-034 Goal A). Authenticated push target for the GitHub
// Actions scraper. Fails closed when unconfigured; never reads/writes data.json
// on an auth or shape failure. Body: { stores: [{ dispensaryId, deals }, ...] }.
export async function ingestRoute(req: Request, res: Response) {
  try {
    const expected = process.env.INGEST_SECRET
    if (!expected) {
      // fail closed: no secret configured → endpoint is dark
      return res.status(503).json({ error: 'Ingest is not configured', code: 'INGEST_DISABLED' })
    }
    if (!secretOk(req.header('x-ingest-secret'), expected)) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    }

    const stores = (req.body as { stores?: unknown })?.stores
    if (!Array.isArray(stores) || stores.length === 0 || !stores.every(isValidEntry)) {
      return res.status(400).json({ error: 'Bad request', code: 'BAD_REQUEST' })
    }

    const results = await applyIngest(stores)
    return res.status(200).json({ results })
  } catch (err) {
    console.error('[ingestRoute]', err)
    return res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
  }
}
